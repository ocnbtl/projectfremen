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
