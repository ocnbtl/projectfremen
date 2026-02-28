# Deployment Runbook (Vercel)

This runbook is for deploying Project Fremen (`dashboard/`) to Vercel with safe, non-destructive steps.

## Status

1. Hosting target: **Vercel (CONFIRMED 2026-02-28)**.
2. Production branch: `main` (**CONFIRMED 2026-02-28**).
3. Staging environment: **Not used currently (CONFIRMED 2026-02-28, founder-only)**.
4. Production domain: `unigentamos.com` (**CONFIRMED 2026-02-28**).

## Security Rules

1. Never paste secrets into docs, commits, issues, or PR comments.
2. Only use environment variable names in logs/checklists.
3. Redact values as `<REDACTED>` when sharing screenshots/output.

## One-Time Vercel Project Setup

1. Open Vercel Dashboard -> `Add New...` -> `Project`.
2. Import GitHub repo: `ocnbtl/projectfremen`.
3. Configure project:
   - Framework: `Next.js`
   - Root Directory: `dashboard`
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: leave default (`.next`)
   - Production Branch: `main`
4. Add Environment Variables in Vercel Project Settings:
   - `ADMIN_PASSWORD` (required)
   - `GITHUB_TOKEN` (recommended)
   - `DOCS_REPOS` (required for docs sync behavior)
   - `DOCS_MAX_FILES` (optional, default `120`)
5. Save and trigger first deploy.

## Environment Variables (Values Redacted)

Copy names from `dashboard/.env.example` only:

```bash
ADMIN_PASSWORD=<REDACTED>
GITHUB_TOKEN=<REDACTED_OPTIONAL>
DOCS_REPOS=ocnbtl/projectfremen:main,pngwn-zero/pngwn-web:main,ocnbtl/projectpint:main
DOCS_MAX_FILES=120
```

## Pre-Deploy Local Gate (Required)

Run exactly:

```bash
cd "/Users/ocean/Documents/Project Fremen/dashboard"
npm install
npm run typecheck
npm run build
```

Expected:
1. `typecheck` exits `0`.
2. `build` exits `0`.
3. No secret values printed.

## Deployment Procedure (Normal Release)

1. Ensure target commit is on `main`.
2. Push commit:

```bash
cd "/Users/ocean/Documents/Project Fremen"
/usr/bin/git status -sb
/usr/bin/git push origin main
```

3. Wait for Vercel production deployment to finish.
4. If deployment fails, stop and execute rollback section below.

## Post-Deploy Smoke (Production URL)

Primary URL:

```bash
https://unigentamos.com
```

If DNS propagation is in progress, also test the current Vercel production URL shown in the Vercel dashboard.

```bash
curl -I "https://unigentamos.com/"
curl -I "https://unigentamos.com/admin/login"
curl -i "https://unigentamos.com/api/kpis"
```

Expected:
1. `/` returns `200`.
2. `/admin/login` returns `200`.
3. unauthenticated `/api/kpis` returns `401`.

Manual browser smoke:
1. Login with founder password.
2. Confirm redirect to `/admin`.
3. Create + delete one weekly review entry.
4. Create + delete one monthly review entry.
5. Run `Sync From GitHub` and verify `Last sync` updates.

## Rollback (Vercel)

1. Open Vercel Project -> Deployments.
2. Select most recent known-good deployment.
3. Use `Promote to Production` (or rollback action shown by Vercel UI).
4. Re-run production smoke checks:
   - `/` 200
   - `/admin/login` 200
   - unauth `/api/kpis` 401
5. Document rollback reason and affected commit hash.

## Incident Notes Template

Record after each release:

1. Date/time (UTC + local).
2. Commit hash deployed.
3. Deployer.
4. Smoke results (pass/fail per endpoint).
5. Rollback needed: yes/no.
6. Follow-up actions.
