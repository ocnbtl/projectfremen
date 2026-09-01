import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import {
  createPersonalLifeObject,
  deletePersonalLifeObject,
  isPersonalLifeCollection,
  readPersonalLifeState,
  updatePersonalLifeObject
} from "../../../../lib/modules/personal-life/store";
import type { PersonalLifeInputByCollection } from "../../../../lib/modules/personal-life/types";

export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie"
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function responseFor(error: unknown) {
  const message = error instanceof Error ? error.message : "Personal data could not be saved";
  return json({ ok: false, error: message }, message.startsWith("This record changed") ? 409 : message.endsWith("not found") ? 404 : 400);
}

async function authorizedMutation(request: Request, action: string) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  if (isCsrfRequestValid(request)) return null;
  await appendAuditEvent({
    at: new Date().toISOString(),
    action: `${action}.csrf_failed`,
    path: new URL(request.url).pathname,
    method: request.method,
    ip: getRequestIp(request),
    status: "denied"
  });
  return json({ ok: false, error: "Invalid CSRF token" }, 403);
}

export async function GET() {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  return json({ ok: true, state: await readPersonalLifeState() });
}

export async function POST(request: Request) {
  const denied = await authorizedMutation(request, "personal_life.create");
  if (denied) return denied;
  try {
    const body = await request.json() as { collection?: unknown; input?: unknown };
    if (!isPersonalLifeCollection(body.collection)) throw new Error("A valid Personal collection is required");
    const collection = body.collection;
    const item = await createPersonalLifeObject(collection, (body.input || {}) as PersonalLifeInputByCollection[typeof collection]);
    await appendAuditEvent({ at: new Date().toISOString(), action: `personal_life.${collection}.create.success`, path: new URL(request.url).pathname, method: "POST", ip: getRequestIp(request), status: "ok", detail: item.id });
    return json({ ok: true, item });
  } catch (error) {
    return responseFor(error);
  }
}

export async function PATCH(request: Request) {
  const denied = await authorizedMutation(request, "personal_life.update");
  if (denied) return denied;
  try {
    const body = await request.json() as { collection?: unknown; id?: unknown; patch?: unknown; expectedUpdatedAt?: unknown };
    if (!isPersonalLifeCollection(body.collection)) throw new Error("A valid Personal collection is required");
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!id || !expectedUpdatedAt) throw new Error("Record id and expectedUpdatedAt are required");
    const collection = body.collection;
    const item = await updatePersonalLifeObject(collection, id, (body.patch || {}) as Partial<PersonalLifeInputByCollection[typeof collection]>, expectedUpdatedAt);
    await appendAuditEvent({ at: new Date().toISOString(), action: `personal_life.${collection}.update.success`, path: new URL(request.url).pathname, method: "PATCH", ip: getRequestIp(request), status: "ok", detail: item.id });
    return json({ ok: true, item });
  } catch (error) {
    return responseFor(error);
  }
}

export async function DELETE(request: Request) {
  const denied = await authorizedMutation(request, "personal_life.delete");
  if (denied) return denied;
  try {
    const body = await request.json() as { collection?: unknown; id?: unknown; expectedUpdatedAt?: unknown };
    if (!isPersonalLifeCollection(body.collection)) throw new Error("A valid Personal collection is required");
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!id || !expectedUpdatedAt) throw new Error("Record id and expectedUpdatedAt are required");
    await deletePersonalLifeObject(body.collection, id, expectedUpdatedAt);
    await appendAuditEvent({ at: new Date().toISOString(), action: `personal_life.${body.collection}.delete.success`, path: new URL(request.url).pathname, method: "DELETE", ip: getRequestIp(request), status: "ok", detail: id });
    return json({ ok: true, id });
  } catch (error) {
    return responseFor(error);
  }
}
