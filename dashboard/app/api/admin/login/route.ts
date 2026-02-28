import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAdminSessionToken } from "../../../../lib/auth";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { buildCsrfToken, ADMIN_CSRF_COOKIE_NAME } from "../../../../lib/csrf";
import { checkLoginAllowance, recordLoginResult } from "../../../../lib/login-rate-limit";

function sanitizePath(value: string, fallback: string) {
  if (!value || !value.startsWith("/")) {
    return fallback;
  }

  if (value.startsWith("//")) {
    return fallback;
  }

  return value;
}

function isSameOriginRequest(request: Request): boolean {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) {
    return origin === expectedOrigin;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return true;
  }

  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const errorPath = sanitizePath(String(formData.get("errorPath") ?? ""), "/admin/login");
  const successPath = sanitizePath(String(formData.get("successPath") ?? ""), "/admin");
  const adminPassword = process.env.ADMIN_PASSWORD;
  const ip = getRequestIp(request);
  const allowance = checkLoginAllowance(ip);
  const path = new URL(request.url).pathname;

  if (!allowance.allowed) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "admin.login.rate_limited",
      path,
      method: "POST",
      ip,
      status: "denied",
      detail: `retryAfterSeconds=${allowance.retryAfterSeconds}`
    });
    return NextResponse.redirect(new URL(`${errorPath}?error=1`, request.url));
  }

  if (!isSameOriginRequest(request)) {
    recordLoginResult(ip, false);
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "admin.login.cross_origin_denied",
      path,
      method: "POST",
      ip,
      status: "denied"
    });
    return NextResponse.redirect(new URL(`${errorPath}?error=1`, request.url));
  }

  if (!adminPassword || password !== adminPassword) {
    recordLoginResult(ip, false);
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "admin.login.failed",
      path,
      method: "POST",
      ip,
      status: "denied"
    });
    return NextResponse.redirect(new URL(`${errorPath}?error=1`, request.url));
  }

  recordLoginResult(ip, true);
  const jar = await cookies();
  const sessionToken = await buildAdminSessionToken(adminPassword);
  const csrfToken = buildCsrfToken();

  jar.set("admin_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  jar.set(ADMIN_CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  await appendAuditEvent({
    at: new Date().toISOString(),
    action: "admin.login.success",
    path,
    method: "POST",
    ip,
    status: "ok"
  });

  return NextResponse.redirect(new URL(successPath, request.url));
}
