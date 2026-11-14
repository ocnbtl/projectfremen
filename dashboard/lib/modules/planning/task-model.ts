import type { NativeObjectRef } from "../../native-objects/types";
import { effectiveEvent, type Calendar, type CalendarEvent, type EventOccurrence, type EventOverride } from "./types";
import type { PersonalOpsState } from "../personal-ops/types";
import type { ProjectsState } from "../projects/types";
import { createNativeObjectRef } from "../../native-objects/routes";
import { addDays, instantFor, localFor } from "./calendar-model";
import { parseRepeatLanguage } from "./repeat-language";

export const TASK_KINDS = { task: "Task", goal: "Goal", routine: "Routine", obligation: "Obligation", decision: "Decision", follow_up: "Follow-up", objective: "Objective" } as const;
export type TaskKind = keyof typeof TASK_KINDS;
export type TaskSource = { family: "goals" | "legacyGoals" | "followUps" | "decisions" | "obligations" | "routines" | "objectives" | "events"; id: string; projectId?: string };
/** Source-backed entries contain scheduling metadata only. Their title/status stay canonical. */
export type TaskPlan = {
  id: string; source?: TaskSource; title?: string; description?: string; kind: TaskKind;
  start: string; end: string; allDay: boolean; timeZone: string; recurrence: string;
  calendarIds: string[]; peopleIds?: string[]; linkedRefs?: NativeObjectRef[]; exceptions: Record<string, EventOverride>; completed?: boolean;
  targetDate?:string;
  createdAt: string; updatedAt: string;
};
export type TaskDetails = {outcome?:string;finalDecision?:string;rationale?:string;completionNote?:string;completionCriteria?:import("../personal-ops/types").ObligationCompletionCriterion[];requiredEvidence?:import("../personal-ops/types").ObligationEvidenceRequirement[]};
export type TaskItem = TaskPlan & { title: string; description: string; details?:TaskDetails; dueAt?: string; sourceUpdatedAt?: string; ownerRef?: EventOccurrence["ownerRef"]; blockedCompletion?: string; sourceLinkedRefs?: NativeObjectRef[] };
export const taskKey = (source: TaskSource) => `${source.family}:${source.projectId ? source.projectId + ":" : ""}${source.id}`;
export const personTaskColor = (id:string) => ["#3979A0","#9861A5","#B36A31","#408775","#7B7830"][Array.from(id).reduce((sum,char)=>sum+char.charCodeAt(0),0)%5];

