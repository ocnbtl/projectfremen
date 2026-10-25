import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { readPersonalRecords, createPersonalRecord, updatePersonalRecord } from "../../../../lib/personal-records-store";
import { accountChunk, ACCOUNT_CHUNK_SIZE } from "../../../../lib/modules/media/account-store";
import { normalizeMediaProfile, type MediaProfile } from "../../../../lib/modules/media/profile";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing upload");
  const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 1500000) { await reader.cancel(); throw new Error("Upload too large"); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function GET(request: Request) {
  if (!await hasAdminSession()) return json({ error: "Unauthorized" }, 401);
  try {
    const url = new URL(request.url), record = (await readPersonalRecords()).find(item => item.id === url.searchParams.get("record"));
    const file = record?.mediaProfile?.accountFile, index = Number(url.searchParams.get("chunk"));
    if (!file || !Number.isInteger(index) || index < 0 || index >= file.totalChunks) return json({ error: "File not found" }, 404);
    const bytes = await accountChunk(file.id, index);
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": "attachment" } });
  } catch { return json({ error: "File could not be loaded" }, 503); }
}
export async function POST(request: Request) {
  if (!await hasAdminSession()) return json({ error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return json({ error: "Invalid CSRF token" }, 403);
  try {
    const body = await boundedBody(request);
    if (body.action === "chunk") {
      if (typeof body.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) throw new Error("Invalid upload");
      const bytes = Buffer.from(body.data, "base64");
      if (bytes.toString("base64") !== body.data) throw new Error("Invalid upload");
      await accountChunk(body.id, body.index, bytes);
      return json({ ok: true });
    }
    const records = await readPersonalRecords();
    if (body.action === "finish" && !body.recordId && body.file?.id) {
      const completed = records.find(item => item.mediaProfile?.accountFile?.id === body.file.id && item.mediaProfile?.accountFile?.sha256 === body.file.sha256);
      if (completed) return json({ ok: true, record: completed });
    }
    if (body.action === "edit") {
      const record = records.find(item => item.id === body.recordId && item.className === "file");
      if (!record?.mediaProfile) return json({ error: "File not found" }, 404);
      if (typeof body.expectedUpdatedAt !== "string" || !body.expectedUpdatedAt) throw new Error("Reload this file before saving");
      const profile = normalizeMediaProfile({ ...body.profile, manifest: record.mediaProfile.manifest, accountFile: record.mediaProfile.accountFile })!;
      const items = await updatePersonalRecord(record.id, { title: String(body.title || record.title), body: String(body.description ?? record.body), mediaProfile: profile }, { expectedUpdatedAt: String(body.expectedUpdatedAt || "") });
      return json({ ok: true, record: items.find(item => item.id === record.id) });
    }
    if (body.action !== "finish") throw new Error("Invalid action");
    const file = body.file as NonNullable<MediaProfile["accountFile"]>;
    if (!file || !Number.isSafeInteger(file.byteLength) || file.byteLength < 1 || file.byteLength > 268435456 || file.chunkSize !== ACCOUNT_CHUNK_SIZE || file.totalChunks !== Math.ceil(file.byteLength / ACCOUNT_CHUNK_SIZE)) throw new Error("Invalid file size");
    const original = body.recordId ? records.find(item => item.id === body.recordId && item.className === "file") : undefined;
    if (body.recordId && (!original?.mediaProfile || !body.expectedUpdatedAt)) throw new Error("Reload the original file before copying");
    const originalManifest = original?.mediaProfile?.manifest;
    const hash = createHash("sha256"); let length = 0;
    const originalHash = originalManifest?.format === "unigentamos-vault-media-v1" ? createHash("sha256").update(`unigentamos-media-root-v1:${originalManifest.byteLength}:${originalManifest.chunkSize}:`) : undefined;
    let originalPending = Buffer.alloc(0);
    for (let i = 0; i < file.totalChunks; i++) {
      const bytes = await accountChunk(file.id, i);
      if (bytes.length !== Math.min(ACCOUNT_CHUNK_SIZE, file.byteLength - length)) throw new Error("Incomplete upload");
      length += bytes.length; hash.update(bytes);
      if (originalHash && originalManifest) {
        originalPending = Buffer.concat([originalPending, bytes]);
        while (originalPending.length >= originalManifest.chunkSize) { originalHash.update(createHash("sha256").update(originalPending.subarray(0, originalManifest.chunkSize)).digest()); originalPending = originalPending.subarray(originalManifest.chunkSize); }
      }
    }
    if (hash.digest("hex") !== file.sha256) throw new Error("File verification failed");
    if (originalHash && originalManifest) {
      if (originalPending.length) originalHash.update(createHash("sha256").update(originalPending).digest());
      if (originalHash.digest("hex") !== originalManifest.contentRoot) throw new Error("Copy does not match the encrypted original");
    }
    const existing = body.recordId ? records.find(item => item.id === body.recordId && item.className === "file") : undefined;
    if (body.recordId && !existing?.mediaProfile) throw new Error("Original file not found");
    if (existing?.mediaProfile && existing.mediaProfile.manifest.byteLength !== file.byteLength) throw new Error("Original file size changed");
    const id = existing?.id || `personal-${file.id}`;
    const profile = normalizeMediaProfile({ ...(existing?.mediaProfile || { version: 1, linkedRefs: [], altText: "", manifest: {
      format: "unigentamos-account-media-v1", mediaId: file.id, objectId: file.id, contentRoot: file.sha256, digestAlgorithm: "sha256", fileName: String(body.name || "File").slice(0, 240), mimeType: String(body.mimeType || "application/octet-stream").slice(0, 200), byteLength: file.byteLength, chunkSize: file.chunkSize, totalChunks: file.totalChunks, createdAt: new Date().toISOString()
    } }), accountFile: file })!;
    const items = existing ? await updatePersonalRecord(id, { mediaProfile: profile }, { expectedUpdatedAt: String(body.expectedUpdatedAt || "") }) : await createPersonalRecord({ domain: "notes-docs", className: "file", title: String(body.name || "File"), mediaProfile: profile }, { requestedId: id });
    return json({ ok: true, record: items.find(item => item.id === id) });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Media could not be saved" }, 400); }
}
