"use client";
import { useEffect, useRef, useState } from "react";
import { createProjectsRepository } from "../../lib/modules/projects/repository";
import type { Project } from "../../lib/modules/projects/types";
import type { TaskItem } from "../../lib/modules/planning/task-model";
import type { Calendar, CalendarEvent } from "../../lib/modules/planning/types";

export type ProjectTaskData = { items: TaskItem[]; calendars: Calendar[]; events: CalendarEvent[] };

/** One catalogue read for the visible directory, never one request per card. */
export default function useProjectCardTasks(active: boolean, zone: string, onProject: (project: Project) => void) {
  const [data, setData] = useState<ProjectTaskData>();
  const [error, setError] = useState("");
  const callback = useRef(onProject); callback.current = onProject;
  const mounted = useRef(true), pending = useRef<Promise<void> | null>(null);
  const again = useRef(false), projectChanged = useRef(false);
  function refresh(withProjects = false) {
    projectChanged.current ||= withProjects;
    if (pending.current) { again.current = true; return pending.current; }
    pending.current = (async () => {
      try {
        do {
          again.current = false;
          const response = await fetch(`/api/planning/tasks?zone=${encodeURIComponent(zone)}`, {cache:"no-store"});
          const next = await response.json();
          if (!response.ok || !next.ok) throw new Error(next.error || "Could not load linked tasks.");
          if (!mounted.current) return;
          setData(next); setError("");
          if (projectChanged.current) {
            projectChanged.current = false;
            const projects = await createProjectsRepository().readState();
            if (!projects.ok) throw new Error(projects.error.message);
            if (mounted.current) projects.data.projects.forEach(project => callback.current(project));
          }
        } while (again.current && mounted.current);
      } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not load linked tasks."); }
      finally { pending.current = null; }
    })();
    return pending.current;
  }
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if (!active) return;
    void refresh();
    const changed=()=>{void refresh(true);};
    window.addEventListener("unigentamos-tasks-changed",changed);
    return()=>window.removeEventListener("unigentamos-tasks-changed",changed);
  },[active,zone]);
  return { data, error, refresh, settle: () => pending.current || refresh(true) };
}
