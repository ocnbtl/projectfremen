import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isWellnessSection } from "../../../../lib/modules/personal-wellness/types";
import { readWellnessState, saveWellnessEntry } from "../../../../lib/modules/personal-wellness/store";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
export async function GET(request: Request) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  const section = new URL(request.url).searchParams.get("section");
  if (!isWellnessSection(section)) return json({ ok: false, error: "Choose a Personal section." }, 400);
  try { return json({ ok: true, state: await readWellnessState(section) }); }
  catch { return json({ ok: false, error: "This section could not be loaded. Try again." }, 500); }
}
async function save(request: Request) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({ at: new Date().toISOString(), action: "personal_wellness.csrf_failed", path: new URL(request.url).pathname, method: request.method, ip: getRequestIp(request), status: "denied" });
    return json({ ok: false, error: "Invalid CSRF token" }, 403);
  }
  try {
    const bodyText = await request.text();
    if (bodyText.length > 64000) return json({ ok: false, error: "This entry is too large." }, 413);
    const body = JSON.parse(bodyText);
    if (!isWellnessSection(body.section)) throw new Error("Choose a Personal section.");
    const editing = request.method === "PATCH";
    if (editing && (typeof body.id !== "string" || !body.id || typeof body.expectedUpdatedAt !== "string" || !body.expectedUpdatedAt)) throw new Error("The entry and its current revision are required.");
    const item = await saveWellnessEntry(body.section, body.input, editing ? body.id : undefined, editing ? body.expectedUpdatedAt : undefined, body.occurrence);
    await appendAuditEvent({ at: item.updatedAt, action: `personal_wellness.${body.section}.${editing ? "update" : "create"}.success`, path: new URL(request.url).pathname, method: request.method, ip: getRequestIp(request), status: "ok", detail: item.id });
    return json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "This entry could not be saved.";
    return json({ ok: false, error: message }, message.startsWith("This record changed") ? 409 : message.endsWith("not found.") ? 404 : 400);
  }
}
export const POST = save;
export const PATCH = save;
