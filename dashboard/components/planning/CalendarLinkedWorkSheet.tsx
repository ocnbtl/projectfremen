"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { PersonalOpsStatusChip, personalOpsToneForState } from "../personal-ops/PersonalOpsPrimitives";
import { PERSONAL_STATUS_OPTIONS, personalStatusLabel } from "../../lib/modules/personal-ops/status-display";
import { INTERACTION_KINDS } from "../../lib/modules/planning/interaction-kinds";
import type { CalendarWorkItem, CalendarWorkResult } from "../../lib/modules/planning/linked-work-types";
import type { OutcomeSource } from "../../lib/modules/planning/event-outcome-types";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import styles from "./CalendarLinkedWorkSheet.module.css";

const labels = { interaction: "Interaction & notes", note: "Note", goal: "Goal", decision: "Decision", follow_up: "Follow-up" };
const icons = { interaction: "interaction-history", note: "module-notes", goal: "goal", decision: "decision", follow_up: "follow-up" };
const noteTypes = ["note", "idea", "meeting", "decision", "research", "personal_context", "project_note", "event"] as const;
export default function CalendarLinkedWorkSheet({ source, title, initialId, onClose, onSaved }: {
  source: OutcomeSource; title: string; initialId?: string; onClose: () => void; onSaved: () => void;
}) {
  const reduced = useReducedMotion();
  const [data, setData] = useState<CalendarWorkResult>({ items: [], replacements: [] });
  const [draft, setDraft] = useState<CalendarWorkItem>(), [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [pending, setPending] = useState<string>(), [attempt, setAttempt] = useState(0);
  const dirty = Boolean(draft && JSON.stringify(draft) !== original);
  const url = "/api/planning/linked-work?" + new URLSearchParams(source);
  function choose(item?: CalendarWorkItem) {
    const next = item && { ...item, ...(item.kind === "note" ? { noteType: item.noteType || "note" as const } : {}) };
    setDraft(next); setOriginal(next ? JSON.stringify(next) : ""); setError(""); setPending(undefined);
  }
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    fetch(url, { cache: "no-store", signal: controller.signal }).then(async r => {
      const result = await r.json(); if (!result.ok) throw new Error(result.error);
      if (controller.signal.aborted) return;
      setData(result); if (initialId) { const found = result.items.find((i: CalendarWorkItem) => i.id === initialId); choose(found); if (!found) setNotice("That record is no longer available. Other linked work is shown below."); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, initialId, attempt]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function navigate(target: string) {
    if (busy) return;
    if (dirty) { setPending(target); return; }
    if (target === "close") onClose(); else choose(target === "list" ? undefined : data.items.find(i => i.id === target));
  }
  function discard() {
    const target = pending; setPending(undefined);
    if (target === "close") onClose(); else if (target === "reload") { choose(); setAttempt(n => n + 1); } else choose(target === "list" ? undefined : data.items.find(i => i.id === target));
  }
  async function save() {
    if (!draft || !dirty) { onClose(); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/planning/linked-work", { method: "PATCH", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ source, item: draft }) });
      const result = await r.json(); if (!result.ok) throw new Error(result.error);
      setOriginal(JSON.stringify(draft)); setPending(undefined); onSaved(); setNotice("Saved to the original record.");
      const latest = await fetch(url, { cache: "no-store" }).then(r => r.json());
      if (!latest.ok) throw new Error("Saved, but the latest version could not be loaded. Reload before editing again.");
      setData(latest); choose(latest.items.find((i: CalendarWorkItem) => i.id === draft.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save. Your draft is still here."); }
    finally { setBusy(false); }
  }
  const set = (patch: Partial<CalendarWorkItem>) => { if (draft) { setDraft({ ...draft, ...patch }); setNotice(""); } };
  const field = (label: string, key: "outcome" | "question" | "finalDecision" | "deferReason", required = false) => <label>{label}<textarea aria-label={label} rows={2} required={required} value={draft?.[key] || ""} onChange={e => set({ [key]: e.target.value })}/></label>;
  return <ConfirmationSheet open title="Linked work" iconRole="link" eyebrow={null} description={title}
    onOpenChange={open => { if (!open) navigate("close"); }} onConfirm={save} confirmLabel={draft && dirty ? "Save changes" : "Done"}
    onCancel={() => navigate(draft ? "list" : "close")} cancelLabel={draft ? "Back to linked work" : "Close"} busy={busy} confirmDisabled={loading || Boolean(draft?.readOnly && dirty)}
    className={styles.sheet}>
    {pending && <div className={styles.warning} role="alert"><span>You have unsaved changes.</span><button type="button" onClick={() => setPending(undefined)}>Keep editing</button><button type="button" onClick={discard}>Discard changes</button></div>}
    {error && <div className={styles.warning} role="alert"><span>{error}</span><button type="button" disabled={busy} onClick={() => dirty ? setPending("reload") : (choose(), setAttempt(n => n + 1))}>Reload latest</button></div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading ? <p role="status">Loading linked work…</p> : <motion.div key={draft?.id || "list"} initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }}>
      {!draft ? <div className={styles.list}>{data.items.map(item => <button key={item.kind + item.id} type="button" onClick={() => navigate(item.id)} aria-label={`Edit ${labels[item.kind]}: ${item.title}`}>
        <UnigentamosIcon role={icons[item.kind]} size={19}/><span><strong>{item.title}</strong><small>{labels[item.kind]}</small></span>{item.kind!=="note"&&item.kind!=="interaction"&&<PersonalOpsStatusChip tone={personalOpsToneForState(item.status)}>{personalStatusLabel(item.status)}</PersonalOpsStatusChip>}<UnigentamosIcon role="chevron-right" size={16}/>
      </button>)}{!data.items.length && !error && <p>No linked interactions, notes, or next steps yet. Complete the event to record what happened.</p>}</div> : <>
        <button type="button" className={styles.back} onClick={() => navigate("list")} disabled={busy}><UnigentamosIcon role="back" size={16}/>All linked work</button>
        <fieldset className={styles.form} disabled={busy || draft.readOnly}>
          <legend><UnigentamosIcon role={icons[draft.kind]} size={17}/>{labels[draft.kind]}</legend>
          {draft.readOnly && <p>Archived. Restore this record in its original module to edit it.</p>}
          <label>Title<input aria-label="Linked record title" value={draft.title} maxLength={240} onChange={e => set({ title: e.target.value })}/></label>
          {draft.kind === "note" && <label>Type<SelectField aria-label="Note type" value={draft.noteType} onChange={e => set({ noteType: e.target.value as CalendarWorkItem["noteType"] })}>{noteTypes.map(t => <option key={t} value={t}>{personalStatusLabel(t)}</option>)}</SelectField></label>}
          {draft.kind === "interaction" && draft.interaction && <div className={styles.grid}>
            <label>Type<SelectField aria-label="Interaction type" value={draft.interaction.kind} onChange={e => set({ interaction: { ...draft.interaction!, kind: e.target.value as typeof draft.interaction.kind } })}>{INTERACTION_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</SelectField></label>
            <label>Date<input aria-label="Interaction date" type="date" value={draft.interaction.occurredOn} onChange={e => set({ interaction: { ...draft.interaction!, occurredOn: e.target.value } })}/></label>
            <label>Starts<input aria-label="Interaction start time" type="time" value={draft.interaction.startTime || ""} onChange={e => set({ interaction: { ...draft.interaction!, startTime: e.target.value } })}/></label>
            <label>Ends<input aria-label="Interaction end time" type="time" value={draft.interaction.endTime || ""} onChange={e => set({ interaction: { ...draft.interaction!, endTime: e.target.value, endNextDay: Boolean(draft.interaction!.startTime && e.target.value < draft.interaction!.startTime) } })}/></label>
            {draft.interaction.endNextDay && <small>Ends the following day</small>}
          </div>}
          {draft.kind !== "note" && draft.kind !== "interaction" && <>
            <div className={styles.grid}><label>Status<SelectField aria-label="Work status" value={draft.status} onChange={e => set({ status: e.target.value })} renderOptionLabel={(value) => <PersonalOpsStatusChip tone={personalOpsToneForState(value)}>{personalStatusLabel(value)}</PersonalOpsStatusChip>}>{PERSONAL_STATUS_OPTIONS[draft.kind].map(s => <option key={s} value={s}>{personalStatusLabel(s)}</option>)}</SelectField></label><label>Due date<input aria-label="Due date" type="date" value={draft.dueAt?.slice(0, 10) || ""} onChange={e => set({ dueAt: e.target.value })}/></label></div>
            {draft.kind === "goal" && <>{field("Desired outcome", "outcome", true)}{Boolean(draft.keyResults?.length) && <div className={styles.results}><strong>Key results</strong>{draft.keyResults!.map(k => <label key={k.id}><input type="checkbox" checked={k.complete} onChange={e => set({ keyResults: draft.keyResults!.map(r => r.id === k.id ? { ...r, complete: e.target.checked } : r) })}/>{k.title}</label>)}</div>}</>}
            {draft.kind === "decision" && <>{field("Question", "question", true)}{field("Decision made", "finalDecision", draft.status === "decided")}{draft.status === "superseded" && <label>Replacement decision<SelectField aria-label="Replacement decision" value={draft.replacementId || ""} onChange={e => set({ replacementId: e.target.value })}><option value="">Choose decision</option>{data.replacements.filter(r => r.id !== draft.id).map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</SelectField></label>}</>}
            {draft.kind === "follow_up" && <>{field("Context", "question")}{field("Outcome", "outcome")}</>}
            {draft.status === "deferred" && <>{field("Reason for putting on hold", "deferReason", true)}<label>Revisit date<input aria-label="Revisit date" type="date" value={draft.revisitAt?.slice(0, 10) || ""} onChange={e => set({ revisitAt: e.target.value })}/></label></>}
          </>}
          {draft.status === "archived" && <label>Archive reason<textarea aria-label="Archive reason" rows={2} value={draft.archiveReason || ""} onChange={e=>set({archiveReason:e.target.value})}/></label>}
          <label>{draft.kind === "note" || draft.kind === "interaction" ? "Notes" : "Description"}<textarea aria-label="Linked record notes" rows={5} value={draft.body} onChange={e => set({ body: e.target.value })}/></label>
          <small>Edits update the original record. The calendar event’s own time and description stay separate.</small>
        </fieldset>
      </>}
    </motion.div>}
  </ConfirmationSheet>;
}
