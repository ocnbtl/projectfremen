# Unigentamos Admin Dashboard (MVP Scaffold)

This is the fast-start scaffold for the Unigentamos internal admin dashboard.

## Included

1. Landing page (`/`)
2. Admin login (`/admin/login`)
3. Admin dashboard (`/admin`)
4. Rotating welcome text component
5. Seed task and KPI cards
6. Basic founder-only cookie auth middleware

## Environment

Create `.env.local`:

```bash
ADMIN_PASSWORD=change-me
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
3. Next step is adding GitHub doc indexing + Postgres persistence.
