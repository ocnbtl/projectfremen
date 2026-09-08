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
  const pages = await searchOrganizationPages(`${query} official website`, fetchPage, timeoutMs);
  return [...new Set(pages.map((page) => normalizeOrganizationUrl(new URL(page).origin)))].slice(0, 2);
}

/** Search for missing workforce/type facts only within the verified official website. */
export async function findOrganizationFactPages(website: string, name: string, fetchPage: typeof fetchPublicPage, timeoutMs: number, missingFounded = false): Promise<string[]> {
  const domain = new URL(website).hostname.replace(/^www\./, "");
  const query = name.replace(/[^\p{L}\p{N} .&'-]/gu, " ").slice(0, 120);
  const pages = await searchOrganizationPages(`site:${domain} ${query} ${missingFounded ? "founded established history" : "employees company size facts"}`, fetchPage, timeoutMs);
  return pages.filter((page) => {
    const url = new URL(page), candidate = url.hostname.replace(/^www\./, "");
    return (candidate === domain || candidate.endsWith(`.${domain}`)) && /about|company|corporate|history|story|facts?|figures|overview|glance|investor|workforce|employees|staff|team/i.test(url.hostname + url.pathname);
  }).slice(0, 2);
}

async function searchOrganizationPages(query: string, fetchPage: typeof fetchPublicPage, timeoutMs: number): Promise<string[]> {
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=5`;
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
        if (/\.(?:pdf|zip|png|jpg|svg)$/i.test(url.pathname)) continue;
        const candidate = normalizeOrganizationUrl(url.toString());
        if (!candidates.includes(candidate)) candidates.push(candidate);
        break;
      } catch { /* Invalid search links provide no candidate. */ }
    }
    if (candidates.length >= 5) break;
  }
  return candidates;
}
