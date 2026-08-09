-- Conservative relay housekeeping and explicit device lifecycle.
-- Compaction is server-only, acknowledgement-gated, and preserves meaningful
-- encrypted versions plus a rolling recovery window.

alter table public.vault_sync_devices
  add column if not exists lifecycle text not null default 'active',
  add column if not exists retired_at timestamptz,
  add column if not exists retired_by_device_id uuid;

alter table public.vault_sync_devices
  drop constraint if exists vault_sync_devices_lifecycle_valid;

alter table public.vault_sync_devices
  add constraint vault_sync_devices_lifecycle_valid check (
    (lifecycle = 'active' and retired_at is null and retired_by_device_id is null)
    or
    (lifecycle = 'retired' and retired_at is not null and retired_by_device_id is not null)
  );

create index if not exists vault_sync_devices_vault_lifecycle_idx
  on public.vault_sync_devices (vault_id, lifecycle, last_seen_at desc);

create table if not exists public.vault_sync_compactions (
  compaction_id uuid primary key,
  vault_id uuid not null,
  actor_device_id uuid not null,
  safe_sequence bigint not null check (safe_sequence >= 0),
  deleted_changes integer not null check (deleted_changes >= 0),
  retained_changes integer not null check (retained_changes >= 0),
  active_devices integer not null check (active_devices between 1 and 64),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists vault_sync_compactions_vault_created_idx
  on public.vault_sync_compactions (vault_id, created_at desc);

alter table public.vault_sync_compactions enable row level security;
alter table public.vault_sync_compactions force row level security;

revoke all on table public.vault_sync_compactions from public, anon, authenticated, service_role;
grant select, insert on table public.vault_sync_compactions to service_role;
grant delete on table public.vault_sync_changes to service_role;

create or replace function public.vault_sync_relay_health(p_vault_id uuid)
returns table (
  relay_rows bigint,
  relay_bytes bigint,
  active_devices integer,
  retired_devices integer,
  safe_compaction_sequence bigint,
  last_compacted_at timestamptz,
  last_deleted_changes integer
)
language sql
security invoker
stable
set search_path = ''
as $$
  select
    (select count(*) from public.vault_sync_changes where vault_id = p_vault_id),
    (select coalesce(sum(byte_length), 0) from public.vault_sync_changes where vault_id = p_vault_id),
    (select count(*)::integer from public.vault_sync_devices where vault_id = p_vault_id and lifecycle = 'active'),
    (select count(*)::integer from public.vault_sync_devices where vault_id = p_vault_id and lifecycle = 'retired'),
    coalesce((
      select min(acknowledged_sequence)
      from public.vault_sync_devices
      where vault_id = p_vault_id and lifecycle = 'active'
    ), 0),
    (select created_at from public.vault_sync_compactions where vault_id = p_vault_id order by created_at desc limit 1),
    coalesce((select deleted_changes from public.vault_sync_compactions where vault_id = p_vault_id order by created_at desc limit 1), 0);
$$;

revoke all on function public.vault_sync_relay_health(uuid) from public, anon, authenticated;
grant execute on function public.vault_sync_relay_health(uuid) to service_role;

create or replace function public.retire_vault_sync_device(
  p_vault_id uuid,
  p_actor_device_id uuid,
  p_target_device_id uuid
)
returns table (retired_device_id uuid, retired_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  retired_timestamp timestamptz := timezone('utc', now());
begin
  if p_actor_device_id = p_target_device_id then
    raise exception using errcode = '22023', message = 'the current device cannot retire itself';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_vault_id::text, 2));

  if not exists (
    select 1 from public.vault_sync_devices
    where vault_id = p_vault_id and device_id = p_actor_device_id and lifecycle = 'active'
  ) then
    raise exception using errcode = '28000', message = 'the acting vault device is not active';
  end if;

  update public.vault_sync_devices
  set lifecycle = 'retired',
      retired_at = retired_timestamp,
      retired_by_device_id = p_actor_device_id,
      updated_at = retired_timestamp
  where vault_id = p_vault_id
    and device_id = p_target_device_id
    and lifecycle = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'the vault device was not found or is already retired';
  end if;

  return query select p_target_device_id, retired_timestamp;
end;
$$;

