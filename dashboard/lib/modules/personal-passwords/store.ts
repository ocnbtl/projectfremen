import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync
} from "node:crypto";
import { getAdminSessionSecret } from "../../auth";
import { mutateJsonFile, readJsonFile } from "../../file-store";
import {
  PERSONAL_PASSWORDS_SCHEMA_VERSION,
  type CredentialDetail,
  type CredentialInput,
  type CredentialSummary,
  type EncryptedCredentialEnvelope,
  type EncryptedCredentialRecord,
  type PersonalPasswordsState
} from "./types";

const FILE_NAME = "personal-passwords.json";
const KEY_CONTEXT = "unigentamos:personal-passwords:v1";
const MAX_ITEMS = 2_000;
let cachedKeyFingerprint = "";
let cachedEncryptionKey: Buffer | null = null;

export class PersonalPasswordsStoreError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PersonalPasswordsStoreError";
    this.status = status;
  }
}

function emptyState(): PersonalPasswordsState {
  return { schemaVersion: PERSONAL_PASSWORDS_SCHEMA_VERSION, items: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown, field: string, maximum: number, required = false): string {
  if (typeof value !== "string") {
    if (required) throw new PersonalPasswordsStoreError(`${field} is required`);
    return "";
  }
  const clean = value.replace(/\u0000/g, "").trim();
  if (required && !clean) throw new PersonalPasswordsStoreError(`${field} is required`);
  if (clean.length > maximum) throw new PersonalPasswordsStoreError(`${field} is too long`);
  return clean;
}

function cleanSecret(value: unknown): string {
  if (typeof value !== "string") throw new PersonalPasswordsStoreError("Password is required");
  const clean = value.replace(/\u0000/g, "");
  if (!clean) throw new PersonalPasswordsStoreError("Password is required");
  if (clean.length > 20_000) throw new PersonalPasswordsStoreError("Password is too long");
  return clean;
}

function normalizeInput(value: unknown): CredentialInput {
  if (!isRecord(value)) throw new PersonalPasswordsStoreError("Credential input must be an object");
  const website = cleanText(value.website, "Website", 2_000);
  if (website) {
    let parsed: URL;
    try {
      parsed = new URL(website);
    } catch {
      throw new PersonalPasswordsStoreError("Website must be a valid http or https URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new PersonalPasswordsStoreError("Website must use http or https");
    }
  }
  return {
    title: cleanText(value.title, "Account", 240, true),
    username: cleanText(value.username, "Username", 1_000),
    secret: cleanSecret(value.secret),
    website,
    notes: cleanText(value.notes, "Notes", 12_000)
  };
}

function envelope(value: unknown): EncryptedCredentialEnvelope {
  if (!isRecord(value)) throw new PersonalPasswordsStoreError("Encrypted password data is malformed", 500);
  if (
    value.version !== 1 ||
    value.algorithm !== "aes-256-gcm" ||
    typeof value.iv !== "string" ||
    typeof value.authTag !== "string" ||
    typeof value.ciphertext !== "string"
  ) {
    throw new PersonalPasswordsStoreError("Encrypted password data is malformed", 500);
  }
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: value.iv,
    authTag: value.authTag,
    ciphertext: value.ciphertext
  };
}

function record(value: unknown): EncryptedCredentialRecord {
  if (!isRecord(value)) throw new PersonalPasswordsStoreError("Encrypted password record is malformed", 500);
  if (
    typeof value.id !== "string" || !value.id.trim() ||
    typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt)) ||
    typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))
  ) {
    throw new PersonalPasswordsStoreError("Encrypted password record is malformed", 500);
  }
  return {
    id: value.id.trim(),
    encrypted: envelope(value.encrypted),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

function normalizeState(value: unknown): PersonalPasswordsState {
  if (!isRecord(value)) return emptyState();
  if (value.schemaVersion !== PERSONAL_PASSWORDS_SCHEMA_VERSION || !Array.isArray(value.items)) {
    throw new PersonalPasswordsStoreError("Encrypted password store uses an unsupported format", 500);
  }
  return {
    schemaVersion: PERSONAL_PASSWORDS_SCHEMA_VERSION,
    items: value.items.slice(0, MAX_ITEMS).map(record)
  };
}

function encryptionKey(): Buffer {
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!adminPassword) {
    throw new PersonalPasswordsStoreError("Password encryption is not configured", 503);
  }
  const keyMaterial = getAdminSessionSecret(adminPassword);
  const fingerprint = createHash("sha256").update(keyMaterial).digest("hex");
  if (cachedEncryptionKey && cachedKeyFingerprint === fingerprint) return cachedEncryptionKey;
  const derived = scryptSync(keyMaterial, KEY_CONTEXT, 32, {
    N: 32_768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  cachedKeyFingerprint = fingerprint;
  cachedEncryptionKey = derived;
  return derived;
}

function encryptCredential(id: string, input: CredentialInput): EncryptedCredentialEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${KEY_CONTEXT}:${id}`));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(input), "utf8"),
    cipher.final()
  ]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptCredential(item: EncryptedCredentialRecord): CredentialInput {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(item.encrypted.iv, "base64")
    );
    decipher.setAAD(Buffer.from(`${KEY_CONTEXT}:${item.id}`));
    decipher.setAuthTag(Buffer.from(item.encrypted.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(item.encrypted.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
    return normalizeInput(JSON.parse(plaintext) as unknown);
  } catch (error) {
    if (error instanceof PersonalPasswordsStoreError) throw error;
    throw new PersonalPasswordsStoreError("A credential could not be decrypted with the configured server key", 500);
  }
}

function detail(item: EncryptedCredentialRecord): CredentialDetail {
  return { id: item.id, ...decryptCredential(item), createdAt: item.createdAt, updatedAt: item.updatedAt };
}

function summary(item: EncryptedCredentialRecord): CredentialSummary {
  const { secret: _secret, ...safe } = detail(item);
  return safe;
}

export async function listCredentialSummaries(): Promise<CredentialSummary[]> {
  const state = normalizeState(await readJsonFile<unknown>(FILE_NAME, emptyState()));
  return state.items.map(summary).sort((left, right) => left.title.localeCompare(right.title));
}

export async function listCredentialDetails(): Promise<CredentialDetail[]> {
  const state = normalizeState(await readJsonFile<unknown>(FILE_NAME, emptyState()));
  return state.items.map(detail).sort((left, right) => left.title.localeCompare(right.title));
}

export async function readCredentialDetail(id: string): Promise<CredentialDetail | null> {
  const cleanId = id.trim();
  if (!cleanId) return null;
  const state = normalizeState(await readJsonFile<unknown>(FILE_NAME, emptyState()));
  const item = state.items.find((candidate) => candidate.id === cleanId);
  return item ? detail(item) : null;
}

export async function createCredential(value: unknown): Promise<CredentialSummary> {
  const input = normalizeInput(value);
  return mutateJsonFile<unknown, CredentialSummary>(FILE_NAME, emptyState(), (raw) => {
    const state = normalizeState(raw);
    if (state.items.length >= MAX_ITEMS) throw new PersonalPasswordsStoreError("Password store limit reached", 409);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const item: EncryptedCredentialRecord = {
      id,
      encrypted: encryptCredential(id, input),
      createdAt: now,
      updatedAt: now
    };
    return {
      value: { ...state, items: [item, ...state.items] },
      result: summary(item)
    };
  });
}

export async function updateCredential(
  id: string,
  expectedUpdatedAt: string,
  value: unknown
): Promise<CredentialSummary> {
  const input = normalizeInput(value);
  return mutateJsonFile<unknown, CredentialSummary>(FILE_NAME, emptyState(), (raw) => {
    const state = normalizeState(raw);
    const index = state.items.findIndex((candidate) => candidate.id === id);
    if (index === -1) throw new PersonalPasswordsStoreError("Credential not found", 404);
    const current = state.items[index];
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new PersonalPasswordsStoreError("This credential changed after it was opened. Refresh and try again.", 409);
    }
    const now = new Date().toISOString();
    const item: EncryptedCredentialRecord = {
      ...current,
      encrypted: encryptCredential(current.id, input),
      updatedAt: now
    };
    const items = [...state.items];
    items[index] = item;
    return { value: { ...state, items }, result: summary(item) };
  });
}

export async function deleteCredential(
  id: string,
  expectedUpdatedAt: string
): Promise<void> {
  await mutateJsonFile<unknown, void>(FILE_NAME, emptyState(), (raw) => {
    const state = normalizeState(raw);
    const current = state.items.find((candidate) => candidate.id === id);
    if (!current) throw new PersonalPasswordsStoreError("Credential not found", 404);
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new PersonalPasswordsStoreError("This credential changed after it was opened. Refresh and try again.", 409);
    }
    return {
      value: { ...state, items: state.items.filter((candidate) => candidate.id !== id) },
      result: undefined
    };
  });
}
