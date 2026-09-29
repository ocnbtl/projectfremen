# Authenticated product implementation review

Local implementation, September 28, 2026. This is an implementation and verification record, not release approval. The public landing-page source is preserved. No production deployment, provider-account changes, invitations, external calendar writes, or production-data tests were performed.

## Implemented experience

| Surface | Implemented behavior |
| --- | --- |
| Shared shell | Compact workspace identity, coordinated search/filter/sort controls, responsive module menu, stable navigation and tab indicators, common buttons/sheets/feedback, preserved focus, application and system reduced motion. Map and Calendar use the existing theme and icon registries. |
| Projects | Directory/detail reference, one view count, concise objectives and next work, Overview/Activity/Links/Properties, contextual actions, phone rows. Activity rows expose only working inspection and source routes. Existing specialized links and old deep-link aliases continue to resolve. |
| People | Identity-first profiles, readable supporting facts, working contact methods, incoming place/event/media/trip relationships. Organization relationships use their own canonical object type. |
| Notes | Rendered authored Markdown without raw HTML, readable prose measure, quiet previews, explicit source editing, supporting links/properties/history, proportioned directory and reading canvas. Older Attachments/Decisions/Review URLs select and label their corresponding Links/Properties parent tab. |
| Media | Encrypted canonical assets, real thumbnails, gallery/list, preview and download, manual record tags, optional JPEG GPS extraction, per-file transfer progress, durable pause/retry after quota failure, batch archive/restore and Undo. Drafts stay in session memory and clear on Vault lock. |
| Resources | Selected records receive the larger desktop pane; direct record URLs open phone details. Linked sections reflow without covering actions. Source identity and semantic fallbacks, actual selected icons, authored commentary, saved HTML previews in a sandbox without script execution, saved code and motion notes. Unsupported import/checking actions removed from the primary flow. |
| Reviews | Compact active-review structure and progress, full-width summary, one completion area, selectable saved summaries and consistent read-only completed/archived/canceled records, accessible history; future-template placeholders removed from the main view. Existing legacy read-only records retain their explicit boundary. |
| Finance | Central chart/transaction scope, fewer repeated totals, readable numbers and controls, explicit archive sheet. Existing accounting, evidence, concurrency and restore safeguards retained. |
| Personal | Coordinated controls, labeled destinations, fewer competing summaries; trips retain Personal ownership and IDs with Map/Calendar routes. |
| Vault | Compact identity and record toolbar, synchronization status beside the title, section links in More, detailed storage information disclosed on demand, readable record controls. Encryption, recovery, history and device workflows retained. |
| Command Center | Stored Calendar agenda, bounded actionable owner records, review suggestions identified separately from scheduled commitments, direct routes to owning workspaces. |
| Map | Worldwide street map and search, coordinates/pins, places, saved views, synchronized selection/list, clustering, photo locations, ordered trip stops, route estimates, demographic legends and accessible regional results. |
| Calendar | Day/week/month/agenda, local calendars and colors, all-day/multi-day events, recurrence/exceptions, time zones, linked participants/places/media/work, drag creation/move, keyboard and pointer resizing, dense overlap search, ICS import/refresh and inbound connections, local overrides, in-app snooze/dismiss reminders. |

## Visual and interaction decisions in the code

`app/workspace-system.css` scopes the new system to authenticated surfaces. It defines the shared rem type sizes, palette, controls, geometry, focus and motion variables. Module styles were edited in place where their old structure or type hierarchy was superseded. Specialized layouts remain in their own module styles; this is not a replacement of all legacy stylesheets.

Workspace headings use Plus Jakarta Sans; interface copy and prose use Inter. Numeric comparison uses tabular figures. Technical values retain monospace where meaningful. The tested shared ink, body, secondary, navy, moss and indigo colors exceed 4.5:1 on white and the application canvas. The secondary/canvas combination is approximately 4.54:1, so lighter variants are not used for essential small text.

Selected records use restrained surfaces, with labels retained. Gradients, decorative placeholders, oversized introductions, repeated metric strips and unavailable primary actions were removed from the changed workflows. Missing photographs use initials or a type icon. Authored HTML resources are isolated from the application rather than executing their code in the workspace.

