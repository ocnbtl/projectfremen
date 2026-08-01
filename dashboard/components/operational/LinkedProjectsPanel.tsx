"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSourceProjectConnections } from "../../lib/modules/projects/people-links";
import { createProjectsRepository } from "../../lib/modules/projects/repository";
import type { ProjectLink, ProjectsState } from "../../lib/modules/projects/types";
import { createNativeObjectRef, getModuleRoute } from "../../lib/native-objects/routes";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import ConfirmationSheet from "./ConfirmationSheet";
import styles from "./LinkedProjectsPanel.module.css";

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

type LinkedProjectsPanelProps = {
  personId?: string;
  personLabel?: string;
  objectType?: "person" | "organization";
  source?: NativeObjectRef;
  sourceLabel?: string;
  state: ProjectsState;
  loading: boolean;
  error: string;
  onRefresh: () => void | Promise<void>;
  legacyProjectLabels?: string[];
  limit?: number;
  compact?: boolean;
  manageLifecycle?: boolean;
  manageHealth?: boolean;
  showBoundary?: boolean;
  title?: string;
  ownerTab?: "people" | "notes-decisions" | "files-links";
  emptyDescription?: string;
  legacyLabel?: string;
  boundary?: string;
};

type PendingLifecycleAction = {
  kind: "remove" | "restore" | "report";
  link: ProjectLink;
  projectName: string;
};

function sameSource(left: NativeObjectRef, right: NativeObjectRef) {
  return (
    left.module === right.module &&
    left.objectType === right.objectType &&
    left.objectId === right.objectId &&
    (left.containerObjectId || "") === (right.containerObjectId || "")
  );
}

function sourceKind(reference: NativeObjectRef) {
  if (reference.module === "notes") return "Note";
  if (reference.module === "resources") return "Resource";
  if (reference.module === "media") return "Media asset";
  return "source object";
}

function projectReadOnlyReason(lifecycle: string, projectAvailable: boolean) {
  if (!projectAvailable) {
    return "The Project target is unavailable. Open Projects to repair or inspect the retained association.";
  }
  if (lifecycle === "complete") {
    return "Completed Projects keep their association history read-only.";
  }
  if (lifecycle === "archived") {
    return "Restore the Project before changing its associations.";
  }
  return "";
}

