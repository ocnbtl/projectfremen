"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import DirectoryPane from "../admin-shell/DirectoryPane";
import InspectorRail from "../admin-shell/InspectorRail";
import ModuleShell from "../admin-shell/ModuleShell";
import ModuleSidebar, { type ModuleSidebarSection } from "../admin-shell/ModuleSidebar";
import SharedAIDock from "../admin-shell/SharedAIDock";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import DenseObjectRow from "../operational/DenseObjectRow";
import DetailTabs, { DetailTabPanel, type DetailTab } from "../operational/DetailTabs";
import QuickActionBar, { type QuickAction } from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import LinkedDecisionsPanel from "../operational/LinkedDecisionsPanel";
import LinkedFollowUpsPanel from "../operational/LinkedFollowUpsPanel";
import { usePersonalOpsDecisions } from "../operational/usePersonalOpsDecisions";
import { usePersonalOpsFollowUps } from "../operational/usePersonalOpsFollowUps";
import {
  buildDecisionCreationRoute,
  decisionOwnerRoute,
  getLinkedDecisions,
  type DecisionSourceRef
} from "../../lib/modules/personal-ops/decision-links";
import {
  buildFollowUpCreationRoute,
  type FollowUpSourceRef
} from "../../lib/modules/personal-ops/follow-up-links";
import type {
  PersonalOpsDecision,
  PersonalOpsFollowUp
} from "../../lib/modules/personal-ops/types";
import { createProjectsRepository } from "../../lib/modules/projects/repository";
import { projectUuid } from "../../lib/modules/projects/identity";
import type {
  Project,
  ProjectBlocker,
  ProjectBlockerSeverity,
  ProjectInteraction,
  ProjectLink,
  ProjectLinkRelationship,
  ProjectMilestone,
  ProjectObjectiveInput,
  ProjectsObjectByFamily
} from "../../lib/modules/projects/types";
import {
  buildProjectReviewHandoffRoute,
  getProjectReviewContexts,
  getProjectSourceReviewContexts,
  type ProjectReviewSource
} from "../../lib/modules/reviews/project-context";
import { createReviewsRepository } from "../../lib/modules/reviews/repository";
import type { ReviewRunView } from "../../lib/modules/reviews/types";
import type {
  ProjectDirectoryItem,
  ProjectDisplayRecord,
  ProjectsWorkspaceSnapshot
} from "../../lib/modules/projects/view-model";
import { createNativeObjectRef, getModuleRoute, getNativeObjectRoute } from "../../lib/native-objects/routes";
import type { ModuleId, NativeObjectRef } from "../../lib/native-objects/types";
import type { PersonalRecord } from "../../lib/personal-records-store";
import {
  parseProjectsUrlState,
  serializeProjectsUrlState,
  type ProjectFilter,
  type ProjectSort,
  type ProjectTab,
  type ProjectsUrlState,
  type ProjectView
} from "../../lib/native-objects/url-state";
import styles from "./ProjectsWorkspace.module.css";

type ProjectsWorkspaceProps = {
  initialSnapshot: ProjectsWorkspaceSnapshot;
  initialMode?: "index" | "detail";
  initialProjectId?: string;
  initialLoadError?: string;
  initialPersonalOpsDecisions: PersonalOpsDecision[];
  initialDecisionsError?: string;
  initialPersonalOpsFollowUps: PersonalOpsFollowUp[];
  initialFollowUpsError?: string;
  initialPersonalRecords: PersonalRecord[];
  initialReviewViews: ReviewRunView[];
  initialReviewsError?: string;
};

type EditorKind =
  | "project-create"
  | "project-edit"
  | "legacy-promote"
  | "milestone-create"
  | "blocker-create"
  | "blocker-resolve"
  | "interaction-create"
  | "link-create"
  | "link-edit"
  | "link-health"
  | "link-repair";

type EditorState = {
  kind: EditorKind;
  projectId?: string;
  objectId?: string;
  values: Record<string, string | boolean>;
  objectives?: EditorObjectiveDraft[];
  people?: EditorPersonDraft[];
};

type EditorObjectiveDraft = {
  id: string;
  text: string;
  completed: boolean;
};

type EditorPersonDraft = {
  id: string;
  personId: string;
  role: string;
  context: string;
};

type ConfirmationState =
  | { kind: "project-complete"; projectId: string }
  | { kind: "project-archive"; projectId: string }
  | { kind: "project-restore"; projectId: string }
  | { kind: "milestone-complete"; projectId: string; objectId: string }
  | { kind: "link-remove"; projectId: string; objectId: string }
  | { kind: "link-restore"; projectId: string; objectId: string }
  | null;

const PROJECT_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "notes-decisions", label: "Notes & Decisions" },
  { id: "people", label: "People" },
  { id: "files-links", label: "Files & Links" },
  { id: "properties", label: "Properties" }
];

const VIEW_LABELS: Readonly<Record<ProjectView, string>> = {
  all: "All Projects",
  active: "Active",
  planned: "Planned",
  attention: "Needs Attention",
  due: "Due This Week",
  "needs-review": "Needs Review",
  blocked: "Blocked",
  linked: "Linked Context",
  archived: "Archive"
};

const FILTER_LABELS: Readonly<Record<ProjectFilter, string>> = {
  all: "All",
  active: "Active",
  planned: "Planned",
  due: "Due",
  "needs-review": "Needs review",
  blocked: "Blocked",
  linked: "Linked",
  "missing-owner": "Missing context",
  stale: "Stale",
  archived: "Archived"
};

const SORT_LABELS: Readonly<Record<ProjectSort, string>> = {
  "attention-updated": "Attention, then updated",
  "updated-desc": "Updated — newest",
  title: "Title — A–Z",
  priority: "Updated — newest",
  due: "Next milestone"
};

const LINK_RELATIONSHIPS: readonly ProjectLinkRelationship[] = [
  "evidence",
  "source_material",
  "review_input",
  "launch_proof",
  "supporting_context",
  "background_reference",
  "decision_support",
  "blocker_evidence",
  "advisor_context",
  "finance_context",
  "follow_up_context",
  "project_person",
  "related_project"
];

const LINK_MODULES: readonly ModuleId[] = [
  "notes",
  "people",
  "media",
  "resources",
  "finance",
  "reviews",
  "personal_ops",
  "projects"
];

function displayLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string, fallback = "Not recorded") {
  if (!value) return fallback;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  }).format(date);
}

function formatTimestamp(value?: string, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function toLocalDateTimeInput(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initials(value: string) {
  const cleaned = value.replace(/^Project\s+/i, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") : "PR";
}

function excerpt(value: string, limit = 90) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "No description recorded.";
  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean;
}

function activeMilestones(item: ProjectDirectoryItem) {
  return item.milestones.filter((milestone) => !["complete", "archived"].includes(milestone.state));
}

function openBlockers(item: ProjectDirectoryItem) {
  return item.blockers.filter((blocker) => blocker.state === "open" || blocker.state === "carried_forward");
}

function nextMilestone(item: ProjectDirectoryItem) {
  return [...activeMilestones(item)].sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0];
}

function hasDueMilestone(item: ProjectDirectoryItem) {
  const limit = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return activeMilestones(item).some((milestone) => {
    const time = Date.parse(milestone.dueAt);
    return Number.isFinite(time) && time <= limit;
  });
}

function matchesQuery(item: ProjectDirectoryItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    item.project.id,
    item.project.uuid,
    item.project.slug,
    item.project.name,
    item.project.description,
    item.project.objective,
    item.project.legacyEntityName,
    ...item.attentionReasons,
    ...item.milestones.flatMap((milestone) => [milestone.id, milestone.title, milestone.description, milestone.owner]),
    ...item.blockers.flatMap((blocker) => [blocker.id, blocker.title, blocker.condition, blocker.owner]),
    ...item.linkedContext.flatMap((context) => [context.ref.label, context.ref.objectId, context.relationship, context.summary])
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function matchesView(item: ProjectDirectoryItem, view: ProjectView) {
  if (view === "all") return item.project.lifecycle !== "archived";
  if (view === "active") return ["active", "monitoring"].includes(item.project.lifecycle);
  if (view === "planned") return ["idea", "developing", "planned", "draft"].includes(item.project.lifecycle);
  if (view === "attention") return item.attentionReasons.length > 0 || ["attention", "blocked"].includes(item.project.health);
  if (view === "due") return hasDueMilestone(item);
  if (view === "needs-review") return item.project.review === "needs_review" || item.project.review === "in_review";
  if (view === "blocked") return item.project.health === "blocked" || openBlockers(item).length > 0;
  if (view === "linked") return item.linkedContext.length > 0;
  return item.project.lifecycle === "archived";
}

function matchesFilter(item: ProjectDirectoryItem, filter: ProjectFilter) {
  if (filter === "all") return item.project.lifecycle !== "archived";
  if (filter === "active") return ["active", "monitoring"].includes(item.project.lifecycle);
  if (filter === "planned") return ["idea", "developing", "planned", "draft"].includes(item.project.lifecycle);
  if (filter === "due") return hasDueMilestone(item);
  if (filter === "needs-review") return item.project.review === "needs_review" || item.project.review === "in_review";
  if (filter === "blocked") return item.project.health === "blocked" || openBlockers(item).length > 0;
  if (filter === "linked") return item.linkedContext.length > 0;
  if (filter === "missing-owner") return !item.project.description || item.project.objectives.length === 0;
  if (filter === "stale") return item.project.health === "stale" || item.project.cadence === "dormant" || item.project.lifecycle === "dormant";
  return item.project.lifecycle === "archived";
}

function dueValue(item: ProjectDirectoryItem) {
  return nextMilestone(item)?.dueAt || "9999-12-31";
}

function sortProjects(items: ProjectDirectoryItem[], sort: ProjectSort) {
  return [...items].sort((left, right) => {
    if (sort === "title") return left.project.name.localeCompare(right.project.name, undefined, { sensitivity: "base" });
    if (sort === "priority") sort = "updated-desc";
    if (sort === "due") {
      const delta = dueValue(left).localeCompare(dueValue(right));
      if (delta !== 0) return delta;
    }
    if (sort === "attention-updated") {
      const leftAttention = itemAttentionScore(left);
      const rightAttention = itemAttentionScore(right);
      if (leftAttention !== rightAttention) return rightAttention - leftAttention;
    }
    return (right.project.updatedAt || "").localeCompare(left.project.updatedAt || "");
  });
}

function itemAttentionScore(item: ProjectDirectoryItem) {
  return item.attentionReasons.length + openBlockers(item).length * 2 + (item.project.health === "blocked" ? 3 : 0);
}

function stateTone(value: string): "green" | "amber" | "red" | "blue" | "purple" | undefined {
  if (["active", "monitoring", "healthy", "reviewed", "current", "complete", "resolved"].includes(value)) return "green";
  if (["blocked", "critical", "broken", "missing", "overdue"].includes(value)) return "red";
  if (["attention", "high", "needs_review", "in_review", "due", "due_soon", "stale"].includes(value)) return "amber";
  if (["planned", "draft", "idea", "developing", "unknown", "unset"].includes(value)) return "blue";
  if (["archived", "dormant", "paused", "waived", "carried_forward"].includes(value)) return "purple";
  return undefined;
}

function linkNeedsRepair(link: ProjectLink) {
  return ["stale", "broken", "missing"].includes(link.linkState);
}

function linkSourceIsUnsafe(link: ProjectLink) {
  return ["broken", "missing"].includes(link.linkState);
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function projectDisplayFromNative(project: Project): ProjectDisplayRecord {
  return {
    id: project.id,
    uuid: projectUuid(project.uuid, project.id),
    nativeRef: createNativeObjectRef({
      module: "projects",
      objectType: "project",
      objectId: project.id,
      label: project.name
    }),
    slug: project.slug,
    name: project.name,
    description: project.description,
    sourceKind: "native",
    editable: true,
    promotable: false,
    lifecycle: project.lifecycle,
    health: project.health,
    review: project.review,
    cadence: project.cadence,
    objective: project.objective,
    objectives: project.objectives,
    defaultCadence: project.defaultCadence,
    starred: project.starred,
    legacyKey: project.legacySource?.key,
    legacyRoute: project.legacySource?.legacyRoute,
    legacyEntityName: project.legacySource?.entityName,
    updatedAt: project.updatedAt,
    lastActivityAt: project.lastActivityAt
  };
}

function emptyDirectoryItem(project: Project): ProjectDirectoryItem {
  return {
    project: projectDisplayFromNative(project),
    milestones: [],
    blockers: [],
    links: [],
    interactions: [],
    timelineEvents: [],
    linkedContext: [],
    attentionReasons: [
      ...(project.objectives.length === 0 ? ["Project objectives are not defined."] : [])
    ]
  };
}

function projectFollowUpSource(
  project: ProjectDisplayRecord,
  source?: { objectType: string; objectId: string; label: string }
): FollowUpSourceRef {
  return {
    module: "projects",
    objectType: source?.objectType || "project",
    objectId: source?.objectId || project.id,
    ...(source ? { containerObjectId: project.id } : {}),
    label: source?.label || project.name,
    route: getNativeObjectRoute({
      module: "projects",
      objectType: source?.objectType || "project",
      objectId: source?.objectId || project.id,
      ...(source ? { containerObjectId: project.id } : {})
    })
  };
}

function projectDecisionSource(
  project: ProjectDisplayRecord,
  source?: { objectType: string; objectId: string; label: string }
): DecisionSourceRef {
  return {
    module: "projects",
    objectType: source?.objectType || "project",
    objectId: source?.objectId || project.id,
    ...(source ? { containerObjectId: project.id } : {}),
    label: source?.label || project.name,
    route: getNativeObjectRoute({
      module: "projects",
      objectType: source?.objectType || "project",
      objectId: source?.objectId || project.id,
      ...(source ? { containerObjectId: project.id } : {})
    })
  };
}

function projectReviewSource(
  project: ProjectDisplayRecord,
  source?: { objectType: "milestone" | "blocker"; objectId: string; label: string }
): ProjectReviewSource {
  return {
    objectType: source?.objectType || "project",
    objectId: source?.objectId || project.id,
    ...(source ? { containerObjectId: project.id } : {}),
    label: source?.label || project.name
  };
}

function personalOpsCreateHref(
  collection: "decisions" | "follow-ups",
  project: ProjectDisplayRecord,
  source?: { objectType: string; objectId: string; label: string },
  options: { dueAt?: string } = {}
) {
  if (collection === "follow-ups") {
    return buildFollowUpCreationRoute(projectFollowUpSource(project, source), options);
  }
  return buildDecisionCreationRoute(projectDecisionSource(project, source), options);
}

function nativeCreateHref(module: "notes" | "people" | "media" | "resources", project: ProjectDisplayRecord) {
  const params = new URLSearchParams({
    sourceModule: "projects",
    sourceObjectType: "project",
    sourceObjectId: project.id,
    sourceLabel: project.name
  });
  return `${getModuleRoute(module)}?${params.toString()}`;
}

function peopleIdentityRef(record: PersonalRecord): NativeObjectRef {
  return createNativeObjectRef({
    module: "people",
    objectType: record.className === "org" ? "organization" : "person",
    objectId: record.id,
    label: record.profile?.fullName || record.title
  });
}

function personalRecordObjectRef(record: PersonalRecord): NativeObjectRef | null {
  if (record.className === "note") {
    return createNativeObjectRef({ module: "notes", objectType: "note", objectId: record.id, label: record.title });
  }
  if (record.className === "resource") {
    return createNativeObjectRef({ module: "resources", objectType: "resource", objectId: record.id, label: record.title });
  }
  if (record.className === "file") {
    return createNativeObjectRef({ module: "media", objectType: "media_asset", objectId: record.id, label: record.title });
  }
  return null;
}

function activityTone(event: ProjectDirectoryItem["timelineEvents"][number]) {
  if (event.eventType.startsWith("milestone_")) return "milestone";
  if (event.eventType.startsWith("blocker_")) return "blocker";
  if (event.eventType === "interaction_logged") return "update";
  if (event.eventType.startsWith("link_")) {
    if (event.sourceRef?.module === "people") return "people";
    if (event.sourceRef?.module === "personal_ops" && event.sourceRef.objectType === "decision") return "decision";
    return "object";
  }
  return "system";
}

function EditorSurface({
  open,
  title,
  description,
  busy,
  error,
  onRequestClose,
  onSubmit,
  children
}: {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  error: string;
  onRequestClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLFormElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-editor-autofocus]")?.focus();
    });
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onRequestCloseRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <form
        ref={panelRef}
        className={styles.formPanel}
        aria-labelledby="projects-editor-title"
        aria-describedby="projects-editor-description"
        aria-busy={busy || undefined}
        onSubmit={onSubmit}
      >
        <header className={styles.formHeader}>
          <div>
            <h2 id="projects-editor-title">{title}</h2>
            <p id="projects-editor-description">{description}</p>
          </div>
          <button type="button" className={styles.iconButton} onClick={onRequestClose} disabled={busy} aria-label={`Close ${title}`}>
            ×
          </button>
        </header>
        <div className={styles.formBody}>
          {error && <p className={styles.errorBanner} role="alert">{error}</p>}
          {children}
        </div>
        <footer className={styles.formFooter}>
          <button type="button" className={styles.button} onClick={onRequestClose} disabled={busy}>Cancel</button>
          <button type="submit" className={styles.button} data-primary="true" disabled={busy}>
            {busy ? "Saving…" : title.startsWith("Create") ? "Create project" : "Save changes"}
          </button>
        </footer>
    </form>
  );
}

