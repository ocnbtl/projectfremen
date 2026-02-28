const ADMIN_CSRF_COOKIE_NAME = "admin_csrf";

function getCookieValue(name: string): string {
  if (typeof document === "undefined") {
    return "";
  }

  const pairs = document.cookie.split(";");
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
    if (key !== name) {
      continue;
    }

    const rawValue = segment.slice(splitIndex + 1).trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return "";
}

export function buildCsrfHeaders(): Record<string, string> {
  const token = getCookieValue(ADMIN_CSRF_COOKIE_NAME);
  if (!token) {
    return {};
  }
  return { "x-csrf-token": token };
}

export function buildJsonHeadersWithCsrf(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...buildCsrfHeaders()
  };
}

