"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WorkspaceButton, WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { createProjectsRepository } from "../../lib/modules/projects/repository";
import { createPersonalOpsRepository } from "../../lib/modules/personal-ops/repository";
import type { Project, ProjectsUpdateResult } from "../../lib/modules/projects/types";
import type { ProjectDisplayRecord } from "../../lib/modules/projects/view-model";
import type { PersonalOpsGoal } from "../../lib/modules/personal-ops/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import styles from "./ProjectObjectivePreview.module.css";

export type ObjectivePreviewTarget = { id: string; text: string; completed: boolean; source?: NativeObjectRef };
type Draft = { text: string; date: string; completed: boolean; outcome: string };
const projects = createProjectsRepository(), personal = createPersonalOpsRepository();

export default function ProjectObjectivePreview({project,objective,triggerId,onClose,onSaved,onGoalSaved}: {
  project: ProjectDisplayRecord; objective: ObjectivePreviewTarget; triggerId: string; onClose:()=>void;
  onSaved:(result:ProjectsUpdateResult<"projects">)=>void; onGoalSaved:(goal:PersonalOpsGoal)=>void;
}) {
  const [base,setBase] = useState<Project>();
  const [goal,setGoal] = useState<PersonalOpsGoal>();
  const [draft,setDraft] = useState<Draft>({text:objective.text,date:"",completed:objective.completed,outcome:""});
  const [original,setOriginal] = useState("");
  const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const [saved,setSaved] = useState(false), [pending,setPending] = useState<"close"|"reload">(), [attempt,setAttempt] = useState(0);
  const [open,setOpen] = useState(true);
  useEffect(()=>{if(open)return;const timer=setTimeout(onClose,180);return()=>clearTimeout(timer);},[open,onClose]);
  const linkedGoal = objective.source?.module === "personal_ops" && objective.source.objectType === "goal";
  const legacy = objective.id === "current-objective";
  const supported = !objective.source || linkedGoal;
  const readOnly = !supported || (linkedGoal ? Boolean(goal?.archivedAt || goal?.lifecycle === "archived") : !project.editable || ["archived","complete"].includes(base?.lifecycle || project.lifecycle));
  const dirty = Boolean(original && JSON.stringify(draft)!==original);
  useEffect(()=>{
    let active = true; setLoading(true); setError(""); setOriginal("");
    async function load() {
      try {
        let next:Draft;
        if(linkedGoal && objective.source) {
          const result=await personal.get("goals",objective.source.objectId);
          if(!result.ok)throw new Error(result.error.message);
          if(!active)return; setGoal(result.data);
          next={text:result.data.title,date:result.data.dueAt?.slice(0,10)||"",completed:result.data.goalState==="complete",outcome:result.data.outcome};
        } else if(supported && project.editable) {
          const result=await projects.get("projects",project.id);
          if(!result.ok)throw new Error(result.error.message);
          if(!active)return; setBase(result.data);
          const found=result.data.objectives.find(row=>row.id===objective.id);
          if(!legacy&&!found)throw new Error("This objective is no longer available. Close the preview and refresh the list.");
          next={text:legacy?(result.data.objective||""):found!.text,date:found?.targetAt?.slice(0,10)||"",completed:Boolean(found?.completedAt),outcome:""};
        } else { next={text:objective.text,date:"",completed:objective.completed,outcome:""}; }
        if(active){setDraft(next);setOriginal(JSON.stringify(next));}
      }catch(e){if(active)setError(e instanceof Error?e.message:"Could not load this objective.");}
      finally{if(active)setLoading(false);}
    }
    void load(); return()=>{active=false;};
  },[attempt,project.id,objective.id,linkedGoal,legacy,supported,project.editable]);
  useEffect(()=>{if(!dirty)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[dirty]);
  function requestClose(){if(busy)return;if(dirty)setPending("close");else setOpen(false);}
  function reload(){if(dirty)setPending("reload");else setAttempt(n=>n+1);}
  function change(patch:Partial<Draft>){setDraft(current=>({...current,...patch}));setSaved(false);}
  async function save(){
    if(readOnly||loading||busy||!dirty||!draft.text.trim())return;
    setBusy(true);setError("");setSaved(false);
    try{
      if(linkedGoal&&goal){
        const result=await personal.update("goals",goal.id,{title:draft.text.trim(),outcome:draft.outcome.trim(),...(draft.date!==originalDate(goal.dueAt)?{dueAt:draft.date}: {})},goal.updatedAt);
        if(!result.ok)throw new Error(result.error.message);
        setGoal(result.data);onGoalSaved(result.data);
      }else if(base){
        const patch=legacy?{objective:draft.text.trim()}:{objectives:base.objectives.map(row=>row.id===objective.id?{id:row.id,text:draft.text.trim(),targetAt:draft.date===originalDate(row.targetAt)?row.targetAt:(draft.date||undefined),completed:draft.completed}:{id:row.id,text:row.text,targetAt:row.targetAt,completedAt:row.completedAt})};
        const result=await projects.update("projects",base.id,patch,base.updatedAt);
        if(!result.ok)throw new Error(result.error.message);
        setBase(result.data.project);onSaved(result.data);
      }else throw new Error("Reload the objective before saving.");
      const next={...draft,text:draft.text.trim()};setDraft(next);setOriginal(JSON.stringify(next));setSaved(true);setPending(undefined);
    }catch(e){setError(e instanceof Error?e.message:"Could not save. Your changes are still here.");}
    finally{setBusy(false);}
  }
  return <WorkspaceSheet open={open} title={linkedGoal?"Linked goal":"Objective"} titleIcon="goal" presentation="center" className={styles.sheet} returnFocusSelector={`[id="${triggerId}"]`} onClose={requestClose}>
    <form className={styles.form} onSubmit={event=>{event.preventDefault();void save();}}>
      <p className={styles.project}><UnigentamosIcon role="module-projects" size={15}/>{project.name}</p>
      {pending&&<div role="alert" className={styles.warning}><span>Keep your unsaved changes?</span><div><WorkspaceButton onClick={()=>setPending(undefined)}>Keep editing</WorkspaceButton><WorkspaceButton onClick={()=>{const action=pending;setPending(undefined);if(action==="close")setOpen(false);else setAttempt(n=>n+1);}}>Discard changes</WorkspaceButton></div></div>}
      {loading?<p role="status">Loading objective…</p>:<>
        <label>Objective<textarea aria-label="Objective text" rows={3} required maxLength={linkedGoal?240:1000} value={draft.text} disabled={readOnly||busy||!original} onChange={event=>change({text:event.target.value})}/></label>
        {linkedGoal&&<label>Desired outcome<textarea aria-label="Desired outcome" rows={2} required value={draft.outcome} disabled={readOnly||busy||!original} onChange={event=>change({outcome:event.target.value})}/></label>}
        {supported&&!legacy&&<div className={styles.details}><label><span><UnigentamosIcon role="calendar" size={15}/>Target date</span><input type="date" aria-label="Target date" value={draft.date} disabled={readOnly||busy||!original} onChange={event=>change({date:event.target.value})}/></label>{!linkedGoal&&<button type="button" className={styles.complete} aria-pressed={draft.completed} disabled={readOnly||busy||!original} onClick={()=>change({completed:!draft.completed})}><UnigentamosIcon role={draft.completed?"review":"task-state"} size={17}/>{draft.completed?"Complete":"Mark complete"}</button>}</div>}
        {readOnly&&<p className={styles.muted}>{!supported?"This linked objective is managed in its original record.":"This record is read-only."}</p>}
        {!supported&&objective.source&&<Link prefetch={false} href={objective.source.route}>Open original record</Link>}
      </>}
      {error&&<div role="alert" className={styles.warning}><span>{error}</span><WorkspaceButton onClick={reload} disabled={busy}>Reload latest</WorkspaceButton></div>}
      <div className={styles.actions}><span role="status">{busy?"Saving…":saved?"Saved":dirty?"Unsaved changes":""}</span><WorkspaceButton onClick={requestClose} disabled={busy}>Close</WorkspaceButton>{!readOnly&&<WorkspaceButton type="submit" intent="primary" icon="check" disabled={busy||loading||!dirty||!draft.text.trim()||!original}>Save changes</WorkspaceButton>}</div>
    </form>
  </WorkspaceSheet>;
}
function originalDate(value?:string){return value?.slice(0,10)||"";}
