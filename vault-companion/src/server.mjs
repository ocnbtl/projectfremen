import { createServer } from "node:http";
import {
  argon2Sync,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { DatabaseSync, backup as backupDatabase } from "node:sqlite";

const VERSION = "0.1.0";
const HOST = "127.0.0.1";

function integerEnv(name, fallback, minimum, maximum) {
  const parsed = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

const PORT = integerEnv("UNIGENTAMOS_VAULT_PORT", 43127, 1024, 65535);
const DEFAULT_ROOT = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, "Unigentamos", "Vault")
  : join(process.cwd(), ".unigentamos-vault");
const ROOT = resolve(process.env.UNIGENTAMOS_VAULT_DIR || DEFAULT_ROOT);
const DATABASE_PATH = join(ROOT, "vault.sqlite3");
const MEDIA_ROOT = join(ROOT, "media");
const BACKUP_ROOT = resolve(process.env.UNIGENTAMOS_VAULT_BACKUP_DIR || join(ROOT, "backups"));
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_MEDIA_BYTES = integerEnv("UNIGENTAMOS_MAX_MEDIA_BYTES", 268_435_456, 1_048_576, 2_147_483_647);
const MAX_MEDIA_LIBRARY_BYTES = integerEnv("UNIGENTAMOS_MAX_MEDIA_LIBRARY_BYTES", 400 * 1024 ** 3, 1024, 8 * 1024 ** 4);
const MAX_RECORD_STORAGE_BYTES = integerEnv("UNIGENTAMOS_MAX_RECORD_STORAGE_BYTES", 32 * 1024 ** 3, 1024 * 1024, 1024 ** 4);
const MAX_HISTORY_VERSIONS = integerEnv("UNIGENTAMOS_MAX_HISTORY_VERSIONS", 2_000_000, 1, 10_000_000);
const MAX_BACKUPS = integerEnv("UNIGENTAMOS_MAX_BACKUPS", 3, 1, 100);
const AUTO_LOCK_MS = integerEnv("UNIGENTAMOS_VAULT_AUTO_LOCK_MS", 30 * 60_000, 60_000, 24 * 60 * 60_000);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const OBJECT_KINDS = new Set(["note", "contact", "resource", "media", "project", "personal_ops", "review", "finance", "settings", "other"]);
const APPROVED_ORIGINS = new Set([
  "https://unigentamos.com",
  "https://www.unigentamos.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.UNIGENTAMOS_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean)
]);
const setupCode = process.env.UNIGENTAMOS_SETUP_CODE || String(100_000 + Math.floor(Math.random() * 900_000));

const backupWithinMedia = relative(MEDIA_ROOT, BACKUP_ROOT);
if (!backupWithinMedia || !backupWithinMedia.startsWith("..") && !isAbsolute(backupWithinMedia)) {
  throw new Error("UNIGENTAMOS_VAULT_BACKUP_DIR must not be inside the encrypted media directory");
}

await mkdir(MEDIA_ROOT, { recursive: true });
await mkdir(BACKUP_ROOT, { recursive: true });

const database = new DatabaseSync(DATABASE_PATH, { enableForeignKeyConstraints: true, timeout: 5_000 });
database.exec(`
  pragma journal_mode = WAL;
  pragma synchronous = FULL;
  pragma foreign_keys = ON;
  pragma secure_delete = ON;
  pragma trusted_schema = OFF;
  create table if not exists vault_config (
    id integer primary key check (id = 1),
    vault_id text not null unique,
    device_id text not null unique,
    key_version integer not null,
    kdf_json text not null,
    wrap_iv blob not null,
    wrap_tag blob not null,
    wrapped_key blob not null,
    created_at text not null
  ) strict;
  create table if not exists encrypted_envelopes (
    sequence integer primary key autoincrement,
    change_key text not null unique,
    object_key text not null,
    iv blob not null,
    tag blob not null,
    ciphertext blob not null,
    received_at text not null
  ) strict;
  create index if not exists encrypted_envelopes_object_idx on encrypted_envelopes(object_key, sequence);
  create table if not exists encrypted_objects (
    object_key text primary key,
    version_key text not null,
    iv blob not null,
    tag blob not null,
    ciphertext blob not null,
    updated_at text not null
  ) strict;
  create table if not exists encrypted_versions (
    version_key text primary key,
    object_key text not null,
    parent_key text,
    iv blob not null,
    tag blob not null,
    ciphertext blob not null,
    created_at text not null
  ) strict;
  create index if not exists encrypted_versions_object_idx on encrypted_versions(object_key, created_at);
  create table if not exists encrypted_media (
    digest_key text primary key,
    iv blob not null,
    tag blob not null,
    manifest blob not null,
    byte_length integer not null default 0,
    stored_at text not null
  ) strict;
  create table if not exists backup_log (
    id text primary key,
    path_key text not null,
    created_at text not null
  ) strict;
`);
const mediaColumns = database.prepare("pragma table_info(encrypted_media)").all();
if (!mediaColumns.some((column) => column.name === "byte_length")) {
  database.exec("alter table encrypted_media add column byte_length integer not null default 0");
}
database.enableDefensive(true);

let vaultKey = null;
let capabilityToken = null;
let lastAuthorizedAt = 0;
let failedUnlocks = [];

function config() {
  return database.prepare("select * from vault_config where id = 1").get() || null;
}

function b64(value) {
  return Buffer.from(value).toString("base64");
}

function aesSeal(key, plaintext, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

function aesOpen(key, sealed, aad) {
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
}

function derivePasswordKey(password, parameters) {
  const salt = canonicalBase64(parameters?.salt, "Vault password salt");
  if (
    parameters?.algorithm !== "argon2id"
    || salt.length !== 16
    || parameters.memory !== 65_536
    || parameters.passes !== 3
    || parameters.parallelism !== 4
    || parameters.tagLength !== 32
  ) throw new Error("Vault password parameters are invalid");
  return argon2Sync("argon2id", {
    message: Buffer.from(password.normalize("NFKC"), "utf8"),
    nonce: salt,
    parallelism: parameters.parallelism,
    tagLength: 32,
    memory: parameters.memory,
    passes: parameters.passes
  });
}

function browserKeyEnvelope(password, key, keyVersion) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const iterations = 600_000;
  const passwordKey = pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", passwordKey, iv);
  const ciphertext = Buffer.concat([cipher.update(key), cipher.final(), cipher.getAuthTag()]);
  passwordKey.fill(0);
  return {
    envelopeVersion: 1,
    kdf: "PBKDF2-SHA-256",
    iterations,
    salt: b64(salt),
    iv: b64(iv),
    ciphertext: b64(ciphertext),
    keyVersion,
    createdAt: new Date().toISOString()
  };
}

function issueCapability() {
  capabilityToken = randomBytes(32).toString("base64url");
  lastAuthorizedAt = Date.now();
  return capabilityToken;
}

function lockVault() {
  if (vaultKey) vaultKey.fill(0);
  vaultKey = null;
  capabilityToken = null;
  lastAuthorizedAt = 0;
}

function sameSecret(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

function canonicalBase64(value, field) {
  if (typeof value !== "string" || !value || value.length % 4 !== 0 || !BASE64.test(value)) {
    throw new Error(`${field} is invalid`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error(`${field} is invalid`);
  return bytes;
}

function exposedError(message, status) {
  return Object.assign(new Error(message), { status, expose: true });
}

function record(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateClock(value, expectedDeviceId = null) {
  if (
    !record(value)
    || !Number.isSafeInteger(value.wallMs)
    || value.wallMs < 0
    || value.wallMs > 8_640_000_000_000_000
    || !Number.isSafeInteger(value.counter)
    || value.counter < 0
    || value.counter > 2_147_483_647
    || typeof value.deviceId !== "string"
    || !UUID.test(value.deviceId)
    || expectedDeviceId && value.deviceId !== expectedDeviceId
  ) throw new Error("Encrypted change clock is invalid");
}

function validateChange(change, envelope) {
  if (
    !record(change)
    || change.protocolVersion !== 1
    || change.changeId !== envelope.changeId
    || change.deviceId !== envelope.deviceId
    || typeof change.objectId !== "string"
    || !UUID.test(change.objectId)
    || typeof change.objectKind !== "string"
    || !OBJECT_KINDS.has(change.objectKind)
    || !record(change.fields)
    || !record(change.fieldClocks)
    || Object.keys(change.fields).length > 10_000
    || Object.keys(change.fieldClocks).length > 10_000
    || change.baseVersionId !== undefined && (typeof change.baseVersionId !== "string" || !UUID.test(change.baseVersionId))
    || change.tombstone !== undefined && typeof change.tombstone !== "boolean"
    || typeof change.createdAt !== "string"
    || !Number.isFinite(Date.parse(change.createdAt))
  ) throw new Error("Encrypted change payload is invalid");
  validateClock(change.hlc, envelope.deviceId);
  for (const [field, clock] of Object.entries(change.fieldClocks)) {
    if (!field || field.length > 500) throw new Error("Encrypted change field clock is invalid");
    validateClock(clock);
  }
  return change;
}

function approvedOrigin(request) {
  const origin = request.headers.origin;
  return typeof origin === "string" && APPROVED_ORIGINS.has(origin) ? origin : null;
}

function corsHeaders(origin) {
  return origin ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "false",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin"
  } : {};
}

function sendJson(response, status, body, origin = null) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    ...corsHeaders(origin),
    "Cache-Control": "no-store, private",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
    "X-Content-Type-Options": "nosniff"
  });
  response.end(payload);
}

async function readBody(request, limit) {
  const declared = Number(request.headers["content-length"] || 0);
  if (declared > limit) throw Object.assign(new Error("Request is too large"), { status: 413 });
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request is too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const body = await readBody(request, MAX_JSON_BYTES);
  try {
    const value = JSON.parse(body.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error("Request body must be a JSON object"), { status: 400 });
  }
}

function passwordValue(value) {
  if (typeof value !== "string" || value.length < 14 || value.length > 1024) {
    throw Object.assign(new Error("Vault password must be between 14 and 1024 characters"), { status: 400 });
  }
  return value;
}

function requireCapability(request) {
  if (vaultKey && Date.now() - lastAuthorizedAt > AUTO_LOCK_MS) lockVault();
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  if (!vaultKey || !capabilityToken || !sameSecret(supplied, capabilityToken)) {
    throw Object.assign(new Error("Vault is locked or the capability is invalid"), { status: 401 });
  }
  lastAuthorizedAt = Date.now();
}

function opaqueKey(context, value) {
  return createHmac("sha256", vaultKey).update(context).update("\0").update(value).digest("hex");
}

function sealJson(value, context) {
  return aesSeal(vaultKey, Buffer.from(JSON.stringify(value)), context);
}

function decryptBrowserEnvelope(envelope, expectedVaultId) {
  if (!envelope || typeof envelope !== "object" || envelope.envelopeVersion !== 1) throw new Error("Invalid encrypted envelope");
  for (const field of ["vaultId", "changeId", "deviceId", "iv", "ciphertext", "aadHash"]) {
    if (typeof envelope[field] !== "string" || !envelope[field]) throw new Error("Invalid encrypted envelope");
  }
  if (
    envelope.vaultId !== expectedVaultId
    || !UUID.test(envelope.vaultId)
    || !UUID.test(envelope.changeId)
    || !UUID.test(envelope.deviceId)
    || envelope.keyVersion !== config()?.key_version
  ) throw new Error("Invalid encrypted envelope identity");
  const aad = Buffer.from(JSON.stringify([1, envelope.vaultId, envelope.changeId, envelope.deviceId, envelope.keyVersion]));
  const aadHash = createHash("sha256").update(aad).digest("base64");
  if (!sameSecret(aadHash, envelope.aadHash)) throw new Error("Encrypted envelope metadata failed integrity validation");
  const iv = canonicalBase64(envelope.iv, "Encrypted envelope IV");
  const packed = canonicalBase64(envelope.ciphertext, "Encrypted envelope ciphertext");
  const suppliedAadHash = canonicalBase64(envelope.aadHash, "Encrypted envelope AAD hash");
  if (
    iv.length !== 12
    || suppliedAadHash.length !== 32
    || packed.length < 17
    || packed.length > 1_100_000
    || !Number.isSafeInteger(envelope.byteLength)
    || envelope.byteLength !== packed.length
  ) throw new Error("Encrypted envelope has an invalid size");
  const plaintext = aesOpen(vaultKey, {
    iv,
    tag: packed.subarray(packed.length - 16),
    ciphertext: packed.subarray(0, packed.length - 16)
  }, aad);
  try {
    return validateChange(JSON.parse(plaintext.toString("utf8")), envelope);
  } finally {
    plaintext.fill(0);
  }
}

function storeEnvelopes(envelopes) {
  const current = config();
  if (!Array.isArray(envelopes) || envelopes.length < 1 || envelopes.length > 100) throw new Error("Envelope batch must contain 1-100 items");
  const insertEnvelope = database.prepare("insert or ignore into encrypted_envelopes(change_key, object_key, iv, tag, ciphertext, received_at) values (?, ?, ?, ?, ?, ?)");
  const upsertObject = database.prepare("insert into encrypted_objects(object_key, version_key, iv, tag, ciphertext, updated_at) values (?, ?, ?, ?, ?, ?) on conflict(object_key) do update set version_key=excluded.version_key, iv=excluded.iv, tag=excluded.tag, ciphertext=excluded.ciphertext, updated_at=excluded.updated_at");
  const insertVersion = database.prepare("insert or ignore into encrypted_versions(version_key, object_key, parent_key, iv, tag, ciphertext, created_at) values (?, ?, ?, ?, ?, ?, ?)");
  const findVersion = database.prepare("select 1 as found from encrypted_versions where version_key = ?");
  const findObject = database.prepare("select version_key from encrypted_objects where object_key = ?");
  const historyUsage = database.prepare(`
    select
      (select count(*) from encrypted_versions) as versions,
      coalesce((select sum(length(iv) + length(tag) + length(ciphertext)) from encrypted_envelopes), 0)
        + coalesce((select sum(length(iv) + length(tag) + length(ciphertext)) from encrypted_versions), 0)
        + coalesce((select sum(length(iv) + length(tag) + length(ciphertext)) from encrypted_objects), 0) as bytes
  `);
  const accepted = [];
  database.exec("begin immediate");
  try {
    for (const envelope of envelopes) {
      const change = decryptBrowserEnvelope(envelope, current.vault_id);
      const changeKey = opaqueKey("change", change.changeId);
      const objectKey = opaqueKey("object", change.objectId);
      const versionKey = opaqueKey("version", change.changeId);
      if (findVersion.get(versionKey)) {
        accepted.push(change.changeId);
        continue;
      }
      const parentKey = change.baseVersionId ? opaqueKey("version", change.baseVersionId) : null;
      const sealed = sealJson(envelope, `envelope:${changeKey}`);
      const usage = historyUsage.get();
      const sealedBytes = sealed.iv.length + sealed.tag.length + sealed.ciphertext.length;
      if (Number(usage.versions) >= MAX_HISTORY_VERSIONS || Number(usage.bytes) + sealedBytes * 3 > MAX_RECORD_STORAGE_BYTES) {
        throw exposedError("Encrypted desktop history limit reached; increase the configured limit or archive the vault before continuing", 507);
      }
      const now = new Date().toISOString();
      insertEnvelope.run(changeKey, objectKey, sealed.iv, sealed.tag, sealed.ciphertext, now);
      insertVersion.run(versionKey, objectKey, parentKey, sealed.iv, sealed.tag, sealed.ciphertext, change.createdAt);
      const pointer = findObject.get(objectKey);
      if (!pointer || pointer.version_key === parentKey) {
        upsertObject.run(objectKey, versionKey, sealed.iv, sealed.tag, sealed.ciphertext, change.createdAt);
      }
      accepted.push(change.changeId);
    }
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
  return accepted;
}

function currentStatus() {
  const current = config();
  const counts = database.prepare(`
    select
      (select count(*) from encrypted_objects) as objects,
      (select count(*) from encrypted_versions) as versions,
      (select count(*) from encrypted_media) as media,
      (select count(*) from backup_log) as backups,
      coalesce((select sum(byte_length) from encrypted_media), 0) as media_bytes,
      coalesce((select sum(length(iv) + length(tag) + length(ciphertext)) from encrypted_envelopes), 0)
        + coalesce((select sum(length(iv) + length(tag) + length(ciphertext)) from encrypted_versions), 0)
        + coalesce((select sum(length(iv) + length(tag) + length(ciphertext)) from encrypted_objects), 0) as record_bytes
  `).get();
  return {
    configured: Boolean(current),
    unlocked: Boolean(vaultKey),
    vaultId: current?.vault_id || null,
    deviceId: current?.device_id || null,
    keyVersion: current?.key_version || null,
    counts: { objects: Number(counts.objects), versions: Number(counts.versions), media: Number(counts.media) },
    storage: {
      recordBytes: Number(counts.record_bytes),
      mediaBytes: Number(counts.media_bytes),
      backups: Number(counts.backups),
      limits: {
        recordBytes: MAX_RECORD_STORAGE_BYTES,
        versions: MAX_HISTORY_VERSIONS,
        mediaBytes: MAX_MEDIA_LIBRARY_BYTES,
        backups: MAX_BACKUPS
      }
    },
    autoLockMinutes: Math.round(AUTO_LOCK_MS / 60_000)
  };
}

async function setup(request) {
  if (config()) throw Object.assign(new Error("Desktop vault is already configured"), { status: 409 });
  const body = await readJson(request);
  if (!sameSecret(String(body.setupCode || ""), setupCode)) {
    throw Object.assign(new Error("Desktop pairing code is incorrect"), { status: 401 });
  }
  const password = passwordValue(body.password);
  const salt = randomBytes(16);
  const parameters = { algorithm: "argon2id", salt: b64(salt), memory: 65_536, passes: 3, parallelism: 4, tagLength: 32 };
  const passwordKey = derivePasswordKey(password, parameters);
  const nextVaultKey = randomBytes(32);
  const sealed = aesSeal(passwordKey, nextVaultKey, "unigentamos-vault-key-v1");
  passwordKey.fill(0);
  const vaultId = randomUUID();
  const deviceId = randomUUID();
  const createdAt = new Date().toISOString();
  database.prepare("insert into vault_config(id, vault_id, device_id, key_version, kdf_json, wrap_iv, wrap_tag, wrapped_key, created_at) values (1, ?, ?, 1, ?, ?, ?, ?, ?)")
    .run(vaultId, deviceId, JSON.stringify(parameters), sealed.iv, sealed.tag, sealed.ciphertext, createdAt);
  vaultKey = nextVaultKey;
  const recoveryPackage = {
    format: "unigentamos-vault-recovery-v1",
    vaultId,
    keyVersion: 1,
    keyEnvelope: browserKeyEnvelope(password, vaultKey, 1),
    createdAt
  };
  return { capability: issueCapability(), recoveryPackage, status: currentStatus() };
}

async function unlock(request) {
  const current = config();
  if (!current) throw Object.assign(new Error("Desktop vault is not configured"), { status: 409 });
  failedUnlocks = failedUnlocks.filter((at) => Date.now() - at < 15 * 60_000);
  if (failedUnlocks.length >= 5) throw Object.assign(new Error("Too many failed unlock attempts; wait before retrying"), { status: 429 });
  const body = await readJson(request);
  const password = passwordValue(body.password);
  const parameters = JSON.parse(current.kdf_json);
  const passwordKey = derivePasswordKey(password, parameters);
  try {
    vaultKey = aesOpen(passwordKey, {
      iv: Buffer.from(current.wrap_iv),
      tag: Buffer.from(current.wrap_tag),
      ciphertext: Buffer.from(current.wrapped_key)
    }, "unigentamos-vault-key-v1");
  } catch {
    failedUnlocks.push(Date.now());
    throw Object.assign(new Error("Vault password is incorrect or the key envelope is damaged"), { status: 401 });
  } finally {
    passwordKey.fill(0);
  }
  failedUnlocks = [];
  return {
    capability: issueCapability(),
    recoveryPackage: {
      format: "unigentamos-vault-recovery-v1",
      vaultId: current.vault_id,
      keyVersion: current.key_version,
      keyEnvelope: browserKeyEnvelope(password, vaultKey, current.key_version),
      createdAt: current.created_at
    },
    status: currentStatus()
  };
}

let mediaUploadActive = false;

async function storeMedia(request, digest) {
  if (mediaUploadActive) throw exposedError("Another encrypted media upload is already in progress", 429);
  mediaUploadActive = true;
  let plaintext = null;
  let temporary = null;
  let installedTarget = null;
  try {
    plaintext = await readBody(request, MAX_MEDIA_BYTES);
    const normalizedDigest = digest.toLowerCase();
    const actual = createHash("sha256").update(plaintext).digest("hex");
    if (!sameSecret(actual, normalizedDigest)) throw Object.assign(new Error("Media digest does not match its content"), { status: 400 });
    const digestKey = opaqueKey("media", normalizedDigest);
    const existing = database.prepare("select byte_length from encrypted_media where digest_key = ?").get(digestKey);
    if (existing) return { digest: normalizedDigest, byteLength: Math.max(0, Number(existing.byte_length) - 36), alreadyStored: true };

    const target = join(MEDIA_ROOT, normalizedDigest.slice(0, 2), `${normalizedDigest}.uvblob`);
    const sealed = aesSeal(vaultKey, plaintext, `media:${normalizedDigest}`);
    const packed = Buffer.concat([Buffer.from("UVBLOB01"), sealed.iv, sealed.tag, sealed.ciphertext]);
    const usage = database.prepare("select coalesce(sum(byte_length), 0) as bytes from encrypted_media").get();
    if (Number(usage.bytes) + packed.length > MAX_MEDIA_LIBRARY_BYTES) {
      throw exposedError("Encrypted media library limit reached; increase the configured limit or move the vault to larger storage", 507);
    }

    await mkdir(dirname(target), { recursive: true });
    temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
    await writeFile(temporary, packed, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
    temporary = null;
    installedTarget = target;
    const manifest = sealJson({ digest: normalizedDigest, byteLength: plaintext.length, path: target.slice(ROOT.length + 1) }, `media-manifest:${digestKey}`);
    database.prepare("insert into encrypted_media(digest_key, iv, tag, manifest, byte_length, stored_at) values (?, ?, ?, ?, ?, ?)")
      .run(digestKey, manifest.iv, manifest.tag, manifest.ciphertext, packed.length, new Date().toISOString());
    installedTarget = null;
    return { digest: normalizedDigest, byteLength: plaintext.length, alreadyStored: false };
  } catch (error) {
    if (temporary) await rm(temporary, { force: true }).catch(() => {});
    if (installedTarget) await rm(installedTarget, { force: true }).catch(() => {});
    throw error;
  } finally {
    if (plaintext) plaintext.fill(0);
    mediaUploadActive = false;
  }
}

async function readMedia(digest) {
  const target = join(MEDIA_ROOT, digest.slice(0, 2).toLowerCase(), `${digest.toLowerCase()}.uvblob`);
  const packed = await readFile(target);
  if (packed.subarray(0, 8).toString() !== "UVBLOB01" || packed.length < 37) throw new Error("Encrypted media file is damaged");
  return aesOpen(vaultKey, { iv: packed.subarray(8, 20), tag: packed.subarray(20, 36), ciphertext: packed.subarray(36) }, `media:${digest.toLowerCase()}`);
}

async function activeBackupCount() {
  const rows = database.prepare("select id from backup_log").all();
  const missing = [];
  let count = 0;
  for (const row of rows) {
    const target = resolve(BACKUP_ROOT, row.id);
    const relativeTarget = relative(BACKUP_ROOT, target);
    if (!relativeTarget || relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) throw new Error("Recorded backup target is invalid");
    try {
      await stat(target);
      count += 1;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      missing.push(row.id);
    }
  }
  if (missing.length > 0) {
    const removeLog = database.prepare("delete from backup_log where id = ?");
    database.exec("begin immediate");
    try {
      for (const id of missing) removeLog.run(id);
      database.exec("commit");
    } catch (error) {
      database.exec("rollback");
      throw error;
    }
  }
  return count;
}

async function createBackup() {
  const backupCount = await activeBackupCount();
  if (backupCount >= MAX_BACKUPS) {
    throw exposedError("Encrypted backup limit reached; move an older verified backup out of the configured backup directory before creating another", 507);
  }
  const id = `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${randomBytes(4).toString("hex")}`;
  const target = resolve(BACKUP_ROOT, id);
  const relativeTarget = relative(BACKUP_ROOT, target);
  if (!isAbsolute(target) || !relativeTarget || relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) throw new Error("Backup target is invalid");
  await mkdir(target, { recursive: false });
  try {
    await backupDatabase(database, join(target, "vault.sqlite3"));
    try {
      await stat(MEDIA_ROOT);
      await cp(MEDIA_ROOT, join(target, "media"), { recursive: true, errorOnExist: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const pathKey = opaqueKey("backup", target);
    database.prepare("insert into backup_log(id, path_key, created_at) values (?, ?, ?)").run(id, pathKey, new Date().toISOString());
  } catch (error) {
    await rm(target, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return {
    backupId: id,
    location: process.env.UNIGENTAMOS_VAULT_BACKUP_DIR
      ? "configured encrypted backup directory"
      : "local encrypted backup directory"
  };
}

const server = createServer(async (request, response) => {
  const origin = approvedOrigin(request);
  try {
    if (request.method === "OPTIONS") {
      if (!origin) return sendJson(response, 403, { ok: false, error: "Origin is not allowed" });
      response.writeHead(204, { ...corsHeaders(origin), "Cache-Control": "no-store" });
      return response.end();
    }
    const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { ok: true, version: VERSION, configured: Boolean(config()), unlocked: Boolean(vaultKey), pairingRequired: !config() }, origin);
    }
    if (!origin) throw Object.assign(new Error("Origin is not allowed"), { status: 403 });
    if (request.method === "POST" && url.pathname === "/v1/setup") {
      return sendJson(response, 201, { ok: true, ...(await setup(request)) }, origin);
    }
    if (request.method === "POST" && url.pathname === "/v1/unlock") {
      return sendJson(response, 200, { ok: true, ...(await unlock(request)) }, origin);
    }
    requireCapability(request);
    if (request.method === "POST" && url.pathname === "/v1/lock") {
      lockVault();
      return sendJson(response, 200, { ok: true }, origin);
    }
    if (request.method === "GET" && url.pathname === "/v1/status") {
      return sendJson(response, 200, { ok: true, status: currentStatus() }, origin);
    }
    if (request.method === "POST" && url.pathname === "/v1/envelopes") {
      const body = await readJson(request);
      return sendJson(response, 200, { ok: true, acceptedChangeIds: storeEnvelopes(body.envelopes) }, origin);
    }
    if (request.method === "POST" && url.pathname === "/v1/backups") {
      return sendJson(response, 201, { ok: true, ...(await createBackup()) }, origin);
    }
    const mediaMatch = url.pathname.match(/^\/v1\/media\/([0-9a-f]{64})$/i);
    if (mediaMatch && request.method === "PUT") {
      return sendJson(response, 201, { ok: true, ...(await storeMedia(request, mediaMatch[1])) }, origin);
    }
    if (mediaMatch && request.method === "GET") {
      const plaintext = await readMedia(mediaMatch[1]);
      response.writeHead(200, {
        ...corsHeaders(origin),
        "Cache-Control": "no-store, private",
        "Content-Type": "application/octet-stream",
        "Content-Length": plaintext.length,
        "X-Content-Type-Options": "nosniff"
      });
      response.end(plaintext);
      return;
    }
    return sendJson(response, 404, { ok: false, error: "Endpoint not found" }, origin);
  } catch (error) {
    const status = Number(error?.status) || (error?.code === "ENOENT" ? 404 : 500);
    const safe = status >= 500 && !error?.expose ? "Vault companion request failed" : error.message;
    return sendJson(response, status, { ok: false, error: safe }, origin);
  }
});

server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
server.listen(PORT, HOST, () => {
  process.stdout.write(`Unigentamos Vault Companion ${VERSION} listening on ${HOST}:${PORT}\n`);
  if (!config()) process.stdout.write(`Desktop pairing code: ${setupCode}\n`);
});

const autoLock = setInterval(() => {
  if (vaultKey && Date.now() - lastAuthorizedAt > AUTO_LOCK_MS) lockVault();
}, 30_000);
autoLock.unref();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    lockVault();
    database.close();
    server.close(() => process.exit(0));
  });
}
