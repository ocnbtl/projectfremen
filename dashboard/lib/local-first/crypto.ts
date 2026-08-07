import {
  VAULT_ENVELOPE_VERSION,
  type EncryptedVaultDeviceDescriptor,
  type EncryptedVaultMediaChunk,
  type EncryptedChangeEnvelope,
  type VaultDeviceDescriptor,
  type VaultChange,
  type VaultKeyEnvelope
} from "./types";

export const PBKDF2_ITERATIONS = 600_000;
const MAX_HLC_COUNTER = 2_147_483_647;
const DEFAULT_MAX_FUTURE_SKEW_MS = 15 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_KINDS = new Set([
  "note", "contact", "resource", "media", "project", "personal_ops", "review", "finance", "settings", "other"
]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable in this environment");
  return globalThis.crypto.subtle;
}

function bytesToBase64(value: Uint8Array<ArrayBufferLike>): string {
  let binary = "";
  for (let index = 0; index < value.length; index += 0x8000) {
    binary += String.fromCharCode(...value.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToHex(value: Uint8Array<ArrayBufferLike>): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mediaChunkAad(input: Pick<EncryptedVaultMediaChunk,
  "format" | "vaultId" | "mediaId" | "contentRoot" | "chunkIndex" | "totalChunks" | "keyVersion" | "plaintextHash"
>): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify([
    input.format,
    input.vaultId,
    input.mediaId,
    input.contentRoot,
    input.chunkIndex,
    input.totalChunks,
    input.keyVersion,
    input.plaintextHash
  ]));
}

export async function sha256Hex(value: ArrayBuffer | Uint8Array<ArrayBufferLike>): Promise<string> {
  const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
  return bytesToHex(new Uint8Array(await subtle().digest("SHA-256", bytes)));
}

export async function mediaContentRoot(input: {
  byteLength: number;
  chunkSize: number;
  plaintextHashes: readonly string[];
}): Promise<string> {
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 1 || !Number.isSafeInteger(input.chunkSize) || input.chunkSize < 1) {
    throw new Error("Media root parameters are invalid");
  }
  const prefix = encoder.encode(`unigentamos-media-root-v1:${input.byteLength}:${input.chunkSize}:`);
  const hashes = input.plaintextHashes.map((hash) => {
    if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error("Media chunk hash is invalid");
    return Uint8Array.from(hash.match(/.{2}/g) || [], (pair) => Number.parseInt(pair, 16));
  });
  const joined = new Uint8Array(prefix.byteLength + hashes.length * 32);
  joined.set(prefix, 0);
  let offset = prefix.byteLength;
  for (const hash of hashes) {
    joined.set(hash, offset);
    offset += hash.byteLength;
  }
  return sha256Hex(joined);
}

export async function encryptVaultMediaChunk(input: {
  vaultId: string;
  mediaId: string;
  contentRoot: string;
  chunkIndex: number;
  totalChunks: number;
  keyVersion: number;
  plaintext: Uint8Array<ArrayBuffer>;
  plaintextHash: string;
}, vaultKey: CryptoKey): Promise<EncryptedVaultMediaChunk> {
  const metadata = {
    format: "unigentamos-vault-media-chunk-v1" as const,
    vaultId: input.vaultId,
    mediaId: input.mediaId,
    contentRoot: input.contentRoot,
    chunkIndex: input.chunkIndex,
    totalChunks: input.totalChunks,
    keyVersion: input.keyVersion,
    plaintextHash: input.plaintextHash
  };
  const aad = mediaChunkAad(metadata);
  const iv = randomBytes(12);
  const ciphertext = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad }, vaultKey, input.plaintext);
  return {
    ...metadata,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    aadHash: bytesToBase64(new Uint8Array(await subtle().digest("SHA-256", aad))),
    byteLength: ciphertext.byteLength
  };
}

export async function decryptVaultMediaChunk(chunk: EncryptedVaultMediaChunk, vaultKey: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const aad = mediaChunkAad(chunk);
  const aadHash = bytesToBase64(new Uint8Array(await subtle().digest("SHA-256", aad)));
  if (aadHash !== chunk.aadHash) throw new Error("Encrypted media metadata failed integrity validation");
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle().decrypt(
      { name: "AES-GCM", iv: base64ToBytes(chunk.iv), additionalData: aad },
      vaultKey,
      base64ToBytes(chunk.ciphertext)
    );
  } catch {
    throw new Error("Encrypted media chunk authentication failed");
  }
  const bytes = new Uint8Array(plaintext);
  if (await sha256Hex(bytes) !== chunk.plaintextHash) throw new Error("Decrypted media chunk failed integrity validation");
  return bytes;
}

async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  if (password.length < 14) throw new Error("Vault password must be at least 14 characters");
  const material = await subtle().importKey("raw", encoder.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const value = new Uint8Array(length);
  globalThis.crypto.getRandomValues(value);
  return value;
}

