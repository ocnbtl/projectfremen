"use client";

import { useEffect, useRef, useState } from "react";
import TaskWorkspace from "../planning/TaskWorkspace";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { planningRequest, type PlanningSnapshot } from "../../lib/modules/planning/repository";
import { createProjectsRepository } from "../../lib/modules/projects/repository";
import { taskLinks } from "../../lib/modules/planning/task-model";
import type { Project, ProjectObjective } from "../../lib/modules/projects/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import styles from "./ProjectsWorkspace.module.css";

export default function ProjectTasksPanel({ project, objectives, active, readOnly, onProject, initialId, initialOccurrence, heading = true }: {
  project: NativeObjectRef; objectives: ProjectObjective[]; active: boolean; readOnly: boolean; onProject: (project: Project) => void; initialId?:string; initialOccurrence?:string; heading?:boolean;
}) {
  const [snapshot, setSnapshot] = useState<PlanningSnapshot>();
  const [error, setError] = useState("");
  const callback = useRef(onProject); callback.current = onProject;
  const pending = useRef<Promise<void> | null>(null);
  const refreshAgain = useRef(false);
  const mounted = useRef(true);
  const [zone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  function refresh() {
    if (pending.current) { refreshAgain.current = true; return pending.current; }
    pending.current = (async () => {
      try {
        do {
        refreshAgain.current = false;
        const [next, latest] = await Promise.all([planningRequest<PlanningSnapshot>(), createProjectsRepository().get("projects", project.objectId)]);
        if (!mounted.current) return;
        setSnapshot(next); setError("");
        if (latest.ok) callback.current(latest.data);
        else setError(latest.error.message);
        } while (refreshAgain.current && mounted.current);
      } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not load project tasks."); }
      finally { pending.current = null; }
    })();
    return pending.current;
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!active) return;
    void refresh();
    const changed = () => { void refresh(); };
    window.addEventListener("unigentamos-tasks-changed", changed);
    return () => window.removeEventListener("unigentamos-tasks-changed", changed);
  }, [active, project.objectId]);
  const linked = snapshot?.taskItems?.filter(task => taskLinks(task).some(ref => ref.module === "projects" && ref.objectType === "project" && ref.objectId === project.objectId)) || [];
  return <section className={`${styles.panel} ${styles.projectTasks}`} aria-label="Project tasks">
    {heading && <div className={styles.panelHeader}><h2><UnigentamosIcon role="check" size={18}/>Tasks</h2></div>}
    {error && <p role="alert">{error} <button className={styles.button} onClick={() => void refresh()}>Retry</button></p>}
    {!snapshot ? <p role="status">Loading tasks…</p> : readOnly ? <ul className={styles.guardList}>{linked.map(task => <li key={task.id}><span>{task.title}</span><span>{task.completed ? "Complete" : "Pending"}</span></li>)}{objectives.filter(objective=>!linked.some(task=>task.source?.id===objective.id)).map(objective=><li key={objective.id}><span>{objective.text}</span><span>{objective.completedAt?"Complete":"Pending"}</span></li>)}{!linked.length && !objectives.length && <li>No linked tasks.</li>}</ul> : <TaskWorkspace snapshot={snapshot} zone={zone} onSaved={refresh} projectRef={project} initialId={initialId} initialOccurrence={initialOccurrence} surface="sheet"/>}
  </section>;
}
