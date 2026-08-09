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
import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import process from "node:process";
import { DatabaseSync, backup as backupDatabase } from "node:sqlite";

const VERSION = "0.3.0";
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
const AUTO_BACKUP_MS = integerEnv("UNIGENTAMOS_VAULT_AUTO_BACKUP_MS", 7 * 24 * 60 * 60_000, 60 * 60_000, 365 * 24 * 60 * 60_000);
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
    created_at text not null,
    verified_at text,
    manifest_hash text
  ) strict;
  create table if not exists restore_log (
    id text primary key,
    backup_id text not null,
    restored_versions integer not null,
    restored_media_files integer not null,
    created_at text not null
  ) strict;
`);
const mediaColumns = database.prepare("pragma table_info(encrypted_media)").all();
if (!mediaColumns.some((column) => column.name === "byte_length")) {
  database.exec("alter table encrypted_media add column byte_length integer not null default 0");
}
const backupColumns = database.prepare("pragma table_info(backup_log)").all();
if (!backupColumns.some((column) => column.name === "verified_at")) database.exec("alter table backup_log add column verified_at text");
if (!backupColumns.some((column) => column.name === "manifest_hash")) database.exec("alter table backup_log add column manifest_hash text");
database.enableDefensive(true);

let vaultKey = null;
let capabilityToken = null;
let lastAuthorizedAt = 0;
let automaticBackupRunning = false;
let lastAutomaticBackupError = null;
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
    || change.restoredFromVersionId !== undefined && (typeof change.restoredFromVersionId !== "string" || !UUID.test(change.restoredFromVersionId))
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
    "Access-Control-Allow-Headers": "authorization, content-type, x-unigentamos-digest-algorithm, x-unigentamos-chunk-size",
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

function sendPairingHelper(response) {
  const configured = Boolean(config());
  const title = configured ? "Desktop vault connected" : "Your desktop pairing code";
  const detail = configured
    ? "This Windows companion already owns a vault. Return to Unigentamos and enter the vault password to connect this browser."
    : "Enter this one-time code in Unigentamos on this Windows desktop. It can only be used before the desktop vault is created.";
  const pairing = configured
    ? '<div class="ready" aria-label="Companion status">Companion ready</div>'
    : `<div class="code" aria-label="Desktop pairing code">${setupCode}</div>`;
  const payload = Buffer.from(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · Unigentamos</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #eef3f0; color: #17312c; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; }
    main { width: min(100%, 520px); padding: 32px; border: 1px solid rgba(23,49,44,.12); border-radius: 20px; background: #fff; box-shadow: 0 18px 60px rgba(23,49,44,.10); }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; font-weight: 800; }
    .mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 10px; color: #fff; background: #1f5a49; }
    .eyebrow { margin: 0 0 7px; color: #628077; font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(28px, 7vw, 40px); line-height: 1.06; letter-spacing: -.04em; text-wrap: balance; }
    p { margin: 16px 0 0; color: #536a62; font-size: 16px; line-height: 1.6; text-wrap: pretty; }
    .code { margin: 28px 0 8px; padding: 20px; border-radius: 14px; color: #17312c; background: #e6f2ed; font-size: clamp(40px, 12vw, 64px); font-weight: 850; letter-spacing: .12em; text-align: center; font-variant-numeric: tabular-nums; }
    .ready { margin: 28px 0 8px; padding: 18px; border-radius: 14px; color: #15563f; background: #e6f2ed; font-size: 20px; font-weight: 800; text-align: center; }
    .local { margin-top: 18px; color: #71837d; font-size: 13px; }
    a { display: inline-flex; min-height: 44px; align-items: center; margin-top: 24px; border-radius: 9px; padding: 0 16px; color: #fff; background: #1f5a49; font-weight: 800; text-decoration: none; }
    a:focus-visible { outline: 3px solid rgba(31,90,73,.25); outline-offset: 3px; }
  </style>
</head>
<body>
  <main>
    <div class="brand"><span class="mark">U</span> Unigentamos</div>
    <p class="eyebrow">Windows vault companion</p>
    <h1>${title}</h1>
    <p>${detail}</p>
    ${pairing}
    <p class="local">This page comes directly from the companion on this PC. Nothing on it is sent to the internet.</p>
    <a href="https://unigentamos.com/vault">Return to Vault setup</a>
  </main>
</body>
</html>`);
  response.writeHead(200, {
    "Cache-Control": "no-store, private",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": payload.length,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
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

function backupDestination() {
  if (!process.env.UNIGENTAMOS_VAULT_BACKUP_DIR) return "vault-folder";
  return parse(BACKUP_ROOT).root.toLocaleLowerCase() === parse(ROOT).root.toLocaleLowerCase()
    ? "custom-folder"
    : "separate-drive";
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
  const backupHealth = database.prepare(`
    select max(created_at) as last_created_at, max(verified_at) as last_verified_at
    from backup_log
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
    backup: {
      destination: backupDestination(),
      count: Number(counts.backups),
      limit: MAX_BACKUPS,
      lastCreatedAt: backupHealth.last_created_at || null,
      lastVerifiedAt: backupHealth.last_verified_at || null,
      automaticEveryDays: Math.max(1, Math.round(AUTO_BACKUP_MS / (24 * 60 * 60_000))),
      lastAutomaticError: lastAutomaticBackupError
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
  void maybeCreateScheduledBackup();
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
  void maybeCreateScheduledBackup();
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

function chunkRootV1(plaintext, chunkSize) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 8 * 1024 * 1024) {
    throw Object.assign(new Error("Media chunk size is invalid"), { status: 400 });
  }
  const root = createHash("sha256");
  root.update(`unigentamos-media-root-v1:${plaintext.length}:${chunkSize}:`);
  for (let offset = 0; offset < plaintext.length; offset += chunkSize) {
    root.update(createHash("sha256").update(plaintext.subarray(offset, Math.min(plaintext.length, offset + chunkSize))).digest());
  }
  return root.digest("hex");
}

async function storeMedia(request, digest) {
  if (mediaUploadActive) throw exposedError("Another encrypted media upload is already in progress", 429);
  mediaUploadActive = true;
  let plaintext = null;
  let temporary = null;
  let installedTarget = null;
  try {
    plaintext = await readBody(request, MAX_MEDIA_BYTES);
    const normalizedDigest = digest.toLowerCase();
    const digestAlgorithm = request.headers["x-unigentamos-digest-algorithm"] || "sha256";
    const actual = digestAlgorithm === "chunk-root-v1"
      ? chunkRootV1(plaintext, Number(request.headers["x-unigentamos-chunk-size"]))
      : digestAlgorithm === "sha256" ? createHash("sha256").update(plaintext).digest("hex") : "";
    if (!actual) throw Object.assign(new Error("Media digest algorithm is invalid"), { status: 400 });
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

function backupTarget(id) {
  if (typeof id !== "string" || !/^[0-9A-Za-z-]{16,120}$/.test(id)) throw exposedError("Backup ID is invalid", 400);
  const target = resolve(BACKUP_ROOT, id);
  const relativeTarget = relative(BACKUP_ROOT, target);
  if (!isAbsolute(target) || !relativeTarget || relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
    throw new Error("Backup target is invalid");
  }
  return target;
}

async function sha256File(path) {
  const digest = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.length;
    digest.update(chunk);
  }
  return { bytes, sha256: digest.digest("hex") };
}

async function encryptedMediaFiles(root, relativeRoot = "media") {
  const output = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = join(root, entry.name);
    const relativePath = `${relativeRoot}/${entry.name}`;
    if (entry.isDirectory()) output.push(...await encryptedMediaFiles(absolute, relativePath));
    else if (entry.isFile() && /^[0-9a-f]{64}\.uvblob$/i.test(entry.name)) {
      output.push({ path: relativePath.replaceAll("\\", "/"), ...await sha256File(absolute) });
    }
  }
  return output;
}

function unsignedManifest(manifest) {
  const { signature: _signature, ...unsigned } = manifest;
  return unsigned;
}

function signBackupManifest(manifest) {
  return createHmac("sha256", vaultKey).update("unigentamos-vault-backup-v1\0").update(JSON.stringify(unsignedManifest(manifest))).digest("hex");
}

function backupSummary(manifest, verified) {
  return {
    backupId: manifest.backupId,
    createdAt: manifest.createdAt,
    verified,
    databaseBytes: manifest.database.bytes,
    mediaFiles: manifest.media.length,
    mediaBytes: manifest.media.reduce((sum, file) => sum + file.bytes, 0)
  };
}

async function readBackupManifest(id, verifyFiles = false) {
  const target = backupTarget(id);
  const manifestPath = join(target, "manifest.json");
  const manifestBytes = await readFile(manifestPath);
  if (manifestBytes.length > MAX_JSON_BYTES) throw new Error("Backup manifest is too large");
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw exposedError("Backup manifest is damaged", 409);
  }
  if (
    !record(manifest)
    || manifest.format !== "unigentamos-vault-backup-v1"
    || manifest.backupId !== id
    || typeof manifest.createdAt !== "string" || !Number.isFinite(Date.parse(manifest.createdAt))
    || typeof manifest.vaultProof !== "string" || !SHA256.test(manifest.vaultProof)
    || !record(manifest.database) || manifest.database.path !== "vault.sqlite3"
    || !Number.isSafeInteger(manifest.database.bytes) || manifest.database.bytes < 1
    || typeof manifest.database.sha256 !== "string" || !SHA256.test(manifest.database.sha256)
    || !Array.isArray(manifest.media)
    || typeof manifest.signature !== "string" || !SHA256.test(manifest.signature)
    || !sameSecret(manifest.vaultProof, createHmac("sha256", vaultKey).update("backup-vault\0").update(config().vault_id).digest("hex"))
    || !sameSecret(manifest.signature, signBackupManifest(manifest))
  ) throw exposedError("Backup does not belong to this vault or its manifest was changed", 409);
  for (const file of manifest.media) {
    if (
      !record(file)
      || typeof file.path !== "string" || !/^media\/[0-9a-f]{2}\/[0-9a-f]{64}\.uvblob$/i.test(file.path)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 37
      || typeof file.sha256 !== "string" || !SHA256.test(file.sha256)
    ) throw exposedError("Backup media manifest is invalid", 409);
  }
  if (verifyFiles) {
    const databaseDigest = await sha256File(join(target, "vault.sqlite3"));
    if (databaseDigest.bytes !== manifest.database.bytes || !sameSecret(databaseDigest.sha256, manifest.database.sha256)) {
      throw exposedError("Backup database failed integrity verification", 409);
    }
    for (const file of manifest.media) {
      const digest = await sha256File(join(target, ...file.path.split("/")));
      if (digest.bytes !== file.bytes || !sameSecret(digest.sha256, file.sha256)) {
        throw exposedError("A backup media file failed integrity verification", 409);
      }
    }
  }
  return { target, manifest, manifestHash: createHash("sha256").update(manifestBytes).digest("hex") };
}

async function activeBackupCount() {
  const rows = database.prepare("select id from backup_log").all();
  const missing = [];
  let count = 0;
  for (const row of rows) {
    const target = backupTarget(row.id);
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
  const target = backupTarget(id);
  await mkdir(target, { recursive: false });
  try {
    await backupDatabase(database, join(target, "vault.sqlite3"));
    try {
      await stat(MEDIA_ROOT);
      await cp(MEDIA_ROOT, join(target, "media"), { recursive: true, errorOnExist: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const createdAt = new Date().toISOString();
    const manifest = {
      format: "unigentamos-vault-backup-v1",
      backupId: id,
      createdAt,
      vaultProof: createHmac("sha256", vaultKey).update("backup-vault\0").update(config().vault_id).digest("hex"),
      database: { path: "vault.sqlite3", ...await sha256File(join(target, "vault.sqlite3")) },
      media: await encryptedMediaFiles(join(target, "media"))
    };
    const signedManifest = { ...manifest, signature: signBackupManifest(manifest) };
    const manifestBytes = Buffer.from(JSON.stringify(signedManifest, null, 2));
    await writeFile(join(target, "manifest.json"), manifestBytes, { flag: "wx", mode: 0o600 });
    const pathKey = opaqueKey("backup", target);
    database.prepare("insert into backup_log(id, path_key, created_at, verified_at, manifest_hash) values (?, ?, ?, ?, ?)")
      .run(id, pathKey, createdAt, createdAt, createHash("sha256").update(manifestBytes).digest("hex"));
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

async function maybeCreateScheduledBackup() {
  if (!vaultKey || automaticBackupRunning) return;
  const current = config();
  if (!current) return;
  const latest = database.prepare("select created_at from backup_log order by created_at desc limit 1").get();
  const baseline = Date.parse(latest?.created_at || current.created_at);
  if (Number.isFinite(baseline) && Date.now() - baseline < AUTO_BACKUP_MS) return;
  automaticBackupRunning = true;
  try {
    const backupCount = await activeBackupCount();
    if (backupCount >= MAX_BACKUPS) {
      lastAutomaticBackupError = "Backup limit reached. Move an older checked backup to safe storage, then make a new one.";
      return;
    }
    await createBackup();
    lastAutomaticBackupError = null;
  } catch (error) {
    lastAutomaticBackupError = error instanceof Error ? error.message : "Automatic encrypted backup failed";
  } finally {
    automaticBackupRunning = false;
  }
}

async function listBackups() {
  await activeBackupCount();
  const rows = database.prepare("select id, verified_at, manifest_hash from backup_log order by created_at desc").all();
  const backups = [];
  for (const row of rows) {
    try {
      const { manifest, manifestHash } = await readBackupManifest(row.id, false);
      backups.push(backupSummary(manifest, Boolean(row.verified_at && row.manifest_hash && sameSecret(row.manifest_hash, manifestHash))));
    } catch {
      backups.push({ backupId: row.id, createdAt: "", verified: false, databaseBytes: 0, mediaFiles: 0, mediaBytes: 0 });
    }
  }
  return backups;
}

async function verifyBackup(id) {
  const { manifest, manifestHash } = await readBackupManifest(id, true);
  database.prepare("update backup_log set verified_at = ?, manifest_hash = ? where id = ?")
    .run(new Date().toISOString(), manifestHash, id);
  return backupSummary(manifest, true);
}

function databaseCounts(db) {
  const row = db.prepare(`
    select
      (select count(*) from encrypted_objects) as objects,
      (select count(*) from encrypted_versions) as versions,
      (select count(*) from encrypted_media) as media
  `).get();
  return { objects: Number(row.objects), versions: Number(row.versions), media: Number(row.media) };
}

async function previewRestore(id) {
  const { target, manifest } = await readBackupManifest(id, true);
  const backup = new DatabaseSync(join(target, "vault.sqlite3"), { readOnly: true });
  try {
    const backupConfig = backup.prepare("select vault_id from vault_config where id = 1").get();
    if (!backupConfig || backupConfig.vault_id !== config().vault_id) throw exposedError("Backup belongs to another vault", 409);
    const currentCounts = databaseCounts(database);
    const backupCounts = databaseCounts(backup);
    const findVersion = database.prepare("select 1 as found from encrypted_versions where version_key = ?");
    const backupVersionKeys = backup.prepare("select version_key from encrypted_versions").all();
    const restorableVersions = backupVersionKeys.reduce((count, row) => count + (findVersion.get(row.version_key) ? 0 : 1), 0);
    let restorableMediaFiles = 0;
    for (const file of manifest.media) {
      try { await stat(join(ROOT, ...file.path.split("/"))); } catch (error) {
        if (error?.code === "ENOENT") restorableMediaFiles += 1;
        else throw error;
      }
    }
    return {
      ...backupSummary(manifest, true),
      currentObjects: currentCounts.objects,
      backupObjects: backupCounts.objects,
      currentVersions: currentCounts.versions,
      backupVersions: backupCounts.versions,
      restorableVersions,
      restorableMediaFiles
    };
  } finally {
    backup.close();
  }
}

async function restoreBackup(id, confirmation) {
  const expectedConfirmation = `RESTORE ${id.slice(-8).toUpperCase()}`;
  if (!sameSecret(String(confirmation || ""), expectedConfirmation)) throw exposedError(`Type ${expectedConfirmation} to restore this backup`, 400);
  const { target, manifest } = await readBackupManifest(id, true);
  const backup = new DatabaseSync(join(target, "vault.sqlite3"), { readOnly: true });
  let restoredMediaFiles = 0;
  try {
    const backupConfig = backup.prepare("select vault_id from vault_config where id = 1").get();
    if (!backupConfig || backupConfig.vault_id !== config().vault_id) throw exposedError("Backup belongs to another vault", 409);
    const envelopes = backup.prepare("select change_key, object_key, iv, tag, ciphertext, received_at from encrypted_envelopes order by sequence").all();
    const versions = backup.prepare("select version_key, object_key, parent_key, iv, tag, ciphertext, created_at from encrypted_versions order by created_at").all();
    const objects = backup.prepare("select object_key, version_key, iv, tag, ciphertext, updated_at from encrypted_objects").all();
    const mediaRows = backup.prepare("select digest_key, iv, tag, manifest, byte_length, stored_at from encrypted_media").all();
    const findEnvelope = database.prepare("select 1 as found from encrypted_envelopes where change_key = ?");
    const findVersion = database.prepare("select 1 as found from encrypted_versions where version_key = ?");
    const findObject = database.prepare("select 1 as found from encrypted_objects where object_key = ?");
    const missingEnvelopes = envelopes.filter((row) => !findEnvelope.get(row.change_key));
    const missingVersions = versions.filter((row) => !findVersion.get(row.version_key));
    const missingObjects = objects.filter((row) => !findObject.get(row.object_key));
    const currentUsage = database.prepare(`
      select coalesce((select sum(length(iv) + length(tag) + length(ciphertext)) from encrypted_envelopes), 0)
        + coalesce((select sum(length(iv) + length(tag) + length(ciphertext)) from encrypted_versions), 0)
        + coalesce((select sum(length(iv) + length(tag) + length(ciphertext)) from encrypted_objects), 0) as bytes
    `).get();
    const missingRecordBytes = [...missingEnvelopes, ...missingVersions, ...missingObjects]
      .reduce((total, row) => total + row.iv.length + row.tag.length + row.ciphertext.length, 0);
    const currentCounts = databaseCounts(database);
    if (currentCounts.versions + missingVersions.length > MAX_HISTORY_VERSIONS) {
      throw exposedError("Restoring this backup would exceed the configured history limit", 507);
    }
    if (Number(currentUsage.bytes) + missingRecordBytes > MAX_RECORD_STORAGE_BYTES) {
      throw exposedError("Restoring this backup would exceed the configured encrypted record storage limit", 507);
    }
    for (const file of manifest.media) {
      const source = join(target, ...file.path.split("/"));
      const destination = join(ROOT, ...file.path.split("/"));
      try {
        await stat(destination);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        await mkdir(dirname(destination), { recursive: true });
        await cp(source, destination, { errorOnExist: true });
        restoredMediaFiles += 1;
      }
    }
    const insertEnvelope = database.prepare("insert or ignore into encrypted_envelopes(change_key, object_key, iv, tag, ciphertext, received_at) values (?, ?, ?, ?, ?, ?)");
    const insertVersion = database.prepare("insert or ignore into encrypted_versions(version_key, object_key, parent_key, iv, tag, ciphertext, created_at) values (?, ?, ?, ?, ?, ?, ?)");
    const insertObject = database.prepare("insert or ignore into encrypted_objects(object_key, version_key, iv, tag, ciphertext, updated_at) values (?, ?, ?, ?, ?, ?)");
    const insertMedia = database.prepare("insert or ignore into encrypted_media(digest_key, iv, tag, manifest, byte_length, stored_at) values (?, ?, ?, ?, ?, ?)");
    let restoredVersions = 0;
    database.exec("begin immediate");
    try {
      for (const row of envelopes) insertEnvelope.run(row.change_key, row.object_key, row.iv, row.tag, row.ciphertext, row.received_at);
      for (const row of versions) restoredVersions += Number(insertVersion.run(row.version_key, row.object_key, row.parent_key, row.iv, row.tag, row.ciphertext, row.created_at).changes);
      for (const row of objects) insertObject.run(row.object_key, row.version_key, row.iv, row.tag, row.ciphertext, row.updated_at);
      for (const row of mediaRows) insertMedia.run(row.digest_key, row.iv, row.tag, row.manifest, row.byte_length, row.stored_at);
      const receiptId = randomUUID();
      database.prepare("insert into restore_log(id, backup_id, restored_versions, restored_media_files, created_at) values (?, ?, ?, ?, ?)")
        .run(receiptId, id, restoredVersions, restoredMediaFiles, new Date().toISOString());
      database.exec("commit");
      return { receiptId, restoredVersions, restoredMediaFiles };
    } catch (error) {
      database.exec("rollback");
      throw error;
    }
  } finally {
    backup.close();
  }
}

function storedEnvelopes(afterValue, limitValue) {
  const after = Number(afterValue || 0);
  const limit = Number(limitValue || 10);
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
    throw exposedError("Envelope recovery cursor is invalid", 400);
  }
  const rows = database.prepare("select sequence, change_key, iv, tag, ciphertext from encrypted_envelopes where sequence > ? order by sequence limit ?").all(after, limit + 1);
  const page = rows.slice(0, limit);
  const envelopes = page.map((row) => JSON.parse(aesOpen(vaultKey, {
    iv: Buffer.from(row.iv),
    tag: Buffer.from(row.tag),
    ciphertext: Buffer.from(row.ciphertext)
  }, `envelope:${row.change_key}`).toString("utf8")));
  return {
    envelopes,
    nextCursor: page.length ? Number(page[page.length - 1].sequence) : after,
    hasMore: rows.length > limit
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
    if (request.method === "GET" && url.pathname === "/") {
      return sendPairingHelper(response);
    }
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
    if (request.method === "GET" && url.pathname === "/v1/envelopes") {
      return sendJson(response, 200, { ok: true, ...storedEnvelopes(url.searchParams.get("after"), url.searchParams.get("limit")) }, origin);
    }
    if (request.method === "POST" && url.pathname === "/v1/envelopes") {
      const body = await readJson(request);
      return sendJson(response, 200, { ok: true, acceptedChangeIds: storeEnvelopes(body.envelopes) }, origin);
    }
    if (request.method === "POST" && url.pathname === "/v1/backups") {
      return sendJson(response, 201, { ok: true, ...(await createBackup()) }, origin);
    }
    if (request.method === "GET" && url.pathname === "/v1/backups") {
      return sendJson(response, 200, { ok: true, backups: await listBackups() }, origin);
    }
    const backupMatch = url.pathname.match(/^\/v1\/backups\/([0-9A-Za-z-]{16,120})\/(verify|restore-preview|restore)$/);
    if (backupMatch && request.method === "POST" && backupMatch[2] === "verify") {
      return sendJson(response, 200, { ok: true, backup: await verifyBackup(backupMatch[1]) }, origin);
    }
    if (backupMatch && request.method === "POST" && backupMatch[2] === "restore-preview") {
      return sendJson(response, 200, { ok: true, preview: await previewRestore(backupMatch[1]) }, origin);
    }
    if (backupMatch && request.method === "POST" && backupMatch[2] === "restore") {
      const body = await readJson(request);
      return sendJson(response, 200, { ok: true, ...(await restoreBackup(backupMatch[1], body.confirmation)) }, origin);
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

const automaticBackup = setInterval(() => {
  void maybeCreateScheduledBackup();
}, 60 * 60_000);
automaticBackup.unref();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    lockVault();
    database.close();
    server.close(() => process.exit(0));
  });
}