export async function createVaultKeyEnvelope(password: string, keyVersion = 1): Promise<{
  envelope: VaultKeyEnvelope;
  vaultKey: CryptoKey;
}> {
  const rawVaultKey = randomBytes(32);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await passwordKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = await subtle().encrypt({ name: "AES-GCM", iv }, key, rawVaultKey);
  rawVaultKey.fill(0);
  const unlockedRaw = await subtle().decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const vaultKey = await subtle().importKey("raw", unlockedRaw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return {
    envelope: {
      envelopeVersion: VAULT_ENVELOPE_VERSION,
      kdf: "PBKDF2-SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      keyVersion,
      createdAt: new Date().toISOString()
    },
    vaultKey
  };
}

export async function unlockVaultKey(password: string, envelope: VaultKeyEnvelope): Promise<CryptoKey> {
  if (envelope.envelopeVersion !== VAULT_ENVELOPE_VERSION || envelope.kdf !== "PBKDF2-SHA-256") {
    throw new Error("Unsupported vault-key envelope");
  }
  if (envelope.iterations !== PBKDF2_ITERATIONS) throw new Error("Unsupported vault-key work factor");
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  if (salt.byteLength !== 16 || iv.byteLength !== 12) throw new Error("Vault-key envelope parameters are invalid");
  const key = await passwordKey(password, salt, envelope.iterations);
  let raw: ArrayBuffer;
  try {
    raw = await subtle().decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(envelope.ciphertext));
  } catch {
    throw new Error("Vault password is incorrect or the key envelope is damaged");
  }
  return subtle().importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function envelopeAad(input: {
  envelopeVersion: number;
  vaultId: string;
  changeId: string;
  deviceId: string;
  keyVersion: number;
}): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify([
    input.envelopeVersion,
    input.vaultId,
    input.changeId,
    input.deviceId,
    input.keyVersion
  ]));
}

function deviceDescriptorAad(input: {
  descriptorVersion: number;
  vaultId: string;
  deviceId: string;
  keyVersion: number;
}): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify([
    "unigentamos-vault-device-v1",
    input.descriptorVersion,
    input.vaultId,
    input.deviceId,
    input.keyVersion
  ]));
}

export async function encryptVaultDeviceDescriptor(
  descriptor: VaultDeviceDescriptor,
  vaultKey: CryptoKey,
  keyVersion = 1
): Promise<EncryptedVaultDeviceDescriptor> {
  if (
    descriptor.format !== "unigentamos-vault-device-v1"
    || !UUID.test(descriptor.vaultId)
    || !UUID.test(descriptor.deviceId)
    || !descriptor.deviceName.trim()
    || descriptor.deviceName.length > 120
    || !["windows", "iphone", "ipad", "macbook", "browser"].includes(descriptor.deviceKind)
  ) throw new Error("Vault device descriptor is invalid");
  const metadata = {
    descriptorVersion: VAULT_ENVELOPE_VERSION,
    vaultId: descriptor.vaultId,
    deviceId: descriptor.deviceId,
    keyVersion
  };
  const aad = deviceDescriptorAad(metadata);
  const aadDigest = await subtle().digest("SHA-256", aad);
  const plaintext = encoder.encode(JSON.stringify(descriptor));
  const iv = randomBytes(12);
  const ciphertext = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad }, vaultKey, plaintext);
  plaintext.fill(0);
  return {
    ...metadata,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    aadHash: bytesToBase64(new Uint8Array(aadDigest)),
    byteLength: ciphertext.byteLength
  };
}

export async function decryptVaultDeviceDescriptor(
  descriptor: EncryptedVaultDeviceDescriptor,
  vaultKey: CryptoKey
): Promise<VaultDeviceDescriptor> {
  if (descriptor.descriptorVersion !== VAULT_ENVELOPE_VERSION) {
    throw new Error("Unsupported encrypted device descriptor");
  }
  const aad = deviceDescriptorAad(descriptor);
  const aadDigest = bytesToBase64(new Uint8Array(await subtle().digest("SHA-256", aad)));
  if (aadDigest !== descriptor.aadHash) throw new Error("Encrypted device metadata failed integrity validation");
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle().decrypt(
      { name: "AES-GCM", iv: base64ToBytes(descriptor.iv), additionalData: aad },
      vaultKey,
      base64ToBytes(descriptor.ciphertext)
    );
  } catch {
    throw new Error("Encrypted device descriptor authentication failed");
  }
  const parsed = JSON.parse(decoder.decode(plaintext)) as Partial<VaultDeviceDescriptor>;
  if (
    parsed.format !== "unigentamos-vault-device-v1"
    || parsed.vaultId !== descriptor.vaultId
    || parsed.deviceId !== descriptor.deviceId
    || typeof parsed.deviceName !== "string"
    || !parsed.deviceName.trim()
    || parsed.deviceName.length > 120
    || !["windows", "iphone", "ipad", "macbook", "browser"].includes(String(parsed.deviceKind))
  ) throw new Error("Encrypted device descriptor is invalid");
  return parsed as VaultDeviceDescriptor;
}

