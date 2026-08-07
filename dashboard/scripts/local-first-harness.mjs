import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourceRoot = path.resolve("lib/local-first");
const outputRoot = await mkdtemp(path.join(tmpdir(), "unigentamos-local-first-test-"));

async function compile(name) {
  const source = await readFile(path.join(sourceRoot, `${name}.ts`), "utf8");
  let output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      verbatimModuleSyntax: true
    },
    fileName: `${name}.ts`
  }).outputText;
  output = output.replaceAll('from "./types"', 'from "./types.mjs"')
    .replaceAll('from "./hlc"', 'from "./hlc.mjs"');
  await writeFile(path.join(outputRoot, `${name}.mjs`), output);
}

function snapshot(objectId, objectKind, versionId, deviceId, wallMs, fields, baseFields = fields) {
  const hlc = { wallMs, counter: 0, deviceId };
  return {
    objectId,
    objectKind,
    versionId,
    hlc,
    fields,
    fieldClocks: Object.fromEntries(Object.keys(baseFields).map((field) => [field, hlc])),
    tombstone: false,
    updatedAt: new Date(wallMs).toISOString()
  };
}

try {
  for (const moduleName of ["types", "hlc", "merge", "crypto", "relay-store"]) await compile(moduleName);
  const { assessClockHealth, compareHlc, tickHlc } = await import(pathToFileURL(path.join(outputRoot, "hlc.mjs")));
  const { mergeVaultSnapshots, threeWayMergeText } = await import(pathToFileURL(path.join(outputRoot, "merge.mjs")));
  const {
    createVaultKeyEnvelope,
    decryptVaultChange,
    decryptVaultDeviceDescriptor,
    decryptVaultMediaChunk,
    encryptVaultChange,
    encryptVaultDeviceDescriptor,
    encryptVaultMediaChunk,
    mediaContentRoot,
    sha256Hex,
    unlockVaultKey
  } = await import(pathToFileURL(path.join(outputRoot, "crypto.mjs")));
  const { validateEncryptedDeviceDescriptor, validateEncryptedEnvelope, validateEncryptedMediaChunk } = await import(pathToFileURL(path.join(outputRoot, "relay-store.mjs")));

  const text = threeWayMergeText("alpha\nbeta\ngamma", "ALPHA\nbeta\ngamma", "alpha\nbeta\nGAMMA");
  assert.deepEqual(text, { value: "ALPHA\nbeta\nGAMMA", conflict: false });

  const objectId = crypto.randomUUID();
  const base = snapshot(objectId, "contact", "base", "device-a", 1_000, { title: "Ocean", email: "old@example.com", phone: "111" });
  const local = snapshot(objectId, "contact", "local", "device-a", 2_000, { title: "Ocean", email: "new@example.com", phone: "111" });
  const remote = snapshot(objectId, "contact", "remote", "device-b", 3_000, { title: "Ocean", email: "old@example.com", phone: "222" });
  const merged = mergeVaultSnapshots(base, local, remote);
  assert.equal(merged.snapshot.fields.email, "new@example.com");
  assert.equal(merged.snapshot.fields.phone, "222");
  assert.equal(merged.conflicts.length, 0);

  const overlap = mergeVaultSnapshots(
    snapshot(objectId, "note", "base-2", "device-a", 1_000, { title: "Original" }),
    snapshot(objectId, "note", "local-2", "device-a", 2_000, { title: "Local" }),
    snapshot(objectId, "note", "remote-2", "device-b", 3_000, { title: "Remote" })
  );
  assert.equal(overlap.snapshot.fields.title, "Remote");
  assert.equal(overlap.conflicts[0].losingValue, "Local");

  const firstCanonicalMerge = mergeVaultSnapshots(
    snapshot(objectId, "contact", "empty-base", "device-a", 1_000, {}),
    snapshot(objectId, "contact", "local-first", "device-a", 2_000, { title: "Local title", privateContext: "Keep me" }, {}),
    snapshot(objectId, "contact", "server-first", "device-b", 3_000, { title: "Server title" }, {})
  );
  assert.equal(firstCanonicalMerge.snapshot.fields.title, "Server title");
  assert.equal(firstCanonicalMerge.snapshot.fields.privateContext, "Keep me");
  assert.equal(firstCanonicalMerge.conflicts[0].losingValue, "Local title");

  const financeOverlap = mergeVaultSnapshots(
    snapshot(objectId, "finance", "finance-base", "device-a", 1_000, { amount: 100 }),
    snapshot(objectId, "finance", "finance-local", "device-a", 2_000, { amount: 120 }),
    snapshot(objectId, "finance", "finance-remote", "device-b", 3_000, { amount: 130 })
  );
  assert.equal(financeOverlap.conflicts[0].reason, "high_integrity_overlap");

  const health = assessClockHealth(2_000_000, new Date(1_000_000).toUTCString());
  assert.equal(health.state, "blocked");
  assert.equal(health.orderingSafe, true);
  assert.equal(health.adjustedWallMs, 1_000_000);
  assert(compareHlc(tickHlc(null, "a", health.adjustedWallMs), tickHlc(null, "b", health.adjustedWallMs)) < 0);

  const password = "correct horse battery staple";
  const { envelope: keyEnvelope, vaultKey } = await createVaultKeyEnvelope(password);
  const unlocked = await unlockVaultKey(password, keyEnvelope);
  const deviceId = crypto.randomUUID();
  const change = {
    protocolVersion: 1,
    changeId: crypto.randomUUID(),
    objectId: crypto.randomUUID(),
    objectKind: "note",
    deviceId,
    hlc: { wallMs: Date.now(), counter: 0, deviceId },
    fields: { title: "ciphertext-only title" },
    fieldClocks: {},
    createdAt: new Date().toISOString()
  };
  change.fieldClocks.title = change.hlc;
  const envelopeVaultId = crypto.randomUUID();
  const encrypted = await encryptVaultChange(change, envelopeVaultId, vaultKey);
  assert.equal(encrypted.ciphertext.includes("ciphertext-only title"), false);
  assert.deepEqual(await decryptVaultChange(encrypted, unlocked), change);
  assert.deepEqual(validateEncryptedEnvelope(encrypted, envelopeVaultId), encrypted);
  assert.throws(
    () => validateEncryptedEnvelope({ ...encrypted, byteLength: encrypted.byteLength - 1 }, envelopeVaultId),
    /declared size/i
  );
  await assert.rejects(() => unlockVaultKey("this is the wrong password", keyEnvelope), /incorrect|damaged/i);
  await assert.rejects(
    () => unlockVaultKey(password, { ...keyEnvelope, iterations: keyEnvelope.iterations + 1 }),
    /work factor/i
  );

  const deviceDescriptor = {
    format: "unigentamos-vault-device-v1",
    vaultId: envelopeVaultId,
    deviceId,
    deviceName: "Ocean's iPhone",
    deviceKind: "iphone"
  };
  const encryptedDeviceDescriptor = await encryptVaultDeviceDescriptor(deviceDescriptor, vaultKey);
  assert.equal(encryptedDeviceDescriptor.ciphertext.includes("Ocean's iPhone"), false);
  assert.deepEqual(await decryptVaultDeviceDescriptor(encryptedDeviceDescriptor, unlocked), deviceDescriptor);
  assert.deepEqual(
    validateEncryptedDeviceDescriptor(encryptedDeviceDescriptor, envelopeVaultId, deviceId),
    encryptedDeviceDescriptor
  );
  assert.throws(
    () => validateEncryptedDeviceDescriptor({ ...encryptedDeviceDescriptor, deviceId: crypto.randomUUID() }, envelopeVaultId),
    /metadata|belongs/i
  );

  const mediaPlaintext = new TextEncoder().encode("encrypted media fixture");
  const plaintextHash = await sha256Hex(mediaPlaintext);
  const contentRoot = await mediaContentRoot({ byteLength: mediaPlaintext.byteLength, chunkSize: 1_500_000, plaintextHashes: [plaintextHash] });
  const mediaId = crypto.randomUUID();
  const encryptedMedia = await encryptVaultMediaChunk({
    vaultId: envelopeVaultId,
    mediaId,
    contentRoot,
    chunkIndex: 0,
    totalChunks: 1,
    keyVersion: 1,
    plaintext: mediaPlaintext,
    plaintextHash
  }, vaultKey);
  assert.equal(encryptedMedia.ciphertext.includes("encrypted media fixture"), false);
  assert.deepEqual(await decryptVaultMediaChunk(encryptedMedia, unlocked), mediaPlaintext);
  assert.deepEqual(validateEncryptedMediaChunk(encryptedMedia, envelopeVaultId), encryptedMedia);
  assert.throws(() => validateEncryptedMediaChunk({ ...encryptedMedia, chunkIndex: 1 }, envelopeVaultId), /metadata/i);

  const futureChange = {
    ...change,
    changeId: crypto.randomUUID(),
    hlc: { wallMs: Date.now() + 60 * 60 * 1000, counter: 0, deviceId },
    createdAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
  futureChange.fieldClocks = { title: futureChange.hlc };
  const futureEnvelope = await encryptVaultChange(futureChange, crypto.randomUUID(), vaultKey);
  await assert.rejects(
    () => decryptVaultChange(futureEnvelope, unlocked, { serverWallMs: Date.now() }),
    /ahead of authenticated server time/i
  );

  const relayMigration = await readFile("supabase/migrations/202608050001_encrypted_local_first_sync.sql", "utf8");
  assert.match(relayMigration, /force row level security/i);
  assert.match(relayMigration, /pg_advisory_xact_lock/i);
  assert.match(relayMigration, /current_bytes \+ new\.byte_length > 201326592/i);
  assert.match(relayMigration, /octet_length\(decode\(ciphertext, 'base64'\)\) = byte_length/i);
  assert.match(relayMigration, /revoke all on function private\.enforce_vault_sync_quota\(\) from public, anon, authenticated/i);
  assert.match(relayMigration, /before insert on public\.vault_sync_changes/i);
  const hardeningMigration = await readFile("supabase/migrations/202608060002_harden_existing_functions.sql", "utf8");
  assert.match(hardeningMigration, /alter function public\.set_updated_at\(\) set search_path = pg_catalog/i);
  assert.match(hardeningMigration, /revoke all on function public\.rls_auto_enable\(\) from public, anon, authenticated/i);
  const deviceStatusMigration = await readFile("supabase/migrations/20260807150346_add_vault_device_sync_status.sql", "utf8");
  assert.match(deviceStatusMigration, /create table if not exists public\.vault_sync_devices/i);
  assert.match(deviceStatusMigration, /force row level security/i);
  assert.match(deviceStatusMigration, /revoke all on table public\.vault_sync_devices from public, anon, authenticated, service_role/i);
  assert.match(deviceStatusMigration, /new\.acknowledged_sequence := least\(new\.acknowledged_sequence, relay_head\)/i);
  assert.match(deviceStatusMigration, /new\.blocked_changes = 0/i);
  assert.match(deviceStatusMigration, /device_count >= 64/i);
  const deviceStatusRoute = await readFile("app/api/vault/devices/route.ts", "utf8");
  assert.match(deviceStatusRoute, /hasAdminSession/i);
  assert.match(deviceStatusRoute, /isCsrfRequestValid/i);
  assert.match(deviceStatusRoute, /MAX_REQUEST_BYTES = 64 \* 1024/i);
  assert.match(deviceStatusRoute, /recordVaultDeviceStatus/i);
  const mediaMigration = await readFile("supabase/migrations/20260807170000_add_encrypted_media_relay_bucket.sql", "utf8");
  assert.match(mediaMigration, /vault-media-relay/i);
  assert.match(mediaMigration, /false/i);
  assert.doesNotMatch(mediaMigration, /create policy/i);
  const mediaRoute = await readFile("app/api/vault/media/route.ts", "utf8");
  assert.match(mediaRoute, /hasAdminSession/i);
  assert.match(mediaRoute, /isCsrfRequestValid/i);
  assert.match(mediaRoute, /MAX_REQUEST_BYTES = 2_500_000/i);
  const serviceWorker = await readFile("public/sw.js", "utf8");
  assert.match(serviceWorker, /unigentamos-static-v6/i);
  assert.match(serviceWorker, /event\.data\?\.type === "SKIP_WAITING"/i);
  assert.match(serviceWorker, /cache\.put\("\/vault", response\.clone\(\)\)/i);
  const serviceWorkerRegistration = await readFile("components/ServiceWorkerRegistration.tsx", "utf8");
  assert.match(serviceWorkerRegistration, /updateViaCache: "none"/i);
  assert.match(serviceWorkerRegistration, /next\.update\(\)/i);
  assert.match(serviceWorkerRegistration, /A newer version is ready\./i);
  const vaultWorkspace = await readFile("components/VaultWorkspace.tsx", "utf8");
  assert.ok(vaultWorkspace.indexOf("Your devices") < vaultWorkspace.indexOf("Bring in your current data"));
  assert.doesNotMatch(vaultWorkspace, /Relay progress|sequence it has safely applied|Waiting for the first device acknowledgement/i);
  assert.match(vaultWorkspace, /Restore this version/i);
  assert.match(vaultWorkspace, /It does not replace newer work/i);

  console.log("[pass] local-first merge, clock correction, conflict retention, device status, natural copy, app updating, and encryption checks passed");
} finally {
  await rm(outputRoot, { recursive: true, force: true });
}
