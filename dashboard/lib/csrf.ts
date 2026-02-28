import { randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_CSRF_COOKIE_NAME = "admin_csrf";
export const ADMIN_CSRF_HEADER_NAME = "x-csrf-token";

function parseCookieHeader(value: string | null): Record<string, string> {
  if (!value) {
    return {};
  }

  const pairs = value.split(";");
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const segment = pair.trim();
    if (!segment) {
      continue;
    }

    const splitIndex = segment.indexOf("=");
    if (splitIndex <= 0) {
      continue;
    }

    const key = segment.slice(0, splitIndex).trim();
    const rawValue = segment.slice(splitIndex + 1).trim();
    if (!key || !rawValue) {
      continue;
    }

    try {
      result[key] = decodeURIComponent(rawValue);
    } catch {
      result[key] = rawValue;
    }
  }

  return result;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function buildCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function getCsrfTokenFromRequest(request: Request): string | null {
  const jar = parseCookieHeader(request.headers.get("cookie"));
  const token = jar[ADMIN_CSRF_COOKIE_NAME]?.trim();
  return token || null;
}

export function getCsrfHeaderFromRequest(request: Request): string | null {
  const token = request.headers.get(ADMIN_CSRF_HEADER_NAME)?.trim();
  return token || null;
}

export function isCsrfRequestValid(request: Request): boolean {
  const cookieToken = getCsrfTokenFromRequest(request);
  const headerToken = getCsrfHeaderFromRequest(request);
  if (!cookieToken || !headerToken) {
    return false;
  }
  return safeEqual(cookieToken, headerToken);
}

