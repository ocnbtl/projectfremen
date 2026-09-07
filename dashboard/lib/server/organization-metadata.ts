import { normalizeOrganizationUrl, organizationLinkField, organizationProfileLink, organizationSuggestionError, type OrganizationAutofillResult, type OrganizationAutofillField, type OrganizationSuggestion } from "../modules/people/organization-autofill";
import { isLinkedInLogoUrl } from "./organization-logo";

function text(value: unknown, limit = 800): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/<[^>]*>/g, " ").replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39);/g, (entity) => ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " })[entity] || "")
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
const ORG_TYPES = new Set(["Organization", "Corporation", "LocalBusiness", "NGO", "EducationalOrganization", "School", "CollegeOrUniversity", "GovernmentOrganization", "MedicalOrganization", "SportsOrganization", "ResearchOrganization", "OnlineBusiness", "Store", "Restaurant", "ProfessionalService", "NewsMediaOrganization", "Airline", "Library", "FinancialService", "RealEstateAgent", "TravelAgency"]);
const TYPE_LABELS: Record<string, string> = { Corporation: "Business", LocalBusiness: "Business", OnlineBusiness: "Business", Store: "Business", Restaurant: "Business", ProfessionalService: "Business", FinancialService: "Business", RealEstateAgent: "Business", TravelAgency: "Agency", Airline: "Business", NGO: "Nonprofit", GovernmentOrganization: "Government", EducationalOrganization: "University / School", School: "University / School", CollegeOrUniversity: "University / School" };
function organizationType(value: string): string {
  if (/^(?:non.?profit|not.for.profit|charit|ngo)/i.test(value)) return "Nonprofit";
  if (/^(?:privately held|public company|company|business|corporation|partnership|self.employed|public benefit corporation)$/i.test(value)) return "Business";
  if (/^(?:government|government agency|government organization)$/i.test(value)) return "Government";
  if (/^(?:university|school|educational|educational institution|higher education|public research university|private university)$/i.test(value)) return "University / School";
  if (/^(?:agency|community|association|other)$/i.test(value)) return value[0].toUpperCase() + value.slice(1).toLowerCase();
  return "";
}
function host(raw: string): string { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); }
export type OrganizationPageLink = { url: string; kind: "website" | "detail" | "social"; priority: number };
export type OrganizationPage = OrganizationAutofillResult & { links: OrganizationPageLink[]; blocked: boolean; linkedInLogo?: string };

export function conciseOrganizationDescription(value: string): string {
  const sentences = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(value)].map((part) => part.segment.trim());
  const short = sentences.slice(0, 2).join(" ");
  if (short.length <= 260) return short;
  if (sentences[0].length <= 260) return sentences[0];
  return sentences[0].slice(0, 250).replace(/\s+\S*$/, "").replace(/[,;:]$/, "") + ".";
}
const US_REGIONS: Record<string, string> = Object.fromEntries("AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming".split("|").map((pair) => pair.split(":")));
function addressParts(address: Record<string, unknown>) {
  const country = text(typeof address.addressCountry === "string" ? address.addressCountry : object(address.addressCountry).name);
  const us = /^(?:US|USA|United States(?: of America)?)$/i.test(country);
  const region = text(address.addressRegion);
  return [text(address.addressLocality), us ? US_REGIONS[region.toUpperCase()] || region : region, us ? "USA" : country].filter(Boolean);
}
function postalAddress(address: Record<string, unknown>): string {
  const country = text(typeof address.addressCountry === "string" ? address.addressCountry : object(address.addressCountry).name);
  const region = text(address.addressRegion);
  const us = /^(?:US|USA|United States(?: of America)?)$/i.test(country);
  return [text(address.streetAddress), text(address.addressLocality), us ? US_REGIONS[region.toUpperCase()] || region : region, text(address.postalCode), us ? "USA" : country].filter(Boolean).join(", ");
}