`lib/design-system/motion.ts` and shared CSS tokens provide the 80/120/180/260/320 ms timing system and explicit map focus up to 450 ms. Navigation and detail-tab markers move in reserved space. Sheets own focus and do not restore it behind a replacement dialog. Calendar date navigation is a short directional fade; map movement follows explicit selection/focus actions. Inputs and selection do not wait for animation. Reduced motion disables spatial movement while retaining feedback.

Phone review at 390 × 844 puts the first Projects row at approximately 241 px and first Calendar event at approximately 261 px with the current synthetic fixtures. Controls use readable inputs and larger touch targets. Map attribution and zoom controls have separate clearance from the assistant.

## Connected records and persistence

- `planning-records.json` is a new additive, versioned store. Reads initialize an in-memory default without rewriting legacy records. Repeated initialization and future-version rejection are tested.
- Places, calendars, events, connections, local overrides, reminders and saved map views use stable identities, authenticated/CSRF-protected operations, bounded validation, audit events and optimistic concurrency.
- Trips are extended in the existing Personal store with optional stops and route/leg information. Their canonical ownership and identifiers are unchanged. Offline updates use the existing encrypted command queue; conflicting coordinates, times or stop orders require review.
- Media uses the existing encrypted chunk transport and a canonical file owner. Gallery, Map and linked records refer to the same asset identity. Pausing upload is operational state and persists even when authored content has not changed. User-facing history still collapses synchronization-only checkpoints.
- Calendar source records retain connection/calendar/event/occurrence identity. Local changes remain overrides. Complete successful feed fetches can identify removal; failed or partial provider results do not delete stored events. Morgen verifies absent events individually before accepting cancellation.
- Calendar connections can pause/resume inbound updates while retaining imported records. Automatic refresh runs only while the application is open and visible, with a server cooldown. Reminders deliver inside the app, including missed reminders from the past 30 days; there is no OS/background notification delivery claim.
- Provider credentials stay server-side. Feed requests use bounded HTTPS transport, redirect limits and public-address checks. Public demographic caches are separate from private canonical stores.

## Verification evidence

All fixtures are isolated from production. Evidence is under `dashboard/output/workspace-review` and `dashboard/output/playwright`; recordings are WebM files in their recording subdirectories.

| Check | Result |
| --- | --- |
| Typecheck and optimized production build | Passed, including the final Calendar import and read-only Review corrections. |
| Planning behavior harness | 21 checks passed: daylight saving, UTC recurrence end, zones, mixed-zone ICS end times and detached occurrences, all-day spans, exceptions, overlaps, imports/deduplication, overrides/cancellations, request boundaries, provider failure preservation, stale writes, offline conflicts, additive storage, and isolated backup restoration. |
| Encrypted Media browser harness | Passed: varied synthetic image gallery, person/place/event/trip links, stable selection, archive/Undo, canonical sync, reopen, identical downloaded bytes. Quota failure, durable pause across navigation and successful retry are exercised. Also passed an event created offline, retained in the encrypted queue and synchronized once to its Calendar owner. Real crypto and canonical API; encrypted relay is mocked. |
| Vault model and crypto harness | Passed: canonical fields and relationships, protected operations, merge/reconciliation, clock correction, encrypted synchronization, media retention and backup checks. |
| Vault browser harness | Passed: guided setup, recovery, append-only history, encrypted media cleanup/redownload, cross-device synchronization, repair, offline reload and offline save. Browser device emulation, not physical iOS. |
| Visual review | Representative desktop and phone screenshots for Projects, Notes, Media, Map and Calendar; desktop coverage also includes People, Reviews, Resources, Finance and Personal. No document overflow or page errors in the recorded route sweep. |
| Interaction review | Passed replacement-dialog focus, recurring reminder occurrence links, error-versus-empty reminders, map control/attribution clearance, 768/1024/1280 px layouts, and effective zoom-width reflow simulation. |
| Performance fixture | 1,000 events and 1,000 places: warm local development measurements approximately 115 ms map filter, 41 ms place selection, 227 ms overlap opening, 32 ms overlap search and 31 ms calendar filter. These are regression observations, not production guarantees. |
| Production bundle isolation | Passed five fresh route contexts: Projects, Notes and Finance load neither Map nor Calendar heavy runtime; Map and Calendar each load only their own. Event validation is supplied by Calendar so it remains available offline. |
| Contrast | Twelve shared text/surface combinations passed 4.5:1. This does not certify every legacy module color combination. |
| Broad regression suite | 143 checks passed; 2 expected skips for external GitHub Docs sync and Sentry sync. Assertions for intentionally replaced UI follow current behavior; protection and persistence checks remain. The final read-only Review refinements have additional focused browser coverage below. |
| Read-only Review lifecycles | Completed, archived and canceled fixtures passed: long selectable summaries, guarded edit/reconciliation entry points, preserved owner routes, one phone Close, section navigation closes the panel, zero mutations and no browser errors. |
| Icon registry and sprite | 420 icons validated. Every role has five distinct Style Guide options. The nine existing module definitions are unchanged; isolated read/save/reload and browser checks preserve saved selections, Resource links and palettes while adding Map/Calendar. |

