/** Shared suggestion contract. Public metadata is evidence to review, never a record write. */
export const ORGANIZATION_AUTOFILL_LABELS = {
  name: "Organization name", organizationType: "Organization type", industry: "Industry or field",
  foundedYear: "Founded year", teamSize: "Team size", headquarters: "Headquarters",
  streetAddress: "Street address", context: "Description", website: "Website", linkedin: "LinkedIn", x: "X",
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
  sources?: string[];
  unavailableSources?: number;
  conflicts?: OrganizationAutofillField[];
  photo?: { dataUrl: string; sourceUrl: string };
};
export const ORGANIZATION_LINK_FIELDS = ["website", "linkedin", "x", "youtube", "instagram", "tiktok"] as const;
export type OrganizationLinkField = typeof ORGANIZATION_LINK_FIELDS[number];
export type OrganizationAutofillValues = Partial<Record<OrganizationAutofillField, string>>;

export function organizationSeedUrls(values: OrganizationAutofillValues): string[] {
  return [...new Set(ORGANIZATION_LINK_FIELDS.flatMap((field) => {
    try {
      const url = parseOrganizationUrl(values[field] || "");
      return url.hostname.includes(".") ? [normalizeOrganizationUrl(url.toString())] : [];
    } catch { return []; }
  }))];
}

export function canCompleteOrganizationAddress(current: string, proposed: string): boolean {
  const key = (value: string) => value.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  return Boolean(current.trim()) && current.split(",").length <= 2 && proposed.split(",").length >= 4 && key(proposed).startsWith(key(current) + ",");
}

export function emptyOrganizationSuggestions(suggestions: OrganizationSuggestion[], values: OrganizationAutofillValues): OrganizationSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((item) => {
    const completesStreet = item.field === "streetAddress" && canCompleteOrganizationAddress(values.streetAddress || "", item.value);
    if (!(item.field in ORGANIZATION_AUTOFILL_LABELS) || seen.has(item.field) || values[item.field]?.trim() && !completesStreet || organizationSuggestionError(item.field, item.value)) return false;
    const otherLocationField = item.field === "streetAddress" ? "headquarters" : item.field === "headquarters" ? "streetAddress" : null;
    if (otherLocationField && values[otherLocationField]?.trim()) {
      const supplied = suggestions.find((suggestion) => suggestion.field === otherLocationField)?.value;
      const locationKey = (value: string) => value.toLowerCase().split(",")[0].replace(/\s+/g, " ").trim();
      if (supplied && locationKey(supplied) !== locationKey(values[otherLocationField]!)) return false;
    }
    seen.add(item.field);
    return true;
  });
}

export function organizationSuggestionError(field: OrganizationAutofillField, value: string): string {
  if (!value.trim()) return "Enter a value or uncheck this suggestion.";
  if (field === "foundedYear" && (!/^\d{4}$/.test(value.trim()) || Number(value) < 1 || Number(value) > new Date().getUTCFullYear())) return "Enter a four-digit year that is not in the future.";
  if (field === "organizationType" && !ORGANIZATION_TYPES.includes(value as typeof ORGANIZATION_TYPES[number])) return "Choose a recognized organization type in the form, or uncheck this suggestion.";
  if ((ORGANIZATION_LINK_FIELDS as readonly string[]).includes(field)) {
    try {
      const link = organizationProfileLink(value);
      if (!link || link.field !== field) return "Use the organization's website or its matching social profile.";
    } catch { return "Enter a public HTTP or HTTPS link."; }
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

export function organizationLinkField(raw: string): OrganizationLinkField {
  const hostname = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  for (const [domain, field] of [["linkedin.com", "linkedin"], ["x.com", "x"], ["twitter.com", "x"], ["instagram.com", "instagram"], ["tiktok.com", "tiktok"], ["youtube.com", "youtube"], ["youtu.be", "youtube"]] as const) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) return field;
  }
  return "website";
}

/** Accept profile links, not share buttons, individual posts, login pages or video embeds. */
export function organizationProfileLink(raw: string): { field: OrganizationLinkField; url: string } | null {
  const url = parseOrganizationUrl(raw);
  if (!url.hostname.includes(".")) return null;
  const field = organizationLinkField(url.toString());
  const path = url.pathname.replace(/\/+$/, "");
  if (field === "linkedin" && !/^\/(?:company|school|showcase)\/[\w%.-]+$/i.test(path)) return null;
  if (field === "x" && (!/^\/[\w]{1,30}$/.test(path) || /^\/(?:intent|share|home|search|explore|login|signup|i|settings)$/i.test(path))) return null;
  if (field === "instagram" && (!/^\/[\w.]+$/.test(path) || /^\/(?:p|reel|reels|stories|accounts|explore|direct|about|legal)$/i.test(path))) return null;
  if (field === "tiktok" && !/^\/@[\w.-]+$/.test(path)) return null;
  if (field === "youtube" && !/^\/(?:@[\w%.-]+|(?:channel|c|user)\/[\w%.-]+)$/i.test(path)) return null;
  if (field !== "website") url.search = "";
  return { field, url: normalizeOrganizationUrl(url.toString()) };
}
