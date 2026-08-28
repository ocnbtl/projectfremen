import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import {
  readPersonalRecords,
  updatePersonalRecord,
  type PersonalRecord,
  type PersonalResourceAutomationRun,
  type PersonalResourceMetadata,
  type PersonalResourceProfile,
  type PersonalResourceTimelineEvent
} from "../../../../lib/personal-records-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie"
};
const MAX_REDIRECTS = 4;
const MAX_METADATA_BYTES = 512_000;
const AUTOMATION_KINDS = ["url_health", "duplicate_scan", "metadata_refresh"] as const;
type AutomationKind = (typeof AUTOMATION_KINDS)[number];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0);
}

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice(7));
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || /^fe[89ab]/.test(normalized);
}

async function assertSafeUrl(raw: string) {
  const url = new URL(raw);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("Only credential-free HTTP or HTTPS URLs can be checked.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Local or private network URLs cannot be checked.");
  }
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Local or private network URLs cannot be checked.");
  }
  return url;
}

async function safeFetch(raw: string, metadata: boolean) {
  let url = await assertSafeUrl(raw);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: metadata ? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2" : "*/*",
          ...(metadata ? {} : { Range: "bytes=0-0" }),
          "User-Agent": "Project-Fremen-Resource-Check/1.0"
        }
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || redirect === MAX_REDIRECTS) throw new Error("The URL redirected too many times.");
        url = await assertSafeUrl(new URL(location, url).toString());
        continue;
      }
      return { response, finalUrl: url.toString() };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("The URL could not be checked.");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value: string | undefined, limit: number) {
  return value ? decodeHtml(value.replace(/\s+/g, " ").trim()).slice(0, limit) || undefined : undefined;
}

function tagAttribute(tag: string, attribute: string) {
  const match = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1];
}

function metaValue(html: string, names: string[]) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (tagAttribute(tag, "name") || tagAttribute(tag, "property") || "").toLowerCase();
    if (names.includes(key)) return cleanText(tagAttribute(tag, "content"), 800);
  }
  return undefined;
}

function metadataFromHtml(html: string, response: Response, finalUrl: string, now: string): PersonalResourceMetadata {
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1], 240);
  const canonicalTag = (html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i) || [])[0];
  const languageTag = (html.match(/<html\b[^>]*>/i) || [])[0];
  const canonicalRaw = canonicalTag ? tagAttribute(canonicalTag, "href") : undefined;
  let canonicalUrl: string | undefined;
  try {
    canonicalUrl = canonicalRaw ? new URL(canonicalRaw, finalUrl).toString() : undefined;
  } catch {
    canonicalUrl = undefined;
  }
  return {
    title: metaValue(html, ["og:title", "twitter:title"]) || title,
    description: metaValue(html, ["description", "og:description", "twitter:description"]),
    canonicalUrl,
    siteName: metaValue(html, ["og:site_name"]),
    language: cleanText(languageTag ? tagAttribute(languageTag, "lang") : undefined, 40),
    contentType: cleanText(response.headers.get("content-type") || undefined, 120),
    imageUrl: metaValue(html, ["og:image", "twitter:image"]),
    author: metaValue(html, ["author", "article:author"]),
    publishedAt: metaValue(html, ["article:published_time", "date", "datepublished"]),
    fetchedAt: now,
    httpStatus: response.status
  };
}

async function readLimitedText(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel("Metadata read timed out"); }, 8_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_METADATA_BYTES) {
        await reader.cancel("Metadata response exceeded the limit");
        throw new Error("The page is too large to inspect safely.");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeout);
  }
  if (timedOut) throw new Error("The metadata refresh timed out.");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function normalizeMatchUrl(raw: string | undefined) {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    return url.toString();
  } catch {
    return "";
  }
}

function baseProfile(record: PersonalRecord): PersonalResourceProfile {
  return record.resourceProfile || {
    version: 1,
    resourceType: "unknown",
    lifecycle: record.archivedAt ? "archived" : "active",
    usefulness: 5,
    trust: 5,
    notes: [],
    gradient: { pattern: "aurora", colors: ["#193B42", "#86AEB0", "#E5D7C8"], focalX: 48, focalY: 42, angle: 135 },
    metadata: {},
    health: { state: "unknown" },
    duplicate: { state: "unknown", matchIds: [] },
    automations: { urlHealth: { status: "idle" }, duplicateScan: { status: "idle" }, metadataRefresh: { status: "idle" } },
    timeline: [{ id: `resource-created-${record.id}`, kind: "created", title: "Resource added", occurredAt: record.createdAt }]
  };
}

function runPatch(
  profile: PersonalResourceProfile,
  kind: AutomationKind,
  now: string,
  run: PersonalResourceAutomationRun,
  detail: string
): Partial<PersonalResourceProfile> {
  const key = kind === "url_health" ? "urlHealth" : kind === "duplicate_scan" ? "duplicateScan" : "metadataRefresh";
  const event: PersonalResourceTimelineEvent = {
    id: `resource-event-${crypto.randomUUID()}`,
    kind: "automation",
    title: kind === "url_health" ? "URL checked" : kind === "duplicate_scan" ? "Duplicates scanned" : "Metadata refreshed",
    detail,
    occurredAt: now
  };
  return {
    automations: { ...profile.automations, [key]: run },
    timeline: [...profile.timeline, event]
  };
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({ at: new Date().toISOString(), action: "resource.automation.csrf_failed", path: new URL(request.url).pathname, method: "POST", ip: getRequestIp(request), status: "denied" });
    return json({ ok: false, error: "Invalid CSRF token" }, 403);
  }

  let id = "";
  let kind: AutomationKind | "" = "";
  try {
    const body = await request.json();
    id = String(body.id || "").trim();
    kind = AUTOMATION_KINDS.includes(body.kind) ? body.kind : "";
    if (!id || !kind) return json({ ok: false, error: "A valid Resource and automation are required." }, 400);
    const records = await readPersonalRecords();
    const record = records.find((item) => item.id === id && item.className === "resource");
    if (!record) return json({ ok: false, error: "Resource not found" }, 404);
    const now = new Date().toISOString();
    const profile = baseProfile(record);
    let patch: Partial<PersonalResourceProfile>;
    let run: PersonalResourceAutomationRun;

    if (kind === "duplicate_scan") {
      const ownUrl = normalizeMatchUrl(record.url);
      const matches = ownUrl
        ? records.filter((item) => item.className === "resource" && item.id !== id && normalizeMatchUrl(item.url) === ownUrl).map((item) => item.id)
        : [];
      const message = matches.length ? `${matches.length} possible duplicate${matches.length === 1 ? "" : "s"} found.` : "No duplicate URL found.";
      run = { status: "success", lastRunAt: now, message };
      patch = {
        ...runPatch(profile, kind, now, run, message),
        duplicate: { state: matches.length ? "possible" : "none", lastCheckedAt: now, matchIds: matches }
      };
    } else {
      if (!record.url) throw new Error("Add a URL before running this automation.");
      const { response, finalUrl } = await safeFetch(record.url, kind === "metadata_refresh");
      const redirected = normalizeMatchUrl(finalUrl) !== normalizeMatchUrl(record.url);
      if (kind === "url_health") {
        await response.body?.cancel();
        const healthy = response.status >= 200 && response.status < 400;
        const message = healthy ? `URL responded with ${response.status}.` : `URL responded with ${response.status}.`;
        run = { status: healthy ? "success" : "failed", lastRunAt: now, message };
        patch = {
          ...runPatch(profile, kind, now, run, message),
          health: {
            state: healthy ? (redirected ? "redirected" : "ok") : "broken",
            httpStatus: response.status,
            lastCheckedAt: now,
            redirectTarget: redirected ? finalUrl : undefined
          }
        };
      } else {
        const contentLength = Number(response.headers.get("content-length") || 0);
        if (contentLength > MAX_METADATA_BYTES) throw new Error("The page is too large to inspect safely.");
        const html = await readLimitedText(response);
        const metadata = metadataFromHtml(html, response, finalUrl, now);
        const message = "Site metadata is current.";
        run = { status: "success", lastRunAt: now, message };
        patch = {
          ...runPatch(profile, kind, now, run, message),
          metadata,
          sourceDomain: new URL(finalUrl).hostname.replace(/^www\./, "")
        };
      }
    }

    const items = await updatePersonalRecord(id, { resourceProfile: patch }, { expectedUpdatedAt: record.updatedAt });
    await appendAuditEvent({ at: now, action: `resource.automation.${kind}.success`, path: new URL(request.url).pathname, method: "POST", ip: getRequestIp(request), status: "ok", detail: id });
    return json({ ok: true, items });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "The URL check timed out."
      : error instanceof Error
        ? error.message
        : "The automation could not run.";
    if (id && kind) {
      try {
        const records = await readPersonalRecords();
        const record = records.find((item) => item.id === id && item.className === "resource");
        if (record) {
          const now = new Date().toISOString();
          const profile = baseProfile(record);
          const run: PersonalResourceAutomationRun = { status: "failed", lastRunAt: now, message };
          const items = await updatePersonalRecord(id, { resourceProfile: runPatch(profile, kind, now, run, message) }, { expectedUpdatedAt: record.updatedAt });
          await appendAuditEvent({ at: now, action: `resource.automation.${kind}.failed`, path: new URL(request.url).pathname, method: "POST", ip: getRequestIp(request), status: "error", detail: id });
          return json({ ok: true, items });
        }
      } catch {
        // Preserve the original bounded error if a concurrent update wins.
      }
    }
    return json({ ok: false, error: message }, 400);
  }
}
