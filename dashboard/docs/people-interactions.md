# People interaction history

Interactions is a dedicated People view at `/admin/people?sidebar=interactions`, using the existing sidebar routing contract. The previous eight-item footer feed is removed from contact directories. Individual profile timelines retain their contextual history.

The view reads the existing interaction records, profile interaction entries and memories without copying or migrating them. Shared interactions appear once. Archived interaction records are excluded. Search covers titles, notes, participants, type and recorded dates; type filtering and chronological sorting remain in the URL. Month groups render 50 entries at a time with an explicit Show more action.

Selecting a row stores its original interaction ID in the URL and opens a right-hand detail panel. The native dialog provides focus containment and Escape dismissal, becomes full width on mobile, and shows complete notes, timing, participants, source and last-contact behavior. Participant buttons open their existing People or Organization profiles. Unknown or removed interaction links show an unavailable state. Existing Log interaction uses the original validated persistence path.

## Scope and verification

Primary mode: LOCAL PRODUCT IMPLEMENTATION.

AUTHORIZED ACTION CLASSES: LOCAL_CODE_CHANGE for the People interaction view and supporting navigation, styling and tests; DEPLOY_OR_RELEASE for Unigentamos production. Authority: the user's explicit request to implement this change and push it live. Target-bound source inspection, synthetic fixtures and read-only runtime verification support these actions.

EXPLICITLY EXCLUDED ACTION CLASSES: READ_ONLY_INSPECTION as an independent exploration task; PROPOSE_OR_QUEUE_MUTATION; SINGLE_RECORD_WRITE; BULK_WRITE_OR_MIGRATION; EXTERNAL_COMMUNICATION_OR_THIRD_PARTY_CHANGE. No live People records need modification for this release.

The regression harness covers the dedicated view, removal of the old footer, search/empty recovery, detail contents, selection reload, Back/Escape behavior and four viewport sizes alongside the existing People/profile/logging checks. Separate synthetic browser review uses 57 entries to exercise full-history access, legacy memories, type filtering, participant navigation and desktop/mobile presentation. Release proof requires a successful current build/test run, the exact remote commit, the matching ready production deployment and permitted live checks.

Rollback is a code revert and redeploy; there is no data migration or compensating record write. Older interaction links then fall back to the original People view. No changes to authentication, API validation, provider access, or record ownership are introduced.

## Interaction control refinement

The composer now uses a People calendar, 12-hour time wheels with AM/PM, a three-state Unspecified/Cold/Warm approach control, and a custom checkbox. Stored ISO dates, 24-hour time strings, optional approach and `updatesLastContact` keep the existing validation and save contract. The detail panel reuses profile photos with initials as fallback, and presents the saved last-contact setting as a read-only checkbox. History exposes Filter and Sort buttons like the directory; type, approach, and last-contact inclusion filters persist in the URL. Sorting accounts for times within the same date. The redundant visible record-count sentence is removed.

This refinement has the same authorized code/release scope above, from the user's explicit request to implement these controls and push them live. No live record writes are part of verification. Regression coverage exercises calendar keyboard navigation and leap dates, midnight/noon conversion, checkbox persistence through the existing save path, neutral approach, nested menu dismissal, and history filters at three viewports.
