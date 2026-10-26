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

export function interactionTimeLabel(start?: string, end?: string): string {
  const format = (value?: string) => {
    if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return "";
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
  };
  const from = format(start), to = format(end);
  return from && to ? `${from} – ${to}${end! < start! ? " (+1 day)" : ""}` : from ? `From ${from}` : to ? `Until ${to}` : "";
}
