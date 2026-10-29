"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WorkspaceButton, WorkspaceHeader, WorkspaceSheet, WorkspaceToolbar } from "../admin-shell/WorkspaceKit";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { WELLNESS_CONFIG, type WellnessEntry, type WellnessInput, type WellnessSection, type WellnessState } from "../../lib/modules/personal-wellness/types";
import PersonalOpsSidebar, { type PersonalOpsSidebarCounts } from "./PersonalOpsSidebar";
import baseStyles from "./PersonalOpsWorkspace.module.css";
import styles from "./PersonalWellnessWorkspace.module.css";

const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const dateLabel = (date: string) => date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
type Draft = WellnessInput & { id?: string; updatedAt?: string };
export default function PersonalWellnessWorkspace({ section, initialState, initialError, sidebarCounts, initialDay }: { section: WellnessSection; initialState: WellnessState; initialError?: string; sidebarCounts: PersonalOpsSidebarCounts; initialDay: string }) {
  const config = WELLNESS_CONFIG[section];
  const [currentDay, setCurrentDay] = useState(initialDay);
  useEffect(() => {
    const updateDay = () => { if (!document.hidden) setCurrentDay(today()); };
    updateDay(); document.addEventListener("visibilitychange", updateDay);
    return () => document.removeEventListener("visibilitychange", updateDay);
  }, []);
  const [entries, setEntries] = useState(initialState.entries);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState(config.kinds[0].id);
  const [archive, setArchive] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [notice, setNotice] = useState("");
  const activeKind = config.kinds.find(item => item.id === kind)!;
  const draftKind = config.kinds.find(item => item.id === draft?.kind);
  const visible = useMemo(() => entries.filter(entry => entry.archived === archive && entry.kind === kind && `${entry.title} ${entry.notes} ${Object.values(entry.fields).join(" ")}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => kind === "recipe" ? a.title.localeCompare(b.title) : b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [entries, archive, kind, query]);
  const current = entries.filter(entry => !entry.archived);
  const newestCheckIn = current.filter(entry => entry.kind === "check-in").sort((a, b) => b.date.localeCompare(a.date))[0];
  const weekStart = new Date(`${currentDay}T12:00:00Z`); weekStart.setUTCDate(weekStart.getUTCDate() - 6); const start = weekStart.toISOString().slice(0, 10);
  const thisWeek = current.filter(entry => entry.status === "completed" && entry.date >= start && entry.date <= currentDay);
  const summary = section === "health" ? [
    { label: "Latest check-in", value: newestCheckIn ? dateLabel(newestCheckIn.date) : "No check-ins yet" },
    { label: "Sleep", value: newestCheckIn?.fields.sleep ? `${newestCheckIn.fields.sleep} hours` : "—" },
    { label: "Energy", value: newestCheckIn?.fields.energy ? `${newestCheckIn.fields.energy} / 5` : "—" }
  ] : section === "meals" ? [
    { label: "Today's meals", value: String(current.filter(entry => entry.kind === "meal" && entry.date === currentDay).length) },
    { label: "Planned", value: String(current.filter(entry => entry.kind === "meal" && entry.status === "planned" && entry.date >= currentDay).length) },
    { label: "Recipes", value: String(current.filter(entry => entry.kind === "recipe").length) }
  ] : [
    { label: "Workouts · last 7 days", value: String(thisWeek.length) },
    { label: "Minutes · last 7 days", value: String(thisWeek.reduce((sum, entry) => sum + Number(entry.fields.minutes || 0), 0)) },
    { label: "Upcoming", value: String(current.filter(entry => entry.status === "planned" && entry.date >= currentDay).length) }
  ];
  function create(nextKind = kind, recipe?: WellnessEntry) {
    setError(""); setNotice("");
    setDraft({ kind: nextKind, title: recipe?.title || (nextKind === "check-in" ? "Daily check-in" : ""), date: nextKind === "recipe" ? "" : today(), status: section === "health" || nextKind === "recipe" ? "completed" : "planned", notes: "", fields: recipe ? { recipeId: recipe.id } : {}, archived: false });
  }
  async function save(value: Draft) {
    if (busy || initialError) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/personal/wellness", { method: value.id ? "PATCH" : "POST", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ section, id: value.id, expectedUpdatedAt: value.updatedAt, input: value }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "This entry could not be saved.");
      setEntries(previous => value.id ? previous.map(item => item.id === value.id ? result.item : item) : [...previous, result.item]);
      setKind(value.kind); setDraft(null); setNotice(value.archived ? "Entry archived. You can restore it from Archived." : "Saved.");
    } catch (error) { setError(error instanceof Error ? error.message : "This entry could not be saved. Your draft is still here."); }
    finally { setBusy(false); }
  }
  const setField = (id: string, value: string) => setDraft(previous => previous ? { ...previous, fields: { ...previous.fields, [id]: value } } : null);
  return <div className={baseStyles.shell} data-personal-pages>
    <PersonalOpsSidebar activeView={section} filter="" pathname={`/admin/personal/${section}`} counts={sidebarCounts} mobileOpen={false} onClose={() => {}} />
    <main className={baseStyles.directory} aria-label={config.title}>
      <div className={`${baseStyles.mainScroll} ${styles.content}`}>
        <WorkspaceHeader title={config.title}><WorkspaceButton intent="primary" icon="plus" disabled={Boolean(initialError)} onClick={() => create()}>Add {activeKind.label.toLowerCase()}</WorkspaceButton></WorkspaceHeader>
        <WorkspaceToolbar query={query} onQuery={setQuery} placeholder="Search" />
        <div className={styles.heading}><Link prefetch={false} href="/admin/personal"><UnigentamosIcon role="back" size={16} />Personal</Link><h1><UnigentamosIcon role={config.icon} size={25} />{config.title}</h1></div>
        <section className={styles.summary} aria-label={`${config.title} summary`}>{summary.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</section>
        <div className={styles.controls}><div className={styles.kindSwitch} role="group" aria-label="Entry type">{config.kinds.map(item => <button key={item.id} type="button" aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>{item.plural}</button>)}</div><WorkspaceButton icon="archive" aria-pressed={archive} onClick={() => setArchive(!archive)}>{archive ? "Show current" : "Archived"}</WorkspaceButton></div>
        {error && !draft && <p className={styles.error} role="alert">{error}</p>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {!visible.length ? <div className={styles.empty}><UnigentamosIcon role={config.icon} size={30} /><h2>{query ? "No matching entries" : archive ? "No archived entries" : `No ${activeKind.plural.toLowerCase()} yet`}</h2><p>{query ? "Try a different search." : section === "health" ? "Keep check-ins and care notes in one place." : section === "meals" ? "Plan a meal or save a recipe to use again." : "Plan your next session or record a completed workout."}</p>{!query && !archive && <WorkspaceButton icon="plus" disabled={Boolean(initialError)} onClick={() => create()}>Add {activeKind.label.toLowerCase()}</WorkspaceButton>}</div> : <div className={styles.cards} data-kind={kind} data-section={section}>{visible.map(entry => <article key={entry.id} className={styles.card}>
          <div className={styles.cardTop}><span className={styles.entryKind}>{entry.kind === "recipe" ? <UnigentamosIcon role="meals" size={17} /> : <><UnigentamosIcon role="calendar" size={15} /><time dateTime={entry.date}>{dateLabel(entry.date)}</time></>}</span>{entry.kind !== "recipe" && section !== "health" && <span className={styles.status} data-complete={entry.status === "completed"}>{entry.status === "completed" ? "Completed" : "Planned"}</span>}</div>
          <button className={styles.title} type="button" onClick={() => { setError(""); setDraft({ ...entry, fields: { ...entry.fields } }); }}><h2>{entry.title}</h2></button>
          <div className={styles.metrics}>{activeKind.fields.filter(field => field.type !== "textarea" && entry.fields[field.id] && field.id !== "recipeId").map(field => <span key={field.id} title={field.label}>{entry.fields[field.id]}{field.suffix ? ` ${field.suffix}` : ""}</span>)}</div>
          {entry.kind === "recipe" && entry.fields.ingredients && <p className={styles.recipeIngredients}>{entry.fields.ingredients}</p>}
          {entry.fields.recipeId && <button className={styles.recipeLink} type="button" onClick={() => { const recipe = entries.find(item => item.id === entry.fields.recipeId); if (recipe) setDraft({ ...recipe, fields: { ...recipe.fields } }); }}><UnigentamosIcon role="meals" size={15} />{entries.find(item => item.id === entry.fields.recipeId)?.title || "Recipe"}</button>}
          {entry.notes && <p className={styles.notes}>{entry.notes}</p>}
          <footer><WorkspaceButton icon="edit" onClick={() => { setError(""); setDraft({ ...entry, fields: { ...entry.fields } }); }}>Edit</WorkspaceButton>{!archive && entry.kind === "recipe" && <WorkspaceButton icon="calendar" onClick={() => create("meal", entry)}>Plan meal</WorkspaceButton>}{!archive && entry.status === "planned" && <WorkspaceButton icon="check" busy={busy} onClick={() => void save({ ...entry, status: "completed" })}>Complete</WorkspaceButton>}{archive && <WorkspaceButton icon="discard-changes" busy={busy} onClick={() => void save({ ...entry, archived: false })}>Restore</WorkspaceButton>}</footer>
        </article>)}</div>}
      </div>
    </main>
    <WorkspaceSheet open={Boolean(draft)} onClose={() => { if (!busy) setDraft(null); }} presentation="center" titleIcon={config.icon} title={`${draft?.id ? "Edit" : "Add"} ${draftKind?.label.toLowerCase() || "entry"}`} className={styles.sheet}>
      {draft && draftKind && <form className={styles.form} onSubmit={event => { event.preventDefault(); void save(draft); }}>
        <label data-wide="true">Title<input required maxLength={180} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder={section === "meals" ? "What are you making?" : section === "fitness" ? "e.g. Morning strength session" : "Give this entry a name"} /></label>
        {draft.kind !== "recipe" && <label>Date<input type="date" required value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>}
        {section !== "health" && draft.kind !== "recipe" && <label>Status<SelectField value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Draft["status"] })}><option value="planned">Planned</option><option value="completed">Completed</option></SelectField></label>}
        {draftKind.fields.map(field => <label key={field.id} data-wide={field.type === "textarea" || undefined}>{field.label}{field.id === "recipeId" ? <SelectField value={draft.fields[field.id] || ""} onChange={event => setField(field.id, event.target.value)}><option value="">No recipe</option>{entries.filter(item => item.kind === "recipe" && (!item.archived || item.id === draft.fields.recipeId)).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</SelectField> : field.type === "select" ? <SelectField value={draft.fields[field.id] || ""} onChange={event => setField(field.id, event.target.value)}><option value="">Not recorded</option>{field.options?.map(value => <option key={value}>{value}</option>)}</SelectField> : field.type === "textarea" ? <textarea rows={3} maxLength={8000} value={draft.fields[field.id] || ""} onChange={event => setField(field.id, event.target.value)} /> : <input type={field.type} min={field.min} max={field.max} step={field.type === "number" ? "any" : undefined} maxLength={300} value={draft.fields[field.id] || ""} onChange={event => setField(field.id, event.target.value)} />}</label>)}
        <label data-wide="true">{draft.kind === "recipe" ? "Instructions & notes" : "Notes"}<textarea rows={3} maxLength={12000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="Optional" /></label>
        {error && <p data-wide="true" role="alert" className={styles.error}>{error}</p>}
        <footer className={styles.formFooter}>{draft.id && !draft.archived && <WorkspaceButton icon="archive" busy={busy} onClick={() => void save({ ...draft, archived: true })}>Archive</WorkspaceButton>}<span /><WorkspaceButton disabled={busy} onClick={() => setDraft(null)}>Cancel</WorkspaceButton><WorkspaceButton type="submit" intent="primary" icon="check" busy={busy}>Save</WorkspaceButton></footer>
      </form>}
    </WorkspaceSheet>
  </div>;
}
