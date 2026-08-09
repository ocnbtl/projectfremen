import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { compactVaultRelay } from "../../../../lib/local-first/relay-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

function requestError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private", Date: new Date().toUTCString() }
  });
}

async function readBoundedJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw requestError("Request body must be an object", 400);
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
        throw requestError("Relay cleanup request exceeds 2 MB", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw requestError("Request body must contain valid JSON", 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw requestError("Request body must be an object", 400);
  return value as Record<string, unknown>;
}

function clientError(error: unknown) {
  const message = error instanceof Error ? error.message : "Encrypted relay cleanup failed";
  const requestedStatus = Number((error as { status?: unknown } | null)?.status);
  if (Number.isSafeInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599) {
    return response({ ok: false, error: requestedStatus >= 500 && requestedStatus !== 507 ? "Encrypted relay cleanup is unavailable" : message }, requestedStatus);
  }
  const validation = /invalid|must|contain|device|manifest|limit/i.test(message);
  return response({ ok: false, error: validation ? message : "Encrypted relay cleanup is unavailable" }, validation ? 400 : 503);
}

export async function POST(request: Request) {
  if (!await hasAdminSession()) return response({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return response({ ok: false, error: "Invalid CSRF token" }, 403);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) return response({ ok: false, error: "Relay cleanup request exceeds 2 MB" }, 413);
  try {
    const result = await compactVaultRelay(await readBoundedJson(request));
    return response({ ok: true, ...result, serverTime: new Date().toISOString() });
  } catch (error) {
    return clientError(error);
  }
}
