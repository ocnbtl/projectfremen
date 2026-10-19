import { createHash } from "node:crypto";
import { readPlanningState } from "./store";
import { createPersonalRecord, readPersonalRecords } from "../../personal-records-store";

export async function createPlaceOrganization(placeId: string, expectedUpdatedAt: string, name: string) {
  const place = (await readPlanningState()).places.find(row => row.id === placeId && !row.archivedAt && !row.mergedIntoId);
  if (!place) throw new Error("This place is no longer available.");
  if (!expectedUpdatedAt || expectedUpdatedAt !== place.updatedAt) throw new Error("This place changed. Reopen it before creating an organization.");
  const title = name.trim();
  if (!title || title.length > 240) throw new Error("Enter an organization name of up to 240 characters.");
  const records = await readPersonalRecords();
  const existing = records.find(row => row.className === "org" && !row.archivedAt && (row.profile?.locations?.some(location => location.placeId === place.id) || place.linkedRefs.some(ref => ref.objectType === "organization" && ref.objectId === row.id)));
  if (existing) return existing;
  if (records.some(row => row.className === "org" && !row.archivedAt && row.title.toLocaleLowerCase() === title.toLocaleLowerCase())) throw new Error("An organization with this name already exists. Use Link an object to connect it.");
  // Stable identity makes retries and simultaneous clicks create only one organization.
  const hash = createHash("sha256").update(`place-organization:${place.id}`).digest("hex");
  const id = `personal-${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
  if (records.some(row => row.id === id && row.archivedAt)) throw new Error("The organization previously created for this place is archived. Restore it in People or link another organization.");
  const result = await createPersonalRecord({ domain: "notes-docs", className: "org", title, privacy: "private", status: "active", profile: { fullName: title, locations: [{ id: "place-address", label: "Address", address: place.address, placeId: place.id }] } }, { requestedId: id });
  return result.find(row => row.id === id)!;
}
