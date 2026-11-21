begin;
create table public.account_workspace_preferences (
  workspace_id uuid not null,
  user_id uuid not null,
  revision integer not null default 1,
  daily jsonb not null default '{}',
  writing jsonb not null default '{}',
  primary key(workspace_id,user_id),
  foreign key(workspace_id,user_id) references public.account_workspace_members(workspace_id,user_id) on delete cascade
);
alter table public.account_workspace_preferences enable row level security;
revoke all on public.account_workspace_preferences from public,anon,authenticated;
create function public.account_preferences_action(w uuid, actor uuid, expected integer default null, changes jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare pref public.account_workspace_preferences; inbox jsonb;
begin
  perform 1 from public.account_workspace_members m where m.workspace_id=w and m.user_id=actor and (m.expires_at is null or m.expires_at > now()) for share;
  if not found then raise sqlstate 'PT403' using message='Workspace unavailable'; end if;
  if expected is not null then
    if expected=0 then
      insert into public.account_workspace_preferences(workspace_id,user_id,daily,writing) values(w,actor,coalesce(changes->'daily','{}'),coalesce(changes->'writing','{}'))
        on conflict do nothing returning * into pref;
    else
      update public.account_workspace_preferences p set daily=coalesce(changes->'daily',p.daily),writing=coalesce(changes->'writing',p.writing),revision=p.revision+1
        where p.workspace_id=w and p.user_id=actor and p.revision=expected returning * into pref;
    end if;
    if pref.revision is null then raise sqlstate 'PT409' using message='Settings changed on another device'; end if;
  else
    select p.* into pref from public.account_workspace_preferences p where p.workspace_id=w and p.user_id=actor;
  end if;
  select coalesce(jsonb_agg(row_to_json(items) order by items.created_at desc),'[]') into inbox from (
    select g.id, g.created_at, r.object_key, r.kind, r.title from public.account_workspace_record_grants g
    join public.account_readable_records(w,actor) r on r.object_key=g.object_key and r.workspace_id=g.workspace_id
    where g.workspace_id=w and g.recipient_id=actor and g.revoked_at is null and g.expires_at>now()
    order by g.created_at desc limit 100
  ) items;
  return jsonb_build_object('revision',coalesce(pref.revision,0),'daily',pref.daily,'writing',pref.writing,'inbox',inbox);
end $$;
revoke all on function public.account_preferences_action(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.account_preferences_action(uuid,uuid,integer,jsonb) to service_role;
create function public.account_writing_sources(w uuid,actor uuid,skill_id text,after_key uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_to_json(items) order by object_key),'[]') from (
   select object_key,title,body from public.account_readable_records(w,actor)
   where (after_key is null or object_key>after_key) and position(('?skill='||skill_id) in body)>0
   order by object_key limit 21
 ) items
$$;
revoke all on function public.account_writing_sources(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.account_writing_sources(uuid,uuid,text,uuid) to service_role;
commit;
