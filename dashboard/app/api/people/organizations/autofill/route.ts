import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../../lib/csrf";
import { appendAuditEvent, getRequestIp } from "../../../../../lib/audit-log";
import { discoverOrganization } from "../../../../../lib/server/organization-discovery";
import { normalizeOrganizationUrl } from "../../../../../lib/modules/people/organization-autofill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Cookie" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
let activeRequests = 0;
let recentRequests: number[] = [];

export async function POST(request: Request) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({ at: new Date().toISOString(), action: "people.organization.autofill.csrf_failed", path: new URL(request.url).pathname, method: "POST", ip: getRequestIp(request), status: "denied" });
    return json({ ok: false, error: "Invalid CSRF token" }, 403);
  }
  let name: string, urls: string[];
  try {
    // Bound chunked bodies as well as Content-Length before parsing.
    if (Number(request.headers.get("content-length") || 0) > 16_384) throw new Error();
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    let size = 0;
    const chunks: Uint8Array[] = [];
    const timeout = setTimeout(() => void reader.cancel(), 3_000);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 16_384) { await reader.cancel(); throw new Error(); }
        chunks.push(value);
      }
    } finally { clearTimeout(timeout); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 240)) throw new Error();
    const links: unknown = body.urls ?? (body.url ? [body.url] : []);
    if (!Array.isArray(links) || !links.length || links.length > 6 || links.some((url) => typeof url !== "string" || !url.trim() || url.length > 2048)) throw new Error();
    name = body.name?.trim() || "";
    urls = links.map((url: string) => normalizeOrganizationUrl(url));
  } catch { return json({ ok: false, error: "Enter a public HTTP or HTTPS link in Website or a social link field." }, 400); }
  const now = Date.now();
  recentRequests = recentRequests.filter((at) => now - at < 60_000);
  if (activeRequests >= 2 || recentRequests.length >= 12) return json({ ok: false, error: "Please wait a moment before requesting more suggestions." }, 429);
  activeRequests++;
  recentRequests.push(now);
  try {
    return json({ ok: true, result: await discoverOrganization(name, urls) });
  } catch (error) {
    // Do not return resolver/socket errors, IP addresses, or other network internals.
    const message = error instanceof Error && /^(Use a public|This (link|website|page)|The website took|This website did|This page is)/.test(error.message)
      ? error.message : "This website could not be read. Try the organization’s own website or enter its details yourself.";
    return json({ ok: false, error: message }, 422);
  } finally { activeRequests--; }
}
