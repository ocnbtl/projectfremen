import { normalizeOrganizationUrl, organizationLinkField } from "../modules/people/organization-autofill";
import { normalizeBirthday } from "../modules/people/birthday";
import { personNameKey, personProfileLink, type PersonAutofillResult, type PersonSuggestion, type PersonJobSuggestion, type PersonEducationSuggestion } from "../modules/people/person-autofill";
import { fetchPublicPage } from "./public-page";

const list = (value: unknown): unknown[] => value == null ? [] : Array.isArray(value) ? value : [value];
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function text(value: unknown, limit = 800): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/<[^>]*>/g, " ").replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39);/g, (entity) => ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " })[entity] || "")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, value: string) => { const point = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value); return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ""; })
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
const attr = (tag: string, name: string) => text(tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((value) => value !== undefined), 2048);
const cleanName = (value: string) => personNameKey(value.replace(/^(?:Dr\.?|Prof\.?|Professor|Mr\.?|Mrs\.?|Ms\.?)\s+/i, ""));
function matchesName(candidate: string, name: string): boolean {
  const actual = cleanName(candidate).split(" "), expected = cleanName(name).split(" ");
  if (actual.join(" ") === expected.join(" ")) return true;
  // A middle name may be omitted, but conflicting middle names do not match.
  return actual.length >= 2 && expected.length >= 2 && actual[0] === expected[0] && actual.at(-1) === expected.at(-1) &&
    (actual.length === 2 || expected.length === 2);
}
const sentences = (value: string) => (value.match(/[^.!?]+(?:[.!?]+|$)/g) || []).slice(0, 2).join("").trim().slice(0, 500);
function linkUrl(value: unknown, source: string): string {
  if (!text(value)) return "";
  try { return normalizeOrganizationUrl(new URL(text(value, 2048), source).toString()); } catch { return ""; }
}
function named(value: unknown): string { return typeof value === "string" ? text(value, 240) : text(object(value).name, 240); }
type PersonPage = PersonAutofillResult & { links: string[]; matched: boolean };

