import { readPersonalRecords, updatePersonalRecord } from "../../personal-records-store";
import { createNativeObjectRef } from "../../native-objects/routes";
import type { NativeObjectRef } from "../../native-objects/types";
import { readPlanningState, savePlanningRecord } from "./store";
import { effectiveEvent, type Place } from "./types";
import { addressIdentity, isPhysicalLocation, profilePlaceAddress } from "./place-identity";

export type PlaceReconciliation = { scanned: number; created: number; linked: number; unchanged: number; conflicts: number; remaining: boolean; dryRun: boolean };
const key = (ref: NativeObjectRef) => `${ref.module}:${ref.objectType}:${ref.objectId}`;
export async function reconcilePlaces({ dryRun = false, recordIds, eventIds, limit = 30 }: { dryRun?: boolean; recordIds?: string[]; eventIds?: string[]; limit?: number } = {}): Promise<PlaceReconciliation> {
  const [records, state] = await Promise.all([readPersonalRecords(), readPlanningState()]);
  const result: PlaceReconciliation = { scanned: 0, created: 0, linked: 0, unchanged: 0, conflicts: 0, remaining: false, dryRun };
  let places = state.places, attempted = 0;
  async function resolve(address: string, placeId: string | undefined) {
    const matches = placeId ? places.filter(place => place.id === placeId && !place.archivedAt) : places.filter(place => !place.archivedAt && addressIdentity(place.address) === addressIdentity(address));
    if (matches.length > 1 || (placeId && !matches.length)) throw new Error("Place needs review");
    let place = matches[0];
    if (!place) {
      if (dryRun) { result.created++; const preview: Place = { id: `preview-${addressIdentity(address)}`, name: address.slice(0, 240), address, linkedRefs: [], notes: "", tags: [], createdAt: "preview", updatedAt: "preview" }; places = [...places, preview]; return preview; }
      place = await savePlanningRecord("places", { name: address.slice(0, 240), address, notes: "", tags: [], linkedRefs: [] });
      if (!places.some(row => row.id === place.id)) { result.created++; places = [...places, place]; }
    }
    return place;
  }
  for (const record of records.filter(row => !row.archivedAt && ["person", "org"].includes(row.className) && (!recordIds || recordIds.includes(row.id)) && !eventIds)) {
    const locations = [...(record.profile?.locations || [])];
    if (!locations.length && record.className === "org" && isPhysicalLocation(record.profile?.headquarters || "")) locations.push({ id: `headquarters-${record.id}`, label: "Headquarters", location: record.profile!.headquarters });
    let changed = false;
    for (let index = 0; index < locations.length; index++) {
      const entry = locations[index], address = profilePlaceAddress(entry.address, entry.location);
      if (!isPhysicalLocation(address) && !entry.placeId) continue;
      result.scanned++;
      const place = places.find(row => row.id === entry.placeId && !row.archivedAt);
      if (place) { result.unchanged++; continue; }
      if (attempted >= limit) { result.remaining = true; continue; }
      attempted++;
      try {
        const linked = await resolve(address, entry.placeId);
        if (entry.placeId !== linked.id) { locations[index] = { ...entry, placeId: linked.id }; changed = true; }
        if (dryRun) result.linked++;
      } catch { result.conflicts++; attempted--; }
    }
    if (changed && !dryRun) {
      try { await updatePersonalRecord(record.id, { profile: { locations } }, { expectedUpdatedAt: record.updatedAt }); result.linked += locations.filter((entry, i) => entry.placeId !== record.profile?.locations?.[i]?.placeId).length; }
      catch { result.conflicts++; }
    }
  }
  for (const original of state.events.filter(row => !row.archivedAt && (!eventIds || eventIds.includes(row.id)) && !recordIds)) {
    const event = effectiveEvent(original);
    if (!isPhysicalLocation(event.location) && !event.placeId) continue;
    result.scanned++;
    const place = places.find(row => row.id === event.placeId && !row.archivedAt);
    if (place && event.linkedRefs.some(ref => ref.module === "map" && ref.objectId === place.id)) { result.unchanged++; continue; }
    if (attempted >= limit) { result.remaining = true; continue; }
    attempted++;
    try {
      const linked = await resolve(event.location, event.placeId);
      if (!dryRun) {
        const ref = createNativeObjectRef({ module: "map", objectType: "place", objectId: linked.id, label: linked.name });
        const patch = { placeId: linked.id, linkedRefs: [...new Map([...event.linkedRefs, ref].map(row => [key(row), row])).values()] };
        await savePlanningRecord("events", original.source ? { id: event.id, overrides: { ...original.overrides, ...patch } } : { id: event.id, ...patch }, original.updatedAt);
      }
      result.linked++;
    } catch { result.conflicts++; attempted--; }
  }
  return result;
}
