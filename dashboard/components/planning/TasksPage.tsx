"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TaskWorkspace from "./TaskWorkspace";
import { planningRequest, type PlanningSnapshot } from "../../lib/modules/planning/repository";
import styles from "./TaskWorkspace.module.css";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import type { CSSProperties } from "react";
export default function TasksPage(){
  const [snapshot,setSnapshot]=useState<PlanningSnapshot>(),[error,setError]=useState("");
  const refresh=useCallback(async()=>{try{setSnapshot(await planningRequest<PlanningSnapshot>());setError("");}catch(e){setError((e as Error).message);}},[]);
  useEffect(()=>{void refresh();},[refresh]);
  return <main className={`${styles.page} work-surface`} style={moduleThemeVariables("personal_ops") as CSSProperties}><header><Link prefetch={false} className="workspace-home-link" href="/admin/personal">Personal</Link><h1>Tasks</h1><Link prefetch={false} className="work-button" href="/admin/calendar">Calendar</Link></header>{error&&<p role="alert">{error}</p>}{snapshot?<TaskWorkspace snapshot={snapshot} zone={Intl.DateTimeFormat().resolvedOptions().timeZone} onSaved={refresh}/>:<p role="status">Loading tasks…</p>}</main>;
}
