"use client";

import { useEffect, useState } from "react";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import type { ProjectUpdateInput } from "../../lib/modules/projects/types";
import styles from "./ProjectsWorkspace.module.css";

const cadences = [["", "Not set"], ["NONE", "No cadence"], ["P1W", "Weekly"], ["P2W", "Every 2 weeks"], ["P1M", "Monthly"], ["P3M", "Quarterly"], ["P6M", "Every 6 months"], ["P1Y", "Yearly"]];
type Properties = { name: string; description?: string; completionTarget?: string; lifecycle: string; defaultCadence?: string; slug: string; updatedAt: string };
const draftFor = (project: Properties) => ({ name: project.name, description: project.description || "", completionTarget: project.completionTarget || "", lifecycle: project.lifecycle, defaultCadence: project.defaultCadence || "" });

export default function ProjectProperties({ project, readOnly, busy, onSave }: { project: Properties; readOnly: boolean; busy: boolean; onSave: (patch: ProjectUpdateInput, expectedUpdatedAt: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftFor(project));
  const [revision, setRevision] = useState(project.updatedAt);
  useEffect(() => { if (!editing) { setDraft(draftFor(project)); setRevision(project.updatedAt); } }, [project, editing]);
  const change = (key: keyof typeof draft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const locked = !editing || busy || readOnly;
  return <section className={`${styles.panel} ${styles.inlineProperties}`} data-editing={editing}>
    <div className={styles.panelHeader}><h2>Properties</h2><div className={styles.inlineActions}>
      {editing ? <><button className={styles.button} type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button><button className={styles.button} data-primary="true" type="submit" form="project-inline-properties" disabled={busy || !draft.name.trim()}><UnigentamosIcon role="check" size={16} />{busy ? "Saving…" : "Save changes"}</button></> : !readOnly && <button className={styles.button} type="button" onClick={() => setEditing(true)}><UnigentamosIcon role="edit" size={16} />Edit properties</button>}
    </div></div>
    <form id="project-inline-properties" className={styles.propertyFields} onSubmit={async event => { event.preventDefault(); if (locked) return; if (await onSave({ ...draft, lifecycle: draft.lifecycle as ProjectUpdateInput["lifecycle"] }, revision)) setEditing(false); }}>
      <label>Name<input aria-label="Project name" value={draft.name} readOnly={locked} maxLength={240} required onChange={event => change("name", event.target.value)} /></label>
      <label>Status<SelectField aria-label="Project status" value={draft.lifecycle} disabled={locked} onChange={event => change("lifecycle", event.target.value)}>{[...new Set(["idea", "developing", "active", "monitoring", "dormant", project.lifecycle])].map(value => <option key={value} value={value}>{value.replace(/^./, c => c.toUpperCase())}</option>)}</SelectField></label>
      <label>Review cadence<SelectField aria-label="Review cadence" value={draft.defaultCadence} disabled={locked} onChange={event => change("defaultCadence", event.target.value)}>{!cadences.some(([value]) => value === draft.defaultCadence) && <option value={draft.defaultCadence}>{draft.defaultCadence}</option>}{cadences.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></label>
      <label data-wide="true">Description<textarea aria-label="Description" rows={3} value={draft.description} readOnly={locked} onChange={event => change("description", event.target.value)} placeholder={editing ? "What is this project about?" : "No description"} /></label>
      <label data-wide="true">Completion target<textarea aria-label="Completion target" rows={2} value={draft.completionTarget} readOnly={locked} onChange={event => change("completionTarget", event.target.value)} placeholder={editing ? "What does done look like?" : "No completion target"} /></label>
    </form>
  </section>;
}
