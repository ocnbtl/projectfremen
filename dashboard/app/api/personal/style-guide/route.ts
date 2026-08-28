import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { readStyleGuideState, saveStyleGuideState } from "../../../../lib/modules/style-guide/store";
import type { StyleGuideInput } from "../../../../lib/modules/style-guide/types";

export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie"
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

async function authorizeMutation(request: Request) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  if (isCsrfRequestValid(request)) return null;
  await appendAuditEvent({
    at: new Date().toISOString(),
    action: "personal_style_guide.update.csrf_failed",
    path: new URL(request.url).pathname,
    method: request.method,
    ip: getRequestIp(request),
    status: "denied"
  });
  return json({ ok: false, error: "Invalid CSRF token" }, 403);
}

export async function GET() {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  return json({ ok: true, state: await readStyleGuideState() });
}

export async function PUT(request: Request) {
  const denied = await authorizeMutation(request);
  if (denied) return denied;
  try {
    const body = await request.json() as { input?: StyleGuideInput; expectedUpdatedAt?: unknown };
    if (!body.input || typeof body.input !== "object") throw new Error("Style guide input is required");
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
    const state = await saveStyleGuideState(body.input, expectedUpdatedAt);
    await appendAuditEvent({ at: new Date().toISOString(), action: "personal_style_guide.update.success", path: new URL(request.url).pathname, method: "PUT", ip: getRequestIp(request), status: "ok", detail: state.id });
    return json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The style guide could not be saved";
    return json({ ok: false, error: message }, message.startsWith("This style guide changed") ? 409 : 400);
  }
}
