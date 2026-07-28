"use client";

import type { FormEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import {
  formatMediaReviewCadence,
  MEDIA_REVIEW_CADENCE_OPTIONS,
  mediaReviewCadenceChoiceFor,
  mediaReviewCadenceValue,
  normalizeMediaReviewCadence,
  type MediaReviewCadenceChoice
} from "../../lib/modules/media/review-schedule";
import { createMediaRepository } from "../../lib/modules/media/repository";
import type { MediaAsset } from "../../lib/modules/media/types";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import styles from "../resources/ResourceEditorSheet.module.css";

type MediaReviewScheduleEditorSheetProps = {
  open: boolean;
  asset: MediaAsset;
  onClose: () => void;
  onSaved: (asset: MediaAsset) => void;
};

type ReviewScheduleForm = {
  nextReviewDate: string;
  cadenceChoice: MediaReviewCadenceChoice;
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

function dateInputValue(value?: string): string {
  if (!value) return "";
  const exactDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (exactDate) return exactDate[1];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
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

function formForAsset(asset: MediaAsset): ReviewScheduleForm {
  const cadence = normalizeMediaReviewCadence(asset.provenance.time.reviewCadence);
  return {
    nextReviewDate: dateInputValue(asset.provenance.time.nextReview),
    cadenceChoice: mediaReviewCadenceChoiceFor(cadence),
    legacyCadence: cadence
  };
}

function scheduleForForm(form: ReviewScheduleForm) {
  return {
    nextReviewDate: form.nextReviewDate,
    cadence: mediaReviewCadenceValue(form.cadenceChoice, form.legacyCadence)
  };
}

export default function MediaReviewScheduleEditorSheet({
  open,
  asset,
  onClose,
  onSaved
}: MediaReviewScheduleEditorSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const confirmationOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [form, setForm] = useState<ReviewScheduleForm>(() => formForAsset(asset));
  const [baseline, setBaseline] = useState<ReviewScheduleForm>(() => formForAsset(asset));
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
    asset.provenance.time.nextReview || asset.provenance.time.reviewCadence
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
    return Number.isNaN(date.getTime()) ? "Choose a valid review date." : "";
  }

  async function persistSchedule(nextReviewAt: string, reviewCadence: string) {
    setBusy(true);
    setError("");
    const result = await createMediaRepository().update(asset.id, {
      nextReviewAt,
      reviewCadence
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error.message);
      return;
    }
    const savedForm = formForAsset(result.data);
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
        data-media-review-schedule-editor="true"
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
                <span className={styles.eyebrow}>Legacy-backed Media review timing</span>
                <h2 id={titleId}>Schedule review · {asset.title}</h2>
                <p id={descriptionId}>
                  Plan when this asset should return for human attention without changing its
                  readiness, rights, or native review state.
                </p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={requestClose}
                disabled={busy}
                aria-label="Close Media review timing editor"
              >
                <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                  <path
                    d="m4 4 12 12M16 4 4 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </button>
            </header>

            <div className={styles.body}>
              {error && (
                <div className={styles.error} role="alert">
                  <strong>Media review timing was not saved</strong>
                  <span>{error}</span>
                  <small>Your date and cadence are still here. Review them and try again.</small>
                </div>
              )}

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h3>Next review</h3>
                    <p>
                      This date is queue-planning metadata. It never completes an AssetReview.
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
                    onChange={(event) => updateForm({ nextReviewDate: event.target.value })}
                    aria-invalid={Boolean(error && !currentSchedule.nextReviewDate)}
                    aria-describedby={`${descriptionId}-date`}
                    required
                  />
                  <small id={`${descriptionId}-date`} data-tone="muted">
                    Current and past dates are due timing; future dates plan a later return.
                    Evidence gaps remain independent.
                  </small>
                </label>

                <div className={styles.dateShortcuts} aria-label="Media review date shortcuts">
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
                        cadenceChoice: event.target.value as MediaReviewCadenceChoice
                      })
                    }
                    aria-describedby={`${descriptionId}-cadence`}
                  >
                    {form.cadenceChoice === "legacy" && (
                      <option value="legacy">
                        {formatMediaReviewCadence(form.legacyCadence)}
                      </option>
                    )}
                    {MEDIA_REVIEW_CADENCE_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small id={`${descriptionId}-cadence`} data-tone="muted">
                    Recurring options store an ISO interval. They do not start a scheduler,
                    assign a reviewer, or create a ReviewRun.
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
                    <strong>{formatMediaReviewCadence(currentSchedule.cadence)}</strong>
                  </div>
                  <div>
                    <span>Readiness and rights</span>
                    <strong>Unchanged</strong>
                  </div>
                  <div>
                    <span>Reviewer / checklist / ReviewRun</span>
                    <strong>Not stored by this adapter</strong>
                  </div>
                </div>
              </section>

              <section className={styles.boundary}>
                <strong>What this save does</strong>
                <p>
                  Updates only the existing Personal Record’s next-review date and review cadence
                  through the protected PATCH route. The Media ID and current update-audit
                  behavior are preserved.
                </p>
                <strong>What it does not do</strong>
                <p>
                  It does not mark the asset reviewed or ready, resolve metadata or rights,
                  identify a reviewer, confirm a source, create an AssetReview or ReviewRun,
                  change lifecycle, read a binary, or schedule background work.
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
                  ? "Saving Media review timing…"
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
        title="Discard unsaved Media review timing?"
        description="The next-review date and cadence in this sheet have not been saved."
        consequences={[
          "The stored Media timing will remain unchanged.",
          "This editor draft cannot be recovered after closing."
        ]}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        className={styles.discardConfirmation}
      />

      <ConfirmationSheet
        open={clearOpen}
        onOpenChange={setClearOpen}
        onConfirm={clearSchedule}
        title="Remove this Media asset’s review schedule?"
        description="The asset will no longer have a stored next-review date or cadence."
        consequences={[
          "The asset remains in Media with its existing metadata and provenance.",
          "Readiness, rights, review completion, and links remain unchanged.",
          "You can schedule another review later."
        ]}
        confirmLabel="Remove schedule"
        cancelLabel="Keep schedule"
        tone="danger"
        className={styles.discardConfirmation}
      />
    </>
  );
}
