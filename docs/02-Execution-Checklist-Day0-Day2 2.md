# Day 0 to Day 2 Execution Checklist

This is the immediate runbook to start implementation now.

## Day 0 (Today) - Setup and Alignment

1. Confirm repo targets:
   - `pngwn-zero/pngwn-web`
   - `ocnbtl/projectpint`
   - `ocnbtl/projectfremen` (new)
2. Initialize local git in this repo if not already initialized.
3. Create and push new remote `projectfremen`.
4. Verify SSH/account setup for both GitHub identities (if both are used).
5. Confirm first KPI set (defaults provided in `docs/04-KPI-Starter-Set.md`).

Exit criteria:
1. `projectfremen` remote exists.
2. This plan pack is committed.
3. Dashboard scaffold directory exists.

## Day 1 - Dashboard MVP Foundation

1. Configure app shell in `dashboard/`.
2. Implement login gate for `/admin`.
3. Implement Action Center page with seed tasks.
4. Implement project cards for:
   - Unigentamos
   - pngwn
   - Ranosa Decor
5. Add rotating welcome header text options.

Exit criteria:
1. `/admin` route exists and is gated.
2. Homepage and admin views render.

## Day 2 - Docs and KPI Backbone

1. Add simple document index ingestion contract (GitHub metadata first).
2. Add docs table UI with search and filters.
3. Add KPI input form and weekly snapshot cards.
4. Add weekly/monthly review reminders on calendar panel.
5. Create issue/risk and decision placeholder lists.

Exit criteria:
1. You can run weekly review steps from the dashboard.
2. No manual memory required for "what to review next."

## Blockers That Require Your Input

1. GitHub repo creation for `projectfremen` (if not created yet).
2. Final preferred brand names as displayed in dashboard nav.
3. Optional custom welcome copy additions.
