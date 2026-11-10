import { legacyGoalTasks, completeLegacyGoal } from "./task-legacy-goals";
import { refs as normalizeLinks } from "./record-validation";
import { resolveActiveNativeObjectRef } from "../../native-objects/resolve-reference";
import { createNativeObjectRef } from "../../native-objects/routes";
import { taskRefKey } from "./task-model";
import { readPlanningState, mutatePlanningState, savePlanningRecord } from "./store";
import { readPersonalOpsState, updatePersonalOpsObject, recordRoutineTask } from "../personal-ops/store";
import { readProjectsState, updateProjectsObject } from "../projects/store";
import { readPersonalRecords } from "../../personal-records-store";
import { taskCatalog, TASK_KINDS, type TaskPlan, type TaskItem } from "./task-model";
import { addDays, eventOccurrences, validateEventTime } from "./calendar-model";
import { taskCompletionPatch } from "./calendar-tasks";
import type { EventFields } from "./types";

function fail(message:string,status=400):never {throw Object.assign(new Error(message),{status});}
const text=(v:unknown,max=300)=>{if(typeof v!=="string"||v.length>max)fail("Check the task fields.");return v.trim();};
export async function readTasks(zone:string) {
  new Intl.DateTimeFormat("en-US",{timeZone:zone});
  const [state,ops,projects]=await Promise.all([readPlanningState(),readPersonalOpsState(),readProjectsState()]);
  return {state,ops,projects,items:[...taskCatalog(state.taskPlans||[],ops,projects,state.events,zone),...await legacyGoalTasks(state.taskPlans||[],zone)]};
}
function eventFor(item:TaskItem) { return {...item,source:undefined,id:item.id,calendarId:"native",isTask:true,kind:"event" as const,location:"",linkedRefs:[],reminderMinutes:null}; }
export async function changeTask(body:Record<string,unknown>) {
  const zone=text(body.timeZone||"America/New_York",100);
  const loaded=await readTasks(zone), id=text(body.id), current=loaded.items.find(t=>t.id===id);
  if(body.operation!=="create" && !current)fail("This task is no longer available.",404);
  if(current && (body.expectedUpdatedAt!==current.updatedAt || body.sourceUpdatedAt!==current.sourceUpdatedAt))fail("This task changed elsewhere. Reload before saving; your draft is still here.",409);
  if(body.operation==="create" && current)fail("This task was already created. Reload to see it.",409);
  if(body.operation==="create" && !/^task-[a-f0-9-]{36}$/.test(id))fail("Choose a new task identity.");
  if(body.operation==="move-occurrence"){
    const item=current!,key=text(body.occurrenceKey,40),input=body.input as Record<string,unknown>;
    if(!item.recurrence || !input)fail("Choose a repeating task occurrence.");
    const date=(item.exceptions[key]?.start || key).slice(0,10);
    if(!eventOccurrences([eventFor(item)],date,addDays(date,1),item.timeZone).some(e=>e.occurrenceKey===key))fail("This occurrence is unavailable.");
    const start=text(input.start,40),end=text(input.end,40);
    validateEventTime({...eventFor(item),start,end,allDay:false,recurrence:""});
    const exceptions={...item.exceptions,[key]:{...item.exceptions[key],start,end,allDay:false}};
    if(item.source?.family==="events")return savePlanningRecord("events",{id:item.source.id,exceptions},item.updatedAt);
    return storePlan(item,{exceptions});
  }
  if(body.operation==="complete" || body.operation==="skip") {
    const item=current!;
    const key=text(body.occurrenceKey,40);
    const completed=body.completed;
    if(typeof completed!=="boolean")fail("Choose complete or reopen.");
    if(item.blockedCompletion)fail(item.blockedCompletion);
    if(item.start) {
      const date=(item.exceptions[key]?.start || key).slice(0,10);
      if(!eventOccurrences([eventFor(item)],date,addDays(date,1),item.timeZone).some(e=>e.occurrenceKey===key))fail("Choose an available task occurrence.");
    } else if(key!=="") fail("This task has no scheduled occurrence.");
    if(body.operation==="skip" && !item.recurrence)fail("Only a repeating task occurrence can be skipped.");
    const source=item.source;
    const family=source?.family;
    const sourceRecord=family&&["goals","followUps","decisions","obligations"].includes(family)?loaded.ops[family as "goals"|"followUps"|"decisions"|"obligations"].find(record=>record.id===source?.id):undefined;
    const stateField=family==="goals"?"goalState":family==="followUps"?"followUpState":family==="decisions"?"decisionState":family==="obligations"?"obligationState":undefined;
    const restore=body.restoreState&&typeof body.restoreState==="object"&&!completed?body.restoreState as Record<string,unknown>:undefined;
    const restorePatch=sourceRecord&&stateField&&restore?{[stateField]:restore[stateField],lifecycle:restore.lifecycle as typeof sourceRecord.lifecycle}:{};
    async function finish<T>(promise:Promise<T>){
      const result=await promise;
      if(body.withUndo!==true||body.operation!=="complete"||!completed||(item.recurrence?item.exceptions[key]?.completed:item.completed))return result;
      const saved=result as {updatedAt?:string;sourceUpdatedAt?:string;item?:{updatedAt:string}};
      const version=saved.item?.updatedAt||saved.updatedAt;
      const writesPlan=!source||(!!item.recurrence&&family!=="routines"&&family!=="events");
      const undo={title:item.title,command:{operation:"complete",id:item.id,timeZone:zone,occurrenceKey:key,completed:false,expectedUpdatedAt:writesPlan||family==="events"?version:item.updatedAt,sourceUpdatedAt:family==="legacyGoals"?saved.sourceUpdatedAt:source&&!writesPlan?version:item.sourceUpdatedAt,...(sourceRecord&&stateField&&!item.recurrence?{restoreState:{lifecycle:sourceRecord.lifecycle,[stateField]:(sourceRecord as unknown as Record<string,unknown>)[stateField]}}:{})}};
      return {result,undo};
    }
    if(item.source?.family==="events") {
      const record=loaded.state.events.find(e=>e.id===item.source!.id)!;
      return finish(savePlanningRecord("events",body.operation==="skip" ? {id:record.id,exceptions:{...record.exceptions,[key]:{...record.exceptions[key],cancelled:true}}}:taskCompletionPatch(record,item.start?key:record.start,completed),item.updatedAt));
    }
    if(item.source?.family==="routines" && body.operation==="complete")return finish(recordRoutineTask(item.source.id,key,completed,item.sourceUpdatedAt!));
    if(!item.recurrence && item.source) {
      const source=item.source;
      if(source.family==="legacyGoals")return finish(completeLegacyGoal(item,completed));
      if(source.family==="goals")return finish(updatePersonalOpsObject("goals",source.id,{goalState:completed?"complete":"active",lifecycle:completed?"complete":"active",...restorePatch},{expectedUpdatedAt:item.sourceUpdatedAt!}));
      if(source.family==="objectives") {
        const project=loaded.projects.projects.find(p=>p.id===source.projectId)!;
        return finish(updateProjectsObject("projects",project.id,{objectives:project.objectives.map(o=>({id:o.id,text:o.text,targetAt:o.targetAt,completed:o.id===source.id?completed:!!o.completedAt}))},{expectedUpdatedAt:item.sourceUpdatedAt!}));
      }
      if(source.family==="followUps") return finish(updatePersonalOpsObject("followUps",source.id,{followUpState:completed?"complete":"open",lifecycle:completed?"complete":"active",...restorePatch},{expectedUpdatedAt:item.sourceUpdatedAt!}));
      if(source.family==="decisions") return finish(updatePersonalOpsObject("decisions",source.id,{decisionState:completed?"decided":"open",lifecycle:completed?"complete":"active",...restorePatch},{expectedUpdatedAt:item.sourceUpdatedAt!}));
      if(source.family==="obligations") return finish(updatePersonalOpsObject("obligations",source.id,{obligationState:completed?"complete":"open",lifecycle:completed?"complete":"active",...restorePatch},{expectedUpdatedAt:item.sourceUpdatedAt!}));
    }
    return finish(storePlan(item,{...(item.recurrence ? {exceptions:{...item.exceptions,[key]:{...item.exceptions[key],...(body.operation==="skip"?{cancelled:true}:{completed})}}} : {completed})}));
  }
  if(!["create","schedule"].includes(String(body.operation)))fail("Choose a task action.");
  const input=body.input as Record<string,unknown>;
  if(!input || typeof input!=="object")fail("Choose task details.");
  const start=text(input.start||"",40), end=text(input.end||"",40), recurrence=text(input.recurrence||"",500);
  const allDay=input.allDay===true;
  if(recurrence&&!start)fail("Choose the first day for a repeating task.");
  if(start)validateEventTime({start,end,allDay,timeZone:zone,recurrence} as EventFields);
  if(current?.source?.family==="routines" && (!start || !recurrence))fail("Routines need a first day and repeat schedule.");
  if(!start && end)fail("Choose a start date or clear the end date.");
  const calendarIds=Array.isArray(input.calendarIds)?[...new Set(input.calendarIds.map(v=>text(v)))]:[];
  if(calendarIds.length>12 || calendarIds.some(id=>!loaded.state.calendars.some(c=>c.id===id&&!c.archivedAt)))fail("Choose available Calendar profiles.");
  const peopleIds=Array.isArray(input.peopleIds)?[...new Set(input.peopleIds.map(v=>text(v)))]:[];
  if(peopleIds.length>20)fail("Assign no more than 20 people.");
  if(peopleIds.length) {const people=await readPersonalRecords();if(peopleIds.some(id=>!people.some(p=>p.id===id&&p.className==="person"&&!p.archivedAt)))fail("Choose available People profiles.");}
  const kind=text(input.kind||"task") as TaskPlan["kind"];
  if(!Object.hasOwn(TASK_KINDS,kind))fail("Choose a task type.");
  const linkedRefs=[...new Map(normalizeLinks(input.linkedRefs===undefined?current?.linkedRefs||[]:input.linkedRefs).map(ref=>[taskRefKey(ref),ref])).values()];
  const priorKeys=new Set((current?.linkedRefs||[]).map(taskRefKey));
  for(let i=0;i<linkedRefs.length;i++)if(!priorKeys.has(taskRefKey(linkedRefs[i]))){const ref=linkedRefs[i];const local=ref.module==="map"&&ref.objectType==="place"?loaded.state.places.find(p=>p.id===ref.objectId&&!p.archivedAt):ref.module==="calendar"&&ref.objectType==="event"?loaded.state.events.find(e=>e.id===ref.objectId&&!e.archivedAt):undefined;const resolved=local?createNativeObjectRef({...ref,label:"name" in local?local.name:local.title}):await resolveActiveNativeObjectRef(ref);if(!resolved)fail("One linked object is no longer available. Remove it and choose another.");linkedRefs[i]=resolved;}
  const title=current?.source?current.title:text(input.title,240),description=current?.source?current.description:text(input.description||"",20000);
  if(!title)fail("Give the task a name.");
  if(current?.source?.family==="events") {
    const record=loaded.state.events.find(e=>e.id===current.source!.id)!;
    if(record.source)fail("Edit imported tasks from their original Calendar event.");
    return savePlanningRecord("events",{id:current.source.id,start:start||record.start,end:end||record.end,allDay:start?allDay:record.allDay,timeZone:zone,recurrence,calendarId:calendarIds[0]||record.calendarId,linkedRefs,taskAssignment:{calendarIds,peopleIds,kind,floating:!start}},current.updatedAt);
  }
  // Occurrence history is never silently erased when adjusting a repeat rule.
  if(current && Object.keys(current.exceptions).length && (start!==current.start||recurrence!==current.recurrence||allDay!==current.allDay))fail("This schedule has recorded occurrences. Keep its repeat rule and first date, or create a new task for the new schedule.");
  const now=new Date().toISOString();
  const base:TaskItem=current || {id,title,description,kind,start:"",end:"",allDay:true,timeZone:zone,recurrence:"",calendarIds:[],exceptions:{},createdAt:now,updatedAt:""};
  return storePlan(base,{title,description,kind:current?.source?current.kind:kind,start,end,allDay,timeZone:zone,recurrence,calendarIds,peopleIds,linkedRefs});
}
async function storePlan(item:TaskItem, patch:Partial<TaskPlan>) {
  return mutatePlanningState(state=>{
    const plans=state.taskPlans||[], existing=plans.find(p=>p.id===item.id);
    if((existing?.updatedAt||"")!==item.updatedAt)fail("This task changed elsewhere. Reload before saving.",409);
    const {sourceUpdatedAt,ownerRef,dueAt,blockedCompletion,...base}=item;
    void sourceUpdatedAt;void ownerRef;void dueAt;void blockedCompletion;
    const next:TaskPlan={...base,...patch,updatedAt:new Date(Math.max(Date.now(),Date.parse(existing?.updatedAt||"") + 1 || 0)).toISOString()};
    delete (next as TaskItem).sourceLinkedRefs;
    if(next.source){delete next.title;delete next.description; if(!next.recurrence)delete next.completed;}
    // Routine completion belongs to run history, never a second persisted copy.
    if(next.source?.family==="routines")next.exceptions=Object.fromEntries(Object.entries(next.exceptions).flatMap(([key,value])=>{const {completed,...override}=value;void completed;return Object.keys(override).length?[[key,override]]:[];}));
    return {state:{...state,taskPlans:existing?plans.map(p=>p.id===next.id?next:p):[...plans,next]},result:next};
  });
}
