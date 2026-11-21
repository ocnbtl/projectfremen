begin;
create table public.account_notices(
  id uuid primary key, workspace_id uuid not null, recipient_id uuid not null, actor_id uuid not null references auth.users(id), object_key uuid not null,
  kind text not null check(kind in ('mention','assignment','reminder')), due_at timestamptz not null,
  foreign key(workspace_id,recipient_id) references public.account_workspace_members(workspace_id,user_id) on delete cascade,
  foreign key(workspace_id,object_key) references public.account_workspace_records(workspace_id,object_key) on delete cascade
);
create index account_notice_inbox on public.account_notices(workspace_id,recipient_id,due_at desc);
create table public.account_notice_devices(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,user_id uuid not null,session_id uuid not null references public.account_sessions(id) on delete cascade,endpoint text not null,
  foreign key(workspace_id,user_id) references public.account_workspace_members(workspace_id,user_id) on delete cascade,
  unique(workspace_id,session_id),unique(workspace_id,endpoint));
create table public.account_notice_jobs(id uuid primary key default gen_random_uuid(),notice_id uuid not null references public.account_notices(id) on delete cascade,channel text not null check(channel in ('email','push')),device_id uuid references public.account_notice_devices(id) on delete cascade,
  state text not null default 'queued',attempts int not null default 0,next_attempt timestamptz not null,lease uuid,deadline timestamptz);
create index account_notice_jobs_due on public.account_notice_jobs(next_attempt) where state in ('queued','sending');
alter table public.account_notices enable row level security;
alter table public.account_notice_devices enable row level security;
alter table public.account_notice_jobs enable row level security;
revoke all on public.account_notices,public.account_notice_devices,public.account_notice_jobs from public,anon,authenticated;

create function public.account_notice_device(w uuid,actor uuid,s uuid,endpoint_value text) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.account_sessions a join public.account_workspace_members m on m.user_id=a.user_id where a.id=s and a.user_id=actor and a.expires_at>now() and m.workspace_id=w and (m.expires_at is null or m.expires_at>now())) then raise sqlstate 'PT403'; end if;
  delete from public.account_notice_devices where workspace_id=w and session_id=s and (endpoint_value is null or endpoint<>endpoint_value);
  if endpoint_value is not null then
    delete from public.account_notice_devices where endpoint=endpoint_value and user_id<>actor;
    insert into public.account_notice_devices(workspace_id,user_id,session_id,endpoint) values(w,actor,s,endpoint_value)
      on conflict(workspace_id,endpoint) do update set session_id=excluded.session_id;
  end if;
end $$;
create function public.account_create_notice(w uuid,actor uuid,k uuid,recipient_email text,notice_kind text,due timestamptz,event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid; prefs jsonb; actual_due timestamptz:=coalesce(due,now()); inserted uuid;
begin
  if not exists(select 1 from public.account_readable_records(w,actor) r join public.account_workspace_members m on m.workspace_id=w and m.user_id=actor where r.object_key=k and r.creator_id=actor and m.role in ('owner','editor')) then raise sqlstate 'PT403' using message='Record unavailable.'; end if;
  select m.user_id into target from public.account_workspace_members m join auth.users u on m.user_id=u.id where m.workspace_id=w and lower(u.email)=lower(trim(recipient_email)) and (m.expires_at is null or m.expires_at>now());
  if target is null or not exists(select 1 from public.account_readable_records(w,target) r where r.object_key=k) then raise sqlstate 'PT400' using message='Choose a member who can already open this record.'; end if;
  if notice_kind='reminder' and (due is null or due<=now() or due>now()+interval '366 days') then raise sqlstate 'PT400' using message='Invalid reminder time.'; end if;
  insert into public.account_notices values(event_id,w,target,actor,k,notice_kind,actual_due) on conflict do nothing returning id into inserted;
  if inserted is null then
    if not exists(select 1 from public.account_notices n where n.id=event_id and n.workspace_id=w and n.actor_id=actor and n.recipient_id=target and n.object_key=k and n.kind=notice_kind and (due is null or due=n.due_at)) then raise sqlstate 'PT400' using message='Start a new notification.'; end if;
    return;
  end if;
  select daily into prefs from public.account_workspace_preferences where workspace_id=w and user_id=target;
  if (prefs->'emailKinds') ? notice_kind then insert into public.account_notice_jobs(notice_id,channel,next_attempt) values(event_id,'email',actual_due); end if;
  if (prefs->'pushKinds') ? notice_kind then insert into public.account_notice_jobs(notice_id,channel,device_id,next_attempt)
    select event_id,'push',id,actual_due from public.account_notice_devices where workspace_id=w and user_id=target; end if;
end $$;
create function public.account_notice_inbox(w uuid,actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_to_json(items) order by created_at desc),'[]') from (
  select n.id,n.due_at as created_at,r.object_key,r.kind,r.title,n.kind as category from public.account_notices n join public.account_readable_records(w,actor) r on r.object_key=n.object_key
  left join public.account_workspace_preferences p on p.workspace_id=w and p.user_id=actor
  where n.workspace_id=w and n.recipient_id=actor and n.due_at<=now() and coalesce(p.daily->'inboxKinds','["mention","assignment","reminder"]') ? n.kind
  order by n.due_at desc limit 100
 ) items
