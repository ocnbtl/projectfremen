"use client";
import type { TaskItem, TaskDetails } from "../../lib/modules/planning/task-model";
import EventDateSegments from "./EventDateSegments";
import SelectField from "../ui/SelectField";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import styles from "./TaskWorkspace.module.css";
export default function TaskDetailFields({draft,update,zone}:{draft:TaskItem;update:(patch:Partial<TaskItem>)=>void;zone:string}){
 const details=draft.details||{},change=(patch:Partial<TaskDetails>)=>update({details:{...details,...patch}});
 return <section className={styles.detailFields}>

  {(draft.source?.family==="goals"||draft.source?.family==="followUps")&&<label>{draft.source.family==="goals"?"Desired outcome":"Outcome"}<textarea rows={2} value={details.outcome||""} onChange={e=>change({outcome:e.target.value})}/></label>}
  {draft.source?.family==="decisions"&&<div className={styles.fields}><label>Decision<textarea rows={2} value={details.finalDecision||""} onChange={e=>change({finalDecision:e.target.value})} placeholder="What did you decide?"/></label><label>Reason<textarea rows={2} value={details.rationale||""} onChange={e=>change({rationale:e.target.value})} placeholder="Why this choice?"/></label></div>}
  {draft.source?.family==="obligations"&&<><label>Completion note<textarea rows={2} value={details.completionNote||""} onChange={e=>change({completionNote:e.target.value})}/></label>{details.completionCriteria?.map(c=><Button key={c.id} icon="check" aria-pressed={c.satisfied} onClick={()=>change({completionCriteria:details.completionCriteria!.map(item=>item.id===c.id?{...item,satisfied:!item.satisfied}:item)})}>{c.label}</Button>)}{details.requiredEvidence?.map(e=><label key={e.id}>{e.label}<SelectField aria-label={e.label} value={e.state} onChange={event=>change({requiredEvidence:details.requiredEvidence!.map(item=>item.id===e.id?{...item,state:event.target.value as typeof e.state}:item)})}>{[["missing","Needed"],["received","Received"],["verified","Verified"],["not_applicable","Not needed"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</SelectField></label>)}</>}
 </section>;
}

export function TaskDueDateField({draft,update,zone}:{draft:TaskItem;update:(patch:Partial<TaskItem>)=>void;zone:string}){return <>{draft.source?.family!=="events"&&draft.source?.family!=="routines"&&<div className={styles.dueControl}><span>Due date</span>{draft.dueAt?<><EventDateSegments label="Due date" hideLabel value={draft.dueAt.slice(0,10)} allDay timeZone={zone} onChange={dueAt=>update({dueAt})}/><Button icon="close" aria-label="Clear due date" onClick={()=>update({dueAt:""})}/></>:<Button icon="calendar" onClick={()=>update({dueAt:new Date().toLocaleDateString("en-CA",{timeZone:zone})})}>Add due date</Button>}</div>}</>;}
