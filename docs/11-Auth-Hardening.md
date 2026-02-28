# Auth Hardening (Phase 2)

This document records the Phase 2 security hardening applied after deployment stabilization.

## Implemented Controls

1. Login rate limiting:
   - Scope: `/api/admin/login`
   - Strategy: in-memory IP-based throttle
   - Window: 10 minutes
   - Max failed attempts before block: 8
   - Block duration: 15 minutes
2. CSRF protection for state-changing admin APIs:
   - Cookie: `admin_csrf`
   - Header requirement: `x-csrf-token`
   - Validation: header token must match cookie token
   - Applied to:
     - `POST /api/kpis`
     - `POST /api/docs/sync`
     - `POST/PATCH/DELETE /api/reviews`
     - `POST /api/entity-goals`
3. Same-origin login request check:
   - `Origin`/`Referer` must match request origin when present
4. Minimal audit logging:
   - Local file: `dashboard/data/audit-log.json`
   - Retention cap: latest 500 events
   - Events include login attempts, CSRF failures, and successful write actions

## Notes

1. `admin_csrf` is issued on successful login and also backfilled by `proxy.ts` for valid admin sessions.
2. Audit logging is fail-open by design (if write fails, request flow continues).
3. `dashboard/data/audit-log.json` is ignored in `dashboard/.gitignore` to avoid accidental commits.

## Known Limitations

1. Rate limit state is in-memory only:
   - resets on server restart/deploy
   - not shared across multiple server instances
2. This is still single-founder auth (no RBAC/user accounts yet).
3. No external SIEM/log shipping yet.

## Verification Targets

1. Unauthenticated API reads stay blocked with `401`.
2. Write endpoints without CSRF header return `403`.
3. Write endpoints with valid CSRF header succeed.
4. Admin review/KPI/entity/docs write flows continue to work from UI after login.

