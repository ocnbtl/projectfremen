# Individual accounts

The workspace account host uses Supabase Auth to verify email and password. The app then ends the provider session and creates a random 12-hour browser session. The browser receives an HttpOnly cookie. Supabase stores its SHA-256 digest, expiry and device label. The session directory lets the account holder revoke a single device. Password changes, account deletion or suspension invalidate existing app sessions.

## Configuration

Keep the existing Vercel deployment in legacy mode. On an isolated account host set `UNIGENTAMOS_AUTH_MODE=workspace`, `UNIGENTAMOS_ACCOUNT_ORIGIN` to the browser-facing HTTPS origin, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`) and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Apply the account migrations to the restored database. Configure the exact public `/account/confirm` URL in Supabase Auth's allowed redirects, enable email confirmations, and configure the email sender. Sign-up and recovery links must open in the browser that requested the email because it holds the short-lived PKCE verifier.

Use a separate origin for staging. Browser Vault data, an installed service worker and offline pages are origin-specific. Keep each enrolled Vault device's current origin available during rehearsal. Account mode serves `/account`, its workspace APIs and required static assets. It closes legacy dashboard, Vault, public booking and feed entry points. Unknown authentication modes close both surfaces.

## Ownership and access

The workspace creator receives an owner membership in the same database transaction as workspace creation. The owner can invite a confirmed email address as an editor or viewer, optionally with a membership deadline. The application generates a single-use link valid for up to seven days. The owner shares it with the recipient. Generating a replacement invalidates the earlier link. The signed-in recipient must accept it. An invitation cannot change an existing active membership. The owner can change a role, remove a member, or cancel a pending invitation. Ownership stays with the creator.

Workspace endpoints check the current session, workspace membership and role. Write requests also require a matching origin and CSRF token. Individual resources add audience and ownership checks. Private tables and privileged database functions are restricted to the server role. Include the legacy `app_state` grants, private Storage buckets and Storage policies in the restored-database access check before enabling public sign-up.

## Local rehearsal

Run `node scripts/workspace-account-browser.cjs` in the dashboard with its Playwright Chromium installed. It uses a loopback Auth fixture, in-memory PostgreSQL, and the account app in separate desktop and phone-sized browser contexts. To verify a staged installation, repeat account confirmation and recovery with the configured sender and callback origin. The local fixture never sends email. Supabase identities that require an additional enrolled authentication factor are denied until a second-factor challenge is available.
