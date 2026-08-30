"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createProjectsRepository } from "../../lib/modules/projects/repository";
import type {
  ProjectLinkRelationship,
  ProjectLinkStrength,
  ProjectsState
} from "../../lib/modules/projects/types";
import { getModuleRoute } from "../../lib/native-objects/routes";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import ConfirmationSheet from "./ConfirmationSheet";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./ProjectAssociationSheet.module.css";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

const RELATIONSHIP_OPTIONS: ReadonlyArray<{
  value: ProjectLinkRelationship;
  label: string;
}> = [
  { value: "source_material", label: "Source material" },
  { value: "evidence", label: "Evidence" },
  { value: "launch_proof", label: "Launch proof" },
  { value: "supporting_context", label: "Supporting context" },
  { value: "background_reference", label: "Background reference" },
  { value: "review_input", label: "Review input" },
  { value: "decision_support", label: "Decision support" },
  { value: "blocker_evidence", label: "Blocker evidence" }
];

type ProjectAssociationDraft = {
  projectId: string;
  relationship: ProjectLinkRelationship;
  relationshipStrength: ProjectLinkStrength;
  isRequiredEvidence: boolean;
  projectSpecificNote: string;
};

type ProjectAssociationSheetProps = {
  open: boolean;
  source: NativeObjectRef;
  sourceKind: "Resource" | "Media asset";
  state: ProjectsState;
  loading: boolean;
  error: string;
  defaultRelationship?: ProjectLinkRelationship;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  onLinked?: () => void;
};

function draftFor(relationship: ProjectLinkRelationship): ProjectAssociationDraft {
  return {
    projectId: "",
    relationship,
    relationshipStrength: "normal",
    isRequiredEvidence: false,
    projectSpecificNote: ""
  };
}

