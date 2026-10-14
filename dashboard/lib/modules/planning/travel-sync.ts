import type { PersonalTrip } from "../personal-life/types";
import { countryDestinations, stateDestinations, type TravelDestination, type TravelRecord, type TravelStatus } from "./travel";
import { createNativeObjectRef } from "../../native-objects/routes";

export type TripVisit = { tripId: string; title: string; status: TravelStatus; startDate: string; endDate: string };
export type TravelEntry = TravelRecord & { tripVisits: TripVisit[] };
const statusMap = { been: "visited", lived: "lived", planned: "going", want: "want" } as const;

// Only exact country/state names are inferred. Ambiguous cities are linked explicitly.
export function tripDestinations(trip: Pick<PersonalTrip,"place"|"travelDestinations">): TravelDestination[] {
  if (trip.travelDestinations !== undefined) return trip.travelDestinations;
  const match = [...countryDestinations, ...stateDestinations].find(d => d.name.toLowerCase() === trip.place.trim().toLowerCase());
  return match ? [match] : [];
}
export function buildTravelEntries(records: TravelRecord[], trips: PersonalTrip[]): TravelEntry[] {
  const entries = new Map<string,TravelEntry>(records.map(r => [r.id, { ...r, statuses: [...new Set([...r.statuses, ...(r.visits?.length ? ["visited" as const] : [])])], visits: r.visits || [], tripVisits: [] }]));
  for (const trip of trips) {
    const linked = tripDestinations(trip);
    // A visit to a state/city also contributes to the country's travel record.
    const destinations = [...new Map(linked.flatMap(d => [d, ...countryDestinations.filter(c => c.country === d.country)]).map(d => [d.id,d])).values()];
    for (const d of destinations) {
      const entry = entries.get(d.id) || { ...d, statuses: [], visits: [], updatedAt: "", tripVisits: [] } as TravelEntry;
      const status = statusMap[trip.status];
      if (!entry.statuses.includes(status)) entry.statuses.push(status);
      entry.tripVisits.push({ tripId: trip.id, title: trip.name, status, startDate: trip.startDate.slice(0,10), endDate: (trip.endDate || trip.startDate).slice(0,10) });
      entries.set(d.id, entry);
    }
  }
  return [...entries.values()].filter(r => r.statuses.length || r.visits?.length || r.tripVisits.length);
}
export function travelCalendarEntries(records: TravelRecord[]) {
  return records.flatMap(record => (record.visits || []).map(visit => {
    const end = new Date(`${visit.endDate || visit.startDate}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate()+1);
    return { id: `travel-${record.id}-${visit.id}`, title: `Visit to ${record.name}`, start: visit.startDate, end: end.toISOString().slice(0,10), completed: false,
      ownerRef: createNativeObjectRef({module:"map",objectType:"travel_destination",objectId:record.id,label:record.name}) };
  }));
}
