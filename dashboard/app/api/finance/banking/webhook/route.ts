import { NextResponse } from "next/server";
import { verifyPlaidWebhook, BankingError, bankingConfig } from "../../../../../lib/modules/finance/banking-provider";
import { handleBankWebhook } from "../../../../../lib/modules/finance/banking-service";

export const runtime = "nodejs";
export const maxDuration = 300;
const json = (status: number) => NextResponse.json({ ok: status === 200 }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
let windowStart = 0, requests = 0;
export async function POST(request: Request) {
  if (!bankingConfig().configured) return json(503);
  // Bound unauthenticated signature-key lookups. Validated syncs also have a durable per-Item lease and cooldown.
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; requests = 0; }
  if (++requests > 60) return json(429);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json(400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65_536) { await reader.cancel(); return json(413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const raw = Buffer.concat(chunks).toString("utf8");
    await verifyPlaidWebhook(raw, request.headers.get("plaid-verification"));
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400);
    await handleBankWebhook(body as Record<string, unknown>);
    return json(200);
  } catch (error) {
    return json(error instanceof BankingError && error.code === "invalid_webhook" ? 401 : 503);
  }
}
