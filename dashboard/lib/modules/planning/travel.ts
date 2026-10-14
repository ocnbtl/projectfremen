import usParks from "./travel-us-parks.json";
import countries from "./address-countries.json";

export const travelKinds = ["country", "state", "city", "landmark", "park"] as const;
export type TravelKind = typeof travelKinds[number];
export const travelStatuses = ["visited", "lived", "want", "going"] as const;
export type TravelStatus = typeof travelStatuses[number];
export const travelStatusLabels: Record<TravelStatus, string> = { visited: "Visited", lived: "Lived", want: "Want to go", going: "Going" };
export type TravelDestination = { id: string; name: string; kind: TravelKind; country: string; description?: string; source?: string; latitude?: number; longitude?: number };
export type TravelVisit = { id: string; startDate: string; endDate: string; note: string };
export type TravelRecord = TravelDestination & { statuses: TravelStatus[]; visits?: TravelVisit[]; updatedAt: string };

export function travelDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") throw new Error("Choose a valid visit date");
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new Error("Choose a valid visit date");
  return value;
}
export function normalizeTravelVisits(input: unknown): TravelVisit[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 100) throw new Error("Keep up to 100 visits per place");
  const ids = new Set<string>();
  return input.map(v => {
    if (!v || typeof v !== "object" || typeof v.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(v.id) || ids.has(v.id)) throw new Error("Invalid visit identifier");
    ids.add(v.id);
    const startDate = travelDate(v.startDate), endDate = travelDate(v.endDate || v.startDate);
    if (endDate < startDate) throw new Error("The last day must be on or after the first day");
    if (typeof v.note !== "string" || v.note.length > 500) throw new Error("Visit notes can be up to 500 characters");
    return { id: v.id, startDate, endDate, note: v.note.trim() };
  });
}
export const travelCountries = Object.entries(countries).filter(([code]) => code !== "ZZ").map(([code, value]) => ({ code, name: value.name })).sort((a,b) => a.name.localeCompare(b.name));
export const countryDestinations: TravelDestination[] = travelCountries.map(c => ({id:`country:${c.code}`,name:c.name,kind:"country",country:c.code}));
export const stateDestinations: TravelDestination[] = "AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming".split("|").map(row => {const [code,name]=row.split(":");return {id:`state:US-${code}`,name,kind:"state",country:"US"};});

export function normalizeTravelRecord(input: unknown): Omit<TravelRecord,"updatedAt"> {
  if (!input || typeof input !== "object") throw new Error("Choose a destination");
  const v = input as Record<string,unknown>;
  const kind = v.kind as TravelKind;
  if (!travelKinds.includes(kind)) throw new Error("Choose a valid destination type");
  const country = typeof v.country === "string" ? v.country.toUpperCase() : "";
  if (!travelCountries.some(c => c.code === country)) throw new Error("Choose a country");
  const id = typeof v.id === "string" ? v.id : "";
  if (!/^(country:[A-Z]{2}|state:US-[A-Z]{2}|park:nps:[a-z0-9-]+|(city|landmark|park):Q[1-9][0-9]*|(city|landmark):osm:[NWR][1-9][0-9]*|landmark:unesco:[1-9][0-9]*-[A-Z]{2}|(city|landmark|park):custom:[0-9a-f-]{36})$/.test(id) || !id.startsWith(`${kind}:`)) throw new Error("Invalid destination identifier");
  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (!name || name.length > 240) throw new Error("A destination name of up to 240 characters is required");
  if (!Array.isArray(v.statuses) || v.statuses.some(s => !travelStatuses.includes(s as TravelStatus))) throw new Error("Choose valid travel statuses");
  const statuses = [...new Set(v.statuses)] as TravelStatus[];
  if ((kind === "park" || kind === "landmark") && statuses.includes("lived")) throw new Error("Lived is available for countries, states and cities");
  const fixed = kind === "country" ? countryDestinations.find(d=>d.id===id) : kind === "state" ? stateDestinations.find(d=>d.id===id) : id.startsWith("park:nps:") ? usParks.items.find(d=>d.id===id) as TravelDestination | undefined : undefined;
  if ((kind === "country" || kind === "state" || id.startsWith("park:nps:")) && (!fixed || fixed.country !== country)) throw new Error("Invalid destination");
  const result: Omit<TravelRecord,"updatedAt"> = {...(fixed || {id,name,kind,country}),statuses,visits:normalizeTravelVisits(v.visits)};
  if (typeof v.description === "string") result.description = v.description.trim().slice(0,500);
  if(id.startsWith("landmark:unesco:")){if(!id.endsWith(`-${country}`))throw new Error("Invalid heritage country");result.source=`https://whc.unesco.org/en/list/${id.split(":")[2].split("-")[0]}/`;}
  const qid=id.split(":")[1];
  if(/^(city|landmark):osm:/.test(id)){const osm=id.split(":")[2];result.source=`https://www.openstreetmap.org/${({N:"node",W:"way",R:"relation"} as Record<string,string>)[osm[0]]}/${osm.slice(1)}`;}
  if (/^Q[1-9][0-9]*$/.test(qid)) result.source=`https://www.wikidata.org/wiki/${qid}`;
  if (typeof v.latitude === "number" && typeof v.longitude === "number" && Number.isFinite(v.latitude) && Number.isFinite(v.longitude) && Math.abs(v.latitude)<=90 && Math.abs(v.longitude)<=180) {result.latitude=v.latitude;result.longitude=v.longitude;}
  return result;
}
