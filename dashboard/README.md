# Unigentamos Command Center

This is the current Next.js admin and command-center app for Unigentamos, deployed on Vercel at `https://unigentamos.com`.

## Current Production Baseline

1. Public landing page at `/` with founder login entry.
2. Admin login at `/admin/login`.
3. Admin command center at `/admin`.
4. Entity hubs at:
   - `/admin/entities/unigentamos`
   - `/admin/entities/pngwn`
   - `/admin/entities/diyesu-decor`
5. KPI tracker at `/admin/kpis`.
6. GitHub docs sync at `/admin/docs`.
7. Obsidian export at `/admin/obsidian`.
8. Weekly and monthly review hubs plus entry detail pages.
9. Current Goals on the home page, sourced from entity goals.
10. Goal autosave, cross-view sync, and persistent completion state.
11. Vercel Analytics enabled and reporting in production.
12. `www.unigentamos.com` redirecting to `https://unigentamos.com`.

## Security + Persistence

1. Auth uses founder-password login with signed expiring sessions.
2. Admin protection is page-level and server-side via `require-admin` helpers.
3. Middleware/proxy auth is intentionally not used.
4. State-changing admin APIs require CSRF validation.
5. Runtime state persists through `lib/file-store.ts`.
6. Production persistence is Supabase `public.app_state` when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.
7. `FREMEN_REQUIRE_SUPABASE=true` is the intended production setting.
8. Audit events, KPIs, reviews, docs index, and entity goals are stored through the same persistence layer.

## Environment

Create `.env.local`:

```bash
ADMIN_PASSWORD=change-me
ADMIN_SESSION_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
FREMEN_REQUIRE_SUPABASE=false
GITHUB_TOKEN=
DOCS_REPOS=ocnbtl/projectfremen:main,pngwn-zero/pngwn-web:main,ocnbtl/projectpint:main
DOCS_MAX_FILES=120
FREMEN_DATA_DIR=
SENTRY_AUTH_TOKEN=
SENTRY_ORG_SLUG=
SENTRY_ORG_SLUG_PNGWN=
SENTRY_ORG_SLUG_DIYESU=
SENTRY_PROJECT_SLUG_PNGWN=
SENTRY_PROJECT_SLUG_DIYESU=
SENTRY_API_BASE_URL=https://sentry.io/api/0
SENTRY_KPI_QUERY=is:unresolved
SENTRY_KPI_NAME_PNGWN=Errors Reported in Sentry
SENTRY_KPI_NAME_DIYESU=Errors Reported in Sentry
OBSIDIAN_EXPORT_DIR=
```

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Regression Harness

Run this after changes:

```bash
npm run regress
```

What it does:

1. Runs `npm run typecheck`.
2. Runs `npm run build`.
3. Starts an isolated local production server on a temporary data directory.
4. Verifies locked flows without touching Supabase or production state:
   - public landing and admin login
   - unauthenticated API protection
   - admin login/logout
   - Current Goals persistence and home/entity sync
   - KPI create/read
   - weekly review create/update
   - docs index load
   - Obsidian export preview/dry-run
   - Sentry integration status route

Notes:

1. The harness intentionally clears Supabase credentials and uses a temp local data store.
2. External network actions such as GitHub docs sync and Sentry sync are reported as skips by default, not passes.
3. If the harness fails, it preserves its temp data directory path in the output for debugging.

## Key Routes + APIs

1. `GET/POST /api/kpis`
2. `GET/POST /api/kpis/integrations/sentry`
3. `GET /api/docs`
4. `POST /api/docs/sync`
5. `GET/POST/PATCH/DELETE /api/reviews`
6. `GET/POST /api/entity-goals`
7. `GET/POST /api/exports/obsidian`
8. `POST /api/admin/login`
9. `POST /api/admin/logout`

## Notes

### Calendar subscription sharing

Calendar → Options → Share → Subscriptions creates a read-only HTTPS iCalendar feed for one or more explicitly selected calendars. Event titles are shared by default; locations/addresses and descriptions are opt-in. Unchecking titles switches to Busy only and clears the other detail permissions. Linked records, attendees, and reminder alarms are never exported. Calendar visibility on the user's screen does not grant or remove sharing access.