The Impeccable detector returned no findings in its one permitted run. A separate reviewer inspected the representative compositions and actual interaction sequences. Reported focus, reminder, phone density, attribution, record-pane width and duplicate-close and completed-review hierarchy issues were corrected. The corresponding browser workflows were rerun. Still screenshots supplement, rather than replace, interaction and persistence tests.

## Limits requiring live or physical verification

- Physical iPhone/iPad Safari, actual mobile keyboard behavior and native browser zoom have not been verified. Viewport emulation and effective CSS-width reflow are labeled as simulations.
- Morgen requires an eligible account and server API key; Openrouteservice and US Census adapters need their configured server keys. No keys or entitlements were activated. Live provider quota, entitlement and end-to-end refresh checks remain release dependencies.
- Morgen refresh currently covers the previous and next 30 days and labels this coverage in the connection UI. It is not a full historical archive or arbitrary-range synchronization.
- Recurrence supports daily/weekly/monthly/yearly rules, exceptions, EXDATE and RDATE, including moved instances. Unsupported multi-rule/custom-time-zone feed constructs are rejected explicitly rather than guessed.
- Optional embedded photo location extraction currently covers JPEG EXIF. HEIC/video geolocation extraction is not implemented.
- The large fixture check covers Calendar and Map; it is not a thousand-large-file encrypted Media benchmark. Gallery verification uses clearly labeled synthetic images with varied dimensions.
- Existing specialized legacy routes retain their honest ownership/read-only boundaries. Future rights/review automation and native notification delivery are not introduced as working tools.

## Release preparation and rollback boundary

No deployment has occurred. Keep the current build and generated MapLibre worker/shared module together; `prebuild` and `predev` prepare the vendor assets from the pinned package and retain its license.

Before a later authorized release: take a verified backup of canonical data plus the encrypted Vault/companion/relay state; record active schema versions and pending commands; run the final regression/build gates; exercise configured providers and physical devices; then rehearse rollout and rollback against a separate copy. Existing IDs and records must be compared before and after.

An isolated planning-file backup/restore/reapply rehearsal passed. This verifies byte-for-byte local planning restoration and stable IDs, not a production multi-device rollback. After new edits have synchronized, rolling back application code alone is insufficient: older clients may not understand new planning commands. Preserve the complete newer data and queue state, stop further writes under release control, and reconcile or restore a matched snapshot. Never discard pending device edits or reset stores to make rollback appear clean.

## Source references

- [OpenFreeMap integration](https://openfreemap.org/quick_start/)
- [MapLibre documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [Morgen authentication](https://docs.morgen.so/authentication) and [events](https://docs.morgen.so/events)
- [Census API key guidance](https://www.census.gov/data/developers/guidance/api-user-guide.API_Key.html)
- [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

## Reproducing the local checks

Run from `dashboard` using `npm.cmd` on Windows:

```text
npm.cmd run typecheck
npm.cmd run icons:check
npm.cmd run test:planning
npm.cmd run test:vault
npm.cmd run build
npm.cmd run test:vault-browser
node scripts/workspace-media-browser-harness.mjs
node scripts/workspace-bundle-review.cjs
node scripts/workspace-review-lifecycle-harness.cjs
node scripts/style-guide-icon-harness.cjs
npm.cmd run regress
```

The browser harnesses above use isolated stores. The visual, interaction and performance review scripts use the separate synthetic preview on port 3198. Their captures include missing images, long titles, overlapping events, dense records and provider failure states; they are evidence fixtures, not customer records or performance promises.

## Local review

The isolated preview is `http://127.0.0.1:3198/admin/projects`; its test-only password is `local-design-fixture`. It uses synthetic records and a temporary data directory. Start another isolated preview with `node scripts/workspace-preview.cjs` when port 3198 is free. Never point these fixtures at production data.