$$;
-- Recheck the recipient and record permissions when taking work, including retries.
create function public.claim_account_notice() returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.account_notice_jobs; notice public.account_notices; prefs jsonb; destination text; token uuid:=gen_random_uuid();
begin
  select * into job from public.account_notice_jobs j where j.next_attempt<=now() and (j.state='queued' or (j.state='sending' and j.deadline < now())) order by j.next_attempt,j.id limit 1 for update skip locked;
  if job.id is null then return null; end if;
  select * into notice from public.account_notices where id=job.notice_id;
  select daily into prefs from public.account_workspace_preferences where workspace_id=notice.workspace_id and user_id=notice.recipient_id;
  select email into destination from auth.users where id=notice.recipient_id and deleted_at is null and email_confirmed_at is not null and (banned_until is null or banned_until<=now());
  if not exists(select 1 from public.account_readable_records(notice.workspace_id,notice.recipient_id) r where r.object_key=notice.object_key)
    or not coalesce((prefs->(case when job.channel='push' then 'pushKinds' else 'emailKinds' end)) ? notice.kind,false)
    or destination is null then update public.account_notice_jobs set state='cancelled' where id=job.id; return '{"skip":true}'; end if;
  if job.channel='push' then
    select d.endpoint into destination from public.account_notice_devices d join public.account_sessions s on s.id=d.session_id join auth.users u on u.id=s.user_id
      where d.id=job.device_id and s.user_id=notice.recipient_id and s.expires_at>now() and s.password_version=md5(u.encrypted_password);
    if destination is null then update public.account_notice_jobs set state='cancelled' where id=job.id; return '{"skip":true}'; end if;
  end if;
  update public.account_notice_jobs set state='sending',lease=token,deadline=now()+interval '90 seconds' where id=job.id;
  return jsonb_build_object('id',job.id,'lease',token,'channel',job.channel,'kind',notice.kind,'due',notice.due_at,'destination',destination,'preferences',prefs);
end $$;
create function public.finish_account_notice(job uuid,token uuid,result text) returns void language plpgsql security definer set search_path='' as $$
begin
  update public.account_notice_jobs j set state=case when result='defer' or (result='retry' and j.attempts<7) then 'queued' when result='sent' then 'sent' else 'failed' end,
    attempts=j.attempts+case when result='defer' then 0 else 1 end,next_attempt=now()+case when result='defer' then interval '5 minutes' else interval '1 minute'*power(2,least(j.attempts,7)) end,lease=null,deadline=null
    where j.id=job and j.lease=token and j.state='sending';
  if found and result='gone' then delete from public.account_notice_devices where id=(select device_id from public.account_notice_jobs where id=job); end if;
end $$;
revoke all on function public.account_notice_device(uuid,uuid,uuid,text),public.account_create_notice(uuid,uuid,uuid,text,text,timestamptz,uuid),public.account_notice_inbox(uuid,uuid),public.claim_account_notice(),public.finish_account_notice(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.account_notice_device(uuid,uuid,uuid,text),public.account_create_notice(uuid,uuid,uuid,text,text,timestamptz,uuid),public.account_notice_inbox(uuid,uuid),public.claim_account_notice(),public.finish_account_notice(uuid,uuid,text) to service_role;
commit;
