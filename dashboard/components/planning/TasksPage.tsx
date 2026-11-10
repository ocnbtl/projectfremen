"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import TaskWorkspace from "./TaskWorkspace";
import PersonalHome from "../personal-ops/PersonalHome";
import ModuleSidebar from "../admin-shell/ModuleSidebar";
import { WorkspaceTopbarProvider } from "../admin-shell/WorkspaceTopbar";
import { planningRequest, type PlanningSnapshot } from "../../lib/modules/planning/repository";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import styles from "./TaskWorkspace.module.css";
export default function TasksPage(){
 const [snapshot,setSnapshot]=useState<PlanningSnapshot>(),[error,setError]=useState("");const params=useSearchParams();
 const refresh=useCallback(async()=>{try{setSnapshot(await planningRequest<PlanningSnapshot>());setError("");}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{void refresh();const focus=()=>{void refresh();};window.addEventListener("focus",focus);window.addEventListener("unigentamos-tasks-restored",focus);return()=>{window.removeEventListener("focus",focus);window.removeEventListener("unigentamos-tasks-restored",focus);};},[refresh]);
 return <WorkspaceTopbarProvider><main className={styles.page+" work-surface"} style={moduleThemeVariables("personal_ops") as CSSProperties}><ModuleSidebar title="Personal" sections={[]}/>{error&&<p role="alert">{error}</p>}{snapshot?<TaskWorkspace snapshot={snapshot} zone={Intl.DateTimeFormat().resolvedOptions().timeZone} onSaved={refresh} surface="page" initialId={params.get("task")||undefined} initialKind={params.get("type")||undefined} beforeList={<PersonalHome hideOperations/>}/>:<p role="status">Loading tasks…</p>}</main></WorkspaceTopbarProvider>;
}
