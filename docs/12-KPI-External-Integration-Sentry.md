# KPI External Integration: Sentry (Phase 3)

This phase adds the first external KPI connector in a safe, non-destructive way.

## Scope

1. Connector target: Sentry unresolved issue count.
2. Data target KPI: `Errors Reported in Sentry`.
3. Default entity: `pngwn`.
4. Trigger: manual admin action from KPI panel.
5. Safety: no automatic overwrite unless admin clicks sync.

## API Surface

1. `GET /api/kpis/integrations/sentry`
   - Returns config status.
   - Example response fields: `configured`, `missing`, `entity`, `kpiName`.
2. `POST /api/kpis/integrations/sentry`
   - Requires admin session + CSRF token.
   - Pulls current unresolved issue count from Sentry.
   - Upserts KPI in local store.

## Required Environment Variables

```bash
SENTRY_AUTH_TOKEN=<REDACTED>
SENTRY_ORG_SLUG=<REDACTED>
SENTRY_PROJECT_SLUG=<REDACTED>
```

Optional:

```bash
SENTRY_API_BASE_URL=https://sentry.io/api/0
SENTRY_KPI_QUERY=is:unresolved
SENTRY_KPI_ENTITY=pngwn
SENTRY_KPI_NAME=Errors Reported in Sentry
```

## Behavior Notes

1. If env vars are missing, sync is disabled and UI shows missing keys.
2. Sync writes value as a simple number string (e.g. `17`).
3. KPI link is set to Sentry issues page for the configured org/project.
4. Sync activity is logged to `dashboard/data/audit-log.json`.

## Verification Checklist

1. Login to `/admin`.
2. Open KPI Tracker.
3. Confirm Sentry status line:
   - `Sentry sync ready.` when configured.
   - `Sentry sync disabled. Missing: ...` when not configured.
4. Click `Sync Sentry Errors KPI`.
5. Confirm KPI value and timestamp update.

