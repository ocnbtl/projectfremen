export const PEOPLE_PROFILE_LINK_KEYS = [
  "website",
  "linkedin",
  "instagram",
  "tiktok",
  "x",
  "youtube"
] as const;

export type PeopleProfileLinkKey = (typeof PEOPLE_PROFILE_LINK_KEYS)[number];

/** Accept the addresses and handles people paste, while storing usable web links. */
export function normalizePeopleProfileLink(key: PeopleProfileLinkKey, value: string, organization = false): string {
  let address = value.trim();
  if (!address) return "";
  const labels = { website: "Website", linkedin: "LinkedIn", instagram: "Instagram", tiktok: "TikTok", x: "X", youtube: "YouTube" };
  if (key !== "website" && /^@?[\w.-]+$/.test(address) && (address.startsWith("@") || !address.includes("."))) {
    const bases = { linkedin: `https://www.linkedin.com/${organization ? "company" : "in"}/`, instagram: "https://www.instagram.com/", tiktok: "https://www.tiktok.com/@", x: "https://x.com/", youtube: "https://www.youtube.com/@" };
    address = bases[key] + address.replace(/^@/, "");
  }
  if (address.startsWith("//")) address = `https:${address}`;
  else if (!/^[a-z][a-z\d+.-]*:/i.test(address)) address = `https://${address}`;
  try {
    const url = new URL(address);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || url.username || url.password || /\s/.test(address)) throw new Error();
    return withoutTrailingLinkSlash(url.href);
  } catch {
    throw new Error(`${labels[key]} needs a valid web address${key === "website" ? ", such as example.com" : " or an @handle"}. Your other edits are still here.`);
  }
}

/**
 * Browser URL APIs serialize a bare origin with a trailing slash. People keeps
 * the value the user intended instead, including for copied social links.
 */
export function withoutTrailingLinkSlash(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\/$/i.test(trimmed)) return trimmed;
  const suffix = trimmed.search(/[?#]/);
  if (suffix >= 0) return trimmed.slice(0, suffix).replace(/\/+$/, "") + trimmed.slice(suffix);
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
