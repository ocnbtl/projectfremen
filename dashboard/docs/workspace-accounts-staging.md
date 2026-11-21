# Individual accounts and workspace storage

## Deployment boundary

Vercel continues to serve the existing application. Individual accounts use a separate origin, private workspace APIs and Supabase Auth. The existing single-admin modules use a shared document namespace. Their routes stay inaccessible in account mode until each module can enforce ownership for its reads, searches, mutations and exports. A workspace board brief is a text record. The existing Canvas editor still runs on the legacy host.

## Data to account for

| Source | Ownership and recovery |
| --- | --- |
| Supabase database | Restore the complete database into an isolated project, including identities and memberships, shared document data, link indexes, encrypted sync data and migration history. Preserve configuration and signing or encryption material separately. |
| Legacy account media | Inventory the private Supabase account-media bucket and match original chunks to each saved manifest. Keep the record ID, media ID, object ID, original file ID, exact length and SHA-256. Explicitly identify the owning workspace and author. |
| New shared media | Each catalog row identifies the workspace, uploader, stable IDs, audience, backend, length and hash. New writes require explicit R2 Standard configuration. The server authorizes originals, thumbnails, export copies and links separately. |
| Vault and desktop companion | Encrypted records, locally created media, pending uploads, recovery exports and companion envelopes can exist only on a device. Inventory them with their owner on the original device and browser profile. Keep the old origin usable for recovery. Never place an unencrypted copy of a Vault file into shared media automatically. |
| Embedded and referenced images | Check People, organization, project and pet photos, stored thumbnails, externally hosted logos and inline data in saved records. A count of account-media originals cannot establish their recoverability. |
| Canvas and Notes | Preserve the original documents. Canvas positions, annotations, categories, views and saved links belong to the document. A file manifest alone cannot recreate the board. The isolated rehearsal emits a separate inventory of Canvas and Notes media references. |

