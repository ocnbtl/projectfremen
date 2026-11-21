export function individualAccountsEnabled() {
  return process.env.UNIGENTAMOS_AUTH_MODE === "workspace";
}

export function publicAccountOrigin(): string | null {
  const configured = process.env.UNIGENTAMOS_ACCOUNT_ORIGIN?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
      return url.origin;
  } catch {
    /* Invalid deployment configuration. */
  }
  return null;
}

export function legacyAdminEnabled() {
  const mode = process.env.UNIGENTAMOS_AUTH_MODE;
  return mode === undefined || mode === "" || mode === "legacy";
}

export function isWorkspacePath(path: string) {
  return (
    path === "/account" ||
    path.startsWith("/account/") ||
    path === "/api/workspaces" ||
    path.startsWith("/api/workspaces/") ||
    path.startsWith("/api/account/")
  );
}
