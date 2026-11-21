import { NextResponse, type NextRequest } from "next/server";
import {
  individualAccountsEnabled,
  isWorkspacePath,
  legacyAdminEnabled,
  publicAccountOrigin,
} from "./lib/account-mode";

const accountAssets = new Set([
  "/unigentamos-logo.svg",
  "/unigentamos-favicon.svg",
  "/favicon.ico",
  "/favicon-32.png",
  "/apple-touch-icon.png",
]);

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const unavailable = () =>
    new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (legacyAdminEnabled()) return isWorkspacePath(path) ? unavailable() : NextResponse.next();
  if (!individualAccountsEnabled()) return unavailable();
  if (path === "/") {
    const origin = publicAccountOrigin();
    return origin ? NextResponse.redirect(new URL("/account", origin), 307) : unavailable();
  }
  if (isWorkspacePath(path)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  if (path.startsWith("/_next/static/") || accountAssets.has(path)) return NextResponse.next();
  return unavailable();
}

export const config = { matcher: "/:path*" };
