begin;

create table public.account_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.account_workspace_members (
  workspace_id uuid not null references public.account_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  expires_at timestamptz,
  primary key (workspace_id, user_id),
  check (role <> 'owner' or expires_at is null)
);
create unique index account_one_workspace_owner on public.account_workspace_members(workspace_id) where role = 'owner';
create index account_members_by_user on public.account_workspace_members(user_id);

create table public.account_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  secret_hash text not null unique check (secret_hash ~ '^[a-f0-9]{64}$'),
  password_version text not null,
  device_label text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);
create index account_sessions_by_user on public.account_sessions(user_id);
create index account_sessions_expiry on public.account_sessions(expires_at);
create table public.account_workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.account_workspaces(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  role text not null check (role in ('editor','viewer')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  member_expires_at timestamptz,
  unique (workspace_id, email)
);

alter table public.account_workspaces enable row level security;
alter table public.account_workspace_members enable row level security;
alter table public.account_sessions enable row level security;
alter table public.account_workspace_invites enable row level security;
revoke all on public.account_workspaces, public.account_workspace_members, public.account_sessions,
  public.account_workspace_invites from public, anon, authenticated;
grant select on public.account_workspaces, public.account_workspace_members, public.account_sessions,
  public.account_workspace_invites to service_role;
grant delete on public.account_sessions to service_role;

-- Application sessions use a random browser secret. Disabling an identity,
-- deleting a session, or changing its password invalidates it on the next read.
create function public.start_account_session(p_user uuid, p_hash text, p_device text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  delete from public.account_sessions where expires_at <= now();
  insert into public.account_sessions(user_id,secret_hash,password_version,device_label)
    select id,p_hash,md5(encrypted_password),left(p_device,160)
    from auth.users where id = p_user and email_confirmed_at is not null
      and deleted_at is null and (banned_until is null or banned_until <= now())
    returning id into result;
  if result is null then raise sqlstate 'PT403' using message = 'Account unavailable'; end if;
  return result;
end $$;

create function public.resolve_account_session(p_hash text)
returns table(user_id uuid, session_id uuid, email text) language sql stable security definer set search_path = '' as $$
  select u.id, s.id, u.email::text from public.account_sessions s
  join auth.users u on u.id = s.user_id
  where s.secret_hash = p_hash and s.expires_at > now()
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
    and u.email_confirmed_at is not null and s.password_version = md5(u.encrypted_password);
$$;

create function public.create_account_workspace(p_user uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  insert into public.account_workspaces(owner_id,name) values (p_user,btrim(p_name)) returning id into result;
  insert into public.account_workspace_members(workspace_id,user_id,role) values(result,p_user,'owner');
  return result;
end $$;

-- Membership changes and invitation acceptance take the same workspace lock.
create function public.manage_account_member(p_actor uuid, p_workspace uuid, p_action text,
  p_target uuid default null, p_role text default null, p_until timestamptz default null,
  p_email text default null, p_hash text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.account_workspaces where id = p_workspace and owner_id = p_actor for update;
  if not found then raise sqlstate 'PT403' using message = 'Owner access required'; end if;
  if p_until is not null and p_until <= now() then raise sqlstate 'PT400' using message = 'Expiration must be in the future'; end if;
  if p_action = 'invite' then
    insert into public.account_workspace_invites(workspace_id,email,role,token_hash,expires_at,member_expires_at)
      values(p_workspace,lower(btrim(p_email)),p_role,p_hash,least(now()+interval '7 days',coalesce(p_until,'infinity')),p_until)
      on conflict (workspace_id,email) do update set token_hash=excluded.token_hash,role=excluded.role,
        expires_at=excluded.expires_at,member_expires_at=excluded.member_expires_at;
  elsif p_action = 'cancel' then
    delete from public.account_workspace_invites where workspace_id=p_workspace and id=p_target;
  elsif p_action in ('remove','update') and p_target <> p_actor then
    delete from public.account_workspace_invites i using auth.users u
      where i.workspace_id=p_workspace and u.id=p_target and i.email=lower(u.email);
    if p_action='remove' then
      delete from public.account_workspace_members where workspace_id=p_workspace and user_id=p_target and role<>'owner';
    else
      if p_role not in ('editor','viewer') or p_role is null then raise sqlstate 'PT400' using message='Invalid role'; end if;
      update public.account_workspace_members set role=p_role,expires_at=p_until
        where workspace_id=p_workspace and user_id=p_target and role<>'owner';
    end if;
    if not found then raise sqlstate 'PT404' using message='Member unavailable'; end if;
  else raise sqlstate 'PT400' using message = 'Invalid member change';
  end if;
end $$;

create function public.accept_account_invite(p_user uuid,p_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.account_workspace_invites; target uuid;
begin
  select workspace_id into target from public.account_workspace_invites where token_hash=p_hash;
  perform 1 from public.account_workspaces where id=target for update;
  select i.* into invitation from public.account_workspace_invites i
    join auth.users u on u.id=p_user and u.email_confirmed_at is not null and lower(u.email)=i.email
    where i.token_hash=p_hash and i.expires_at>now() and (i.member_expires_at is null or i.member_expires_at>now()) for update of i;
  if not found then raise sqlstate 'PT404' using message='Invitation unavailable'; end if;
  insert into public.account_workspace_members(workspace_id,user_id,role,expires_at)
    values(invitation.workspace_id,p_user,invitation.role,invitation.member_expires_at)
    on conflict (workspace_id,user_id) do update set role=excluded.role,expires_at=excluded.expires_at
      where account_workspace_members.role <> 'owner' and account_workspace_members.expires_at <= now();
  delete from public.account_workspace_invites where id=invitation.id;
  return invitation.workspace_id;
end $$;

create function public.account_member_directory(p_actor uuid, p_workspace uuid)
returns table(user_id uuid,email text,role text,expires_at timestamptz) language sql stable security definer set search_path='' as $$
  select m.user_id,u.email::text,m.role,m.expires_at from public.account_workspace_members m
  join public.account_workspaces w on w.id=m.workspace_id and w.owner_id=p_actor
  join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace order by u.email;
$$;
revoke all on function public.start_account_session(uuid,text,text),public.resolve_account_session(text),
  public.create_account_workspace(uuid,text),public.manage_account_member(uuid,uuid,text,uuid,text,timestamptz,text,text),
  public.accept_account_invite(uuid,text),public.account_member_directory(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_account_session(uuid,text,text),public.resolve_account_session(text),
  public.create_account_workspace(uuid,text),public.manage_account_member(uuid,uuid,text,uuid,text,timestamptz,text,text),
  public.accept_account_invite(uuid,text),public.account_member_directory(uuid,uuid) to service_role;
commit;
