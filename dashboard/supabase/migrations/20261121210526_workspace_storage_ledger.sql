begin;
alter table public.account_record_files add foreign key (workspace_id,media_id)
  references public.account_workspace_media(workspace_id,media_id);

-- Values are bytes. This ledger records entitlements and originals, not charges.
create table public.account_storage_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.account_workspaces(id),
  occurred_at timestamptz not null default now(),
  media_id uuid,
  used_delta bigint not null default 0,
  reserved_delta bigint not null default 0,
  included_delta bigint not null default 0,
  addon_delta bigint not null default 0
);
create index account_storage_events_by_workspace on public.account_storage_events(workspace_id,id);
alter table public.account_storage_events enable row level security;
revoke all on public.account_storage_events from public,anon,authenticated,service_role;
grant select on public.account_storage_events to service_role;

create function public.account_log_storage_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  used_bytes bigint:=0; reserved_bytes bigint:=0;
  included_bytes bigint:=0; addon_bytes bigint:=0; file_id uuid;
begin
  if tg_table_name='account_workspace_media' then
    file_id:=new.media_id;
    if new.state='ready' then used_bytes:=new.byte_length;
    elsif new.state in ('uploading','discarding') then reserved_bytes:=new.byte_length; end if;
    if tg_op='UPDATE' then
      if old.state='ready' then used_bytes:=used_bytes-old.byte_length;
      elsif old.state in ('uploading','discarding') then reserved_bytes:=reserved_bytes-old.byte_length; end if;
    end if;
  else
    included_bytes:=new.included_bytes; addon_bytes:=new.pooled_addon_bytes;
    if tg_op='UPDATE' then included_bytes:=included_bytes-old.included_bytes; addon_bytes:=addon_bytes-old.pooled_addon_bytes; end if;
  end if;
  if used_bytes<>0 or reserved_bytes<>0 or included_bytes<>0 or addon_bytes<>0 then
    insert into public.account_storage_events(workspace_id,media_id,used_delta,reserved_delta,included_delta,addon_delta)
      values(new.workspace_id,file_id,used_bytes,reserved_bytes,included_bytes,addon_bytes);
  end if;
  return new;
end $$;
revoke all on function public.account_log_storage_change() from public,anon,authenticated,service_role;
create trigger account_media_usage after insert or update of state,byte_length on public.account_workspace_media
  for each row execute function public.account_log_storage_change();
create trigger account_plan_usage after insert or update of included_bytes,pooled_addon_bytes on public.account_workspace_storage
  for each row execute function public.account_log_storage_change();
insert into public.account_storage_events(workspace_id,included_delta,addon_delta)
  select workspace_id,included_bytes,pooled_addon_bytes from public.account_workspace_storage;
insert into public.account_storage_events(workspace_id,media_id,used_delta,reserved_delta)
  select workspace_id,media_id,case when state='ready' then byte_length else 0 end,
    case when state in ('uploading','discarding') then byte_length else 0 end
  from public.account_workspace_media where state<>'discarded';
commit;
