-- Private, replaceable cache for end-to-end encrypted media chunks.
-- The application server is the only caller with Storage credentials. File
-- names, MIME types, and plaintext remain inside the encrypted vault manifest.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vault-media-relay',
  'vault-media-relay',
  false,
  2500000,
  array['application/json']::text[]
)
on conflict (id) do nothing;

-- No storage.objects policy is intentionally created. Anonymous and
-- authenticated browser roles therefore cannot list, upload, or download
-- these private objects; the server-side service credential remains the sole
-- relay path and sees ciphertext only.
