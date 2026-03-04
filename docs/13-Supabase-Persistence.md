# Supabase Persistence Setup (Project Fremen)

This setup moves runtime state persistence from local JSON files to Supabase Postgres.

## Goal

Persist these runtime state keys durably across Vercel deployments and server restarts:

1. `kpis.json`
2. `reviews.json`
3. `entity-goals.json`
4. `docs-index.json`
5. `audit-log.json`

## 1) Create Supabase Project

In Supabase UI:

1. Organization: `Unigentamos`
2. Project name: `projectfremen` (or similar)
3. Region: closest to users (Americas is fine)
4. Security:
   - Keep `Enable Data API` checked.
   - `Enable automatic RLS` can remain unchecked.
5. Create project and wait until status is ready.

## 2) Create Storage Table

Open Supabase -> SQL Editor -> New query, then run:

```sql
create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists app_state_set_updated_at on public.app_state;
create trigger app_state_set_updated_at
before update on public.app_state
for each row
execute function public.set_updated_at();

alter table public.app_state enable row level security;

drop policy if exists "deny all app_state" on public.app_state;
create policy "deny all app_state"
on public.app_state
for all
to public
using (false)
with check (false);
```

Notes:

1. The app writes with `SUPABASE_SERVICE_ROLE_KEY` from server-side code only.
2. Service role bypasses RLS, so app writes succeed while public API access remains blocked.

## 3) Get Project Credentials

From Supabase -> Project Settings -> API:

1. Copy `Project URL` -> use as `SUPABASE_URL`
2. Copy `service_role` key -> use as `SUPABASE_SERVICE_ROLE_KEY`
   - Never expose this key to browser/client code.

## 4) Set Vercel Environment Variables

In Vercel -> Project Settings -> Environment Variables:

```bash
SUPABASE_URL=<REDACTED_SUPABASE_PROJECT_URL>
SUPABASE_SERVICE_ROLE_KEY=<REDACTED_SUPABASE_SERVICE_ROLE_KEY>
FREMEN_REQUIRE_SUPABASE=true
```

Recommended to also keep:

```bash
ADMIN_PASSWORD=<REDACTED>
ADMIN_SESSION_SECRET=<REDACTED_OPTIONAL>
DOCS_REPOS=ocnbtl/projectfremen:main,pngwn-zero/pngwn-web:main,ocnbtl/projectpint:main
```

## 5) Deploy and Verify

1. Redeploy main in Vercel.
2. Login and update one KPI.
3. Create/update one review.
4. Edit goals for one entity.
5. In Supabase SQL editor, check rows:

```sql
select key, updated_at
from public.app_state
order by updated_at desc;
```

Expected:

1. Rows appear for `kpis.json`, `reviews.json`, `entity-goals.json`.
2. Data remains after tab close and after redeploy.

## 6) Fallback Behavior

1. If Supabase env vars are not set, app falls back to filesystem store.
2. If `FREMEN_REQUIRE_SUPABASE=true`, app will fail fast if Supabase config is missing.
