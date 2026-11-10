"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import SearchField from "../ui/SearchField";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import EventDateTimePicker from "./EventDateTimePicker";
import EventRepeatField from "./EventRepeatField";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { TASK_KINDS, taskEvents, calendarTaskRecords, personTaskColor, type TaskItem } from "../../lib/modules/planning/task-model";
import { addDays, eventOccurrences, localDate, localFor, instantFor } from "../../lib/modules/planning/calendar-model";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import type { EventFields } from "../../lib/modules/planning/types";
import styles from "./TaskWorkspace.module.css";

export async function writeTask(input:Record<string,unknown>){const response=await fetch("/api/planning/tasks",{method:"POST",headers:buildJsonHeadersWithCsrf(),body:JSON.stringify(input)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"Task could not be saved");window.dispatchEvent(new Event("unigentamos-tasks-changed"));return result.item;}
export default function TaskWorkspace({snapshot,zone,onSaved,initialId,initialOccurrence}:{snapshot:PlanningSnapshot;zone:string;onSaved:()=>Promise<void>;initialId?:string;initialOccurrence?:string}) {
  const items=snapshot.taskItems||[],today=localDate(new Date(),zone),reduced=useReducedMotion();
  const [query,setQuery]=useState(""),[kind,setKind]=useState("all"),[assignee,setAssignee]=useState("all"),[scope,setScope]=useState("today"),[sort,setSort]=useState("schedule"),[showCompleted,setShowCompleted]=useState(false);
  const [editing,setEditing]=useState<TaskItem|undefined>(()=>items.find(i=>i.id===initialId)),[occurrence,setOccurrence]=useState(initialOccurrence||""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const people=snapshot.refs.filter(r=>r.module==="people"&&r.objectType==="person"),calendars=snapshot.state.calendars.filter(c=>!c.archivedAt&&!c.connectionId);
  const rows=useMemo(()=>{
    return items.flatMap(item=>{
      if(kind!=="all"&&item.kind!==kind || assignee!=="all"&&!item.calendarIds.includes(assignee)&&!item.peopleIds?.includes(assignee) || !`${item.title} ${item.description} ${TASK_KINDS[item.kind]} ${item.peopleIds?.map(id=>people.find(p=>p.objectId===id)?.label).join(" ")}`.toLowerCase().includes(query.toLowerCase()))return [];
      const event=item.source?.family==="events"?calendarTaskRecords(snapshot.state.events.filter(e=>e.id===item.source!.id),snapshot.state.calendars,zone)[0]:taskEvents([item],snapshot.state.calendars,zone)[0];
      const expanded=event?eventOccurrences([event],today,addDays(today,scope==="today"?1:30),zone):[];
      if(scope==="all") {const next=expanded.find(e=>!e.completed)||expanded[0];return showCompleted||!item.completed?[{item,key:next?.occurrenceKey||item.start,completed:next?.completed??item.completed,date:next?.start||item.start}]:[];}
      return expanded.filter(e=>showCompleted||!e.completed).map(e=>({item,key:item.start?e.occurrenceKey:"",completed:e.completed,date:item.start?e.start:""}));
    }).sort((a,b)=>sort==="name"?a.item.title.localeCompare(b.item.title):sort==="type"?a.item.kind.localeCompare(b.item.kind):sort==="due"?(a.item.dueAt||"9999").localeCompare(b.item.dueAt||"9999"):(a.date||today).localeCompare(b.date||today));
  },[items,snapshot,kind,assignee,query,scope,sort,showCompleted,today,zone,people]);
  async function run(input:Record<string,unknown>){if(busy)return;setBusy(true);setError("");try{await writeTask(input);await onSaved();return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
  function create(){setOccurrence("");setEditing({id:"task-"+crypto.randomUUID(),kind:"task",title:"",description:"",start:"",end:"",allDay:true,timeZone:zone,recurrence:"",calendarIds:[],peopleIds:[],exceptions:{},createdAt:new Date().toISOString(),updatedAt:""});}
  return <div className={styles.workspace}>
    {error&&<div role="alert" className={styles.error}>{error}<Button onClick={async()=>{await onSaved();setEditing(undefined);setError("");}}>Reload tasks</Button></div>}
    <AnimatePresence mode="wait" initial={false}>
    {editing?<motion.div key={editing.id} initial={{opacity:0,x:reduced?0:12}} animate={{opacity:1,x:0}} exit={{opacity:0}} transition={{duration:reduced?0:.18}}>
      <TaskEditor key={editing.id} item={editing} occurrence={occurrence} zone={zone} snapshot={snapshot} busy={busy} onBack={()=>setEditing(undefined)} onSave={async input=>{if(await run({operation:editing.createdAt&&!items.some(t=>t.id===editing.id)?"create":"schedule",id:editing.id,expectedUpdatedAt:editing.updatedAt,sourceUpdatedAt:editing.sourceUpdatedAt,timeZone:input.timeZone||editing.timeZone||zone,input}))setEditing(undefined);}} onComplete={async(completed,skip)=>{if(await run({operation:skip?"skip":"complete",id:editing.id,expectedUpdatedAt:editing.updatedAt,sourceUpdatedAt:editing.sourceUpdatedAt,timeZone:zone,occurrenceKey:editing.start?occurrence||editing.start:"",completed}))setEditing(undefined);}}/>
    </motion.div>:<motion.div key="list" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
      <div className={styles.top}><div className={styles.scopes}>{[["today","Today"],["upcoming","Next 30 days"],["all","All tasks"]].map(([value,label])=><button key={value} aria-pressed={scope===value} onClick={()=>setScope(value)}>{scope===value&&<motion.span layoutId="task-scope" className={styles.selected} transition={{duration:reduced?0:.22}}/>}<span>{label}</span></button>)}</div><Button intent="primary" icon="plus" onClick={create}>New task</Button></div>
      <div className={styles.filters}><SearchField aria-label="Search tasks" value={query} onChange={e=>setQuery(e.target.value)}/><SelectField aria-label="Task type" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All types</option>{Object.entries(TASK_KINDS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</SelectField><SelectField aria-label="Assigned to" value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="all">Everyone</option>{[...calendars.map(c=>({id:c.id,name:c.name})),...people.map(p=>({id:p.objectId,name:p.label}))].map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SelectField><SelectField aria-label="Sort tasks" value={sort} onChange={e=>setSort(e.target.value)}><option value="schedule">Scheduled</option><option value="due">Due date</option><option value="name">Name</option><option value="type">Type</option></SelectField><Button aria-pressed={showCompleted} onClick={()=>setShowCompleted(!showCompleted)} icon="check">Completed</Button></div>
      <div className={styles.list} role="list"><AnimatePresence initial={false}>{rows.map(({item,key,completed,date})=><motion.article layout={!reduced} key={item.id+key} role="listitem" className={styles.row} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} data-completed={completed||undefined}>
        <button className={styles.complete} aria-label={`${completed?"Reopen":"Complete"} ${item.title}`} disabled={busy} onClick={()=>void run({operation:"complete",id:item.id,timeZone:zone,expectedUpdatedAt:item.updatedAt,sourceUpdatedAt:item.sourceUpdatedAt,occurrenceKey:key,completed:!completed})}><UnigentamosIcon role="task-state" candidate={completed?"circle-check":"circle"}/></button>
        <button className={styles.open} onClick={()=>{setEditing(item);setOccurrence(key);}}><strong>{item.title}</strong><span>{TASK_KINDS[item.kind]}{date?` · ${new Date(date.slice(0,10)+"T12:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}${date.includes("T")?" · "+date.slice(11,16):""}`:" · Today · unscheduled"}{item.dueAt?` · Due ${item.dueAt.slice(0,10)}`:""}</span></button>
        <div className={styles.owners}>{item.calendarIds.map(id=>{const c=calendars.find(c=>c.id===id);return c?<span key={id}><i style={{background:c.color}}/>{c.name}</span>:null;})}{item.peopleIds?.map(id=>{const p=people.find(p=>p.objectId===id);return p?<span key={id}><i style={{background:personTaskColor(id)}}/>{p.label}</span>:null;})}{item.recurrence&&<UnigentamosIcon role="repeat" size={16}/>}</div>
      </motion.article>)}</AnimatePresence></div>
      {!rows.length&&<div className={styles.empty}><UnigentamosIcon role="check" size={26}/><h3>{query||kind!=="all"?"No matching tasks":"You're clear for now"}</h3><p>{scope==="today"?"Unscheduled tasks appear here each day until complete.":"Create a task or adjust your filters."}</p><Button icon="plus" onClick={create}>Add task</Button></div>}
    </motion.div>}
    </AnimatePresence>
  </div>;
}

function TaskEditor({item,occurrence,zone,snapshot,busy,onBack,onSave,onComplete}:{item:TaskItem;occurrence:string;zone:string;snapshot:PlanningSnapshot;busy:boolean;onBack:()=>void;onSave:(input:Record<string,unknown>)=>Promise<void>;onComplete:(completed:boolean,skip?:boolean)=>Promise<void>}){
  const occurrenceComplete=item.recurrence ? item.exceptions[occurrence || item.start]?.completed === true : !!item.completed;
  const today=localDate(new Date(),zone),[draft,setDraft]=useState(item),[personQuery,setPersonQuery]=useState(""),[repeatError,setRepeatError]=useState("");
  const people=(snapshot.refs as (PlanningSnapshot["refs"][number] & {preview?:{imageUrl?:string}})[]).filter(p=>p.objectType==="person"&&p.module==="people"),calendars=snapshot.state.calendars.filter(c=>!c.archivedAt&&!c.connectionId);
  const update=(patch:Partial<TaskItem>)=>setDraft(d=>({...d,...patch}));
  function schedule(date:string,allDay=draft.allDay){const start=date?(allDay?date.slice(0,10):date.includes("T")?date:date+"T09:00"):"";update({start,end:start?(allDay?addDays(start,1):localFor(instantFor(start,draft.timeZone)+3600000,draft.timeZone)):"",allDay,recurrence:date?draft.recurrence:""});}
  const fields={...draft,start:draft.start||today,end:draft.end||addDays(today,1),calendarId:"native",isTask:true,kind:"event",location:"",linkedRefs:[],reminderMinutes:null} as EventFields;
  return <form className={styles.editor} onSubmit={e=>{e.preventDefault();if(!repeatError)void onSave(draft);}}>
    <div className={styles.top}><Button onClick={onBack}><UnigentamosIcon role="chevron-right" size={16} style={{transform:"rotate(180deg)"}}/>Tasks</Button><span className={styles.type}>{TASK_KINDS[item.kind]}</span>{item.ownerRef&&<Link prefetch={false} href={item.ownerRef.route}>Open {TASK_KINDS[item.kind].toLowerCase()} <UnigentamosIcon role="external-link" size={14}/></Link>}</div>
    <label>Task<input aria-label="Task name" required maxLength={240} value={draft.title} readOnly={!!item.source} onChange={e=>update({title:e.target.value})}/></label>
    {!item.source&&<div className={styles.fields}><label>Type<SelectField aria-label="New task type" value={draft.kind} onChange={e=>update({kind:e.target.value as TaskItem["kind"]})}>{Object.entries(TASK_KINDS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</SelectField></label><label>Notes<textarea aria-label="Task notes" rows={2} value={draft.description} onChange={e=>update({description:e.target.value})}/></label></div>}
    {item.description&&item.source&&<p>{item.description}</p>}
    <section><div className={styles.sectionHeading}><h3>When to work on it</h3>{item.dueAt&&<span>Due {item.dueAt.slice(0,10)}</span>}</div><div className={styles.choices}>{[["floating","Today until done"],["day","Choose a day"],["time","Choose a time"]].map(([value,label])=><button type="button" key={value} aria-pressed={value===(!draft.start?"floating":draft.allDay?"day":"time")} onClick={()=>value==="floating"?schedule(""):schedule(draft.start||today,value==="day")}>{label}</button>)}</div>
      {!draft.start?<p className={styles.hint}>Appears in Today's task row until complete. Your due date stays the same.</p>:<><div className={styles.fields}><div><EventDateTimePicker label="Start" value={draft.start} allDay={draft.allDay} timeZone={draft.timeZone} onChange={value=>schedule(value)}/></div>{!draft.allDay&&<div><EventDateTimePicker label="End" value={draft.end} allDay={false} timeZone={draft.timeZone} onChange={value=>update({end:value})}/></div>}</div><SelectField searchable aria-label="Task time zone" value={draft.timeZone} onChange={e=>update({timeZone:e.target.value})}>{[...new Set([draft.timeZone,"UTC",...Intl.supportedValuesOf("timeZone")])].map(zone=><option key={zone} value={zone}>{zone.replaceAll("_"," ")}</option>)}</SelectField><EventRepeatField fields={fields} update={(key,value)=>{if(key==="recurrenceAnchor")setRepeatError(value?"Choose a repeat schedule based on days, weeks, months, or years.":"");if(key==="recurrence")update({recurrence:value as string});}}/></>}
    </section>
    {repeatError&&<p role="alert">{repeatError}</p>}
    <section><h3>Assigned to</h3><div className={styles.choices}>{calendars.map(c=><button key={c.id} type="button" aria-pressed={draft.calendarIds.includes(c.id)} onClick={()=>update({calendarIds:draft.calendarIds.includes(c.id)?draft.calendarIds.filter(id=>id!==c.id):[...draft.calendarIds,c.id]})}><i style={{background:c.color}}/>{c.name}</button>)}</div>
      <SearchField aria-label="Find people to assign" placeholder="Find a person" value={personQuery} onChange={e=>setPersonQuery(e.target.value)}/><div className={styles.people}>{people.filter(p=>draft.peopleIds?.includes(p.objectId)||personQuery&&p.label.toLowerCase().includes(personQuery.toLowerCase())).map(p=><button type="button" key={p.objectId} aria-pressed={draft.peopleIds?.includes(p.objectId)||false} onClick={()=>update({peopleIds:draft.peopleIds?.includes(p.objectId)?draft.peopleIds.filter(id=>id!==p.objectId):[...(draft.peopleIds||[]),p.objectId]})}>{p.preview?.imageUrl?<img src={p.preview.imageUrl} alt="" loading="lazy"/>:<i style={{background:personTaskColor(p.objectId)}}/>}{p.label}</button>)}</div><p className={styles.hint}>Private assignments. No notifications or access are shared.</p>
    </section>
    {draft.recurrence&&<p className={styles.hint}>Each occurrence is completed separately. Scheduling edits apply to the series.</p>}
    <footer><Button intent="primary" type="submit" disabled={busy||!!repeatError} icon="check">{busy?"Saving…":"Save task"}</Button>{(item.updatedAt||item.source)&&<Button disabled={busy} icon="check" onClick={()=>void onComplete(!occurrenceComplete)}>{occurrenceComplete?"Reopen":"Complete"}{item.recurrence?" occurrence":""}</Button>}{item.recurrence&&occurrence&&<Button disabled={busy} onClick={()=>void onComplete(true,true)}>Skip occurrence</Button>}</footer>
  </form>;
}