- Management: authenticated, CSRF-protected `GET/POST /api/planning/shares`, with optimistic concurrency on updates. Definitions persist through the existing atomic file-store in `calendar-shares.json` (Supabase `app_state` in production).
- Subscription: `GET /api/calendar-feeds/<signed-token>.ics`. The URL is a bearer credential. Do not paste it into logs, issue trackers, or public analytics. Signatures use a domain-separated HMAC with `ADMIN_SESSION_SECRET`, falling back to `ADMIN_PASSWORD`; keep that secret stable across deployments. Changing the signing secret invalidates existing links. Never expose the stored key version through management responses.
- Revocation is checked on every request; responses are not cached at the origin/CDN. Regeneration changes the token and invalidates the previous URL. Subscribers may retain previously downloaded events after revocation.
- Feeds publish the previous 366 days and next 732 days as individual VEVENT occurrences, using the same recurrence/exception and birthday-anchor calculations as the calendar. Timed events use UTC; all-day events use exclusive end dates. Stable UIDs preserve updates to individual events and moved recurrence exceptions. Cancelled/archived events disappear from the next feed snapshot. A receiving app controls when it refreshes and reconciles that snapshot.
- Only stored events in the selected calendars are included. Separate birthday, holiday, and custom-date overlays are excluded. Imported calendars expose their latest saved state; this endpoint does not trigger provider refreshes. A feed over 10,000 occurrences or 5 MB fails rather than silently truncating.
- In Apolosign: phone app menu → My Family → calendar section + → Subscribe via URL. This is one-way subscription; Apolosign changes do not write back. See the [official subscription instructions](https://support.apolosign.com/hc/en-us/articles/54620280289817-How-to-Sync-Refresh-External-Calendars-in-Apolosign).
- Regression checks: `npm run test:calendar-sharing` uses synthetic data and a temporary store to cover scope/privacy, token rotation/revocation, stale writes, UTF-8 folding/escaping, UTC/DST, recurring exceptions, all-day dates, and stable event identity. Browser/API checks should additionally exercise unauthorized management, CSRF rejection, mobile geometry, copy, anonymous feed fetches, and persistence after reload. Do not use production events as test fixtures.

### Calendar booking links

Calendar → Options → Share → Bookings creates an external booking page. Choose automatic availability (date range, weekdays and daily hours) or specific start times each time a link is created. Set the destination calendar, calendars checked for conflicts, appointment length, time zone, buffer and advance notice. Hidden selected calendars still block time.

- Guests provide a name, email and optional note. Confirmation is immediate on the page and creates an ordinary event in the destination calendar, with guest contact details visible privately. When email delivery is configured, the guest receives date/time/time-zone/location details and the organizer receives the same details with the guest's contact information. Reply-to connects them directly. Later edits/cancellations require contacting the guest; they do not send automatic update emails.
- Management uses authenticated, CSRF-protected `GET/POST /api/planning/bookings`; guests use `/book/<signed-token>` and `/api/book/<signed-token>`. Links can be edited, closed or replaced. Closing a link preserves existing bookings. Treat URLs as bearer credentials; booking paths are excluded from analytics and use no-referrer/noindex headers.
- Link definitions, booking receipts and events share the existing atomic `planning-records.json` state (Supabase `app_state` in production). Each reservation rechecks current availability inside the write transaction, including after a compare-and-swap retry. Request identifiers prevent duplicate submissions. Ordinary calendar snapshots exclude booking administration data.
- Availability includes stored recurring events, exceptions and all-day events. Imported calendars use their latest saved state; separate birthday/holiday/custom-date overlays are not blockers. Ambiguous or nonexistent local times are not offered. Date ranges are limited to 91 days, manual selections to 200 starts and booking links to 100.
- Durable booking limits apply per guest email, IP and link. Contact information stays in event participants and is excluded from calendar subscription feeds. Signing uses a separate HMAC domain with the existing admin signing secret; rotating that secret invalidates links.
- `npm run test:calendar-booking` exercises availability, daylight saving, concurrency, idempotency, privacy, link controls and abuse limits using synthetic data, including a simulated Supabase compare-and-swap collision. Browser checks should cover guest confirmation, stale slots, host controls and responsive layouts without making production test bookings.

#### Booking email setup and recovery

Set `RESEND_API_KEY` (sending-only, restricted to your verified domain), `BOOKING_EMAIL_FROM` (verified sender), `BOOKING_NOTIFY_EMAIL` (organizer inbox), and a random `CRON_SECRET` in the production environment. Never commit these values. Redeploy after configuration. The Bookings panel shows readiness and pending/error counts. Missing configuration leaves bookings operational with on-page confirmation; it does not backfill mail for older appointments.

New configured bookings atomically save two durable email jobs alongside the appointment. Sending runs after the response, with independent guest/organizer retries, an atomic lease and stable Resend idempotency keys/payloads. The daily Vercel sweep at 09:00 UTC recovers eligible jobs; authenticated, CSRF-protected **Retry emails** is also available. The cron endpoint requires the bearer `CRON_SECRET`. Provider acceptance is recorded separately from inbox delivery; inspect Resend for delivery/bounce information. Jobs with an uncertain outcome older than 23 hours require review in Resend before any new send, protecting against duplicates after Resend's 24-hour idempotency window. Changed/cancelled appointments suppress pending confirmations. Keep template version 1 byte-stable for retries.

`npm run test:booking-email` uses synthetic storage and a mocked provider to cover independent delivery, failures, concurrent claims, identical retries, missing setup, stale appointments, escaping and time zones. It sends no external emails.

1. `GITHUB_TOKEN` is optional but recommended to avoid rate limits during docs sync.
2. Without Supabase config, local development falls back to filesystem persistence.
3. Sentry KPI sync currently targets `pngwn` and `Diyesu Decor` and requires the `SENTRY_*` env vars.
4. The public site title and site metadata should read `Unigentamos`, not `Unigentamos Admin`.
5. The current production baseline is also documented in `docs/09-Deployment-Runbook.md`, `docs/10-Release-Checklist.md`, and `docs/13-Supabase-Persistence.md`.
