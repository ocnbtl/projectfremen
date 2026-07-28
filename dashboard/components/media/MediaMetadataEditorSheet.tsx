"use client";

import type { FormEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createMediaRepository } from "../../lib/modules/media/repository";
import type { MediaAsset } from "../../lib/modules/media/types";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import styles from "../resources/ResourceEditorSheet.module.css";

type MediaMetadataEditorSheetProps = {
  open: boolean;
  asset: MediaAsset;
  onClose: () => void;
  onSaved: (asset: MediaAsset) => void;
};

type MediaMetadataForm = {
  title: string;
  description: string;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function formForAsset(asset: MediaAsset): MediaMetadataForm {
  return {
    title: asset.title,
    description: asset.body
  };
}

function formsEqual(left: MediaMetadataForm, right: MediaMetadataForm) {
  return left.title === right.title && left.description === right.description;
}

export default function MediaMetadataEditorSheet({
  open,
  asset,
  onClose,
  onSaved
}: MediaMetadataEditorSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const discardOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [form, setForm] = useState<MediaMetadataForm>(() => formForAsset(asset));
  const [baseline, setBaseline] = useState<MediaMetadataForm>(() => formForAsset(asset));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirty = !formsEqual(form, baseline);
  const titleValid = Boolean(form.title.trim());
  const canSave = dirty && titleValid && !busy;
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

  function updateField(field: keyof MediaMetadataForm, value: string) {
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

    const result = await createMediaRepository().update(asset.id, {
      title: form.title.trim(),
      description: form.description.trim()
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

  if (!open) return null;

  return (
    <>
      <div
        className={styles.backdrop}
        data-media-metadata-editor="true"
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
                <span className={styles.eyebrow}>Legacy-backed Media metadata</span>
                <h2 id={titleId}>{asset.title}</h2>
                <p id={descriptionId}>
                  Edit only the title and description already owned by the retained file record.
                </p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={requestClose}
                disabled={busy}
                aria-label="Close Media metadata editor"
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
                  <strong>Media metadata was not saved</strong>
                  <span>{error}</span>
                  <small>Your title and description are still here. Review them and try again.</small>
                </div>
              )}

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h3>Asset identity and context</h3>
                    <p>
                      These fields describe the retained Media record. They do not change its
                      binary, source, rights, links, or review state.
                    </p>
                  </div>
                  <span className={styles.required}>Title required</span>
                </div>

                <label className={styles.field}>
                  <span>Asset title</span>
                  <input
                    data-autofocus="true"
                    autoFocus
                    type="text"
                    value={form.title}
                    onChange={(event) => updateField("title", event.target.value)}
                    placeholder="A title you will recognize"
                    aria-invalid={!titleValid}
                    maxLength={240}
                    required
                  />
                  <small data-tone="muted">
                    This remains the human-readable title for legacy Media ID {asset.id}.
                  </small>
                </label>

                <label className={styles.field}>
                  <span>Asset description</span>
                  <textarea
                    rows={8}
                    value={form.description}
                    onChange={(event) => updateField("description", event.target.value)}
                    placeholder="What this asset contains, why it matters, or how it should be used."
                  />
                  <small data-tone="muted">
                    Compact Media context belongs here. Long-form authored knowledge belongs in Notes.
                  </small>
                </label>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h3>Native metadata remains protected</h3>
                    <p>
                      Unconnected fields stay explicit and unchanged instead of being inferred from
                      the title, description, or legacy URL evidence.
                    </p>
                  </div>
                </div>
                <div className={styles.boundaryRows}>
                  <div>
                    <span>Binary and technical facts</span>
                    <strong>Not connected · no file bytes are read or uploaded</strong>
                  </div>
                  <div>
                    <span>Source and ownership</span>
                    <strong>Resources owns URLs · owner model unresolved</strong>
                  </div>
                  <div>
                    <span>Accessibility and rights</span>
                    <strong>Alt / OCR unavailable · rights need confirmation</strong>
                  </div>
                  <div>
                    <span>Lifecycle and review</span>
                    <strong>Native transitions remain read-only</strong>
                  </div>
                </div>
              </section>

              <section className={styles.boundary}>
                <strong>What this save does</strong>
                <p>
                  Persists the title and asset description through the existing protected Personal
                  Records route. The existing record ID, ownership class, source evidence, links, and
                  history remain intact, and the route appends its current update audit event.
                </p>
                <strong>Still intentionally unavailable</strong>
                <p>
                  File upload and download, filename, MIME, checksum, type, source confirmation,
                  owner or creator, alt text, OCR, transcript, rights, review completion, archive,
                  versions, derivatives, replacement, native links, and usage mutations.
                </p>
              </section>

            </div>

            <footer className={styles.actions}>
              <span aria-live="polite">
                {busy ? "Saving Media metadata…" : dirty ? "Unsaved changes" : "No unsaved changes"}
              </span>
              <div>
                <button type="button" onClick={requestClose} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={!canSave}
                  title={
                    !titleValid
                      ? "An asset title is required."
                      : !dirty
                        ? "No changes to save."
                        : undefined
                  }
                >
                  {busy ? "Saving…" : "Save metadata"}
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
        title="Discard unsaved Media changes?"
        description="The title and description in this sheet have not been saved."
        consequences={[
          "The stored Media record will remain unchanged.",
          "This editor draft cannot be recovered after closing."
        ]}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        className={styles.discardConfirmation}
      />
    </>
  );
}
