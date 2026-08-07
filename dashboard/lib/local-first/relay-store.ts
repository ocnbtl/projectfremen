import type { EncryptedChangeEnvelope, SequencedChangeEnvelope } from "./types";
import { Buffer } from "node:buffer";

const MAX_ENVELOPE_BYTES = 1_100_000;
const MAX_BATCH_ENVELOPES = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

type SupabaseConfig = { url: string; key: string };

function config(): SupabaseConfig {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "") || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !key) throw new Error("Encrypted sync relay is not configured");
  return { url, key };
}

function headers(value: SupabaseConfig): Record<string, string> {
  return {
    apikey: value.key,
    Authorization: `Bearer ${value.key}`,
    "Content-Type": "application/json"
  };
}

function text(value: unknown, field: string, maxLength: number, pattern?: RegExp): string {
  if (typeof value !== "string" || !value || value.length > maxLength || pattern && !pattern.test(value)) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

export function validateVaultId(value: unknown): string {
  return text(value, "vaultId", 36, UUID);
}

export function validateEncryptedEnvelope(value: unknown, expectedVaultId: string): EncryptedChangeEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Encrypted envelope must be an object");
  const raw = value as Record<string, unknown>;
  const vaultId = validateVaultId(raw.vaultId);
  if (vaultId !== expectedVaultId) throw new Error("Encrypted envelope belongs to another vault");
  const changeId = text(raw.changeId, "changeId", 36, UUID);
  const deviceId = text(raw.deviceId, "deviceId", 36, UUID);
  const iv = text(raw.iv, "iv", 64, BASE64);
  const ciphertext = text(raw.ciphertext, "ciphertext", 1_500_000, BASE64);
  const aadHash = text(raw.aadHash, "aadHash", 64, BASE64);
  const ivBytes = Buffer.from(iv, "base64");
  const ciphertextBytes = Buffer.from(ciphertext, "base64");
  const aadHashBytes = Buffer.from(aadHash, "base64");
  const envelopeVersion = Number(raw.envelopeVersion);
  const keyVersion = Number(raw.keyVersion);
  const byteLength = Number(raw.byteLength);
  if (envelopeVersion !== 1 || !Number.isSafeInteger(keyVersion) || keyVersion < 1 || keyVersion > 1_000_000) {
    throw new Error("Encrypted envelope version is invalid");
  }
  if (!Number.isSafeInteger(byteLength) || byteLength < 16 || byteLength > MAX_ENVELOPE_BYTES) {
    throw new Error("Encrypted envelope size is invalid");
  }
  if (
    iv.length % 4 !== 0
    || ciphertext.length % 4 !== 0
    || aadHash.length % 4 !== 0
    || ivBytes.toString("base64") !== iv
    || ciphertextBytes.toString("base64") !== ciphertext
    || aadHashBytes.toString("base64") !== aadHash
    || ivBytes.byteLength !== 12
    || aadHashBytes.byteLength !== 32
    || ciphertextBytes.byteLength !== byteLength
  ) throw new Error("Encrypted envelope encoding or declared size is invalid");
  return { envelopeVersion: 1, vaultId, changeId, deviceId, keyVersion, iv, ciphertext, aadHash, byteLength };
}

export async function pushEncryptedChanges(vaultIdValue: unknown, values: unknown): Promise<string[]> {
  const vaultId = validateVaultId(vaultIdValue);
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_BATCH_ENVELOPES) {
    throw new Error(`envelopes must contain 1-${MAX_BATCH_ENVELOPES} items`);
  }
  const envelopes = values.map((value) => validateEncryptedEnvelope(value, vaultId));
  if (new Set(envelopes.map((item) => item.changeId)).size !== envelopes.length) throw new Error("Envelope batch contains duplicate change IDs");
  const supabase = config();
  const response = await fetch(`${supabase.url}/rest/v1/vault_sync_changes?on_conflict=vault_id,change_id`, {
    method: "POST",
    headers: { ...headers(supabase), Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(envelopes.map((item) => ({
      vault_id: item.vaultId,
      change_id: item.changeId,
      device_id: item.deviceId,
      envelope_version: item.envelopeVersion,
      key_version: item.keyVersion,
      iv: item.iv,
      ciphertext: item.ciphertext,
      aad_hash: item.aadHash,
      byte_length: item.byteLength
    }))),
    cache: "no-store"
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { code?: unknown } | null;
    if (failure?.code === "54000") {
      throw Object.assign(
        new Error("Encrypted sync relay storage limit reached; local changes remain safely queued on this device"),
        { status: 507 }
      );
    }
    throw new Error(`Encrypted sync relay write failed (${response.status})`);
  }
  return envelopes.map((item) => item.changeId);
}

export async function pullEncryptedChanges(
  vaultIdValue: unknown,
  sinceValue: unknown,
  limitValue: unknown
): Promise<SequencedChangeEnvelope[]> {
  const vaultId = validateVaultId(vaultIdValue);
  const since = Number(sinceValue || 0);
  const limit = Math.min(Math.max(Number(limitValue || 200), 1), 500);
  if (!Number.isSafeInteger(since) || since < 0 || !Number.isSafeInteger(limit)) throw new Error("Sync cursor is invalid");
  const query = new URLSearchParams({
    select: "sequence,vault_id,change_id,device_id,envelope_version,key_version,iv,ciphertext,aad_hash,byte_length,received_at",
    vault_id: `eq.${vaultId}`,
    sequence: `gt.${since}`,
    order: "sequence.asc",
    limit: String(limit)
  });
  const supabase = config();
  const response = await fetch(`${supabase.url}/rest/v1/vault_sync_changes?${query.toString()}`, {
    headers: headers(supabase),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Encrypted sync relay read failed (${response.status})`);
  const rows = await response.json() as Array<Record<string, unknown>>;
  if (!Array.isArray(rows)) throw new Error("Encrypted sync relay returned an invalid response");
  return rows.map((row) => ({
    sequence: Number(row.sequence),
    receivedAt: text(row.received_at, "receivedAt", 80),
    ...validateEncryptedEnvelope({
      envelopeVersion: row.envelope_version,
      vaultId: row.vault_id,
      changeId: row.change_id,
      deviceId: row.device_id,
      keyVersion: row.key_version,
      iv: row.iv,
      ciphertext: row.ciphertext,
      aadHash: row.aad_hash,
      byteLength: row.byte_length
    }, vaultId)
  }));
}
