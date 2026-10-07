import { readPersonalRecords } from "../../personal-records-store";
import { createNativeObjectRef } from "../../native-objects/routes";
import type { CalendarEvent } from "./types";
import type { BirthdaySource } from "./observances";

export async function repeatBirthdays(events: CalendarEvent[]): Promise<BirthdaySource[] | undefined> {
  if (!events.some(e => e.recurrenceAnchor?.personId || e.overrides?.recurrenceAnchor?.personId)) return undefined;
  const records=await readPersonalRecords();
  return records.filter(r=>r.className==="person" && !r.archivedAt && r.profile?.birthday).map(r=>({birthday:r.profile!.birthday!,ref:createNativeObjectRef({module:"people",objectType:"person",objectId:r.id,label:r.title})}));
}
