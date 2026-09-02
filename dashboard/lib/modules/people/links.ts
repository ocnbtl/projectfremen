export const PEOPLE_PROFILE_LINK_KEYS = [
  "website",
  "linkedin",
  "instagram",
  "tiktok",
  "x",
  "youtube"
] as const;

export type PeopleProfileLinkKey = (typeof PEOPLE_PROFILE_LINK_KEYS)[number];

/**
 * Browser URL APIs serialize a bare origin with a trailing slash. People keeps
 * the value the user intended instead, including for copied social links.
 */
export function withoutTrailingLinkSlash(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\/$/i.test(trimmed)) return trimmed;
  return trimmed.replace(/\/+$/, "");
}

export function normalizePeopleExternalSources(values: string[] | undefined): string[] {
  const unique = new Set<string>();
  for (const raw of values || []) {
    const value = withoutTrailingLinkSlash(raw);
    if (value) unique.add(value);
  }
  return Array.from(unique);
}