export function taskCatalog(plans: TaskPlan[], ops: PersonalOpsState | null, projects: ProjectsState | null, events: CalendarEvent[], zone: string): TaskItem[] {
  const result: TaskItem[] = plans.filter(p => !p.source).map(p => ({ ...p, title: p.title || "Task", description: p.description || "",dueAt:p.targetDate }));
  const add = (source: TaskSource, item: Omit<TaskItem, keyof TaskPlan> & {title:string;description:string;createdAt:string;updatedAt:string;kind:TaskKind;completed:boolean; start?:string; recurrence?:string; timeZone?:string; allDay?:boolean; end?:string}) => {
    const plan = plans.find(p => p.id === taskKey(source));
    result.push({ id: taskKey(source), source, start: item.start || "", end: item.start ? addDays(item.start,1) : "", allDay:true, timeZone: item.timeZone || zone, recurrence:item.recurrence || "", calendarIds:[], exceptions:{}, ...item, ...plan,
      title:item.title, description:item.description||plan?.description||"", completed: item.completed, sourceUpdatedAt:item.updatedAt, updatedAt:plan?.updatedAt || "" });
  };
  for (const family of ["goals","followUps","decisions","obligations","routines"] as const) for (const item of ops?.[family] || []) {
    if (item.archivedAt || item.lifecycle === "archived") continue;
    if (item.objectType === "routine" && (item.lifecycle === "draft" || ["paused","dormant"].includes(item.cadence))) continue;
    if (item.objectType === "decision" && ["cancelled","superseded"].includes(item.decisionState)) continue;
    if (item.objectType === "follow_up" && item.followUpState === "carried_forward") continue;
    if (item.objectType === "goal" && item.goalState === "cancelled") continue;
    const routine = item.objectType === "routine" ? item : undefined;
    const frequency = routine && ({daily:"DAILY",weekly:"WEEKLY",biweekly:"WEEKLY",monthly:"MONTHLY",quarterly:"MONTHLY",annual:"YEARLY",custom:"DAILY"} as const)[routine.cadenceRule.frequency];
    const interval = routine ? routine.cadenceRule.interval * (routine.cadenceRule.frequency === "biweekly" ? 2 : routine.cadenceRule.frequency === "quarterly" ? 3 : 1) : 1;
    const startDate = routine ? routine.cadenceRule.anchorDate || routine.nextRunDate || routine.nextRunAt?.slice(0,10) || routine.createdAt.slice(0,10) : "";
    const start = startDate && routine?.nextRunTime ? `${startDate}T${routine.nextRunTime}` : startDate;
    let recurrence = routine ? `FREQ=${frequency};INTERVAL=${interval}${frequency === "WEEKLY" && routine.cadenceRule.weekdays.length ? ";BYDAY=" + routine.cadenceRule.weekdays.map(n=>["SU","MO","TU","WE","TH","FR","SA"][n]).join(",") : ""}` : "";
    if(routine?.cadenceRule.frequency === "custom"){try{const rule=parseRepeatLanguage(routine.cadenceRule.label || "");recurrence=rule.recurrenceAnchor?"":rule.recurrence;}catch{recurrence="";}}
    add({family,id:item.id}, {title:item.title, description: routine ? routine.summary : item.objectType === "follow_up" ? item.context : item.objectType === "decision" ? item.question : "description" in item ? item.description : "", createdAt:item.createdAt,updatedAt:item.updatedAt, kind:item.objectType === "follow_up" ? "follow_up" : item.objectType as TaskKind,
      details:item.objectType==="decision"?{finalDecision:item.finalDecision,rationale:item.rationale}:item.objectType==="goal"?{outcome:item.outcome}:item.objectType==="obligation"?{completionNote:item.completionNote,completionCriteria:item.completionCriteria,requiredEvidence:item.requiredEvidence}:item.objectType==="follow_up"?{outcome:item.outcome}:undefined,
      dueAt:"dueAt" in item ? item.dueAt : undefined, completed: item.lifecycle === "complete" || ("decisionState" in item && item.decisionState === "decided") || ("followUpState" in item && item.followUpState === "complete") || ("obligationState" in item && item.obligationState === "complete"),
      ownerRef:createNativeObjectRef({module:"personal_ops",objectType:item.objectType,objectId:item.id,label:item.title}),
      ...(routine ? { start, allDay:!routine.nextRunTime, end:routine.nextRunTime?localFor(instantFor(start!,routine.cadenceRule.timezone)+3600000,routine.cadenceRule.timezone):addDays(start!,1), timeZone:routine.cadenceRule.timezone, recurrence } : {}),
      sourceLinkedRefs:[...item.linkedRefs,...("sourceRefs" in item?item.sourceRefs:[])], blockedCompletion: undefined });
    if(routine){const task=result.at(-1)!;task.exceptions={...task.exceptions};for(const run of routine.runHistory)if(run.scheduledFor)task.exceptions[run.scheduledFor]={...task.exceptions[run.scheduledFor],completed:!run.reopenedAt};}
  }
  for (const project of projects?.projects || []) {
    if (project.archivedAt || ["archived","complete"].includes(project.lifecycle)) continue;
    for (const objective of project.objectives) add({family:"objectives",id:objective.id,projectId:project.id}, {title:objective.text,description:"",kind:objective.kind || "objective",createdAt:objective.createdAt,updatedAt:project.updatedAt,dueAt:objective.targetAt,completed:!!objective.completedAt,
      ownerRef:createNativeObjectRef({module:"projects",objectType:"project",objectId:project.id,label:project.name})});
  }
  // Existing Calendar tasks are included without copying or changing their IDs.
  for (const original of events) {const event=effectiveEvent(original);if (event.isTask && !event.archivedAt && !event.source?.cancelled) {
    result.push({id:taskKey({family:"events",id:event.id}),source:{family:"events",id:event.id},kind:event.taskAssignment?.kind||"task",title:event.title,description:event.description,start:event.taskAssignment?.floating?"":event.start,end:event.taskAssignment?.floating?"":event.end,allDay:event.allDay,timeZone:event.timeZone,recurrence:event.recurrence,calendarIds:event.taskAssignment?.calendarIds || [event.calendarId],peopleIds:event.taskAssignment?.peopleIds || [],linkedRefs:event.linkedRefs,exceptions:event.exceptions,completed:event.completed,createdAt:event.createdAt,updatedAt:event.updatedAt,sourceUpdatedAt:event.updatedAt});
  }}
  // Project-side links are another view of the same task, not a second task record.
  // Retain older linked goals/decisions when displaying the unified task catalogue.
  const taskOwners = new Map<string, TaskItem[]>();
  for (const item of result) if (item.ownerRef?.module === "personal_ops") {
    const key = taskRefKey(item.ownerRef);
    taskOwners.set(key, [...(taskOwners.get(key) || []), item]);
  }
  const projectById = new Map((projects?.projects || []).map(project => [project.id, project]));
  for (const link of projects?.links || []) {
    if (link.linkState === "removed" || link.removedAt) continue;
    const project = projectById.get(link.projectId);
    if (!project || project.archivedAt || project.lifecycle === "archived") continue;
    for (const item of taskOwners.get(taskRefKey(link.source)) || []) {
      const ref = createNativeObjectRef({module:"projects",objectType:"project",objectId:project.id,label:project.name});
      if (!taskLinks(item).some(existing => taskRefKey(existing) === taskRefKey(ref))) item.sourceLinkedRefs = [...(item.sourceLinkedRefs || []), ref];
    }
  }
  return result;
}

