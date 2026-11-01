"use client";

import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { useId, useRef, useState } from "react";
import type { PersonalOpsObject } from "../../lib/modules/personal-ops/types";
import { PersonalOpsStatusChip } from "./PersonalOpsPrimitives";
import styles from "./PersonalOpsWorkspace.module.css";

type StatusChoice = { value: string; reason?: string };
export function personalCardStatusChoices(item: PersonalOpsObject): StatusChoice[] {
  if (item.lifecycle === "archived") return [{ value: item.objectType === "goal" ? item.lifecycle : item.objectType === "decision" ? item.decisionState : item.objectType === "obligation" ? item.obligationState : item.followUpState, reason: "Restore this item from its details first." }];
  const active = item.objectType === "goal" ? "active" : "open";
  const complete = item.objectType === "decision" ? "decided" : "complete";
  const reason = item.objectType === "goal" && item.keyResults.some(result => !result.complete)
    ? "Complete every key result in details first."
    : item.objectType === "obligation" && (!item.completionCriteria.length || item.completionCriteria.some(criterion => !criterion.satisfied) || item.requiredEvidence.some(evidence => evidence.required && evidence.state === "missing"))
      ? "Satisfy completion criteria and required evidence in details first."
      : item.objectType === "decision" && !item.finalDecision ? "Add the final decision in details first." : undefined;
  return [{ value: active }, { value: complete, reason }];
}

export default function PersonalCardStatusControl({ title, value, choices, disabled, onSave }: {
  title: string;
  value: string;
  choices: StatusChoice[];
  disabled?: boolean;
  onSave: (value: string) => Promise<string | null>;
}) {
  const errorId = useId();
  const listId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const saving = useRef(false);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState("");
  const archived = choices.length === 1 && Boolean(choices[0]?.reason);
  const completed = ["complete", "decided", "superseded"].includes(pending ?? value);
  async function choose(next: string) {
    setOpen(false);
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
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild><button type="button" className={styles.cardStatusPill}
        aria-label={"Change status for " + title} aria-describedby={error ? errorId : undefined}
        role="combobox" aria-haspopup="listbox" aria-controls={open ? listId : undefined} aria-expanded={open}
        data-value={pending ?? value} disabled={disabled || pending !== undefined || choices.every(choice => choice.reason)}
        onKeyDown={event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
        <PersonalOpsStatusChip tone={archived ? "neutral" : completed ? "positive" : "active"}>{archived ? "Archived" : completed ? "Complete" : "Active"}</PersonalOpsStatusChip>
      </button></Popover.Trigger>
      <Popover.Portal><Popover.Content ref={menu} className={styles.cardStatusRoll} sideOffset={3} align="start" collisionPadding={12}
        onOpenAutoFocus={event => { event.preventDefault(); (menu.current?.querySelector<HTMLElement>('[aria-selected="true"]:not(:disabled)') || menu.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus(); }}
        onKeyDown={event => { const options = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []); const index = options.indexOf(document.activeElement as HTMLButtonElement); if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {event.preventDefault(); options[event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length]?.focus();} }}>
        <div id={listId} role="listbox" aria-label={"Change status for " + title}>{choices.map((choice, index) => <button type="button" role="option" key={choice.value} aria-selected={index === (completed ? 1 : 0)} disabled={Boolean(choice.reason)} title={choice.reason} onClick={() => void choose(choice.value)}>
          <PersonalOpsStatusChip tone={index === 1 ? "positive" : "active"}>{index === 1 ? "Complete" : "Active"}</PersonalOpsStatusChip>
          {index === (completed ? 1 : 0) && <UnigentamosIcon role="check" size={14} />}
        </button>)}</div>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    <span className={styles.cardStatusSaving} role="status">{pending !== undefined ? "Saving…" : ""}</span>
    {error && <small id={errorId} className={styles.cardStatusError} role="alert">{error}</small>}
  </div>;
}
