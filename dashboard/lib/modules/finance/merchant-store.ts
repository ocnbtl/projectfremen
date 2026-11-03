import { readJsonFile } from "../../file-store";
import { getPersonalSystemDomain } from "../../personal-systems";
import type { FinanceOrganization } from "./merchants";

/** Finance needs identities only, not contact/occupation/place enrichment. */
export async function readFinanceOrganizations(): Promise<FinanceOrganization[]> {
  const records = await readJsonFile<Array<Record<string, unknown>>>("personal-records.json", []);
  return records.flatMap(record => {
    const kind = String(record.className || record.kind || "").trim().toLowerCase();
    if (kind !== "org" || record.archivedAt || typeof record.id !== "string" || !getPersonalSystemDomain(typeof record.domain === "string" ? record.domain : "notes-docs")) return [];
    const profile = record.profile && typeof record.profile === "object" ? record.profile as Record<string, unknown> : {};
    const photoUrl = typeof profile.photoUrl === "string" && profile.photoUrl === `/api/people/photos/${record.id}` ? profile.photoUrl : undefined;
    return [{ id: record.id, title: String(record.title || profile.fullName || "Organization"), photoUrl,
      photoUpdatedAt: typeof profile.photoUpdatedAt === "string" ? profile.photoUpdatedAt : undefined,
      website: typeof profile.website === "string" ? profile.website : undefined }];
  }).sort((left, right) => left.title.localeCompare(right.title));
}
