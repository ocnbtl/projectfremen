-- Opaque, end-to-end encrypted local-first change relay.
-- The service never receives a vault password, unwrapped key, or plaintext object.
create table if not exists public.vault_sync_changes (
  sequence bigint generated always as identity primary key,
  vault_id uuid not null,
  change_id uuid not null,
  device_id uuid not null,
  envelope_version smallint not null check (envelope_version = 1),
  key_version integer not null check (key_version between 1 and 1000000),
  iv text not null check (length(iv) between 16 and 64),
  ciphertext text not null,
  aad_hash text not null check (length(aad_hash) between 40 and 64),
  byte_length integer not null check (byte_length between 16 and 1100000),
  received_at timestamptz not null default timezone('utc', now()),
  constraint vault_sync_changes_vault_change_unique unique (vault_id, change_id),
  constraint vault_sync_changes_ciphertext_limit check (octet_length(ciphertext) <= 1500000),
  constraint vault_sync_changes_iv_encoding check (octet_length(decode(iv, 'base64')) = 12),
  constraint vault_sync_changes_aad_encoding check (octet_length(decode(aad_hash, 'base64')) = 32),
  constraint vault_sync_changes_declared_size check (octet_length(decode(ciphertext, 'base64')) = byte_length)
);

create index if not exists vault_sync_changes_vault_sequence_idx
  on public.vault_sync_changes (vault_id, sequence);

alter table public.vault_sync_changes enable row level security;
alter table public.vault_sync_changes force row level security;

revoke all on table public.vault_sync_changes from anon, authenticated;
revoke all on sequence public.vault_sync_changes_sequence_seq from anon, authenticated;
revoke all on table public.vault_sync_changes from service_role;
grant select, insert on table public.vault_sync_changes to service_role;
grant usage, select on sequence public.vault_sync_changes_sequence_seq to service_role;

-- Keep the replaceable relay well below the free database ceiling so table,
-- index, and maintenance overhead retain headroom. Local device queues remain
-- authoritative when this mailbox reaches its bounded capacity.
create schema if not exists private;

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
    select 1
    from public.vault_sync_changes
    where vault_id = new.vault_id and change_id = new.change_id
  ) then
    return new;
  end if;

  select count(*), coalesce(sum(byte_length), 0)
    into current_rows, current_bytes
  from public.vault_sync_changes
  where vault_id = new.vault_id;

  if current_rows >= 200000 or current_bytes + new.byte_length > 201326592 then
    raise exception using
      errcode = '54000',
      message = 'vault relay quota exceeded';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_vault_sync_quota() from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.enforce_vault_sync_quota() to service_role;

drop trigger if exists vault_sync_changes_quota_trigger on public.vault_sync_changes;
create trigger vault_sync_changes_quota_trigger
before insert on public.vault_sync_changes
for each row execute function private.enforce_vault_sync_quota();

comment on table public.vault_sync_changes is
  'Opaque encrypted envelopes for authenticated Unigentamos local-first synchronization.';