function draftsEqual(left: ProjectAssociationDraft, right: ProjectAssociationDraft) {
  return (
    left.projectId === right.projectId &&
    left.relationship === right.relationship &&
    left.relationshipStrength === right.relationshipStrength &&
    left.isRequiredEvidence === right.isRequiredEvidence &&
    left.projectSpecificNote === right.projectSpecificNote
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function sameSource(left: NativeObjectRef, right: NativeObjectRef) {
  return (
    left.module === right.module &&
    left.objectType === right.objectType &&
    left.objectId === right.objectId &&
    (left.containerObjectId || "") === (right.containerObjectId || "")
  );
}

export default function ProjectAssociationSheet({
  open,
  source,
  sourceKind,
  state,
  loading,
  error: projectsError,
  defaultRelationship = "supporting_context",
  onRefresh,
  onClose,
  onLinked
}: ProjectAssociationSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const discardOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const repository = useMemo(() => createProjectsRepository(), []);
  const initialDraft = useMemo(() => draftFor(defaultRelationship), [defaultRelationship]);
  const [draft, setDraft] = useState(initialDraft);
  const [baseline, setBaseline] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirty = !draftsEqual(draft, baseline);
  const linkableProjects = useMemo(
    () =>
      state.projects
        .filter((project) => !["complete", "archived"].includes(project.lifecycle))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [state.projects]
  );
  const existingLink = useMemo(
    () =>
      state.links.find(
        (link) =>
          link.linkState !== "removed" &&
          link.projectId === draft.projectId &&
          link.relationship === draft.relationship &&
          sameSource(link.source, source)
      ) || null,
    [draft.projectId, draft.relationship, source, state.links]
  );

  busyRef.current = busy;
  dirtyRef.current = dirty;
  discardOpenRef.current = discardOpen;
  onCloseRef.current = onClose;

  useEffect(() => {
    const next = draftFor(defaultRelationship);
    setDraft(next);
    setBaseline(next);
    setError("");
    setNotice("");
  }, [defaultRelationship, source.module, source.objectType, source.objectId, source.containerObjectId]);

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
    window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("select, button")?.focus();
    }, 0);
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
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const project = linkableProjects.find((candidate) => candidate.id === draft.projectId);
    if (!project) {
      setError("Choose an active, planned, or draft Project before creating this association.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    const result = await repository.create("links", {
      projectId: project.id,
      source,
      relationship: draft.relationship,
      relationshipStrength: draft.relationshipStrength,
      isRequiredEvidence: draft.isRequiredEvidence,
      projectSpecificNote: draft.projectSpecificNote.trim() || undefined
    });

    if (!result.ok) {
      setBusy(false);
      setError(`${result.error.message} Your Project-association draft was preserved.`);
      return;
    }

    setBaseline(draft);
    setNotice(
      result.data.created
        ? `Linked this ${sourceKind.toLowerCase()} to ${result.data.project.name}. Projects now owns the association and its lifecycle.`
        : `This exact ${labelize(result.data.item.relationship)} association already exists in ${result.data.project.name}; no duplicate was created.`
    );
    await onRefresh();
    onLinked?.();
    setBusy(false);
  }

  if (!open) return null;

  return (
    <>
      <div
        className={styles.backdrop}
        data-project-association={`${source.module}:${source.objectType}:${source.objectId}`}
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
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            <header className={styles.header}>
              <div>
                <span className={styles.eyebrow}>{sourceKind} → Projects</span>
                <h2 id={titleId}>Associate with a Project</h2>
                <p id={descriptionId}>
                  Create one typed, protected ProjectLink to {source.label}. The source object stays
                  in {sourceKind === "Resource" ? "Resources" : "Media"}.
                </p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Close Project association"
                onClick={requestClose}
                disabled={busy}
              >
                <UnigentamosIcon role="close" size={18} />
              </button>
            </header>

            <div className={styles.body}>
              {projectsError && (
                <div className={styles.error} role="alert">
                  <strong>Projects state may be incomplete</strong>
                  <span>{projectsError}</span>
                  <button type="button" onClick={() => void onRefresh()} disabled={loading}>
                    {loading ? "Refreshing…" : "Refresh Projects"}
                  </button>
                </div>
              )}

              {error && (
                <div className={styles.error} role="alert">
                  <strong>Association was not saved</strong>
                  <span>{error}</span>
                </div>
              )}

              {notice && (
                <div className={styles.success} role="status">
                  <strong>Project association available</strong>
                  <span>{notice}</span>
                </div>
              )}

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h3>Relationship</h3>
                    <p>Describe how this source supports the destination Project.</p>
                  </div>
                  <span className={styles.required}>Projects-owned write</span>
                </div>

                <label className={styles.field}>
                  Destination Project
                  <select
                    aria-label="Destination Project"
                    value={draft.projectId}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, projectId: event.target.value }));
                      setError("");
                      setNotice("");
                    }}
                    disabled={busy || loading || !linkableProjects.length}
                    required
                  >
                    <option value="">Choose a Project</option>
                    {linkableProjects.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.name} · {labelize(project.lifecycle)}
                      </option>
                    ))}
                  </select>
                  <small>
                    Completed and archived Projects stay readable but cannot receive new links.
                  </small>
                </label>

                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    Relationship
                    <select
                      aria-label="Project relationship"
                      value={draft.relationship}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          relationship: event.target.value as ProjectLinkRelationship
                        }));
                        setError("");
                        setNotice("");
                      }}
                      disabled={busy}
                    >
                      {RELATIONSHIP_OPTIONS.map((relationship) => (
                        <option value={relationship.value} key={relationship.value}>
                          {relationship.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    Relationship strength
                    <select
                      aria-label="Relationship strength"
                      value={draft.relationshipStrength}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          relationshipStrength: event.target.value as ProjectLinkStrength
                        }))
                      }
                      disabled={busy}
                    >
                      <option value="weak">Weak</option>
                      <option value="normal">Normal</option>
                      <option value="strong">Strong</option>
                    </select>
                  </label>
                </div>

                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={draft.isRequiredEvidence}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        isRequiredEvidence: event.target.checked
                      }))
                    }
                    disabled={busy}
                  />
                  <span>
                    <strong>Required evidence</strong>
                    <small>The Project should not treat this source as optional context.</small>
                  </span>
                </label>

                <label className={styles.field}>
                  Project-specific context
                  <textarea
                    aria-label="Project-specific context"
                    value={draft.projectSpecificNote}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        projectSpecificNote: event.target.value
                      }))
                    }
                    placeholder={`Why this ${sourceKind.toLowerCase()} matters to this Project. This text belongs to the ProjectLink.`}
                    disabled={busy}
                  />
                </label>
              </section>

              {existingLink && (
                <div className={styles.existing}>
                  <strong>Exact association already present</strong>
                  <span>
                    This Project already has a {labelize(existingLink.relationship)} link to this{" "}
                    {sourceKind.toLowerCase()}. Submitting verifies the idempotent owner record
                    instead of creating a duplicate.
                  </span>
                </div>
              )}

              {!linkableProjects.length && (
                <div className={styles.empty}>
                  <strong>{projectsError ? "Projects are unavailable" : "No linkable native Projects"}</strong>
                  <span>
                    {projectsError ||
                      "Create or promote a Project before making this association."}
                  </span>
                </div>
              )}

              <div className={styles.boundary}>
                <strong>Ownership boundary</strong>
                <p>
                  This action writes only a Projects-owned ProjectLink through the existing
                  protected API. It does not change {source.label}, convert legacy labels, confirm
                  Media usage or rights, or create a duplicate source record.
                </p>
              </div>
            </div>

            <footer className={styles.actions}>
              <Link href={getModuleRoute("projects")}>Open Projects</Link>
              <div>
                <button type="button" onClick={requestClose} disabled={busy}>
                  Close
                </button>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={busy || loading || !draft.projectId || !linkableProjects.length}
                >
                  {busy ? "Associating…" : existingLink ? "Verify association" : "Create association"}
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
        title="Discard this Project-association draft?"
        description="The selected Project, relationship, evidence setting, and context have not been saved."
        consequences={[
          `The ${sourceKind.toLowerCase()} will remain unchanged.`,
          "No ProjectLink or audit event will be created."
        ]}
        confirmLabel="Discard draft"
        cancelLabel="Keep editing"
        tone="danger"
        className={styles.discardConfirmation}
      />
    </>
  );
}
