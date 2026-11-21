-- New workspace records only. Legacy app_state documents retain their original identities.
begin;
create table public.account_workspace_sharing (
  workspace_id uuid primary key references public.account_workspaces(id),
  default_audience text not null default 'private' check (default_audience in ('private','workspace')),
  allow_sensitive_sharing boolean not null default false
);
create table public.account_workspace_records (
  workspace_id uuid not null references public.account_workspaces(id),
  object_key uuid not null default gen_random_uuid(),
  creator_id uuid not null references auth.users(id),
  kind text not null check (kind in ('note','task','board','project','finance','health','person')),
  title text not null check (length(trim(title)) between 1 and 250),
  body text not null default '' check (length(body) <= 100000),
  audience text not null check (audience in ('private','workspace')),
  revision integer not null default 1,
  primary key (workspace_id, object_key),
  check (kind not in ('finance','health','person') or audience='private')
);
create table public.account_workspace_record_links (
  workspace_id uuid not null,
  source_key uuid not null,
  target_key uuid not null,
  primary key(workspace_id,source_key,target_key),
  foreign key(workspace_id,source_key) references public.account_workspace_records(workspace_id,object_key),
  foreign key(workspace_id,target_key) references public.account_workspace_records(workspace_id,object_key),
  check(source_key <> target_key)
);
create table public.account_workspace_record_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  object_key uuid not null,
  recipient_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  foreign key(workspace_id,object_key) references public.account_workspace_records(workspace_id,object_key),
  foreign key(workspace_id,recipient_id) references public.account_workspace_members(workspace_id,user_id) on delete cascade
);
create unique index account_record_grant_active on public.account_workspace_record_grants(workspace_id,object_key,recipient_id) where revoked_at is null;
create function public.expire_previous_guest_grants() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.expires_at<=now() and (new.expires_at is null or new.expires_at>now()) then
    update public.account_workspace_record_grants set revoked_at=now() where workspace_id=new.workspace_id and recipient_id=new.user_id and revoked_at is null;
  end if;
  return new;
end $$;
revoke all on function public.expire_previous_guest_grants() from public,anon,authenticated;
create trigger account_guest_renewed after update of expires_at on public.account_workspace_members for each row execute function public.expire_previous_guest_grants();
create table public.account_workspace_restore_checks (
  workspace_id uuid not null references public.account_workspaces(id),
  verified_at timestamptz not null,
  inventory_hash text not null check (inventory_hash ~ '^[0-9a-f]{64}$'),
  originals integer not null check (originals>=0),
  document_count integer not null check (document_count>=0),
  primary key(workspace_id,verified_at)
);
alter table public.account_workspace_restore_checks enable row level security;
revoke all on public.account_workspace_restore_checks from public,anon,authenticated,service_role;
grant select on public.account_workspace_restore_checks to service_role;
create table public.account_record_files (
  workspace_id uuid not null,
  source_key uuid not null,
  media_id uuid not null,
  primary key (workspace_id,source_key,media_id),
  foreign key (workspace_id,source_key) references public.account_workspace_records(workspace_id,object_key)
);
alter table public.account_record_files enable row level security;
revoke all on public.account_record_files from public,anon,authenticated;
alter table public.account_workspace_sharing enable row level security;
alter table public.account_workspace_records enable row level security;
alter table public.account_workspace_record_links enable row level security;
alter table public.account_workspace_record_grants enable row level security;
revoke all on public.account_workspace_sharing, public.account_workspace_records, public.account_workspace_record_links, public.account_workspace_record_grants from public,anon,authenticated;
grant select, insert, update, delete on public.account_workspace_sharing, public.account_workspace_records, public.account_workspace_record_links, public.account_workspace_record_grants to service_role;

create function public.account_readable_records(w uuid, actor uuid) returns setof public.account_workspace_records
language sql stable set search_path = '' as $$
  select r.* from public.account_workspace_records r
  where r.workspace_id=w and exists (
    select 1 from public.account_workspace_members m where m.workspace_id=w and m.user_id=actor
    and (m.expires_at is null or m.expires_at > now()))
  and (r.creator_id=actor or r.audience='workspace' or (
    (r.kind not in ('finance','health','person') or exists (
      select 1 from public.account_workspace_sharing s where s.workspace_id=w and s.allow_sensitive_sharing))
    and exists (select 1 from public.account_workspace_record_grants g where g.workspace_id=w
      and g.object_key=r.object_key and g.recipient_id=actor and g.revoked_at is null and g.expires_at > now())
  ))
$$;

