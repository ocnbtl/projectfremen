# People autofill

The sparkles action beside Communication in a person's Properties or New Person uses the website and social profile links in that form. It fills missing About, birthday, and link fields and adds occupations and education. Details remain editable until Save. Existing values are preserved; repeating autofill merges matching jobs and education instead of duplicating them.

Save creates or reuses the employer and school Organizations and attaches their stable IDs to the occupation and education entries. This runs in the same compare-and-swap mutation as the person. An ambiguous existing organization requires an explicit selection. Removing or renaming an autofilled entry cancels its proposed organization creation. Canceling the person form creates nothing. Save requires the current record version for existing people, and source links are retained in the person and newly created organizations' external sources.

Public profile extraction uses [Person structured data](https://schema.org/Person), including explicit employer/role and alumni affiliations, identity links, and explicitly attributed biography sentences. An alumni affiliation does not imply a particular degree. Birthday needs a published month/day; no year is derived from an age. Conflicting birthday/link values are left empty. About uses up to two published biography sentences, or a brief summary of a published occupation. Arbitrary page instructions are never executed.

The endpoint is admin-only, CSRF protected, and private/no-store. It accepts up to six seed links, visits at most eight connected public pages within 20 seconds, limits each page to 1.5 MB, and reuses the existing DNS-pinned fetcher with private-network, redirect, protocol, byte, and timeout protections. It does not sign in to social sites. A blocked, unmatched, or unreadable page produces an explanation while keeping the form draft. Coverage depends on what the linked site publicly exposes; this is not a paid profile-data API or an authenticated LinkedIn integration.

New people default to **No cadence** (`NONE`) in the creation form, record API, and imports. The empty **Not set** cadence choice is removed. Legacy missing cadence values display as No cadence; explicit cadence choices and manually scheduled follow-ups remain intact. This change requires no destructive migration.

## Implementation scope and verification

Primary mode: LOCAL PRODUCT IMPLEMENTATION. Engineering mode: PRODUCT / ADMIN APPLICATION.

AUTHORIZED ACTION CLASSES: LOCAL_CODE_CHANGE for this People feature and its tests in Project Fremen, authorized by the current feature request; DEPLOY_OR_RELEASE to the existing Unigentamos production deployment, under the ongoing release instructions in this conversation. Supporting repository, application, provider, and deployment checks stay within these actions.

EXPLICITLY EXCLUDED ACTION CLASSES: standalone READ_ONLY_INSPECTION, PROPOSE_OR_QUEUE_MUTATION, SINGLE_RECORD_WRITE, BULK_WRITE_OR_MIGRATION, EXTERNAL_COMMUNICATION_OR_THIRD_PARTY_CHANGE. Implementing user-triggered future saves does not run autofill over existing production contacts or authorize unrelated data changes.

Focused verification: `npm run test:people-autofill` exercises identity matching, explicit facts, conflicts, no overwrite, idempotent merging, atomic organization creation/reuse, canceled suggestions, ambiguous organizations, stale saves, imported/default cadence, and API auth/CSRF/body/private-cache boundaries. Existing People transfer, People refinements, and Organization autofill harnesses guard their shared behavior. Typecheck and a production build remain required. Browser checks cover new/edit forms, default cadence choices, unavailable-source draft recovery, and desktop/mobile reflow.

Rollback: revert the feature commit and redeploy. Organizations created by subsequent explicit user saves remain ordinary recoverable People records; never delete or merge them automatically during a code rollback.

Verified 2026-09-12: People autofill, People transfer, People refinements, and Organization autofill harnesses passed. Production build and TypeScript passed. An isolated local browser session filled a public professional biography and occupation, saved and reopened the person, reran autofill without duplicating the occupation, and verified the Properties action. No cadence was the default with no Not set choice. Private-network input preserved the draft and produced a clear error. At 390 px, the page had no horizontal overflow and the autofill target measured 44 × 44 px. No production contacts were created or changed during these checks.
