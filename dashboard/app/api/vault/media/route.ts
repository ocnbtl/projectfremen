import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { getEncryptedMediaChunk, putEncryptedMediaChunk } from "../../../../lib/local-first/relay-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 2_500_000;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private", Date: new Date().toUTCString() }
  });
}

function clientError(error: unknown) {
  const message = error instanceof Error ? error.message : "Encrypted media relay failed";
  const requestedStatus = Number((error as { status?: unknown } | null)?.status);
  if (Number.isSafeInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599) {
    return response({ ok: false, error: requestedStatus >= 500 && requestedStatus !== 507 ? "Encrypted media relay is unavailable" : message }, requestedStatus);
  }
  const validation = /invalid|must|belongs|integrity|encoding|too large|not found/i.test(message);
  return response({ ok: false, error: validation ? message : "Encrypted media relay is unavailable" }, validation ? 400 : 503);
}

async function readBoundedJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw Object.assign(new Error("Request body must be an object"), { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw Object.assign(new Error("Encrypted media request is too large"), { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Object.assign(new Error("Request body must be an object"), { status: 400 });
  return parsed as Record<string, unknown>;
}

export async function GET(request: Request) {
  if (!await hasAdminSession()) return response({ ok: false, error: "Unauthorized" }, 401);
  try {
    const url = new URL(request.url);
    const chunk = await getEncryptedMediaChunk({
      vaultId: url.searchParams.get("vaultId"),
      mediaId: url.searchParams.get("mediaId"),
      chunkIndex: url.searchParams.get("chunkIndex")
    });
    return response({ ok: true, chunk });
  } catch (error) {
    return clientError(error);
  }
}

export async function POST(request: Request) {
  if (!await hasAdminSession()) return response({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return response({ ok: false, error: "Invalid CSRF token" }, 403);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) return response({ ok: false, error: "Encrypted media request is too large" }, 413);
  try {
    const input = await readBoundedJson(request);
    const stored = await putEncryptedMediaChunk(input.vaultId, input.chunk);
    return response({ ok: true, ...stored }, stored.alreadyStored ? 200 : 201);
  } catch (error) {
    return clientError(error);
  }
}
