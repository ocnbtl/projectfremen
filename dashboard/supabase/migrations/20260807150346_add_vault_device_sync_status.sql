-- Per-device relay acknowledgements for an honest "all devices current" view.
-- Device names and kinds stay encrypted with the vault key; the relay sees
-- only opaque descriptors and the minimum counters needed for sync health.
create table if not exists public.vault_sync_devices (
  vault_id uuid not null,
  device_id uuid not null,
  descriptor_version smallint not null check (descriptor_version = 1),
  key_version integer not null check (key_version between 1 and 1000000),
  descriptor_iv text not null check (length(descriptor_iv) between 16 and 64),
  descriptor_ciphertext text not null,
  descriptor_aad_hash text not null check (length(descriptor_aad_hash) between 40 and 64),
  descriptor_byte_length integer not null check (descriptor_byte_length between 16 and 16384),
  acknowledged_sequence bigint not null default 0 check (acknowledged_sequence >= 0),
  pending_changes integer not null default 0 check (pending_changes between 0 and 1000000),
  blocked_changes integer not null default 0 check (blocked_changes between 0 and 1000000),
  last_seen_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (vault_id, device_id),
  constraint vault_sync_devices_ciphertext_limit check (octet_length(descriptor_ciphertext) <= 22000),
  constraint vault_sync_devices_iv_encoding check (octet_length(decode(descriptor_iv, 'base64')) = 12),
  constraint vault_sync_devices_aad_encoding check (octet_length(decode(descriptor_aad_hash, 'base64')) = 32),
  constraint vault_sync_devices_declared_size check (
    octet_length(decode(descriptor_ciphertext, 'base64')) = descriptor_byte_length
  )
);

create index if not exists vault_sync_devices_vault_seen_idx
  on public.vault_sync_devices (vault_id, last_seen_at desc);

alter table public.vault_sync_devices enable row level security;
alter table public.vault_sync_devices force row level security;

revoke all on table public.vault_sync_devices from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.vault_sync_devices to service_role;

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
    select 1
    from public.vault_sync_devices
    where vault_id = new.vault_id and device_id = new.device_id
  ) then
    select count(*) into device_count
    from public.vault_sync_devices
    where vault_id = new.vault_id;

    if device_count >= 64 then
      raise exception using
        errcode = '54000',
        message = 'vault device status limit exceeded';
    end if;
  end if;

  select coalesce(max(sequence), 0) into relay_head
  from public.vault_sync_changes
  where vault_id = new.vault_id;

  new.acknowledged_sequence := least(new.acknowledged_sequence, relay_head);
  new.last_seen_at := timezone('utc', now());
  new.updated_at := new.last_seen_at;

  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.acknowledged_sequence := greatest(old.acknowledged_sequence, new.acknowledged_sequence);
    new.last_synced_at := old.last_synced_at;
  end if;

  if new.pending_changes = 0 and new.blocked_changes = 0 and new.acknowledged_sequence >= relay_head then
    new.last_synced_at := new.last_seen_at;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_vault_sync_device_status() from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.enforce_vault_sync_device_status() to service_role;

drop trigger if exists vault_sync_devices_status_trigger on public.vault_sync_devices;
create trigger vault_sync_devices_status_trigger
before insert or update on public.vault_sync_devices
for each row execute function private.enforce_vault_sync_device_status();

comment on table public.vault_sync_devices is
  'Opaque device descriptors and bounded acknowledgement counters for encrypted vault synchronization.';
