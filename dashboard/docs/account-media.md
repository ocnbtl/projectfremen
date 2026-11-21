# Account-accessible Media

Ordinary Media uses the signed-in account session. Vault files keep their existing encrypted storage and unlock flow. New Media manifests use `unigentamos-account-media-v1`; Vault bootstrap and mirroring exclude this format.

## Storage setup

The server uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Provision a **private** `account-media` Storage bucket with a 1,048,576-byte object limit and `application/octet-stream` MIME type. Do not add anonymous or authenticated-client object policies: the authenticated application API mediates access with its server credential. This bucket was provisioned and its private access verified for production on October 25, 2026.

Files up to 256 MiB are stored as immutable 1 MiB chunks. Finalization reads all chunks and verifies their SHA-256 before creating the canonical record. Downloads require an admin session and a canonical record, and the browser verifies the full hash. Mutations require CSRF validation; metadata edits use optimistic concurrency. API responses are private and not cached.

Existing encrypted originals are not migrated automatically. After unlocking Vault, an owner can explicitly enable account access for an individual Media file. Its bytes are checked against the original encrypted manifest's content root; the encrypted original and manifest are retained. Uploads interrupted before finalization can leave unreferenced chunks; no automatic deletion runs against either bucket.

## Verification

- `npm run test:account-media`: locked-Vault desktop/mobile upload, preview, download, edits, archive/restore, authorization and integrity checks, and explicit conversion.
- `node scripts/workspace-media-browser-harness.mjs`: canonical links and Media workflow regression.
- `npm run test:vault-browser`: encrypted Vault recovery, synchronization, media, and offline regression.

Rollback of the application does not delete account Media, but earlier versions cannot open the new manifest format. Keep this format supported when reverting unrelated UI changes.

## Workspace media development

The individual-account workspace page uses a separate private file catalog and the same account session as workspace records. A new original is private to its uploader. The uploader can share it with current workspace members or make it private again. Directory results, original downloads and image previews each check current access. Thumbnails decode on demand, omit source metadata and stay out of storage. Original downloads retain the exact uploaded bytes, including any embedded metadata.

New workspace uploads require `WORKSPACE_MEDIA_BACKEND=r2-standard` plus `R2_ACCOUNT_ID`, `R2_MEDIA_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Use a bucket-scoped Object Read & Write credential and a private Standard bucket. The browser needs CORS PUT permission for the application origin, with `If-None-Match`, `x-amz-storage-class` and any browser-supplied Content-Type header allowed. The server signs each 8 MiB part for at most five minutes, including its exact length and the create-only condition. Parts use `workspaces/{workspace_id}/media/{media_id}/chunk-{zero_based_index}`. Each resume checks already-stored parts. The server verifies the full SHA-256 before publishing a catalog entry. A downloaded file streams with a fresh authorization check per request.

The quota row in `account_workspace_storage` holds included bytes and pooled add-on bytes. `WORKSPACE_INCLUDED_STORAGE_BYTES` supplies the initial allowance, defaulting to zero. Adjust existing entitlements in the quota row through a trusted administrative process. The usage function reports original bytes and pending reservations. A failed transfer keeps its reservation so the owner can resume. Discard stops issuance of new links. The user can finish cleanup after outstanding signed writes expire. Cleanup releases quota only after the unfinished R2 parts are removed. This flow never deletes a ready original.

For legacy account Media, configure `FREMEN_ACCOUNT_MEDIA_BACKEND=supabase`. Existing Vercel deployments also recognize `VERCEL=1` as the legacy Supabase default. An OVH server requires an explicit selection. Fixture harnesses set `filesystem-test` and an isolated data directory while Supabase credentials are empty. Setting a data directory by itself cannot select disk storage.

Before staging, test browser CORS, signed length and duplicate PUT behavior against an isolated private R2 bucket. Without copying originals, an operator can map restored legacy rows to explicit workspace owners with backend `supabase`, preserving each original record ID, media ID, object reference, file ID, 1 MiB chunk size and SHA-256. Import mappings only after verifying the original manifest and ownership; existing files receive no automatic assignment. Restore and reconcile the catalog, original chunks and quota rows together. A catalog-only export cannot restore original bytes. Verify access from separate accounts after restoring. The encrypted device Vault uses its own relay, recovery and backup paths.

Run `node scripts/workspace-media-account-test.cjs` from the dashboard to exercise the workspace schema, permissions, legacy reads, usage reservations, partial transfers, integrity checks, sharing and on-demand thumbnails against isolated providers.

Photo exports on the workspace page can produce a still WebP copy without embedded metadata. Each member can save a workspace-specific upload preference to create a still PNG copy on the device before sending a photo. Both options support common raster formats, up to 20 MiB and 24 megapixels. The device Vault only caches encrypted Vault content. Its optional download cache limit counts encrypted packet bytes, permits new unsynced local originals, and applies to future downloads. A photo can still open online when its encrypted copy would exceed the cache limit. Pinning requires a complete local copy and protects it during cleanup. With an explicit budget, cleanup is manual and verifies remote packets before releasing local copies.

Local browser checks are available in `scripts/workspace-media-direct-browser.cjs` for CORS and signed immutable PUTs, and `scripts/workspace-device-storage-test.cjs` for encrypted cache limits, pinning and metadata-free photo uploads.
