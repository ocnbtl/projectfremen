import type { PersonalEducationEntry, PersonalOccupationEntry } from "../../personal-records-store";
import { normalizeBirthday } from "./birthday";
import { normalizeOrganizationUrl, organizationLinkField, organizationProfileLink, organizationSuggestionError, ORGANIZATION_AUTOFILL_LABELS, ORGANIZATION_LINK_FIELDS, type OrganizationSuggestion } from "./organization-autofill";

export const PERSON_AUTOFILL_LABELS = { context: "About", birthday: "Birthday", website: "Website", linkedin: "LinkedIn", x: "X", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" } as const;
export type PersonAutofillField = keyof typeof PERSON_AUTOFILL_LABELS;
export type PersonEvidence = { sourceUrl: string; evidence: string };
export type PersonSuggestion = PersonEvidence & { field: PersonAutofillField; value: string };
export type PersonJobSuggestion = PersonEvidence & Omit<PersonalOccupationEntry, "id" | "organizationId"> & { website?: string };
export type PersonEducationSuggestion = PersonEvidence & Omit<PersonalEducationEntry, "id" | "organizationId"> & { website?: string };
export type PersonAutofillResult = {
  suggestions: PersonSuggestion[]; occupations: PersonJobSuggestion[]; education: PersonEducationSuggestion[];
  sources: string[]; fetchedAt: string; message: string;
  unavailableSources?: { url: string; message: string }[];
  method?: "public_page" | "pasted_text";
  organizations?: PersonOrganizationEnrichment[];
};
export type PersonOrganizationEnrichment = { name: string; website?: string; organizationId?: string; suggestions: OrganizationSuggestion[]; message: string };
export type PersonOrganizationPlan = { kind: "employer" | "school"; entryId: string; name: string; website?: string; sourceUrl: string; organizationId?: string; suggestions?: OrganizationSuggestion[] };
export type PersonAutofillPending = { organizations: PersonOrganizationPlan[]; sources: string[] };
export function validatePersonAutofillPending(input: unknown): PersonAutofillPending | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid People autofill details");
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.organizations) || raw.organizations.length > 40 || !Array.isArray(raw.sources) || raw.sources.length > 24) throw new Error("Too many People autofill details");
  const url = (value: unknown) => {
    if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new Error("Autofill needs a valid public source link");
    return normalizeOrganizationUrl(value);
  };
  return { sources: [...new Set(raw.sources.map(url))], organizations: raw.organizations.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid autofill organization");
    const plan = item as Record<string, unknown>;
    if (!["employer", "school"].includes(String(plan.kind)) || typeof plan.entryId !== "string" || !/^[\w-]{1,80}$/.test(plan.entryId) || typeof plan.name !== "string" || !plan.name.trim() || plan.name.length > 240) throw new Error("Invalid autofill organization");
    if (plan.organizationId !== undefined && (typeof plan.organizationId !== "string" || !/^[\w-]{1,100}$/.test(plan.organizationId))) throw new Error("Invalid autofill organization reference");
    if (plan.suggestions !== undefined && (!Array.isArray(plan.suggestions) || plan.suggestions.length > 16)) throw new Error("Too many organization suggestions");
    const seen = new Set<string>();
    const suggestions = (plan.suggestions as unknown[] || []).map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid organization suggestion");
      const suggestion = value as OrganizationSuggestion;
      if (!Object.hasOwn(ORGANIZATION_AUTOFILL_LABELS, suggestion.field) || seen.has(suggestion.field) || typeof suggestion.value !== "string" || suggestion.value.length > 2048 || typeof suggestion.evidence !== "string" || suggestion.evidence.length > 800 || organizationSuggestionError(suggestion.field, suggestion.value)) throw new Error("Invalid organization suggestion");
      seen.add(suggestion.field);
      return { field: suggestion.field, value: suggestion.value.trim(), evidence: suggestion.evidence, sourceUrl: url(suggestion.sourceUrl) };
    });
    return { kind: plan.kind as PersonOrganizationPlan["kind"], entryId: plan.entryId, name: plan.name.trim(), sourceUrl: url(plan.sourceUrl), ...(plan.website ? { website: url(plan.website) } : {}), ...(plan.organizationId ? { organizationId: plan.organizationId as string } : {}), ...(suggestions.length ? { suggestions } : {}) };
  }) };
}
export type PersonAutofillValues = Partial<Record<PersonAutofillField, string>> & {
  occupations: PersonalOccupationEntry[]; education: PersonalEducationEntry[]; autofill?: PersonAutofillPending;
};
export const personNameKey = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function personProfileLink(raw: string): { field: "website" | "linkedin" | "x" | "instagram" | "tiktok" | "youtube"; url: string } | null {
  try {
    const url = normalizeOrganizationUrl(raw);
    if (organizationLinkField(url) === "linkedin") {
      const parsed = new URL(url);
      if (!/^\/in\/[\w%.-]+$/i.test(parsed.pathname)) return null;
      return { field: "linkedin", url: `${parsed.origin}${parsed.pathname}` };
    }
    return organizationProfileLink(url);
  } catch { return null; }
}

export function personSeedUrls(values: Partial<Record<PersonAutofillField, string>>): string[] {
  return [...new Set(ORGANIZATION_LINK_FIELDS.flatMap((field) => {
    const link = values[field] ? personProfileLink(values[field]!) : null;
    return link ? [link.url] : [];
  }))];
}

