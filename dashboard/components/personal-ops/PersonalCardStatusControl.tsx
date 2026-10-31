"use client";

import { useId, useRef, useState } from "react";
import type { PersonalOpsObject } from "../../lib/modules/personal-ops/types";
import { PersonalOpsStatusSelect } from "./PersonalOpsPrimitives";
import styles from "./PersonalOpsWorkspace.module.css";

type StatusChoice = { value: string; reason?: string };
export function personalCardStatusChoices(item: PersonalOpsObject): StatusChoice[] {
  if (item.lifecycle === "archived") return [{ value: item.objectType === "goal" ? item.lifecycle : item.objectType === "decision" ? item.decisionState : item.objectType === "obligation" ? item.obligationState : item.followUpState, reason: "Restore this item from its details first." }];
  switch (item.objectType) {
    case "goal": return ["draft", "planned", "active", "complete"].map(value => ({ value,
      reason: value === "complete" && item.keyResults.some(result => !result.complete) ? "Complete every key result in details first." : undefined }));
    case "obligation": return ["open", "waiting", "blocked", "complete"].map(value => ({ value,
      reason: value === "complete" && (!item.completionCriteria.length || item.completionCriteria.some(criterion => !criterion.satisfied) || item.requiredEvidence.some(evidence => evidence.required && evidence.state === "missing")) ? "Satisfy completion criteria and required evidence in details first." : undefined }));
    case "decision": return [
      { value: "open" },
      { value: "decided", reason: !item.finalDecision ? "Add the final decision in details first." : undefined },
      { value: "deferred", reason: !item.deferReason || !item.revisitAt ? "Add a defer reason and revisit date in details first." : undefined },
      { value: "superseded", reason: !item.supersededBy ? "Link the replacement decision in details first." : undefined }
    ];
    case "follow_up": return ["open", "scheduled", "waiting", "deferred", "complete", "carried_forward"].map(value => ({ value,
      reason: value === "deferred" && (!item.deferReason || !item.deferredUntil) ? "Add a defer reason and new date in details first." : undefined }));
    default: return [];
  }
}

export default function PersonalCardStatusControl({ title, value, choices, disabled, onSave }: {
  title: string;
  value: string;
  choices: StatusChoice[];
  disabled?: boolean;
  onSave: (value: string) => Promise<string | null>;
}) {
  const errorId = useId();
  const saving = useRef(false);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState("");
  async function choose(next: string) {
    if (saving.current || disabled || next === value || !choices.some(choice => choice.value === next && !choice.reason)) return;
    saving.current = true;
    setPending(next);
    setError("");
    try {
      const failure = await onSave(next);
      if (failure) setError(failure);
    } catch {
      setError("Status could not be saved. Try again.");
    } finally {
      saving.current = false;
      setPending(undefined);
    }
  }
  return <div className={styles.cardStatusControl} aria-busy={pending !== undefined}>
    <PersonalOpsStatusSelect className={styles.cardStatusSelect} aria-label={"Change status for " + title}
      aria-describedby={error ? errorId : undefined} value={pending ?? value} disabled={disabled || pending !== undefined || choices.every(choice => choice.reason)}
      optionDescriptions={Object.fromEntries(choices.filter(choice => choice.reason).map(choice => [choice.value, choice.reason!]))}
      onChange={event => void choose(event.target.value)}>
      {choices.map(choice => <option key={choice.value} value={choice.value} disabled={Boolean(choice.reason)} title={choice.reason}>{choice.value.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase())}</option>)}
    </PersonalOpsStatusSelect>
    <span className={styles.cardStatusSaving} role="status">{pending !== undefined ? "Saving…" : ""}</span>
    {error && <small id={errorId} className={styles.cardStatusError} role="alert">{error}</small>}
  </div>;
}