revoke all on function public.retire_vault_sync_device(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.retire_vault_sync_device(uuid, uuid, uuid) to service_role;

create or replace function public.compact_vault_sync_relay(
  p_vault_id uuid,
  p_actor_device_id uuid,
  p_keep_change_ids uuid[],
  p_recovery_window integer default 256
)
returns table (
  safe_sequence bigint,
  deleted_changes integer,
  retained_changes integer,
  active_devices integer,
  outcome text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  active_count integer;
  safe_cursor bigint;
  first_sequence bigint;
  recovery_floor bigint;
  removed_count bigint := 0;
  remaining_count bigint := 0;
  blocked_count integer;
  unique_keep_count integer;
begin
  if p_recovery_window < 64 or p_recovery_window > 4096 then
    raise exception using errcode = '22023', message = 'relay recovery window is invalid';
  end if;

  select count(*) into unique_keep_count
  from (select distinct unnest(coalesce(p_keep_change_ids, array[]::uuid[]))) as keep_id;
  if unique_keep_count > 50000 then
    raise exception using errcode = '54000', message = 'relay compaction manifest is too large';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_vault_id::text, 3));

  if not exists (
    select 1 from public.vault_sync_devices
    where vault_id = p_vault_id and device_id = p_actor_device_id and lifecycle = 'active'
  ) then
    raise exception using errcode = '28000', message = 'the acting vault device is not active';
  end if;

  select count(*)::integer,
         coalesce(min(acknowledged_sequence), 0),
         count(*) filter (where pending_changes > 0 or blocked_changes > 0)::integer
    into active_count, safe_cursor, blocked_count
  from public.vault_sync_devices
  where vault_id = p_vault_id and lifecycle = 'active';

  select count(*) into remaining_count
  from public.vault_sync_changes where vault_id = p_vault_id;

  if active_count < 1 then
    return query select 0::bigint, 0, remaining_count::integer, 0, 'no_active_devices'::text;
    return;
  end if;
  if blocked_count > 0 then
    return query select safe_cursor, 0, remaining_count::integer, active_count, 'devices_not_caught_up'::text;
    return;
  end if;
  if safe_cursor < 1 or remaining_count <= p_recovery_window then
    return query select safe_cursor, 0, remaining_count::integer, active_count, 'nothing_to_compact'::text;
    return;
  end if;

  select min(sequence) into first_sequence
  from public.vault_sync_changes where vault_id = p_vault_id;

  select min(sequence) into recovery_floor
  from (
    select sequence
    from public.vault_sync_changes
    where vault_id = p_vault_id and sequence <= safe_cursor
    order by sequence desc
    limit p_recovery_window
  ) recent;

  delete from public.vault_sync_changes
  where vault_id = p_vault_id
    and sequence <= safe_cursor
    and sequence <> first_sequence
    and sequence < coalesce(recovery_floor, first_sequence)
    and not (change_id = any(coalesce(p_keep_change_ids, array[]::uuid[])));
  get diagnostics removed_count = row_count;

  select count(*) into remaining_count
  from public.vault_sync_changes where vault_id = p_vault_id;

  if removed_count > 0 then
    insert into public.vault_sync_compactions (
      compaction_id, vault_id, actor_device_id, safe_sequence,
      deleted_changes, retained_changes, active_devices
    ) values (
      gen_random_uuid(), p_vault_id, p_actor_device_id, safe_cursor,
      removed_count::integer, remaining_count::integer, active_count
    );
  end if;

  return query select
    safe_cursor,
    removed_count::integer,
    remaining_count::integer,
    active_count,
    case when removed_count > 0 then 'compacted' else 'nothing_to_compact' end;
end;
$$;

revoke all on function public.compact_vault_sync_relay(uuid, uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.compact_vault_sync_relay(uuid, uuid, uuid[], integer) to service_role;

-- A retired device stays retired if its old browser continues sending status.
create or replace function private.enforce_vault_sync_device_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  relay_head bigint;
  device_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.vault_id::text, 1));

  if tg_op = 'INSERT' and not exists (
    select 1 from public.vault_sync_devices
    where vault_id = new.vault_id and device_id = new.device_id
  ) then
    select count(*) into device_count from public.vault_sync_devices where vault_id = new.vault_id;
    if device_count >= 64 then
      raise exception using errcode = '54000', message = 'vault device status limit exceeded';
    end if;
  end if;

  select coalesce(max(sequence), 0) into relay_head
  from public.vault_sync_changes where vault_id = new.vault_id;

  new.acknowledged_sequence := least(new.acknowledged_sequence, relay_head);
  new.last_seen_at := timezone('utc', now());
  new.updated_at := new.last_seen_at;

  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.acknowledged_sequence := greatest(old.acknowledged_sequence, new.acknowledged_sequence);
    new.last_synced_at := old.last_synced_at;
    if old.lifecycle = 'retired' then
      new.lifecycle := old.lifecycle;
      new.retired_at := old.retired_at;
      new.retired_by_device_id := old.retired_by_device_id;
    end if;
  end if;

  if new.lifecycle = 'active'
    and new.pending_changes = 0
    and new.blocked_changes = 0
    and new.acknowledged_sequence >= relay_head then
    new.last_synced_at := new.last_seen_at;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_vault_sync_device_status() from public, anon, authenticated;
grant execute on function private.enforce_vault_sync_device_status() to service_role;

create or replace function private.enforce_vault_sync_quota()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_rows bigint;
  current_bytes bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.vault_id::text, 0));

  if exists (
    select 1 from public.vault_sync_devices
    where vault_id = new.vault_id and device_id = new.device_id and lifecycle = 'retired'
  ) then
    raise exception using errcode = '28000', message = 'vault device is retired';
  end if;

  if exists (
    select 1 from public.vault_sync_changes
    where vault_id = new.vault_id and change_id = new.change_id
  ) then
    return new;
  end if;

  select count(*), coalesce(sum(byte_length), 0)
    into current_rows, current_bytes
  from public.vault_sync_changes where vault_id = new.vault_id;

  if current_rows >= 200000 or current_bytes + new.byte_length > 201326592 then
    raise exception using errcode = '54000', message = 'vault relay quota exceeded';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_vault_sync_quota() from public, anon, authenticated;
grant execute on function private.enforce_vault_sync_quota() to service_role;

comment on table public.vault_sync_compactions is
  'Server-only receipts for conservative encrypted relay housekeeping.';
comment on function public.compact_vault_sync_relay(uuid, uuid, uuid[], integer) is
  'Compacts only fully acknowledged relay rows while preserving meaningful encrypted change IDs and a recovery window.';
