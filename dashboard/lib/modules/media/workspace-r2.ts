import "server-only";
import { AwsClient } from "aws4fetch";
import { accountChunk } from "./account-store";
import type { WorkspaceMedia } from "./workspace-store";

function connection() {
  const {
    WORKSPACE_MEDIA_BACKEND: backend,
    R2_ACCOUNT_ID: account,
    R2_MEDIA_BUCKET: bucket,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
  } = process.env;
  if (
    backend !== "r2-standard" ||
    !account ||
    !/^[a-f0-9]{32}$/i.test(account) ||
    !bucket ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    !accessKeyId ||
    !secretAccessKey
  )
    throw new Error("Workspace media storage needs configuration");
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto", retries: 2 });
  return { client, base: `https://${account}.r2.cloudflarestorage.com/${bucket}` };
}
export function assertR2Configured() {
  connection();
}

export function chunkLength(file: WorkspaceMedia, index: number) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(file.byte_length / file.chunk_size))
    throw new Error("Invalid chunk number");
  return Math.min(file.chunk_size, file.byte_length - index * file.chunk_size);
}
function objectPath(file: WorkspaceMedia, index: number) {
  chunkLength(file, index);
  return `/workspaces/${file.workspace_id}/media/${file.media_id}/chunk-${index}`;
}
export async function directPart(file: WorkspaceMedia, index: number) {
  const { client, base } = connection();
  const url = new URL(base + objectPath(file, index));
  const existing = await client.fetch(url, { method: "HEAD", cache: "no-store", redirect: "error" });
  if (existing.ok) {
    if (existing.headers.get("content-length") !== String(chunkLength(file, index)))
      throw new Error("Stored part has unexpected size");
    return { uploaded: true };
  }
  if (existing.status !== 404) throw new Error("Could not check this upload part");
  const expires = Math.min(300, Math.floor((Date.parse(file.write_deadline || "") - Date.now()) / 1000) - 30);
  if (!Number.isFinite(expires) || expires < 1)
    throw new Error("Upload authorization expired. Retry this part.");
  url.searchParams.set("X-Amz-Expires", String(expires));
  const headers = { "If-None-Match": "*", "x-amz-storage-class": "STANDARD" };
  const signed = await client.sign(url, {
    method: "PUT",
    headers: { ...headers, "Content-Length": String(chunkLength(file, index)) },
    aws: { signQuery: true, allHeaders: true },
  });
  // Browsers supply the signed Content-Length automatically from the Blob.
  return { url: signed.url, headers };
}
export async function readWorkspaceChunk(file: WorkspaceMedia, index: number) {
  const length = chunkLength(file, index);
  if (file.backend === "supabase") {
    const bytes = await accountChunk(file.source_file_id, index);
    if (bytes.length !== length) throw new Error("Stored part has unexpected size");
    return bytes;
  }
  const { client, base } = connection();
  const response = await client.fetch(base + objectPath(file, index), {
    method: "GET",
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok || response.headers.get("content-length") !== String(length)) {
    await response.body?.cancel();
    throw new Error("Stored part is missing or incomplete");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== length) throw new Error("Stored part is incomplete");
  return bytes;
}
export async function removeUnfinishedParts(file: WorkspaceMedia) {
  if (file.backend !== "r2-standard" || file.state !== "discarding")
    throw new Error("Only abandoned uploads can be released");
  const { client, base } = connection();
  for (let i = 0; i < Math.ceil(file.byte_length / file.chunk_size); i++) {
    const response = await client.fetch(base + objectPath(file, i), { method: "DELETE", redirect: "error" });
    if (!response.ok && response.status !== 404) throw new Error("Upload cleanup needs a retry");
    await response.body?.cancel();
  }
}