Supabase database backups exclude Storage object contents. Keep a separately controlled copy of both the database and the original files, with independent hashes and restricted access. [Supabase backup coverage](https://supabase.com/docs/guides/platform/backups)

## Configuration for the isolated account host

### Settings coverage

| Proposed settings | Available in this development round |
| --- | --- |
| 1, 4, 9 · Audience, sensitive records, shared links | Private defaults, workspace audiences, individual expiring grants and a sharing inventory. Each linked record or file has its own current access check. Finance, Health and People records have stricter sharing controls. |
| 2, 8 · Devices, recovery, members and guests | Account signup, confirmation, password recovery, session revocation, workspace roles and expiring invites. |
| 3, 10, 12 · Delivery channels, reminders, quiet hours and digests | Account inbox, per-category email and push preferences, reminder defaults and quiet windows. Email and push require an operator-configured sender, keys and delivery worker. |
| 5, 14 · Preference sync and accessibility | Account writing and daily preferences sync within each workspace. Reading size and contrast can differ by device. |
| 6, 13 · Backups, exports, restores and sync status | Scoped record export by type, non-overwriting restore preview, owner recovery history, incomplete workspace uploads and device Vault sync diagnostics. A record export contains links and text. Original file bytes have a separate backup. |
| 7, 11 · Regional settings and travel | Date and clock formats, first weekday, home zone, routine travel behavior and currency display in applicable native views. Keep the original currency of each financial amount. |
| 15, 18 · Search and navigation | Workspace record-type search scope, preferred landing area and distinct desktop/mobile pins. The existing Vault also has search type, archive and recent-query settings. |
| 16, 17 · Calendar and task capture | The existing Calendar supports default task kind, scheduling, destination calendars, reminder leads and its connection inventory. These integrations remain in the legacy application while native Calendar ownership is being migrated. |
| 19, 20 · Photo privacy and offline availability | Per-member workspace photo upload privacy, metadata-free photo exports, device Vault file pins, local cache size and retention. Select which modules this device adds when copying new workspace records to Vault. Previously saved records and changes arriving from other devices keep their encrypted history and sync behavior. |

### Operator settings

Use the restored Supabase project and a dedicated private staging bucket. Set `UNIGENTAMOS_AUTH_MODE=workspace`, `UNIGENTAMOS_ACCOUNT_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Use the same HTTPS origin in the reverse proxy and the Auth redirect allowlist. Configure email confirmation and recovery there. Set `FREMEN_REQUIRE_SUPABASE=true` and `FREMEN_ACCOUNT_MEDIA_BACKEND=supabase` for imported legacy media. Workspace mode rejects the legacy admin routes.

R2 needs `WORKSPACE_MEDIA_BACKEND=r2-standard`, the bucket name, account ID and bucket-scoped credentials from the environment template. Restrict bucket CORS to the staging origin and the upload headers documented in [account media](account-media.md). A new workspace has zero upload allowance until configured. Local filesystem fixtures require an explicit test backend.

The quota applies to the combined workspace. Finalized originals count toward used bytes. Unfinished uploads hold reserved bytes. Retries and changes of audience do not consume a second allowance. Each change in original bytes, reservations, included allowance or pooled add-on bytes has an append-only database entry in the same transaction. The initial allowance comes from `WORKSPACE_INCLUDED_STORAGE_BYTES`. Existing entitlements are managed server-side. Optional `WORKSPACE_STORAGE_OFFER_JSON` sets the proposed currency, flat monthly price in minor units, monthly add-on price in minor units and bytes per add-on. Payment collection is outside this development round.

For external notifications, configure the staging sender with `RESEND_API_KEY` and `WORKSPACE_NOTIFICATION_FROM`. Web Push uses `WORKSPACE_PUSH_PUBLIC_KEY`, `WORKSPACE_PUSH_PRIVATE_KEY` and `WORKSPACE_PUSH_CONTACT`. The delivery worker accepts an authenticated POST at `/api/account/notifications/deliver` using `WORKSPACE_NOTIFICATION_WORKER_TOKEN`. Enrollment and recovery use Supabase Auth's separately configured sender.

## Restore rehearsal and release decision

1. Capture a consistent database snapshot and storage inventory, then copy originals independently. Record any writes between capture and cutover. Record locally pending Vault data before changing origins. Keep production credentials, originals and billing out of local test fixtures.
2. Restore the full Supabase database and private storage in isolation. Apply the additive workspace migrations there. Validate the intended workspace and author for legacy rows before publishing mappings. Compare independent inventory hashes, chunk lengths and object aliases.
3. The offline companion check runs from the dashboard with `node scripts/workspace-restore-rehearsal.cjs app-state.json account-media inventory.json inventory-sha256 workspace-uuid owner-uuid NEW-DIRECTORY`. It rejects an existing destination. The inventory format is `unigentamos-account-inventory-v1` with `appStateSha256` and an `originals` array containing `recordId`, `mediaId`, `objectId`, `fileId`, `bytes` and `sha256`. Supply its digest independently. The script reopens a local database using the workspace catalog, rehashes the restored originals, and reports unknown media references for review. It covers exported application documents and files. Full Supabase recovery also requires provider-level database and authentication restoration.
4. Use two independent accounts plus a guest on staging. Verify workspace isolation, private links inside shared records, file download and thumbnail access after revocation, session revocation, expired invitations, account-specific preferences, byte-for-byte originals, and interrupted uploads. Check actual browser signing and CORS against the isolated R2 bucket. Verify notification delivery with staging recipients and compare saved board and note links with their source documents.
5. Review the reconciliation report and repeat it for any intervening writes. Leave Vercel serving production until Ocean approves the result. During cutover choose one writable system. Retain a durable journal or clear write boundary so rollback can reconcile new OVH writes before routing traffic back. Keep original buckets, stable IDs and the Vercel deployment available through rollback verification.
