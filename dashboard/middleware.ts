import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildAdminSessionToken } from "./lib/auth";

export async function middleware(request: NextRequest) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};
