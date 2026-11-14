"use client";
import type { TaskItem } from "../../lib/modules/planning/task-model";
import type { EventFields } from "../../lib/modules/planning/types";
import { addDays, localDate, localFor, instantFor } from "../../lib/modules/planning/calendar-model";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import EventDateSegments from "./EventDateSegments";
import EventRepeatField from "./EventRepeatField";
import { TaskDueDateField } from "./TaskDetailFields";
import styles from "./TaskWorkspace.module.css";

export default function TaskScheduleFields({draft,update,zone,onRepeatError}:{draft:TaskItem;update:(patch:Partial<TaskItem>)=>void;zone:string;onRepeatError:(message:string)=>void}){
 const today=localDate(new Date(),zone);
 function schedule(date:string,allDay=draft.allDay){const start=date?(allDay?date.slice(0,10):date.includes("T")?date:date+"T09:00"):"";update({start,end:start?(allDay?addDays(start,1):localFor(instantFor(start,draft.timeZone)+3600000,draft.timeZone)):"",allDay,recurrence:date?draft.recurrence:""});}
 const fields={...draft,start:draft.start||today,end:draft.end||addDays(today,1),calendarId:"native",isTask:true,kind:"event",location:"",linkedRefs:[],reminderMinutes:null} as EventFields;
 return (<section className={styles.scheduleSection}><div className={styles.sectionHeading}><h3><UnigentamosIcon role="calendar" size={17}/>Schedule</h3><TaskDueDateField draft={draft} update={update} zone={zone}/></div><div className={styles.choices}>{[["floating","Today until done"],["day","Choose a day"],["time","Choose a time"]].map(([value,label])=><button type="button" key={value} aria-pressed={value===(!draft.start?"floating":draft.allDay?"day":"time")} onClick={()=>value==="floating"?schedule(""):schedule(draft.start||today,value==="day")}>{label}</button>)}</div>
      {!draft.start?<p className={styles.hint}>Appears in Today’s tasks until complete.</p>:<div className={styles.scheduleFields} data-task-schedule-fields data-timed={!draft.allDay||undefined}>
        <div data-task-start><EventDateSegments label="Start" value={draft.start} allDay={draft.allDay} timeZone={draft.timeZone} onChange={value=>schedule(value)}/></div>
        {!draft.allDay&&<div data-task-end><EventDateSegments label="End" value={draft.end} allDay={false} timeZone={draft.timeZone} onChange={value=>update({end:value})}/></div>}
        <div className={styles.timeZoneField} data-task-time-zone><SelectField contained searchable autoFocusSearch={false} triggerContent={<span className={styles.taskZone}><UnigentamosIcon role="clock" size={15}/>{draft.timeZone.split("/").pop()?.replaceAll("_"," ")}<UnigentamosIcon role="chevron-down" size={12}/></span>} aria-label="Task time zone" value={draft.timeZone} onChange={e=>update({timeZone:e.target.value})}>{[...new Set([draft.timeZone,"UTC",...Intl.supportedValuesOf("timeZone")])].map(zone=><option key={zone} value={zone}>{zone.replaceAll("_"," ")}</option>)}</SelectField></div>
        <div className={styles.repeatField} data-task-repeat><EventRepeatField standalone fields={fields} update={(key,value)=>{if(key==="recurrenceAnchor")onRepeatError(value?"Choose a repeat schedule based on days, weeks, months, or years.":"");if(key==="recurrence")update({recurrence:value as string});}}/></div>
      </div>}
    </section>);
}