/** Read bounded HTML as data. Never execute scripts or load JSON-LD contexts. */
export function extractOrganizationPage(html: string, sourceUrl: string, organizationName = ""): OrganizationPage {
  const source = normalizeOrganizationUrl(sourceUrl);
  const social = organizationLinkField(source) !== "website";
  const suggestions: OrganizationSuggestion[] = [];
  const links: OrganizationPageLink[] = [];
  const conflicts = new Set<OrganizationAutofillField>();
  const add = (field: OrganizationAutofillField, value: unknown, evidence: string) => {
    let clean = field === "context" ? conciseOrganizationDescription(text(value, 1600)) : text(value, 240);
    if (field === "headquarters") {
      const parts = clean.split(/,\s*/);
      if (parts.length === 3) clean = addressParts({ addressLocality: parts[0], addressRegion: parts[1], addressCountry: parts[2] }).join(", ");
    }
    if (!clean || organizationSuggestionError(field, clean) || conflicts.has(field)) return;
    if (!suggestions.some((item) => item.field === field)) suggestions.push({ field, value: clean, sourceUrl: source, evidence });
  };
  const addLink = (raw: unknown, evidence: string, discoverWebsite = false) => {
    if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) return;
    try {
      let resolved = new URL(text(raw, 2048), source);
      const hostname = host(resolved.toString());
      const outbound = hostname === "l.instagram.com" ? resolved.searchParams.get("u")
        : hostname === "youtube.com" && resolved.pathname === "/redirect" ? resolved.searchParams.get("q")
          : hostname === "linkedin.com" && resolved.pathname.startsWith("/redir/") ? resolved.searchParams.get("url") : null;
      if (outbound) resolved = new URL(outbound);
      const link = organizationProfileLink(resolved.toString());
      if (!link) return;
      if (link.field === "website") {
        if (!social && host(link.url) === host(source)) {
          if (evidence.includes("structured data: website")) add("website", link.url, evidence);
        } else if (social && discoverWebsite && !/(?:^|\.)(?:facebook|fb|meta|threads|t|google|apple|bitly|linktr|linktree|lnkd)\.(?:com|co|ee|in)$/.test(host(link.url))) {
          links.push({ url: link.url, kind: "website", priority: 0 });
        }
        return;
      }
      const existing = suggestions.find((item) => item.field === link.field);
      if (existing && existing.value.toLowerCase() !== link.url.toLowerCase()) {
        if (existing.evidence.includes("structured data") && !evidence.includes("structured data")) return;
        const identity = nameKey(organizationName || suggestions.find((item) => item.field === "name")?.value || meta.get("og:site_name"));
        const matchesIdentity = (url: string) => Boolean(identity) && nameKey(new URL(url).pathname.split("/").filter(Boolean).at(-1)?.replace(/^@/, "")) === identity;
        if (matchesIdentity(existing.value) && !matchesIdentity(link.url)) return;
        if (matchesIdentity(link.url) && !matchesIdentity(existing.value)) {
          suggestions.splice(suggestions.indexOf(existing), 1);
          add(link.field, link.url, evidence);
          links.push({ url: link.url, kind: "social", priority: link.field === "linkedin" ? 3 : 5 });
          return;
        }
        suggestions.splice(suggestions.indexOf(existing), 1);
        conflicts.add(link.field);
        return;
      }
      add(link.field, link.url, evidence);
      links.push({ url: link.url, kind: "social", priority: link.field === "linkedin" ? 3 : 5 });
    } catch { /* Malformed links and share/post URLs provide no profile evidence. */ }
  };
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attribute(tag, "property") || attribute(tag, "name")).toLowerCase();
    if (!meta.has(key)) meta.set(key, text(attribute(tag, "content")));
  }
  const pageTitle = meta.get("og:title") || text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const blocked = /\b(sign in|log in|login|access denied|security check|just a moment|verify you are human)\b/i.test(pageTitle);
  if (blocked) return { suggestions, links, blocked, sourceUrl: source, fetchedAt: new Date().toISOString(), message: "This page requires sign-in or did not provide a public profile." };

  const nodes: Record<string, unknown>[] = [];
  const profileNodes: Record<string, unknown>[] = [];
  const collect = (value: unknown, depth = 0, profile = false) => {
    if (depth > 9 || (profile ? profileNodes : nodes).length >= 400) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach((item) => collect(item, depth + 1, profile)); return; }
    const node = object(value);
    if (!Object.keys(node).length) return;
    (profile ? profileNodes : nodes).push(node);
    const keys = profile ? Object.keys(node).slice(0, 60) : ["@graph", "mainEntity", "about", "publisher", "address", "location"];
    for (const key of keys) if (node[key] && typeof node[key] === "object") collect(node[key], depth + 1, profile);
  };
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const type = attribute(match[1], "type").toLowerCase();
    if (type !== "application/ld+json" && !(social && type === "application/json")) continue;
    try { collect(JSON.parse(match[2]), 0, type !== "application/ld+json"); } catch { /* Retain other usable evidence. */ }
  }
  const types = (node: Record<string, unknown>) => [node["@type"]].flat().map((value) => text(value).replace(/^https?:\/\/schema.org\//, ""));
  const organizations = nodes.filter((node) => types(node).some((type) => ORG_TYPES.has(type)));
  const namesMatch = (node: Record<string, unknown>) => [node.name, node.legalName, node.alternateName].flat().some((value) => nameKey(value) && nameKey(value) === nameKey(organizationName));
  const matches = organizations.filter(namesMatch);
  const owned = organizations.filter((node) => {
    try { return typeof node.url === "string" && host(normalizeOrganizationUrl(node.url)) === host(source); } catch { return false; }
  });
  const organization = matches[0] || (!organizationName.trim() ? owned.length === 1 ? owned[0] : !social && organizations.length === 1 && !organizations[0].url ? organizations[0] : undefined : undefined);
  const dereference = (value: unknown) => {
    const node = object(value);
    return node["@id"] && Object.keys(node).length === 1 ? nodes.find((item) => item["@id"] === node["@id"] && Object.keys(item).length > 1) || node : node;
  };
  if (organization) {
    add("name", organization.name || organization.legalName, "Organization structured data: name");
    add("context", organization.description, "Organization structured data: description");
    add("industry", organization.industry, "Organization structured data: industry");
    const year = text(organization.foundingDate).match(/^(\d{4})(?:-\d{2}(?:-\d{2})?)?$/)?.[1];
    if (year) add("foundedYear", year, "Organization structured data: foundingDate");
    const size = object(organization.numberOfEmployees);
    const count = text(size.value ?? organization.numberOfEmployees), min = text(size.minValue), max = text(size.maxValue);
    if (/^\d+$/.test(count)) add("teamSize", count, "Organization structured data: numberOfEmployees");
    else if (/^\d+$/.test(min) && /^\d+$/.test(max) && Number(min) <= Number(max)) add("teamSize", `${min}–${max}`, "Organization structured data: numberOfEmployees range");
    const locations = [organization.location].flat().map(dereference);
    const hq = locations.find((node) => /headquarters|head office/i.test(text(node.name)));
    const publishedAddresses = [hq?.address || organization.address].flat().filter(Boolean);
    const physical = publishedAddresses.filter((entry) => text(dereference(entry).streetAddress) && !/^(?:P\.?\s*O\.?\s*Box|Post Office)/i.test(text(dereference(entry).streetAddress)));
    const addresses = physical.length === 1 ? physical : publishedAddresses;
    if (addresses.length === 1) {
      const address = dereference(addresses[0]);
      const city = addressParts(address).join(", ");
      add("headquarters", city, "Organization structured data: published office location");
      add("streetAddress", address.streetAddress ? postalAddress(address) : typeof addresses[0] === "string" ? addresses[0] : "", "Organization structured data: postal address");
    }
    if (organization.nonprofitStatus) add("organizationType", "Nonprofit", "Organization structured data: nonprofitStatus");
    for (const type of types(organization)) if (TYPE_LABELS[type]) add("organizationType", TYPE_LABELS[type], `Organization structured data: ${type}`);
    if (types(organization).includes("CollegeOrUniversity")) add("industry", "Higher Education", "Organization structured data: CollegeOrUniversity");
    addLink(organization.url, "Organization structured data: website", true);
    for (const link of [organization.sameAs].flat().slice(0, 24)) addLink(link, "Organization structured data: sameAs link", true);
  }

  const handle = new URL(source).pathname.split("/").filter(Boolean).at(-1)?.replace(/^@/, "").toLowerCase() || "";
  const matchingProfiles = profileNodes.filter((profile) => handle && text(profile.username || profile.uniqueId).toLowerCase() === handle);
  const socialIdentity = Boolean(organization || matchingProfiles.length || (handle.length > 1 && pageTitle.toLowerCase().includes(handle)) || (nameKey(organizationName).length > 1 && nameKey(pageTitle).includes(nameKey(organizationName))));
  for (const profile of matchingProfiles) {
    add("name", profile.full_name || profile.nickname, "Public profile: display name");
    add("context", profile.biography || profile.signature, "Public profile: biography");
    addLink(profile.external_url || profile.website || object(profile.bioLink).link, "Public profile: website", true);
    for (const link of [profile.bio_links].flat().slice(0, 6)) addLink(object(link).url, "Public profile: biography link", true);
  }

  const safeHtml = html.replace(/<(head|title|script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const visibleHtml = social ? safeHtml.replace(/<article\b[^>]*>[\s\S]*?<\/article\s*>/gi, "") : safeHtml;
  const lines = visibleHtml.replace(/<\/(?:p|div|dt|dd|li|h[1-6]|tr|td|th|section|address)>|<br\s*\/?>/gi, "\n")
    .split("\n").map((line) => text(line, 1200)).filter(Boolean).slice(0, 6000);
  const hasOtherOrganization = organizations.length > 0 && !organization && Boolean(organizationName.trim());
  const labels: Record<string, OrganizationAutofillField> = {
    industry: "industry", industries: "industry", "industry or field": "industry", sector: "industry",
    founded: "foundedYear", "founded year": "foundedYear", established: "foundedYear", "year founded": "foundedYear",
    "company size": "teamSize", "team size": "teamSize", employees: "teamSize", "number of employees": "teamSize",
    headquarters: "headquarters", "head office": "headquarters", "corporate headquarters": "headquarters",
    "street address": "streetAddress", "headquarters address": "streetAddress",
    "organization type": "organizationType", "company type": "organizationType", type: "organizationType"
  };
  if (!hasOtherOrganization && (!social || socialIdentity)) {
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const inline = line.match(/^([\p{L} ]{3,30})\s*:\s*(.{1,240})$/u);
      const label = (inline?.[1] || line.replace(/:$/, "")).trim().toLowerCase();
      const field = labels[label];
      let value = inline?.[2] || lines[index + 1] || "";
      if (!field || labels[value.toLowerCase()] || value.length > 240) continue;
      if (field === "foundedYear") value = value.match(/^(\d{4})(?:$|[-/])/u)?.[1] || "";
      if (field === "organizationType") value = organizationType(value);
      if (field === "teamSize" && !/^\d[\d,]*(?:\s*[-–]\s*\d[\d,]*)?\+?(?:\s+employees|\s+people|\s+team members)?$/i.test(value)) continue;
      add(field, value, `Published company detail: ${label}`);
    }
    const description = social ? meta.get("description") || meta.get("og:description") || meta.get("twitter:description") : meta.get("og:description") || meta.get("description") || meta.get("twitter:description");
    const biography = social && description?.match(/on Instagram:\s*["“]([\s\S]+)["”]$/i)?.[1];
    add("context", biography || (social && /^\d[\d,.KMB]* Followers,.*(?:Following|Posts)/i.test(description || "") ? "" : description), biography ? "Public profile biography" : "Public page description");
    if (!organizationName.trim()) add("name", social ? pageTitle.split(/\s*[(@|]/)[0] : meta.get("og:site_name"), "Public page: organization name");
    for (const line of lines) {
      const founded = line.match(/^(?:Founded|Established)(?:\s+in)?\s+(\d{4})\b/i) || line.match(/^We were founded in (\d{4})\b/i);
      if (founded) add("foundedYear", founded[1], `Published statement: ${line.slice(0, 220)}`);
      const headquarters = line.match(/^(?:Our (?:global |corporate )?headquarters (?:is|are)|We are headquartered|Headquartered) in ([^.]{3,160})/i);
      if (headquarters) add("headquarters", headquarters[1], `Published statement: ${line.slice(0, 220)}`);
      const type = line.match(/^(?:We are|[\p{L}\p{N} &'’.-]+ is) (?:a|an) (?:registered |independent )?(nonprofit|non-profit|not-for-profit|charity|government agency|public research university|private university|university|school)\b/iu);
      if (type && (/^We are\b/i.test(line) || nameKey(line.split(/ is /i)[0]) === nameKey(organizationName))) add("organizationType", organizationType(type[1]), `Published statement: ${line.slice(0, 220)}`);
      const employees = line.match(/^(?:(?:We (?:employ|have)|Our (?:global )?team (?:includes|has)|More than|Over|Approximately|About)\s+)?(?:(?:more than|over|approximately|about)\s+)?([\d,]+\+?)\s+(?:total |global )?employees\b/i);
      if (employees) add("teamSize", (/approximately|about/i.test(employees[0]) ? "~" : "") + employees[1] + (/more than|over/i.test(employees[0]) && !employees[1].endsWith("+") ? "+" : ""), `Published workforce total: ${line.slice(0, 220)}`);
    }
    const microValues = (property: string) => {
      const values = new Set<string>();
      for (const match of visibleHtml.matchAll(/<([a-z][\w:-]*)\b([^>]*)>([^<]{1,240})<\/\1>/gi)) {
        if (attribute(match[2], "itemprop").split(/\s+/).includes(property)) values.add(text(match[3]));
      }
      for (const tag of visibleHtml.match(/<(?:meta|span)\b[^>]*>/gi) || []) if (attribute(tag, "itemprop") === property && attribute(tag, "content")) values.add(text(attribute(tag, "content")));
      return [...values].filter(Boolean);
    };
    const addressFields = ["streetAddress", "postalCode", "addressLocality", "addressRegion", "addressCountry"];
    const microFields = Object.fromEntries(addressFields.map((field) => [field, microValues(field)]));
    const micro = (field: string) => microFields[field][0] || "";
    if (micro("streetAddress") && addressFields.every((field) => microFields[field].length <= 1) && /contact|about|office/i.test(new URL(source).pathname)) {
      const address = Object.fromEntries(addressFields.map((field) => [field, micro(field)]));
      add("streetAddress", postalAddress(address), "Published contact address");
      add("headquarters", addressParts(address).join(", "), "Published contact location");
    }
  }

  for (const match of visibleHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const raw = attribute(match[1], "href");
    if (!raw || /^(?:#|mailto:|tel:|javascript:)/i.test(raw)) continue;
    const label = text(match[2], 160) || text(attribute(match[1], "aria-label"), 160);
    if (!social || (socialIdentity && (/\bme\b/.test(attribute(match[1], "rel")) || /website|official|instagram|linkedin|youtube|tiktok|twitter|^x$/i.test(label) || /^https?:\/\/l\.instagram\.com\//i.test(raw) || /^(?:https?:\/\/)?[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(label)))) {
      addLink(raw, social ? "Public profile: linked website or social profile" : "Organization website: linked social profile", social);
    }
    if (!social) {
      try {
        const url = new URL(text(raw, 2048), source);
        if (host(url.toString()) !== host(source) || url.search || /\.(?:pdf|jpg|png|zip)$/i.test(url.pathname)) continue;
        if (/(?:sales|demo|events?|webinar|blog|press|legal|privacy|manifesto|leadership)/i.test(url.pathname)) continue;
        if (/(?:^|[\/_-])(?:about|contact|company|who-we-are|our-story|our-company|headquarters|locations|facts|figures|at-a-glance|university-overview)(?:[\/_-]|$)/i.test(url.pathname) || /^(?:About(?: us| the company)?|Contact(?: us)?|Our story|Who we are|Locations|Company|Facts.*|.*at a glance)$/i.test(label)) {
          links.push({ url: normalizeOrganizationUrl(url.toString()), kind: "detail", priority: /university-overview|company-overview/i.test(url.pathname) ? 0.5 : /facts|figures|at-a-glance/i.test(url.pathname) ? 1 : /contact|headquarters/i.test(`${url.pathname} ${label}`) ? 2 : 3 });
        }
      } catch { /* Not a public navigation link. */ }
    }
  }
  if (!social) add("website", new URL(source).origin, "Organization website");
  else addLink(source, "The public profile you supplied");
  let linkedInLogo: string | undefined;
  if (organizationLinkField(source) === "linkedin" && socialIdentity) {
    const logo = object(organization?.logo);
    const candidates = [typeof organization?.logo === "string" ? organization.logo : logo.url || logo.contentUrl,
      ...[...html.matchAll(/<img\b[^>]*>/gi)].filter((match) => /(?:top-card|org-top-card).*(?:logo|entity-image)|company.logo|organization.logo/i.test(attribute(match[0], "class") + " " + attribute(match[0], "alt"))).map((match) => attribute(match[0], "data-delayed-url") || attribute(match[0], "src")),
      meta.get("og:image")];
    linkedInLogo = candidates.map((value) => text(value, 2048)).find(isLinkedInLogoUrl);
  }
  return { suggestions, sourceUrl: source, fetchedAt: new Date().toISOString(), links: links.slice(0, 80), linkedInLogo, blocked, conflicts: [...conflicts], message: "Published details found. Review the filled fields before saving." };
}

export function extractOrganizationMetadata(html: string, sourceUrl: string, organizationName = ""): OrganizationAutofillResult {
  const { links: _links, blocked: _blocked, ...result } = extractOrganizationPage(html, sourceUrl, organizationName);
  return result;
}
