import { addDays } from "./calendar-model";
import type { CalendarEvent, EventOccurrence } from "./types";
import type { PersonalOpsState } from "../personal-ops/types";
import { createNativeObjectRef } from "../../native-objects/routes";

export type PersonalCalendarEvent = CalendarEvent & { ownerRef: NonNullable<EventOccurrence["ownerRef"]>; workSource: NonNullable<EventOccurrence["workSource"]> };
/** A view of the original work record, without a second task state or backfill. */
export function personalCalendarEvents(ops: Pick<PersonalOpsState, "followUps" | "routines"> & Partial<Pick<PersonalOpsState,"decisions">>): PersonalCalendarEvent[] {
  const result: PersonalCalendarEvent[] = [];
  for (const item of [...ops.followUps, ...ops.routines, ...(ops.decisions || [])]) {
    if (item.archivedAt || item.lifecycle === "archived") continue;
    const routine = item.objectType === "routine";
    const decision = item.objectType === "decision";
    if (decision && ["cancelled","superseded"].includes(item.decisionState)) continue;
    if (routine && (item.lifecycle === "draft" || item.cadence === "paused" || item.cadence === "dormant")) continue;
    const date = routine ? item.nextRunDate || item.nextRunAt?.slice(0,10) : decision ? item.revisitAt || item.dueAt : item.deferredUntil || item.dueAt;
    if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue;
    const ownerRef = createNativeObjectRef({ module: "personal_ops", objectType: item.objectType, objectId: item.id, label: item.title });
    const start = date.slice(0,10);
    result.push({ id: `personal-calendar-${item.id}`, calendarId: "personal-work", title: item.title,
      description: routine ? item.summary || "" : decision ? item.finalDecision || item.question : item.context || "", start, end: addDays(start,1), allDay:true,
      timeZone: routine ? item.cadenceRule.timezone : "UTC", location:"", linkedRefs:[ownerRef, ...item.linkedRefs, ...(!routine ? item.sourceRefs : [])],
      isTask: !routine, completed: !routine && (decision ? item.decisionState === "decided" : item.followUpState === "complete"), reminderMinutes:null, recurrence:"", kind:"event",
      createdAt:item.createdAt, updatedAt:item.updatedAt, exceptions:{}, ownerRef,
      workSource:{family:routine ? "routines" : decision ? "decisions" : "followUps",id:item.id,updatedAt:item.updatedAt}
    });
  }
  return result;
}
