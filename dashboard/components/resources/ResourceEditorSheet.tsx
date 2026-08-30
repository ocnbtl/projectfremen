"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { getNativeObjectRoute } from "../../lib/native-objects/routes";
import { createResourcesRepository } from "../../lib/modules/resources/repository";
import { inspectResourceSourceValue } from "../../lib/modules/resources/source-evidence";
import type { ResourceRecord } from "../../lib/modules/resources/types";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import { STYLE_GUIDE_AREA } from "../../lib/modules/style-guide/component-resource";
import styles from "./ResourceEditorSheet.module.css";

type ResourceEditorSheetProps = {
  open: boolean;
  resource: ResourceRecord | null;
  resources: readonly ResourceRecord[];
  initialDraft?: Partial<ResourceEditorForm>;
  handoff?: {
    sourceModule: "Media";
    sourceId: string;
    sourceLabel: string;
  };
  onClose: () => void;
  onSaved: (resource: ResourceRecord, mode: "create" | "edit") => void;
};

type ResourceEditorForm = {
  title: string;
  url: string;
  body: string;
  collection: "reference" | "design-library" | "component";
};

const EMPTY_FORM: ResourceEditorForm = {
  title: "",
  url: "",
  body: "",
  collection: "reference"
};

const DESIGN_LIBRARY_AREA = "Design Library";

function collectionForResource(resource: ResourceRecord | null): ResourceEditorForm["collection"] {
  if (!resource) return "reference";
  if (resource.provenance.areas.some((area) => area.toLowerCase() === STYLE_GUIDE_AREA.toLowerCase())) return "component";
  if (resource.provenance.areas.some((area) => area.toLowerCase() === DESIGN_LIBRARY_AREA.toLowerCase())) return "design-library";
  return "reference";
}

