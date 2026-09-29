# Authenticated product review release

## Release identity

- Authority: Ocean explicitly requested publishing all accumulated implementation changes to production for review and testing on September 28, 2026.
- Repository: `ocnbtl/projectfremen`; local working branch `codex/vault-sync-recovery`; production branch `main`.
- Target: existing Vercel project `projectfremen`, Unigentamos team, root `dashboard`, Node 24.x, `https://unigentamos.com`.
- Scope: authenticated product redesign, connected Media, Map and Calendar, shared motion and controls, saved module icon preservation and Style Guide options. Public landing source is unchanged.
- Exclusions: user-owned continuation packet, local evidence/fixtures, secrets, production record mutations, provider purchases/activation, external calendar writes and invitations.
- Baseline: commit `cf8d280aa4fd3d283d41654ffbb693c74070b93d`, Ready production deployment `dpl_8ZBcAZeMHSHTN2FMN2QxPFZx3GZY`, `projectfremen-ijut3aj9t-unigentamos.vercel.app`.

## Launch matrix

| Category | Check | Criticality | Status | Evidence | Owner | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| Source | Correct repository, production branch, linked project and baseline | Critical | Passed | Git remote SHA and Vercel authenticated CLI/API agree on baseline | Codex | Release by fast-forward push; no force push |
| Functionality | Existing workflows plus new storage, recurrence, imports and encryption | Critical | Passed | Fresh 143-check regression, 21 planning checks and Vault model/crypto harness | Codex | Two expected external GitHub/Sentry sync skips |
| Visual | All authenticated modules, desktop/phone, dense/incomplete fixtures and motion | High | Passed | Implementation report and recorded browser review; focused fixes reverified | Codex | User will review actual preferred layouts live |
| Accessibility | Keyboard, focus restoration, readable contrast, reflow and reduced motion | High | Passed | Local interaction review and shared contrast checks | Codex | Physical iOS and assistive-technology breadth remain unverified |
| Discovery | Approved public landing retained; private workspaces behind authentication | High | Passed | Public landing source unchanged; protected route checks | Codex | No new public marketing or indexing scope |
| Performance | Production build, lazy Map/Calendar runtime, failure handling | High | Passed | Fresh regression typecheck/build; isolated bundle/performance/failure harnesses | Codex | Local measurements are not field-performance guarantees |
| Security/privacy | Auth, CSRF, validation, private persistence and dependencies | Critical | Passed | Regression security paths; production RLS; private media bucket; npm production audit: zero advisories | Codex | Supabase informational no-policy findings are intentional deny-by-default server-only relay tables |
| Analytics | Existing Vercel analytics preserved | Low | Not applicable | No analytics/conversion changes or new tracking in release | Ocean | No new collection or live conversion tests |
| Operations | Recovery point, store inventory and device acknowledgements | Critical | Passed | Encrypted server snapshot verified byte-for-byte; 115 app-state rows, 2 relay envelopes, 4 devices, 0 compactions, 0 stored encrypted media objects | Codex | Last reported device queues are empty; offline unsent device state cannot be inferred from server timestamps |
| Deployment | Correct production environment and durable storage | Critical | Passed | Vercel production variables by name; healthy Supabase project and existing encrypted bucket | Codex | No SQL migration or configuration change required |
| Content/authority | Explicit review-release authority and protected chosen icons | Critical | Passed | User request; nine-role preservation harness; original registry choices remain unchanged | Ocean | No new claims or decorative/sample customer data shipped |
| Data integrity | Additive planning state, stable IDs and compatibility | Critical | Passed | No database schema change; existing store files unchanged by release process; isolated backup/reapply harness | Codex | Do not restore an old snapshot over subsequent user edits |

## Review limitations

This is the user-requested production review release, not certification of every device/provider combination. Physical iPhone/iPad Safari and native keyboard behavior remain for device review. Morgen entitlement/API access, Openrouteservice and Census credentials are absent in production; those integrations report their unavailable state. OpenFreeMap, local events, ICS import and saved records remain independently usable. No paid service or integration account has been activated.

The existing implementation report records recurrence/import boundaries, JPEG-only optional GPS extraction, in-app-only reminders and the Morgen 30-day window. Live save/import/synchronization tests will be performed by the owner; automated production checks are read-only apart from normal authentication/audit effects. Isolated suites verify record writes and encrypted media transfer.

## Recovery and observation

The pre-release snapshot is encrypted with Windows DPAPI for the current Windows user and is excluded from Git/deployment. Its manifest and integrity check are in the ignored release-evidence directory. It contains all server app-state rows and encrypted relay/device/compaction records; the media bucket is empty. It does not claim to back up unsent edits on disconnected devices.

Before new-format user writes, the previous Vercel deployment is the immediate code rollback target: `vercel rollback dpl_8ZBcAZeMHSHTN2FMN2QxPFZx3GZY --scope unigentamos`. Prefer a forward fix once new events, trips or media have been edited. Preserve current records and pending commands before any rollback; an older application may not understand new planning commands or trip fields. Never delete queues or reset user stores to simplify rollback.

Codex owns the release observation in this session: confirm the deployed SHA and aliases, smoke-test public/authenticated routes, inspect runtime errors and private API responses, check Map assets and Calendar controls, compare stored fingerprints, and report any limitation. Ocean owns subsequent product/device review. No recurring monitor is created.

## Pre-deployment decision

GO TO DEPLOY the requested review release. Baseline production sign-in, Projects, People and Finance returned working pages without failed network responses or overflow. The old deployment emitted three recoverable React text-hydration warnings; these are recorded as pre-existing and will be checked against the new artifact. No destructive migration, persistent-store rewrite, key rotation or provider activation is part of this deployment. Final deployment coordinates and production verification are recorded in the release evidence and user-facing completion message.