function entryId(prefix: string, values: string[]) {
  let hash = 2166136261;
  for (const char of values.join("|")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `autofill-${prefix}-${(hash >>> 0).toString(16)}`;
}

/** Add evidence-backed details to the current draft without overwriting user edits. */
export function applyPersonAutofill<T extends PersonAutofillValues>(current: T, result: PersonAutofillResult): T & { autofill: PersonAutofillPending } {
  const next = { ...current, occupations: current.occupations.map((entry) => ({ ...entry })), education: current.education.map((entry) => ({ ...entry })) };
  const plans = [...(current.autofill?.organizations || [])];
  for (const item of result.suggestions) {
    if (!(item.field in PERSON_AUTOFILL_LABELS) || next[item.field]?.trim() || !item.value.trim()) continue;
    if (item.field === "birthday" && !normalizeBirthday(item.value)) continue;
    if (!["context", "birthday"].includes(item.field) && personProfileLink(item.value)?.field !== item.field) continue;
    Object.assign(next, { [item.field]: item.value });
  }
  for (const job of result.occupations) {
    const title = job.title.trim(), employer = job.employer?.trim() || "";
    if (!title && !employer) continue;
    const key = personNameKey(employer);
    let entry = next.occupations.find((item) => personNameKey(item.employer || "") === key && item.status === job.status &&
      (!item.title || !title || personNameKey(item.title) === personNameKey(title)));
    if (!entry) {
      next.occupations = next.occupations.filter((item) => item.title || item.employer || item.organizationId);
      if (next.occupations.length >= 24) continue;
      entry = { id: entryId("job", [key, title, job.status]), title, employer, status: job.status };
      next.occupations.push(entry);
    } else { entry.title ||= title; entry.employer ||= employer; }
    if (employer) plans.push({ kind: "employer", entryId: entry.id, name: employer, website: job.website, sourceUrl: job.sourceUrl, organizationId: entry.organizationId });
  }
  for (const school of result.education) {
    const institution = school.institution.trim();
    if (!institution) continue;
    const key = personNameKey(institution);
    let entry = next.education.find((item) => personNameKey(item.institution) === key &&
      (!item.degree || !school.degree || personNameKey(item.degree) === personNameKey(school.degree)) &&
      (!item.fieldOfStudy || !school.fieldOfStudy || personNameKey(item.fieldOfStudy) === personNameKey(school.fieldOfStudy)));
    if (!entry) {
      next.education = next.education.filter((item) => item.institution || item.degree || item.fieldOfStudy || item.organizationId);
      if (next.education.length >= 16) continue;
      entry = { id: entryId("school", [key, school.degree || "", school.fieldOfStudy || ""]), institution, degree: school.degree, fieldOfStudy: school.fieldOfStudy, status: school.status };
      next.education.push(entry);
    } else { entry.degree ||= school.degree; entry.fieldOfStudy ||= school.fieldOfStudy; entry.status ||= school.status; }
    plans.push({ kind: "school", entryId: entry.id, name: institution, website: school.website, sourceUrl: school.sourceUrl, organizationId: entry.organizationId });
  }
  // A blocked profile can still have employers/schools saved on the person.
  // Include those relationships so a retry can enrich their organizations too.
  const existingSource = personSeedUrls(current)[0] || result.sources[0];
  if (existingSource) {
    for (const entry of next.occupations) if (entry.employer?.trim() && !plans.some(plan => plan.kind === "employer" && plan.entryId === entry.id)) {
      plans.push({ kind: "employer", entryId: entry.id, name: entry.employer, organizationId: entry.organizationId, sourceUrl: existingSource });
    }
    for (const entry of next.education) if (entry.institution.trim() && !plans.some(plan => plan.kind === "school" && plan.entryId === entry.id)) {
      plans.push({ kind: "school", entryId: entry.id, name: entry.institution, organizationId: entry.organizationId, sourceUrl: existingSource });
    }
  }
  return { ...next, autofill: {
    organizations: [...new Map(plans.filter(plan => {
      const entry = plan.kind === "employer" ? next.occupations.find(item => item.id === plan.entryId) : next.education.find(item => item.id === plan.entryId);
      return entry && entry.organizationId === plan.organizationId && personNameKey("institution" in entry ? entry.institution : entry.employer || "") === personNameKey(plan.name);
    }).map((plan) => {
      const enrichment = result.organizations?.find((item) => personNameKey(item.name) === personNameKey(plan.name) && item.organizationId === plan.organizationId && (!plan.website || !item.website || normalizeOrganizationUrl(plan.website) === normalizeOrganizationUrl(item.website)));
      const previous = current.autofill?.organizations.find((item) => item.kind === plan.kind && item.entryId === plan.entryId && item.name === plan.name && item.organizationId === plan.organizationId);
      return [`${plan.kind}:${plan.entryId}`, { ...plan, suggestions: enrichment?.suggestions.length ? enrichment.suggestions : previous?.suggestions }];
    })).values()],
    sources: [...new Set([...(current.autofill?.sources || []), ...result.sources])].slice(0, 24)
  } };
}

/** Ignore source-only discoveries when reporting whether the form actually changed. */
export function personAutofillHasChanges(current: PersonAutofillValues, result: PersonAutofillResult): boolean {
  const next = applyPersonAutofill(current, result);
  if (Object.keys(PERSON_AUTOFILL_LABELS).some((field) => (current[field as PersonAutofillField] || "") !== (next[field as PersonAutofillField] || ""))) return true;
  if (JSON.stringify(current.occupations) !== JSON.stringify(next.occupations) || JSON.stringify(current.education) !== JSON.stringify(next.education)) return true;
  return next.autofill.organizations.some((plan) => (!plan.organizationId || plan.suggestions?.length) && !(current.autofill?.organizations || []).some((existing) => JSON.stringify(existing) === JSON.stringify(plan)));
}