/** Read explicit public profile facts, never execute page code or infer credentials/ages. */
export function extractPersonPage(html: string, sourceUrl: string, name: string): PersonPage {
  const source = normalizeOrganizationUrl(sourceUrl);
  const result: PersonPage = { suggestions: [], occupations: [], education: [], sources: [], fetchedAt: new Date().toISOString(), message: "", links: [], matched: false };
  if (!cleanName(name)) return result;
  const evidence = (label: string) => ({ sourceUrl: source, evidence: label });
  const meta = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) meta.set((attr(tag[0], "property") || attr(tag[0], "name")).toLowerCase(), attr(tag[0], "content"));
  const title = meta.get("og:title") || text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  if (/^(?:sign in|log in|login|join linkedin|security verification|just a moment|access denied)/i.test(title)) return result;
  const nodes: Record<string, unknown>[] = [];
  function collect(value: unknown, depth = 0) {
    if (depth > 12 || nodes.length > 1500) return;
    if (Array.isArray(value)) { for (const item of value.slice(0, 100)) collect(item, depth + 1); return; }
    if (!value || typeof value !== "object") return;
    const node = object(value); nodes.push(node);
    for (const item of Object.values(node)) if (typeof item === "object") collect(item, depth + 1);
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (attr(match[1], "type").toLowerCase() !== "application/ld+json") continue;
    try { collect(JSON.parse(match[2])); } catch { /* Other profile evidence can remain usable. */ }
  }
  const byId = new Map(nodes.flatMap((node) => typeof node["@id"] === "string" && Object.keys(node).length > 1 ? [[node["@id"], node] as const] : []));
  const resolve = (value: unknown) => { const raw = object(value); return { ...(byId.get(String(raw["@id"])) || {}), ...raw }; };
  const people = nodes.filter((node) => list(node["@type"]).some((type) => /(?:^|[/#])Person$/.test(String(type))));
  const matches = people.filter((node) => [named(node), ...list(node.alternateName).map(named)].some((label) => matchesName(label, name)));
  const h1 = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  const headlineMatches = [h1, title.split(/\s[|–—-]\s/)[0]].some((label) => matchesName(label, name));
  // An unrelated Person node is not authority for the person whose name is in a page title.
  if (!matches.length && (!headlineMatches || people.length)) return result;
  const identities = new Set(matches.map((node) => linkUrl(node.url || node["@id"], source)).filter(Boolean));
  if (identities.size > 1) return result;
  result.matched = true; result.sources = [source];
  const add = (field: PersonSuggestion["field"], value: string, label: string) => {
    if (field === "birthday" && /^\d{4}/.test(value) && value > new Date().toISOString().slice(0, 10)) return;
    if (value) result.suggestions.push({ field, value, ...evidence(label) });
  };
  const addLink = (raw: unknown, label: string) => {
    if (!text(raw)) return;
    const link = personProfileLink(linkUrl(raw, source));
    if (!link) return;
    add(link.field, link.url, label);
    if (!result.links.includes(link.url)) result.links.push(link.url);
  };
  let description = "";
  for (const person of matches) {
    description ||= text(person.description);
    add("birthday", normalizeBirthday(text(person.birthDate)), "Published birth date in the person's structured profile");
    for (const raw of [...list(person.url), ...list(person.sameAs)]) addLink(raw, "Linked directly by this person's structured profile");
    const works = list(person.worksFor);
    const titles = list(person.jobTitle).map(named).filter(Boolean);
    for (const raw of works) {
      const role = resolve(raw);
      const isRole = list(role["@type"]).some((type) => /Role$/.test(String(type)));
      const organization = isRole ? resolve(role.worksFor) : resolve(raw);
      const employer = typeof raw === "string" ? text(raw, 240) : named(organization);
      if (!employer) continue;
      // Only attach a generic title when there is one employer and one title.
      const jobTitle = text(role.roleName, 240) || (works.length === 1 && titles.length === 1 ? titles[0] : "");
      const end = text(role.endDate), start = text(role.startDate);
      if (start && !Number.isNaN(Date.parse(start)) && Date.parse(start) > Date.now()) continue;
      if (end && Number.isNaN(Date.parse(end))) continue;
      result.occupations.push({ title: jobTitle, employer, status: end && Date.parse(end) < Date.now() ? "past" : "current", website: organization.url ? linkUrl(organization.url, source) : undefined, ...evidence("Published employer and role in the person's structured profile") });
    }
    if (!works.length) for (const title of titles) result.occupations.push({ title, status: "current", ...evidence("Published job title in the person's structured profile") });
    for (const raw of list(person.hasOccupation)) {
      const role = resolve(raw), occupation = role.hasOccupation ? resolve(role.hasOccupation) : role;
      const title = named(occupation), end = text(role.endDate);
      if (title && (!end || !Number.isNaN(Date.parse(end)))) result.occupations.push({ title, status: end && Date.parse(end) < Date.now() ? "past" : "current", ...evidence("Published occupation in the person's structured profile") });
    }
    for (const raw of list(person.alumniOf)) {
      const role = resolve(raw), school = role.alumniOf ? resolve(role.alumniOf) : role;
      const institution = typeof raw === "string" ? text(raw, 240) : named(school);
      if (institution) result.education.push({ institution, status: "past", website: school.url ? linkUrl(school.url, source) : undefined, ...evidence("Published alumni affiliation; no degree inferred") });
    }
  }
  const visible = html.replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  // A machine-readable birthday may omit the year; never derive it from an age.
  if (headlineMatches) for (const tag of visible.matchAll(/<(?:time|meta)\b[^>]*>/gi)) {
    if (attr(tag[0], "itemprop") === "birthDate") add("birthday", normalizeBirthday(attr(tag[0], "datetime") || attr(tag[0], "content")), "Published birthday on the named public profile");
  }
  const paragraphs = [...visible.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi), ...visible.matchAll(/<(?:div|section)\b[^>]*>([^<>]{15,1500})<\/(?:div|section)>/gi)].map((match) => text(match[1], 1000));
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const subject = new RegExp(`^${escaped}\\s+(?:is|works|earned|holds|graduated|studied|attended|was)\\b`, "i");
  const bio = paragraphs.find((paragraph) => subject.test(paragraph));
  description ||= bio || (headlineMatches && cleanName(meta.get("description") || "").includes(cleanName(name)) ? meta.get("description") || "" : "");
  const personalBioPage = /(?:^|\/)(?:about|bio|cv|resume)(?:[-/]|$)/i.test(new URL(source).pathname) && (matches.length > 0 || headlineMatches);
  if (personalBioPage) {
    const career = paragraphs.find((paragraph) => /^(?:(?:These days|Currently),?\s+)?I(?:['’]m| am| work as)\s+(?:an?\s+)?[^.!?]*(?:engineer|develop|design|research|professor|teacher|writer|author|artist|architect|founder|entrepreneur|consultant|hacker|scientist|student)\b/i.test(paragraph));
    if (career) {
      const thirdPerson = career.replace(/^(?:(?:These days|Currently),?\s+)?I(?:['’]m| am)\b/i, `${name} is`).replace(/^I work as\b/i, `${name} works as`);
      description ||= sentences(thirdPerson);
      const role = career.match(/^(?:(?:These days|Currently),?\s+)?I(?:['’]m| am| work as)\s+(?:an?\s+)?(.+?)(?:\s+(?:focused on|working on|who|based in)|[.!?]|$)/i)?.[1];
      if (role && !result.occupations.length && !/\b(?:at|for|and|student)\b/i.test(role)) result.occupations.push({ title: role.slice(0, 240), status: "current", ...evidence("Explicit current work in the person's own biography") });
    }
  }
  // Plain-text facts must name the profile subject in the same sentence.
  for (const paragraph of paragraphs.filter((line) => subject.test(line))) {
    const work = paragraph.match(new RegExp(`^${escaped}\\s+(?:is\\s+(?:an?\\s+)?|works as\\s+(?:an?\\s+)?)([^.!?]{2,100}?)\\s+(?:at|for)\\s+([^.!?]{2,160})(?:[.!?]|$)`, "i"));
    if (work && !result.occupations.length) result.occupations.push({ title: work[1].trim(), employer: work[2].trim(), status: "current", ...evidence("Explicit role and employer in the published biography") });
    const school = paragraph.match(new RegExp(`^${escaped}\\s+(?:graduated from|attended|studied at)\\s+([^.!?]{2,180})(?:[.!?]|$)`, "i"));
    if (school) result.education.push({ institution: school[1].trim(), status: "past", ...evidence("Explicit education in the published biography") });
    const degree = paragraph.match(new RegExp(`^${escaped}\\s+(?:earned|holds)\\s+(?:an?\\s+)?([^.!?]{2,100}?)\\s+(?:in\\s+([^.!?]{2,100}?)\\s+)?from\\s+([^.!?]{2,180})(?:[.!?]|$)`, "i"));
    if (degree) result.education.push({ institution: degree[3].trim(), degree: degree[1].trim(), fieldOfStudy: degree[2]?.trim(), status: "past", ...evidence("Explicit degree and institution in the published biography") });
  }
  if (description) add("context", sentences(description), "Brief excerpt of the published biography");
  if (organizationLinkField(source) !== "website") addLink(source, "The supplied public profile");
  // About/CV navigation often lives in the header or footer, outside the biography.
  const navigation = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  for (const anchor of navigation.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const raw = attr(anchor[1], "href");
    if (!raw) continue;
    if (/\bme\b/.test(attr(anchor[1], "rel"))) addLink(raw, "Identity link marked as belonging to this person");
    try {
      const url = new URL(raw, source), current = new URL(source);
      if (url.origin === current.origin && /^(?:about(?: me)?|bio(?:graphy)?|cv|résumé|resume)$/i.test(text(anchor[2])) && !result.links.includes(url.toString())) result.links.push(url.toString());
    } catch { /* Ignore malformed anchors. */ }
  }
  return result;
}

export async function discoverPerson(name: string, urls: string[], dependencies: { fetchPage?: typeof fetchPublicPage; timeoutMs?: number } = {}): Promise<PersonAutofillResult> {
  const deadline = Date.now() + (dependencies.timeoutMs ?? 20_000);
  const queue = [...new Set(urls.map(normalizeOrganizationUrl))].slice(0, 6), visited = new Set<string>();
  const suggestions: PersonSuggestion[] = [], occupations: PersonJobSuggestion[] = [], education: PersonEducationSuggestion[] = [], sources: string[] = [];
  let unavailable = 0, firstError: unknown;
  while (queue.length && visited.size < 8 && Date.now() < deadline) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const page = await (dependencies.fetchPage || fetchPublicPage)(url, { timeoutMs: Math.min(3500, Math.max(1, deadline - Date.now())), maxBytes: 1_500_000 });
      const parsed = extractPersonPage(page.html, page.sourceUrl, name);
      if (!parsed.matched) { unavailable++; continue; }
      sources.push(page.sourceUrl); suggestions.push(...parsed.suggestions); occupations.push(...parsed.occupations); education.push(...parsed.education);
      for (const link of parsed.links) if (!visited.has(link) && !queue.includes(link) && queue.length < 16) queue.push(link);
    } catch (error) { firstError ??= error; unavailable++; }
  }
  if (!sources.length && firstError instanceof Error && /^Use a public/.test(firstError.message)) throw firstError;
  const fields = new Map<PersonSuggestion["field"], PersonSuggestion>(), conflicts = new Set<string>();
  for (const item of suggestions) {
    const previous = fields.get(item.field);
    if (previous && previous.value !== item.value && item.field !== "context") conflicts.add(item.field);
    else if (!previous) fields.set(item.field, item);
  }
  const distinctJobs = [...new Map(occupations.map((job) => [[personNameKey(job.title), personNameKey(job.employer || ""), job.status].join("|"), job])).values()];
  const jobs = distinctJobs.filter((job) => job.employer || !distinctJobs.some((other) => other.employer && personNameKey(other.title) === personNameKey(job.title) && other.status === job.status)).slice(0, 24);
  const schools = [...new Map(education.map((school) => [[personNameKey(school.institution), personNameKey(school.degree || ""), personNameKey(school.fieldOfStudy || "")].join("|"), school])).values()].slice(0, 16);
  if (!fields.has("context")) {
    const job = jobs.find((entry) => entry.status === "current" && entry.title);
    if (job) fields.set("context", { field: "context", value: `${name} works as ${job.title}${job.employer ? ` at ${job.employer}` : ""}.`, sourceUrl: job.sourceUrl, evidence: "Summary of the published occupation" });
  }
  return { suggestions: [...fields.values()].filter((item) => !conflicts.has(item.field)), occupations: jobs, education: schools, sources: [...new Set(sources)], fetchedAt: new Date().toISOString(),
    message: sources.length ? `${sources.length} public ${sources.length === 1 ? "profile" : "profiles"} checked.${unavailable ? " Some links could not be read or matched to this person." : ""}${conflicts.size ? " Conflicting details were left unchanged." : ""} Unpublished details stay empty.` : "No readable public profile could be matched to this name. Try a personal website or public biography; sign-in-only pages cannot supply details." };
}