function ProjectObjectivesEditor({
  objectives,
  readOnly,
  busy,
  onSave
}: {
  objectives: ProjectDisplayRecord["objectives"];
  readOnly: boolean;
  busy: boolean;
  onSave: (objectives: ProjectObjectiveInput[]) => Promise<boolean>;
}) {
  const signature = objectives.map((item) => `${item.id}:${item.text}:${item.completedAt || ""}`).join("|");
  const [drafts, setDrafts] = useState<EditorObjectiveDraft[]>(() =>
    objectives.map((item) => ({ id: item.id, text: item.text, completed: false }))
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDrafts(objectives.map((item) => ({ id: item.id, text: item.text, completed: false })));
    setDirty(false);
  }, [signature]);

  function updateDraft(id: string, patch: Partial<EditorObjectiveDraft>) {
    setDrafts((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setDirty(true);
  }

  async function save() {
    const valid = drafts.filter((item) => item.text.trim());
    if (await onSave(valid.map((item) => ({ id: item.id, text: item.text, completed: false })))) {
      setDirty(false);
    }
  }

  return (
    <section className={`${styles.panel} ${styles.objectivesPanel}`} data-wide="true">
      <div className={styles.panelHeader}>
        <h2>Objectives</h2>
        {!readOnly && dirty && (
          <button type="button" className={styles.button} data-primary="true" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save objectives"}
          </button>
        )}
      </div>
      {drafts.length ? (
        <ul className={styles.objectiveList}>
          {drafts.map((objective) => (
            <li key={objective.id}>
              <span className={styles.objectiveBullet} aria-hidden="true">•</span>
              <input
                value={objective.text}
                onChange={(event) => updateDraft(objective.id, { text: event.target.value })}
                disabled={readOnly || busy}
                aria-label="Objective"
                placeholder="Describe an objective"
              />
              {!readOnly && (
                <button
                  type="button"
                  className={styles.removeObjectiveButton}
                  onClick={() => {
                    setDrafts((current) => current.filter((item) => item.id !== objective.id));
                    setDirty(true);
                  }}
                  disabled={busy}
                  aria-label={`Delete ${objective.text || "objective"}`}
                  title="Delete objective"
                ><span aria-hidden="true">⌫</span></button>
              )}
            </li>
          ))}
        </ul>
      ) : <p>No objectives yet.</p>}
      {!readOnly && (
        <button
          type="button"
          className={styles.addRowButton}
          onClick={() => {
            setDrafts((current) => [...current, { id: `draft-objective-${crypto.randomUUID()}`, text: "", completed: false }]);
            setDirty(true);
          }}
          disabled={busy}
        >+ Add objective</button>
      )}
    </section>
  );
}

function recomputeAttention(item: ProjectDirectoryItem): ProjectDirectoryItem {
  if (item.project.sourceKind === "legacy_projection" || item.project.lifecycle === "archived") return item;
  const reasons: string[] = [];
  if (item.project.objectives.length === 0) reasons.push("Project objectives are not defined.");
  const blockers = openBlockers(item);
  if (blockers.length) reasons.push(`${blockers.length} open project blocker${blockers.length === 1 ? "" : "s"}.`);
  const overdue = activeMilestones(item).filter((milestone) => {
    const dueAt = Date.parse(milestone.dueAt);
    return Number.isFinite(dueAt) && dueAt < Date.now();
  });
  if (overdue.length) reasons.push(`${overdue.length} overdue milestone${overdue.length === 1 ? "" : "s"}.`);
  return { ...item, attentionReasons: reasons };
}

function nativeLinkContext(links: ProjectLink[]) {
  return links
    .filter((link) => link.linkState !== "removed")
    .map((link) => ({
      ref: link.source,
      sourceKind: "native_project_link" as const,
      relationship: link.relationship,
      summary: link.projectSpecificNote,
      role: link.role,
      legacyStatus: link.linkState,
      updatedAt: link.updatedAt
    }));
}

export default function ProjectsWorkspace({
  initialSnapshot,
  initialMode = "index",
  initialProjectId,
  initialLoadError = "",
  initialPersonalOpsDecisions,
  initialDecisionsError = "",
  initialPersonalOpsFollowUps,
  initialFollowUpsError = "",
  initialPersonalRecords,
  initialReviewViews,
  initialReviewsError = ""
}: ProjectsWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const repository = useMemo(() => createProjectsRepository(), []);
  const reviewsRepository = useMemo(() => createReviewsRepository(), []);
  const initialPeople = useMemo(
    () => initialPersonalRecords.filter((record) => record.className === "person" || record.className === "org"),
    [initialPersonalRecords]
  );
  const {
    decisions,
    error: decisionsError,
    loading: decisionsLoading,
    refresh: refreshDecisions
  } = usePersonalOpsDecisions(initialPersonalOpsDecisions, initialDecisionsError);
  const {
    followUps,
    error: followUpsError,
    loading: followUpsLoading,
    refresh: refreshFollowUps
  } = usePersonalOpsFollowUps(initialPersonalOpsFollowUps, initialFollowUpsError);
  const selectedChildRef = useRef<HTMLElement>(null);
  const [initialUrlState] = useState(() => parseProjectsUrlState(searchParams));
  const initialDetail = initialMode === "detail";
  const initialSelectedProject =
    (initialProjectId && initialSnapshot.projects.find((item) =>
      [item.project.id, item.project.slug, item.project.legacyKey].filter(Boolean).includes(initialProjectId)
    )?.project.id) ||
    (!initialDetail && initialSnapshot.projects.some((item) => item.project.id === initialUrlState.item)
      ? initialUrlState.item
      : initialSnapshot.defaultProjectId);

  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [view, setView] = useState<ProjectView>(initialUrlState.view);
  const [filter, setFilter] = useState<ProjectFilter>(initialUrlState.filter);
  const [sort, setSort] = useState<ProjectSort>(initialUrlState.sort);
  const [query, setQuery] = useState(initialUrlState.query);
  const [compact, setCompact] = useState(initialUrlState.compact);
  const [activeTab, setActiveTab] = useState<ProjectTab>(initialUrlState.tab);
  const [selectedProjectId, setSelectedProjectId] = useState(initialSelectedProject || "");
  const [selectedChildId, setSelectedChildId] = useState(initialDetail ? initialUrlState.item : "");
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(initialUrlState.ai);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);
  const [confirmationReason, setConfirmationReason] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [reviewViews, setReviewViews] = useState(initialReviewViews);
  const [reviewsError, setReviewsError] = useState(initialReviewsError);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const isMobile = useMediaQuery("(max-width: 760px)");
  const isInspectorOverlay = useMediaQuery("(max-width: 1240px)");
  const searchParamKey = searchParams.toString();

  const selectedItem = useMemo(
    () => snapshot.projects.find((item) => item.project.id === selectedProjectId) || null,
    [selectedProjectId, snapshot.projects]
  );

  const visibleProjects = useMemo(
    () => sortProjects(
      snapshot.projects.filter((item) => matchesQuery(item, query) && matchesView(item, view) && matchesFilter(item, filter)),
      sort
    ),
    [filter, query, snapshot.projects, sort, view]
  );

  const queryScopedProjects = useMemo(
    () => snapshot.projects.filter((item) => matchesQuery(item, query)),
    [query, snapshot.projects]
  );

  async function refreshReviewContext() {
    if (reviewsLoading) return;
    setReviewsLoading(true);
    const result = await reviewsRepository.readState({ includeArchived: true });
    if (!result.ok) {
      setReviewsError(result.error.message);
      setReviewsLoading(false);
      return;
    }
    setReviewViews(result.data.items);
    setReviewsError("");
    setReviewsLoading(false);
    setNotice("Review context refreshed from the Reviews owner module.");
  }

  useEffect(() => {
    const next = parseProjectsUrlState(searchParams);
    setView(next.view);
    setFilter(next.filter);
    setSort(next.sort);
    setQuery(next.query);
    setCompact(next.compact);
    setActiveTab(next.tab);
    setAiOpen(next.ai);
    if (initialDetail) {
      setSelectedChildId(next.item);
    } else if (snapshot.projects.some((item) => item.project.id === next.item)) {
      setSelectedProjectId(next.item);
    }
  }, [initialDetail, searchParamKey, snapshot.projects]);

  useEffect(() => {
    if (initialDetail || !visibleProjects.length) return;
    if (visibleProjects.some((item) => item.project.id === selectedProjectId)) {
      if (!parseProjectsUrlState(searchParams).item) updateUrl({ item: selectedProjectId }, "replace");
      return;
    }
    const nextId = visibleProjects[0].project.id;
    setSelectedProjectId(nextId);
    updateUrl({ item: nextId }, "replace");
  }, [filter, initialDetail, query, selectedProjectId, sort, view, visibleProjects.length]);

  useEffect(() => {
    if (!editor || !editorDirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function guardAnchor(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.closest(`.${styles.formPanel}`)) return;
      if (!window.confirm("Discard the unsaved project changes and leave this page?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardAnchor, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardAnchor, true);
    };
  }, [editor, editorDirty]);

  useEffect(() => {
    if (!selectedChildId) return;
    const frame = window.requestAnimationFrame(() => {
      selectedChildRef.current?.focus({ preventScroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, selectedChildId]);

  function destinationFor(
    partial: Partial<ProjectsUrlState>,
    targetPath = pathname
  ) {
    const params = serializeProjectsUrlState(
      {
        view,
        filter,
        sort,
        query,
        item: initialDetail ? selectedChildId : selectedProjectId,
        tab: activeTab,
        compact,
        ai: aiOpen,
        ...partial
      },
      searchParams
    );
    return `${targetPath}${params.size ? `?${params.toString()}` : ""}`;
  }

  function updateUrl(
    partial: Partial<ProjectsUrlState>,
    history: "push" | "replace" = "replace",
    targetPath = pathname
  ) {
    const destination = destinationFor(partial, targetPath);
    if (history === "push") router.push(destination, { scroll: false });
    else router.replace(destination, { scroll: false });
  }

  function selectView(nextView: ProjectView) {
    setView(nextView);
    setFilter("all");
    const targetPath = initialDetail ? getModuleRoute("projects") : pathname;
    updateUrl({ view: nextView, filter: "all", item: initialDetail ? "" : selectedProjectId, tab: "overview" }, initialDetail ? "push" : "replace", targetPath);
    setMobileSidebarOpen(false);
    setInspectorOpen(false);
  }

  function selectProject(item: ProjectDirectoryItem) {
    setSelectedProjectId(item.project.id);
    setSelectedChildId("");
    setActiveTab("overview");
    setInspectorOpen(true);
    if (isMobile || initialDetail) {
      updateUrl({ item: "", tab: "overview" }, "push", getNativeObjectRoute(item.project.nativeRef));
      return;
    }
    updateUrl({ item: item.project.id, tab: "overview" }, "push");
  }

  function selectTab(tabId: string) {
    const nextTab = tabId as ProjectTab;
    setActiveTab(nextTab);
    setSelectedChildId("");
    updateUrl({ tab: nextTab, item: initialDetail ? "" : selectedProjectId });
  }

  function selectChild(objectId: string, tab: ProjectTab) {
    setSelectedChildId(objectId);
    setActiveTab(tab);
    updateUrl({ item: objectId, tab });
  }

  function setChecked(id: string, checked: boolean) {
    setBatchSelection((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearFeedback() {
    setNotice("");
    setMutationError("");
  }

  function changeEditorValue(name: string, value: string | boolean) {
    setEditor((current) => current ? { ...current, values: { ...current.values, [name]: value } } : current);
    setEditorDirty(true);
    setEditorError("");
  }

  function changeEditorValues(values: Record<string, string | boolean>) {
    setEditor((current) => current ? { ...current, values: { ...current.values, ...values } } : current);
    setEditorDirty(true);
    setEditorError("");
  }

  function updateEditorObjective(id: string, patch: Partial<EditorObjectiveDraft>) {
    setEditor((current) => current ? {
      ...current,
      objectives: current.objectives?.map((item) => item.id === id ? { ...item, ...patch } : item)
    } : current);
    setEditorDirty(true);
    setEditorError("");
  }

  function updateEditorPerson(id: string, patch: Partial<EditorPersonDraft>) {
    setEditor((current) => current ? {
      ...current,
      people: current.people?.map((item) => item.id === id ? { ...item, ...patch } : item)
    } : current);
    setEditorDirty(true);
    setEditorError("");
  }

  function openEditor(
    kind: EditorKind,
    item?: ProjectDirectoryItem,
    object?: ProjectBlocker | ProjectLink,
    preset: Record<string, string | boolean> = {}
  ) {
    clearFeedback();
    let values: Record<string, string | boolean> = {};
    let objectives: EditorObjectiveDraft[] | undefined;
    let people: EditorPersonDraft[] | undefined;
    if (kind === "project-create") {
      values = { name: "", description: "", completionTarget: "", lifecycle: "idea", defaultCadence: "" };
      objectives = [{ id: `draft-objective-${crypto.randomUUID()}`, text: "", completed: false }];
      people = [{ id: `draft-person-${crypto.randomUUID()}`, personId: "", role: "", context: "" }];
    } else if (kind === "project-edit" && item) {
      const nativeProject = snapshot.nativeState.projects.find((project) => project.id === item.project.id);
      values = {
        name: item.project.name,
        description: item.project.description,
        lifecycle: item.project.lifecycle,
        defaultCadence: nativeProject?.defaultCadence || "",
        completionTarget: nativeProject?.completionTarget || ""
      };
      objectives = (nativeProject?.objectives || []).map((objective) => ({
        id: objective.id,
        text: objective.text,
        completed: false
      }));
    } else if (kind === "legacy-promote" && item) {
      values = { objective: item.project.objective || "" };
    } else if (kind === "milestone-create") {
      values = { title: "", description: "", dueAt: "", owner: "", completionCriteria: "" };
    } else if (kind === "blocker-create") {
      values = { title: "", condition: "", severity: "medium", owner: "", dueAt: "" };
    } else if (kind === "blocker-resolve" && object?.objectType === "blocker") {
      values = { resolution: object.resolution || "" };
    } else if (kind === "interaction-create") {
      values = { title: "", body: "", occurredAt: toLocalDateTimeInput() };
    } else if (kind === "link-create") {
      values = {
        linkScope: "object",
        sourceModule: "media",
        sourceObjectType: "",
        sourceObjectId: "",
        sourceContainerObjectId: "",
        sourceLabel: "",
        relationship: "supporting_context",
        relationshipStrength: "normal",
        role: "",
        projectSpecificNote: "",
        isRequiredEvidence: false
      };
    } else if (kind === "link-edit" && object?.objectType === "project_link") {
      values = {
        role: object.role || "",
        projectSpecificNote: object.projectSpecificNote || "",
        relationship: object.relationship,
        relationshipStrength: object.relationshipStrength
      };
    } else if (kind === "link-health" && object?.objectType === "project_link") {
      values = {
        healthState: linkNeedsRepair(object) ? object.linkState : "stale",
        healthReason: object.healthNote || ""
      };
    } else if (kind === "link-repair" && object?.objectType === "project_link") {
      values = {
        sourceModule: object.source.module,
        sourceObjectType: object.source.objectType,
        sourceObjectId: object.source.objectId,
        sourceContainerObjectId: object.source.containerObjectId || "",
        sourceLabel: object.source.label,
        repairReason: ""
      };
    }
    setEditor({ kind, projectId: item?.project.id, objectId: object?.id, values: { ...values, ...preset }, objectives, people });
    setInspectorOpen(true);
    setEditorDirty(false);
    setEditorError("");
  }

  function requestCloseEditor() {
    if (mutationBusy) return;
    if (editorDirty) setDiscardOpen(true);
    else setEditor(null);
  }

  function closeEditor() {
    setEditor(null);
    setEditorDirty(false);
    setEditorError("");
  }

  function updateDirectoryItem(projectId: string, transform: (item: ProjectDirectoryItem) => ProjectDirectoryItem) {
    setSnapshot((current) => ({
      ...current,
      projects: current.projects.map((item) => item.project.id === projectId ? recomputeAttention(transform(item)) : item)
    }));
  }

  function applyProject(project: Project) {
    setSnapshot((current) => {
      const existing = current.projects.find((item) => item.project.id === project.id);
      const nativeProjects = current.nativeState.projects.some((item) => item.id === project.id)
        ? current.nativeState.projects.map((item) => item.id === project.id ? project : item)
        : [...current.nativeState.projects, project];
      if (!existing) return {
        ...current,
        nativeState: { ...current.nativeState, projects: nativeProjects },
        projects: [...current.projects, emptyDirectoryItem(project)]
      };
      return {
        ...current,
        nativeState: { ...current.nativeState, projects: nativeProjects },
        projects: current.projects.map((item) => item.project.id === project.id
          ? recomputeAttention({ ...item, project: projectDisplayFromNative(project) })
          : item)
      };
    });
  }

  function applyMilestone(milestone: ProjectMilestone) {
    updateDirectoryItem(milestone.projectId, (item) => ({
      ...item,
      milestones: item.milestones.some((candidate) => candidate.id === milestone.id)
        ? item.milestones.map((candidate) => candidate.id === milestone.id ? milestone : candidate)
        : [...item.milestones, milestone].sort((left, right) => left.dueAt.localeCompare(right.dueAt))
    }));
  }

  function applyBlocker(blocker: ProjectBlocker) {
    updateDirectoryItem(blocker.projectId, (item) => ({
      ...item,
      blockers: item.blockers.some((candidate) => candidate.id === blocker.id)
        ? item.blockers.map((candidate) => candidate.id === blocker.id ? blocker : candidate)
        : [blocker, ...item.blockers]
    }));
  }

  function applyLink(link: ProjectLink) {
    updateDirectoryItem(link.projectId, (item) => {
      const links = item.links.some((candidate) => candidate.id === link.id)
        ? item.links.map((candidate) => candidate.id === link.id ? link : candidate)
        : [link, ...item.links];
      return {
        ...item,
        links,
        linkedContext: [
          ...item.linkedContext.filter((context) => context.sourceKind !== "native_project_link"),
          ...nativeLinkContext(links)
        ]
      };
    });
  }

  function applyInteraction(interaction: ProjectInteraction) {
    updateDirectoryItem(interaction.projectId, (item) => ({
      ...item,
      interactions: item.interactions.some((candidate) => candidate.id === interaction.id)
        ? item.interactions.map((candidate) => candidate.id === interaction.id ? interaction : candidate)
        : [interaction, ...item.interactions].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    }));
  }

  function applyMutationEnvelope(data: {
    item: ProjectsObjectByFamily[keyof ProjectsObjectByFamily];
    project: Project;
    timelineEvent?: ProjectsWorkspaceSnapshot["nativeState"]["timelineEvents"][number];
  }) {
    applyProject(data.project);
    if (data.item.objectType === "milestone") applyMilestone(data.item);
    if (data.item.objectType === "blocker") applyBlocker(data.item);
    if (data.item.objectType === "project_link") applyLink(data.item);
    if (data.item.objectType === "project_interaction") applyInteraction(data.item);
    if (data.timelineEvent) {
      const event = data.timelineEvent;
      updateDirectoryItem(event.projectId, (item) => ({
        ...item,
        timelineEvents: [event, ...item.timelineEvents.filter((candidate) => candidate.id !== event.id)]
      }));
    }
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || mutationBusy) return;
    const value = (name: string) => String(editor.values[name] ?? "").trim();
    const optional = (name: string) => value(name) || undefined;
    setEditorError("");
    setMutationBusy(true);
    try {
      if (editor.kind === "project-create") {
        if (!value("name")) {
          setEditorError("Project name is required.");
          return;
        }
        const objectives = (editor.objectives || [])
          .filter((objective) => objective.text.trim())
          .map((objective) => ({ id: objective.id, text: objective.text.trim(), completed: false }));
        const personRows = (editor.people || []).filter((person) => person.personId || person.role.trim() || person.context.trim());
        if (personRows.some((person) => !person.personId)) {
          setEditorError("Choose a People identity for each person row, or remove the unused row.");
          return;
        }
        if (new Set(personRows.map((person) => person.personId)).size !== personRows.length) {
          setEditorError("Each person can only be added to the project once.");
          return;
        }
        const result = await repository.create("projects", {
          name: value("name"),
          description: value("description"),
          objectives,
          people: personRows.map((person) => ({
            personRef: peopleIdentityRef(initialPeople.find((candidate) => candidate.id === person.personId)!),
            role: person.role.trim() || undefined,
            context: person.context.trim() || undefined
          })),
          completionTarget: optional("completionTarget"),
          defaultCadence: optional("defaultCadence"),
          lifecycle: value("lifecycle") as Exclude<Project["lifecycle"], "complete" | "archived">
        });
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        result.data.linkedPeople?.forEach(applyLink);
        setSelectedProjectId(result.data.project.id);
        setNotice(`${result.data.project.name} was created and is now tracked natively.`);
        window.dispatchEvent(new Event("projects:changed"));
        updateUrl({ item: result.data.project.id, tab: "overview" }, "push");
      } else if (editor.kind === "project-edit") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item || !item.project.editable || !item.project.updatedAt) {
          setEditorError("This project is not available for native editing.");
          return;
        }
        if (!value("name")) {
          setEditorError("Project name is required.");
          return;
        }
        const result = await repository.update("projects", item.project.id, {
          name: value("name"),
          description: value("description"),
          objectives: (editor.objectives || [])
            .filter((objective) => objective.text.trim())
            .map((objective) => ({ id: objective.id, text: objective.text.trim(), completed: false })),
          completionTarget: optional("completionTarget"),
          defaultCadence: optional("defaultCadence"),
          lifecycle: value("lifecycle") as Project["lifecycle"]
        }, item.project.updatedAt);
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        window.dispatchEvent(new Event("projects:changed"));
        setNotice(`${result.data.project.name} was saved.`);
      } else if (editor.kind === "legacy-promote") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item?.project.legacyKey || !item.project.promotable) {
          setEditorError("This legacy project cannot be promoted from the current view.");
          return;
        }
        const result = await repository.promoteLegacy({
          legacyKey: item.project.legacyKey,
          promotionConfirmed: true,
          objective: optional("objective")
        });
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setNotice(`${result.data.project.name} is now tracked natively. Legacy identity and route provenance were preserved.`);
      } else if (editor.kind === "milestone-create") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item?.project.editable) {
          setEditorError("Start native tracking before adding project-owned milestones.");
          return;
        }
        if (!value("title") || !value("dueAt") || !value("completionCriteria")) {
          setEditorError("Milestone title, due date, and at least one completion criterion are required.");
          return;
        }
        const result = await repository.create("milestones", {
          projectId: item.project.id,
          title: value("title"),
          description: value("description"),
          dueAt: value("dueAt"),
          owner: optional("owner"),
          completionCriteria: value("completionCriteria").split("\n").map((criterion) => criterion.trim()).filter(Boolean)
        });
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setActiveTab("timeline");
        setSelectedChildId(result.data.item.id);
        updateUrl({ tab: "timeline", item: initialDetail ? result.data.item.id : item.project.id });
        setNotice(`Milestone “${result.data.item.title}” was added.`);
      } else if (editor.kind === "blocker-create") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item?.project.editable) {
          setEditorError("Start native tracking before adding project-owned blockers.");
          return;
        }
        if (!value("title") || !value("condition")) {
          setEditorError("Blocker title and blocking condition are required.");
          return;
        }
        const result = await repository.create("blockers", {
          projectId: item.project.id,
          title: value("title"),
          condition: value("condition"),
          severity: value("severity") as ProjectBlockerSeverity,
          owner: optional("owner"),
          dueAt: optional("dueAt")
        });
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setActiveTab("timeline");
        setSelectedChildId(result.data.item.id);
        updateUrl({ tab: "timeline", item: initialDetail ? result.data.item.id : item.project.id });
        setNotice(`Blocker “${result.data.item.title}” is now tracked.`);
      } else if (editor.kind === "blocker-resolve") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        const blocker = item?.blockers.find((candidate) => candidate.id === editor.objectId);
        if (!item || !blocker) {
          setEditorError("The selected blocker is no longer available.");
          return;
        }
        if (!value("resolution")) {
          setEditorError("Record how the blocker was resolved.");
          return;
        }
        const result = await repository.update("blockers", blocker.id, {
          state: "resolved",
          resolution: value("resolution")
        }, blocker.updatedAt);
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setNotice(`Blocker “${result.data.item.title}” was resolved with an audit entry.`);
      } else if (editor.kind === "interaction-create") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item?.project.editable) {
          setEditorError("Start native tracking before logging project activity.");
          return;
        }
        if (!value("title") || !value("occurredAt")) {
          setEditorError("Update title and date are required.");
          return;
        }
        const result = await repository.create("interactions", {
          projectId: item.project.id,
          title: value("title"),
          body: optional("body"),
          occurredAt: value("occurredAt")
        });
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setActiveTab("timeline");
        setSelectedChildId(result.data.timelineEvent?.id || "");
        updateUrl({ tab: "timeline", item: initialDetail ? result.data.timelineEvent?.id || "" : item.project.id });
        setNotice(`Update “${result.data.item.title}” was logged.`);
      } else if (editor.kind === "link-create") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item?.project.editable) {
          setEditorError("Start native tracking before adding project-owned references.");
          return;
        }
        if (!value("sourceObjectId") || !value("sourceLabel") || !value("sourceObjectType")) {
          setEditorError("Source label, object type, and stable object ID are required.");
          return;
        }
        const sourceModule = value("sourceModule") as ModuleId;
        const sourceObjectType = value("sourceObjectType");
        const nestedOwnerObject =
          (sourceModule === "projects" && sourceObjectType !== "project") ||
          (sourceModule === "reviews" && !["review", "review_run"].includes(sourceObjectType));
        if (nestedOwnerObject && !value("sourceContainerObjectId")) {
          setEditorError("A parent / container ID is required for nested Project and Review objects so the owner route remains repairable.");
          return;
        }
        const source = createNativeObjectRef({
          module: sourceModule,
          objectType: sourceObjectType,
          objectId: value("sourceObjectId"),
          containerObjectId: optional("sourceContainerObjectId"),
          label: value("sourceLabel")
        });
        const result = await repository.create("links", {
          projectId: item.project.id,
          source,
          relationship: value("relationship") as ProjectLinkRelationship,
          relationshipStrength: value("relationshipStrength") as ProjectLink["relationshipStrength"],
          role: optional("role"),
          projectSpecificNote: optional("projectSpecificNote"),
          isRequiredEvidence: Boolean(editor.values.isRequiredEvidence)
        });
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        const nextTab: ProjectTab =
          sourceModule === "people"
            ? "people"
            : sourceModule === "notes" || (
                sourceModule === "personal_ops" &&
                sourceObjectType === "decision"
              )
              ? "notes-decisions"
              : "files-links";
        setActiveTab(nextTab);
        setSelectedChildId(result.data.item.id);
        updateUrl({ tab: nextTab, item: initialDetail ? result.data.item.id : item.project.id });
        setNotice(`Reference to “${result.data.item.source.label}” was linked without copying its native object.`);
      } else if (editor.kind === "link-edit") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        const link = item?.links.find((candidate) => candidate.id === editor.objectId);
        if (!item || !link) {
          setEditorError("The selected connection is no longer available.");
          return;
        }
        const result = await repository.update("links", link.id, {
          role: optional("role"),
          projectSpecificNote: optional("projectSpecificNote"),
          relationship: value("relationship") as ProjectLinkRelationship,
          relationshipStrength: value("relationshipStrength") as ProjectLink["relationshipStrength"]
        }, link.updatedAt);
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setNotice(`Connection to “${result.data.item.source.label}” was updated.`);
      } else if (editor.kind === "link-health") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        const link = item?.links.find((candidate) => candidate.id === editor.objectId);
        if (!item || !link) {
          setEditorError("The selected Project association is no longer available.");
          return;
        }
        if (!value("healthReason")) {
          setEditorError("Explain why this association is stale, broken, or missing.");
          return;
        }
        const result = await repository.update("links", link.id, {
          action: "update_link_health",
          linkState: value("healthState") as ProjectLink["linkState"],
          healthReason: value("healthReason")
        }, link.updatedAt);
        if (!result.ok) {
          setEditorError(`${result.error.message} Your health explanation was preserved.`);
          return;
        }
        applyMutationEnvelope(result.data);
        selectChild(result.data.item.id, "files-links");
        setNotice(`Association to "${result.data.item.source.label}" is now ${displayLabel(result.data.item.linkState).toLowerCase()}. The source object was not changed or deleted.`);
      } else if (editor.kind === "link-repair") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        const link = item?.links.find((candidate) => candidate.id === editor.objectId);
        if (!item || !link) {
          setEditorError("The selected Project association is no longer available.");
          return;
        }
        if (!value("sourceObjectId") || !value("sourceLabel") || !value("sourceObjectType") || !value("repairReason")) {
          setEditorError("Verified source identity, label, and repair explanation are required.");
          return;
        }
        const sourceModule = value("sourceModule") as ModuleId;
        const sourceObjectType = value("sourceObjectType");
        const nestedOwnerObject =
          (sourceModule === "projects" && sourceObjectType !== "project") ||
          (sourceModule === "reviews" && !["review", "review_run"].includes(sourceObjectType));
        if (nestedOwnerObject && !value("sourceContainerObjectId")) {
          setEditorError("A parent / container ID is required for nested Project and Review objects so the owner route remains repairable.");
          return;
        }
        const source = createNativeObjectRef({
          module: sourceModule,
          objectType: sourceObjectType,
          objectId: value("sourceObjectId"),
          containerObjectId: optional("sourceContainerObjectId"),
          label: value("sourceLabel")
        });
        const result = await repository.update("links", link.id, {
          action: "repair_link",
          source,
          repairReason: value("repairReason")
        }, link.updatedAt);
        if (!result.ok) {
          setEditorError(`${result.error.message} Your verified source and repair explanation were preserved.`);
          return;
        }
        applyMutationEnvelope(result.data);
        selectChild(result.data.item.id, "files-links");
        setNotice(`Association to "${result.data.item.source.label}" was repaired. The previous source identity remains in audit history.`);
      }
      closeEditor();
    } finally {
      setMutationBusy(false);
    }
  }

  async function toggleStar(item: ProjectDirectoryItem) {
    if (!item.project.editable || ["complete", "archived"].includes(item.project.lifecycle) || !item.project.updatedAt || mutationBusy) return;
    clearFeedback();
    const previous = item.project.starred;
    updateDirectoryItem(item.project.id, (current) => ({
      ...current,
      project: { ...current.project, starred: !previous }
    }));
    setMutationBusy(true);
    const result = await repository.update("projects", item.project.id, { starred: !previous }, item.project.updatedAt);
    setMutationBusy(false);
    if (!result.ok) {
      updateDirectoryItem(item.project.id, (current) => ({ ...current, project: { ...current.project, starred: previous } }));
      setMutationError(result.error.message);
      return;
    }
    applyMutationEnvelope(result.data);
    setNotice(!previous ? "Project starred." : "Project removed from starred projects.");
  }

  async function saveObjectives(item: ProjectDirectoryItem, objectives: ProjectObjectiveInput[]) {
    if (!item.project.editable || !item.project.updatedAt || mutationBusy) return false;
    clearFeedback();
    setMutationBusy(true);
    const result = await repository.update("projects", item.project.id, { objectives }, item.project.updatedAt);
    setMutationBusy(false);
    if (!result.ok) {
      setMutationError(result.error.message);
      return false;
    }
    applyMutationEnvelope(result.data);
    setNotice("Objectives saved.");
    return true;
  }

  async function confirmMutation() {
    if (!confirmation || mutationBusy) return;
    const item = snapshot.projects.find((candidate) => candidate.project.id === confirmation.projectId);
    if (!item) return;
    setMutationBusy(true);
    setMutationError("");
    try {
      if (confirmation.kind === "project-complete") {
        if (!item.project.updatedAt) return;
        const result = await repository.update("projects", item.project.id, { lifecycle: "complete" }, item.project.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`${result.data.project.name} was marked complete. The project remains auditable.`);
      } else if (confirmation.kind === "project-archive") {
        if (!item.project.updatedAt || !confirmationReason.trim()) return;
        const result = await repository.update("projects", item.project.id, {
          lifecycle: "archived",
          archiveReason: confirmationReason.trim(),
          archiveConfirmed: true
        }, item.project.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`${result.data.project.name} was archived without deleting history or linked objects.`);
      } else if (confirmation.kind === "project-restore") {
        if (!item.project.updatedAt) return;
        const restoreLifecycle = item.project.lifecycleBeforeArchive || "active";
        const result = await repository.update("projects", item.project.id, { lifecycle: restoreLifecycle }, item.project.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`${result.data.project.name} was restored to ${displayLabel(result.data.project.lifecycle)}.`);
      } else if (confirmation.kind === "milestone-complete") {
        const milestone = item.milestones.find((candidate) => candidate.id === confirmation.objectId);
        if (!milestone) return;
        const result = await repository.update("milestones", milestone.id, {
          state: "complete",
          completionNote: confirmationReason.trim() || "Completion confirmed from the Projects timeline."
        }, milestone.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`Milestone “${result.data.item.title}” was completed.`);
      } else if (confirmation.kind === "link-remove") {
        const link = item.links.find((candidate) => candidate.id === confirmation.objectId);
        if (!link || !confirmationReason.trim()) return;
        const result = await repository.update("links", link.id, {
          linkState: "removed",
          removalReason: confirmationReason.trim()
        }, link.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`The project reference was removed. “${link.source.label}” was not deleted.`);
      } else if (confirmation.kind === "link-restore") {
        const link = item.links.find((candidate) => candidate.id === confirmation.objectId);
        if (!link) return;
        const result = await repository.update("links", link.id, { linkState: "active" }, link.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`The reference to “${link.source.label}” was restored.`);
      }
      setConfirmation(null);
      setConfirmationReason("");
    } finally {
      setMutationBusy(false);
    }
  }

  const sourceErrors = Object.entries(snapshot.sourceAvailability)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([source, error]) => `${displayLabel(source)}: ${error}`);
  const countForView = (candidateView: ProjectView) => queryScopedProjects.filter((item) => matchesView(item, candidateView)).length;

  const sidebarSections: readonly ModuleSidebarSection[] = [
    {
      id: "projects",
      label: "Projects",
      items: (["all", "active", "planned", "attention", "blocked"] as const).map((itemView) => ({
        id: itemView,
        label: VIEW_LABELS[itemView],
        count: countForView(itemView),
        active: view === itemView,
        tone: itemView === "attention" ? "attention" as const : itemView === "blocked" ? "danger" as const : undefined,
        onSelect: () => selectView(itemView)
      }))
    },
    {
      id: "smart-views",
      label: "Smart Views",
      items: (["due", "needs-review", "linked"] as const).map((itemView) => ({
        id: itemView,
        label: VIEW_LABELS[itemView],
        count: countForView(itemView),
        active: view === itemView,
        onSelect: () => selectView(itemView)
      }))
    },
    {
      id: "data",
      label: "Data",
      items: [
        {
          id: "templates",
          label: "Templates",
          disabled: true,
          disabledReason: "Native Project template persistence is an open product decision."
        },
        {
          id: "archive",
          label: "Archive",
          count: countForView("archived"),
          active: view === "archived",
          onSelect: () => selectView("archived")
        },
        {
          id: "missing-context",
          label: "Missing Context",
          count: queryScopedProjects.filter((item) => !item.project.description || item.project.objectives.length === 0).length,
          active: filter === "missing-owner",
          onSelect: () => {
            setView("all");
            setFilter("missing-owner");
            updateUrl({ view: "all", filter: "missing-owner" });
          }
        },
        {
          id: "settings",
          label: "Project Settings",
          disabled: true,
          disabledReason: "Module settings are intentionally deferred until permissions and native defaults are resolved."
        }
      ]
    }
  ];

  function projectQuickActions(item: ProjectDirectoryItem): readonly QuickAction[] {
    const native = item.project.editable;
    if (!native) {
      return [
        {
          id: "promote",
          label: "Start tracking",
          intent: "primary",
          onSelect: () => openEditor("legacy-promote", item)
        },
        {
          id: "open-legacy",
          label: "Open legacy command center",
          href: item.project.legacyRoute,
          disabled: !item.project.legacyRoute,
          disabledReason: "No legacy route was recorded for this project."
        }
      ];
    }
    if (item.project.lifecycle === "archived") {
      return [
        {
          id: "restore",
          label: "Restore project",
          intent: "primary",
          onSelect: () => {
            setConfirmationReason("");
            setConfirmation({ kind: "project-restore", projectId: item.project.id });
          }
        },
        { id: "decision", label: "Open decisions", href: personalOpsCreateHref("decisions", item.project) },
        { id: "follow-up", label: "Open follow-ups", href: personalOpsCreateHref("follow-ups", item.project) }
      ];
    }
    if (item.project.lifecycle === "complete") {
      return [
        {
          id: "complete",
          label: "Completed · read only",
          disabled: true,
          disabledReason: "Completed projects are read-only. Reopen behavior is intentionally unfinished."
        },
        { id: "decision", label: "Open decisions", href: personalOpsCreateHref("decisions", item.project) },
        { id: "follow-up", label: "Open follow-ups", href: personalOpsCreateHref("follow-ups", item.project) }
      ];
    }
    return [
      {
        id: "interaction",
        label: "Log update",
        onSelect: () => openEditor("interaction-create", item)
      },
      {
        id: "milestone",
        label: "Add milestone",
        onSelect: () => openEditor("milestone-create", item)
      },
      { id: "blocker", label: "Add blocker", onSelect: () => openEditor("blocker-create", item) },
      { id: "link", label: "Link object", onSelect: () => openEditor("link-create", item, undefined, { linkScope: "object", sourceModule: "media" }) },
      {
        id: "decision",
        label: "File decision",
        href: personalOpsCreateHref("decisions", item.project)
      }
    ];
  }

  function renderStateChip(value: string, label?: string) {
    return <span className={styles.stateChip} data-tone={stateTone(value)}>{label || displayLabel(value)}</span>;
  }

  function renderProjectHeader(item: ProjectDirectoryItem, headingLevel: "h1" | "h2") {
    const Heading = headingLevel;
    return (
      <header className={styles.projectHero}>
        <Heading>{item.project.name}</Heading>
        <div className={styles.projectHeroActions}>
        {item.project.editable && (
          <button type="button" className={styles.iconButton} onClick={() => void toggleStar(item)} disabled={mutationBusy || ["complete", "archived"].includes(item.project.lifecycle)} title={item.project.starred ? "Remove star" : "Star project"} aria-label={item.project.starred ? "Remove star" : "Star project"}>
            {item.project.starred ? "★" : "☆"}
          </button>
        )}
        <details className={styles.projectMenu}>
          <summary className={styles.iconButton} aria-label="More project options">•••</summary>
          <div className={styles.projectMenuPanel} role="menu">
            {item.project.editable ? <>
              <button type="button" role="menuitem" onClick={() => openEditor("project-edit", item)} disabled={["complete", "archived"].includes(item.project.lifecycle)}>Edit project</button>
              <button type="button" role="menuitem" data-danger="true" disabled={item.project.lifecycle === "archived"} onClick={() => {
                setConfirmationReason("");
                setConfirmation({ kind: "project-archive", projectId: item.project.id });
              }}>Delete project</button>
            </> : <button type="button" role="menuitem" onClick={() => openEditor("legacy-promote", item)}>Start tracking</button>}
            {isInspectorOverlay && <button type="button" role="menuitem" onClick={() => setInspectorOpen(false)}>Close panel</button>}
          </div>
        </details>
        </div>
      </header>
    );
  }

  function projectActivity(item: ProjectDirectoryItem) {
    const timeline = item.timelineEvents.map((event) => ({
      id: event.id,
      title: event.title,
      summary: event.summary,
      occurredAt: event.occurredAt,
      tone: activityTone(event),
      href: "",
      isManual: event.isManual
    }));
    const decisionActivity = getLinkedDecisions(decisions, projectDecisionSource(item.project)).map((decision) => ({
      id: `decision-${decision.id}`,
      title: decision.title,
      summary: decision.description || "Decision recorded",
      occurredAt: decision.updatedAt || decision.createdAt,
      tone: "decision",
      href: decisionOwnerRoute(decision),
      isManual: false
    }));
    return [...timeline, ...decisionActivity].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }

  function renderLinkedRows(item: ProjectDirectoryItem, modules?: readonly ModuleId[]) {
    const rows = modules
      ? item.linkedContext.filter((context) => modules.includes(context.ref.module))
      : item.linkedContext;
    if (!rows.length) {
      return <SystemState variant="empty" compact title="No linked objects in this view" description="Use Link object to store a typed reference. The source object remains in its owner module." />;
    }
    return (
      <ul className={styles.linkList}>
        {rows.map((context, index) => (
          <li key={`${context.ref.module}-${context.ref.objectId}-${context.relationship}-${index}`}>
            <span className={styles.itemBody}>
              <strong>{context.ref.label}</strong>
              <small>{displayLabel(context.ref.module)} · {displayLabel(context.relationship)}{context.summary ? ` · ${excerpt(context.summary, 70)}` : ""}</small>
            </span>
            <Link className={styles.textLink} href={context.ref.route}>Open source</Link>
          </li>
        ))}
      </ul>
    );
  }

  function renderReviewCoverage(
    item: ProjectDirectoryItem,
    source?: { objectType: "milestone" | "blocker"; objectId: string; label: string },
    compact = false
  ) {
    const target = projectReviewSource(item.project, source);
    const contexts = source
      ? getProjectSourceReviewContexts(reviewViews, target)
      : getProjectReviewContexts(reviewViews, item.project.id);
    const targetLabel = source ? displayLabel(source.objectType) : "project";
    const Heading = compact ? "h3" : "h2";
    return (
      <section
        className={`${styles.panel} ${styles.reviewCoverage}`}
        data-wide={!compact || undefined}
        data-compact={compact || undefined}
        aria-busy={reviewsLoading || undefined}
      >
        <div className={styles.panelHeader}>
          <div>
            <Heading>Reviews</Heading>
          </div>
          <div className={styles.inlineActions}>
            <button
              type="button"
              className={styles.button}
              onClick={() => void refreshReviewContext()}
              disabled={reviewsLoading}
              aria-label={`Refresh Review coverage for ${target.label}`}
            >{reviewsLoading ? "Refreshing…" : "Refresh"}</button>
            <Link className={styles.button} href={buildProjectReviewHandoffRoute(target)}>Link review</Link>
          </div>
        </div>
        {reviewsError && (
          <SystemState
            variant="error"
            compact
            title="Current Review state could not be refreshed"
            description={`${reviewsError} Last-known Review context remains visible.`}
            action={{ label: "Retry", onSelect: () => void refreshReviewContext() }}
          />
        )}
        {contexts.length ? (
          <ul className={styles.reviewCoverageList}>
            {contexts.map((context) => {
              const repairLink = context.links.find((link) => link.state === "stale" || link.state === "broken");
              return (
                <li key={context.reviewRef.objectId}>
                  <span className={styles.itemBody}>
                    <strong>{context.title}</strong>
                    <small>
                      {displayLabel(context.cadence)} · {displayLabel(context.lifecycle)} · {context.blockerCount} completion blocker{context.blockerCount === 1 ? "" : "s"}
                    </small>
                  </span>
                  <span className={styles.inlineActions}>
                    <span className={styles.rowState} data-tone={context.linkState === "linked" ? "green" : context.linkState === "broken" ? "red" : "amber"}>
                      {displayLabel(context.linkState)}
                    </span>
                    {context.current && <span className={styles.relationshipChip} data-tone="blue">Current</span>}
                    {repairLink
                      ? <Link className={styles.textLink} href={`${context.reviewRef.route}?tab=overview&item=${encodeURIComponent(repairLink.id)}`}>Repair in Reviews</Link>
                      : <Link className={styles.textLink} href={context.reviewRef.route}>Open ReviewRun</Link>}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <SystemState
            variant="empty"
            compact
            title="No linked reviews yet"
            description={`Link a review when this ${targetLabel} needs one.`}
          />
        )}
      </section>
    );
  }

  function renderOverview(item: ProjectDirectoryItem) {
    const blockers = openBlockers(item);
    const activity = projectActivity(item);
    const readOnly = !item.project.editable || ["complete", "archived"].includes(item.project.lifecycle);
    return (
      <>
        <QuickActionBar
          actions={projectQuickActions(item)}
          label={<strong>Quick actions</strong>}
          ariaLabel={`${item.project.name} quick actions`}
        />
        <div className={styles.signalStrip} aria-label="Project summary">
          <button type="button" onClick={() => selectTab("timeline")}><strong>{activeMilestones(item).length}</strong><span>Milestones</span></button>
          <button type="button" onClick={() => selectTab("timeline")} data-alert={blockers.length || undefined}><strong>{blockers.length}</strong><span>Blockers</span></button>
          <button type="button" onClick={() => selectTab("files-links")}><strong>{item.linkedContext.length}</strong><span>Links</span></button>
          <button type="button" onClick={() => selectTab("properties")} data-alert={item.attentionReasons.length || undefined}><strong>{item.attentionReasons.length}</strong><span>Checks</span></button>
        </div>
        <div className={styles.overviewGrid}>
          <section className={`${styles.panel} ${styles.contextPanel}`} data-wide="true">
            <div className={styles.panelHeader}>
              <h2>Project context</h2>
            </div>
            <p>{item.project.description || "No project description yet."}</p>
          </section>
          <ProjectObjectivesEditor
            objectives={item.project.objectives}
            readOnly={readOnly}
            busy={mutationBusy}
            onSave={(objectives) => saveObjectives(item, objectives)}
          />
          <section className={styles.panel} data-wide="true">
            <div className={styles.panelHeader}>
              <h2>Recent work</h2>
              <button type="button" className={styles.button} onClick={() => openEditor("interaction-create", item)} disabled={readOnly}>Log update</button>
            </div>
            {activity.length ? <ol className={styles.recentWorkList}>{activity.map((event) => <li key={event.id}><span className={styles.timelineDot} data-tone={event.tone} aria-hidden="true" />{event.href ? <Link className={styles.activityLink} href={event.href}><strong>{event.title}</strong><small>{event.summary}</small></Link> : <button type="button" onClick={() => selectChild(event.id, "timeline")}><strong>{event.title}</strong><small>{event.summary}</small></button>}<time>{formatTimestamp(event.occurredAt)}</time></li>)}</ol> : <p>No work logged yet.</p>}
          </section>
        </div>
      </>
    );
  }

  function renderTimeline(item: ProjectDirectoryItem) {
    const readOnly = !item.project.editable || ["complete", "archived"].includes(item.project.lifecycle);
    const activity = projectActivity(item);
    return (
      <div className={styles.timelineLayout}>
        <section className={`${styles.panel} ${styles.timelineActivityPanel}`}>
          <div className={styles.panelHeader}>
            <h2>Activity</h2>
            <button type="button" className={styles.button} data-primary="true" onClick={() => openEditor("interaction-create", item)} disabled={readOnly}>Log update</button>
          </div>
          {activity.length ? <ol className={styles.timelineList}>{activity.map((event) => (
            <li key={event.id} aria-current={selectedChildId === event.id || undefined}>
              <span className={styles.timelineDot} data-tone={event.tone} aria-hidden="true" />
              <span className={styles.itemBody}><strong>{event.title}</strong><small>{event.summary}</small></span>
              <time className={styles.timelineMeta}>{formatTimestamp(event.occurredAt)}</time>
              {event.href ? <Link className={styles.textLink} href={event.href}>Open</Link> : <button type="button" className={styles.button} onClick={() => selectChild(event.id, "timeline")}>View</button>}
            </li>
          ))}</ol> : <p>No activity yet.</p>}
        </section>
        <aside className={styles.timelineSide}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2>Milestones</h2><button type="button" className={styles.button} onClick={() => openEditor("milestone-create", item)} disabled={readOnly}>Add milestone</button></div>
            {item.milestones.length ? <ul className={styles.objectList}>{item.milestones.map((milestone) => <li key={milestone.id} aria-current={selectedChildId === milestone.id || undefined}><span className={styles.itemBody}><strong>{milestone.title}</strong><small>{formatDate(milestone.dueAt)} · {displayLabel(milestone.state)}</small></span><span className={styles.inlineActions}><button type="button" className={styles.button} onClick={() => selectChild(milestone.id, "timeline")}>View</button>{!["complete", "archived"].includes(milestone.state) && <button type="button" className={styles.button} disabled={readOnly || !milestone.completionCriteria.length} onClick={() => { setConfirmationReason(""); setConfirmation({ kind: "milestone-complete", projectId: item.project.id, objectId: milestone.id }); }}>Complete</button>}</span></li>)}</ul> : <p>No milestones yet.</p>}
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2>Blockers</h2><button type="button" className={styles.button} onClick={() => openEditor("blocker-create", item)} disabled={readOnly}>Add blocker</button></div>
            {item.blockers.length ? <ul className={styles.objectList}>{item.blockers.map((blocker) => <li key={blocker.id} aria-current={selectedChildId === blocker.id || undefined}><span className={styles.itemBody}><strong>{blocker.title}</strong><small>{displayLabel(blocker.state)} · {displayLabel(blocker.severity)}</small></span><span className={styles.inlineActions}><button type="button" className={styles.button} onClick={() => selectChild(blocker.id, "timeline")}>View</button>{blocker.state === "open" && <button type="button" className={styles.button} disabled={readOnly} onClick={() => openEditor("blocker-resolve", item, blocker)}>Resolve</button>}</span></li>)}</ul> : <p>No blockers.</p>}
          </section>
        </aside>
      </div>
    );
  }

  function renderNotesDecisions(item: ProjectDirectoryItem) {
    const noteContext = item.linkedContext.filter((context) => context.ref.module === "notes");
    const readOnly = !item.project.editable || ["complete", "archived"].includes(item.project.lifecycle);
    return (
      <div className={styles.overviewGrid}>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}>
            <h2>Notes</h2>
            <span className={styles.inlineActions}>
              <Link className={styles.button} href={nativeCreateHref("notes", item.project)}>New note</Link>
              <button type="button" className={styles.button} onClick={() => openEditor("link-create", item, undefined, { linkScope: "note", sourceModule: "notes", sourceObjectType: "note", relationship: "source_material" })} disabled={readOnly}>Link note</button>
            </span>
          </div>
          {noteContext.length ? renderLinkedRows(item, ["notes"]) : <p>No linked notes yet.</p>}
        </section>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}>
            <h2>Decisions</h2>
            <span className={styles.inlineActions}><Link className={styles.button} href={personalOpsCreateHref("decisions", item.project)}>File decision</Link><button type="button" className={styles.button} onClick={() => void refreshDecisions()} disabled={decisionsLoading}>{decisionsLoading ? "Refreshing…" : "Refresh"}</button></span>
          </div>
          <LinkedDecisionsPanel source={projectDecisionSource(item.project)} decisions={decisions} loading={decisionsLoading} error={decisionsError} onRefresh={() => void refreshDecisions()} createHref={personalOpsCreateHref("decisions", item.project)} className={styles.embeddedPanel} compact showHeader={false} showBoundary={false} title="Project decisions" />
        </section>
      </div>
    );
  }

  function renderPeople(item: ProjectDirectoryItem) {
    const people = item.links.filter((link) => link.source.module === "people" && link.linkState !== "removed");
    return (
      <div className={styles.overviewGrid}>
        <section className={styles.panel} data-wide="true" data-project-people={item.project.id}>
          <div className={styles.panelHeader}>
            <h2>People</h2>
            <span className={styles.inlineActions}>
              <Link className={styles.textLink} href={nativeCreateHref("people", item.project)}>Open People</Link>
              <button
                type="button"
                className={styles.button}
                onClick={() => openEditor("link-create", item, undefined, {
                  sourceModule: "people",
                  sourceObjectType: "person",
                  linkScope: "people",
                  relationship: "project_person"
                })}
                disabled={!item.project.editable || ["complete", "archived"].includes(item.project.lifecycle)}
                title={["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined}
              >
                Link person
              </button>
            </span>
          </div>
          {people.length ? (
            <ul className={styles.peopleList}>
              {people.map((link) => (
                <li key={link.id}>
                  <span className={styles.personAvatar} aria-hidden="true">{initials(link.source.label)}</span>
                  <span className={styles.itemBody}>
                    <strong><Link href={link.source.route}>{link.source.label}</Link></strong>
                    <small>{link.role || "Project contributor"}</small>
                    {link.projectSpecificNote && <span>{link.projectSpecificNote}</span>}
                  </span>
                  <button type="button" className={styles.button} onClick={() => selectChild(link.id, "people")}>Manage</button>
                </li>
              ))}
            </ul>
          ) : <SystemState variant="empty" compact title="No linked people" description="Add an existing People identity and record their role when useful." />}
        </section>
      </div>
    );
  }

  function renderFilesLinks(item: ProjectDirectoryItem) {
    const objectLinks = item.links.filter((link) => link.source.module !== "people" && link.source.module !== "notes" && !(link.source.module === "personal_ops" && link.source.objectType === "decision"));
    const readOnly = !item.project.editable || ["complete", "archived"].includes(item.project.lifecycle);
    return (
      <div className={styles.overviewGrid}>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}>
            <h2>Files & resources</h2>
            <button type="button" className={styles.button} data-primary="true" onClick={() => openEditor("link-create", item, undefined, { linkScope: "object", sourceModule: "media" })} disabled={readOnly}>Link object</button>
          </div>
          {objectLinks.length ? (
            <ul className={styles.linkList}>
              {objectLinks.map((link) => (
                <li key={link.id} aria-current={selectedChildId === link.id || undefined} data-link-state={link.linkState}>
                  <span className={styles.itemBody}>
                    <strong>{link.source.label}</strong>
                    {link.healthNote && <span>{displayLabel(link.linkState)}: {link.healthNote}</span>}
                    {link.lastRepair && <span>Last repaired {formatDate(link.lastRepair.repairedAt)}: {link.lastRepair.reason}</span>}
                    <small>{displayLabel(link.source.module)} · {displayLabel(link.relationship)} · {displayLabel(link.linkState)}{link.isRequiredEvidence ? " · required evidence" : ""}</small>
                  </span>
                  <span className={styles.rowState} data-tone={stateTone(link.linkState)}>{displayLabel(link.linkState)}</span>
                  <span className={styles.inlineActions}>
                    <button type="button" className={styles.button} onClick={() => selectChild(link.id, "files-links")}>Manage</button>
                    {linkSourceIsUnsafe(link) ? (
                      <button type="button" className={styles.button} disabled title="Repair this retained association before opening its source.">Source unavailable</button>
                    ) : <Link className={styles.textLink} href={link.source.route}>Open source</Link>}
                    {linkNeedsRepair(link) ? (
                      <button type="button" className={styles.button} disabled={["complete", "archived"].includes(item.project.lifecycle)} title={["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined} onClick={() => openEditor("link-repair", item, link)}>Repair</button>
                    ) : link.linkState !== "removed" ? (
                      <button type="button" className={styles.button} disabled={["complete", "archived"].includes(item.project.lifecycle)} title={["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined} onClick={() => openEditor("link-health", item, link)}>Report issue</button>
                    ) : null}
                    {link.linkState === "removed" ? (
                      <button type="button" className={styles.button} disabled={["complete", "archived"].includes(item.project.lifecycle)} title={item.project.lifecycle === "complete" ? "Completed projects are read-only; reopen behavior is intentionally unavailable." : item.project.lifecycle === "archived" ? "Restore the project before restoring its links." : undefined} onClick={() => {
                        setConfirmationReason("");
                        setConfirmation({ kind: "link-restore", projectId: item.project.id, objectId: link.id });
                      }}>Restore</button>
                    ) : (
                      <button type="button" className={styles.button} data-danger="true" disabled={["complete", "archived"].includes(item.project.lifecycle)} title={["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined} onClick={() => {
                        setConfirmationReason("");
                        setConfirmation({ kind: "link-remove", projectId: item.project.id, objectId: link.id });
                      }}>Remove link</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p>No linked files or resources yet.</p>}
        </section>
        {renderReviewCoverage(item)}
      </div>
    );
  }

  function renderProperties(item: ProjectDirectoryItem) {
    return (
      <div className={styles.overviewGrid}>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}><h2>Properties</h2>{item.project.editable && <button type="button" className={styles.button} onClick={() => openEditor("project-edit", item)} disabled={["complete", "archived"].includes(item.project.lifecycle)}>Edit properties</button>}</div>
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>Status</span><strong>{displayLabel(item.project.lifecycle)}</strong></div>
            <div className={styles.fact}><span>Review cadence</span><strong>{item.project.defaultCadence ? displayLabel(item.project.defaultCadence) : "Not set"}</strong></div>
            <div className={styles.fact} data-mono="true"><span>Project ID</span><strong>{item.project.uuid}</strong></div>
            <div className={styles.fact} data-mono="true"><span>Slug</span><strong>{item.project.slug}</strong></div>
            <div className={styles.fact}><span>Last updated</span><strong>{formatTimestamp(item.project.updatedAt)}</strong></div>
          </div>
        </section>
      </div>
    );
  }

  function tabsFor(item: ProjectDirectoryItem): readonly DetailTab[] {
    const notesDecisions = item.linkedContext.filter((context) => context.ref.module === "notes" || (context.ref.module === "personal_ops" && context.ref.objectType === "decision")).length;
    return PROJECT_TABS.map((tab) => ({
      ...tab,
      count: tab.id === "timeline"
        ? item.timelineEvents.length
        : tab.id === "notes-decisions"
          ? notesDecisions
          : tab.id === "people"
            ? item.linkedContext.filter((context) => context.ref.module === "people").length
            : tab.id === "files-links"
              ? item.links.filter((link) => link.linkState !== "removed").length
              : undefined
    }));
  }

  function renderSelectedChildContext(item: ProjectDirectoryItem) {
    if (!selectedChildId) return null;
    const milestone = item.milestones.find((candidate) => candidate.id === selectedChildId);
    const blocker = item.blockers.find((candidate) => candidate.id === selectedChildId);
    const link = item.links.find((candidate) => candidate.id === selectedChildId);
    const timelineEvent = item.timelineEvents.find((candidate) => candidate.id === selectedChildId);
    const milestoneDecisionSource = milestone
      ? projectDecisionSource(item.project, {
          objectType: "milestone",
          objectId: milestone.id,
          label: milestone.title
        })
      : undefined;
    const blockerDecisionSource = blocker
      ? projectDecisionSource(item.project, {
          objectType: "blocker",
          objectId: blocker.id,
          label: blocker.title
        })
      : undefined;
    const hasMilestoneDecisionOwner = milestoneDecisionSource
      ? getLinkedDecisions(decisions, milestoneDecisionSource).length > 0
      : false;
    const hasBlockerDecisionOwner = blockerDecisionSource
      ? getLinkedDecisions(decisions, blockerDecisionSource).length > 0
      : false;
    const headingId = `project-selected-child-${selectedChildId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const parentReadOnly = ["complete", "archived"].includes(item.project.lifecycle);
    const parentReadOnlyReason = item.project.lifecycle === "complete"
      ? "Completed projects are read-only; reopen behavior is intentionally unavailable."
      : item.project.lifecycle === "archived"
        ? "Restore the project before changing its child objects."
        : undefined;

    function clearSelectedChild() {
      setSelectedChildId("");
      updateUrl({ item: initialDetail ? "" : item.project.id });
    }

    return (
      <section
        ref={selectedChildRef}
        className={styles.selectedChildPanel}
        tabIndex={-1}
        aria-labelledby={headingId}
        aria-live="polite"
      >
        <header className={styles.selectedChildHeader}>
          <div>
            <span className={styles.eyebrow}>Selected project object</span>
            <h2 id={headingId}>{milestone?.title || blocker?.title || link?.source.label || timelineEvent?.title || "Unavailable project object"}</h2>
          </div>
          <button type="button" className={styles.button} onClick={clearSelectedChild}>Close inspection</button>
        </header>

        {milestone && (
          <div className={styles.selectedChildBody}>
            <p>{milestone.description || "No milestone description recorded."}</p>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>State</span><strong>{displayLabel(milestone.state)}</strong></div>
              <div className={styles.fact}><span>Due</span><strong>{formatDate(milestone.dueAt)}</strong></div>
              <div className={styles.fact}><span>Owner</span><strong>{milestone.owner || "Missing"}</strong></div>
              <div className={styles.fact} data-mono="true"><span>Milestone ID</span><strong>{milestone.id}</strong></div>
            </div>
            <div>
              <strong>Completion criteria</strong>
              {milestone.completionCriteria.length ? <ul className={styles.criteriaList}>{milestone.completionCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul> : <p className={styles.notice}>No completion criteria are stored. Completion stays disabled until criteria are added.</p>}
            </div>
            <div className={styles.inlineActions} aria-label="Milestone owner actions">
              <Link className={styles.textLink} href={personalOpsCreateHref("follow-ups", item.project, { objectType: "milestone", objectId: milestone.id, label: milestone.title }, { dueAt: milestone.dueAt })}>Create follow-up</Link>
              {!hasMilestoneDecisionOwner && <Link className={styles.textLink} href={personalOpsCreateHref("decisions", item.project, { objectType: "milestone", objectId: milestone.id, label: milestone.title }, { dueAt: milestone.dueAt })}>File decision</Link>}
              {milestone.linkedRefs.map((ref) => <Link className={styles.textLink} href={ref.route} key={`${ref.module}-${ref.objectId}`}>Open {ref.label}</Link>)}
            </div>
            <LinkedFollowUpsPanel
              source={projectFollowUpSource(item.project, {
                objectType: "milestone",
                objectId: milestone.id,
                label: milestone.title
              })}
              followUps={followUps}
              loading={followUpsLoading}
              error={followUpsError}
              onRefresh={() => void refreshFollowUps()}
              createHref={personalOpsCreateHref("follow-ups", item.project, {
                objectType: "milestone",
                objectId: milestone.id,
                label: milestone.title
              }, { dueAt: milestone.dueAt })}
              compact
              title="Milestone follow-through"
            />
            <LinkedDecisionsPanel
              source={milestoneDecisionSource!}
              decisions={decisions}
              loading={decisionsLoading}
              error={decisionsError}
              onRefresh={() => void refreshDecisions()}
              createHref={personalOpsCreateHref("decisions", item.project, {
                objectType: "milestone",
                objectId: milestone.id,
                label: milestone.title
              }, { dueAt: milestone.dueAt })}
              compact
              title="Milestone decisions"
            />
            {renderReviewCoverage(item, { objectType: "milestone", objectId: milestone.id, label: milestone.title }, true)}
          </div>
        )}

        {blocker && (
          <div className={styles.selectedChildBody}>
            <p>{blocker.condition}</p>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>State</span><strong>{displayLabel(blocker.state)}</strong></div>
              <div className={styles.fact}><span>Severity</span><strong>{displayLabel(blocker.severity)}</strong></div>
              <div className={styles.fact}><span>Owner</span><strong>{blocker.owner || "Missing"}</strong></div>
              <div className={styles.fact}><span>Due</span><strong>{formatDate(blocker.dueAt)}</strong></div>
            </div>
            {blocker.resolution && <p><strong>Resolution:</strong> {blocker.resolution}</p>}
            <div className={styles.inlineActions}>
              {blocker.state === "open" && <button type="button" className={styles.button} disabled={parentReadOnly} title={parentReadOnlyReason} onClick={() => openEditor("blocker-resolve", item, blocker)}>Resolve blocker</button>}
              <Link className={styles.textLink} href={personalOpsCreateHref("follow-ups", item.project, { objectType: "blocker", objectId: blocker.id, label: blocker.title }, { dueAt: blocker.dueAt })}>Create follow-up</Link>
              {!hasBlockerDecisionOwner && <Link className={styles.textLink} href={personalOpsCreateHref("decisions", item.project, { objectType: "blocker", objectId: blocker.id, label: blocker.title }, { dueAt: blocker.dueAt })}>File decision</Link>}
              {blocker.sourceRefs.map((ref) => <Link className={styles.textLink} href={ref.route} key={`${ref.module}-${ref.objectId}`}>Open {ref.label}</Link>)}
            </div>
            <LinkedFollowUpsPanel
              source={projectFollowUpSource(item.project, {
                objectType: "blocker",
                objectId: blocker.id,
                label: blocker.title
              })}
              followUps={followUps}
              loading={followUpsLoading}
              error={followUpsError}
              onRefresh={() => void refreshFollowUps()}
              createHref={personalOpsCreateHref("follow-ups", item.project, {
                objectType: "blocker",
                objectId: blocker.id,
                label: blocker.title
              }, { dueAt: blocker.dueAt })}
              compact
              title="Blocker follow-through"
            />
            <LinkedDecisionsPanel
              source={blockerDecisionSource!}
              decisions={decisions}
              loading={decisionsLoading}
              error={decisionsError}
              onRefresh={() => void refreshDecisions()}
              createHref={personalOpsCreateHref("decisions", item.project, {
                objectType: "blocker",
                objectId: blocker.id,
                label: blocker.title
              }, { dueAt: blocker.dueAt })}
              compact
              title="Blocker decisions"
            />
            {renderReviewCoverage(item, { objectType: "blocker", objectId: blocker.id, label: blocker.title }, true)}
          </div>
        )}

        {link && (
          <div className={styles.selectedChildBody}>
            <p>{link.projectSpecificNote || (link.source.module === "people" ? "No additional context yet." : "No project note yet.")}</p>
            {link.healthNote && <div className={styles.boundary}><strong>{displayLabel(link.linkState)} association</strong>{link.healthNote}</div>}
            {link.lastRepair && <div className={styles.boundary}><strong>Last repaired {formatDate(link.lastRepair.repairedAt)}</strong>{link.lastRepair.reason} Previous source: {link.lastRepair.previousSource.label}.</div>}
            {link.source.module === "people" && <p><strong>Role:</strong> {link.role || "Project contributor"}</p>}
            <div className={styles.inlineActions}>
              {linkSourceIsUnsafe(link) ? (
                <button type="button" className={styles.button} disabled title="Repair this retained association before opening its source.">Source unavailable</button>
              ) : <Link className={styles.button} href={link.source.route}>Open {link.source.module === "people" ? "person" : "source"}</Link>}
              {link.linkState !== "removed" && !linkNeedsRepair(link) && <button type="button" className={styles.button} disabled={parentReadOnly} title={parentReadOnlyReason} onClick={() => openEditor("link-edit", item, link)}>Edit connection</button>}
              {linkNeedsRepair(link) ? (
                <button type="button" className={styles.button} disabled={parentReadOnly} title={parentReadOnlyReason} onClick={() => openEditor("link-repair", item, link)}>Repair association</button>
              ) : link.linkState !== "removed" ? (
                <button type="button" className={styles.button} disabled={parentReadOnly} title={parentReadOnlyReason} onClick={() => openEditor("link-health", item, link)}>Report issue</button>
              ) : null}
              {link.linkState === "removed" ? (
                <button type="button" className={styles.button} disabled={parentReadOnly} title={parentReadOnlyReason} onClick={() => {
                  setConfirmationReason("");
                  setConfirmation({ kind: "link-restore", projectId: item.project.id, objectId: link.id });
                }}>Restore link</button>
              ) : (
                <button type="button" className={styles.button} data-danger="true" disabled={parentReadOnly} title={parentReadOnlyReason} onClick={() => {
                  setConfirmationReason("");
                  setConfirmation({ kind: "link-remove", projectId: item.project.id, objectId: link.id });
                }}>Remove link</button>
              )}
            </div>
          </div>
        )}

        {timelineEvent && (
          <div className={styles.selectedChildBody}>
            <p>{timelineEvent.summary}</p>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>Event type</span><strong>{displayLabel(timelineEvent.eventType)}</strong></div>
              <div className={styles.fact}><span>Occurred</span><strong>{formatDate(timelineEvent.occurredAt)}</strong></div>
              <div className={styles.fact}><span>Health at event</span><strong>{displayLabel(timelineEvent.health)}</strong></div>
              <div className={styles.fact} data-mono="true"><span>Event ID</span><strong>{timelineEvent.id}</strong></div>
            </div>
            <div className={styles.inlineActions}>
              {timelineEvent.sourceRef && <Link className={styles.textLink} href={timelineEvent.sourceRef.route}>Open source</Link>}
              {timelineEvent.relatedObjectRef && <Link className={styles.textLink} href={timelineEvent.relatedObjectRef.route}>Open related object</Link>}
            </div>
          </div>
        )}

        {!milestone && !blocker && !link && !timelineEvent && (
          <SystemState variant="stale" compact title="Selected object is no longer available" description="The deep-linked child ID remains visible in the URL. Close this inspection to return to the project tab." />
        )}
      </section>
    );
  }

  function renderProjectBody(item: ProjectDirectoryItem) {
    const tabsId = `project-${item.project.id}`;
    return (
      <>
        <DetailTabs id={tabsId} tabs={tabsFor(item)} activeTab={activeTab} onTabChange={selectTab} ariaLabel={`${item.project.name} detail sections`} className={styles.tabs} />
        {mutationError && <p className={styles.errorBanner} role="alert">{mutationError}</p>}
        {notice && <p className={styles.successBanner} role="status">{notice}</p>}
        {renderSelectedChildContext(item)}
        <DetailTabPanel tabsId={tabsId} tabId="overview" active={activeTab === "overview"}>{renderOverview(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="timeline" active={activeTab === "timeline"}>{renderTimeline(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="notes-decisions" active={activeTab === "notes-decisions"}>{renderNotesDecisions(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="people" active={activeTab === "people"}>{renderPeople(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="files-links" active={activeTab === "files-links"}>{renderFilesLinks(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="properties" active={activeTab === "properties"}>{renderProperties(item)}</DetailTabPanel>
      </>
    );
  }

  function renderCompletionRail(item: ProjectDirectoryItem) {
    const incompleteMilestones = activeMilestones(item);
    const blockers = openBlockers(item);
    return (
      <>
        <section className={styles.panel}>
          <h2>Project progress</h2>
          <ul className={styles.guardList}>
            <li><span>Objectives</span><strong>{item.project.objectives.length}</strong></li>
            <li><span>Open milestones</span><strong>{incompleteMilestones.length}</strong></li>
            <li><span>Open blockers</span><strong>{blockers.length}</strong></li>
            <li><span>Linked context</span><strong>{item.linkedContext.length}</strong></li>
          </ul>
        </section>
        {item.attentionReasons.length > 0 && <section className={styles.panel}>
          <h2>Needs attention</h2>
          {item.attentionReasons.length ? <ul className={styles.guardList}>{item.attentionReasons.map((reason) => <li key={reason}><span>{reason}</span><span className={styles.rowState} data-tone="amber">Review</span></li>)}</ul> : <p>No current native attention reasons.</p>}
        </section>}
        <section className={styles.panel}>
          <h2>Actions</h2>
          <div className={styles.inlineActions}>
            <button type="button" className={styles.button} onClick={() => openEditor("interaction-create", item)}>Log update</button>
            <Link className={styles.button} href={personalOpsCreateHref("follow-ups", item.project)}>Follow-up</Link>
            <Link className={styles.button} href={personalOpsCreateHref("decisions", item.project)}>Decision</Link>
          </div>
        </section>
      </>
    );
  }

  const editorTitle = editor?.kind === "project-create"
    ? "Create native project"
    : editor?.kind === "project-edit"
      ? "Edit project"
      : editor?.kind === "legacy-promote"
        ? "Start native project tracking"
        : editor?.kind === "milestone-create"
          ? "Add milestone"
          : editor?.kind === "blocker-create"
            ? "Add blocker"
        : editor?.kind === "blocker-resolve"
              ? "Resolve blocker"
              : editor?.kind === "interaction-create"
                ? "Log project update"
              : editor?.kind === "link-edit"
                ? "Edit connection"
              : editor?.kind === "link-health"
                ? "Report association issue"
                : editor?.kind === "link-repair"
                  ? "Repair source association"
                  : "Link native object";
  const editorDescription = editor?.kind === "legacy-promote"
    ? "Start tracking this project in the current workspace."
    : editor?.kind === "link-create"
      ? "Choose an existing item to connect to this project."
      : editor?.kind === "link-edit"
        ? "Update the role or context stored on this connection."
      : editor?.kind === "link-health"
        ? "Retains the source association and records why it needs attention. No source object is changed."
      : editor?.kind === "link-repair"
          ? "Replaces only this Project-owned source reference after verification. The previous identity stays in audit history."
        : editor?.kind === "interaction-create"
          ? "Add a dated progress note, problem, or blocker update to the project timeline."
      : "Changes are saved explicitly to the native Projects repository and recorded in audit history.";

  function renderEditorFields() {
    if (!editor) return null;
    const value = (name: string) => String(editor.values[name] ?? "");
    if (editor.kind === "project-create" || editor.kind === "project-edit") {
      return (
        <div className={styles.formGrid}>
          <label className={styles.field} data-wide="true">Project name<input name="name" value={value("name")} onChange={(event) => changeEditorValue("name", event.target.value)} required data-editor-autofocus /></label>
          <label className={styles.field} data-wide="true">Description<textarea name="description" value={value("description")} onChange={(event) => changeEditorValue("description", event.target.value)} /></label>
          <fieldset className={styles.repeatableField} data-wide="true">
            <legend>Objectives</legend>
            <ul>
              {(editor.objectives || []).map((objective, index) => <li key={objective.id}>
                <span aria-hidden="true">•</span>
                <input value={objective.text} onChange={(event) => updateEditorObjective(objective.id, { text: event.target.value })} aria-label={`Objective ${index + 1}`} placeholder="Describe an objective" />
                <button type="button" className={styles.removeObjectiveButton} onClick={() => {
                  setEditor((current) => current ? { ...current, objectives: current.objectives?.filter((item) => item.id !== objective.id) } : current);
                  setEditorDirty(true);
                }} aria-label={`Delete objective ${index + 1}`} title="Delete objective"><span aria-hidden="true">⌫</span></button>
              </li>)}
            </ul>
            <button type="button" className={styles.addRowButton} onClick={() => {
              setEditor((current) => current ? { ...current, objectives: [...(current.objectives || []), { id: `draft-objective-${crypto.randomUUID()}`, text: "", completed: false }] } : current);
              setEditorDirty(true);
            }}>+ Add objective</button>
          </fieldset>
          {editor.kind === "project-create" && <fieldset className={styles.repeatableField} data-wide="true">
            <legend>People</legend>
            <div className={styles.peopleEditorRows}>
              {(editor.people || []).map((person, index) => <div className={styles.personEditorRow} key={person.id}>
                <label>Person<select value={person.personId} onChange={(event) => updateEditorPerson(person.id, { personId: event.target.value })} aria-label={`Person ${index + 1}`}>
                  <option value="">Choose a People profile</option>
                  {initialPeople.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.profile?.fullName || candidate.title}</option>)}
                </select></label>
                <label>Role<input value={person.role} onChange={(event) => updateEditorPerson(person.id, { role: event.target.value })} placeholder="e.g. Client, designer" /></label>
                <label>Context<input value={person.context} onChange={(event) => updateEditorPerson(person.id, { context: event.target.value })} placeholder="Optional context" /></label>
                <button type="button" className={styles.iconButton} onClick={() => {
                  setEditor((current) => current ? { ...current, people: current.people?.filter((item) => item.id !== person.id) } : current);
                  setEditorDirty(true);
                }} aria-label={`Remove person ${index + 1}`}>×</button>
              </div>)}
            </div>
            <button type="button" className={styles.addRowButton} onClick={() => {
              setEditor((current) => current ? { ...current, people: [...(current.people || []), { id: `draft-person-${crypto.randomUUID()}`, personId: "", role: "", context: "" }] } : current);
              setEditorDirty(true);
            }}>+ Add person</button>
          </fieldset>}
          <label className={styles.field}>Status<select name="lifecycle" value={value("lifecycle")} onChange={(event) => changeEditorValue("lifecycle", event.target.value)}>
            {!(["idea", "developing", "active", "monitoring", "dormant"] as string[]).includes(value("lifecycle")) && <option value={value("lifecycle")}>{displayLabel(value("lifecycle"))} (legacy)</option>}
            {["idea", "developing", "active", "monitoring", "dormant"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}
          </select></label>
          <label className={styles.field}>Review cadence<select name="defaultCadence" value={value("defaultCadence")} onChange={(event) => changeEditorValue("defaultCadence", event.target.value)}>
            <option value="">Not set</option>
            {["weekly", "monthly", "quarterly", "biannual", "annual"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}
          </select></label>
          <label className={styles.field} data-wide="true">Completion target<textarea name="completionTarget" value={value("completionTarget")} onChange={(event) => changeEditorValue("completionTarget", event.target.value)} placeholder="What does done look like?" /></label>
        </div>
      );
    }
    if (editor.kind === "legacy-promote") {
      return (
        <>
          <div className={styles.formGrid}>
            <label className={styles.field} data-wide="true">Current objective<textarea value={value("objective")} onChange={(event) => changeEditorValue("objective", event.target.value)} autoFocus /></label>
          </div>
        </>
      );
    }
    if (editor.kind === "milestone-create") {
      return <div className={styles.formGrid}>
        <label className={styles.field} data-wide="true">Milestone title<input value={value("title")} onChange={(event) => changeEditorValue("title", event.target.value)} required autoFocus /></label>
        <label className={styles.field} data-wide="true">Description<textarea value={value("description")} onChange={(event) => changeEditorValue("description", event.target.value)} /></label>
        <label className={styles.field}>Due date<input type="date" value={value("dueAt")} onChange={(event) => changeEditorValue("dueAt", event.target.value)} required /></label>
        <label className={styles.field}>Owner<input value={value("owner")} onChange={(event) => changeEditorValue("owner", event.target.value)} /></label>
        <label className={styles.field} data-wide="true">Completion criteria<textarea value={value("completionCriteria")} onChange={(event) => changeEditorValue("completionCriteria", event.target.value)} placeholder="One criterion per line" required /></label>
      </div>;
    }
    if (editor.kind === "blocker-create") {
      return <div className={styles.formGrid}>
        <label className={styles.field} data-wide="true">Blocker title<input value={value("title")} onChange={(event) => changeEditorValue("title", event.target.value)} required autoFocus /></label>
        <label className={styles.field} data-wide="true">Blocking condition<textarea value={value("condition")} onChange={(event) => changeEditorValue("condition", event.target.value)} required /></label>
        <label className={styles.field}>Severity<select value={value("severity")} onChange={(event) => changeEditorValue("severity", event.target.value)}>{["low", "medium", "high", "critical"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}</select></label>
        <label className={styles.field}>Owner<input value={value("owner")} onChange={(event) => changeEditorValue("owner", event.target.value)} /></label>
        <label className={styles.field}>Due date<input type="date" value={value("dueAt")} onChange={(event) => changeEditorValue("dueAt", event.target.value)} /></label>
      </div>;
    }
    if (editor.kind === "blocker-resolve") {
      return <label className={styles.field}>Resolution record<textarea value={value("resolution")} onChange={(event) => changeEditorValue("resolution", event.target.value)} required autoFocus placeholder="What changed, and what evidence confirms the blocker is resolved?" /></label>;
    }
    if (editor.kind === "interaction-create") {
      return <div className={styles.formGrid}>
        <label className={styles.field} data-wide="true">Update title<input value={value("title")} onChange={(event) => changeEditorValue("title", event.target.value)} required data-editor-autofocus placeholder="What happened?" /></label>
        <label className={styles.field} data-wide="true">Details <span>Optional</span><textarea value={value("body")} onChange={(event) => changeEditorValue("body", event.target.value)} placeholder="Add context, a problem, a blocker, or what you worked on." /></label>
        <label className={styles.field}>Date & time<input type="datetime-local" value={value("occurredAt")} onChange={(event) => changeEditorValue("occurredAt", event.target.value)} required /></label>
      </div>;
    }
    if (editor.kind === "link-edit") {
      const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
      const link = item?.links.find((candidate) => candidate.id === editor.objectId);
      const editingPerson = link?.source.module === "people";
      return <div className={styles.formGrid}>
        <div className={styles.connectionIdentity} data-wide="true"><span>{editingPerson ? "Person" : "Linked object"}</span><strong>{link?.source.label || "Unavailable connection"}</strong></div>
        {editingPerson && <label className={styles.field}>Role<input value={value("role")} onChange={(event) => changeEditorValue("role", event.target.value)} autoFocus placeholder="e.g. Client, designer" /></label>}
        {!editingPerson && <>
          <label className={styles.field}>Relationship<select value={value("relationship")} onChange={(event) => changeEditorValue("relationship", event.target.value)}>{LINK_RELATIONSHIPS.map((relationship) => <option value={relationship} key={relationship}>{displayLabel(relationship)}</option>)}</select></label>
          <label className={styles.field}>Strength<select value={value("relationshipStrength")} onChange={(event) => changeEditorValue("relationshipStrength", event.target.value)}>{["weak", "normal", "strong"].map((strength) => <option value={strength} key={strength}>{displayLabel(strength)}</option>)}</select></label>
        </>}
        <label className={styles.field} data-wide="true">Context <span>Optional</span><textarea value={value("projectSpecificNote")} onChange={(event) => changeEditorValue("projectSpecificNote", event.target.value)} autoFocus={!editingPerson} /></label>
      </div>;
    }
    if (editor.kind === "link-health") {
      return <div className={styles.formGrid}>
        <label className={styles.field}>Observed state<select value={value("healthState")} onChange={(event) => changeEditorValue("healthState", event.target.value)} autoFocus>{["stale", "broken", "missing"].map((state) => <option value={state} key={state}>{displayLabel(state)}</option>)}</select></label>
        <label className={styles.field} data-wide="true">Health explanation<textarea value={value("healthReason")} onChange={(event) => changeEditorValue("healthReason", event.target.value)} maxLength={2000} required placeholder="What was checked, and why can this association no longer be trusted?" /><span>{value("healthReason").length}/2000 · preserved if the save fails</span></label>
        <div className={styles.boundary} data-wide="true"><strong>The link stays visible</strong>Broken and missing associations remain inspectable until you repair or explicitly remove them. The native source object is never deleted by this action.</div>
      </div>;
    }
    if (editor.kind === "link-repair") {
      return <div className={styles.formGrid}>
        <label className={styles.field}>Owner module<select value={value("sourceModule")} onChange={(event) => changeEditorValues({ sourceModule: event.target.value, sourceObjectType: "", sourceObjectId: "", sourceContainerObjectId: "", sourceLabel: "" })} autoFocus>{LINK_MODULES.map((module) => <option value={module} key={module}>{displayLabel(module)}</option>)}</select></label>
        <label className={styles.field}>Object type<input value={value("sourceObjectType")} onChange={(event) => changeEditorValue("sourceObjectType", event.target.value)} required /></label>
        <label className={styles.field}>Stable object ID<input value={value("sourceObjectId")} onChange={(event) => changeEditorValue("sourceObjectId", event.target.value)} required /></label>
        <label className={styles.field}>Parent / container ID<input value={value("sourceContainerObjectId")} onChange={(event) => changeEditorValue("sourceContainerObjectId", event.target.value)} placeholder="Required for nested Project or Review objects" /></label>
        <label className={styles.field} data-wide="true">Verified source label<input value={value("sourceLabel")} onChange={(event) => changeEditorValue("sourceLabel", event.target.value)} required /></label>
        <label className={styles.field} data-wide="true">Repair explanation<textarea value={value("repairReason")} onChange={(event) => changeEditorValue("repairReason", event.target.value)} maxLength={2000} required placeholder="What was verified, and why is this the correct native source?" /><span>{value("repairReason").length}/2000 · preserved if the save fails</span></label>
        <div className={styles.boundary} data-wide="true"><strong>Identity replacement only</strong>The relationship remains Project-owned. No Note, Resource, Media asset, Review, or other native object is copied, deleted, or merged.</div>
      </div>;
    }
    const linkScope = value("linkScope") || (value("sourceModule") === "people" ? "people" : "object");
    const linkingPeople = linkScope === "people";
    const linkingNote = linkScope === "note";
    const recordOptions = initialPersonalRecords
      .map((record) => ({ record, ref: personalRecordObjectRef(record) }))
      .filter((entry): entry is { record: PersonalRecord; ref: NativeObjectRef } => Boolean(entry.ref))
      .filter((entry) => linkingNote ? entry.ref.module === "notes" : entry.ref.module === value("sourceModule"));
    const reviewOptions = reviewViews.map((view) => createNativeObjectRef({
      module: "reviews",
      objectType: "review_run",
      objectId: view.run.id,
      label: view.run.title
    }));
    const objectOptions = value("sourceModule") === "reviews" ? reviewOptions : recordOptions.map((entry) => entry.ref);
    return <div className={styles.formGrid}>
      {linkingPeople ? (
        <label className={styles.field} data-wide="true">
          People identity
          <select
            aria-label="People identity"
            value={value("sourceObjectId")}
            onChange={(event) => {
              const person = initialPeople.find((candidate) => candidate.id === event.target.value);
              changeEditorValues({
                sourceObjectId: event.target.value,
                sourceObjectType: person?.className === "org" ? "organization" : "person",
                sourceLabel: person?.profile?.fullName || person?.title || ""
              });
            }}
            required
            autoFocus
          >
            <option value="">Choose an existing People identity</option>
            {initialPeople.map((person) => <option value={person.id} key={person.id}>{person.profile?.fullName || person.title}</option>)}
          </select>
        </label>
      ) : (
        <>
          {!linkingNote && <label className={styles.field}>Object type<select value={value("sourceModule")} onChange={(event) => changeEditorValues({
            sourceModule: event.target.value,
            sourceObjectType: "",
            sourceObjectId: "",
            sourceContainerObjectId: "",
            sourceLabel: "",
            relationship: event.target.value === "reviews" ? "review_input" : "supporting_context"
          })}>
            <option value="media">Files & media</option>
            <option value="resources">Resources</option>
            <option value="reviews">Reviews</option>
          </select></label>}
          <label className={styles.field} data-wide="true">{linkingNote ? "Note" : "Object"}<select value={value("sourceObjectId")} onChange={(event) => {
            const selected = objectOptions.find((option) => option.objectId === event.target.value);
            changeEditorValues({
              sourceObjectId: selected?.objectId || "",
              sourceObjectType: selected?.objectType || "",
              sourceContainerObjectId: selected?.containerObjectId || "",
              sourceLabel: selected?.label || ""
            });
          }} required autoFocus>
            <option value="">Choose an existing {linkingNote ? "note" : "object"}</option>
            {objectOptions.map((option) => <option value={option.objectId} key={`${option.module}-${option.objectId}`}>{option.label}</option>)}
          </select></label>
        </>
      )}
      {linkingPeople ? <>
        <label className={styles.field}>Role<input value={value("role")} onChange={(event) => changeEditorValue("role", event.target.value)} placeholder="e.g. Client, designer" /></label>
        <label className={styles.field} data-wide="true">Context <span>Optional</span><textarea value={value("projectSpecificNote")} onChange={(event) => changeEditorValue("projectSpecificNote", event.target.value)} placeholder="Anything else useful about their involvement" /></label>
      </> : <label className={styles.field} data-wide="true">Context <span>Optional</span><textarea value={value("projectSpecificNote")} onChange={(event) => changeEditorValue("projectSpecificNote", event.target.value)} /></label>}
    </div>;
  }

  const confirmationTarget = confirmation
    ? snapshot.projects.find((item) => item.project.id === confirmation.projectId) || null
    : null;
  const completionIssues = confirmation?.kind === "project-complete" && confirmationTarget
    ? [
        ...(confirmationTarget.project.objectives.length === 0 ? ["Record at least one project objective."] : []),
        ...activeMilestones(confirmationTarget).map((milestone) => `Complete or archive milestone: ${milestone.title}`),
        ...openBlockers(confirmationTarget).map((blocker) => `Resolve, waive, or carry forward blocker: ${blocker.title}`)
      ]
    : [];
  const confirmationNeedsReason = confirmation?.kind === "project-archive" || confirmation?.kind === "link-remove" || confirmation?.kind === "milestone-complete";
  const confirmationTitle = confirmation?.kind === "project-complete"
    ? "Complete this project?"
    : confirmation?.kind === "project-archive"
      ? "Delete this project?"
      : confirmation?.kind === "project-restore"
        ? "Restore this project?"
        : confirmation?.kind === "milestone-complete"
          ? "Complete this milestone?"
          : confirmation?.kind === "link-remove"
            ? "Remove this project link?"
            : "Restore this project link?";
  const confirmationDescription = confirmation?.kind === "project-complete"
    ? completionIssues.length
      ? "Completion is blocked until the native project gates below are satisfied."
      : "The project will be marked complete and retained with its links, timeline, and audit history."
    : confirmation?.kind === "project-archive"
      ? "The project will leave active views, but its history and links stay recoverable."
      : confirmation?.kind === "project-restore"
        ? "The project will return to active views. Existing history and references remain unchanged."
        : confirmation?.kind === "milestone-complete"
          ? "The milestone completion will be recorded on the native project timeline. Linked Personal Ops and Reviews records remain unchanged and keep their own lifecycle."
          : confirmation?.kind === "link-remove"
            ? "Only the Project reference will be removed. The source object remains unchanged in its owner module."
            : "The existing typed reference will return to its state from before removal.";

  const directory = (
    <DirectoryPane className={styles.directory} ariaLabel="Projects directory">
      <div className={styles.mainScroll}>
        <div className={styles.directoryHeader}>
          <div>
            <h1>Projects</h1>
            <p>{visibleProjects.length} shown · {snapshot.projects.length} total identities</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.button} onClick={() => {
              setCompact(!compact);
              updateUrl({ compact: !compact });
            }}>{compact ? "Comfortable" : "Compact"}</button>
            <button type="button" className={styles.button} disabled title="Saved-view persistence is an open product decision.">Save view</button>
            <button type="button" className={styles.button} data-primary="true" onClick={() => openEditor("project-create")}>New project</button>
          </div>
        </div>

        {initialLoadError && <SystemState variant="error" compact title="Some project sources did not load" description={initialLoadError} />}
        {sourceErrors.length > 0 && <p className={styles.notice} role="status">Some linked context could not be loaded. Native project data remains usable.</p>}
        {mutationError && <p className={styles.errorBanner} role="alert">{mutationError}</p>}
        {notice && <p className={styles.successBanner} role="status">{notice}</p>}

        <label className={styles.search}>
          <span aria-hidden="true">/</span>
          <span className="sr-only">Search projects and linked context</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              updateUrl({ query: event.target.value });
            }}
            placeholder="Search projects, milestones, blockers, linked context…"
          />
          <kbd aria-hidden="true">SEARCH</kbd>
        </label>

        <div className={styles.filterRow} role="toolbar" aria-label="Project filters">
          {(["all", "active", "due", "needs-review", "blocked", "linked", "missing-owner"] as const).map((itemFilter) => (
            <button
              type="button"
              className={styles.filterChip}
              data-active={filter === itemFilter}
              data-tone={itemFilter === "active" ? "green" : itemFilter === "blocked" || itemFilter === "missing-owner" ? "red" : itemFilter === "due" || itemFilter === "needs-review" ? "amber" : itemFilter === "linked" ? "blue" : undefined}
              aria-pressed={filter === itemFilter}
              onClick={() => {
                setFilter(itemFilter);
                updateUrl({ filter: itemFilter });
              }}
              key={itemFilter}
            >{FILTER_LABELS[itemFilter]}</button>
          ))}
        </div>

        <div className={styles.sortRow}>
          <div className={styles.sortControl}>
            <span>Sort</span>
            <select className={styles.selectControl} value={sort} onChange={(event) => {
              const nextSort = event.target.value as ProjectSort;
              setSort(nextSort);
              updateUrl({ sort: nextSort });
            }} aria-label="Sort projects">
              {Object.entries(SORT_LABELS).filter(([value]) => value !== "priority").map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </div>
          <span>{VIEW_LABELS[view]} · {FILTER_LABELS[filter]}</span>
        </div>

        {batchSelection.size > 0 && (
          <div className={styles.batchBar} role="status">
            <strong>{batchSelection.size} selected</strong>
            <span>Checkbox selection is independent from the inspector.</span>
            <button type="button" className={styles.button} disabled title="Batch archive needs per-project reason and consequence review; use each project’s Archive action.">Batch archive</button>
            <button type="button" className={styles.button} onClick={() => setBatchSelection(new Set())}>Clear</button>
          </div>
        )}

        {visibleProjects.length ? (
          <div className={styles.list} data-density={compact ? "compact" : "comfortable"} role="list" aria-label="Projects">
            {visibleProjects.map((item) => {
              const milestone = nextMilestone(item);
              const attention = item.attentionReasons[0];
              return (
                <DenseObjectRow
                  id={item.project.id}
                  title={item.project.name}
                  description={excerpt(item.project.description || item.project.objective || "No project context recorded.")}
                  leading={<span className={styles.rowAvatar} aria-label={`${item.project.name} initials`}>{initials(item.project.name)}</span>}
                  metadata={`${item.project.uuid} · ${item.linkedContext.length} links · ${activeMilestones(item).length} milestones`}
                  trailing={<>
                    <span className={styles.rowState} data-tone={stateTone(item.project.lifecycle)}>{displayLabel(item.project.lifecycle)}</span>
                    <span>{attention || (milestone ? `Next ${formatDate(milestone.dueAt)}` : `Updated ${formatDate(item.project.updatedAt)}`)}</span>
                  </>}
                  selected={selectedProjectId === item.project.id}
                  onSelect={() => selectProject(item)}
                  checkbox={{
                    checked: batchSelection.has(item.project.id),
                    onCheckedChange: (checked) => setChecked(item.project.id, checked),
                    label: `Select ${item.project.name} for batch actions`
                  }}
                  key={item.project.id}
                />
              );
            })}
          </div>
        ) : (
          <SystemState
            variant="empty"
            title="No projects match this operating view"
            description="Clear the search or choose All. Archived projects remain in the Archive view."
            action={{ label: "Clear view", onSelect: () => {
              setView("all");
              setFilter("all");
              setQuery("");
              updateUrl({ view: "all", filter: "all", query: "" });
            } }}
          />
        )}
      </div>
    </DirectoryPane>
  );

  const projectInspector = (
    <InspectorRail
      title={selectedItem ? renderProjectHeader(selectedItem, "h2") : undefined}
      overlay={isInspectorOverlay}
      overlayOpen={inspectorOpen}
      onRequestClose={() => setInspectorOpen(false)}
      ariaLabel={selectedItem ? `${selectedItem.project.name} inspector` : "Project inspector"}
    >
      {selectedItem ? renderProjectBody(selectedItem) : <div className={styles.emptyInspector}><h2>Select a project</h2><p>The inspector keeps native state, linked context, and safe actions together.</p></div>}
    </InspectorRail>
  );

  const completionRail = selectedItem ? (
    <InspectorRail
      title="Completion and context"
      overlay={isInspectorOverlay}
      overlayOpen={inspectorOpen}
      onRequestClose={() => setInspectorOpen(false)}
      ariaLabel={`${selectedItem.project.name} completion rail`}
    >
      {renderCompletionRail(selectedItem)}
    </InspectorRail>
  ) : undefined;

  const editorInspector = editor ? (
    <InspectorRail
      className={styles.editorRail}
      overlay={isInspectorOverlay}
      overlayOpen={inspectorOpen}
      onRequestClose={requestCloseEditor}
      ariaLabel={`${editorTitle} panel`}
      busy={mutationBusy}
    >
      <EditorSurface
        open
        title={editorTitle}
        description={editorDescription}
        busy={mutationBusy}
        error={editorError}
        onRequestClose={requestCloseEditor}
        onSubmit={submitEditor}
      >
        {renderEditorFields()}
      </EditorSurface>
    </InspectorRail>
  ) : undefined;

  return (
    <>
      <ModuleShell
        module="projects"
        mode={initialDetail ? "detail" : "directory"}
        className={`${styles.shell} ${initialDetail ? styles.detailShell : ""}`}
        ariaLabel={initialDetail && selectedItem ? `${selectedItem.project.name} project workspace` : "Projects workspace"}
        sidebar={<ModuleSidebar
          title="Projects"
          description="Native project operations and explicit legacy projections."
          sections={sidebarSections}
          className={styles.sidebar}
          mobileOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          footer={<p className={styles.sidebarFootnote}>Projects never imports legacy task counts as milestones or duplicates source objects from owner modules.</p>}
        />}
        inspector={editorInspector || (initialDetail ? completionRail : projectInspector)}
        aiDock={<SharedAIDock
          open={aiOpen}
          onOpenChange={(open) => {
            setAiOpen(open);
            updateUrl({ ai: open });
          }}
          context={{
            module: "projects",
            object: selectedItem?.project.nativeRef,
            activeTab,
            visibleScope: `${VIEW_LABELS[view]} · ${FILTER_LABELS[filter]}`,
            allowedActions: ["Summarize visible project state", "Draft a reviewed proposal"]
          }}
        />}
      >
        <button type="button" className={`${styles.iconButton} ${styles.mobileMenuButton}`} onClick={() => setMobileSidebarOpen(true)} aria-label="Open Projects navigation">☰</button>
        {isInspectorOverlay && selectedItem && <button type="button" className={`${styles.button} ${styles.mobileInspectorButton}`} onClick={() => setInspectorOpen(true)}>{initialDetail ? "Completion" : "Details"}</button>}
        {initialDetail ? (
          <div className={styles.mainScroll}>
            <div className={styles.mobileToolbar}><Link className={styles.textLink} href={getModuleRoute("projects")}>Back to projects</Link></div>
            {selectedItem ? <>{renderProjectHeader(selectedItem, "h1")}{renderProjectBody(selectedItem)}</> : <SystemState variant="error" title="Project not found" description="The requested project identity is not available in the current native or legacy snapshot." />}
          </div>
        ) : directory}
      </ModuleShell>

      {(mobileSidebarOpen || (isInspectorOverlay && inspectorOpen)) && <button type="button" className={styles.scrim} onClick={() => {
        setMobileSidebarOpen(false);
        if (editor) requestCloseEditor();
        else setInspectorOpen(false);
      }} aria-label="Close open Projects panel" />}

      <ConfirmationSheet
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={() => {
          setDiscardOpen(false);
          closeEditor();
        }}
        title="Discard unsaved changes?"
        description="Your current project form values have not been saved."
        consequences={["The open editor values will be cleared.", "No persisted project data will change."]}
        confirmLabel="Discard changes"
        tone="danger"
      />

      <ConfirmationSheet
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !mutationBusy) {
            setConfirmation(null);
            setConfirmationReason("");
          }
        }}
        onConfirm={confirmMutation}
        title={confirmationTitle}
        description={<>
          <p>{confirmationDescription}</p>
          {mutationError && <p className={styles.errorBanner} role="alert">{mutationError}</p>}
        </>}
        consequences={completionIssues}
        confirmLabel={confirmation?.kind === "project-archive" ? "Delete project" : confirmation?.kind === "link-remove" ? "Remove link" : confirmation?.kind === "project-restore" || confirmation?.kind === "link-restore" ? "Restore" : "Confirm completion"}
        tone={confirmation?.kind === "project-archive" || confirmation?.kind === "link-remove" ? "danger" : "default"}
        busy={mutationBusy}
        confirmDisabled={completionIssues.length > 0 || Boolean(confirmationNeedsReason && !confirmationReason.trim())}
        confirmDisabledReason={completionIssues.length ? "Resolve every listed completion gate first." : confirmationNeedsReason && !confirmationReason.trim() ? "A reason is required for this auditable mutation." : undefined}
      >
        {confirmationNeedsReason && (
          <label className={styles.field}>
            {confirmation?.kind === "project-archive" ? "Deletion reason" : confirmation?.kind === "link-remove" ? "Removal reason" : "Completion note"}
            <textarea value={confirmationReason} onChange={(event) => setConfirmationReason(event.target.value)} autoFocus={Boolean(confirmationNeedsReason)} />
          </label>
        )}
      </ConfirmationSheet>
    </>
  );
}
