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
    .replaceAll('from "./hlc"', 'from "./hlc.mjs"')
    .replaceAll('from "./canonical-record"', 'from "./canonical-record.mjs"');
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
  for (const moduleName of ["types", "hlc", "merge", "crypto", "relay-store", "semantic-history", "canonical-record"]) await compile(moduleName);
  const { assessClockHealth, compareHlc, tickHlc } = await import(pathToFileURL(path.join(outputRoot, "hlc.mjs")));
  const { mergeVaultSnapshots, threeWayMergeText } = await import(pathToFileURL(path.join(outputRoot, "merge.mjs")));
  const { deterministicMergeVersionId, meaningfulVaultHistory } = await import(pathToFileURL(path.join(outputRoot, "semantic-history.mjs")));
  const { canonicalMetadata, editableFieldsFor, pendingCanonicalCommands, pendingCommandField } = await import(pathToFileURL(path.join(outputRoot, "canonical-record.mjs")));
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

  const canonical = canonicalMetadata({ module: "projects", collection: "projects", recordId: "project-1", sourceUpdatedAt: "2026-08-09T12:00:00.000Z" });
  assert.equal(canonical.canonicalId, "projects:projects:project-1");
  assert.equal(canonical.route, "/admin/projects/project-1");
  assert.deepEqual(editableFieldsFor("finance", "transfers"), []);
  assert.deepEqual(editableFieldsFor("finance", "accounts").map((field) => field.key), ["name", "institution"]);
  const commandId = crypto.randomUUID();
  const commandField = pendingCommandField(commandId);
  const commandSnapshot = snapshot(crypto.randomUUID(), "note", crypto.randomUUID(), "device-a", 900, {
    title: "Offline note",
    [commandField]: { format: "unigentamos-canonical-command-v1", commandId, operation: "update", canonicalId: "personal-records:note:personal-1", baseUpdatedAt: null, baseFields: { title: "Before" }, patch: { title: "After" }, queuedAt: "2026-08-09T12:00:00.000Z" }
  });
  assert.equal(pendingCanonicalCommands(commandSnapshot).length, 1);
  const ownerCommandId = crypto.randomUUID();
  const ownerCommand = {
    format: "unigentamos-canonical-command-v1",
    commandId: ownerCommandId,
    operation: "owner_action",
    canonicalId: "finance:transactions:transaction-1",
    baseUpdatedAt: "2026-08-09T12:00:00.000Z",
    baseFields: {},
    patch: {},
    ownerAction: { name: "finance_action", action: "review_transaction", input: {} },
    queuedAt: "2026-08-09T12:01:00.000Z"
  };
  const ownerSnapshot = snapshot(crypto.randomUUID(), "finance", crypto.randomUUID(), "device-a", 901, {
    [pendingCommandField(ownerCommandId)]: ownerCommand
  });
  assert.deepEqual(pendingCanonicalCommands(ownerSnapshot).map((item) => item.command), [ownerCommand]);

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

  const repeatedSnapshots = Array.from({ length: 50 }, (_, index) => snapshot(
    objectId,
    "note",
    `repeat-${index + 1}`,
    `device-${index % 4}`,
    4_000 + index,
    {
      title: "Vault journal",
      body: "unchanged",
      __unigentamosCanonicalBaseV1: { versionId: `base-${index}`, fields: { title: "Vault journal" } }
    }
  ));
  const collapsed = meaningfulVaultHistory(repeatedSnapshots);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].versionId, "repeat-1");

  const changedBack = meaningfulVaultHistory([
    snapshot(objectId, "note", "state-a-1", "device-a", 5_000, { body: "A" }),
    snapshot(objectId, "note", "state-b", "device-a", 6_000, { body: "B" }),
    snapshot(objectId, "note", "state-a-2", "device-a", 7_000, { body: "A" })
  ]);
  assert.deepEqual(changedBack.map((item) => item.versionId), ["state-a-2", "state-b", "state-a-1"]);

  const deterministicMerge = mergeVaultSnapshots(base, local, remote).snapshot;
  const mergeId = await deterministicMergeVersionId(deterministicMerge, [local.versionId, remote.versionId]);
  assert.equal(
    mergeId,
    await deterministicMergeVersionId(deterministicMerge, [remote.versionId, local.versionId, remote.versionId])
  );
  assert.match(mergeId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

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
  const compactionMigration = await readFile("supabase/migrations/20260809080619_vault_sync_compaction_and_device_lifecycle.sql", "utf8");
  assert.match(compactionMigration, /create table if not exists public\.vault_sync_compactions/i);
  assert.match(compactionMigration, /force row level security/i);
  assert.match(compactionMigration, /revoke all on table public\.vault_sync_compactions from public, anon, authenticated, service_role/i);
  assert.match(compactionMigration, /grant select, insert on table public\.vault_sync_compactions to service_role/i);
  assert.match(compactionMigration, /grant delete on table public\.vault_sync_changes to service_role/i);
  assert.match(compactionMigration, /security invoker/i);
  assert.match(compactionMigration, /min\(acknowledged_sequence\)/i);
  assert.match(compactionMigration, /pending_changes > 0 or blocked_changes > 0/i);
  assert.match(compactionMigration, /sequence <> first_sequence/i);
  assert.match(compactionMigration, /p_recovery_window/i);
  assert.match(compactionMigration, /not \(change_id = any\(coalesce\(p_keep_change_ids/i);
  assert.match(compactionMigration, /old\.lifecycle = 'retired'/i);
  assert.match(compactionMigration, /vault device is retired/i);
  assert.match(compactionMigration, /revoke all on function public\.compact_vault_sync_relay\(uuid, uuid, uuid\[\], integer\) from public, anon, authenticated/i);
  const compactRoute = await readFile("app/api/vault/compact/route.ts", "utf8");
  assert.match(compactRoute, /hasAdminSession/i);
  assert.match(compactRoute, /isCsrfRequestValid/i);
  assert.match(compactRoute, /MAX_REQUEST_BYTES = 2 \* 1024 \* 1024/i);
  assert.match(compactRoute, /compactVaultRelay/i);
  assert.match(deviceStatusRoute, /export async function DELETE/i);
  assert.match(deviceStatusRoute, /retireVaultDevice/i);
  const browserStore = await readFile("lib/local-first/indexed-db.ts", "utf8");
  assert.match(browserStore, /requestPersistentStorage/i);
  assert.match(browserStore, /storageHealth/i);
  assert.match(browserStore, /lastAccessedAt/i);
  assert.match(browserStore, /deleteMediaChunks/i);
  assert.match(browserStore, /navigator\.storage/i);
  const browserEngine = await readFile("lib/local-first/browser-engine.ts", "utf8");
  assert.match(browserEngine, /meaningfulVaultHistory/i);
  assert.match(browserEngine, /MAX_COMPACTION_CHANGE_IDS = 50_000/i);
  assert.match(browserEngine, /Relay cleanup runs from the Windows master/i);
  assert.match(browserEngine, /cleanupRelayNow/i);
  assert.match(browserEngine, /retireDevice/i);
  assert.match(browserEngine, /queueCanonicalOwnerAction/i);
  assert.match(browserEngine, /cleanupMediaCache/i);
  assert.match(browserEngine, /pendingUploadChunks/i);
  const mediaMigration = await readFile("supabase/migrations/20260807170000_add_encrypted_media_relay_bucket.sql", "utf8");
  assert.match(mediaMigration, /vault-media-relay/i);
  assert.match(mediaMigration, /false/i);
  assert.doesNotMatch(mediaMigration, /create policy/i);
  const mediaRoute = await readFile("app/api/vault/media/route.ts", "utf8");
  assert.match(mediaRoute, /hasAdminSession/i);
  assert.match(mediaRoute, /isCsrfRequestValid/i);
  assert.match(mediaRoute, /MAX_REQUEST_BYTES = 2_500_000/i);
  const serviceWorker = await readFile("public/sw.js", "utf8");
  assert.match(serviceWorker, /unigentamos-static-v8/i);
  assert.match(serviceWorker, /event\.data\?\.type === "SKIP_WAITING"/i);
  assert.match(serviceWorker, /cache\.put\("\/vault", response\.clone\(\)\)/i);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/admin\/"\)/i);
  const serviceWorkerRegistration = await readFile("components/ServiceWorkerRegistration.tsx", "utf8");
  assert.match(serviceWorkerRegistration, /updateViaCache: "none"/i);
  assert.match(serviceWorkerRegistration, /next\.update\(\)/i);
  assert.match(serviceWorkerRegistration, /A newer version is ready\./i);
  const vaultWorkspace = await readFile("components/VaultWorkspace.tsx", "utf8");
  assert.ok(vaultWorkspace.indexOf("Your devices") < vaultWorkspace.indexOf("Bring in your current data"));
  assert.doesNotMatch(vaultWorkspace, /Relay progress|sequence it has safely applied|Waiting for the first device acknowledgement/i);
  assert.match(vaultWorkspace, /Restore this version/i);
  assert.match(vaultWorkspace, /It does not replace newer work/i);
  assert.match(vaultWorkspace, /Storage and recovery/i);
  assert.match(vaultWorkspace, /Protect offline data/i);
  assert.match(vaultWorkspace, /Cleanup waits until every active device is caught up/i);
  assert.match(vaultWorkspace, /Remove old device/i);
  assert.match(vaultWorkspace, /Its saved local copy stays on that device/i);
  assert.match(vaultWorkspace, /Using this PC for now/i);
  assert.match(vaultWorkspace, /Downloaded media/i);
  assert.match(vaultWorkspace, /Clean up downloads/i);
  assert.match(vaultWorkspace, /Record actions/i);
  assert.match(vaultWorkspace, /Mark paid in ledger/i);
  assert.match(vaultWorkspace, /No payment was sent/i);
  assert.match(vaultWorkspace, /Offline command center/i);
  assert.match(vaultWorkspace, /same records used by Notes, People, Resources, Projects, Reviews, Personal, and Finance/i);
  assert.match(vaultWorkspace, /saveCanonicalFields/i);
  assert.match(browserEngine, /changesOperationalState/i);
  assert.match(browserEngine, /force: true/i);
  const canonicalRoute = await readFile("app/api/vault/records/route.ts", "utf8");
  assert.match(canonicalRoute, /hasAdminSession/i);
  assert.match(canonicalRoute, /isCsrfRequestValid/i);
  assert.match(canonicalRoute, /MAX_BODY_BYTES = 128 \* 1024/i);
  const canonicalServer = await readFile("lib/local-first/canonical-record-server.ts", "utf8");
  assert.match(canonicalServer, /editableFieldsFor/i);
  assert.match(canonicalServer, /threeWayMergeText/i);
  assert.match(canonicalServer, /expectedUpdatedAt/i);
  assert.match(canonicalServer, /owner_action/i);
  assert.match(canonicalServer, /review_transaction/i);
  assert.match(canonicalServer, /paymentEvidenceRef = await canonicalNativeRef/i);
  assert.match(canonicalServer, /idempotencyKey: command.commandId/i);
  assert.doesNotMatch(canonicalServer, /confirm_import|execute_payment|bank_transfer/i);
  const commandCenter = await readFile("app/admin/page.tsx", "utf8");
  assert.match(commandCenter, /Attention horizon/i);
  assert.match(commandCenter, /openProjectBlockers.map/i);
  assert.match(commandCenter, /pendingTransactions.map/i);
  assert.match(commandCenter, /dueBills.map/i);
  assert.match(commandCenter, /openFollowUps.map/i);
  assert.match(commandCenter, /Nothing is copied here/i);
  const companionSource = await readFile("../vault-companion/src/server.mjs", "utf8");
  assert.match(companionSource, /const VERSION = "0\.3\.0"/i);
  assert.match(companionSource, /UNIGENTAMOS_VAULT_AUTO_BACKUP_MS/i);
  assert.match(companionSource, /async function maybeCreateScheduledBackup/i);
  assert.match(companionSource, /Backup limit reached\. Move an older checked backup/i);
  assert.match(companionSource, /destination: backupDestination\(\)/i);

  console.log("[pass] canonical offline editing and owner actions, safe field allowlists, local-first merge, restore reconciliation, clock correction, encrypted sync, media retention, device lifecycle, Command Center derivation, and backup checks passed");
} finally {
  await rm(outputRoot, { recursive: true, force: true });
}
