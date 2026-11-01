"use client";

import { useState } from "react";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import SelectField from "../ui/SelectField";
import type { PersonalOpsObject, PersonalOpsDecision, PersonalOpsFamily, PersonalOpsUpdateInputByFamily } from "../../lib/modules/personal-ops/types";
import { statusLabel } from "./PersonalCardStatusControl";
import styles from "./PersonalOpsWorkspace.module.css";

export type StatusDetails = PersonalOpsUpdateInputByFamily[PersonalOpsFamily];

/** Collect only the evidence the selected transition actually requires. */
export default function PersonalStatusRequirements({ item, next, decisions, onSave, onClose }: {
  item: PersonalOpsObject; next: string; decisions: PersonalOpsDecision[];
  onSave: (details: StatusDetails) => Promise<string | null>; onClose: () => void;
}) {
  const [text, setText] = useState(item.objectType === "decision" && next === "decided" ? item.finalDecision || "" : "");
  const [date, setDate] = useState("");
  const [replacement, setReplacement] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const checks = next !== "complete" ? [] : item.objectType === "goal"
    ? item.keyResults.filter(result => !result.complete).map(result => ({id:result.id,label:result.title}))
    : item.objectType === "obligation" ? [
      ...item.completionCriteria.filter(criterion => !criterion.satisfied).map(criterion => ({id:criterion.id,label:criterion.label})),
      ...item.requiredEvidence.filter(evidence => evidence.required && evidence.state === "missing").map(evidence => ({id:evidence.id,label:`Received: ${evidence.label}`}))
    ] : [];
  const needsText = next === "archived" || next === "deferred" || next === "decided" || (next === "complete" && item.objectType === "obligation" && !item.completionCriteria.length);
  async function save() {
    if (needsText && !text.trim()) { setError("Fill in the required details."); return; }
    if (next === "deferred" && !date) { setError("Choose a date."); return; }
    if (checks.some(check => !checked.includes(check.id))) { setError("Confirm each remaining item before completing."); return; }
    let details: StatusDetails = {};
    if (next === "archived") details = {archiveReason:text.trim()};
    else if (next === "deferred") details = item.objectType === "decision" ? {deferReason:text.trim(),revisitAt:date} : {deferReason:text.trim(),deferredUntil:date};
    else if (next === "decided") details = {finalDecision:text.trim()};
    else if (next === "superseded") {
      const selected = decisions.find(decision => decision.id === replacement);
      if (!selected) { setError("Choose the replacement decision."); return; }
      details = {supersededBy:{module:"personal_ops",objectType:"decision",objectId:selected.id,label:selected.title,route:`/admin/personal/decisions?selected=${encodeURIComponent(selected.id)}`}};
    } else if (next === "complete" && item.objectType === "goal") details = {keyResults:item.keyResults.map(result => ({...result,complete:result.complete || checked.includes(result.id)}))};
    else if (next === "complete" && item.objectType === "obligation") details = {
      completionCriteria:item.completionCriteria.length ? item.completionCriteria.map(criterion => ({...criterion,satisfied:criterion.satisfied || checked.includes(criterion.id)})) : [{id:crypto.randomUUID(),label:text.trim(),satisfied:true}],
      requiredEvidence:item.requiredEvidence.map(evidence => checked.includes(evidence.id) ? {...evidence,state:"received" as const} : evidence)
    };
    setBusy(true); setError("");
    try { const failure = await onSave(details); if (failure) setError(failure); else onClose(); }
    catch { setError("Status could not be saved. Try again."); }
    finally { setBusy(false); }
  }
  return <ConfirmationSheet open title={`${statusLabel(next)}: ${item.title}`} eyebrow={null} iconRole="edit" confirmLabel="Save status" busy={busy} onOpenChange={open => {if(!open)onClose();}} onConfirm={save}>
    <div className={styles.statusRequirements}>
      {needsText && <label>{next === "archived" ? "Archive reason" : next === "deferred" ? "Reason" : next === "decided" ? "Decision" : "What was completed?"}<textarea value={text} onChange={event=>setText(event.target.value)} disabled={busy} rows={3}/></label>}
      {next === "deferred" && <label>{item.objectType === "decision" ? "Revisit date" : "New date"}<input type="date" value={date} onChange={event=>setDate(event.target.value)} disabled={busy}/></label>}
      {next === "superseded" && <label>Replacement decision<SelectField aria-label="Replacement decision" value={replacement} onChange={event=>setReplacement(event.target.value)} disabled={busy}><option value="">Choose a decision</option>{decisions.filter(decision=>decision.id!==item.id&&decision.lifecycle!=="archived").map(decision=><option key={decision.id} value={decision.id}>{decision.title}</option>)}</SelectField></label>}
      {checks.map(check=><label className={styles.statusRequirementCheck} key={check.id}><input type="checkbox" disabled={busy} checked={checked.includes(check.id)} onChange={event=>setChecked(current=>event.target.checked?[...current,check.id]:current.filter(id=>id!==check.id))}/><span>{check.label}</span></label>)}
      {error && <p role="alert" className={styles.cardStatusError}>{error}</p>}
    </div>
  </ConfirmationSheet>;
}
