import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { readJsonFile, mutateJsonFile } from "../../../../lib/file-store";
import { emptyHomeSettings, validateHomeSettings, type PersonalHomeSettings } from "../../../../lib/modules/personal-ops/home-settings";
import { readPersonalLifeState } from "../../../../lib/modules/personal-life/store";
const FILE = "personal-home.json";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function GET() {
  if (!(await hasAdminSession())) return json({ error: "Unauthorized" }, 401);
  try { return json({ settings: await readJsonFile(FILE, emptyHomeSettings()) }); }
  catch { return json({ error: "Personal settings could not load. Please try again." }, 503); }
}
export async function PATCH(request: Request) {
  if (!(await hasAdminSession())) return json({ error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return json({ error: "Invalid CSRF token" }, 403);
  try {
    const body = await request.json();
    const input = validateHomeSettings(body);
    if (typeof body.expectedUpdatedAt !== "string") throw new Error("A saved version is required");
    if (input.sections.length) {
      const life = await readPersonalLifeState();
      if (input.sections.some(section => !life.lists.some(list => list.id === section.listId))) throw new Error("A linked list is no longer available");
    }
    const settings = await mutateJsonFile<PersonalHomeSettings, PersonalHomeSettings>(FILE, emptyHomeSettings(), current => {
      if (current.updatedAt !== body.expectedUpdatedAt) throw new Error("Personal settings changed in another window. Reload before saving.");
      const value = { ...input, updatedAt: new Date().toISOString() };
      return { value, result: value };
    });
    await appendAuditEvent({ at: settings.updatedAt, action: "personal.home.update.success", path: new URL(request.url).pathname, method: "PATCH", ip: getRequestIp(request), status: "ok" });
    return json({ settings });
  } catch (error) { const message = error instanceof Error ? error.message : "Settings could not be saved"; return json({ error: message }, message.includes("another window") ? 409 : 400); }
}
