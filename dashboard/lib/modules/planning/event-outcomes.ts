import { createHash } from "node:crypto";
import { readPlanningState, mutatePlanningState, normalizePlanningRecord } from "./store";
import type { PlanningState } from "./types";
import { eventOccurrences, addDays } from "./calendar-model";
import { taskCompletionPatch } from "./calendar-tasks";
import { personalCalendarEvents } from "./personal-calendar";
import { createPersonalRecord, readPersonalRecords } from "../../personal-records-store";
import { createNativeObjectRef } from "../../native-objects/routes";
import { readPersonalOpsState, updatePersonalOpsObject, createCalendarWorkOnce } from "../personal-ops/store";
import { createNoteLink, supportsNoteLinkTarget } from "../notes/links-store";
import { interactionKind } from "./interaction-kinds";
import type { OutcomeInput, OutcomeReceipt, OutcomeSource } from "./event-outcome-types";
import type { NativeObjectRef } from "../../native-objects/types";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export function outcomeId(source:Pick<OutcomeSource,"family"|"id"|"occurrenceKey">,state:PlanningState){
 const event=state.events.find(event=>event.id===source.id);
 const repeating=source.family==="events"&&Boolean(event?.recurrence||event?.recurrenceDates?.length||event?.recurrenceAnchor);
 return hash(JSON.stringify([source.family,source.id,repeating?source.occurrenceKey:"single"]));
}
const conflict=(message:string)=>Object.assign(new Error(message),{status:409});
function text(value:unknown,max:number,required=false){if(typeof value!=="string" || value.length>max || (required&&!value.trim()))throw new Error("Check the completion details");return value.trim();}
export function outcomeSource(value:unknown):OutcomeSource {
  const s=value as OutcomeSource;
  if(!s || !["events","followUps","decisions"].includes(s.family))throw new Error("Choose a calendar event");
  return {family:s.family,id:text(s.id,240,true),occurrenceKey:text(s.occurrenceKey,40,true),expectedUpdatedAt:text(s.expectedUpdatedAt,120,true)};
}
function cleanInput(value:unknown):OutcomeInput {
  const i=value as OutcomeInput;
  if(!i || !Array.isArray(i.nextSteps) || i.nextSteps.length>12)throw new Error("Use up to twelve next steps");
  return {interactionKind:interactionKind(i.interactionKind),note:text(i.note,16000),decision:i.decision?text(i.decision,4000):undefined,nextSteps:i.nextSteps.map(step=>{
    if(!["follow_up","decision","goal"].includes(step.type))throw new Error("Choose a next-step type");
    if(step.dueAt && (!/^\d{4}-\d{2}-\d{2}$/.test(step.dueAt) || Number.isNaN(Date.parse(step.dueAt)) || new Date(step.dueAt).toISOString().slice(0,10)!==step.dueAt))throw new Error("Choose a valid due date");
    return {type:step.type,title:text(step.title,240,true),...(step.dueAt?{dueAt:step.dueAt}:{})};
  })};
}
const recordId=(id:string)=>{const h=hash(id).slice(0,32);return `personal-${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};

/** A saved receipt fixes the occurrence and input before fan-out. Retrying resumes
 * the same record IDs; it never overwrites an interaction someone later edited. */
export async function completeEventOutcome(sourceValue:unknown,inputValue:unknown){
  const source=outcomeSource(sourceValue),input=cleanInput(inputValue);
  const state=await readPlanningState(),id=outcomeId(source,state);let receipt=state.outcomeReceipts?.find(r=>r.id===id);
  if(receipt && JSON.stringify(receipt.input)!==JSON.stringify(input))throw conflict("This completion already has saved details. Reopen the completion sheet to resume them.");
  if(receipt?.completedAt){
    if(source.family === "events")await mutatePlanningState(current=>{
      const latest=current.events.find(e=>e.id===source.id);
      if(!latest)throw conflict("This event is unavailable");
      const done=latest.exceptions[source.occurrenceKey]?.completed ?? latest.overrides?.completed ?? latest.completed;
      if(done)return {state:current,result:true};
      if(latest.updatedAt!==source.expectedUpdatedAt)throw conflict("This event changed. Refresh before completing it again.");
      const updated=normalizePlanningRecord("events",{...latest,...taskCompletionPatch(latest,source.occurrenceKey,true,true),updatedAt:new Date(Math.max(Date.now(),Date.parse(latest.updatedAt)+1)).toISOString()});
      return {state:{...current,events:current.events.map(e=>e.id===latest.id?updated:e)},result:true};
    });
    else {
      const item=(await readPersonalOpsState())[source.family].find(i=>i.id===source.id);
      if(!item||item.lifecycle==="archived")throw conflict("This Personal item is unavailable");
      const done=item.objectType==="decision"?item.decisionState==="decided":item.followUpState==="complete";
      if(!done){
        if(item.updatedAt!==source.expectedUpdatedAt)throw conflict("This Personal item changed. Refresh before completing it again.");
        if(source.family==="decisions")await updatePersonalOpsObject("decisions",item.id,{decisionState:"decided",finalDecision:item.objectType==="decision"?item.finalDecision||receipt.input.decision:receipt.input.decision},{expectedUpdatedAt:item.updatedAt});
        else await updatePersonalOpsObject("followUps",item.id,{followUpState:"complete",lifecycle:"complete"},{expectedUpdatedAt:item.updatedAt});
      }
    }
    return receipt;
  }
  if(!receipt){
    const ops=source.family==="events"?null:await readPersonalOpsState();
    const record=source.family==="events"?state.events.find(e=>e.id===source.id):personalCalendarEvents(ops!).find(e=>e.workSource.id===source.id&&e.workSource.family===source.family);
    if(!record || record.archivedAt || record.updatedAt!==source.expectedUpdatedAt)throw conflict("This event changed. Refresh before completing it.");
    const date=source.occurrenceKey.slice(0,10);
    const event=eventOccurrences([record],addDays(date,-2),addDays(date,3),record.timeZone).find(e=>e.occurrenceKey===source.occurrenceKey);
    if(!event || event.system || event.source?.cancelled)throw new Error("This occurrence is unavailable");
    if(source.family==="decisions" && !input.decision)throw new Error("Record the decision before completing it");
    const people=await readPersonalRecords();
    const participants=event.linkedRefs.filter(r=>r.module==="people"&&["person","org","organization"].includes(r.objectType));
    if(input.interactionKind!=="none" && !participants.some(ref=>people.some(p=>p.id===ref.objectId&&!p.archivedAt&&(p.className==="person"||p.className==="org"))))throw new Error("Link a person or organization to record an interaction");
    const sourceRef=event.ownerRef||createNativeObjectRef({module:"calendar",objectType:"event",objectId:source.id,label:event.title});
    const candidate:OutcomeReceipt={id,source,input,event,sourceRef,createdAt:new Date().toISOString()};
    receipt=await mutatePlanningState(current=>{
      const existing=current.outcomeReceipts?.find(r=>r.id===id);
      if(existing){if(JSON.stringify(existing.input)!==JSON.stringify(input))throw conflict("Completion details changed elsewhere");return {state:current,result:existing};}
      let events=current.events;
      if(source.family==="events"){
        const latest=events.find(e=>e.id===source.id);
        if(!latest||latest.updatedAt!==source.expectedUpdatedAt)throw conflict("This event changed. Refresh before completing it.");
        const updated=normalizePlanningRecord("events",{...latest,...taskCompletionPatch(latest,source.occurrenceKey,true,true),updatedAt:new Date(Math.max(Date.now(),Date.parse(latest.updatedAt)+1)).toISOString()});
        events=events.map(e=>e.id===latest.id?updated:e);
      }
      return {state:{...current,events,outcomeReceipts:[...(current.outcomeReceipts||[]),candidate]},result:candidate};
    });
  }
  const saved=receipt;
  if(source.family!=="events"){
    const ops=await readPersonalOpsState();
    const item=ops[source.family].find(i=>i.id===source.id);
    if(!item||item.lifecycle==="archived")throw conflict("This Personal item is unavailable");
    const complete=item.objectType==="decision"?item.decisionState==="decided":item.followUpState==="complete";
    if(!complete){
      if(item.updatedAt!==saved.source.expectedUpdatedAt&&item.updatedAt!==source.expectedUpdatedAt)throw conflict("This Personal item changed. Its saved completion details remain available.");
      if(source.family==="decisions")await updatePersonalOpsObject("decisions",item.id,{decisionState:"decided",finalDecision:saved.input.decision},{expectedUpdatedAt:item.updatedAt});
      else await updatePersonalOpsObject("followUps",item.id,{followUpState:"complete",lifecycle:"complete"},{expectedUpdatedAt:item.updatedAt});
    }
  }
  const refs:NativeObjectRef[]=[];
  const people=await readPersonalRecords();
  const participantIds=[...new Set(saved.event.linkedRefs.filter(r=>r.module==="people").map(r=>r.objectId))].filter(id=>people.some(p=>p.id===id&&!p.archivedAt&&(p.className==="person"||p.className==="org")));
  let noteRef:NativeObjectRef|undefined;
  if(saved.input.interactionKind!=="none"||saved.input.note){
    if(saved.input.interactionKind!=="none"&&!participantIds.length)throw conflict("The linked people are no longer available. Restore them to finish this interaction.");
    const interaction=saved.input.interactionKind!=="none",noteId=recordId(id+":note");
    await createPersonalRecord({domain:"notes-docs",className:interaction?"interaction":"note",noteType:interaction?undefined:"event",title:saved.event.title,status:"active",privacy:"private",body:[saved.event.description,...(saved.event.end.slice(0,10)>saved.event.start.slice(0,10)?[`Calendar: ${saved.event.start} to ${saved.event.end} (${saved.event.timeZone})`]:[]),saved.input.note].filter(Boolean).join("\n\n"),relations:{related:participantIds},...(interaction?{interaction:{kind:saved.input.interactionKind as Exclude<OutcomeInput["interactionKind"],"none">,participantIds,occurredOn:saved.event.start.slice(0,10),...(!saved.event.allDay&&(saved.event.end.slice(0,10)===saved.event.start.slice(0,10)||(saved.event.end.slice(0,10)===addDays(saved.event.start.slice(0,10),1)&&saved.event.end.slice(11,16)<saved.event.start.slice(11,16)))?{startTime:saved.event.start.slice(11,16),endTime:saved.event.end.slice(11,16),endNextDay:saved.event.end.slice(0,10)>saved.event.start.slice(0,10)}:{}),updatesLastContact:true}}:{})},{requestedId:noteId});
    noteRef=createNativeObjectRef({module:"notes",objectType:"note",objectId:noteId,label:saved.event.title});
    refs.push(interaction?createNativeObjectRef({module:"people",objectType:"interaction",objectId:noteId,label:saved.event.title}):noteRef);
  }
  for(const [index,step]of saved.input.nextSteps.entries()){
    const common={title:step.title,description:"",lifecycle:"active" as const,dueAt:step.dueAt,sourceRefs:[saved.sourceRef,...(noteRef?[noteRef]:[])],linkedRefs:saved.event.linkedRefs};
    const workId="calendar-work-"+hash(id+":"+index);
    const item=step.type==="goal"?await createCalendarWorkOnce("goals",{...common,outcome:step.title},workId):step.type==="decision"?await createCalendarWorkOnce("decisions",{...common,question:step.title,decisionState:"open"},workId):await createCalendarWorkOnce("followUps",{...common,context:step.title,followUpType:"other",followUpState:step.dueAt?"scheduled":"open"},workId);
    refs.push(createNativeObjectRef({module:"personal_ops",objectType:item.objectType,objectId:item.id,label:item.title}));
  }
  if(noteRef)for(const target of [saved.sourceRef,...saved.event.linkedRefs,...refs.filter(r=>r.module==="personal_ops")].filter(supportsNoteLinkTarget))await createNoteLink({noteRef,targetRef:target,relationship:"context",contextNote:"Recorded when completing the calendar event",provenance:"manual"});
  return mutatePlanningState(current=>{
    const completed={...saved,refs,completedAt:new Date().toISOString()};
    let events=current.events;
    if(source.family==="events")events=events.map(event=>{
      if(event.id!==source.id||event.archivedAt)return event;
      const recurring=Boolean(event.recurrence||event.recurrenceDates?.length);
      const base=recurring?(event.exceptions[source.occurrenceKey]?.linkedRefs||event.overrides?.linkedRefs||event.linkedRefs):(event.overrides?.linkedRefs||event.linkedRefs);
      const linkedRefs=[...new Map([...base,...refs].map(ref=>[ref.module+":"+ref.objectType+":"+ref.objectId,ref])).values()];
      if(linkedRefs.length===base.length||linkedRefs.length>100)return event;
      const patch=recurring?{exceptions:{...event.exceptions,[source.occurrenceKey]:{...event.exceptions[source.occurrenceKey],linkedRefs}}}:event.source?{overrides:{...event.overrides,linkedRefs}}:{linkedRefs};
      return normalizePlanningRecord("events",{...event,...patch,updatedAt:new Date(Math.max(Date.now(),Date.parse(event.updatedAt)+1)).toISOString()});
    });
    return {state:{...current,events,outcomeReceipts:(current.outcomeReceipts||[]).map(r=>r.id===id?completed:r)},result:completed};
  });
}
