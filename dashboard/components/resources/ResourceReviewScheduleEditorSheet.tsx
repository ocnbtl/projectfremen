"use client";

import type { FormEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import {
  formatResourceReviewCadence,
  RESOURCE_REVIEW_CADENCE_OPTIONS,
  resourceReviewCadenceChoiceFor,
  resourceReviewCadenceValue,
  type ResourceReviewCadenceChoice
} from "../../lib/modules/resources/review-schedule";
import { createResourcesRepository } from "../../lib/modules/resources/repository";
import type { ResourceRecord } from "../../lib/modules/resources/types";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import styles from "./ResourceEditorSheet.module.css";

type ResourceReviewScheduleEditorSheetProps = {
  open: boolean;
  resource: ResourceRecord;
  onClose: () => void;
  onSaved: (resource: ResourceRecord) => void;
};

type ReviewScheduleForm = {
  nextReviewDate: string;
  cadenceChoice: ResourceReviewCadenceChoice;
  legacyCadence: string;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function dateInputValue(value?: string | null): string {
  if (!value) return "";
  const exactDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (exactDate) return exactDate[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function localDateFromOffset(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formForResource(resource: ResourceRecord): ReviewScheduleForm {
  const legacyCadence = resource.provenance.time.reviewCadence?.trim().toUpperCase() || "";
  return {
    nextReviewDate: dateInputValue(resource.review.nextReviewAt),
    cadenceChoice: resourceReviewCadenceChoiceFor(legacyCadence),
    legacyCadence
  };
}

function scheduleForForm(form: ReviewScheduleForm) {
  return {
    nextReviewDate: form.nextReviewDate,
    cadence: resourceReviewCadenceValue(form.cadenceChoice, form.legacyCadence)
  };
}

export default function ResourceReviewScheduleEditorSheet({
  open,
  resource,
  onClose,
  onSaved
}: ResourceReviewScheduleEditorSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const confirmationOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [form, setForm] = useState<ReviewScheduleForm>(() => formForResource(resource));
  const [baseline, setBaseline] = useState<ReviewScheduleForm>(() => formForResource(resource));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const currentSchedule = scheduleForForm(form);
  const baselineSchedule = scheduleForForm(baseline);
  const dirty =
    currentSchedule.nextReviewDate !== baselineSchedule.nextReviewDate ||
    currentSchedule.cadence !== baselineSchedule.cadence;
  const canSave = dirty && Boolean(currentSchedule.nextReviewDate) && !busy;
  const hasStoredSchedule = Boolean(
    resource.review.nextReviewAt || resource.provenance.time.reviewCadence
  );

  busyRef.current = busy;
  dirtyRef.current = dirty;
  confirmationOpenRef.current = discardOpen || clearOpen;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (confirmationOpenRef.current) return;
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        if (dirtyRef.current) setDiscardOpen(true);
        else onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, open]);

  function updateForm(patch: Partial<ReviewScheduleForm>) {
    setForm((current) => ({ ...current, ...patch }));
    setError("");
  }

  function requestClose() {
    if (busy) return;
    if (dirty) setDiscardOpen(true);
    else onClose();
  }

  function validateSchedule(): string {
    if (!currentSchedule.nextReviewDate) return "Choose a next review date.";
    const date = new Date(`${currentSchedule.nextReviewDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return "Choose a valid review date.";
    return "";
  }

  async function persistSchedule(nextReviewAt: string, reviewCadence: string) {
    setBusy(true);
    setError("");
    const result = await createResourcesRepository().update(resource.id, {
      nextReviewAt,
      reviewCadence
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error.message);
      return;
    }
    const savedForm = formForResource(result.data);
    setForm(savedForm);
    setBaseline(savedForm);
    setBusy(false);
    onSaved(result.data);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || busy) return;
    const validationError = validateSchedule();
    if (validationError) {
      setError(validationError);
      return;
    }
    await persistSchedule(currentSchedule.nextReviewDate, currentSchedule.cadence);
  }

  async function clearSchedule() {
    setClearOpen(false);
    await persistSchedule("", "");
  }

  if (!open) return null;

  return (
    <>
      <div
        className={styles.backdrop}
        data-resource-review-schedule-editor="true"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        <div
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          aria-busy={busy || undefined}
        >
          <form className={styles.form} onSubmit={submit}>
            <header className={styles.header}>
              <div>
                <span className={styles.eyebrow}>Legacy-backed Resource review timing</span>
                <h2 id={titleId}>Schedule review · {resource.title}</h2>
                <p id={descriptionId}>
                  Choose when this external source should return for attention and whether that
                  timing should repeat.
                </p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={requestClose}
                disabled={busy}
                aria-label="Close Resource review schedule editor"
              >
                <UnigentamosIcon role="close" size={20} />
              </button>
            </header>

            <div className={styles.body}>
              {error && (
                <div className={styles.error} role="alert">
                  <strong>Resource review timing was not saved</strong>
                  <span>{error}</span>
                  <small>Your date and cadence are still here. Review them and try again.</small>
                </div>
              )}

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h3>Next review</h3>
                    <p>
                      This is queue planning. It does not change the Resource’s review state.
                    </p>
                  </div>
                  <span className={styles.required}>Explicit save</span>
                </div>

                <label className={styles.field}>
                  <span>Next review date</span>
                  <input
                    data-autofocus="true"
                    autoFocus
                    type="date"
                    value={form.nextReviewDate}
                    onChange={(event) =>
                      updateForm({ nextReviewDate: event.target.value })
                    }
                    aria-invalid={Boolean(error && !currentSchedule.nextReviewDate)}
                    aria-describedby={`${descriptionId}-date`}
                    required
                  />
                  <small id={`${descriptionId}-date`} data-tone="muted">
                    Current and past dates remain visible as due timing; future dates plan a later
                    return. Evidence gaps remain independent.
                  </small>
                </label>

                <div className={styles.dateShortcuts} aria-label="Resource review date shortcuts">
                  <button
                    type="button"
                    onClick={() => updateForm({ nextReviewDate: localDateFromOffset(0) })}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => updateForm({ nextReviewDate: localDateFromOffset(7) })}
                  >
                    In 7 days
                  </button>
                  <button
                    type="button"
                    onClick={() => updateForm({ nextReviewDate: localDateFromOffset(30) })}
                  >
                    In 30 days
                  </button>
                </div>

                <label className={styles.field}>
                  <span>Cadence</span>
                  <select
                    value={form.cadenceChoice}
                    onChange={(event) =>
                      updateForm({
                        cadenceChoice: event.target.value as ResourceReviewCadenceChoice
                      })
                    }
                    aria-describedby={`${descriptionId}-cadence`}
                  >
                    {form.cadenceChoice === "legacy" && (
                      <option value="legacy">
                        {formatResourceReviewCadence(form.legacyCadence)}
                      </option>
                    )}
                    {RESOURCE_REVIEW_CADENCE_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small id={`${descriptionId}-cadence`} data-tone="muted">
                    Recurring options store an ISO interval. They do not start a background
                    scheduler or fetch the URL.
                  </small>
                </label>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h3>Result preview</h3>
                    <p>Only the two supported timing fields are included in this save.</p>
                  </div>
                </div>
                <div className={styles.boundaryRows}>
                  <div>
                    <span>Next review</span>
                    <strong>{currentSchedule.nextReviewDate || "Choose a date"}</strong>
                  </div>
                  <div>
                    <span>Cadence</span>
                    <strong>{formatResourceReviewCadence(currentSchedule.cadence)}</strong>
                  </div>
                  <div>
                    <span>Trigger conditions</span>
                    <strong>Date and evidence queue only</strong>
                  </div>
                  <div>
                    <span>Reviewer / reason / Review link</span>
                    <strong>Not stored by this adapter</strong>
                  </div>
                </div>
              </section>

              <section className={styles.boundary}>
                <strong>What this save does</strong>
                <p>
                  Updates only the existing Personal Record’s next-review date and review cadence
                  through the protected PATCH route. The Resource ID and current update audit
                  behavior are preserved.
                </p>
                <strong>What it does not do</strong>
                <p>
                  It does not mark the Resource reviewed, resolve or waive any of the nine review
                  contracts, identify a reviewer, check or fetch the URL, create a ReviewRun,
                  update citations, attach a snapshot, change lifecycle, or schedule background
                  work.
                </p>
                {hasStoredSchedule && (
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => setClearOpen(true)}
                    disabled={busy}
                  >
                    Remove stored schedule
                  </button>
                )}
              </section>
            </div>

            <footer className={styles.actions}>
              <span aria-live="polite">
                {busy
                  ? "Saving Resource review timing…"
                  : dirty
                    ? "Unsaved timing changes"
                    : "No unsaved changes"}
              </span>
              <div>
                <button type="button" onClick={requestClose} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className={styles.primary} disabled={!canSave}>
                  {busy ? "Saving…" : "Save timing"}
                </button>
              </div>
            </footer>
          </form>
        </div>
      </div>

      <ConfirmationSheet
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
        title="Discard unsaved Resource review timing?"
        description="The next-review date or cadence in this sheet has not been saved."
        consequences={[
          "The stored Resource review timing will remain unchanged.",
          "This timing draft cannot be recovered after closing."
        ]}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        className={styles.discardConfirmation}
      />

      <ConfirmationSheet
        open={clearOpen}
        onOpenChange={setClearOpen}
        onConfirm={() => void clearSchedule()}
        title="Remove this Resource’s review schedule?"
        description="This clears both the next-review date and recurrence from the current Personal Record."
        consequences={[
          "The Resource remains in evidence-derived queues when unresolved checks still apply.",
          "Review state, lifecycle, source identity, links, citations, and history remain unchanged.",
          "You can schedule the Resource again later."
        ]}
        confirmLabel="Remove schedule"
        cancelLabel="Keep schedule"
        tone="danger"
        busy={busy}
        dismissible={!busy}
        className={styles.discardConfirmation}
      />
    </>
  );
}
