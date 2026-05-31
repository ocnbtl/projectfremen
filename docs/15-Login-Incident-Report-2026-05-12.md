# Login Incident Report - 2026-05-12

## Summary

On 2026-05-12, login to `https://unigentamos.com` failed with a production Next.js server-side exception:

```text
Application error: a server-side exception has occurred while loading unigentamos.com
Digest: 3580913326
```

The public landing page and login page are currently reachable. The failure most likely occurs after a successful password submission, when the app redirects into the authenticated admin dashboard and the server tries to read persistent dashboard state.

## Confirmed Observations

Checks run from the local workspace on 2026-05-12:

1. `GET https://unigentamos.com/` returned `HTTP 200`.
2. `GET https://unigentamos.com/admin/login` returned `HTTP 200`.
3. Unauthenticated `GET https://unigentamos.com/admin` returned `HTTP 307` to `/admin/login`, then `HTTP 200`.
4. A normal form POST with an invalid password returned `HTTP 303` to `/admin/login?error=1`, then rendered the invalid-password page.
5. A malformed empty `POST https://unigentamos.com/api/admin/login` returned `HTTP 500`. This is a secondary robustness issue, not the likely browser-login failure, because a real form submit includes form data.
6. The screenshot digest `3580913326` can only be fully resolved from production logs. The digest should be searched in Vercel runtime logs for the exact stack trace.

## Relevant Code Path

Login submission:

1. `dashboard/app/api/admin/login/route.ts`
2. Reads form data and checks `ADMIN_PASSWORD`.
3. On success, sets:
   - `admin_session`
   - CSRF cookie
4. Redirects to `/admin?welcome=1`.

Authenticated dashboard render:

1. `dashboard/app/admin/page.tsx`
2. Calls `requireAdminSession()`.
3. Reads entity goals with `readEntityGoals(...)`.
4. `readEntityGoals(...)` calls `readJsonFile("entity-goals.json", ...)`.
5. `dashboard/lib/file-store.ts` reads from Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.
6. If `FREMEN_REQUIRE_SUPABASE=true` and Supabase is missing or misconfigured, `file-store.ts` throws.
7. If Supabase is configured but the REST read fails, `readJsonFromSupabase(...)` throws.
8. `dashboard/app/admin/page.tsx` does not catch this read failure, so the route renders the generic Next.js production error page.

## Most Likely Root Cause

The strongest candidate is a production Supabase persistence failure on authenticated admin render.

Likely variants:

1. `SUPABASE_SERVICE_ROLE_KEY` was rotated, revoked, copied incorrectly, or scoped incorrectly in Vercel Production.
2. `SUPABASE_URL` is wrong or points to a paused/deleted/unavailable project.
3. `FREMEN_REQUIRE_SUPABASE=true` is set while one of the Supabase env vars is missing.
4. The Supabase `public.app_state` table is missing, renamed, blocked by API settings, or otherwise returning a non-2xx REST response.
5. The Supabase project is temporarily unavailable.

Why this fits:

1. Anonymous pages render successfully.
2. Invalid password handling works.
3. The admin page is the first route after successful auth that reads server-side persisted state.
4. The deployment docs explicitly make Supabase the durable production store.
5. `file-store.ts` currently treats Supabase read/write failures as hard failures.

## Secondary Issue

`POST /api/admin/login` can throw a server exception when called without normal form data. This is not the likely screenshot path, but the login route should still guard `request.formData()` and return a controlled redirect or `400` response for malformed requests.

## Immediate Recovery Plan

1. In Vercel, open the Project Fremen production deployment logs and search for:

```text
3580913326
```

2. Confirm the stack trace. If it points into `file-store.ts`, Supabase, `readEntityGoals`, `readJsonFile`, or `app/admin/page.tsx`, proceed with the Supabase fix below.

3. In Vercel Production environment variables, verify these names are present and set:

```text
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
FREMEN_REQUIRE_SUPABASE=true
DOCS_REPOS
```

4. In Supabase, verify:

```sql
select key, updated_at
from public.app_state
order by updated_at desc;
```

Expected rows include:

```text
audit-log.json
kpis.json
reviews.json
entity-goals.json
docs-index.json
```

5. If the service role key is suspect, rotate it in Supabase, update `SUPABASE_SERVICE_ROLE_KEY` in Vercel Production, and redeploy.

6. Re-run production smoke:

```bash
curl -I "https://unigentamos.com/"
curl -I "https://unigentamos.com/admin/login"
curl -i "https://unigentamos.com/api/kpis"
```

Then manually log in and confirm `/admin` renders.

## Emergency Workaround

If Supabase cannot be restored quickly, set `FREMEN_REQUIRE_SUPABASE=false` in Vercel Production and redeploy.

This should allow fallback storage behavior, but it is not the optimal long-term fix because Vercel serverless filesystem state is not durable. Use this only to restore admin access temporarily, then restore Supabase.

## Optimal Long-Term Solution

1. Restore and verify Supabase as the durable production state backend.
2. Add an authenticated health check that verifies:
   - Supabase env presence
   - `app_state` read
   - `app_state` write or upsert
   - current storage backend name
3. Add a custom admin error boundary so a data-store outage shows an actionable internal error instead of the generic Next.js digest page.
4. Wrap admin home state reads in a controlled degraded state:
   - allow the shell to render
   - show a clear "persistent state unavailable" admin message
   - do not silently write fallback production data over real data
5. Harden `POST /api/admin/login` against malformed bodies.
6. Add a post-deploy smoke step that performs a real authenticated login and verifies `/admin` renders, not just that `/admin/login` returns `200`.
7. Add Sentry or Vercel alerting for server-side exceptions on authenticated admin routes.

## Recommended Priority

1. First: search Vercel logs for digest `3580913326`.
2. Second: fix Supabase env/table/key health and redeploy.
3. Third: add the health check and admin error boundary.
4. Fourth: harden malformed login POST handling.

The production fix should focus on restoring the configured durable persistence layer. Disabling Supabase is only an availability fallback, not the best final state.
