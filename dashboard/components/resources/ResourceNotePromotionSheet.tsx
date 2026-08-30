"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { createNotesRepository } from "../../lib/modules/notes/repository";
import { createNoteLinksRepository } from "../../lib/modules/notes/links-repository";
import { noteLinkOwnerRoute, type NoteLink } from "../../lib/modules/notes/links-types";
import type { NoteRecord } from "../../lib/modules/notes/types";
import {
  buildNoteSourceAttachment,
  buildResourceNoteDraftInput,
  defaultResourceNoteTitle,
  noteHasResourceSource,
  resourceNoteSourceUrl
} from "../../lib/modules/resources/note-promotion";
import type { ResourceRecord } from "../../lib/modules/resources/types";
import { getNativeObjectRoute } from "../../lib/native-objects/routes";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import styles from "./ResourceEditorSheet.module.css";

type ResourceNotePromotionSheetProps = {
  open: boolean;
  resource: ResourceRecord;
  initialMode?: PromotionMode;
  onClose: () => void;
  onSaved: (note: NoteRecord, mode: PromotionMode) => void;
};

type PromotionMode = "create" | "existing";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function formatNoteStatus(note: NoteRecord) {
  return `${note.lifecycleStatus.replace(/_/g, " ")} · ${note.reviewState.replace(/_/g, " ")}`;
}

