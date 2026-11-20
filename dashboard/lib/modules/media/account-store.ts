import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
const BUCKET = "account-media";
export const ACCOUNT_CHUNK_SIZE = 1048576;
export function mediaKey(id: string, index: number) {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id) || !Number.isInteger(index) || index < 0 || index > 255) throw new Error("Invalid media identity");
  return `${id}/${index}`;
}
export async function accountChunk(id: string, index: number, bytes?: Buffer): Promise<Buffer> {
  const key = mediaKey(id, index);
  if (bytes && (!bytes.length || bytes.length > ACCOUNT_CHUNK_SIZE)) throw new Error("Invalid chunk size");
  const result = await accountObject(key, bytes);
  if (!result) throw new Error("Media storage request failed");
  return result;
}

/** Immutable derived artwork, stored alongside its account file inside the same private bucket. */
export async function accountThumbnail(id: string, digest: string, bytes?: Buffer) {
  mediaKey(id, 0);
  if (!/^[a-f0-9]{64}$/.test(digest) || (bytes && bytes.length > 256 * 1024)) throw new Error("Invalid thumbnail");
  return accountObject(id + "/preview-" + digest + ".webp", bytes);
}

async function accountObject(key: string, bytes?: Buffer): Promise<Buffer | null> {
  if (process.env.FREMEN_DATA_DIR && !process.env.VERCEL) {
    const file = path.join(process.env.FREMEN_DATA_DIR, "account-media", key);
    if (bytes) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes, { flag: "wx" }); return bytes; }
    try { return await fs.readFile(file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, ""), secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Media storage unavailable");
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${key}`, {
    method: bytes ? "POST" : "GET", headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/octet-stream", "x-upsert": "false" },
    ...(bytes ? { body: new Uint8Array(bytes) } : {}), cache: "no-store"
  });
  if (!bytes && !response.ok && (response.status === 404 || (response.status === 400 && (await response.json().catch(()=>null))?.statusCode === "404"))) return null;
  if (!response.ok) throw new Error("Media storage request failed");
  return bytes || Buffer.from(await response.arrayBuffer());
}
