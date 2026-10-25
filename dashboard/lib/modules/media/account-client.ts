"use client";
import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import { browserVault } from "../../local-first/browser-engine";
import type { VaultObjectSnapshot } from "../../local-first/types";
import type { PersonalRecord } from "../../personal-records-store";
import type { MediaProfile } from "./profile";
export function mediaSnapshot(record: PersonalRecord): VaultObjectSnapshot {
  return { objectId: record.mediaProfile!.manifest.objectId, objectKind: "media", versionId: record.updatedAt, updatedAt: record.updatedAt, tombstone: false,
    hlc: { wallMs: Date.parse(record.updatedAt), counter: 0, deviceId: "account" }, fieldClocks: {},
    fields: { id: record.id, title: record.title, body: record.body, mediaManifest: record.mediaProfile!.manifest, mediaProfile: record.mediaProfile } as never };
}
export function accountFile(object: VaultObjectSnapshot) { return (object.fields.mediaProfile as unknown as MediaProfile)?.accountFile; }
async function post(body: unknown, signal?: AbortSignal): Promise<{ record: PersonalRecord }> {
  const response = await fetch("/api/media/files", { method: "POST", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify(body), signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Media could not be saved");
  return result;
}
export async function uploadAccountFile(file: File, progress: (done: number, total: number) => void, signal?: AbortSignal, original?: VaultObjectSnapshot) {
  if (!file.size || file.size > 268435456) throw new Error("Choose a file up to 256 MB");
  let expectedUpdatedAt: string | undefined;
  if (original) {
    const response = await fetch("/api/personal/records", { cache: "no-store" });
    if (!response.ok) throw new Error("Original file could not be checked");
    const current = ((await response.json()).items as PersonalRecord[]).find(record => record.id === original.fields.id);
    const originalProfile = original.fields.mediaProfile as unknown as MediaProfile;
    if (!current?.mediaProfile || current.mediaProfile.manifest.contentRoot !== originalProfile.manifest.contentRoot) throw new Error("Original file changed. Reopen it before copying.");
    expectedUpdatedAt = current.updatedAt;
  }
  const bytes = await file.arrayBuffer();
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
  const chunkSize = 1048576, totalChunks = Math.ceil(file.size / chunkSize), id = crypto.randomUUID();
  for (let index = 0; index < totalChunks; index++) {
    signal?.throwIfAborted();
    const chunk = new Uint8Array(bytes.slice(index * chunkSize, (index + 1) * chunkSize));
    let binary = ""; for (let p = 0; p < chunk.length; p += 8192) binary += String.fromCharCode(...chunk.subarray(p, p + 8192));
    await post({ action: "chunk", id, index, data: btoa(binary) }, signal); progress(index + 1, totalChunks);
  }
  const result = await post({ action: "finish", file: { id, sha256, byteLength: file.size, chunkSize, totalChunks }, name: file.name, mimeType: file.type, recordId: original?.fields.id, expectedUpdatedAt }, signal);
  return mediaSnapshot(result.record);
}
export async function openMediaFile(object: VaultObjectSnapshot) {
  const file = accountFile(object);
  if (!file) return browserVault.openMedia(object);
  const parts: ArrayBuffer[] = [];
  for (let index = 0; index < file.totalChunks; index++) {
    const response = await fetch(`/api/media/files?${new URLSearchParams({ record: String(object.fields.id), chunk: String(index) })}`, { cache: "no-store" });
    if (!response.ok) throw new Error("File could not be loaded");
    parts.push(await response.arrayBuffer());
  }
  const profile = object.fields.mediaProfile as unknown as MediaProfile;
  const blob = new Blob(parts, { type: profile.manifest.mimeType });
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), b => b.toString(16).padStart(2, "0")).join("");
  if (hash !== file.sha256 || blob.size !== file.byteLength) throw new Error("File integrity verification failed");
  return { blob, manifest: profile.manifest };
}
export async function saveMediaDetails(object: VaultObjectSnapshot, fields: Record<string, unknown>) {
  if (!accountFile(object) && browserVault.isUnlocked()) return browserVault.saveCanonicalFields(object, fields as never);
  const result = await post({ action: "edit", recordId: object.fields.id, expectedUpdatedAt: object.updatedAt, title: fields.title ?? object.fields.title, description: fields.body ?? object.fields.body, profile: fields.mediaProfile ?? object.fields.mediaProfile });
  return mediaSnapshot(result.record);
}