-- All operations recheck membership inside the statement that accesses the records.
create function public.account_record_action(w uuid, actor uuid, action text, args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  member_role text; result jsonb; policy public.account_workspace_sharing%rowtype;
  item public.account_workspace_records%rowtype; entry public.account_workspace_record_grants%rowtype;
  key uuid := (args->>'key')::uuid; target uuid; recipient uuid; expiry timestamptz; chosen text;
  archive jsonb; row_data jsonb; link jsonb; new_keys uuid[] := '{}'; skipped integer := 0;
begin
  select m.role into member_role from public.account_workspace_members m where m.workspace_id=w and m.user_id=actor and (m.expires_at is null or m.expires_at>now()) for share;
  if member_role is null then raise exception 'Unavailable' using errcode='42501'; end if;
  if action='share' then
    select * into policy from public.account_workspace_sharing s where s.workspace_id=w for share;
  else
    select * into policy from public.account_workspace_sharing s where s.workspace_id=w;
  end if;
  if action='list' then
    select coalesce(jsonb_agg(jsonb_build_object('key',r.object_key,'kind',r.kind,'title',r.title,'audience',r.audience,'mine',r.creator_id=actor) order by r.title,r.object_key),'[]') into result from public.account_readable_records(w,actor) r;
    return jsonb_build_object('role',member_role,'userId',actor,'records',result,'defaultAudience',coalesce(policy.default_audience,'private'),'allowSensitive',coalesce(policy.allow_sensitive_sharing,false));
  elsif action in ('get','export') then
    with visible as materialized (select * from public.account_readable_records(w,actor)),
    objects as (select r.object_key,jsonb_build_object('key',r.object_key,'kind',r.kind,'title',r.title,'body',r.body,'revision',r.revision,'mine',r.creator_id=actor,'audience',r.audience,
      'files',coalesce((select jsonb_agg(jsonb_build_object('id',m.media_id,'name',m.file_name) order by m.file_name,m.media_id)
        from public.account_record_files f join public.account_workspace_media m on m.workspace_id=f.workspace_id and m.media_id=f.media_id
        where f.workspace_id=w and f.source_key=r.object_key and m.state='ready' and (m.owner_id=actor or m.audience='workspace')),'[]'),
      'links',coalesce((select jsonb_agg(jsonb_build_object('key',t.object_key,'title',t.title,'kind',t.kind) order by t.title,t.object_key)
          from public.account_workspace_record_links l join visible t on t.object_key=l.target_key
          where l.workspace_id=w and l.source_key=r.object_key),'[]')) as value from visible r
          where (action='export' and (coalesce(args->>'kind','')='' or r.kind=args->>'kind')) or (action='get' and r.object_key=key))
    select coalesce(jsonb_agg(value order by object_key),'[]') into result from objects;
    if action='export' then return jsonb_build_object('format','unigentamos-workspace-records-v1','workspaceId',w,'exportedBy',actor,'exportedAt',now(),'records',result); end if;
    if jsonb_array_length(result)=0 then raise exception 'Unavailable' using errcode='P0002'; end if;
    return result->0;
  elsif action='recoveryStatus' then
    if member_role<>'owner' then raise exception 'Owner required' using errcode='42501'; end if;
    select jsonb_build_object('verifiedAt',verified_at,'originals',originals,'documents',document_count) into result
      from public.account_workspace_restore_checks where workspace_id=w order by verified_at desc limit 1;
    return jsonb_build_object('lastCheck',result);
  elsif action='workspaceShares' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'type',kind,'canRevoke',member_role='owner' or author=actor) order by title,id),'[]') into result from (
      select object_key as id,title,'record' as kind,creator_id as author from public.account_workspace_records where workspace_id=w and audience='workspace'
      union all select media_id,file_name,'media',owner_id from public.account_workspace_media where workspace_id=w and state='ready' and audience='workspace'
    ) exposed;
    return result;
  elsif action='inventory' then
    select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'key',g.object_key,'title',r.title,'recipient',u.email,'expires',g.expires_at,'revoked',g.revoked_at)
      order by g.created_at desc),'[]') into result from public.account_workspace_record_grants g join auth.users u on u.id=g.recipient_id
      left join public.account_readable_records(w,actor) r on r.object_key=g.object_key
      where g.workspace_id=w and (member_role='owner' or r.creator_id=actor);
    return result;
  elsif member_role not in ('owner','editor') then raise exception 'Read only' using errcode='42501';
  elsif action='restrictAudience' then
    if args->>'type'='record' then
      update public.account_workspace_records set audience='private',revision=revision+1 where workspace_id=w and object_key=key and audience='workspace' and (creator_id=actor or member_role='owner');
    elsif args->>'type'='media' then
      update public.account_workspace_media set audience='private' where workspace_id=w and media_id=key and audience='workspace' and state='ready' and (owner_id=actor or member_role='owner');
    else raise exception 'Invalid resource' using errcode='22023'; end if;
    if not found then raise exception 'Unavailable' using errcode='P0002'; end if;
    return '{"ok":true}';
  elsif action in ('previewRestore','restore') then
    archive:=args->'archive';
    if archive->>'format' is distinct from 'unigentamos-workspace-records-v1' or archive->>'workspaceId' is distinct from w::text
      or archive->>'exportedBy' is distinct from actor::text or jsonb_typeof(archive->'records') is distinct from 'array'
      or jsonb_array_length(archive->'records')>5000 then raise exception 'Invalid archive' using errcode='22023'; end if;
    for row_data in select value from jsonb_array_elements(archive->'records') loop
      key:=(row_data->>'key')::uuid;
      if key is null or row_data->>'mine' is distinct from 'true' or key=any(new_keys)
        or exists(select 1 from public.account_workspace_records r where r.workspace_id=w and r.object_key=key)
        then skipped:=skipped+1; continue; end if;
      if row_data->>'kind' is null or row_data->>'kind' not in ('note','task','board','project','finance','health','person')
        or length(trim(coalesce(row_data->>'title',''))) not between 1 and 250 or length(coalesce(row_data->>'body',''))>100000
        or jsonb_typeof(row_data->'links') is distinct from 'array' then raise exception 'Invalid record in archive' using errcode='22023'; end if;
      if action='restore' then
        insert into public.account_workspace_records(workspace_id,object_key,creator_id,kind,title,body,audience)
          values(w,key,actor,row_data->>'kind',row_data->>'title',coalesce(row_data->>'body',''),'private') on conflict do nothing;
        if not found then skipped:=skipped+1; continue; end if;
      end if;
      new_keys:=array_append(new_keys,key);
    end loop;
    if action='restore' then
      for row_data in select value from jsonb_array_elements(archive->'records') loop
        key:=(row_data->>'key')::uuid;
        if not key=any(new_keys) then continue; end if;
        for link in select value from jsonb_array_elements(coalesce(row_data->'files','[]')) loop
          insert into public.account_record_files(workspace_id,source_key,media_id)
            select w,key,m.media_id from public.account_workspace_media m where m.workspace_id=w and m.media_id=(link->>'id')::uuid
              and m.state='ready' and (m.owner_id=actor or m.audience='workspace') on conflict do nothing;
        end loop;
        for link in select value from jsonb_array_elements(row_data->'links') loop
          target:=(link->>'key')::uuid;
          if target<>key and exists(select 1 from public.account_readable_records(w,actor) r where r.object_key=target) then
            insert into public.account_workspace_record_links values(w,key,target) on conflict do nothing;
          end if;
        end loop;
      end loop;
    end if;
    return jsonb_build_object('newRecords',cardinality(new_keys),'skipped',skipped);
  elsif action='policy' then
    if member_role<>'owner' then raise exception 'Owner required' using errcode='42501'; end if;
    insert into public.account_workspace_sharing values(w,args->>'defaultAudience',(args->>'allowSensitive')::boolean)
      on conflict(workspace_id) do update set default_audience=excluded.default_audience,allow_sensitive_sharing=excluded.allow_sensitive_sharing;
    if not (args->>'allowSensitive')::boolean then
      update public.account_workspace_record_grants g set revoked_at=now() from public.account_workspace_records r
        where r.workspace_id=w and g.workspace_id=w and g.object_key=r.object_key and r.kind in ('finance','health','person') and g.revoked_at is null;
    end if;
    return '{"ok":true}';
  elsif action='create' then
    chosen := case when args->>'kind' in ('finance','health','person') then 'private' else coalesce(args->>'audience',policy.default_audience,'private') end;
    key := coalesce((args->>'createKey')::uuid,gen_random_uuid());
    insert into public.account_workspace_records(workspace_id,object_key,creator_id,kind,title,body,audience)
      values(w,key,actor,args->>'kind',trim(args->>'title'),coalesce(args->>'body',''),chosen) on conflict do nothing returning * into item;
    if not found then
      select * into item from public.account_workspace_records r where r.workspace_id=w and r.object_key=key and r.creator_id=actor and r.kind=args->>'kind'
        and r.title=trim(args->>'title') and r.body=coalesce(args->>'body','') and r.audience=chosen;
      if not found then raise exception 'Record conflict' using errcode='40001'; end if;
    end if;
  elsif action='revoke' then
    update public.account_workspace_record_grants g set revoked_at=coalesce(g.revoked_at,now()) where g.workspace_id=w and g.id=(args->>'grant')::uuid and
      (member_role='owner' or exists(select 1 from public.account_workspace_records r where r.workspace_id=w and r.object_key=g.object_key and r.creator_id=actor));
    if not found then raise exception 'Unavailable' using errcode='P0002'; end if;
    return '{"ok":true}';
  end if;
  if action in ('edit','create') and args?'newLinks' then
    if jsonb_typeof(args->'newLinks') is distinct from 'array' or jsonb_array_length(args->'newLinks')>100 then
      raise exception 'Invalid links' using errcode='22023';
    end if;
    -- For edits, verify authorship before inspecting linked targets. A later
    -- revision conflict rolls back the entire operation, including these links.
    if action='edit' and not exists(select 1 from public.account_workspace_records r where r.workspace_id=w and r.object_key=key and r.creator_id=actor) then
      raise exception 'Unavailable' using errcode='P0002';
    end if;
    for target in select distinct value::uuid from jsonb_array_elements_text(args->'newLinks') loop
      if target=key or not exists(select 1 from public.account_readable_records(w,actor) r where r.object_key=target) then
        raise exception 'Unavailable' using errcode='P0002';
      end if;
      insert into public.account_workspace_record_links values(w,key,target) on conflict do nothing;
    end loop;
  end if;
  if action='create' then return jsonb_build_object('key',item.object_key); end if;
  -- Only the author can change or delegate an individual record.
  select * into item from public.account_workspace_records r where r.workspace_id=w and r.object_key=key and r.creator_id=actor for update;
  if not found then raise exception 'Unavailable' using errcode='P0002'; end if;
  if action='edit' then
    update public.account_workspace_records set title=trim(args->>'title'),body=args->>'body',audience=args->>'audience',revision=revision+1
      where workspace_id=w and object_key=key and revision=(args->>'revision')::integer;
    if not found then raise exception 'Revision changed' using errcode='40001'; end if;
  elsif action in ('attach','detach') then
    target:=(args->>'mediaId')::uuid;
    if not exists(select 1 from public.account_workspace_media m where m.media_id=target and m.workspace_id=w
      and m.state='ready' and (m.owner_id=actor or m.audience='workspace')) then raise exception 'Unavailable' using errcode='P0002'; end if;
    if action='attach' then insert into public.account_record_files values(w,key,target) on conflict do nothing;
    else delete from public.account_record_files where workspace_id=w and source_key=key and media_id=target; end if;
  elsif action in ('link','unlink') then
    target := (args->>'target')::uuid;
    if not exists(select 1 from public.account_readable_records(w,actor) r where r.object_key=target) then raise exception 'Unavailable' using errcode='P0002'; end if;
    if action='link' then insert into public.account_workspace_record_links values(w,key,target) on conflict do nothing;
    else delete from public.account_workspace_record_links where workspace_id=w and source_key=key and target_key=target; end if;
  elsif action='share' then
    recipient := (args->>'recipient')::uuid; expiry := (args->>'expires')::timestamptz;
    if recipient is null then select m.user_id into recipient from public.account_workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=w and lower(u.email)=lower(trim(args->>'email')); end if;
    if item.kind in ('finance','health','person') and not coalesce(policy.allow_sensitive_sharing,false) then raise exception 'Sensitive sharing disabled' using errcode='42501'; end if;
    if expiry is null or not isfinite(expiry) or expiry<=now() or expiry>now()+interval '366 days' or recipient=actor then raise exception 'Invalid recipient or expiry' using errcode='22023'; end if;
    if not exists(select 1 from public.account_workspace_members m where m.workspace_id=w and m.user_id=recipient and (m.expires_at is null or m.expires_at>now())) then raise exception 'Unavailable' using errcode='P0002'; end if;
    insert into public.account_workspace_record_grants(workspace_id,object_key,recipient_id,expires_at) values(w,key,recipient,expiry)
      on conflict (workspace_id,object_key,recipient_id) where revoked_at is null do update set expires_at=excluded.expires_at returning * into entry;
    return jsonb_build_object('grant',entry.id,'key',key);
  else raise exception 'Unknown operation' using errcode='22023'; end if;
  return '{"ok":true}';
end $$;
revoke all on function public.account_readable_records(uuid,uuid), public.account_record_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.account_readable_records(uuid,uuid), public.account_record_action(uuid,uuid,text,jsonb) to service_role;
commit;
