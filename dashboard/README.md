# Unigentamos Admin Dashboard (MVP Scaffold)

This is the fast-start scaffold for the Unigentamos internal admin dashboard.

## Included

1. Landing page (`/`)
2. Admin login (`/admin/login`)
3. Admin dashboard (`/admin`)
4. Rotating welcome text component
5. Seed task and KPI cards
6. Basic founder-only cookie auth proxy
7. Persisted KPI API (`GET/POST /api/kpis`)
8. GitHub docs index APIs (`GET /api/docs`, `POST /api/docs/sync`)
9. Review entries APIs (`GET/POST/PATCH/DELETE /api/reviews`)
10. Review pages (`/admin/reviews/weekly`, `/admin/reviews/monthly`)
11. Review entry form pages (`/admin/reviews/weekly/[entryId]`, `/admin/reviews/monthly/[entryId]`)
12. Entity hub pages (`/admin/entities/unigentamos`, `/admin/entities/pngwn`, `/admin/entities/diyesu-decor`)
13. Editable entity focus goals (`GET/POST /api/entity-goals`)

## Environment

Create `.env.local`:

```bash
ADMIN_PASSWORD=change-me
GITHUB_TOKEN=
DOCS_REPOS=ocnbtl/projectfremen:main,pngwn-zero/pngwn-web:main,ocnbtl/projectpint:main
DOCS_MAX_FILES=120
SENTRY_AUTH_TOKEN=
SENTRY_ORG_SLUG=
SENTRY_PROJECT_SLUG=
SENTRY_API_BASE_URL=https://sentry.io/api/0
SENTRY_KPI_QUERY=is:unresolved
SENTRY_KPI_ENTITY=pngwn
SENTRY_KPI_NAME=Errors Reported in Sentry
```

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Notes

1. Auth is intentionally simple for MVP speed.
2. Replace auth with stronger mechanism before multi-user rollout.
3. `GITHUB_TOKEN` is optional but recommended to avoid rate limits while syncing docs.
4. KPI and docs data are stored in local `dashboard/data/*.json` for MVP.
5. Sentry KPI sync is optional and requires `SENTRY_*` env vars.
