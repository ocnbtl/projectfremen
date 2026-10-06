import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { reconcilePlaces } from "../../../../lib/modules/planning/place-reconciliation";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function POST(request: Request) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return json({ ok: false, error: "Invalid CSRF token" }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 1024) return json({ ok: false, error: "Request too large" }, 400);
    const body = JSON.parse(raw);
    if (body.operation !== "reconcile") return json({ ok: false, error: "Unknown place operation" }, 400);
    const result = await reconcilePlaces({ dryRun: body.dryRun === true });
    await appendAuditEvent({ at: new Date().toISOString(), action: body.dryRun ? "places.reconcile.preview" : "places.reconcile.success", path: "/api/planning/places", method: "POST", ip: getRequestIp(request), status: "ok", detail: JSON.stringify(result) });
    return json({ ok: true, result });
  } catch { return json({ ok: false, error: "Some addresses may still need connecting. Your address text is preserved; retry place sync." }, 503); }
}
