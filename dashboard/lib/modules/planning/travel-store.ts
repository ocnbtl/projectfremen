import { mutateJsonFile, readJsonFile } from "../../file-store";
import { normalizeTravelRecord, type TravelRecord } from "./travel";
const FILE = "map-travel-records.json";
type State = { records: TravelRecord[] };
export async function readTravelRecords() { return (await readJsonFile<State>(FILE,{records:[]})).records; }
export async function saveTravelRecord(input: unknown, expectedUpdatedAt: unknown) {
  const next=normalizeTravelRecord(input);
  return mutateJsonFile<State,TravelRecord>(FILE,{records:[]},current=>{
    const existing=current.records.find(r=>r.id===next.id);
    if ((existing?.updatedAt || null) !== (expectedUpdatedAt || null)) throw new Error("This record changed. Refresh Travel and try again.");
    const record={...next,updatedAt:new Date(Math.max(Date.now(),Date.parse(existing?.updatedAt || "")+1 || 0)).toISOString()};
    const records=current.records.filter(r=>r.id!==next.id);
    // Keep empty records as versioned tombstones to prevent stale tabs restoring old selections.
    records.push(record);
    if(records.length>15000)throw new Error("Travel collection is full");
    return {value:{records},result:record};
  });
}
