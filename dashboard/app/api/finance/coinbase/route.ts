import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { BankingError } from "../../../../lib/modules/finance/banking-provider";
import { coinbaseView, operateCoinbase } from "../../../../lib/modules/finance/coinbase-service";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
const failure = (error: unknown) => error instanceof BankingError ? json({ ok: false, code: error.code, error: error.message }, error.status)
  : json({ ok: false, error: "Coinbase could not be updated. Try again later." }, 500);
export async function GET() {
  if (!await hasAdminSession()) return json({ ok: false, error: "Unauthorized" }, 401);
  try { return json({ ok: true, coinbase: await coinbaseView() }); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!await hasAdminSession()) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return json({ ok: false, error: "Invalid CSRF token" }, 403);
  try {
    const reader = request.body?.getReader(); if (!reader) throw new BankingError("invalid_request", "Request body required.");
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length;
      if (size > 8192) { await reader.cancel(); throw new BankingError("body_too_large", "Request too large.", 413); } chunks.push(value); }
    } finally { reader.releaseLock(); }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BankingError("invalid_request", "Invalid request.");
    return json({ ok: true, coinbase: await operateCoinbase(body as Record<string, unknown>) });
  } catch (error) { return error instanceof SyntaxError ? json({ ok: false, error: "Invalid request body." }, 400) : failure(error); }
}
