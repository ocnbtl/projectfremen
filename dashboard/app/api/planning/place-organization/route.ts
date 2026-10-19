import { createNativeObjectRef } from "../../../../lib/native-objects/routes";
import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { createPlaceOrganization } from "../../../../lib/modules/planning/place-organization";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function POST(request: Request) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return json({ ok: false, error: "Invalid CSRF token" }, 403);
  try {
    const text = await request.text();
    if (text.length > 4096) return json({ ok: false, error: "Request too large" }, 413);
    const body = JSON.parse(text);
    const record = await createPlaceOrganization(String(body.placeId || ""), String(body.expectedUpdatedAt || ""), String(body.name || ""));
    await appendAuditEvent({ at: new Date().toISOString(), action: "map.place.organization.create", path: new URL(request.url).pathname, method: "POST", ip: getRequestIp(request), status: "ok", detail: record.id });
    return json({ ok: true, organization: { objectId: record.id, label: record.title, href: createNativeObjectRef({module:"people",objectType:"organization",objectId:record.id,label:record.title}).route } });
  } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Unable to create organization" }, 400); }
}
