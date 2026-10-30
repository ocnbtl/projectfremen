import type { CalendarEvent, EventOccurrence } from "../planning/types";
import { LEGACY_PET_ID, PET_CARE_KINDS, type DogTrackerState } from "./types";
import { readDogTrackerState } from "./store";
export type PetCalendarEvent = CalendarEvent & { petSource: NonNullable<EventOccurrence["petSource"]> };
export function petCalendarEvents(state:DogTrackerState):PetCalendarEvent[] {
  return state.events.flatMap(entry=>{const pet=state.pets?.find(p=>p.id===(entry.petId || LEGACY_PET_ID)),schedule=entry.schedule;if(!pet||pet.archived||entry.archived||!schedule)return [];
    return [{...schedule,id:`pet-care-${entry.id}`,title:`${pet.name} · ${entry.title || PET_CARE_KINDS.find(k=>k.id===entry.kind)?.label || "Care"}`,description:"",location:"",linkedRefs:[],allDay:false,recurrence:"",exceptions:{},reminderMinutes:null,kind:"event",isTask:true,completed:entry.status!=="planned",createdAt:entry.createdAt,updatedAt:entry.updatedAt,petSource:{id:entry.id,petId:pet.id,updatedAt:entry.updatedAt}}];
  });
}
export async function readPetCalendarEvents(){return petCalendarEvents(await readDogTrackerState());}
