import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildAdminSessionToken } from "./lib/auth";
import { buildCsrfToken, ADMIN_CSRF_COOKIE_NAME } from "./lib/csrf";

export async function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = request.cookies.get("admin_session")?.value;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const expected = adminPassword
    ? await buildAdminSessionToken(adminPassword)
    : undefined;

  if (!expected || !token || token !== expected) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const response = NextResponse.next();
  if (!request.cookies.get(ADMIN_CSRF_COOKIE_NAME)?.value) {
    response.cookies.set(ADMIN_CSRF_COOKIE_NAME, buildCsrfToken(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12
    });
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"]
};
