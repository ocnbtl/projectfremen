/** Shared suggestion contract. Public metadata is evidence to review, never a record write. */
export const ORGANIZATION_AUTOFILL_LABELS = {
  name: "Organization name", organizationType: "Organization type", industry: "Industry or field",
  foundedYear: "Founded year", teamSize: "Team size", headquarters: "Headquarters",
  context: "Description", website: "Website", linkedin: "LinkedIn", x: "X",
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube"
} as const;
export type OrganizationAutofillField = keyof typeof ORGANIZATION_AUTOFILL_LABELS;
export const ORGANIZATION_TYPES = ["Business", "Nonprofit", "University / School", "Government", "Agency", "Community", "Association", "Other"] as const;
export type OrganizationSuggestion = {
  field: OrganizationAutofillField;
  value: string;
  sourceUrl: string;
  evidence: string;
};
export type OrganizationAutofillResult = {
  suggestions: OrganizationSuggestion[];
  sourceUrl: string;
  fetchedAt: string;
  message: string;
};

export function organizationSuggestionError(field: OrganizationAutofillField, value: string): string {
  if (!value.trim()) return "Enter a value or uncheck this suggestion.";
  if (field === "foundedYear" && (!/^\d{4}$/.test(value.trim()) || Number(value) < 1 || Number(value) > new Date().getUTCFullYear())) return "Enter a four-digit year that is not in the future.";
  if (field === "organizationType" && !ORGANIZATION_TYPES.includes(value as typeof ORGANIZATION_TYPES[number])) return "Choose a recognized organization type in the form, or uncheck this suggestion.";
  if (["website", "linkedin", "x", "instagram", "tiktok", "youtube"].includes(field)) {
    try { normalizeOrganizationUrl(value); } catch { return "Enter a public HTTP or HTTPS link."; }
  }
  return "";
}

export function parseOrganizationUrl(raw: string): URL {
  const input = raw.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) {
    throw new Error("Use a public HTTP or HTTPS link without a password or custom port.");
  }
  url.hash = "";
  return url;
}

export function normalizeOrganizationUrl(raw: string): string {
  const url = parseOrganizationUrl(raw);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`;
}

export function organizationLinkField(raw: string): OrganizationAutofillField {
  const hostname = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  for (const [domain, field] of [["linkedin.com", "linkedin"], ["x.com", "x"], ["twitter.com", "x"], ["instagram.com", "instagram"], ["tiktok.com", "tiktok"], ["youtube.com", "youtube"], ["youtu.be", "youtube"]] as const) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) return field;
  }
  return "website";
}
