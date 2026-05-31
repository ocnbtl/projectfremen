# Personal Systems Expansion Plan

## Summary

Project Fremen / Unigentamos will expand from a project operations dashboard into a broader founder-only personal operations layer. The expansion must attach to the existing admin command center without replacing the current project workflow, auth model, Supabase-backed persistence, Current Goals behavior, or home/navigation decisions.

The first implementation slice is deliberately narrow: a protected Personal Ops shell, static domain map, privacy guardrails, and Obsidian/source-inventory framing. It does not ingest finance, family, job, travel, or other sensitive data.

## Locked Constraints

1. No middleware or proxy auth.
2. No auth redesign unless explicitly requested.
3. No weakening of Supabase, RLS, service-role, CSRF, or server-side route protection.
4. No regression of Current Goals autosave, sync, completion, or home/entity behavior.
5. No reversal of the current admin home, entity nav, review shortcuts, or button/link decisions.
6. No new public routes, production network calls, or Supabase schema changes in the first personal-system slice.

## Information Architecture

The new area is `/admin/personal`, protected by the existing `requireAdminSession()` pattern. It is a founder-only surface for daily-life systems and should remain visibly distinct from the current three project lanes.

Initial domains:

1. AI monitoring: session records, output tracking, decisions, follow-up actions.
2. Notes and docs: Obsidian-linked thoughts, durable notes, and document references.
3. Finance: high-level summaries and graph-ready aggregates only after storage rules exist.
4. Family: private notes and reminders only after boundaries are explicit.
5. Jobs and applications: history, pipeline, stages, materials, and archive rules.
6. Travel: itinerary state, locations, bookings, constraints, and future map/globe views.
7. University notes: searchable or curated archive access.
8. Related systems: a holding area for repeated workflows that later deserve modules.

## Data And Privacy Model

The first slice uses static configuration only. It should not write new personal data, read local Obsidian folders, call external services, or add Supabase keys/tables.

Before any real data ingestion, each domain needs:

1. Source of truth: Obsidian, Supabase, local files, external service, or manual entry.
2. Sync direction: read-only, export-only, bidirectional, or dashboard-native.
3. Sensitivity class: reference, private, or sensitive.
4. Persistence decision: no storage, existing blob store, new logical key, or future normalized storage.
5. Failure behavior: what the UI shows when a source is missing or unavailable.

Sensitive domains such as finance, family, and job history should default to no ingestion until the storage and access model is intentionally approved.

## Phasing

Phase 1: protected shell and architecture baseline.

1. Add `/admin/personal`.
2. Add a lower admin-home entry point.
3. Add static domain definitions and guardrails.
4. Extend the regression harness to check protection and rendering.

Phase 2: source inventory.

1. Inventory Obsidian vault folders and candidate source documents.
2. Decide per-domain sync direction.
3. Document which data stays in Obsidian and which appears in the dashboard.

Phase 3: first real module.

Recommended first module is travel or notes/docs because both are useful without connecting sensitive account data. Finance and family should wait until privacy rules are stronger.

## Test Plan

1. `npm run regress` remains the local release gate.
2. The harness must keep checking landing/login, unauthenticated API protection, admin login/logout, Current Goals persistence and sync, KPI save/read, weekly review create/update, docs index, Obsidian preview/dry-run, and Sentry status.
3. Personal Ops checks should verify unauthenticated redirect, authenticated rendering, and the admin home entry point.
4. GitHub docs sync POST and Sentry sync POST remain intentional skips unless a networked integration run is explicitly requested.
