# Personal Systems Expansion Plan

## Summary

Project Fremen / Unigentamos will expand from a project operations dashboard into a broader founder-only personal operations layer. The expansion must attach to the existing admin command center without replacing the current project workflow, auth model, Supabase-backed persistence, Current Goals behavior, or home/navigation decisions.

The current Personal Ops direction is dashboard-native. New personal records are created and saved inside Unigentamos through the existing authenticated app persistence layer. Obsidian is no longer treated as the source of truth, import path, or export target for this personal layer.

## Locked Constraints

1. No middleware or proxy auth.
2. No auth redesign unless explicitly requested.
3. No weakening of Supabase, RLS, service-role, CSRF, or server-side route protection.
4. No regression of Current Goals autosave, sync, completion, or home/entity behavior.
5. No reversal of the current admin home, entity nav, review shortcuts, or button/link decisions.
6. No new public routes, production network calls, or Supabase schema changes for the current personal-record slice.

## Information Architecture

The new area is `/admin/personal`, protected by the existing `requireAdminSession()` pattern. It is a founder-only surface for daily-life systems and should remain visibly distinct from the current three project lanes.

Initial domains:

1. AI monitoring: session records, output tracking, decisions, follow-up actions.
2. Notes and docs: dashboard-native thoughts, durable notes, and document references.
3. Finance: high-level summaries and graph-ready aggregates only after storage rules exist.
4. Family: private notes and reminders only after boundaries are explicit.
5. Jobs and applications: history, pipeline, stages, materials, and archive rules.
6. Travel: itinerary state, locations, bookings, constraints, and future map/globe views.
7. University notes: searchable or curated archive access.
8. Related systems: a holding area for repeated workflows that later deserve modules.

## Data And Privacy Model

The current slice stores personal records in `personal-records.json` through the existing `file-store` abstraction. In production, that abstraction can persist through the existing Supabase `app_state` key-value table without adding schema or RLS changes.

Each personal record can have:

1. Primary domain.
2. Related domains, so notes/files/tasks can overlap across modules.
3. Type: note, task, event, file, decision, or metric.
4. Status: active, waiting, done, or archived.
5. Priority, date, link/file reference, tags, and body text.

Sensitive domains such as finance and family should use minimized, manual records. Account credentials, raw transaction feeds, medical details, and other high-sensitivity payloads remain out of scope.

## Phasing

Phase 1: protected shell and architecture baseline.

1. Add `/admin/personal`.
2. Add a lower admin-home entry point.
3. Add static domain definitions and guardrails.
4. Extend the regression harness to check protection and rendering.

Phase 2: source inventory and navigable domain detail.

1. Add protected domain detail pages.
2. Add native personal-record persistence.
3. Add record creation, status updates, related domains, tags, and link/file references.
4. Keep all Personal Ops APIs behind the existing admin session and CSRF checks.

Phase 3: first real module.

Recommended first module is travel or notes/docs because both can become useful immediately from native records. Finance and family can be used for minimized summaries and reminders while avoiding sensitive raw data.

## Test Plan

1. `npm run regress` remains the local release gate.
2. The harness must keep checking landing/login, unauthenticated API protection, admin login/logout, Current Goals persistence and sync, KPI save/read, weekly review create/update, docs index, Obsidian preview/dry-run, and Sentry status.
3. Personal Ops checks should verify unauthenticated redirect, authenticated rendering, record creation, record rendering, and the admin home entry point.
4. GitHub docs sync POST and Sentry sync POST remain intentional skips unless a networked integration run is explicitly requested.
