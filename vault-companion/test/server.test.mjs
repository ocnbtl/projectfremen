import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, createHmac, pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { Origin: "http://localhost:3000" } });
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Companion did not start");
}

function unwrapRecovery(password, envelope) {
  const salt = Buffer.from(envelope.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const packed = Buffer.from(envelope.ciphertext, "base64");
  const key = pbkdf2Sync(password.normalize("NFKC"), salt, envelope.iterations, 32, "sha256");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(packed.subarray(packed.length - 16));
  const raw = Buffer.concat([decipher.update(packed.subarray(0, -16)), decipher.final()]);
  key.fill(0);
  return raw;
}

function browserEnvelope(vaultId, key, change) {
  const metadata = { envelopeVersion: 1, vaultId, changeId: change.changeId, deviceId: change.deviceId, keyVersion: 1 };
  const aad = Buffer.from(JSON.stringify([1, vaultId, change.changeId, change.deviceId, 1]));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(change)), cipher.final(), cipher.getAuthTag()]);
  return {
    ...metadata,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    aadHash: createHash("sha256").update(aad).digest("base64"),
    byteLength: ciphertext.length
  };
}

test("companion setup, authorization, unlock, and encrypted backup", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "unigentamos-vault-test-"));
  const backupRoot = join(root, "configured-backups");
  const port = 44000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["./src/server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      UNIGENTAMOS_VAULT_DIR: root,
      UNIGENTAMOS_VAULT_BACKUP_DIR: backupRoot,
      UNIGENTAMOS_VAULT_PORT: String(port),
      UNIGENTAMOS_SETUP_CODE: "123456",
      UNIGENTAMOS_MAX_HISTORY_VERSIONS: "2",
      UNIGENTAMOS_MAX_MEDIA_LIBRARY_BYTES: "1024",
      UNIGENTAMOS_MAX_BACKUPS: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    const health = await waitForHealth(port);
    assert.equal(health.configured, false);
    assert.equal(health.version, "0.3.0");
    const origin = "http://localhost:3000";
    const preflight = await fetch(`http://127.0.0.1:${port}/health`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Private-Network": "true"
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");
    const pairingHelper = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(pairingHelper.status, 200);
    assert.match(pairingHelper.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
    assert.equal(pairingHelper.headers.get("x-frame-options"), "DENY");
    assert.match(await pairingHelper.text(), /123456/);
    const wrongOrigin = await fetch(`http://127.0.0.1:${port}/v1/setup`, {
      method: "POST",
      headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct horse battery staple", setupCode: "123456" })
    });
    assert.equal(wrongOrigin.status, 403);
    const wrongPairing = await fetch(`http://127.0.0.1:${port}/v1/setup`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct horse battery staple", setupCode: "000000" })
    });
    assert.equal(wrongPairing.status, 401);
    const setup = await fetch(`http://127.0.0.1:${port}/v1/setup`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct horse battery staple", deviceName: "Test desktop", setupCode: "123456" })
    });
    assert.equal(setup.status, 201);
    const setupBody = await setup.json();
    assert.equal(setupBody.recoveryPackage.format, "unigentamos-vault-recovery-v1");
    assert.match(setupBody.recoveryPackage.vaultId, /^[0-9a-f-]{36}$/);
    const configuredHelper = await fetch(`http://127.0.0.1:${port}/`);
    assert.doesNotMatch(await configuredHelper.text(), /123456/);

    const unauthorized = await fetch(`http://127.0.0.1:${port}/v1/status`, { headers: { Origin: origin } });
    assert.equal(unauthorized.status, 401);
    const status = await fetch(`http://127.0.0.1:${port}/v1/status`, {
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    });
    assert.equal(status.status, 200);
    const initialStatus = await status.json();
    assert.deepEqual(initialStatus.status.backup, {
      destination: "custom-folder",
      count: 0,
      limit: 1,
      lastCreatedAt: null,
      lastVerifiedAt: null,
      automaticEveryDays: 7,
      lastAutomaticError: null
    });

    const password = "correct horse battery staple";
    const rawVaultKey = unwrapRecovery(password, setupBody.recoveryPackage.keyEnvelope);
    const objectId = randomUUID();
    const deviceId = randomUUID();
    const changeId = randomUUID();
    const change = {
      protocolVersion: 1,
      changeId,
      objectId,
      objectKind: "note",
      deviceId,
      hlc: { wallMs: Date.now(), counter: 0, deviceId },
      fields: { title: "plaintext must never appear in SQLite", body: "encrypted local history" },
      fieldClocks: {},
      createdAt: new Date().toISOString()
    };
    change.fieldClocks.title = change.hlc;
    change.fieldClocks.body = change.hlc;
    const envelope = browserEnvelope(setupBody.recoveryPackage.vaultId, rawVaultKey, change);
    const imported = await fetch(`http://127.0.0.1:${port}/v1/envelopes`, {
      method: "POST",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}`, "Content-Type": "application/json" },
      body: JSON.stringify({ envelopes: [envelope] })
    });
    assert.equal(imported.status, 200);
    const duplicate = await fetch(`http://127.0.0.1:${port}/v1/envelopes`, {
      method: "POST",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}`, "Content-Type": "application/json" },
      body: JSON.stringify({ envelopes: [envelope] })
    });
    assert.equal(duplicate.status, 200);

    const nextChangeId = randomUUID();
    const nextHlc = { wallMs: Date.now() + 1, counter: 0, deviceId };
    const nextChange = {
      ...change,
      changeId: nextChangeId,
      baseVersionId: changeId,
      hlc: nextHlc,
      fields: { ...change.fields, title: "newest encrypted version" },
      fieldClocks: { ...change.fieldClocks, title: nextHlc },
      createdAt: new Date(nextHlc.wallMs).toISOString()
    };
    const nextEnvelope = browserEnvelope(setupBody.recoveryPackage.vaultId, rawVaultKey, nextChange);
    const importedNext = await fetch(`http://127.0.0.1:${port}/v1/envelopes`, {
      method: "POST",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}`, "Content-Type": "application/json" },
      body: JSON.stringify({ envelopes: [nextEnvelope] })
    });
    assert.equal(importedNext.status, 200);

    const replayedOld = await fetch(`http://127.0.0.1:${port}/v1/envelopes`, {
      method: "POST",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}`, "Content-Type": "application/json" },
      body: JSON.stringify({ envelopes: [envelope] })
    });
    assert.equal(replayedOld.status, 200);
    const inspection = new DatabaseSync(join(root, "vault.sqlite3"), { readOnly: true });
    try {
      const currentPointer = inspection.prepare("select version_key from encrypted_objects").get();
      const expectedPointer = createHmac("sha256", rawVaultKey).update("version").update("\0").update(nextChangeId).digest("hex");
      assert.equal(currentPointer.version_key, expectedPointer, "replaying an older envelope must not roll back the current pointer");
    } finally {
      inspection.close();
    }

    const overLimitChangeId = randomUUID();
    const overLimitHlc = { wallMs: Date.now() + 2, counter: 0, deviceId };
    const overLimitChange = {
      ...nextChange,
      changeId: overLimitChangeId,
      baseVersionId: nextChangeId,
      hlc: overLimitHlc,
      fieldClocks: { ...nextChange.fieldClocks, title: overLimitHlc },
      createdAt: new Date(overLimitHlc.wallMs).toISOString()
    };
    const historyLimit = await fetch(`http://127.0.0.1:${port}/v1/envelopes`, {
      method: "POST",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}`, "Content-Type": "application/json" },
      body: JSON.stringify({ envelopes: [browserEnvelope(setupBody.recoveryPackage.vaultId, rawVaultKey, overLimitChange)] })
    });
    assert.equal(historyLimit.status, 507);

    const media = Buffer.from("local encrypted media payload");
    const digest = createHash("sha256").update(media).digest("hex");
    const mediaPut = await fetch(`http://127.0.0.1:${port}/v1/media/${digest}`, {
      method: "PUT",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}`, "Content-Type": "application/octet-stream" },
      body: media
    });
    assert.equal(mediaPut.status, 201);
    const excessMedia = Buffer.alloc(1100, 7);
    const excessDigest = createHash("sha256").update(excessMedia).digest("hex");
    const excessMediaPut = await fetch(`http://127.0.0.1:${port}/v1/media/${excessDigest}`, {
      method: "PUT",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}`, "Content-Type": "application/octet-stream" },
      body: excessMedia
    });
    assert.equal(excessMediaPut.status, 507);
    const mediaGet = await fetch(`http://127.0.0.1:${port}/v1/media/${digest}`, {
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    });
    assert.equal(mediaGet.status, 200);
    assert.deepEqual(Buffer.from(await mediaGet.arrayBuffer()), media);

    const populatedStatus = await fetch(`http://127.0.0.1:${port}/v1/status`, {
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    }).then((response) => response.json());
    assert.deepEqual(populatedStatus.status.counts, { objects: 1, versions: 2, media: 1 });
    assert.equal(populatedStatus.status.storage.limits.backups, 1);
    assert.equal(populatedStatus.status.backup.destination, "custom-folder");
    assert.equal(populatedStatus.status.backup.count, 0);
    assert.equal(populatedStatus.status.backup.automaticEveryDays, 7);

    const backup = await fetch(`http://127.0.0.1:${port}/v1/backups`, {
      method: "POST",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    });
    assert.equal(backup.status, 201);
    const backupBody = await backup.json();
    assert.equal(backupBody.location, "configured encrypted backup directory");
    const backupIds = await readdir(backupRoot);
    assert.equal(backupIds.length, 1);
    assert.ok((await readdir(join(backupRoot, backupIds[0]))).includes("vault.sqlite3"));
    assert.ok((await readdir(join(backupRoot, backupIds[0]))).includes("manifest.json"));
    const listedBackups = await fetch(`http://127.0.0.1:${port}/v1/backups`, {
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    }).then((response) => response.json());
    assert.equal(listedBackups.backups.length, 1);
    assert.equal(listedBackups.backups[0].verified, true);
    const verifiedBackup = await fetch(`http://127.0.0.1:${port}/v1/backups/${backupBody.backupId}/verify`, {
      method: "POST",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    });
    assert.equal(verifiedBackup.status, 200);
    const checkedStatus = await fetch(`http://127.0.0.1:${port}/v1/status`, {
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    }).then((response) => response.json());
    assert.equal(checkedStatus.status.backup.count, 1);
    assert.ok(Number.isFinite(Date.parse(checkedStatus.status.backup.lastCreatedAt)));
    assert.ok(Number.isFinite(Date.parse(checkedStatus.status.backup.lastVerifiedAt)));
    const backupLimit = await fetch(`http://127.0.0.1:${port}/v1/backups`, {
      method: "POST",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    });
    assert.equal(backupLimit.status, 507);

    const simulatedLoss = new DatabaseSync(join(root, "vault.sqlite3"), { timeout: 5_000 });
    try {
      simulatedLoss.exec(`
        delete from encrypted_objects;
        delete from encrypted_versions;
        delete from encrypted_envelopes;
        delete from encrypted_media;
      `);
    } finally {
      simulatedLoss.close();
    }
    await rm(join(root, "media", digest.slice(0, 2), `${digest}.uvblob`), { force: true });
    const preview = await fetch(`http://127.0.0.1:${port}/v1/backups/${backupBody.backupId}/restore-preview`, {
      method: "POST",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    }).then((response) => response.json());
    assert.equal(preview.preview.currentObjects, 0);
    assert.equal(preview.preview.backupVersions, 2);
    assert.equal(preview.preview.restorableVersions, 2);
    assert.equal(preview.preview.restorableMediaFiles, 1);
    const wrongRestore = await fetch(`http://127.0.0.1:${port}/v1/backups/${backupBody.backupId}/restore`, {
      method: "POST",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}`, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "RESTORE WRONG" })
    });
    assert.equal(wrongRestore.status, 400);
    const restored = await fetch(`http://127.0.0.1:${port}/v1/backups/${backupBody.backupId}/restore`, {
      method: "POST",
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}`, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: `RESTORE ${backupBody.backupId.slice(-8).toUpperCase()}` })
    }).then((response) => response.json());
    assert.equal(restored.restoredVersions, 2);
    assert.equal(restored.restoredMediaFiles, 1);
    const recoveredStatus = await fetch(`http://127.0.0.1:${port}/v1/status`, {
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    }).then((response) => response.json());
    assert.deepEqual(recoveredStatus.status.counts, { objects: 1, versions: 2, media: 1 });
    const recoveredMedia = await fetch(`http://127.0.0.1:${port}/v1/media/${digest}`, {
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    });
    assert.deepEqual(Buffer.from(await recoveredMedia.arrayBuffer()), media);
    const recoveredEnvelopes = await fetch(`http://127.0.0.1:${port}/v1/envelopes?after=0&limit=10`, {
      headers: { Origin: origin, Authorization: `Bearer ${setupBody.capability}` }
    }).then((response) => response.json());
    assert.equal(recoveredEnvelopes.envelopes.length, 2);

    const databaseFiles = (await readdir(root)).filter((name) => name.startsWith("vault.sqlite3"));
    const databaseBytes = Buffer.concat(await Promise.all(databaseFiles.map((name) => readFile(join(root, name)))));
    assert.equal(databaseBytes.includes(Buffer.from("plaintext must never appear in SQLite")), false);
    assert.equal(databaseBytes.includes(Buffer.from("encrypted local history")), false);
    rawVaultKey.fill(0);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(root, { recursive: true, force: true });
  }
});