export default function ResourceNotePromotionSheet({
  open,
  resource,
  initialMode = "create",
  onClose,
  onSaved
}: ResourceNotePromotionSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const discardOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const repository = useMemo(() => createNotesRepository(), []);
  const noteLinksRepository = useMemo(() => createNoteLinksRepository(), []);
  const sourceUrl = resourceNoteSourceUrl(resource);
  const initialTitle = defaultResourceNoteTitle(resource);
  const [mode, setMode] = useState<PromotionMode>(initialMode);
  const [noteTitle, setNoteTitle] = useState(initialTitle);
  const [noteBody, setNoteBody] = useState("");
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [notesState, setNotesState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [notesError, setNotesError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState<NoteRecord | null>(null);
  const [savedMode, setSavedMode] = useState<PromotionMode | null>(null);
  const [savedLink, setSavedLink] = useState<NoteLink | null>(null);
  const [linkError, setLinkError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const selectedNote = notes.find((note) => note.id === selectedNoteId) || null;
  const selectedAlreadyAttached =
    Boolean(selectedNote && sourceUrl && noteHasResourceSource(selectedNote, sourceUrl));
  const dirty =
    !savedNote &&
    (mode === "create"
      ? noteTitle !== initialTitle || Boolean(noteBody)
      : Boolean(selectedNoteId));
  const titleValid = Boolean(noteTitle.trim());
  const canSave =
    Boolean(sourceUrl) &&
    !busy &&
    !savedNote &&
    (mode === "create"
      ? titleValid
      : Boolean(selectedNote));

  busyRef.current = busy;
  dirtyRef.current = dirty;
  discardOpenRef.current = discardOpen;
  onCloseRef.current = onClose;

  const visibleNotes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return notes
      .filter((note) =>
        !normalized ||
        `${note.title} ${note.body} ${note.id}`.toLowerCase().includes(normalized)
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [notes, query]);

  async function loadNotes() {
    setNotesState("loading");
    setNotesError("");
    const result = await repository.list();
    if (!result.ok) {
      setNotesState("error");
      setNotesError(result.error.message);
      return;
    }
    setNotes(result.data);
    setNotesState("ready");
  }

  useEffect(() => {
    if (!open || mode !== "existing" || notesState !== "idle") return;
    void loadNotes();
  }, [mode, notesState, open]);

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

  function requestClose() {
    if (busy) return;
    if (dirty) setDiscardOpen(true);
    else onClose();
  }

  function changeMode(nextMode: PromotionMode) {
    setMode(nextMode);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !sourceUrl) return;
    setBusy(true);
    setError("");

    const result =
      mode === "create"
        ? await repository.create(
            buildResourceNoteDraftInput(resource, {
              title: noteTitle,
              body: noteBody
            })!
          )
        : selectedAlreadyAttached
          ? { ok: true as const, data: selectedNote! }
          : await repository.update(
              selectedNote!.id,
              buildNoteSourceAttachment(selectedNote!, sourceUrl)!
            );

    if (!result.ok) {
      setBusy(false);
      setError(result.error.message);
      return;
    }

    setSavedNote(result.data);
    setSavedMode(mode);
    setNotes((current) => [
      result.data,
      ...current.filter((note) => note.id !== result.data.id)
    ]);
    const linkResult = await noteLinksRepository.create({
      noteRef: result.data.nativeRef,
      targetRef: resource.nativeRef,
      relationship: "source",
      contextNote: "Authored from or explicitly attached to this Resource source.",
      provenance: "resource_note_attach"
    });
    setBusy(false);
    if (!linkResult.ok) {
      setLinkError(`${linkResult.error.message} The Note and its saved source evidence were preserved; retry the Notes-owned relationship separately.`);
      onSaved(result.data, mode);
      return;
    }
    setSavedLink(linkResult.data.item);
    setLinkError("");
    onSaved(result.data, mode);
  }

  if (!open) return null;

  return (
    <>
      <div
        className={styles.backdrop}
        data-resource-note-promotion={mode}
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
                <span className={styles.eyebrow}>Resource → Notes</span>
                <h2 id={titleId}>Create authored follow-up</h2>
                <p id={descriptionId}>
                  Keep the external source in Resources and save your interpretation in Notes.
                </p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={requestClose}
                disabled={busy}
                aria-label="Close Note draft workflow"
              >
                <UnigentamosIcon role="close" size={20} />
              </button>
            </header>

            <div className={styles.body}>
              {savedNote && savedMode ? (
                <section className={`${styles.section} ${styles.successState}`} role="status">
                  <span className={styles.successMark} aria-hidden="true">✓</span>
                  <div>
                    <h3>
                      {savedMode === "create"
                        ? "Note draft created"
                        : "Source evidence attached"}
                    </h3>
                    <p>
                      <strong>{savedNote.title}</strong> now carries this Resource URL as legacy
                      source evidence. {savedLink ? "A Notes-owned source relationship is also connected." : "The Resource remains unchanged."}
                    </p>
                    {linkError && <p className={styles.error} role="alert">{linkError}</p>}
                  </div>
                  <dl className={styles.successFacts}>
                    <div><dt>Note lifecycle</dt><dd>{savedNote.lifecycleStatus}</dd></div>
                    <div><dt>Source evidence</dt><dd>1 Resource URL saved</dd></div>
                    <div><dt>Native NoteLink</dt><dd>{savedLink ? "Connected" : "Needs retry"}</dd></div>
                    <div><dt>Native citation</dt><dd>Not created</dd></div>
                    <div><dt>Resource</dt><dd>Preserved</dd></div>
                  </dl>
                  <div className={styles.successActions}>
                    <Link
                      className={styles.primaryLink}
                      href={savedLink ? noteLinkOwnerRoute(savedLink) : getNativeObjectRoute(savedNote.nativeRef)}
                    >
                      {savedLink ? "Open NoteLink" : "Open Note"}
                    </Link>
                    {!savedLink && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setLinkError("");
                          const retry = await noteLinksRepository.create({
                            noteRef: savedNote.nativeRef,
                            targetRef: resource.nativeRef,
                            relationship: "source",
                            contextNote: "Authored from or explicitly attached to this Resource source.",
                            provenance: "resource_note_attach"
                          });
                          setBusy(false);
                          if (!retry.ok) {
                            setLinkError(`${retry.error.message} The saved Note was preserved.`);
                            return;
                          }
                          setSavedLink(retry.data.item);
                          onSaved(savedNote, savedMode);
                        }}
                      >
                        {busy ? "Retrying..." : "Retry NoteLink"}
                      </button>
                    )}
                    <button type="button" onClick={onClose}>Stay on Resource</button>
                  </div>
                </section>
              ) : (
                <>
                  <section className={styles.section}>
                    <div className={styles.sectionHeading}>
                      <div>
                        <h3>Choose the Notes action</h3>
                        <p>Both paths preserve the source and require an explicit save.</p>
                      </div>
                    </div>
                    <div className={styles.modeToggle} role="group" aria-label="Notes action">
                      <button
                        type="button"
                        data-active={mode === "create" || undefined}
                        aria-pressed={mode === "create"}
                        onClick={() => changeMode("create")}
                      >
                        <strong>New Note draft</strong>
                        <span>Start clean authored context</span>
                      </button>
                      <button
                        type="button"
                        data-active={mode === "existing" || undefined}
                        aria-pressed={mode === "existing"}
                        onClick={() => changeMode("existing")}
                      >
                        <strong>Existing Note</strong>
                        <span>Attach source evidence only</span>
                      </button>
                    </div>
                  </section>

                  <section className={styles.section}>
                    {mode === "create" ? (
                      <>
                        <div className={styles.sectionHeading}>
                          <div>
                            <h3>Draft authored knowledge</h3>
                            <p>The Resource body is not copied. Write only what you mean to own as a Note.</p>
                          </div>
                          <span className={styles.required}>Draft</span>
                        </div>
                        <label className={styles.field}>
                          <span>Note title</span>
                          <input
                            data-autofocus="true"
                            autoFocus
                            type="text"
                            value={noteTitle}
                            onChange={(event) => {
                              setNoteTitle(event.target.value);
                              setError("");
                            }}
                            aria-invalid={!titleValid}
                            required
                          />
                        </label>
                        <label className={styles.field}>
                          <span>Authored body</span>
                          <textarea
                            rows={8}
                            value={noteBody}
                            onChange={(event) => {
                              setNoteBody(event.target.value);
                              setError("");
                            }}
                            placeholder="What does this source mean, support, challenge, or prompt you to do?"
                          />
                          <small data-tone="muted">
                            Empty is allowed. You can continue writing from the created Note.
                          </small>
                        </label>
                      </>
                    ) : (
                      <>
                        <div className={styles.sectionHeading}>
                          <div>
                            <h3>Select one existing Note</h3>
                            <p>Its title, body, lifecycle, and review state will not be rewritten.</p>
                          </div>
                        </div>
                        <label className={styles.field}>
                          <span>Search Notes</span>
                          <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search title, body, or Note ID"
                          />
                        </label>
                        {notesState === "loading" || notesState === "idle" ? (
                          <div className={styles.noteLoading} role="status">
                            Loading Notes…
                          </div>
                        ) : notesState === "error" ? (
                          <div className={styles.error} role="alert">
                            <strong>Notes could not be loaded</strong>
                            <span>{notesError}</span>
                            <button type="button" onClick={() => void loadNotes()}>Try again</button>
                          </div>
                        ) : visibleNotes.length ? (
                          <ul className={styles.noteChoices} aria-label="Existing Notes">
                            {visibleNotes.map((note) => {
                              const attached = Boolean(
                                sourceUrl && noteHasResourceSource(note, sourceUrl)
                              );
                              const selected = selectedNoteId === note.id;
                              return (
                                <li key={note.id}>
                                  <button
                                    type="button"
                                    data-selected={selected || undefined}
                                    aria-pressed={selected}
                                    onClick={() => {
                                      setSelectedNoteId(note.id);
                                      setError("");
                                    }}
                                  >
                                    <span>
                                      <strong>{note.title}</strong>
                                      <small>{formatNoteStatus(note)}</small>
                                    </span>
                                    <em>{attached ? "Already attached" : "Available"}</em>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <div className={styles.noteLoading} role="status">
                            No Notes match this search.
                          </div>
                        )}

                        {selectedNote && (
                          <div className={styles.diff} aria-label="Existing Note change preview">
                            <span>Exact mutation preview</span>
                            <dl>
                              <div><dt>Note</dt><dd>{selectedNote.title}</dd></div>
                              <div><dt>Add</dt><dd>{sourceUrl || "No safe Resource URL"}</dd></div>
                              <div><dt>Preserve</dt><dd>Title · body · lifecycle · review state</dd></div>
                            </dl>
                            {selectedAlreadyAttached && (
                              <p className={styles.inlineNotice}>
                                This exact normalized URL is already attached. No duplicate write is needed.
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  <section className={styles.boundary}>
                    <strong>What this save does</strong>
                    <p>
                      Creates one private draft Note or appends one Resource URL to an existing
                      Note through the protected Personal Records adapter.
                    </p>
                    <strong>What remains explicit</strong>
                    <p>
                      This URL is legacy source evidence—not a native citation, extraction anchor,
                      ResourceNoteLink, fetched snapshot, or proof that the Note used the source.
                    </p>
                    <strong>Source retained</strong>
                    <p className={styles.monoValue}>{sourceUrl || "No safe HTTP(S) source is available."}</p>
                  </section>

                  {!sourceUrl && (
                    <div className={styles.error} role="alert">
                      <strong>A safe Resource source is required</strong>
                      <span>Add or repair an HTTP(S) source URL before creating Note evidence.</span>
                    </div>
                  )}

                  {error && (
                    <div className={styles.error} role="alert">
                      <strong>Note was not saved</strong>
                      <span>{error}</span>
                      <small>Your title, body, search, and selection are still here. Try again.</small>
                    </div>
                  )}
                </>
              )}
            </div>

            {!savedNote && (
              <footer className={styles.actions}>
                <span aria-live="polite">
                  {busy
                    ? "Saving Note…"
                    : dirty
                      ? "Unsaved choice or changes"
                      : "No unsaved changes"}
                </span>
                <div>
                  <button type="button" onClick={requestClose} disabled={busy}>Cancel</button>
                  <button
                    type="submit"
                    className={styles.primary}
                    disabled={!canSave}
                    title={
                      !sourceUrl
                        ? "A safe HTTP(S) Resource URL is required."
                        : mode === "create" && !titleValid
                          ? "A Note title is required."
                          : selectedAlreadyAttached
                            ? "Source evidence is already attached; submit to verify the exact NoteLink."
                            : mode === "existing" && !selectedNote
                              ? "Select one existing Note."
                              : undefined
                    }
                  >
                    {busy
                      ? "Saving…"
                      : mode === "create"
                        ? "Create Note draft"
                        : "Attach source evidence"}
                  </button>
                </div>
              </footer>
            )}
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
        title="Discard this Notes handoff?"
        description="The authored draft or selected existing Note has not been saved."
        consequences={[
          "The Resource and all Notes will remain unchanged.",
          "The current draft or selection cannot be recovered after closing."
        ]}
        confirmLabel="Discard handoff"
        cancelLabel="Keep editing"
        tone="danger"
        className={styles.discardConfirmation}
      />
    </>
  );
}
