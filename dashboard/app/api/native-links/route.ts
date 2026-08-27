import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../lib/csrf";
import {
  createNativeObjectRelationship,
  readNativeObjectLinks,
  removeNativeObjectRelationship
} from "../../../lib/native-objects/link-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie"
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export async function GET() {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  return json({ ok: true, items: await readNativeObjectLinks() });
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "native_object_link.create.csrf_failed",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "denied"
    });
    return json({ ok: false, error: "Invalid CSRF token" }, 403);
  }
  try {
    const body = await request.json();
    const result = await createNativeObjectRelationship({
      source: body.source,
      target: body.target,
      relationship: typeof body.relationship === "string" ? body.relationship : "related",
      actorId: "admin"
    });
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "native_object_link.create.success",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "ok",
      detail: result.item.id
    });
    return json({ ok: true, ...result }, result.created ? 201 : 200);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Failed to create object link" }, 400);
  }
}

export async function DELETE(request: Request) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "native_object_link.remove.csrf_failed",
      path: new URL(request.url).pathname,
      method: "DELETE",
      ip: getRequestIp(request),
      status: "denied"
    });
    return json({ ok: false, error: "Invalid CSRF token" }, 403);
  }
  try {
    const body = await request.json();
    const item = await removeNativeObjectRelationship({
      id: typeof body.id === "string" ? body.id : "",
      reason: typeof body.reason === "string" ? body.reason : "",
      actorId: "admin"
    });
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "native_object_link.remove.success",
      path: new URL(request.url).pathname,
      method: "DELETE",
      ip: getRequestIp(request),
      status: "ok",
      detail: item.id
    });
    return json({ ok: true, item });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Failed to remove object link" }, 400);
  }
}
