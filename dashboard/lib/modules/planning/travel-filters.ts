import type { TravelDestination, TravelStatus, TravelKind } from "./travel";

export const travelKinds: { value: TravelKind; label: string }[] = [
  { value: "country", label: "Countries" }, { value: "state", label: "U.S. states" },
  { value: "city", label: "Cities" }, { value: "landmark", label: "Landmarks" },
  { value: "park", label: "National parks" },
];

/** OR within each group; AND between groups. Filtering never changes a travel record. */
export function filterTravelEntries<T extends TravelDestination & { statuses: TravelStatus[] }>(entries: T[], kinds: TravelKind[], statuses: TravelStatus[], query: string): T[] {
  const search = query.trim().toLocaleLowerCase();
  return entries.filter(entry => (!kinds.length || kinds.includes(entry.kind)) &&
    (!statuses.length || statuses.some(status => entry.statuses.includes(status))) &&
    entry.name.toLocaleLowerCase().includes(search)).sort((a,b) => a.name.localeCompare(b.name));
}
