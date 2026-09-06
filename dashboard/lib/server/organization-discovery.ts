import { normalizeOrganizationUrl, organizationLinkField, organizationProfileLink, type OrganizationAutofillField, type OrganizationAutofillResult, type OrganizationSuggestion } from "../modules/people/organization-autofill";
import { extractOrganizationPage, type OrganizationPageLink } from "./organization-metadata";
import { fetchPublicPage } from "./public-page";
import { findOrganizationWebsiteCandidates, organizationProfileKey } from "./organization-website-search";

const MAX_PAGES = 6;
const TOTAL_TIMEOUT_MS = 22_000;
const comparable = (value: string) => value.toLowerCase().replace(/[\s,]+/g, " ").trim().replace(/\/+$/, "");

/** One explicit click inspects at most six connected public pages, with no background crawl. */
export async function discoverOrganization(name: string, urls: string[], dependencies: {
  fetchPage?: typeof fetchPublicPage;
  timeoutMs?: number;
} = {}): Promise<OrganizationAutofillResult> {
  const deadline = Date.now() + (dependencies.timeoutMs ?? TOTAL_TIMEOUT_MS);
  const seeds = [...new Set(urls.map(normalizeOrganizationUrl))].slice(0, 6);
  const queue: (OrganizationPageLink & { verifyProfile?: string })[] = seeds.map((url) => ({ url, kind: organizationLinkField(url) === "website" ? "website" : "social", priority: organizationLinkField(url) === "website" ? 0 : 3 }));
  const visited = new Set<string>();
  const sources: string[] = [];
  const candidates = new Map<OrganizationAutofillField, { item: OrganizationSuggestion; priority: number }>();
  const conflicts = new Set<OrganizationAutofillField>();
  let unavailableSources = 0;
  let firstError: unknown;
  let attempted = 0;
  let detailPages = 0;
  let resolvedName = name;
  let searched = false;
  let verifiedSearch = false;
  let publicProfileName = "";
  const addCandidate = (item: OrganizationSuggestion, priority: number) => {
    const existing = candidates.get(item.field);
    if (!existing || priority < existing.priority) {
      candidates.set(item.field, { item, priority });
      conflicts.delete(item.field);
    } else if (priority === existing.priority && comparable(existing.item.value) !== comparable(item.value)) {
      // Different page descriptions are expected; conflicting exact facts stay unfilled.
      if (!["context", "name", "website"].includes(item.field)) conflicts.add(item.field);
    }
  };
  while (queue.length && attempted < MAX_PAGES && Date.now() < deadline) {
    queue.sort((a, b) => a.priority - b.priority);
    const next = queue.shift()!;
    if (next.verifyProfile && verifiedSearch) continue;
    if (next.kind === "detail" && detailPages >= 2) continue;
    const key = comparable(next.url);
    if (visited.has(key)) continue;
    visited.add(key);
    attempted++;
    if (next.kind === "detail") detailPages++;
    try {
      const page = await (dependencies.fetchPage || fetchPublicPage)(next.url, { timeoutMs: Math.min(6_000, Math.max(1, deadline - Date.now())), maxBytes: 2_000_000 });
      const parsed = extractOrganizationPage(page.html, page.sourceUrl, resolvedName);
      if (parsed.blocked) throw new Error("Public profile unavailable");
      if (next.verifyProfile) {
        const key = organizationProfileKey(next.verifyProfile);
        if (!key || !parsed.links.some((link) => organizationProfileKey(link.url) === key)) throw new Error("The candidate website did not link back to the supplied profile");
        verifiedSearch = true;
      }
      sources.push(parsed.sourceUrl);
      visited.add(comparable(parsed.sourceUrl));
      const social = organizationLinkField(parsed.sourceUrl) !== "website";
      if (social && !publicProfileName) publicProfileName = parsed.suggestions.find((item) => item.field === "name")?.value || "";
      if (!resolvedName && !social) resolvedName = parsed.suggestions.find((item) => item.field === "name")?.value || (next.verifyProfile ? publicProfileName : "");
      for (const item of parsed.suggestions) {
        const priority = social ? 3 : item.evidence.includes("structured data") ? 0 : item.evidence.includes("Published") ? 1 : 2;
        addCandidate(item, priority);
      }
      for (const field of parsed.conflicts || []) if (!candidates.has(field)) conflicts.add(field);
      for (const link of parsed.links) {
        if (next.kind === "detail" && link.kind === "detail") continue;
        if (link.kind === "website" && candidates.has("website")) continue;
        if (visited.has(comparable(link.url)) || queue.some((item) => comparable(item.url) === comparable(link.url))) continue;
        if (link.kind === "social" && !organizationProfileLink(link.url)) continue;
        queue.push(link);
      }
    } catch (error) {
      firstError ??= error;
      unavailableSources++;
    }
    // A single optional public search can recover a hidden website, but only reciprocal
    // profile evidence can admit the result. Search + candidates share the six-page budget.
    if (!searched && attempted <= MAX_PAGES - 2 && Date.now() < deadline && organizationProfileKey(next.url) && !candidates.has("website") && !queue.some((item) => item.kind === "website")) {
      searched = true;
      attempted++;
      try {
        const websites = await findOrganizationWebsiteCandidates(next.url, publicProfileName, dependencies.fetchPage || fetchPublicPage, Math.min(4_000, Math.max(1, deadline - Date.now())));
        queue.push(...websites.map((url) => ({ url, kind: "website" as const, priority: 0, verifyProfile: next.url })));
      } catch { /* A failed search does not discard directly published profile details. */ }
    }
  }
  // Preserve the endpoint's private-destination error contract when no page can be read.
  if (!sources.length && firstError instanceof Error && /^Use a public/.test(firstError.message)) throw firstError;
  const suggestions = [...candidates.values()].map(({ item }) => item).filter((item) => !conflicts.has(item.field));
  return {
    suggestions, sourceUrl: sources[0] || seeds[0], sources, unavailableSources, conflicts: [...conflicts], fetchedAt: new Date().toISOString(),
    message: sources.length
      ? `${sources.length} public ${sources.length === 1 ? "page" : "pages"} checked.${verifiedSearch ? " The website was matched by its link back to your social profile." : ""}${unavailableSources ? " Some pages could not be read or matched." : ""}${conflicts.size ? " Conflicting details were left empty." : ""} Unpublished details stay empty.`
      : "These links did not provide a readable public profile. Try adding the official website; sign-in-only pages cannot supply details."
  };
}
