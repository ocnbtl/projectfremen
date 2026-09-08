import { normalizeOrganizationUrl, organizationLinkField, organizationProfileLink, type OrganizationAutofillField, type OrganizationAutofillResult, type OrganizationSuggestion } from "../modules/people/organization-autofill";
import { extractOrganizationPage, type OrganizationPageLink } from "./organization-metadata";
import { fetchPublicPage } from "./public-page";
import { findOrganizationFactPages, findOrganizationWebsiteCandidates, organizationProfileKey } from "./organization-website-search";
import { fetchLinkedInLogo } from "./organization-logo";
import { findOrganizationKnowledge } from "./organization-knowledge";
import { approximateTeamSize } from "../modules/people/team-size";

const MAX_PAGES = 10;
const TOTAL_TIMEOUT_MS = 22_000;
const comparable = (value: string) => value.toLowerCase().replace(/[\s,]+/g, " ").trim().replace(/\/+$/, "");

/** One explicit click inspects at most ten connected public pages, with no background crawl. */
export async function discoverOrganization(name: string, urls: string[], dependencies: {
  fetchPage?: typeof fetchPublicPage;
  timeoutMs?: number;
  fetchLogo?: typeof fetchLinkedInLogo;
} = {}): Promise<OrganizationAutofillResult> {
  const deadline = Date.now() + (dependencies.timeoutMs ?? TOTAL_TIMEOUT_MS);
  const crawlDeadline = deadline - Math.min(6000, (dependencies.timeoutMs ?? TOTAL_TIMEOUT_MS) * 0.27);
  const seeds = [...new Set(urls.map(normalizeOrganizationUrl))].slice(0, 6);
  const queue: (OrganizationPageLink & { verifyProfile?: string; depth?: number })[] = seeds.map((url) => ({ url, kind: organizationLinkField(url) === "website" ? "website" : "social", priority: organizationLinkField(url) === "website" ? 0 : 3 }));
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
  let searchedFacts = false;
  let verifiedSearch = false;
  let publicProfileName = "";
  let logo: { url: string; sourceUrl: string } | undefined;
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
  // Reserve two requests and six seconds for identity-checked missing-fact lookup.
  while (queue.length && attempted < MAX_PAGES - 2 && Date.now() < crawlDeadline) {
    queue.sort((a, b) => a.priority - b.priority);
    const next = queue.shift()!;
    if (next.verifyProfile && verifiedSearch) continue;
    if (next.kind === "detail" && detailPages >= 5) continue;
    if (next.kind === "detail" && /facts|figures|glance/.test(next.url) && candidates.has("teamSize") && candidates.has("organizationType") && candidates.has("foundedYear")) continue;
    const key = comparable(next.url);
    if (visited.has(key)) continue;
    visited.add(key);
    attempted++;
    if (next.kind === "detail") detailPages++;
    try {
      const page = await (dependencies.fetchPage || fetchPublicPage)(next.url, { timeoutMs: Math.min(4_000, Math.max(1, crawlDeadline - Date.now())), maxBytes: 2_000_000 });
      const parsed = extractOrganizationPage(page.html, page.sourceUrl, resolvedName);
      if (parsed.blocked) throw new Error("Public profile unavailable");
      if (next.verifyProfile) {
        const key = organizationProfileKey(next.verifyProfile);
        if (!key || !parsed.links.some((link) => organizationProfileKey(link.url) === key)) throw new Error("The candidate website did not link back to the supplied profile");
        verifiedSearch = true;
      }
      sources.push(parsed.sourceUrl);
      if (parsed.linkedInLogo && !logo) logo = { url: parsed.linkedInLogo, sourceUrl: parsed.sourceUrl };
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
        if (link.kind === "detail" && (next.depth || 0) >= 2) continue;
        if (link.kind === "detail" && /facts|figures|overview|glance/.test(link.url) && candidates.has("teamSize") && candidates.has("organizationType") && candidates.has("foundedYear")) continue;
        if (link.kind === "website" && candidates.has("website")) continue;
        if (visited.has(comparable(link.url)) || queue.some((item) => comparable(item.url) === comparable(link.url))) continue;
        if (link.kind === "social" && !organizationProfileLink(link.url)) continue;
        queue.push({ ...link, depth: (next.depth || 0) + 1 });
      }
    } catch (error) {
      firstError ??= error;
      unavailableSources++;
    }
    // A single optional public search can recover a hidden website, but only reciprocal
    // profile evidence can admit the result. Search + candidates share the six-page budget.
    if (!searched && attempted <= MAX_PAGES - 4 && Date.now() < crawlDeadline && organizationProfileKey(next.url) && !candidates.has("website") && !queue.some((item) => item.kind === "website")) {
      searched = true;
      attempted++;
      try {
        const websites = await findOrganizationWebsiteCandidates(next.url, publicProfileName, dependencies.fetchPage || fetchPublicPage, Math.min(4_000, Math.max(1, crawlDeadline - Date.now())));
        queue.push(...websites.map((url) => ({ url, kind: "website" as const, priority: 0, verifyProfile: next.url })));
      } catch { /* A failed search does not discard directly published profile details. */ }
    }
    const officialWebsite = candidates.get("website")?.item.value;
    if (!searchedFacts && officialWebsite && attempted >= 2 && attempted <= MAX_PAGES - 4 && Date.now() < crawlDeadline
      && (!candidates.has("teamSize") || !candidates.has("organizationType") || !candidates.has("foundedYear")) && !queue.some((item) => item.kind === "detail")) {
      searchedFacts = true;
      attempted++;
      try {
        const pages = await findOrganizationFactPages(officialWebsite, resolvedName, dependencies.fetchPage || fetchPublicPage, Math.min(4000, Math.max(1, crawlDeadline - Date.now())), !candidates.has("foundedYear"));
        queue.push(...pages.map((url) => ({ url, kind: "detail" as const, priority: 1, depth: 2 })));
      } catch { /* Search snippets never supply facts; only readable official pages can. */ }
    }
  }
  // Preserve the endpoint's private-destination error contract when no page can be read.
  if (!sources.length && firstError instanceof Error && /^Use a public/.test(firstError.message)) throw firstError;
  const website = candidates.get("website")?.item.value;
  if (website && resolvedName && ["foundedYear", "tiktok", "instagram", "x", "youtube", "linkedin"].some((field) => !candidates.has(field as OrganizationAutofillField)) && Date.now() < deadline) {
    try {
      const knowledge = await findOrganizationKnowledge(resolvedName, website, dependencies.fetchPage || fetchPublicPage, deadline);
      for (const item of knowledge) if (!candidates.has(item.field) && !conflicts.has(item.field)) {
        addCandidate(item, 4);
        if (!sources.includes(item.sourceUrl)) sources.push(item.sourceUrl);
      }
    } catch { /* An unavailable secondary source never discards official-page results. */ }
  }
  const suggestions = [...candidates.values()].map(({ item }) => {
    if (item.field !== "teamSize") return item;
    const value = approximateTeamSize(item.value);
    return { ...item, value, evidence: value.replace(/,/g, "") !== item.value.replace(/,/g, "") ? `${item.evidence}; rounded estimate from published count ${item.value}` : item.evidence };
  }).filter((item) => !conflicts.has(item.field));
  let photo: OrganizationAutofillResult["photo"];
  if (logo && Date.now() < deadline) {
    try { photo = { dataUrl: await (dependencies.fetchLogo || fetchLinkedInLogo)(logo.url, Math.min(3000, deadline - Date.now())), sourceUrl: logo.sourceUrl }; }
    catch { /* A blocked image must not discard available facts. */ }
  }
  return {
    suggestions, photo, sourceUrl: sources[0] || seeds[0], sources, unavailableSources, conflicts: [...conflicts], fetchedAt: new Date().toISOString(),
    message: sources.length
      ? `${sources.length} public ${sources.length === 1 ? "page" : "pages"} checked.${verifiedSearch ? " The website was matched by its link back to your social profile." : ""}${unavailableSources ? " Some pages could not be read or matched." : ""}${conflicts.size ? " Conflicting details were left empty." : ""} Unpublished details stay empty.`
      : "These links did not provide a readable public profile. Try adding the official website; sign-in-only pages cannot supply details."
  };
}
