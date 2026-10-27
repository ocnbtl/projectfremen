import { readJsonFile } from "../../file-store";
import { getPersonalSystemDomain } from "../../personal-systems";

/** Check the same profile identity/domain rules as the directory, without rebuilding
 * every contact, relationship and linked place just to serve one picture. Always
 * read current storage: deleted profiles must not survive in an authorization cache.
 */
export async function hasPeoplePhotoProfile(personId: string): Promise<boolean> {
  const records = await readJsonFile<Array<{ id?: unknown; domain?: unknown; className?: unknown; kind?: unknown }>>("personal-records.json", []);
  return records.some(record => {
    if (record.id !== personId) return false;
    const domain = typeof record.domain === "string" ? record.domain : "notes-docs";
    const kind = typeof record.className === "string" ? record.className : typeof record.kind === "string" ? record.kind : "";
    return Boolean(getPersonalSystemDomain(domain)) && ["person", "org"].includes(kind.trim().toLowerCase());
  });
}