export async function encryptVaultChange(
  change: VaultChange,
  vaultId: string,
  vaultKey: CryptoKey,
  keyVersion = 1
): Promise<EncryptedChangeEnvelope> {
  const metadata = {
    envelopeVersion: VAULT_ENVELOPE_VERSION,
    vaultId,
    changeId: change.changeId,
    deviceId: change.deviceId,
    keyVersion
  };
  const aad = envelopeAad(metadata);
  const aadDigest = await subtle().digest("SHA-256", aad);
  const plaintext = encoder.encode(JSON.stringify(change));
  const iv = randomBytes(12);
  const ciphertext = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad }, vaultKey, plaintext);
  plaintext.fill(0);
  return {
    ...metadata,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    aadHash: bytesToBase64(new Uint8Array(aadDigest)),
    byteLength: ciphertext.byteLength
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validatedClock(
  value: unknown,
  field: string,
  options: { expectedDeviceId?: string; serverWallMs?: number; maxFutureSkewMs?: number } = {}
) {
  if (!record(value)) throw new Error(`${field} is invalid`);
  const wallMs = Number(value.wallMs);
  const counter = Number(value.counter);
  const deviceId = typeof value.deviceId === "string" ? value.deviceId : "";
  if (
    !Number.isSafeInteger(wallMs)
    || wallMs < 0
    || wallMs > 8_640_000_000_000_000
    || !Number.isSafeInteger(counter)
    || counter < 0
    || counter > MAX_HLC_COUNTER
    || !UUID.test(deviceId)
    || options.expectedDeviceId && deviceId !== options.expectedDeviceId
  ) throw new Error(`${field} is invalid`);
  if (
    Number.isFinite(options.serverWallMs)
    && wallMs > Number(options.serverWallMs) + (options.maxFutureSkewMs ?? DEFAULT_MAX_FUTURE_SKEW_MS)
  ) throw new Error(`${field} is too far ahead of authenticated server time`);
  return { wallMs, counter, deviceId };
}

function validateVaultChange(
  value: unknown,
  envelope: EncryptedChangeEnvelope,
  options: { serverWallMs?: number; maxFutureSkewMs?: number } = {}
): VaultChange {
  if (!record(value)) throw new Error("Encrypted change payload is invalid");
  if (
    value.protocolVersion !== 1
    || value.changeId !== envelope.changeId
    || value.deviceId !== envelope.deviceId
    || typeof value.objectId !== "string"
    || !UUID.test(value.objectId)
    || typeof value.objectKind !== "string"
    || !OBJECT_KINDS.has(value.objectKind)
    || !record(value.fields)
    || !record(value.fieldClocks)
    || value.baseVersionId !== undefined && (typeof value.baseVersionId !== "string" || !UUID.test(value.baseVersionId))
    || value.restoredFromVersionId !== undefined && (typeof value.restoredFromVersionId !== "string" || !UUID.test(value.restoredFromVersionId))
    || value.tombstone !== undefined && typeof value.tombstone !== "boolean"
    || typeof value.createdAt !== "string"
    || !Number.isFinite(Date.parse(value.createdAt))
  ) throw new Error("Encrypted change payload is invalid");
  validatedClock(value.hlc, "Encrypted change clock", {
    expectedDeviceId: envelope.deviceId,
    serverWallMs: options.serverWallMs,
    maxFutureSkewMs: options.maxFutureSkewMs
  });
  for (const [field, clock] of Object.entries(value.fieldClocks)) {
    if (!field || field.length > 500) throw new Error("Encrypted change field clock is invalid");
    validatedClock(clock, "Encrypted change field clock", {
      serverWallMs: options.serverWallMs,
      maxFutureSkewMs: options.maxFutureSkewMs
    });
  }
  return value as VaultChange;
}

export async function decryptVaultChange(
  envelope: EncryptedChangeEnvelope,
  vaultKey: CryptoKey,
  options: { serverWallMs?: number; maxFutureSkewMs?: number } = {}
): Promise<VaultChange> {
  if (envelope.envelopeVersion !== VAULT_ENVELOPE_VERSION) throw new Error("Unsupported encrypted change envelope");
  const aad = envelopeAad(envelope);
  const aadDigest = bytesToBase64(new Uint8Array(await subtle().digest("SHA-256", aad)));
  if (aadDigest !== envelope.aadHash) throw new Error("Encrypted change metadata failed integrity validation");
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle().decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv), additionalData: aad },
      vaultKey,
      base64ToBytes(envelope.ciphertext)
    );
  } catch {
    throw new Error("Encrypted change authentication failed");
  }
  const parsed = JSON.parse(decoder.decode(plaintext)) as unknown;
  return validateVaultChange(parsed, envelope, options);
}
