import { normalizeOrganizationUrl, organizationLinkField, organizationProfileLink } from "../modules/people/organization-autofill";
import { fetchPublicPage } from "./public-page";

export function organizationProfileKey(raw: string): string {
  try {
    const profile = organizationProfileLink(raw);
    return profile && profile.field !== "website" ? `${profile.field}:${new URL(profile.url).pathname.toLowerCase()}` : "";
  } catch { return ""; }
}

/** Search returns candidates only. No search snippet is ever used as an organization fact. */
export async function findOrganizationWebsiteCandidates(profileUrl: string, publicName: string, fetchPage: typeof fetchPublicPage, timeoutMs: number): Promise<string[]> {
  const profile = new URL(profileUrl);
  const handle = profile.pathname.split("/").filter(Boolean).at(-1)?.replace(/^@/, "") || "";
  const query = (publicName || handle).replace(/[^\p{L}\p{N} .&'-]/gu, " ").trim().slice(0, 120);
  if (!query) return [];
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(`${query} official website`)}&count=5`;
  const page = await fetchPage(searchUrl, { timeoutMs, maxBytes: 1_000_000 });
  if (/verify you are human|unusual traffic|<title[^>]*>[^<]*(?:sign in|captcha)/i.test(page.html)) return [];
  const candidates: string[] = [];
  for (const result of page.html.matchAll(/<li\b[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    for (const anchor of result[1].matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
      try {
        let url = new URL(anchor[1].replace(/&amp;/g, "&"), searchUrl);
        // Decode Bing's outbound URL without visiting its tracking redirect.
        if (url.hostname === "www.bing.com" && url.pathname === "/ck/a") {
          const encoded = url.searchParams.get("u");
          if (!encoded?.startsWith("a1") || encoded.length > 4096) continue;
          url = new URL(Buffer.from(encoded.slice(2), "base64url").toString("utf8"));
        }
        const link = organizationProfileLink(url.toString());
        if (!link || organizationLinkField(link.url) !== "website") continue;
        if (/(?:^|\.)(?:bing|microsoft|google|facebook|wikipedia|wikidata|instagram|youtube|tiktok|linkedin|twitter|x|linktr|linktree)\.(?:com|org|ee)$/.test(url.hostname)) continue;
        const candidate = normalizeOrganizationUrl(url.origin);
        if (!candidates.includes(candidate)) candidates.push(candidate);
        break;
      } catch { /* Invalid search links provide no candidate. */ }
    }
    if (candidates.length >= 2) break;
  }
  return candidates;
}
