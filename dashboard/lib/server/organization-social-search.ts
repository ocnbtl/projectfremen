import { organizationProfileLink, type OrganizationAutofillField, type OrganizationSuggestion } from "../modules/people/organization-autofill";
import { extractOrganizationPage, type OrganizationPage } from "./organization-metadata";
import { organizationProfileKey, searchOrganizationPages } from "./organization-website-search";
import { fetchPublicPage } from "./public-page";

export const SOCIAL_DOMAINS = { linkedin: "linkedin.com", instagram: "instagram.com", x: "x.com OR site:twitter.com", youtube: "youtube.com", tiktok: "tiktok.com" } as const;
function websiteKey(raw: string) {
  try { const url = new URL(raw); return url.hostname.toLowerCase().replace(/^www\./, "") + url.pathname.replace(/\/+$/, ""); }
  catch { return ""; }
}

/** Fifteen requests maximum: five searches and two candidates per platform.
 * A matching name is never enough: a readable profile must link to the exact
 * official website. Search snippets are not evidence and ambiguous matches stay blank. */
export async function findOrganizationSocialProfiles(name: string, website: string, existing: OrganizationSuggestion[], fetchPage: typeof fetchPublicPage, deadline: number) {
  const queryName = name.replace(/[^\p{L}\p{N} .&'-]/gu, " ").trim().slice(0, 100);
  const site = new URL(website).hostname.replace(/^www\./, "");
  const handles = [...new Set(existing.flatMap((item) => {
    const key = organizationProfileKey(item.value);
    return key ? [new URL(item.value).pathname.split("/").filter(Boolean).at(-1)!.replace(/^@/, "")] : [];
  }))].slice(0, 2);
  const identityQuery = [queryName, site, ...handles].filter(Boolean).map((term) => `"${term}"`).join(" OR ");
  const fields = Object.keys(SOCIAL_DOMAINS).filter((field) => !existing.some((item) => item.field === field)) as (keyof typeof SOCIAL_DOMAINS)[];
  const results = await Promise.all(fields.map(async (field) => {
    const verified: { suggestion: OrganizationSuggestion; page: OrganizationPage }[] = [];
    if (Date.now() >= deadline) return verified;
    try {
      const urls = await searchOrganizationPages(`(site:${SOCIAL_DOMAINS[field]}) (${identityQuery})`, fetchPage, Math.min(2500, deadline - Date.now()), field);
      await Promise.all(urls.map(async (url) => {
        if (Date.now() >= deadline) return;
        try {
          const result = await fetchPage(url, { timeoutMs: Math.min(2500, deadline - Date.now()), maxBytes: 2_000_000 });
          // A redirect to another account is not verification of the candidate.
          if (organizationProfileKey(result.sourceUrl) !== organizationProfileKey(url)) return;
          const page = extractOrganizationPage(result.html, result.sourceUrl, name, { website });
          if (page.blocked || !page.links.some((link) => link.kind === "website" && websiteKey(link.url) === websiteKey(website))) return;
          verified.push({ page, suggestion: { field: field as OrganizationAutofillField, value: organizationProfileLink(url)!.url, sourceUrl: page.sourceUrl,
            evidence: "Public social profile links to the organization's exact official website" } });
        } catch { /* A blocked profile must not discard other platforms or page details. */ }
      }));
    } catch { /* Search availability is optional. */ }
    const unique = [...new Map(verified.map((item) => [organizationProfileKey(item.suggestion.value), item])).values()];
    return unique.length === 1 ? unique : [];
  }));
  return results.flat();
}
