import type { PersonalContactProfile } from "../../personal-records-store";

export function derivePersonNameParts(value: string) {
  const parts = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  return {
    firstName: parts[0] || "",
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    lastName: parts.length > 1 ? parts[parts.length - 1] : "",
  };
}

export function mergeNicknames(...values: (string | undefined)[]): string {
  const seen = new Set<string>();
  return values.flatMap(value => (value || "").split(",")).map(value => value.trim()).filter(value => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(", ");
}

export function extractQuotedNickname(value: string): { fullName: string; nickname: string } | null {
  const nicknames: string[] = [];
  // Single quotes must be separate words so O'Connor and D’Angelo remain names.
  const fullName = value.replace(/"([^"\r\n]{1,80})"|“([^”\r\n]{1,80})”|(?<!\S)'([^'\r\n]{1,80})'(?!\S)|(?<!\S)‘([^’\r\n]{1,80})’(?!\S)/g,
    (match, ...groups: unknown[]) => {
      const nickname = (groups.slice(0, 4).find(value => typeof value === "string") as string | undefined)?.trim();
      if (!nickname) return match;
      nicknames.push(nickname);
      return " ";
    }).replace(/\s+/g, " ").trim();
  return nicknames.length ? { fullName, nickname: mergeNicknames(...nicknames) } : null;
}

/** The edited full name is authoritative; retain compound parts that still fit it. */
export function normalizeImportedPersonName(name: string, profile: Partial<PersonalContactProfile>, kind: string) {
  if (kind !== "person") return { name, profile };
  const quotedName = extractQuotedNickname(name);
  const fields = ["firstName", "middleName", "lastName"] as const;
  const quotedParts = fields.map(field => extractQuotedNickname(profile[field] || ""));
  if (!quotedName && !quotedParts.some(Boolean)) return { name, profile };
  const structuredName = fields.map((field, index) => quotedParts[index]?.fullName ?? profile[field]).filter(Boolean).join(" ");
  const cleanName = quotedName ? quotedName.fullName || structuredName || quotedName.nickname : name;
  const after = structuredName === cleanName
    ? Object.fromEntries(fields.map((field, index) => [field, quotedParts[index]?.fullName ?? profile[field] ?? ""])) as ReturnType<typeof derivePersonNameParts>
    : derivePersonNameParts(cleanName);
  if (structuredName !== cleanName) {
    const suppliedFirst = quotedParts[0]?.fullName ?? profile.firstName ?? "";
    const suppliedLast = quotedParts[2]?.fullName ?? profile.lastName ?? "";
    if (suppliedFirst && (cleanName === suppliedFirst || cleanName.startsWith(`${suppliedFirst} `))) after.firstName = suppliedFirst;
    const rest = cleanName.slice(after.firstName.length).trim();
    after.lastName = suppliedLast && (rest === suppliedLast || rest.endsWith(` ${suppliedLast}`)) ? suppliedLast : rest.split(" ").pop() || "";
    after.middleName = after.lastName ? rest.slice(0, -after.lastName.length).trim() : "";
  }
  const next = { ...profile, ...after, fullName: cleanName, nickname: mergeNicknames(profile.nickname, quotedName?.nickname, ...quotedParts.map(part => part?.nickname)) };
  return { name: cleanName, profile: next };
}
