import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { BankingError } from "../../../../lib/modules/finance/banking-provider";
import { bankingView, createBankLink, exchangeBankLink, mapBankAccounts, refreshBankAccounts, syncBankConnection, disconnectBankConnection, cancelBankLink } from "../../../../lib/modules/finance/banking-service";
import { decideFinanceBankReview } from "../../../../lib/modules/finance/store";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
const failure = (error: unknown) => error instanceof BankingError ? json({ ok: false, code: error.code, error: error.message }, error.status)
  : json({ ok: false, error: "The bank connection could not be saved. Please try again later." }, 500);

export async function GET() {
  if (!await hasAdminSession()) return json({ ok: false, error: "Unauthorized" }, 401);
  try { return json({ ok: true, banking: await bankingView() }); } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!await hasAdminSession()) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return json({ ok: false, error: "Invalid CSRF token" }, 403);
  try {
    const raw = await boundedBankBody(request);
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new BankingError("invalid_request", "Invalid request.");
    const body = input as Record<string, unknown>;
    const id = typeof body.connectionId === "string" && body.connectionId.length <= 100 ? body.connectionId : "";
    if (body.operation === "link") {
      if (body.product !== undefined && body.product !== "transactions" && body.product !== "investments") throw new BankingError("invalid_request", "Choose a supported connection type.");
      return json({ ok: true, link: await createBankLink(id || undefined, body.product) });
    }
    if (body.operation === "exchange") return json({ ok: true, connectionId: await exchangeBankLink(body.sessionId, body.publicToken) });
    if (body.operation === "cancel") { await cancelBankLink(String(body.sessionId || "")); return json({ ok: true }); }
    if (body.operation === "review") {
      if (typeof body.reviewId !== "string" || body.reviewId.length > 100 || !["import", "match", "ignore"].includes(String(body.decision))) throw new BankingError("invalid_request", "Invalid review decision.");
      await decideFinanceBankReview(body.reviewId, String(body.decision), typeof body.targetId === "string" ? body.targetId : undefined);
    } else {
      if (!id) throw new BankingError("invalid_request", "Choose a connection.");
      if (body.operation === "map") {
        if (!body.choices || typeof body.choices !== "object" || Array.isArray(body.choices) || Object.keys(body.choices).length > 100 ||
          Object.values(body.choices).some(value => typeof value !== "string" || value.length > 300)) throw new BankingError("invalid_request", "Choose valid account matches.");
        await mapBankAccounts(id, body.choices as Record<string, string>);
      } else if (body.operation === "accounts") await refreshBankAccounts(id);
      else if (body.operation === "sync") await syncBankConnection(id);
      else if (body.operation === "disconnect") await disconnectBankConnection(id);
      else throw new BankingError("invalid_request", "Unknown bank operation.");
    }
    return json({ ok: true, banking: await bankingView() });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: "Invalid request body." }, 400);
    return failure(error);
  }
}

async function boundedBankBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new BankingError("invalid_request", "Request body required.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_384) { await reader.cancel(); throw new BankingError("body_too_large", "Request too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