function areasForCollection(resource: ResourceRecord | null, collection: ResourceEditorForm["collection"]) {
  const retained = (resource?.provenance.areas || []).filter((area) => {
    const normalized = area.toLowerCase();
    return normalized !== STYLE_GUIDE_AREA.toLowerCase() && normalized !== DESIGN_LIBRARY_AREA.toLowerCase();
  });
  if (collection === "component") return [...retained, STYLE_GUIDE_AREA];
  if (collection === "design-library") return [...retained, DESIGN_LIBRARY_AREA];
  return retained;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function formForResource(
  resource: ResourceRecord | null,
  initialDraft?: Partial<ResourceEditorForm>
): ResourceEditorForm {
  if (!resource) {
    return {
      ...EMPTY_FORM,
      ...initialDraft
    };
  }
  return {
    title: resource.title,
    url: resource.provenance.rawUrl || resource.source.canonicalUrl || "",
    body: resource.body,
    collection: collectionForResource(resource)
  };
}

function formsEqual(left: ResourceEditorForm, right: ResourceEditorForm) {
  return (
    left.title === right.title &&
    left.url === right.url &&
    left.body === right.body &&
    left.collection === right.collection
  );
}

function sourceStateMessage(state: ReturnType<typeof inspectResourceSourceValue>["state"]) {
  if (state === "credentials_withheld") {
    return "Remove embedded usernames or passwords before saving this source.";
  }
  if (state === "unsupported_protocol") {
    return "Use an HTTP or HTTPS source. Other protocols are intentionally withheld.";
  }
  if (state === "invalid_url") {
    return "Enter a complete HTTP or HTTPS URL, including https://.";
  }
  return "URL syntax is accepted. Network health, redirects, and canonical identity are not checked.";
}

export default function ResourceEditorSheet({
  open,
  resource,
  resources,
  initialDraft,
  handoff,
  onClose,
  onSaved
}: ResourceEditorSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const discardOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [form, setForm] = useState<ResourceEditorForm>(() =>
    formForResource(resource, initialDraft)
  );
  const [baseline, setBaseline] = useState<ResourceEditorForm>(() =>
    resource ? formForResource(resource) : EMPTY_FORM
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const mode = resource ? "edit" : "create";
  const dirty = !formsEqual(form, baseline);
  const urlEditable = !handoff && (!resource || Boolean(resource.source.canonicalUrl));
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

  const sourceEvidence = useMemo(
    () =>
      inspectResourceSourceValue({
        value: form.url,
        provenance: "legacy_record_url",
        evidenceField: "url"
      }),
    [form.url]
  );

  const exactMatches = useMemo(() => {
    if (!sourceEvidence.matchKey) return [];
    return resources.filter(
      (candidate) =>
        candidate.id !== resource?.id &&
        candidate.source.candidates.some(
          (sourceCandidate) => sourceCandidate.matchKey === sourceEvidence.matchKey
        )
    );
  }, [resource?.id, resources, sourceEvidence.matchKey]);

  const titleValid = Boolean(form.title.trim());
  const urlRequired = form.collection !== "component";
  const urlValid =
    resource && !urlEditable
      ? true
      : !form.url.trim()
        ? !urlRequired
        : sourceEvidence.state === "syntax_accepted";
  const canSave = dirty && titleValid && urlValid && exactMatches.length === 0 && !busy;

  function updateField<Field extends keyof ResourceEditorForm>(field: Field, value: ResourceEditorForm[Field]) {
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

    const repository = createResourcesRepository();
    const input = {
      title: form.title.trim(),
      body: form.body.trim(),
      areas: areasForCollection(resource, form.collection)
    };
    const result = resource
      ? await repository.update(resource.id, {
          ...input,
          ...(urlEditable
            ? { url: sourceEvidence.navigationUrl || form.url.trim() }
            : {})
        })
      : await repository.create({
          ...input,
          url: sourceEvidence.navigationUrl || form.url.trim()
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
    onSaved(result.data, mode);
  }

  if (!open) return null;

  return (
    <>
      <div
        className={styles.backdrop}
        data-resource-editor={mode}
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
                <span className={styles.eyebrow}>
                  {handoff
                    ? "Media → Resources handoff"
                    : mode === "create"
                      ? "New Resource"
                      : "Edit Resource"}
                </span>
                <h2 id={titleId}>
                  {handoff
                    ? "Create Resource from Media"
                    : mode === "create"
                      ? "Add Resource"
                      : resource?.title}
                </h2>
                <p id={descriptionId}>
                  {handoff
                    ? "Create one Resources-owned external source while the Media asset and its pending relationship remain unchanged."
                    : "Keep the source and the context you will need later."}
                </p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={requestClose}
                disabled={busy}
                aria-label="Close Resource editor"
              >
                <UnigentamosIcon role="close" size={20} />
              </button>
            </header>

            <div className={styles.body}>
              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div><h3>Details</h3></div>
                  <span className={styles.required}>Title required</span>
                </div>

                <div className={styles.compactGrid}>
                  <label className={styles.field}>
                    <span>Resource title</span>
                    <input
                      data-autofocus="true"
                      autoFocus
                      type="text"
                      value={form.title}
                      onChange={(event) => updateField("title", event.target.value)}
                      placeholder="A title you will recognize"
                      aria-invalid={Boolean(form.title) && !titleValid}
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Collection</span>
                    <select aria-label="Collection" value={form.collection} onChange={(event) => updateField("collection", event.target.value as ResourceEditorForm["collection"])}>
                      <option value="reference">Reference</option>
                      <option value="design-library">Design library</option>
                      <option value="component">Component</option>
                    </select>
                  </label>
                </div>

                <label className={styles.field}>
                  <span>Source URL{urlRequired ? "" : " · optional"}</span>
                  <input
                    type={urlEditable || handoff ? "url" : "text"}
                    inputMode="url"
                    autoComplete="url"
                    value={form.url}
                    onChange={(event) => updateField("url", event.target.value)}
                    placeholder={
                      urlEditable
                        ? "https://example.com/source"
                        : "Stored URL is missing or withheld"
                    }
                    aria-invalid={urlEditable && Boolean(form.url.trim()) && !urlValid}
                    aria-describedby={`${descriptionId}-url-state`}
                    required={urlEditable && urlRequired}
                    disabled={!urlEditable}
                  />
                  <small
                    id={`${descriptionId}-url-state`}
                    data-tone={
                      !form.url.trim()
                        ? "muted"
                        : sourceEvidence.state === "syntax_accepted"
                          ? "positive"
                          : "attention"
                    }
                  >
                    {!urlEditable
                      ? handoff
                        ? "This accepted Media candidate is fixed for the handoff so the new Resource keeps the exact source identity."
                        : "The adapter cannot safely expose this stored value. Title and context can still be edited without replacing or deleting it."
                      : form.url.trim()
                      ? sourceStateMessage(sourceEvidence.state)
                      : urlRequired ? "Enter a complete HTTP or HTTPS URL." : "Add a URL when this component has an external reference."}
                  </small>
                </label>

                {exactMatches.length > 0 && (
                  <div className={styles.duplicate} role="alert">
                    <strong>Exact URL already saved</strong>
                    <p>
                      Creation or reassignment is paused to prevent duplicate Resource identity.
                      Open the existing record before deciding what to retain.
                    </p>
                    <ul>
                      {exactMatches.map((match) => (
                        <li key={match.id}>
                          <span>{match.title}</span>
                          <Link
                            href={getNativeObjectRoute(match.nativeRef)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open existing ↗
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <label className={styles.field}>
                  <span>Context</span>
                  <textarea
                    rows={4}
                    aria-label="Source context"
                    value={form.body}
                    onChange={(event) => updateField("body", event.target.value)}
                    placeholder="Why this source matters, what it supports, or what to revisit."
                  />
                </label>
              </section>

              {handoff && (
                <section className={styles.section} aria-label="Media handoff boundary">
                  <div className={styles.sectionHeading}>
                    <div>
                      <h3>Origin and ownership</h3>
                      <p>
                        The external source becomes a Resource; the file record remains Media-owned.
                      </p>
                    </div>
                    <span className={styles.required}>Explicit handoff</span>
                  </div>
                  <div className={styles.boundaryRows}>
                    <div>
                      <span>Source module</span>
                      <strong>{handoff.sourceModule}</strong>
                    </div>
                    <div>
                      <span>Media asset</span>
                      <strong>{handoff.sourceLabel}</strong>
                    </div>
                    <div>
                      <span>Media ID</span>
                      <strong>{handoff.sourceId}</strong>
                    </div>
                    <div>
                      <span>Relationship after create</span>
                      <strong>Exact URL candidate · native link pending</strong>
                    </div>
                  </div>
                </section>
              )}

              {resource && urlEditable && form.url.trim() !== baseline.url.trim() && (
                <section className={styles.diff} aria-label="Source identity change preview">
                  <span>Identity-sensitive change</span>
                  <dl>
                    <div>
                      <dt>Stored</dt>
                      <dd>{baseline.url || "No URL"}</dd>
                    </div>
                    <div>
                      <dt>Proposed</dt>
                      <dd>{form.url || "No URL"}</dd>
                    </div>
                  </dl>
                </section>
              )}

              {error && (
                <div className={styles.error} role="alert">
                  <strong>Resource was not saved</strong>
                  <span>{error}</span>
                  <small>Your input is still here. Review it and try again.</small>
                </div>
              )}
            </div>

            <footer className={styles.actions}>
              <span aria-live="polite">
                {busy ? "Saving Resource…" : dirty ? "Unsaved changes" : "No unsaved changes"}
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
                    exactMatches.length
                      ? "Open the existing Resource before creating or reassigning this exact URL."
                      : !titleValid || !urlValid
                        ? "A title and accepted HTTP or HTTPS URL are required."
                        : !dirty
                          ? "No changes to save."
                          : undefined
                  }
                >
                  {busy ? "Saving…" : mode === "create" ? "Add Resource" : "Save changes"}
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
        title="Discard unsaved Resource changes?"
        description="The title, URL, and context in this sheet have not been saved."
        consequences={["The stored Resource will remain unchanged.", "This draft cannot be recovered after closing."]}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        className={styles.discardConfirmation}
      />
    </>
  );
}
