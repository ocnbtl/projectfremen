import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { readCalendarWork, editCalendarWork } from "../../../../lib/modules/planning/linked-work";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
const error = (e: unknown) => json({ ok: false, error: e instanceof Error ? e.message : "Could not load linked work." }, (e as { status?: number }).status || 400);
export async function GET(request: Request) {
  if (!await hasAdminSession()) return json({ ok: false, error: "Unauthorized" }, 401);
  try { return json({ ok: true, ...await readCalendarWork(Object.fromEntries(new URL(request.url).searchParams)) }); } catch (e) { return error(e); }
}
export async function PATCH(request: Request) {
  if (!await hasAdminSession()) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return json({ ok: false, error: "Invalid CSRF token" }, 403);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 300000) throw new Error("This edit is too large.");
    const body = JSON.parse(raw);
    const result = await editCalendarWork(body.source, body.item);
    await appendAuditEvent({ at: new Date().toISOString(), action: "calendar.linked_work.updated", path: new URL(request.url).pathname, method: "PATCH", ip: getRequestIp(request), status: "ok", detail: body.item.id });
    return json({ ok: true, ...result });
  } catch (e) { return error(e); }
}
