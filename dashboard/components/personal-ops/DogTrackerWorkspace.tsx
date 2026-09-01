"use client";

import { useMemo, useState, type FormEvent } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import type { DogCareEvent, DogCareKind, DogTrackerState } from "../../lib/modules/dog-tracker/types";
import PersonalOpsSidebar, { type PersonalOpsSidebarCounts } from "./PersonalOpsSidebar";
import PersonalOpsIcon from "./PersonalOpsIcon";
import baseStyles from "./PersonalOpsWorkspace.module.css";
import styles from "./PersonalUtilityWorkspace.module.css";

type DogDraft = {
  id?: string;
  updatedAt?: string;
  kind: DogCareKind;
  occurredAt: string;
  peed: boolean;
  pooped: boolean;
  notes: string;
};

function toLocalInput(value = new Date().toISOString()) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatTime(value?: string) {
  if (!value) return "Not logged";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function relativeTime(value?: string) {
  if (!value) return "No entry";
  const milliseconds = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 60) return minutes < 2 ? "Just now" : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function draftFor(kind: DogCareKind, event?: DogCareEvent): DogDraft {
  return event
    ? { id: event.id, updatedAt: event.updatedAt, kind: event.kind, occurredAt: toLocalInput(event.occurredAt), peed: event.peed, pooped: event.pooped, notes: event.notes }
    : { kind, occurredAt: toLocalInput(), peed: false, pooped: false, notes: "" };
}

export default function DogTrackerWorkspace({ initialState, sidebarCounts, initialLoadError }: { initialState: DogTrackerState; sidebarCounts: PersonalOpsSidebarCounts; initialLoadError?: string }) {
  const [state, setState] = useState(initialState);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [editor, setEditor] = useState<DogDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialLoadError || "");
  const [notice, setNotice] = useState("");
  const latest = useMemo(() => ({
    walk: state.events.find((event) => event.kind === "walk"),
    feed: state.events.find((event) => event.kind === "feed"),
    pee: state.events.find((event) => event.peed),
    poop: state.events.find((event) => event.pooped)
  }), [state.events]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/personal/dog", {
      method: editor.id ? "PATCH" : "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify(editor.id
        ? { id: editor.id, expectedUpdatedAt: editor.updatedAt, input: { kind: editor.kind, occurredAt: new Date(editor.occurredAt).toISOString(), peed: editor.peed, pooped: editor.pooped, notes: editor.notes } }
        : { input: { kind: editor.kind, occurredAt: new Date(editor.occurredAt).toISOString(), peed: editor.peed, pooped: editor.pooped, notes: editor.notes } })
    });
    const payload = await response.json() as { ok?: boolean; item?: DogCareEvent; error?: string };
    setBusy(false);
    if (!response.ok || !payload.ok || !payload.item) return setError(payload.error || "The care entry could not be saved.");
    setState((current) => ({ ...current, events: [...current.events.filter((item) => item.id !== payload.item!.id), payload.item!].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)) }));
    setEditor(null);
    setNotice(editor.id ? "Care entry updated." : `${editor.kind === "walk" ? "Walk" : "Feeding"} logged.`);
  }

  async function remove(item: DogCareEvent) {
    if (!window.confirm(`Delete this ${item.kind} entry?`)) return;
    setBusy(true);
    const response = await fetch("/api/personal/dog", { method: "DELETE", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ id: item.id, expectedUpdatedAt: item.updatedAt }) });
    const payload = await response.json() as { ok?: boolean; error?: string };
    setBusy(false);
    if (!response.ok || !payload.ok) return setError(payload.error || "The care entry could not be deleted.");
    setState((current) => ({ ...current, events: current.events.filter((event) => event.id !== item.id) }));
    setNotice("Care entry deleted.");
  }

  return (
    <div className={baseStyles.shell}>
      <PersonalOpsSidebar activeView="dog" filter="" pathname="/admin/personal/dog" counts={sidebarCounts} mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      <main className={baseStyles.directory} aria-label="Dog care">
        <div className={baseStyles.mobileToolbar}><button type="button" onClick={() => setMobileSidebarOpen(true)}><PersonalOpsIcon name="menu" /> Personal</button><button type="button" onClick={() => setEditor(draftFor("walk"))}><PersonalOpsIcon name="plus" /> Walk</button></div>
        <div className={[baseStyles.mainScroll, styles.utilityScroll].join(" ")}>
          <header className={styles.utilityHeader}>
            <div><span className={styles.kicker}>Daily care</span><h1>Dog</h1><p>A lightweight record of walks, meals, and bathroom breaks.</p></div>
            <div className={styles.headerActions}><button type="button" className={styles.primaryButton} onClick={() => setEditor(draftFor("walk"))}><PersonalOpsIcon name="plus" /> Walk</button><button type="button" className={styles.secondaryButton} onClick={() => setEditor(draftFor("feed"))}><PersonalOpsIcon name="plus" /> Feed</button></div>
          </header>
          {error && <div className={styles.error} role="alert">{error}</div>}
          {notice && <div className={styles.notice} role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss"><PersonalOpsIcon name="close" /></button></div>}

          <section className={styles.carePulse} aria-label="Latest dog care">
            <article><div className={styles.careIcon}><PersonalOpsIcon name="walk" /></div><span>Walk</span><strong>{relativeTime(latest.walk?.occurredAt)}</strong><small>{formatTime(latest.walk?.occurredAt)}</small></article>
            <article><div className={styles.careIcon}><PersonalOpsIcon name="feed" /></div><span>Feed</span><strong>{relativeTime(latest.feed?.occurredAt)}</strong><small>{formatTime(latest.feed?.occurredAt)}</small></article>
            <article><div className={styles.careIcon}><PersonalOpsIcon name="droplet" /></div><span>Pee</span><strong>{relativeTime(latest.pee?.occurredAt)}</strong><small>{formatTime(latest.pee?.occurredAt)}</small></article>
            <article><div className={styles.careIcon}><PersonalOpsIcon name="dog" /></div><span>Poop</span><strong>{relativeTime(latest.poop?.occurredAt)}</strong><small>{formatTime(latest.poop?.occurredAt)}</small></article>
          </section>

          <section className={[styles.guideSection, styles.careLog].join(" ")}>
            <header><div className={styles.sectionIcon}><PersonalOpsIcon name="today" /></div><div><h2>Care log</h2><p>{state.events.length} entr{state.events.length === 1 ? "y" : "ies"}</p></div></header>
            {state.events.length ? <div className={styles.careTimeline}>{state.events.map((item) => <article key={item.id}><div className={styles.timelineMark}><PersonalOpsIcon name={item.kind === "walk" ? "walk" : "feed"} /></div><div className={styles.timelineCopy}><div><strong>{item.kind === "walk" ? "Walk" : "Fed"}</strong><time dateTime={item.occurredAt}>{formatTime(item.occurredAt)}</time></div>{item.kind === "walk" && (item.peed || item.pooped) && <div className={styles.careTags}>{item.peed && <span><PersonalOpsIcon name="droplet" /> Pee</span>}{item.pooped && <span><PersonalOpsIcon name="dog" /> Poop</span>}</div>}{item.notes && <p>{item.notes}</p>}</div><div className={styles.cardActions}><button type="button" onClick={() => setEditor(draftFor(item.kind, item))} aria-label={`Edit ${item.kind}`}><PersonalOpsIcon name="edit" /></button><button type="button" className={styles.deleteIcon} onClick={() => remove(item)} aria-label={`Delete ${item.kind}`}><PersonalOpsIcon name="delete" /></button></div></article>)}</div> : <div className={styles.emptyState}><PersonalOpsIcon name="dog" /><strong>No care logged yet</strong><span>Log a walk or a feeding from the actions above.</span></div>}
          </section>
        </div>
      </main>

      {editor && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}><form className={[styles.editorDialog, styles.dogDialog].join(" ")} onSubmit={save}><header><div><span className={styles.kicker}>Care entry</span><h2>{editor.id ? "Edit" : "Log"} {editor.kind === "walk" ? "walk" : "feeding"}</h2></div><button type="button" className={styles.iconButton} onClick={() => setEditor(null)} aria-label="Close"><PersonalOpsIcon name="close" /></button></header><div className={styles.editorFields}><label className={styles.field}><span>Type</span><select value={editor.kind} onChange={(event) => setEditor({ ...editor, kind: event.target.value as DogCareKind, peed: event.target.value === "walk" && editor.peed, pooped: event.target.value === "walk" && editor.pooped })}><option value="walk">Walk</option><option value="feed">Feed</option></select></label><label className={styles.field}><span>When</span><input required type="datetime-local" value={editor.occurredAt} onChange={(event) => setEditor({ ...editor, occurredAt: event.target.value })} /></label>{editor.kind === "walk" && <fieldset className={[styles.outcomePicker, styles.fullField].join(" ")}><legend>Bathroom</legend><label><input type="checkbox" checked={editor.peed} onChange={(event) => setEditor({ ...editor, peed: event.target.checked })} /><PersonalOpsIcon name="droplet" /> Peed</label><label><input type="checkbox" checked={editor.pooped} onChange={(event) => setEditor({ ...editor, pooped: event.target.checked })} /><PersonalOpsIcon name="dog" /> Pooped</label></fieldset>}<label className={[styles.field, styles.fullField].join(" ")}><span>Notes</span><textarea value={editor.notes} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} placeholder="Optional" /></label></div><footer><button type="button" className={styles.secondaryButton} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={busy}>Save</button></footer></form></div>}
    </div>
  );
}
