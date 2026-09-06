import { normalizeOrganizationUrl, organizationLinkField, type OrganizationAutofillResult, type OrganizationAutofillField, type OrganizationSuggestion } from "../modules/people/organization-autofill";

function text(value: unknown, limit = 800): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/<[^>]*>/g, " ").replace(/&(?:amp|quot|apos|lt|gt|#39);/g, (entity) => ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">" })[entity] || "")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, value: string) => {
      const point = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    }).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((value) => value !== undefined) || "";
}
function nameKey(value: unknown) {
  return text(value, 240).toLowerCase().replace(/\b(incorporated|inc|llc|ltd|limited|corporation|corp)\b/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}
const ORG_TYPES = new Set(["Organization", "Corporation", "LocalBusiness", "NGO", "EducationalOrganization", "School", "CollegeOrUniversity", "GovernmentOrganization", "MedicalOrganization", "SportsOrganization", "ResearchOrganization", "OnlineBusiness", "Store", "Restaurant", "ProfessionalService"]);
const TYPE_LABELS: Record<string, string> = { Corporation: "Business", LocalBusiness: "Business", OnlineBusiness: "Business", Store: "Business", Restaurant: "Business", ProfessionalService: "Business", NGO: "Nonprofit", GovernmentOrganization: "Government", EducationalOrganization: "University / School", School: "University / School", CollegeOrUniversity: "University / School" };

/** No script execution, external JSON-LD contexts, linked-page fetching, or inferred facts. */
export function extractOrganizationMetadata(html: string, sourceUrl: string, organizationName: string): OrganizationAutofillResult {
  const source = normalizeOrganizationUrl(sourceUrl);
  const suggestions: OrganizationSuggestion[] = [];
  const add = (field: OrganizationAutofillField, value: unknown, evidence: string) => {
    const clean = text(value, field === "context" ? 800 : 240);
    if (clean && !suggestions.some((item) => item.field === field)) suggestions.push({ field, value: clean, sourceUrl: source, evidence });
  };
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attribute(tag, "property") || attribute(tag, "name")).toLowerCase();
    if (!meta.has(key)) meta.set(key, text(attribute(tag, "content")));
  }
  const nodes: Record<string, unknown>[] = [];
  const collect = (value: unknown, depth = 0) => {
    if (depth > 6 || nodes.length >= 200) return;
    if (Array.isArray(value)) { value.slice(0, 200).forEach((item) => collect(item, depth + 1)); return; }
    const node = object(value);
    if (!Object.keys(node).length) return;
    nodes.push(node);
    for (const key of ["@graph", "mainEntity", "about", "publisher"]) if (node[key]) collect(node[key], depth + 1);
  };
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attribute(match[1], "type").toLowerCase() !== "application/ld+json") continue;
    try { collect(JSON.parse(match[2])); } catch { /* Other usable metadata may remain. */ }
  }
  const types = (node: Record<string, unknown>) => (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]).map((value) => text(value).replace(/^https?:\/\/schema.org\//, ""));
  const matches = nodes.filter((node) => types(node).some((type) => ORG_TYPES.has(type)) && [node.name, node.legalName, node.alternateName].flat().some((value) => nameKey(value) && nameKey(value) === nameKey(organizationName)));
  const organization = matches[0];
  const pageTitle = meta.get("og:title") || text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const blockedPreview = /\b(sign in|log in|login|access denied|security check|just a moment|verify you are human)\b/i.test(pageTitle);
  if (!blockedPreview) {
    const addLink = (value: unknown, evidence: string) => {
      if (typeof value !== "string") return;
      try { const url = normalizeOrganizationUrl(value); add(organizationLinkField(url), url, evidence); } catch { /* Malformed or credential-bearing links are not suggestions. */ }
    };
    if (organization) {
      add("name", organization.name || organization.legalName, "Organization structured data: name");
      add("context", organization.description, "Organization structured data: description");
      add("industry", organization.industry, "Organization structured data: industry");
      const year = text(organization.foundingDate).match(/^(\d{4})(?:-\d{2}(?:-\d{2})?)?$/)?.[1];
      if (year && Number(year) > 0 && Number(year) <= new Date().getUTCFullYear()) add("foundedYear", year, "Organization structured data: foundingDate");
      const size = object(organization.numberOfEmployees);
      const count = text(size.value || organization.numberOfEmployees);
      const min = text(size.minValue), max = text(size.maxValue);
      if (/^\d+$/.test(count)) add("teamSize", count, "Organization structured data: numberOfEmployees");
      else if (/^\d+$/.test(min) && /^\d+$/.test(max) && Number(min) <= Number(max)) add("teamSize", `${min}–${max}`, "Organization structured data: numberOfEmployees range");
      const address = object(organization.address);
      const headquarters = [address.addressLocality, address.addressRegion, typeof address.addressCountry === "string" ? address.addressCountry : object(address.addressCountry).name].map((value) => text(value)).filter(Boolean).join(", ");
      add("headquarters", headquarters || (typeof organization.address === "string" ? organization.address : ""), "Organization structured data: address (confirm this is headquarters)");
      for (const type of types(organization)) if (TYPE_LABELS[type]) add("organizationType", TYPE_LABELS[type], `Organization structured data: ${type}`);
      addLink(organization.url, "Organization structured data: website");
      for (const link of [organization.sameAs].flat().slice(0, 12)) addLink(link, "Organization structured data: sameAs link");
    }
    add("context", meta.get("og:description") || meta.get("description") || meta.get("twitter:description"), "Page description; confirm it describes this organization");
    addLink(source, "The public page you supplied");
  }
  return {
    suggestions, sourceUrl: source, fetchedAt: new Date().toISOString(),
    message: blockedPreview ? "This website shows a sign-in or access check. Try the organization’s own website or enter its details yourself."
      : suggestions.length ? "Review each suggestion against its source. Fields the page does not provide stay empty."
      : "No usable organization details were found. Try another public link or enter the details yourself."
  };
}
