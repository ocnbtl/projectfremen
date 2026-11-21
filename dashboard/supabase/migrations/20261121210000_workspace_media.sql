begin;

-- Service-side catalog added after account_workspace_identity. Existing originals stay in place.
create table public.account_workspace_storage (
  workspace_id uuid primary key references public.account_workspaces(id),
  included_bytes bigint not null check (included_bytes >= 0),
  pooled_addon_bytes bigint not null default 0 check (pooled_addon_bytes >= 0)
);

create table public.account_media_preferences (
  workspace_id uuid not null,
  user_id uuid not null,
  metadata_free_uploads boolean not null,
  primary key(workspace_id,user_id),
  foreign key(workspace_id,user_id) references public.account_workspace_members(workspace_id,user_id) on delete cascade
);
alter table public.account_media_preferences enable row level security;
revoke all on public.account_media_preferences from public, anon, authenticated;
grant select, insert, update on public.account_media_preferences to service_role;

create table public.account_workspace_media (
  workspace_id uuid not null references public.account_workspace_storage(workspace_id),
  media_id uuid not null,
  record_id text not null,
  object_id text not null,
  owner_id uuid not null references auth.users(id),
  audience text not null default 'private' check (audience in ('private','workspace')),
  backend text not null check (backend in ('supabase','r2-standard')),
  source_file_id uuid not null,
  state text not null check (state in ('uploading','ready','discarding','discarded')),
  file_name text not null check (length(file_name) between 1 and 240),
  mime_type text not null check (length(mime_type) between 1 and 200),
  byte_length bigint not null check (byte_length between 1 and 268435456),
  chunk_size integer not null check (chunk_size in (1048576,8388608)),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  write_deadline timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id,media_id),
  unique (workspace_id,record_id),
  unique (workspace_id,object_id),
  unique (backend,source_file_id),
  check (backend <> 'supabase' or (state = 'ready' and chunk_size = 1048576))
);
create index account_workspace_media_list on public.account_workspace_media(workspace_id, created_at desc, media_id);

alter table public.account_workspace_storage enable row level security;
alter table public.account_workspace_media enable row level security;
revoke all on public.account_workspace_storage, public.account_workspace_media from public, anon, authenticated;
grant select, insert, update on public.account_workspace_storage, public.account_workspace_media to service_role;

-- All changes for a workspace serialize on its quota row. Incomplete uploads
-- count against the pool until their signed writes expire and storage is cleaned.
create function public.workspace_media_action(
  p_workspace uuid, p_actor uuid, p_media uuid, p_action text, p_data jsonb
) returns public.account_workspace_media language plpgsql security definer set search_path = '' as $$
declare
  plan public.account_workspace_storage;
  item public.account_workspace_media;
  used numeric;
  actor_role text;
begin
  select role into actor_role from public.account_workspace_members
    where workspace_id = p_workspace and user_id = p_actor and (expires_at is null or expires_at > now()) for share;
  if actor_role is null or actor_role not in ('owner','editor') then
    raise exception 'Access denied';
  end if;
  if p_action = 'start' then
    insert into public.account_workspace_storage(workspace_id,included_bytes)
      values (p_workspace,(p_data->>'included')::bigint) on conflict do nothing;
  end if;
  select * into plan from public.account_workspace_storage where workspace_id = p_workspace for update;
  if plan.workspace_id is null then raise exception 'Media unavailable'; end if;
  select * into item from public.account_workspace_media where workspace_id = p_workspace and media_id = p_media;
  if p_action = 'start' and item.media_id is null then
    select coalesce(sum(byte_length),0) into used from public.account_workspace_media
      where workspace_id = p_workspace and state <> 'discarded';
    if used + (p_data->>'bytes')::bigint > plan.included_bytes::numeric + plan.pooled_addon_bytes then
      raise exception 'Storage quota exceeded';
    end if;
    insert into public.account_workspace_media
      (workspace_id,media_id,record_id,object_id,owner_id,backend,source_file_id,state,file_name,mime_type,byte_length,chunk_size,sha256)
      values (p_workspace,p_media,'personal-' || p_media::text,p_media::text,p_actor,'r2-standard',p_media,'uploading',
        p_data->>'name',p_data->>'mime',(p_data->>'bytes')::bigint,8388608,p_data->>'sha256') returning * into item;
    return item;
  end if;
  if item.media_id is null or item.owner_id <> p_actor then raise exception 'Media unavailable'; end if;
  if p_action = 'start' then
    if item.state not in ('ready','uploading') or item.byte_length <> (p_data->>'bytes')::bigint
      or item.sha256 <> p_data->>'sha256' or item.file_name <> p_data->>'name' or item.mime_type <> p_data->>'mime'
      then raise exception 'Upload details changed'; end if;
  elsif p_action = 'part' and item.state = 'uploading' then
    update public.account_workspace_media set write_deadline = now() + interval '6 minutes'
      where workspace_id = p_workspace and media_id = p_media returning * into item;
  elsif p_action = 'finish' and item.state in ('uploading','ready') then
    update public.account_workspace_media set state = 'ready' where workspace_id = p_workspace and media_id = p_media returning * into item;
  elsif p_action = 'share' and item.state = 'ready' then
    update public.account_workspace_media set audience = p_data->>'audience'
      where workspace_id = p_workspace and media_id = p_media returning * into item;
  elsif p_action = 'discard' and item.state in ('uploading','discarding','discarded') then
    if item.state = 'uploading' then
      update public.account_workspace_media set state = 'discarding' where workspace_id = p_workspace and media_id = p_media returning * into item;
    end if;
  elsif p_action = 'released' and item.state in ('discarding','discarded') and coalesce(item.write_deadline,'-infinity') < now() then
    update public.account_workspace_media set state = 'discarded' where workspace_id = p_workspace and media_id = p_media returning * into item;
  else raise exception 'Upload state changed';
  end if;
  return item;
end;
$$;

create function public.workspace_media_usage(p_workspace uuid, p_actor uuid)
returns table(included_bytes bigint, pooled_addon_bytes bigint, used_bytes bigint, reserved_bytes bigint)
language sql stable set search_path = '' as $$
  select s.included_bytes,s.pooled_addon_bytes,
    coalesce(sum(m.byte_length) filter (where m.state = 'ready'),0)::bigint,
    coalesce(sum(m.byte_length) filter (where m.state in ('uploading','discarding')),0)::bigint
  from public.account_workspace_storage s
  left join public.account_workspace_media m on m.workspace_id = s.workspace_id
  where s.workspace_id = p_workspace and exists
    (select 1 from public.account_workspace_members where workspace_id = p_workspace and user_id = p_actor and (expires_at is null or expires_at > now()))
  group by s.workspace_id
$$;
revoke all on function public.workspace_media_action(uuid, uuid, uuid, text, jsonb), public.workspace_media_usage(uuid, uuid) from public, anon, authenticated;
grant execute on function public.workspace_media_action(uuid, uuid, uuid, text, jsonb), public.workspace_media_usage(uuid, uuid) to service_role;

commit;
