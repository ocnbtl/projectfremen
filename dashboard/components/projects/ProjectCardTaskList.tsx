"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { writeTask } from "../planning/task-client";
import { taskIcon } from "../planning/TaskWorkspace";
import ProjectTasksPanel from "./ProjectTasksPanel";
import ProjectTaskDuePopover from "./ProjectTaskDuePopover";
import { projectTaskDeadline, type ProjectTaskRow } from "../../lib/modules/projects/card-tasks";
import type { ProjectDirectoryItem } from "../../lib/modules/projects/view-model";
import type { Project } from "../../lib/modules/projects/types";
import styles from "./ProjectDirectoryCards.module.css";

export default function ProjectCardTaskList({project,rows,zone,loading,onProject,onInteraction,onSaved}:{project:ProjectDirectoryItem["project"];rows:ProjectTaskRow[];zone:string;loading:boolean;onProject:(project:Project)=>void;onInteraction:()=>void;onSaved:()=>Promise<void>}) {
  const [pending,setPending]=useState(""),[error,setError]=useState("");
  const [preview,setPreview]=useState<{id?:string;occurrence?:string}>();
  const hold=useRef<string[] | null>(null), lock=useRef(false), reduced=useReducedMotion();
  const ordered=hold.current ? [...rows].sort((a,b)=>{const ai=hold.current!.indexOf(a.item.id),bi=hold.current!.indexOf(b.item.id);return (ai<0?9999:ai)-(bi<0?9999:bi);}) : rows;
  const visible=ordered.slice(0,rows.length>3?2:3), readOnly=!project.editable||["complete","archived"].includes(project.lifecycle);
  function show(row?:ProjectTaskRow){onInteraction();setPreview(row?{id:row.item.id,occurrence:row.occurrence}:{});}
  async function complete(row:ProjectTaskRow) {
    if(lock.current)return;
    lock.current=true;setPending(row.item.id);setError("");onInteraction();hold.current=ordered.map(r=>r.item.id);
    try {await writeTask({operation:"complete",id:row.item.id,expectedUpdatedAt:row.item.updatedAt,sourceUpdatedAt:row.item.sourceUpdatedAt,timeZone:row.item.timeZone,occurrenceKey:row.occurrence,completed:!row.completed});await onSaved();}
    catch(cause){setError(cause instanceof Error?cause.message:"Could not save this task.");}
    finally{lock.current=false;setPending("");}
  }
  return <>
    {loading ? <span role="status" className={styles.taskHint}>Loading tasks…</span> : <ul aria-label="Linked project tasks"><AnimatePresence initial={false}>{visible.map(row=>{const due=projectTaskDeadline(row,zone);return <motion.li layout key={row.item.id} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.18}} data-completed={row.completed||undefined} data-overdue={due?.overdue||undefined}>
      <button type="button" role="checkbox" className={styles.objectiveToggle} aria-label={`${row.completed?"Reopen":"Complete"} task: ${row.item.title}`} aria-checked={row.completed} aria-busy={pending===row.item.id} disabled={!!pending||readOnly||!row.canComplete} title={row.item.recurrence?`This occurrence: ${row.date||"Choose a date in task details"}`:row.completed?"Reopen task":"Mark complete"} onClick={event=>{event.stopPropagation();void complete(row);}}><span className={styles.objectiveCheck}><UnigentamosIcon role="check" size={12}/></span></button>
      <button type="button" className={styles.taskOpen} aria-describedby={due?`task-due-${project.id}-${row.item.id}`:undefined} aria-label={`Edit task: ${row.item.title}`} title={`${row.item.title}${due?` — ${due.overdue?'Overdue · ':''}Due ${due.full}`:''}`} aria-haspopup="dialog" onClick={event=>{event.stopPropagation();show(row);}}><UnigentamosIcon role={taskIcon(row.item.kind)} size={12}/><span className={styles.taskTitle}>{row.item.title}</span></button>{due&&<ProjectTaskDuePopover item={row.item} zone={zone} disabled={!!pending||readOnly} onOpen={()=>{onInteraction();hold.current=ordered.map(r=>r.item.id);}} onSaved={onSaved}><time id={`task-due-${project.id}-${row.item.id}`} className={styles.taskDue} dateTime={due.value} aria-label={`${due.overdue?'Overdue. ':''}Due ${due.full}`} data-task-due data-overdue={due.overdue||undefined}>{due.overdue&&<UnigentamosIcon role="warning" size={10}/>}<span>{due.label}</span></time></ProjectTaskDuePopover>}
    </motion.li>})}</AnimatePresence>{rows.length>3&&<li><button type="button" className={styles.moreTasks} onClick={event=>{event.stopPropagation();show();}}>+{rows.length-visible.length} tasks<UnigentamosIcon role="chevron-right" size={13}/></button></li>}</ul>}
    {error&&<button type="button" className={styles.taskError} title={error} onClick={()=>show()}><UnigentamosIcon role="warning" size={13}/>Review task</button>}
    <WorkspaceSheet open={!!preview} onClose={()=>setPreview(undefined)} title="Tasks" titleIcon="check" presentation="center" className={styles.taskPreview}>
      {error&&<p role="alert">{error}</p>}{preview&&<ProjectTasksPanel key={preview.id||"all"} project={project.nativeRef} objectives={project.objectives} active readOnly={readOnly} onProject={onProject} initialId={preview.id} initialOccurrence={preview.occurrence} heading={false}/>}
    </WorkspaceSheet>
  </>;
}
