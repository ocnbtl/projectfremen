"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WorkspaceButton, WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import { WorkspaceNavSlot } from "../admin-shell/WorkspaceTopbar";
import SelectField from "../ui/SelectField";
import PersonalOpsIcon from "./PersonalOpsIcon";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { HOME_SHORTCUTS, SECTION_ICONS, emptyHomeSettings, type PersonalHomeSettings, type PersonalSection } from "../../lib/modules/personal-ops/home-settings";
import type { PersonalOpsState } from "../../lib/modules/personal-ops/types";
import styles from "./PersonalHome.module.css";

export default function PersonalHome({ state, projectGoalCount = 0 }: { state: PersonalOpsState; projectGoalCount?: number }) {
  const [settings, setSettings] = useState<PersonalHomeSettings>(emptyHomeSettings);
  const [draft, setDraft] = useState<PersonalHomeSettings>(emptyHomeSettings);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<PersonalSection["icon"]>("list");
  const [pendingList, setPendingList] = useState<{id:string; title:string} | null>(null);
  const iconOptions = Object.fromEntries(SECTION_ICONS.map(value => [value, value]));
  const iconLabel = (value: string) => value === "build" ? "Personal build" : value.charAt(0).toUpperCase() + value.slice(1);
  useEffect(() => {
    let alive = true;
    fetch("/api/personal/home").then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (alive) { setSettings(data.settings); setDraft(data.settings); setLoaded(true); } }).catch(error => { if (alive) setError(error.message); });
    return () => { alive = false; };
  }, []);
  async function persist(next: PersonalHomeSettings) {
    const response = await fetch("/api/personal/home", { method: "PATCH", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ ...next, expectedUpdatedAt: settings.updatedAt }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save Personal settings");
    setSettings(data.settings); setDraft(data.settings);
    return data.settings as PersonalHomeSettings;
  }
  async function save() {
    setBusy(true); setError("");
    try {
      let next = draft;
      if (name.trim() || pendingList) {
        let list = pendingList;
        if (!list) {
          const response = await fetch("/api/personal/life", { method: "POST", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ collection:"lists", input:{ title:name.trim(), description:"", kind:"custom", items:[], columns:[{id:"name",label:"Name",type:"text"},{id:"notes",label:"Notes",type:"text"}], rows:[] } }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not create section");
          list = { id:data.item.id, title:data.item.title }; setPendingList(list);
        }
        next = { ...draft, sections:[...draft.sections, {id: list.id, listId:list.id, label:list.title, icon}] };
      }
      await persist(next); setPendingList(null); setName(""); setOpen(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save"); }
    finally { setBusy(false); }
  }
  const shortcuts = [...HOME_SHORTCUTS.filter(item => item.id !== "travel"), ...settings.sections.map(section => ({...section, href:`/admin/personal/lists?list=${encodeURIComponent(section.listId)}`}))];
  const active = (items: { lifecycle: string }[]) => items.filter(item => !["complete", "archived"].includes(item.lifecycle)).length;
  const operations = [
    {label:"Goals", icon:"goal" as const, href:"goals", count:active(state.goals)+projectGoalCount, description:"Personal and project outcomes"},
    {label:"Routines", icon:"routine" as const, href:"routines", count:active(state.routines), description:"Habits and recurring work"},
    {label:"Follow-ups", icon:"follow-up" as const, href:"follow-ups", count:active(state.followUps), description:"Keep your next actions connected"},
    {label:"Decisions", icon:"decision" as const, href:"decisions", count:active(state.decisions), description:"Choices, reasons, and outcomes"},
    {label:"Obligations", icon:"check" as const, href:"obligations", count:active(state.obligations), description:"Commitments to follow through"}
  ];
  return <section className={styles.home} aria-label="Your Personal workspace">
    <WorkspaceNavSlot kind="actions"><div className={styles.sectionHeader}><WorkspaceButton icon="plus" disabled={!loaded || busy} onClick={() => {setDraft(settings); setOpen(true); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="New section name"]')?.focus());}}>Add section</WorkspaceButton><WorkspaceButton icon="edit" disabled={!loaded || busy} onClick={() => {setDraft(settings); setOpen(true);}}>Customize</WorkspaceButton></div></WorkspaceNavSlot>
    {error && !open && <p role="alert">{error}</p>}
    <nav className={styles.shortcuts} aria-label="Personal spaces">{shortcuts.filter(item => !settings.hidden.includes(item.id)).map(item => <Link prefetch={false} href={item.href} key={item.id}><span><PersonalOpsIcon name={item.icon}/></span><strong>{item.label}</strong></Link>)}{loaded && shortcuts.every(item => settings.hidden.includes(item.id)) && <p>Choose spaces in Customize to make this page yours.</p>}</nav>
    <div className={styles.operations}>{operations.map(item => <Link prefetch={false} href={`/admin/personal/${item.href}`} key={item.href}><PersonalOpsIcon name={item.icon}/><span><strong>{item.label}</strong></span><b>{item.count}</b></Link>)}</div>
    <WorkspaceSheet open={open} onClose={() => {if (!busy) setOpen(false);}} title="Customize Personal" titleIcon="module-personal" presentation="center" className={styles.customizeSheet} focusInput={false}>
      <div className={styles.customize}>
        <p>Choose the spaces shown here. Hiding a space keeps all its information.</p>
        <div className={styles.choices}>{HOME_SHORTCUTS.filter(item => item.id !== "travel").map(item => <button key={item.id} type="button" aria-pressed={!draft.hidden.includes(item.id)} onClick={() => setDraft({...draft, hidden:draft.hidden.includes(item.id) ? draft.hidden.filter(id => id !== item.id) : [...draft.hidden,item.id]})}><PersonalOpsIcon name={item.icon}/>{item.label}</button>)}</div>
        {draft.sections.length > 0 && <section><h3>Your sections</h3>{draft.sections.map(section => <div className={styles.sectionEdit} key={section.id}><SelectField optionIcons={iconOptions} aria-label={`Icon for ${section.label}`} value={section.icon} onChange={e => setDraft({...draft,sections:draft.sections.map(s => s.id === section.id ? {...s,icon:e.target.value as PersonalSection["icon"]} : s)})}>{SECTION_ICONS.map(icon => <option value={icon} key={icon}>{iconLabel(icon)}</option>)}</SelectField><input aria-label="Section name" maxLength={60} value={section.label} onChange={e => setDraft({...draft,sections:draft.sections.map(s => s.id === section.id ? {...s,label:e.target.value} : s)})}/><button type="button" aria-pressed={!draft.hidden.includes(section.id)} onClick={() => setDraft({...draft,hidden:draft.hidden.includes(section.id) ? draft.hidden.filter(id => id !== section.id) : [...draft.hidden,section.id]})}>{draft.hidden.includes(section.id) ? "Hidden" : "Shown"}</button><button type="button" aria-label={"Remove " + section.label + " shortcut"} title="Remove shortcut; keep its list" onClick={() => setDraft({...draft, sections:draft.sections.filter(s => s.id !== section.id), hidden:draft.hidden.filter(id => id !== section.id)})}><PersonalOpsIcon name="close"/></button></div>)}</section>}
        <section><h3>Add a section</h3><p>A custom list for entries, notes, dates, and linked objects.</p><div className={styles.newSection}><label><span>Icon</span><SelectField aria-label="New section icon" optionIcons={iconOptions} value={icon} onChange={e => setIcon(e.target.value as PersonalSection["icon"])}>{SECTION_ICONS.map(icon => <option value={icon} key={icon}>{iconLabel(icon)}</option>)}</SelectField></label><label><span>Name</span><input aria-label="New section name" placeholder="e.g. Garden or Family" maxLength={60} value={name} disabled={Boolean(pendingList)} onChange={e => setName(e.target.value)}/></label></div></section>
        {error && <p role="alert">{error}{pendingList && " Your list is saved. Retry to add its shortcut."}</p>}
        <WorkspaceButton intent="primary" busy={busy} onClick={() => void save()} disabled={draft.sections.some(s => !s.label.trim())}>Save changes</WorkspaceButton>
      </div>
    </WorkspaceSheet>
  </section>;
}
