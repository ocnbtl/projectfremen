import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildSignedAdminSessionToken, getAdminSessionSecret } from "../../../../lib/auth";
import { appendAuditEvent, getLoginRateLimitKey, getRequestIp } from "../../../../lib/audit-log";
import { buildCsrfToken, ADMIN_CSRF_COOKIE_NAME } from "../../../../lib/csrf";
import { checkLoginAllowance, recordLoginResult } from "../../../../lib/login-rate-limit";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

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
  const rateLimitKey = getLoginRateLimitKey(request);
  const allowance = checkLoginAllowance(rateLimitKey);
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
    return NextResponse.redirect(new URL(`${errorPath}?error=1`, request.url), { status: 303 });
  }

  if (!isSameOriginRequest(request)) {
    recordLoginResult(rateLimitKey, false);
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "admin.login.cross_origin_denied",
      path,
      method: "POST",
      ip,
      status: "denied"
    });
    return NextResponse.redirect(new URL(`${errorPath}?error=1`, request.url), { status: 303 });
  }

  if (!adminPassword || password !== adminPassword) {
    recordLoginResult(rateLimitKey, false);
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "admin.login.failed",
      path,
      method: "POST",
      ip,
      status: "denied"
    });
    return NextResponse.redirect(new URL(`${errorPath}?error=1`, request.url), { status: 303 });
  }

  recordLoginResult(rateLimitKey, true);
  const jar = await cookies();
  const sessionToken = buildSignedAdminSessionToken(
    getAdminSessionSecret(adminPassword),
    SESSION_MAX_AGE_SECONDS
  );
  const csrfToken = buildCsrfToken();

  jar.set("admin_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
  jar.set(ADMIN_CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });

  await appendAuditEvent({
    at: new Date().toISOString(),
    action: "admin.login.success",
    path,
    method: "POST",
    ip,
    status: "ok"
  });

  return NextResponse.redirect(new URL(successPath, request.url), { status: 303 });
}
