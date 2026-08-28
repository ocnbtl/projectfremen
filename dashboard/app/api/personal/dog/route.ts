import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { createDogCareEvent, deleteDogCareEvent, readDogTrackerState, updateDogCareEvent } from "../../../../lib/modules/dog-tracker/store";
import type { DogCareInput } from "../../../../lib/modules/dog-tracker/types";

export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie"
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

async function authorizeMutation(request: Request, action: string) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  if (isCsrfRequestValid(request)) return null;
  await appendAuditEvent({ at: new Date().toISOString(), action: `${action}.csrf_failed`, path: new URL(request.url).pathname, method: request.method, ip: getRequestIp(request), status: "denied" });
  return json({ ok: false, error: "Invalid CSRF token" }, 403);
}

function responseFor(error: unknown) {
  const message = error instanceof Error ? error.message : "The dog care entry could not be saved";
  return json({ ok: false, error: message }, message.startsWith("This dog care entry changed") ? 409 : message.endsWith("not found") ? 404 : 400);
}

export async function GET() {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  return json({ ok: true, state: await readDogTrackerState() });
}

export async function POST(request: Request) {
  const denied = await authorizeMutation(request, "personal_dog.create");
  if (denied) return denied;
  try {
    const body = await request.json() as { input?: DogCareInput };
    const item = await createDogCareEvent((body.input || {}) as DogCareInput);
    await appendAuditEvent({ at: new Date().toISOString(), action: "personal_dog.create.success", path: new URL(request.url).pathname, method: "POST", ip: getRequestIp(request), status: "ok", detail: item.id });
    return json({ ok: true, item });
  } catch (error) {
    return responseFor(error);
  }
}

export async function PATCH(request: Request) {
  const denied = await authorizeMutation(request, "personal_dog.update");
  if (denied) return denied;
  try {
    const body = await request.json() as { id?: unknown; input?: Partial<DogCareInput>; expectedUpdatedAt?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!id || !expectedUpdatedAt) throw new Error("Entry id and expectedUpdatedAt are required");
    const item = await updateDogCareEvent(id, body.input || {}, expectedUpdatedAt);
    await appendAuditEvent({ at: new Date().toISOString(), action: "personal_dog.update.success", path: new URL(request.url).pathname, method: "PATCH", ip: getRequestIp(request), status: "ok", detail: item.id });
    return json({ ok: true, item });
  } catch (error) {
    return responseFor(error);
  }
}

export async function DELETE(request: Request) {
  const denied = await authorizeMutation(request, "personal_dog.delete");
  if (denied) return denied;
  try {
    const body = await request.json() as { id?: unknown; expectedUpdatedAt?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!id || !expectedUpdatedAt) throw new Error("Entry id and expectedUpdatedAt are required");
    await deleteDogCareEvent(id, expectedUpdatedAt);
    await appendAuditEvent({ at: new Date().toISOString(), action: "personal_dog.delete.success", path: new URL(request.url).pathname, method: "DELETE", ip: getRequestIp(request), status: "ok", detail: id });
    return json({ ok: true, id });
  } catch (error) {
    return responseFor(error);
  }
}
