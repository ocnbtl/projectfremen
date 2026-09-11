# Finance history planning and review

The Finance workspace uses the shared People navigation rhythm, action placement and draggable Assistant. Smart views separate transaction review, upcoming payments, budget overruns, recurring commitments and transfers. The overview compares posted income and spending by month, provides exact amounts and links to transactions, and labels incomplete history.

## Planning contract

`POST /api/finance` supports `preview_plan` and `apply_plan` through the existing admin authentication, CSRF and private/no-store boundary. Apply requires an idempotency key and the current preview fingerprint. The server regenerates the proposals and writes them atomically through the Finance store's compare-and-swap boundary. Stale previews are rejected without partial writes; retries return the original receipt. No direct database writes or provider permission changes are involved.

Starter budgets use up to three complete observed months, excluding the first partial month, the current month, transfers and pending payments. Amounts round up to $5 and cover detected recurring charges. Grouping leaves original bank categories intact. These limits describe imported spending, not verified income or affordability, and remain editable.

Recurring reminders require at least two posted payments with monthly timing and suitable categories. Ordinary repeated purchases, one-off charges, fees and transfers are excluded. Variable utility amounts use the recent average. Dates are estimates; inferred reminders do not assert a debt, paid status or autopay enrollment. Each generated budget and bill retains source transaction IDs and its calculation basis.

Batch approval changes `reviewed` only. Bank settlement, duplicate matching, monthly close checks and bill payment evidence remain separate. A durable planning receipt records the actor, source snapshot, exact affected IDs and counts; per-record audit events preserve before/after provenance.

## Verification and authority

Authorized scope: read-only Finance/People inspection, local implementation, proposal generation, audited Finance record creation and bulk review approval, and the scoped production release. Payments, transfers, trades and external communications are outside this change.

Validation on 2026-09-11: production build/type checking and 143 regression checks passed (two existing external Docs/Sentry sync checks skipped); eight planning checks passed, including stale/concurrent updates, atomicity, idempotency, overlap prevention and pending-status preservation. Finance redesign, banking (15), Coinbase (12), and Investments (12) checks passed. Provider tests use mocks. Isolated HTTP checks verified 401/403/400/409 boundaries. Browser coverage includes four viewport sizes and Assistant dragging, plus synthetic planning/approval readback.

The design detector's two typography warnings were accepted to preserve the user's established Inter/Plus Jakarta Sans design system. Restoring the shared Assistant does not configure its currently disconnected model bridge.

## Recovery

Use the planning receipt's IDs for targeted recovery through audited Finance updates. Generated budgets and bills can be archived, and reviewed flags can be restored through normal record updates. Do not restore an old database snapshot over subsequent bank syncs. Before rolling back to code that predates grouped budgets, archive those generated budgets or retain compatible grouping support; otherwise old views would not calculate their spending correctly. No database migration is required.
