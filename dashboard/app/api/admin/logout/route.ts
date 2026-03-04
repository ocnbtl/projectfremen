import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { ADMIN_CSRF_COOKIE_NAME, isCsrfRequestValid } from "../../../../lib/csrf";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "admin.logout.csrf_failed",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "denied"
    });
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }

  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set("admin_session", "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  jar.set(ADMIN_CSRF_COOKIE_NAME, "", {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });

  await appendAuditEvent({
    at: new Date().toISOString(),
    action: "admin.logout.success",
    path: new URL(request.url).pathname,
    method: "POST",
    ip: getRequestIp(request),
    status: "ok"
  });

  return NextResponse.json({ ok: true });
}
