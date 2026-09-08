import { organizationProfileLink, organizationSuggestionError, type OrganizationAutofillField, type OrganizationSuggestion } from "../modules/people/organization-autofill";
import { fetchPublicPage } from "./public-page";

type Claim = { rank?: string; mainsnak?: { snaktype?: string; datavalue?: { value?: unknown } }; qualifiers?: Record<string, unknown[]> };
type Entity = { id: string; labels?: Record<string, { value: string }>; aliases?: Record<string, { value: string }[]>; claims?: Record<string, Claim[]> };
const nameKey = (name: string) => name.toLowerCase().replace(/\b(incorporated|inc|llc|ltd|limited|corporation|corp)\b/g, "").replace(/[^\p{L}\p{N}]/gu, "");
const siteKey = (raw: string) => {
  try { const url = new URL(raw); return /^https?:$/.test(url.protocol) ? url.hostname.toLowerCase().replace(/^www\./, "") + url.pathname.replace(/\/+$/, "") : ""; }
  catch { return ""; }
};
function values(entity: Entity, property: string): unknown[] {
  const claims = (entity.claims?.[property] || []).filter((claim) => claim.rank !== "deprecated" && claim.mainsnak?.snaktype === "value" && !claim.qualifiers?.P582?.length);
  const preferred = claims.filter((claim) => claim.rank === "preferred");
  return (preferred.length ? preferred : claims).map((claim) => claim.mainsnak?.datavalue?.value);
}

/** Missing facts only: a unique name AND exact official website match is required. */
export function extractOrganizationKnowledge(entities: Entity[], name: string, website: string): OrganizationSuggestion[] {
  if (!nameKey(name) || !siteKey(website)) return [];
  const matched = entities.filter((entity) => /^Q\d+$/.test(entity.id)
    && [...Object.values(entity.labels || {}), ...Object.values(entity.aliases || {}).flat()].some((label) => nameKey(label.value) === nameKey(name))
    && values(entity, "P856").some((url) => typeof url === "string" && siteKey(url) === siteKey(website)));
  if (matched.length !== 1) return [];
  const entity = matched[0];
  const sourceUrl = `https://www.wikidata.org/wiki/${entity.id}`;
  const suggestions: OrganizationSuggestion[] = [];
  const add = (field: OrganizationAutofillField, candidates: string[], property: string) => {
    const unique = [...new Set(candidates)];
    if (unique.length === 1 && !organizationSuggestionError(field, unique[0])) suggestions.push({ field, value: unique[0], sourceUrl, evidence: `Wikidata ${property}; organization name and official website matched. Community-maintained information, review before saving` });
  };
  add("foundedYear", values(entity, "P571").flatMap((value) => {
    const date = value as { time?: string; precision?: number } | undefined;
    const year = date && (date.precision ?? 0) >= 9 && date.time?.match(/^\+(\d{4})-/)?.[1];
    return year ? [year] : [];
  }), "inception (P571)");
  for (const [property, field, prefix] of [
    ["P7085", "tiktok", "https://www.tiktok.com/@"], ["P2003", "instagram", "https://www.instagram.com/"],
    ["P2002", "x", "https://x.com/"], ["P2397", "youtube", "https://www.youtube.com/channel/"],
    ["P4264", "linkedin", "https://www.linkedin.com/company/"]
  ] as const) {
    add(field, values(entity, property).flatMap((value) => {
      if (typeof value !== "string" || !/^[\w.-]+$/.test(value)) return [];
      const link = organizationProfileLink(prefix + value);
      return link?.field === field ? [link.url] : [];
    }), property);
  }
  return suggestions;
}

/** At most two bounded requests. No credentials, model guesses or search-snippet facts. */
export async function findOrganizationKnowledge(name: string, website: string, fetchPage: typeof fetchPublicPage, deadline: number): Promise<OrganizationSuggestion[]> {
  if (!name.trim() || Date.now() >= deadline) return [];
  const request = async (params: Record<string, string>) => {
    if (Date.now() >= deadline) throw new Error("Knowledge lookup deadline reached");
    const url = `https://www.wikidata.org/w/api.php?${new URLSearchParams({ ...params, format: "json", maxlag: "5" })}`;
    const page = await fetchPage(url, { timeoutMs: Math.min(3000, Math.max(1, deadline - Date.now())), maxBytes: 1_000_000, format: "json" });
    return JSON.parse(page.html);
  };
  const search = await request({ action: "wbsearchentities", search: name.slice(0, 120), language: "en", type: "item", limit: "3" });
  // Avoid downloading large unrelated entities (for example Firefox when looking
  // for Mozilla). Labels or search aliases must match before fetching full claims.
  const ids = (Array.isArray(search.search) ? search.search : []).slice(0, 3)
    .filter((item: { label?: string; match?: { text?: string } }) => [item.label, item.match?.text].some((label) => typeof label === "string" && nameKey(label) === nameKey(name)))
    .map((item: { id?: string }) => item.id).filter((id: unknown) => typeof id === "string" && /^Q\d+$/.test(id));
  if (!ids.length) return [];
  const result = await request({ action: "wbgetentities", ids: ids.join("|"), props: "labels|aliases|claims", languages: "en" });
  return extractOrganizationKnowledge(Object.values(result.entities || {}), name, website);
}
