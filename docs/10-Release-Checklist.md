# Release Checklist (Vercel)

Use this checklist for every production release.

## Preflight

1. [ ] Worktree reviewed:
   - `cd "/Users/ocean/Documents/Project Fremen"`
   - `/usr/bin/git status -sb`
2. [ ] No secret values in tracked files.
3. [ ] Required env vars exist in Vercel:
   - `ADMIN_PASSWORD`
   - `DOCS_REPOS`
4. [ ] Local verification passed:
   - `cd "/Users/ocean/Documents/Project Fremen/dashboard"`
   - `npm run typecheck`
   - `npm run build`

## Release

1. [ ] Push to `main`:
   - `cd "/Users/ocean/Documents/Project Fremen"`
   - `/usr/bin/git push origin main`
2. [ ] Confirm Vercel deployment status = `Ready`.
3. [ ] Confirm production domain `https://unigentamos.com` serves latest deployment.
4. [ ] Record deployment URL and commit hash.

## Smoke (Production)

1. [ ] `GET https://unigentamos.com/` returns `200`.
2. [ ] `GET https://unigentamos.com/admin/login` returns `200`.
3. [ ] Unauthenticated `GET https://unigentamos.com/api/kpis` returns `401`.
4. [ ] Founder login succeeds and redirects to `/admin`.
5. [ ] Weekly review create/edit/delete succeeds.
6. [ ] Monthly review create/edit/delete succeeds.
7. [ ] Docs sync updates `lastSynced`.

## Rollback Criteria

Rollback immediately if any item below fails:
1. [ ] Login flow broken.
2. [ ] Admin pages inaccessible after auth.
3. [ ] Review create/edit/delete fails.
4. [ ] API auth guard fails (unexpected 200 while unauthenticated).

## Rollback Action

1. [ ] Promote prior healthy Vercel deployment to production.
2. [ ] Re-run smoke checks.
3. [ ] Document incident and root-cause follow-up.
