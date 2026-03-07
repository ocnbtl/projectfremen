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
   - Logical key: `audit-log.json`
   - Persistence path: `lib/file-store.ts`
   - Production storage: Supabase `public.app_state`
   - Local fallback: `dashboard/data/audit-log.json` (or `/tmp` fallback when needed)
   - Retention cap: latest 500 events
   - Events include login attempts, CSRF failures, and successful write actions
5. Signed expiring admin sessions:
   - `admin_session` now uses signed, per-login token payloads with expiry
   - Signing secret source: `ADMIN_SESSION_SECRET` (or fallback to `ADMIN_PASSWORD`)
   - Legacy deterministic session tokens remain accepted for compatibility during transition
6. Logout API:
   - `POST /api/admin/logout` clears `admin_session` and `admin_csrf`
   - Requires existing session + valid CSRF token

## Notes

1. `admin_csrf` is issued on successful login and validated on all state-changing API routes.
2. Audit logging is fail-open by design (if write fails, request flow continues).
3. Admin protection intentionally stays page-level/server-side; do not reintroduce middleware auth casually.
4. `dashboard/data/audit-log.json` remains git-ignored for local fallback usage.

## Known Limitations

1. Rate limit state is in-memory only:
   - resets on server restart/deploy
   - not shared across multiple server instances
2. This is still single-founder auth (no RBAC/user accounts yet).
3. No external SIEM/log shipping yet.
4. Sessions are stateless; full revocation of all active sessions still depends on rotating `ADMIN_SESSION_SECRET` (or `ADMIN_PASSWORD` fallback).

## Verification Targets

1. Unauthenticated API reads stay blocked with `401`.
2. Write endpoints without CSRF header return `403`.
3. Write endpoints with valid CSRF header succeed.
4. Admin review/KPI/entity/docs write flows continue to work from UI after login.
5. Logout clears `admin_session` and `admin_csrf`.
