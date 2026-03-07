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

1. `GITHUB_TOKEN` is optional but recommended to avoid rate limits during docs sync.
2. Without Supabase config, local development falls back to filesystem persistence.
3. Sentry KPI sync currently targets `pngwn` and `Diyesu Decor` and requires the `SENTRY_*` env vars.
4. The public site title and site metadata should read `Unigentamos`, not `Unigentamos Admin`.
5. The current production baseline is also documented in `docs/09-Deployment-Runbook.md`, `docs/10-Release-Checklist.md`, and `docs/13-Supabase-Persistence.md`.
