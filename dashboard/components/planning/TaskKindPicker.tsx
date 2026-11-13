"use client";
import { useState } from "react";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { TASK_KINDS, type TaskItem } from "../../lib/modules/planning/task-model";
import { writeTask } from "./task-client";
import styles from "./TaskCalendarPicker.module.css";
export const taskTypeIcons={task:"check",goal:"goal",routine:"routine",obligation:"check",decision:"decision",follow_up:"follow-up",objective:"goal"};
export default function TaskKindPicker({item,onSaved,disabled}:{item:TaskItem;onSaved:()=>Promise<void>;disabled:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function change(kind:string){setBusy(true);setError("");try{await writeTask({operation:"classify",id:item.id,expectedUpdatedAt:item.updatedAt,sourceUpdatedAt:item.sourceUpdatedAt,timeZone:item.timeZone,kind});await onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className={styles.typeControl}><SelectField contained columns={2} aria-label={"Change type for "+item.title} value={item.kind} disabled={busy||disabled} optionIcons={taskTypeIcons} onChange={event=>void change(event.target.value)} triggerContent={<span className={styles.kind}><UnigentamosIcon role={taskTypeIcons[item.kind]} size={15}/><span>{TASK_KINDS[item.kind]}</span></span>}>{Object.entries(TASK_KINDS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</SelectField>{error&&<span role="alert" className={styles.errorTrigger}>{error}</span>}</div>;
}
