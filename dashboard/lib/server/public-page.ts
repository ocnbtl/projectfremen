import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { normalizeOrganizationUrl, parseOrganizationUrl } from "../modules/people/organization-autofill";

const blocked = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]] as const) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) blocked.addSubnet(address, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  return family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

type Address = { address: string; family: number };
type Resolver = (hostname: string) => Promise<Address[]>;
export async function resolvePublicPage(raw: string, resolve: Resolver = (hostname) => lookup(hostname, { all: true, verbatim: true })) {
  const url = parseOrganizationUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!hostname.includes(".") && !isIP(hostname) || /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid)$/.test(hostname)) {
    throw new Error("Use a public website. Local and private network links are unavailable.");
  }
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await resolve(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Use a public website. Local and private network links are unavailable.");
  }
  return { url, address: addresses[0] };
}

type PageResponse = { status: number; headers: IncomingHttpHeaders; html: string };
export type PublicPageTarget = Awaited<ReturnType<typeof resolvePublicPage>>;
const MAX_BYTES = 512_000;

/** Use only a validated address for the socket; retain the URL hostname for TLS and Host. */
export function requestPinnedPage({ url, address }: PublicPageTarget, signal: AbortSignal, maxBytes = MAX_BYTES): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      agent: false, signal, maxHeaderSize: 16_384,
      family: address.family,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: { Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity", "User-Agent": "Unigentamos-Organization-Autofill/1.0" }
    }, (response) => {
      const status = response.statusCode || 0;
      const headers = response.headers;
      response.on("error", reject);
      if (status < 200 || status >= 300) {
        resolve({ status, headers, html: "" });
        response.destroy();
        return;
      }
      if (!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(headers["content-type"] || "")) {
        response.destroy(new Error("This link does not provide a readable web page."));
        return;
      }
      if ((headers["content-encoding"] && headers["content-encoding"] !== "identity") || Number(headers["content-length"] || 0) > maxBytes) {
        response.destroy(new Error("This page cannot be read within the size limit."));
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) response.destroy(new Error("This page is too large to inspect."));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ status, headers, html: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end();
  });
}

export async function fetchPublicPage(raw: string, dependencies: {
  resolve?: Resolver;
  request?: typeof requestPinnedPage;
  timeoutMs?: number;
  maxBytes?: number;
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 8_000);
  const aborted = new Promise<never>((_resolve, reject) => controller.signal.addEventListener("abort", () => reject(new Error("The website took too long to respond. Try again or fill in the details yourself.")), { once: true }));
  const run = async () => {
    let next = raw;
    for (let redirects = 0; redirects <= 4; redirects++) {
      const target = await resolvePublicPage(next, dependencies.resolve);
      controller.signal.throwIfAborted();
      const page = await (dependencies.request || requestPinnedPage)(target, controller.signal, Math.min(dependencies.maxBytes ?? MAX_BYTES, 2_000_000));
      if ([301, 302, 303, 307, 308].includes(page.status)) {
        if (!page.headers.location || redirects === 4) throw new Error("This link redirects too many times.");
        next = new URL(page.headers.location, target.url).toString();
        continue;
      }
      if (page.status < 200 || page.status >= 300) throw new Error("This website did not allow a public preview. Try the organization’s own website or enter its details yourself.");
      return { html: page.html, sourceUrl: normalizeOrganizationUrl(target.url.toString()) };
    }
    throw new Error("The website could not be read.");
  };
  try { return await Promise.race([run(), aborted]); }
  finally { clearTimeout(timeout); }
}
