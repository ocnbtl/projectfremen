import type { PersonalRecord } from "../../personal-records-store";
import type { Place } from "../planning/types";
import { PLACE_TAGS, primaryPlaceTag } from "../planning/place-tags";

/** Use the Map vocabulary, without mistaking a linked headquarters area for a business category. */
export function organizationCategory(record: PersonalRecord, places: readonly Place[] = []): string {
  const type = (record.profile?.organizationType || "").trim().toLowerCase();
  const explicit = record.subjects.find(tag => ["food", "school", "travel", "organization"].includes(tag.toLowerCase()));
  if (explicit) return PLACE_TAGS.find(tag => tag.toLowerCase() === explicit.toLowerCase())!;
  if (/university|school|college/.test(type)) return "School";
  if (/restaurant|pub|cafe|café|bakery|bar$/.test(type)) return "Food";
  if (/airport|airline|hotel|tourism|travel/.test(type)) return "Travel";
  const linkedTags = places.filter(place => !place.archivedAt && ((record.profile?.locations || []).some(location => location.placeId === place.id) || place.linkedRefs.some(ref => ref.module === "people" && ref.objectId === record.id)))
    .map(place => primaryPlaceTag(place.tags, place.primaryTag));
  const category = linkedTags.find(tag => tag && ["food", "school", "travel"].includes(tag.toLowerCase()));
  return PLACE_TAGS.find(tag => tag.toLowerCase() === category?.toLowerCase()) || "Organization";
}

export function occupationLabel(record: PersonalRecord): string {
  const current = record.profile?.occupations?.filter(entry => entry.status === "current").map(entry => entry.title.trim()).filter(Boolean) || [];
  return [...new Set(current)].join(" · ") || record.profile?.primaryOccupation || "";
}

/** Read saved organization locations only; never infer an address from its name. */
export function organizationLocationLabel(record: PersonalRecord, places: readonly Place[] = []): string {
  const available = places.filter(place => !place.archivedAt && !place.mergedIntoId);
  const placeLabel = (place?: Place) => place && ([place.addressParts?.city, place.addressParts?.region].filter(Boolean).join(", ") || place.address);
  const locations = (record.profile?.locations || []).map(entry =>
    placeLabel(available.find(place => place.id === entry.placeId)) || entry.location || entry.address || "");
  if (!locations.some(Boolean) && record.profile?.headquarters) locations.push(record.profile.headquarters);
  if (!locations.some(Boolean)) locations.push(...available.filter(place => place.linkedRefs.some(ref => ref.module === "people" && ref.objectId === record.id)).map(place => placeLabel(place) || ""));
  return [...new Set(locations.map(value => value.trim()).filter(Boolean))].join(" · ");
}

export function interactionTimeLabel(start?: string, end?: string): string {
  const format = (value?: string) => {
    if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return "";
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${hour >= 12 ? "pm" : "am"}`;
  };
  const from = format(start), to = format(end);
  return from && to ? `${from} – ${to}${end! < start! ? " (+1 day)" : ""}` : from ? `From ${from}` : to ? `Until ${to}` : "";
}

/** Use explicit employment links, with an unambiguous saved-name fallback for older profiles. */
export function currentEmployerPictures(record: PersonalRecord, organizations: readonly PersonalRecord[]): PersonalRecord[] {
  if (record.className !== "person") return [];
  const available = organizations.filter(org => org.className === "org" && !org.archivedAt);
  const jobs = record.profile?.occupations?.length ? record.profile.occupations.filter(job => job.status === "current" && job.title.trim()) : [
    { organizationId: undefined, employer: record.profile?.primaryOccupation ? record.profile.primaryEmployer : undefined },
    { organizationId: undefined, employer: record.profile?.secondaryOccupation ? record.profile.secondaryEmployer : undefined }
  ];
  const result: PersonalRecord[] = [];
  for (const job of jobs) {
    const matches = job.organizationId ? available.filter(org => org.id === job.organizationId) : job.employer?.trim() ? available.filter(org => org.title.trim().toLocaleLowerCase() === job.employer!.trim().toLocaleLowerCase()) : [];
    if (matches.length === 1 && matches[0].profile?.photoUrl && !result.some(org => org.id === matches[0].id)) result.push(matches[0]);
  }
  return result;
}

/** Keep each current role and its employer together, including legacy profiles. */
export function currentOccupationEntries(record: PersonalRecord, organizations: readonly PersonalRecord[]): { title: string; employer?: PersonalRecord }[] {
  if (record.className !== "person") return [];
  const available = organizations.filter(org => org.className === "org" && !org.archivedAt);
  const current = record.profile?.occupations?.filter(job => job.status === "current" && job.title.trim()) || [];
  const jobs = current.length ? current : [
    { title: record.profile?.primaryOccupation || "", employer: record.profile?.primaryEmployer, organizationId: undefined },
    { title: record.profile?.secondaryOccupation || "", employer: record.profile?.secondaryEmployer, organizationId: undefined }
  ];
  return jobs.filter(job => job.title.trim()).map(job => {
    const matches = job.organizationId ? available.filter(org => org.id === job.organizationId) : available.filter(org => job.employer?.trim() && org.title.trim().toLocaleLowerCase() === job.employer.trim().toLocaleLowerCase());
    return { title: job.title.trim(), employer: matches.length === 1 ? matches[0] : undefined };
  });
}
