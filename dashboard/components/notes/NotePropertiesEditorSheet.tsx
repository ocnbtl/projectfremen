"use client";

import type { FormEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createNotesRepository } from "../../lib/modules/notes/repository";
import type { NoteRecord } from "../../lib/modules/notes/types";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import styles from "../resources/ResourceEditorSheet.module.css";

type NotePropertiesEditorSheetProps = {
  open: boolean;
  note: NoteRecord;
  onClose: () => void;
  onSaved: (note: NoteRecord) => void;
};

type NotePropertiesForm = {
  areas: string;
  subjects: string;
  projects: string;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function inputForList(values: readonly string[]): string {
  return values.join(", ");
}

function listFromInput(value: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const candidate of value.split(/[,\n]/)) {
    const normalized = candidate.trim().replace(/\s+/g, " ");
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    values.push(normalized);
  }
  return values;
}

function formForNote(note: NoteRecord): NotePropertiesForm {
  return {
    areas: inputForList(note.areas),
    subjects: inputForList(note.subjects),
    projects: inputForList(note.projects)
  };
}

function formsEqual(left: NotePropertiesForm, right: NotePropertiesForm): boolean {
  return (
    left.areas === right.areas &&
    left.subjects === right.subjects &&
    left.projects === right.projects
  );
}

export default function NotePropertiesEditorSheet({
  open,
  note,
  onClose,
  onSaved
}: NotePropertiesEditorSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const discardOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [form, setForm] = useState<NotePropertiesForm>(() => formForNote(note));
  const [baseline, setBaseline] = useState<NotePropertiesForm>(() => formForNote(note));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirty = !formsEqual(form, baseline);
  const parsedAreas = listFromInput(form.areas);
  const parsedSubjects = listFromInput(form.subjects);
  const parsedProjects = listFromInput(form.projects);
  const canSave = dirty && !busy;
  busyRef.current = busy;
  dirtyRef.current = dirty;
  discardOpenRef.current = discardOpen;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (discardOpenRef.current) return;
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

  function updateField(field: keyof NotePropertiesForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function requestClose() {
    if (busy) return;
    if (dirty) setDiscardOpen(true);
    else onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError("");

    const result = await createNotesRepository().update(note.id, {
      areas: parsedAreas,
      subjects: parsedSubjects,
      projects: parsedProjects
    });

    if (!result.ok) {
      setBusy(false);
      setError(result.error.message);
      return;
    }

    const savedForm = formForNote(result.data);
    setForm(savedForm);
    setBaseline(savedForm);
    setBusy(false);
    onSaved(result.data);
  }

  if (!open) return null;

  return (
    <>
      <div
        className={styles.backdrop}
        data-note-properties-editor="true"
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
                <span className={styles.eyebrow}>Legacy-backed Note properties</span>
                <h2 id={titleId}>{note.title}</h2>
                <p id={descriptionId}>
                  Organize this Note with the routing labels the current audited adapter can preserve.
                </p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={requestClose}
                disabled={busy}
                aria-label="Close Note properties editor"
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
                  <strong>Note properties were not saved</strong>
                  <span>{error}</span>
                  <small>Your routing labels are still here. Review them and try again.</small>
                </div>
              )}

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h3>Routing and retrieval</h3>
                    <p>
                      Separate labels with commas. Empty fields are allowed and remain visible in
                      the Missing Properties workflow where applicable.
                    </p>
                  </div>
                  <span className={styles.required}>Explicit save</span>
                </div>

                <label className={styles.field}>
                  <span>Areas</span>
                  <input
                    data-autofocus="true"
                    autoFocus
                    type="text"
                    value={form.areas}
                    onChange={(event) => updateField("areas", event.target.value)}
                    placeholder="Relationships, Operations, Research"
                    aria-describedby={`${descriptionId}-areas`}
                  />
                  <small id={`${descriptionId}-areas`} data-tone="muted">
                    {parsedAreas.length
                      ? `${parsedAreas.length} ${parsedAreas.length === 1 ? "area" : "areas"} ready to save.`
                      : "No area assigned. This Note will remain eligible for Missing Properties."}
                  </small>
                </label>

                <label className={styles.field}>
                  <span>Subjects</span>
                  <input
                    type="text"
                    value={form.subjects}
                    onChange={(event) => updateField("subjects", event.target.value)}
                    placeholder="Collaboration, Brand direction, Research"
                    aria-describedby={`${descriptionId}-subjects`}
                  />
                  <small id={`${descriptionId}-subjects`} data-tone="muted">
                    {parsedSubjects.length
                      ? `${parsedSubjects.length} subject ${parsedSubjects.length === 1 ? "label" : "labels"} ready to save.`
                      : "Optional subject labels improve search without changing the authored body."}
                  </small>
                </label>

                <label className={styles.field}>
                  <span>Legacy project labels</span>
                  <input
                    type="text"
                    value={form.projects}
                    onChange={(event) => updateField("projects", event.target.value)}
                    placeholder="Project Fremen, Website refresh"
                    aria-describedby={`${descriptionId}-projects`}
                  />
                  <small id={`${descriptionId}-projects`} data-tone="attention">
                    {parsedProjects.length
                      ? `${parsedProjects.length} legacy ${parsedProjects.length === 1 ? "label" : "labels"} ready to save. These do not create Projects-owned links.`
                      : "Optional labels only. Use the Links surface to inspect owner-module evidence."}
                  </small>
                </label>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h3>Protected object boundaries</h3>
                    <p>
                      A property save sends only the three routing arrays shown above.
                    </p>
                  </div>
                </div>
                <div className={styles.boundaryRows}>
                  <div>
                    <span>Authored Note</span>
                    <strong>Title and body remain unchanged</strong>
                  </div>
                  <div>
                    <span>Workflow state</span>
                    <strong>Lifecycle, review, cadence, and privacy remain unchanged</strong>
                  </div>
                  <div>
                    <span>Content graph</span>
                    <strong>Relations, source URLs, backlinks, and attachments remain unchanged</strong>
                  </div>
                  <div>
                    <span>Owner modules</span>
                    <strong>No Project, Resource, Media, Review, or Personal Ops object is created</strong>
                  </div>
                </div>
              </section>

              <section className={styles.boundary}>
                <strong>What this save does</strong>
                <p>
                  Persists Areas, Subjects, and legacy project labels through the current protected
                  Personal Records PATCH route. It preserves the existing record identity and the
                  route appends its current update audit event.
                </p>
                <strong>Still intentionally unavailable</strong>
                <p>
                  Canonical owner, type remapping, privacy changes, pinned state, native link writes,
                  review completion, versions, schema changes, archive, and native Note audit history.
                </p>
              </section>
            </div>

            <footer className={styles.actions}>
              <span aria-live="polite">
                {busy ? "Saving Note properties…" : dirty ? "Unsaved changes" : "No unsaved changes"}
              </span>
              <div>
                <button type="button" onClick={requestClose} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className={styles.primary} disabled={!canSave}>
                  {busy ? "Saving…" : "Save properties"}
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
        title="Discard unsaved Note properties?"
        description="The Areas, Subjects, or legacy project labels in this sheet have not been saved."
        consequences={[
          "The stored Note will remain unchanged.",
          "This property draft cannot be recovered after closing."
        ]}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        className={styles.discardConfirmation}
      />
    </>
  );
}
