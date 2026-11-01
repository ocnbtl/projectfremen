"use client";

import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { Fragment, useId, useRef, useState } from "react";
import type { PersonalOpsObject } from "../../lib/modules/personal-ops/types";
import { PersonalOpsStatusChip, personalOpsToneForState } from "./PersonalOpsPrimitives";
import styles from "./PersonalOpsWorkspace.module.css";
import { personalStatusLabel, PERSONAL_STATUS_OPTIONS } from "../../lib/modules/personal-ops/status-display";

const statusGroup=(value:string)=>["complete","decided","cancelled","superseded","archived"].includes(value)?"Finished":["waiting","blocked","paused","deferred"].includes(value)?"Paused or waiting":"Current work";

export type StatusChoice = { value: string; reason?: string };
export const statusLabel = personalStatusLabel;
export function personalCardStatusChoices(item: PersonalOpsObject): StatusChoice[] {
  let choices: StatusChoice[];
  if (item.objectType === "goal") choices = PERSONAL_STATUS_OPTIONS.goal.filter(value => value !== "archived").map(value => ({value, reason: value === "complete" && item.keyResults.some(result => !result.complete) ? "Confirm the remaining key results." : undefined}));
  else if (item.objectType === "decision") choices = [
    {value:"open"}, {value:"considering"}, {value:"waiting"}, {value:"cancelled"}, {value:"decided",reason:!item.finalDecision ? "Record your decision." : undefined},
    {value:"deferred",reason:!item.deferReason || !item.revisitAt ? "Choose a revisit date and reason." : undefined},
    {value:"superseded",reason:!item.supersededBy ? "Choose the replacement decision." : undefined}
  ];
  else if (item.objectType === "obligation") choices = ["open","waiting","blocked","complete"].map(value => ({value,reason:value === "complete" && (!item.completionCriteria.length || item.completionCriteria.some(criterion => !criterion.satisfied) || item.requiredEvidence.some(evidence => evidence.required && evidence.state === "missing")) ? "Confirm completion and required evidence." : undefined}));
  else choices = ["open","scheduled","waiting","deferred","complete","carried_forward"].map(value => ({value,reason:value === "deferred" && (!item.deferReason || !item.deferredUntil) ? "Choose a new date and reason." : undefined}));
  return PERSONAL_STATUS_OPTIONS[item.objectType].map(value => value === "archived" ? {value,reason:"Add an archive reason."} : choices.find(choice=>choice.value===value)!);
}
export default function PersonalCardStatusControl({ title, value, choices, disabled, onSave, onRequirements }: {
  title: string;
  value: string;
  choices: StatusChoice[];
  disabled?: boolean;
  onRequirements?: (value: string) => void;
  onSave: (value: string) => Promise<string | null>;
}) {
  const errorId = useId();
  const listId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const requirementsAfterClose = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const saving = useRef(false);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState("");


  async function choose(next: string) {
    setOpen(false);
    if (saving.current || disabled || next === value) return;
    const choice = choices.find(choice => choice.value === next);
    if (!choice) return;
    if (choice.reason && onRequirements) { requirementsAfterClose.current = next; return; }
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
        data-value={pending ?? value} disabled={disabled || pending !== undefined}
        onKeyDown={event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
        <PersonalOpsStatusChip tone={personalOpsToneForState(pending ?? value)}>{statusLabel(pending ?? value)}</PersonalOpsStatusChip>
      </button></Popover.Trigger>
      <Popover.Portal><Popover.Content ref={menu} className={styles.cardStatusRoll} sideOffset={3} align="start" collisionPadding={12}
        onCloseAutoFocus={event => { const next = requirementsAfterClose.current; if (next) { event.preventDefault(); requirementsAfterClose.current = null; onRequirements?.(next); } }}
        onOpenAutoFocus={event => { event.preventDefault(); (menu.current?.querySelector<HTMLElement>('[aria-selected="true"]:not(:disabled)') || menu.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus(); }}
        onKeyDown={event => { const options = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []); const index = options.indexOf(document.activeElement as HTMLButtonElement); if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {event.preventDefault(); options[event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length]?.focus();} }}>
        <div id={listId} role="listbox" aria-label={"Change status for " + title}>{choices.map((choice,index) => <Fragment key={choice.value}>{(!index||statusGroup(choice.value)!==statusGroup(choices[index-1].value))&&<div className={styles.statusGroup} role="presentation">{statusGroup(choice.value)}</div>}<button type="button" role="option" key={choice.value} aria-selected={choice.value === (pending ?? value)} title={choice.reason} onClick={() => void choose(choice.value)}>
          <PersonalOpsStatusChip tone={personalOpsToneForState(choice.value)}>{statusLabel(choice.value)}</PersonalOpsStatusChip>
          {choice.value === (pending ?? value) && <UnigentamosIcon role="check" size={14} />}
        </button></Fragment>)}</div>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    <span className={styles.cardStatusSaving} role="status">{pending !== undefined ? "Saving…" : ""}</span>
    {error && <small id={errorId} className={styles.cardStatusError} role="alert">{error}</small>}
  </div>;
}