export default function LinkedProjectsPanel({
  personId,
  personLabel,
  objectType = "person",
  source,
  sourceLabel,
  state,
  loading,
  error,
  onRefresh,
  legacyProjectLabels = [],
  limit = 4,
  compact = false,
  manageLifecycle = false,
  manageHealth = false,
  showBoundary = true,
  title = "Project involvement",
  ownerTab,
  emptyDescription,
  legacyLabel = "Legacy profile tags, not stable links:",
  boundary
}: LinkedProjectsPanelProps) {
  const repository = useMemo(() => createProjectsRepository(), []);
  const sourceIdentity = source || (
    personId
      ? createNativeObjectRef({
          module: "people",
          objectType,
          objectId: personId,
          label: personLabel || sourceLabel || "People identity"
        })
      : null
  );
  const sourceKey = sourceIdentity
    ? [
        sourceIdentity.module,
        sourceIdentity.objectType,
        sourceIdentity.containerObjectId || "root",
        sourceIdentity.objectId
      ].join(":")
    : "unavailable";
  const [pendingAction, setPendingAction] = useState<PendingLifecycleAction | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [healthState, setHealthState] = useState<"stale" | "broken" | "missing">("stale");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [mutationNotice, setMutationNotice] = useState("");
  const managedLinks = useMemo(() => {
    if (!sourceIdentity || !manageLifecycle) return [];
    return state.links
      .filter((link) => sameSource(link.source, sourceIdentity))
      .map((link) => ({
        link,
        project: state.projects.find((project) => project.id === link.projectId) || null
      }))
      .sort((left, right) => {
        const removedDelta =
          Number(left.link.linkState === "removed") - Number(right.link.linkState === "removed");
        if (removedDelta) return removedDelta;
        const projectDelta = (left.project?.name || left.link.projectId).localeCompare(
          right.project?.name || right.link.projectId
        );
        if (projectDelta) return projectDelta;
        return right.link.updatedAt.localeCompare(left.link.updatedAt);
      });
  }, [manageLifecycle, sourceIdentity, state.links, state.projects]);

  useEffect(() => {
    setPendingAction(null);
    setActionReason("");
    setHealthState("stale");
    setMutationError("");
    setMutationNotice("");
  }, [sourceKey]);

  useEffect(() => {
    function refreshAfterHistoryNavigation() {
      void Promise.resolve(onRefresh());
    }
    function refreshAfterPageRestore(event: PageTransitionEvent) {
      if (event.persisted) refreshAfterHistoryNavigation();
    }
    window.addEventListener("popstate", refreshAfterHistoryNavigation);
    window.addEventListener("pageshow", refreshAfterPageRestore);
    return () => {
      window.removeEventListener("popstate", refreshAfterHistoryNavigation);
      window.removeEventListener("pageshow", refreshAfterPageRestore);
    };
  }, [onRefresh, sourceKey]);

  if (!sourceIdentity) return null;

  const displaySourceLabel = sourceLabel || personLabel || sourceIdentity.label;
  const displaySourceKind = sourceKind(sourceIdentity);
  const connections = getSourceProjectConnections(state, sourceIdentity, {
    includeOwner: sourceIdentity.module === "people"
  });
  const visible = connections.slice(0, limit);
  const activeCount = connections.filter((item) => item.lifecycle === "active").length;
  const destinationTab = ownerTab || (
    sourceIdentity.module === "people"
      ? "people"
      : sourceIdentity.module === "notes"
        ? "notes-decisions"
        : "files-links"
  );
  const activeManagedCount = managedLinks.filter((item) => item.link.linkState !== "removed").length;
  const removedManagedCount = managedLinks.length - activeManagedCount;

  function beginLifecycleAction(
    kind: PendingLifecycleAction["kind"],
    link: ProjectLink,
    projectName: string
  ) {
    setPendingAction({ kind, link, projectName });
    setActionReason(kind === "report" ? link.healthNote || "" : "");
    setHealthState(
      kind === "report" && ["stale", "broken", "missing"].includes(link.linkState)
        ? link.linkState as "stale" | "broken" | "missing"
        : "stale"
    );
    setMutationError("");
    setMutationNotice("");
  }

  async function confirmLifecycleAction() {
    if (!pendingAction || mutationBusy) return;
    const reason = actionReason.trim();
    if (["remove", "report"].includes(pendingAction.kind) && !reason) {
      setMutationError(
        pendingAction.kind === "remove"
          ? "Explain why this Project association should be removed."
          : "Explain why this Project association is stale, broken, or missing."
      );
      return;
    }

    setMutationBusy(true);
    setMutationError("");
    const result = await repository.update(
      "links",
      pendingAction.link.id,
      pendingAction.kind === "remove"
        ? { linkState: "removed", removalReason: reason }
        : pendingAction.kind === "report"
          ? { action: "update_link_health", linkState: healthState, healthReason: reason }
          : { linkState: "active" },
      pendingAction.link.updatedAt
    );
    if (!result.ok) {
      setMutationBusy(false);
      setMutationError(
        pendingAction.kind === "remove"
          ? `${result.error.message} Your unlink reason was preserved.`
          : pendingAction.kind === "report"
            ? `${result.error.message} Your health explanation was preserved.`
          : `${result.error.message} The removed association remains visible so you can retry.`
      );
      return;
    }

    const completedAction = pendingAction.kind;
    const completedProjectName = pendingAction.projectName;
    setPendingAction(null);
    setActionReason("");
    setMutationNotice(
      completedAction === "remove"
        ? `Removed the Projects-owned association to ${completedProjectName}. The ${displaySourceKind.toLowerCase()} was not deleted, and the association remains available to restore.`
        : completedAction === "report"
          ? `Marked the Projects-owned association to ${completedProjectName} as ${healthState}. It remains visible for repair or removal.`
          : `Restored the Projects-owned association to ${completedProjectName}.`
    );
    await Promise.resolve(onRefresh());
    setMutationBusy(false);
  }

  return (
    <>
      <section
        className={styles.panel}
        data-linked-projects={sourceKey}
        data-compact={compact || undefined}
        aria-live="polite"
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <span>Projects-owned references</span>
            <strong>{title}</strong>
          </div>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void onRefresh()}
            disabled={loading || mutationBusy}
            aria-label={
              sourceIdentity.module === "people"
                ? `Refresh Projects involvement for ${displaySourceLabel}`
                : `Refresh Projects associations for ${displaySourceLabel}`
            }
          >
            {loading ? "Refreshing…" : "Refresh status"}
          </button>
        </header>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {mutationNotice && <p className={styles.notice} role="status">{mutationNotice}</p>}

        {visible.length ? (
          <ul className={styles.list}>
            {visible.map((connection) => {
              const roles = [
                ...(connection.owner ? ["Project owner"] : []),
                ...connection.relationships.map(labelize)
              ];
              return (
                <li key={connection.projectId}>
                  <Link
                    href={`${connection.projectRef.route}?tab=${destinationTab}`}
                    className={styles.row}
                    data-project-id={connection.projectId}
                    data-project-state={connection.lifecycle}
                  >
                    <span className={styles.rowBody}>
                      <strong>{connection.name}</strong>
                      <small>
                        {roles.join(" · ")}
                        {connection.notes[0] ? ` · ${connection.notes[0]}` : ""}
                      </small>
                    </span>
                    <span className={styles.state}>{labelize(connection.lifecycle)}</span>
                    <small className={styles.ownerLink}>Open in Projects</small>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.empty}>
            {emptyDescription || (
              sourceIdentity.module === "people"
                ? "No active Project owner or typed project link references this People identity."
                : "No active typed Project association references this source object."
            )}
          </p>
        )}

        <div className={styles.summary}>
          <span>{sourceIdentity.module === "people"
            ? `${activeCount} active · ${connections.length} exact project ${connections.length === 1 ? "identity" : "identities"}`
            : `${activeCount} active · ${connections.length} exact Project ${connections.length === 1 ? "destination" : "destinations"}`
          }</span>
        </div>

        {manageLifecycle && managedLinks.length > 0 && (
          <section className={styles.lifecycleSection} aria-label="Project association lifecycle">
            <header className={styles.lifecycleHeader}>
              <div>
                <strong>Association lifecycle</strong>
                <span>
                  {activeManagedCount} current · {removedManagedCount} removed
                </span>
              </div>
              <small>Managed by Projects</small>
            </header>
            <ul className={styles.lifecycleList}>
              {managedLinks.map(({ link, project }) => {
                const projectName = project?.name || `Unavailable Project ${link.projectId}`;
                const readOnlyReason = projectReadOnlyReason(
                  project?.lifecycle || "missing",
                  Boolean(project)
                );
                const projectRoute = project
                  ? createNativeObjectRef({
                      module: "projects",
                      objectType: "project",
                      objectId: project.id,
                      label: project.name
                    }).route
                  : `${getModuleRoute("projects")}?query=${encodeURIComponent(link.projectId)}`;
                return (
                  <li
                    key={link.id}
                    className={styles.lifecycleRow}
                    data-project-lifecycle-project-id={link.projectId}
                    data-project-link-id={link.id}
                    data-project-link-relationship={link.relationship}
                    data-project-link-state={link.linkState}
                  >
                    <span className={styles.linkBody}>
                      <strong>{projectName}</strong>
                      <small>
                        {labelize(link.relationship)} · {labelize(link.relationshipStrength)}
                        {link.isRequiredEvidence ? " · Required evidence" : ""}
                      </small>
                      {link.projectSpecificNote && <span>{link.projectSpecificNote}</span>}
                      {link.healthNote && <span>{labelize(link.linkState)}: {link.healthNote}</span>}
                      {link.lastRepair && <span>Last repair: {link.lastRepair.reason}</span>}
                      {link.linkState === "removed" && link.removalReason && (
                        <span>Removed: {link.removalReason}</span>
                      )}
                    </span>
                    <span
                      className={styles.linkState}
                      data-state={project ? link.linkState : "broken"}
                    >
                      {project ? labelize(link.linkState) : "Target unavailable"}
                    </span>
                    <span className={styles.linkActions}>
                      <Link href={`${projectRoute}${project ? `?tab=${destinationTab}&item=${encodeURIComponent(link.id)}` : ""}`}>
                        {project && !["stale", "broken", "missing"].includes(link.linkState) ? "Open in Projects" : "Repair in Projects"}
                      </Link>
                      {manageHealth && link.linkState !== "removed" && (
                        <button
                          type="button"
                          disabled={Boolean(readOnlyReason) || mutationBusy}
                          title={readOnlyReason || undefined}
                          onClick={() => beginLifecycleAction("report", link, projectName)}
                        >
                          {["stale", "broken", "missing"].includes(link.linkState) ? "Update issue" : "Report issue"}
                        </button>
                      )}
                      <button
                        type="button"
                        className={link.linkState === "removed" ? styles.restoreAction : styles.removeAction}
                        disabled={Boolean(readOnlyReason) || mutationBusy}
                        title={readOnlyReason || undefined}
                        aria-label={`${link.linkState === "removed" ? "Restore" : "Remove"} ${labelize(link.relationship)} association ${link.linkState === "removed" ? "to" : "from"} ${projectName}`}
                        onClick={() =>
                          beginLifecycleAction(
                            link.linkState === "removed" ? "restore" : "remove",
                            link,
                            projectName
                          )
                        }
                      >
                        {link.linkState === "removed" ? "Restore link" : "Remove link"}
                      </button>
                    </span>
                    {readOnlyReason && <small className={styles.disabledReason}>{readOnlyReason}</small>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {legacyProjectLabels.length > 0 && (
          <div className={styles.legacy}>
            <span>{legacyLabel}</span>
            {legacyProjectLabels.map((label) => (
              <Link
                href={`${getModuleRoute("projects")}?query=${encodeURIComponent(label)}`}
                key={label}
              >
                {label}
              </Link>
            ))}
          </div>
        )}

        {showBoundary && (
          <p className={styles.boundary}>
            {boundary || (
              sourceIdentity.module === "people"
                ? "Project role and lifecycle are read from Projects. People retains identity, contact history, and relationship cadence."
                : "Projects owns association semantics and lifecycle. The source module keeps ownership of the linked object."
            )}
          </p>
        )}
      </section>

      <ConfirmationSheet
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open && !mutationBusy) {
            setPendingAction(null);
            setActionReason("");
            setHealthState("stale");
            setMutationError("");
          }
        }}
        title={
          pendingAction?.kind === "remove"
            ? "Remove this Project association?"
            : pendingAction?.kind === "report"
              ? "Report an association issue?"
              : "Restore this Project association?"
        }
        description={
          pendingAction
            ? `${labelize(pendingAction.link.relationship)} · ${pendingAction.projectName}`
            : undefined
        }
        consequences={
          pendingAction?.kind === "remove"
            ? [
                `The ${sourceKind(sourceIdentity).toLowerCase()} stays in ${labelize(sourceIdentity.module)} and is not deleted.`,
                "Projects records the unlink in its timeline and audit history.",
                "The removed association stays visible here so it can be restored."
              ]
            : pendingAction?.kind === "report"
              ? [
                  "The Projects-owned association remains visible with your explanation.",
                  "Broken and missing states route repair to the Projects owner surface.",
                  `The ${sourceKind(sourceIdentity).toLowerCase()} is not changed or deleted.`
                ]
              : [
                "The exact existing Projects-owned association returns to its state from before removal.",
                `No duplicate ${sourceKind(sourceIdentity).toLowerCase()} or Project is created.`
              ]
        }
        confirmLabel={pendingAction?.kind === "remove" ? "Remove association" : pendingAction?.kind === "report" ? "Save issue" : "Restore association"}
        tone={pendingAction?.kind === "remove" ? "danger" : "default"}
        busy={mutationBusy}
        confirmDisabled={["remove", "report"].includes(pendingAction?.kind || "") && !actionReason.trim()}
        confirmDisabledReason={
          ["remove", "report"].includes(pendingAction?.kind || "") && !actionReason.trim()
            ? pendingAction?.kind === "remove"
              ? "Add an unlink reason before removing the association."
              : "Add a health explanation before saving the issue."
            : undefined
        }
        dismissible={!mutationBusy}
        onConfirm={confirmLifecycleAction}
      >
        {pendingAction?.kind === "report" && (
          <label className={styles.reasonField}>
            Observed state
            <select
              value={healthState}
              onChange={(event) => setHealthState(event.target.value as "stale" | "broken" | "missing")}
              disabled={mutationBusy}
            >
              <option value="stale">Stale</option>
              <option value="broken">Broken</option>
              <option value="missing">Missing</option>
            </select>
          </label>
        )}
        {(pendingAction?.kind === "remove" || pendingAction?.kind === "report") && (
          <label className={styles.reasonField}>
            {pendingAction.kind === "remove" ? "Unlink reason" : "Health explanation"}
            <textarea
              value={actionReason}
              onChange={(event) => {
                setActionReason(event.target.value);
                setMutationError("");
              }}
              maxLength={2000}
              rows={3}
              required
              disabled={mutationBusy}
              placeholder={
                pendingAction.kind === "remove"
                  ? "Explain why this association no longer belongs in the Project."
                  : "Describe what was checked and why this association cannot currently be trusted."
              }
            />
            <span>{actionReason.length}/2000 · preserved if the save fails</span>
          </label>
        )}
        {mutationError && <p className={styles.error} role="alert">{mutationError}</p>}
      </ConfirmationSheet>
    </>
  );
}
