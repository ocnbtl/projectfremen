/** Only site-local paths may be used after a login attempt. */
export function safeLoginPath(value: string, fallback: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20\x7f]/.test(value)) return fallback;
  try {
    const base = "https://login.invalid";
    const target = new URL(value, base);
    return target.origin === base ? `${target.pathname}${target.search}${target.hash}` : fallback;
  } catch { return fallback; }
}
