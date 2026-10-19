import type { TravelEntry } from "./travel-sync";
export function travelHistory(entry:TravelEntry) {
  return [
    ...(entry.visits||[]).map(v=>({id:`visit:${v.id}`,title:v.note||"Visit",start:v.startDate,end:v.endDate,source:"visit" as const})),
    ...entry.tripVisits.map(v=>({id:`trip:${v.tripId}`,title:v.title,start:v.startDate,end:v.endDate,source:"trip" as const})),
  ].sort((a,b)=>b.start.localeCompare(a.start)||a.id.localeCompare(b.id));
}