export function taskEvents(items: TaskItem[], calendars: Calendar[], zone: string, _now = new Date()): CalendarEvent[] {
  // General tasks stay in the catalogue, never projected onto a calendar day.
  return items.filter(item => item.source?.family !== "events" && !!item.start).map(item => {
    const start = item.start;
    const profiles = item.calendarIds.map(id=>calendars.find(c=>c.id===id && !c.archivedAt)).filter((c):c is Calendar=>!!c);
    return { id:`task:${item.id}`,title:item.title,description:item.description,start,end:item.end || addDays(start,1),allDay:item.start ? item.allDay : true,timeZone:item.timeZone || zone,
      calendarId:profiles[0]?.id || "personal-work",isTask:true,completed:item.completed,recurrence:item.start ? item.recurrence : "",exceptions:item.exceptions,createdAt:item.createdAt,updatedAt:item.updatedAt,location:"",linkedRefs:taskLinks(item),reminderMinutes:null,kind:"event" as const,
      taskContext:{id:item.id,kind:item.kind,sourceUpdatedAt:item.sourceUpdatedAt,planUpdatedAt:item.updatedAt,floating:!item.start,colors:[...profiles.map(p=>p.color),...(item.peopleIds||[]).map(personTaskColor)],calendarIds:profiles.map(p=>p.id),dueAt:item.dueAt,peopleIds:item.peopleIds},ownerRef:item.ownerRef };
  });
}

/** Old Calendar tasks keep their event identity and any existing links/import metadata. */
export function calendarTaskRecords(events:CalendarEvent[],calendars:Calendar[],_zone:string,_now=new Date()):CalendarEvent[]{
  return events.filter(original=>{const event=effectiveEvent(original);return !event.isTask || !event.taskAssignment?.floating;}).map(original=>{
    const event=effectiveEvent(original),assignment=event.taskAssignment;
    if(!event.isTask || !assignment)return original;
    const profiles=assignment.calendarIds.map(id=>calendars.find(c=>c.id===id&&!c.archivedAt)).filter((c):c is Calendar=>!!c);
    return {...original,taskContext:{id:taskKey({family:"events",id:event.id}),kind:assignment.kind,planUpdatedAt:original.updatedAt,sourceUpdatedAt:original.updatedAt,floating:assignment.floating,calendarIds:profiles.map(c=>c.id),peopleIds:assignment.peopleIds,colors:[...profiles.map(c=>c.color),...assignment.peopleIds.map(personTaskColor)]}};
  });
}

export const taskRefKey=(ref:NativeObjectRef)=>`${ref.module}:${ref.objectType}:${ref.containerObjectId||""}:${ref.objectId}`;
export function taskLinks(item:TaskItem):NativeObjectRef[]{return [...new Map([...(item.ownerRef?[item.ownerRef]:[]),...(item.sourceLinkedRefs||[]),...(item.linkedRefs||[])].map(ref=>[taskRefKey(ref),ref])).values()];}
export const taskMatchesPerson=(item:TaskItem,id:string)=>!!item.peopleIds?.includes(id)||taskLinks(item).some(ref=>ref.module==="people"&&ref.objectType==="person"&&ref.objectId===id);
