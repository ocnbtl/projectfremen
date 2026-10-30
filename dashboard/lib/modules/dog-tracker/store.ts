import { Temporal } from "@js-temporal/polyfill";
import { validateWellnessSchedule } from "../personal-wellness/schedule";
import { readPlanningState } from "../planning/store";
import { randomUUID } from "node:crypto";
import { mutateJsonFile, readJsonFile } from "../../file-store";
import { DOG_TRACKER_SCHEMA_VERSION, LEGACY_PET_ID, PET_CARE_KINDS, PET_PROFILE_FIELDS, type DogCareEvent, type DogCareInput, type DogTrackerState, type PetProfile } from "./types";
const FILE_NAME = "personal-dog-tracker.json";
export function emptyDogTrackerState(): DogTrackerState { return { schemaVersion: DOG_TRACKER_SCHEMA_VERSION, events: [], pets: [] }; }
function record(value: unknown): value is Record<string,unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function text(value: unknown, field: string, max: number, required = false): string {
  if (value != null && typeof value !== "string") throw new Error(`${field} must be text`);
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length > max || (required && !result)) throw new Error(`${field} ${required ? "is required and " : ""}must be up to ${max} characters`);
  return result;
}
function iso(value: unknown, field: string): string { const result = text(value,field,40,true); if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a valid date`); return new Date(result).toISOString(); }
const stamp = (previous?: string) => new Date(Math.max(Date.now(),(Date.parse(previous || "") || 0)+1)).toISOString();
function legacyPet(events: DogCareEvent[]): PetProfile { const at = events.map(e=>e.createdAt).filter(Boolean).sort()[0] || "1970-01-01T00:00:00.000Z"; return { id: LEGACY_PET_ID, name: "My dog", species: "Dog", fields: {}, archived: false, createdAt: at, updatedAt: at }; }
// Read-time compatibility only: old entries keep their identities and full history.
function stateOf(raw: unknown): DogTrackerState {
  if (!record(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.events) || (raw.pets !== undefined && !Array.isArray(raw.pets))) throw new Error("Pet records could not be read safely. Reload before saving.");
  if (raw.events.some(e=>!record(e) || typeof e.id!=="string" || typeof e.occurredAt!=="string")) throw new Error("Pet history could not be read safely.");
  const events = raw.events as DogCareEvent[], pets = [...(raw.pets as PetProfile[] || [])];
  if (events.some(e=>!e.petId || e.petId===LEGACY_PET_ID) && !pets.some(p=>p.id===LEGACY_PET_ID)) pets.push(legacyPet(events));
  return { ...raw, schemaVersion: 1, events: [...events].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)), pets } as DogTrackerState;
}
export async function readDogTrackerState(): Promise<DogTrackerState> { return stateOf(await readJsonFile(FILE_NAME,emptyDogTrackerState())); }
async function validateEvent(raw: DogCareInput, state: DogTrackerState, previous?:DogCareEvent): Promise<DogCareInput> {
  if (!record(raw) || !PET_CARE_KINDS.some(kind=>kind.id===raw.kind)) throw new Error("Choose a valid care type");
  const petId=text(raw.petId || LEGACY_PET_ID,"Pet",120,true);
  if (!state.pets?.some(p=>p.id===petId && !p.archived)) throw new Error("Choose an active pet");
  if (raw.status !== undefined && raw.status!=="planned" && raw.status!=="completed") throw new Error("Choose planned or completed");
  const schedule=validateWellnessSchedule(raw.schedule);
  if(schedule?.repeat)throw new Error("Schedule each pet care entry separately.");
  if(schedule && JSON.stringify(schedule)!==JSON.stringify(previous?.schedule)){const calendar=(await readPlanningState()).calendars.find(c=>c.id===schedule.calendarId&&!c.archivedAt&&!c.connectionId);if(!calendar)throw new Error("Choose an available local calendar.");}
  const occurredAt=schedule?Temporal.PlainDateTime.from(schedule.start).toZonedDateTime(schedule.timeZone).toInstant().toString():iso(raw.occurredAt,"When");
  if (raw.nextDue && Date.parse(iso(raw.nextDue,"Next due")) <= Date.parse(occurredAt)) throw new Error("Next due must be after the care date");
  if (raw.archived !== undefined && typeof raw.archived!=="boolean") throw new Error("Invalid archive status");
  return { kind: raw.kind, petId, occurredAt, schedule, peed: raw.peed===true, pooped: raw.pooped===true,
    notes: text(raw.notes,"Notes",8000), title: text(raw.title,"Title",180), status: raw.status || "completed", amount: text(raw.amount,"Amount / dose",200), instructions: text(raw.instructions,"Instructions",4000), nextDue: raw.nextDue ? iso(raw.nextDue,"Next due") : "", archived: raw.archived===true };
}
function checkVersion(item: {updatedAt:string}, expected: string) { if (!expected || item.updatedAt!==expected) throw new Error("This pet record changed elsewhere. Reload before saving; your draft is still here."); }
export async function createDogCareEvent(input: DogCareInput): Promise<DogCareEvent> {
  return mutateJsonFile(FILE_NAME,emptyDogTrackerState(),async raw=>{
    const state=stateOf(raw);
    if (!input.petId && !state.pets?.some(p=>p.id===LEGACY_PET_ID)) state.pets!.push(legacyPet(state.events));
    const now=stamp(), item={...await validateEvent(input,state),id:randomUUID(),createdAt:now,updatedAt:now};
    return { value:{...state,events:[item,...state.events]},result:item };
  });
}
export async function updateDogCareEvent(id: string, input: Partial<DogCareInput>, expectedUpdatedAt: string): Promise<DogCareEvent> {
  return mutateJsonFile(FILE_NAME,emptyDogTrackerState(),async raw=>{
    const state=stateOf(raw),previous=state.events.find(e=>e.id===id);if(!previous)throw new Error("Care entry not found");checkVersion(previous,expectedUpdatedAt);
    if (!record(input)) throw new Error("Care details are required");
    if (input.petId && input.petId!==(previous.petId || LEGACY_PET_ID)) throw new Error("A care entry cannot be moved to another pet");
    const item={...previous,...await validateEvent({...previous,...input},state,previous),id,createdAt:previous.createdAt,updatedAt:stamp(previous.updatedAt)};
    return {value:{...state,events:state.events.map(e=>e.id===id?item:e)},result:item};
  });
}
export async function deleteDogCareEvent(id: string, expectedUpdatedAt: string): Promise<void> {
  await mutateJsonFile(FILE_NAME,emptyDogTrackerState(),raw=>{const state=stateOf(raw),item=state.events.find(e=>e.id===id);if(!item)throw new Error("Care entry not found");checkVersion(item,expectedUpdatedAt);return {value:{...state,events:state.events.filter(e=>e.id!==id)},result:undefined};});
}
export async function savePetProfile(raw: unknown, id?: string, expectedUpdatedAt?: string): Promise<PetProfile> {
  if (!record(raw)) throw new Error("Pet details are required");
  return mutateJsonFile(FILE_NAME,emptyDogTrackerState(),value=>{
    const state=stateOf(value),previous=id?state.pets!.find(p=>p.id===id):undefined;
    if (id && !previous) throw new Error("Pet not found");if(previous)checkVersion(previous,expectedUpdatedAt || "");
    const input={...previous,...raw};
    if (!record(input.fields)) throw new Error("Pet details are required");
    if (typeof input.archived!=="boolean") throw new Error("Invalid archive status");
    const fields: Record<string,string> = {};
    for(const [key,value] of Object.entries(input.fields)) {
      if (!PET_PROFILE_FIELDS.some(f=>f.id===key)) throw new Error("Unsupported pet detail");
      fields[key]=text(value,key,4000);
      if (["birthday","adopted"].includes(key) && fields[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(fields[key]) || !Number.isFinite(Date.parse(fields[key]+"T12:00Z")) || new Date(fields[key]+"T12:00Z").toISOString().slice(0,10)!==fields[key])) throw new Error("Choose a valid date");
    }
    const now=stamp(previous?.updatedAt),item: PetProfile={...previous,id:previous?.id || randomUUID(),name:text(input.name,"Name",120,true),species:text(input.species,"Species",120,true),fields,archived:input.archived,createdAt:previous?.createdAt || now,updatedAt:now};
    return {value:{...state,pets:previous?state.pets!.map(p=>p.id===id?item:p):[...state.pets!,item]},result:item};
  });
}
