"use client";
import ProjectDirectoryCards from "./ProjectDirectoryCards";
import PeopleProfilePhotoDialog, { PeopleProfileAvatar } from "../people/PeopleProfilePhoto";
import SelectField from "../ui/SelectField";
import ProjectProperties from "./ProjectProperties";
import ProjectLinkedItems, { ProjectLinkedItem } from "./ProjectLinkedItems";
import { PersonalOpsStatusChip, personalOpsToneForState } from "../personal-ops/PersonalOpsPrimitives";
import { personalStatusLabel } from "../../lib/modules/personal-ops/status-display";
import { workspaceReturnUrl } from "../admin-shell/useWorkspaceReturn";
import RelatedRecords from "../planning/RelatedRecords";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import ProjectDisclosure from "./ProjectDisclosure";
import { deriveProjectHealth } from "../../lib/modules/projects/health";
import { milestoneLabel } from "../../lib/modules/projects/milestone-display";
import type { ObjectivePreviewTarget } from "./ProjectObjectivePreview";
import ProjectObjectiveUndo from "./ProjectObjectiveUndo";
import { createPersonalOpsRepository } from "../../lib/modules/personal-ops/repository";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import DirectoryPane from "../admin-shell/DirectoryPane";
import { WorkspaceHeader, WorkspaceToolbar, WorkspaceButton } from "../admin-shell/WorkspaceKit";
import InspectorRail from "../admin-shell/InspectorRail";
import ModuleShell from "../admin-shell/ModuleShell";
import { useClientTimeZone } from "../admin-shell/useClientTimeZone";
import ModuleSidebar from "../admin-shell/ModuleSidebar";
import SharedAIDock from "../admin-shell/SharedAIDock";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import ConfirmationSheet from "../operational/ConfirmationSheet";
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
  getLinkedFollowUps,
  followUpOwnerRoute,
  type FollowUpSourceRef
} from "../../lib/modules/personal-ops/follow-up-links";
import type {
  PersonalOpsDecision,
  PersonalOpsGoal,
  PersonalOpsFollowUp
} from "../../lib/modules/personal-ops/types";
import { createProjectsRepository } from "../../lib/modules/projects/repository";
import { projectUuid } from "../../lib/modules/projects/identity";
import type {
  Project,
  ProjectLifecycleState,
  ProjectBlocker,
  ProjectBlockerSeverity,
  ProjectInteraction,
  ProjectLink,
  ProjectLinkRelationship,
  ProjectLinkUpdateInput,
  ProjectMilestone,
  ProjectObjectiveInput,
  ProjectTimelineEvent,
  ProjectTimelineEventType,
  ProjectsObjectByFamily
} from "../../lib/modules/projects/types";
import { PROJECT_TIMELINE_EVENT_TYPES } from "../../lib/modules/projects/types";
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
import type { AuditEvent } from "../../lib/native-objects/audit";
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
import inspectionStyles from "./ProjectInspection.module.css";

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
  | "milestone-edit"
  | "blocker-create"
  | "blocker-resolve"
  | "interaction-create"
  | "interaction-edit"
  | "link-create"
  | "link-edit"
  | "link-health"
  | "link-repair";

type ObjectiveCompletionUndo = {
  projectId: string;
  objective: ObjectivePreviewTarget;
  completedAt?: string;
  goalVersion?: string;
  previousGoalState?: PersonalOpsGoal["goalState"];
};

type EditorState = {
  kind: EditorKind;
  projectId?: string;
  objectId?: string;
  expectedUpdatedAt?: string;
  values: Record<string, string | boolean>;
  objectives?: EditorObjectiveDraft[];
  people?: EditorPersonDraft[];
};

type EditorObjectiveDraft = {
  id: string;
  text: string;
  targetAt: string;
  completed: boolean;
};

type EditorPersonDraft = {
  id: string;
  personId: string;
  role: string;
  context: string;
};

type ProjectActivityItem = {
  id: string;
  title: string;
  summary: string;
  occurredAt: string;
  tone: "system" | "people" | "object" | "blocker" | "milestone" | "decision" | "update";
  openHref: string;
  kind: "timeline" | "decision";
  filterKey: string;
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
  { id: "activity", label: "Activity" },
  { id: "links", label: "Links" },
  { id: "properties", label: "Properties" }
];
function visibleProjectTab(tab: ProjectTab) {
  if (tab === "timeline") return "activity";
  if (["people", "notes-decisions", "files-links"].includes(tab)) return "links";
  return tab;
}

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
  due: "Due 7 days",
  "due-month": "Due 30 days",
  "needs-review": "Needs review",
  blocked: "Blocked",
  linked: "Linked",
  "missing-owner": "Missing context",
  stale: "Stale",
  archived: "Archived"
};

const PROJECT_REVIEW_CADENCES = [
  { value: "NONE", label: "No cadence" },
  { value: "P1W", label: "Weekly" },
  { value: "P2W", label: "Every 2 weeks" },
  { value: "P1M", label: "Monthly" },
  { value: "P3M", label: "Quarterly" },
  { value: "P6M", label: "Every 6 months" },
  { value: "P1Y", label: "Yearly" }
] as const;

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

function reviewCadenceLabel(value?: string) {
  if (!value) return "Not set";
  return PROJECT_REVIEW_CADENCES.find((option) => option.value === value)?.label || displayLabel(value);
}

function formatDateInZone(value?: string, fallback = "Not recorded", timeZone = "UTC") {
  if (!value) return fallback;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: dateOnly ? "UTC" : timeZone,
    month: "short",
    day: "numeric",
    year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric"
  }).format(date);
}

function formatTimestampInZone(value?: string, fallback = "Not recorded", timeZone = "UTC") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric",
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

function ObjectiveDeleteIcon() {
  return <UnigentamosIcon role="delete" size={15} />;
}

function InspectIcon() {
  return <UnigentamosIcon role="search" size={16} />;
}

function OpenIcon() {
  return <UnigentamosIcon role="open" size={16} />;
}

function RowActionIcons({
  inspectLabel,
  onInspect,
  openHref,
  openLabel
}: {
  inspectLabel: string;
  onInspect?: () => void;
  openHref?: string;
  openLabel?: string;
}) {
  return (
    <span className={styles.activityActions}>
      {onInspect && <button
        type="button"
        className={styles.rowActionIcon}
        onClick={onInspect}
        aria-label={inspectLabel}
        title={inspectLabel}
       data-icon-button="compact"><InspectIcon /></button>}
      {openHref ? (
        <Link prefetch={false} className={styles.rowActionIcon} href={openHref} aria-label={openLabel || "Open linked item"} title={openLabel || "Open linked item"}><OpenIcon /></Link>
      ) : null}
    </span>
  );
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
  return activeMilestones(item).filter((milestone) => milestone.dueAt).sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0];
}

function hasDueItem(item: ProjectDirectoryItem, days = 7) {
  const limit = Date.now() + days * 24 * 60 * 60 * 1000;
  const dueDates = [
    ...activeMilestones(item).filter((milestone) => Date.parse(milestone.dueAt) >= Date.now()).map((milestone) => milestone.dueAt),
    ...item.project.objectives.filter((objective) => !objective.completedAt).map((objective) => objective.targetAt)
  ];
  return dueDates.some((dueAt) => {
    const time = Date.parse(dueAt || "");
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
  if (view === "due") return hasDueItem(item, 7);
  if (view === "needs-review") return item.project.review === "needs_review" || item.project.review === "in_review";
  if (view === "blocked") return item.project.health === "blocked" || openBlockers(item).length > 0;
  if (view === "linked") return item.linkedContext.length > 0;
  return item.project.lifecycle === "archived";
}

function matchesFilter(item: ProjectDirectoryItem, filter: ProjectFilter) {
  if (filter === "all") return item.project.lifecycle !== "archived";
  if (filter === "active") return ["active", "monitoring"].includes(item.project.lifecycle);
  if (filter === "planned") return ["idea", "developing", "planned", "draft"].includes(item.project.lifecycle);
  if (filter === "due") return hasDueItem(item, 7);
  if (filter === "due-month") return hasDueItem(item, 30);
  if (filter === "needs-review") return item.project.review === "needs_review" || item.project.review === "in_review";
  if (filter === "blocked") return item.project.health === "blocked" || openBlockers(item).length > 0;
  if (filter === "linked") return item.linkedContext.length > 0;
  if (filter === "missing-owner") return !item.project.description || item.project.objectives.length === 0;
  if (filter === "stale") return item.project.health === "stale" || item.project.cadence === "dormant" || item.project.lifecycle === "dormant";
  return item.project.lifecycle === "archived";
}

function dueValue(item: ProjectDirectoryItem) {
  return [
    nextMilestone(item)?.dueAt,
    ...item.project.objectives.filter((objective) => !objective.completedAt).map((objective) => objective.targetAt)
  ].filter((value): value is string => Boolean(value)).sort()[0] || "9999-12-31";
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
    photoUpdatedAt: project.photoUpdatedAt,
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
    createdAt: project.createdAt,
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

function activityTone(event: ProjectDirectoryItem["timelineEvents"][number]): ProjectActivityItem["tone"] {
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

function activityTitle(event: ProjectDirectoryItem["timelineEvents"][number]) {
  if (!event.eventType.startsWith("link_")) return event.title;
  const subject = event.sourceRef?.module === "people" ? "Person" : "Object";
  if (event.eventType === "link_created") return `${subject} linked`;
  if (event.eventType === "link_removed") return `${subject} link removed`;
  if (event.eventType === "link_restored") return `${subject} link restored`;
  if (event.eventType === "link_repaired") return `${subject} link repaired`;
  return `${subject} connection updated`;
}

function activityFilterKey(event: ProjectDirectoryItem["timelineEvents"][number]) {
  if (event.eventType.startsWith("milestone_")) return "milestones";
  if (event.eventType.startsWith("blocker_")) return "blockers";
  if (event.eventType.startsWith("link_") && event.sourceRef?.module === "people") return "person_linked";
  if (event.eventType.startsWith("link_") && event.sourceRef?.module === "personal_ops" && event.sourceRef.objectType === "decision") return "decision_linked";
  if (event.eventType.startsWith("link_")) return "object_linked";
  return event.eventType;
}

function activityFilterLabel(value: string) {
  const labels: Record<string, string> = {
    project_created: "Project created",
    project_updated: "Project updated",
    project_archived: "Project archived",
    project_restored: "Project restored",
    interaction_logged: "Updates",
    milestones: "Milestones",
    blockers: "Blockers",
    milestone_created: "Milestones",
    milestone_updated: "Milestones",
    milestone_completed: "Milestones",
    blocker_opened: "Blockers",
    blocker_updated: "Blockers",
    blocker_resolved: "Blockers",
    blocker_waived: "Blockers",
    blocker_carried_forward: "Blockers",
    person_linked: "People linked",
    object_linked: "Objects linked",
    decision_linked: "Decisions",
    legacy_project_promoted: "Project promoted"
  };
  return labels[value] || displayLabel(value);
}

const CHANGELOG_FIELDS: Readonly<Record<string, string>> = {
  name: "Name",
  description: "Description",
  objectives: "Objectives",
  lifecycle: "Status",
  defaultCadence: "Review cadence",
  completionTarget: "Completion target",
  starred: "Starred",
  source: "Linked source",
  relationship: "Relationship",
  relationshipStrength: "Strength",
  role: "Role",
  projectSpecificNote: "Description",
  linkState: "Link state",
  title: "Title",
  body: "Details",
  dueAt: "Due date",
  state: "State",
  severity: "Severity",
  eventType: "Event type",
  occurredAt: "Occurred"
};

function changeValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return "None";
    return value.map((item) => {
      if (item && typeof item === "object" && "text" in item) return String((item as { text?: unknown }).text || "Objective");
      return changeValue(item);
    }).join(", ");
  }
  if (typeof value === "object" && "label" in value) return String((value as { label?: unknown }).label || "Linked object");
  return "Updated";
}

function timelineChangeLog(event: ProjectTimelineEvent, auditEvents: readonly AuditEvent[]) {
  const timelineRef = createNativeObjectRef({
    module: "projects",
    objectType: "timeline_event",
    objectId: event.id,
    containerObjectId: event.projectId,
    label: event.title
  });
  const audits = auditEvents
    .filter((audit) => {
      const isTimelineEdit = audit.object.module === timelineRef.module &&
        audit.object.objectType === timelineRef.objectType &&
        audit.object.objectId === timelineRef.objectId;
      const isMatchingInteractionMutation = event.isManual &&
        audit.after?.occurredAt === event.occurredAt &&
        audit.after?.title === event.title &&
        audit.after?.body === event.summary;
      const isSourceMutation = Boolean(event.relatedObjectRef) &&
        audit.object.module === event.relatedObjectRef?.module &&
        audit.object.objectType === event.relatedObjectRef.objectType &&
        audit.object.objectId === event.relatedObjectRef.objectId &&
        (audit.occurredAt === event.createdAt || isMatchingInteractionMutation);
      return isTimelineEdit || isSourceMutation;
    })
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const entries = audits.flatMap((audit) => {
    const before = audit.before || {};
    const after = audit.after || {};
    return Object.keys(CHANGELOG_FIELDS).flatMap((key) => {
      const previous = before[key];
      const next = after[key];
      if (JSON.stringify(previous) === JSON.stringify(next)) return [];
      return [{
        id: `${audit.id}-${key}`,
        label: CHANGELOG_FIELDS[key],
        before: changeValue(previous),
        after: changeValue(next),
        occurredAt: audit.occurredAt
      }];
    });
  });
  return entries.slice(-12);
}

function EditorSurface({
  open,
  title,
  submitLabel,
  description,
  busy,
  error,
  onRequestClose,
  onSubmit,
  children
}: {
  open: boolean;
  title: string;
  submitLabel: string;
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
            <h2 id="projects-editor-title">{title.toLowerCase().includes("milestone") && <UnigentamosIcon role="goal" size={20}/>} {title}</h2>
            <p id="projects-editor-description">{description}</p>
          </div>
          <button type="button" className={styles.iconButton} onClick={onRequestClose} disabled={busy} aria-label={`Close ${title}`} data-icon-button="standard">
            <UnigentamosIcon role="close" size={18} />
          </button>
        </header>
        <div className={styles.formBody}>
          {error && <p className={styles.errorBanner} role="alert">{error}</p>}
          {children}
        </div>
        <footer className={styles.formFooter}>
          <button type="button" className={styles.button} onClick={onRequestClose} disabled={busy}>Cancel</button>
          <button type="submit" className={styles.button} data-primary="true" disabled={busy}>
            {busy ? "Saving…" : submitLabel}
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
  const signature = objectives.map((item) => `${item.id}:${item.text}:${item.targetAt || ""}:${item.completedAt || ""}`).join("|");
  const [drafts, setDrafts] = useState<EditorObjectiveDraft[]>(() =>
    objectives.map((item) => ({ id: item.id, text: item.text, targetAt: item.targetAt || "", completed: Boolean(item.completedAt) }))
  );
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    setDrafts(objectives.map((item) => ({ id: item.id, text: item.text, targetAt: item.targetAt || "", completed: Boolean(item.completedAt) })));
    setDirty(false);
    setSaveState("idle");
  }, [signature]);

  async function commitDrafts(nextDrafts = drafts) {
    if (!dirty || readOnly || busy || nextDrafts.some((item) => !item.text.trim())) return;
    setSaveState("saving");
    const saved = await onSaveRef.current(nextDrafts.map((item) => ({
      id: item.id,
      text: item.text.trim(),
      targetAt: item.targetAt || undefined,
      completed: item.completed
    })));
    setSaveState(saved ? "saved" : "error");
    if (saved) setDirty(false);
  }

  function updateDraft(id: string, patch: Partial<EditorObjectiveDraft>) {
    setDrafts((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setDirty(true);
  }

  return (
    <section className={`${styles.panel} ${styles.objectivesPanel}`} data-wide="true">
      <div className={styles.panelHeader}>
        <h2>Objectives</h2>
        {!readOnly && <span className={styles.autosaveState} role="status">
          {saveState === "saving" || busy ? "Saving…" : saveState === "error" ? "Could not save" : dirty ? "Unsaved" : saveState === "saved" ? "Saved" : "Saves when you leave a field"}
        </span>}
      </div>
      {drafts.length ? (
        <ul className={styles.objectiveList}>
          {drafts.map((objective) => (
            <li key={objective.id}>
              <span className={styles.objectiveBullet} aria-hidden="true">•</span>
              <input
                value={objective.text}
                onChange={(event) => updateDraft(objective.id, { text: event.target.value })}
                onBlur={(event) => {
                  if ((event.relatedTarget as HTMLElement | null)?.dataset.objectiveDelete) return;
                  if (!objective.text.trim()) {
                    setDrafts((current) => current.filter((item) => item.id !== objective.id));
                    setDirty(true);
                    return;
                  }
                  void commitDrafts();
                }}
                disabled={readOnly || busy}
                aria-label="Objective"
                placeholder="Describe an objective"
              />
              <input
                className={styles.objectiveDate}
                type="date"
                value={objective.targetAt}
                onChange={(event) => updateDraft(objective.id, { targetAt: event.target.value })}
                onBlur={() => void commitDrafts()}
                disabled={readOnly || busy}
                aria-label={`Target date for ${objective.text || "objective"}`}
                title="Objective target date"
              />
              {!readOnly && (
                <button
                  type="button"
                  className={styles.removeObjectiveButton}
                  onClick={() => {
                    const next = drafts.filter((item) => item.id !== objective.id);
                    setDrafts(next);
                    setDirty(true);
                    queueMicrotask(() => void onSaveRef.current(next.filter((item) => item.text.trim()).map((item) => ({ id: item.id, text: item.text.trim(), targetAt: item.targetAt || undefined, completed: item.completed }))).then((saved) => { setSaveState(saved ? "saved" : "error"); if (saved) setDirty(false); }));
                  }}
                  data-objective-delete="true"
                  disabled={busy}
                  aria-label={`Delete ${objective.text || "objective"}`}
                  title="Delete objective"
                 data-icon-button="compact"><ObjectiveDeleteIcon /></button>
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
            setDrafts((current) => [...current, { id: `draft-objective-${crypto.randomUUID()}`, text: "", targetAt: "", completed: false }]);
            setDirty(true);
          }}
          disabled={busy}
        ><UnigentamosIcon role="plus" size={16} /> Add objective</button>
      )}
    </section>
  );
}

function ConnectionInspectionEditor({
  link,
  readOnly,
  busy,
  onSave
}: {
  link: ProjectLink;
  readOnly: boolean;
  busy: boolean;
  onSave: (patch: ProjectLinkUpdateInput) => Promise<boolean>;
}) {
  const signature = `${link.updatedAt}:${link.role || ""}:${link.projectSpecificNote || ""}:${link.relationship}:${link.relationshipStrength}`;
  const [role, setRole] = useState(link.role || "");
  const [description, setDescription] = useState(link.projectSpecificNote || "");
  const [relationship, setRelationship] = useState<ProjectLinkRelationship>(link.relationship);
  const [strength, setStrength] = useState<ProjectLink["relationshipStrength"]>(link.relationshipStrength);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const isPerson = link.source.module === "people";

  useEffect(() => {
    setRole(link.role || "");
    setDescription(link.projectSpecificNote || "");
    setRelationship(link.relationship);
    setStrength(link.relationshipStrength);
    setDirty(false);
    setError("");
  }, [signature]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const saved = await onSave({
      role: role.trim() || undefined,
      projectSpecificNote: description.trim() || undefined,
      relationship,
      relationshipStrength: strength
    });
    if (saved) setDirty(false);
    else setError("The connection could not be saved. Your edits are still here.");
  }

  return (
    <form className={styles.connectionForm} onSubmit={(event) => void save(event)}>
      <div className={styles.connectionIdentity}>
        <span>{isPerson ? "Person" : "Linked object"}</span>
        <strong>{link.source.label}</strong>
      </div>
      <div className={styles.formGrid}>
        {isPerson ? (
          <label className={styles.field}>Role<input value={role} onChange={(event) => { setRole(event.target.value); setDirty(true); }} disabled={readOnly || busy} placeholder="e.g. Client, designer" /></label>
        ) : (
          <>
            <label className={styles.field}>Relationship<SelectField value={relationship} onChange={(event) => { setRelationship(event.target.value as ProjectLinkRelationship); setDirty(true); }} disabled={readOnly || busy}>{LINK_RELATIONSHIPS.map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}</SelectField></label>
            <label className={styles.field}>Strength<SelectField value={strength} onChange={(event) => { setStrength(event.target.value as ProjectLink["relationshipStrength"]); setDirty(true); }} disabled={readOnly || busy}>{["weak", "normal", "strong"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}</SelectField></label>
          </>
        )}
        <label className={styles.field} data-wide="true">Description<textarea value={description} onChange={(event) => { setDescription(event.target.value); setDirty(true); }} disabled={readOnly || busy} placeholder="How this person or object supports the project" /></label>
      </div>
      {error && <p className={styles.fieldError} role="alert">{error}</p>}
      {!readOnly && <div className={styles.inlineActions}>
        <button type="submit" className={styles.button} data-primary="true" disabled={!dirty || busy}>{busy ? "Saving…" : "Save connection"}</button>
      </div>}
    </form>
  );
}

function recomputeAttention(item: ProjectDirectoryItem): ProjectDirectoryItem {
  if (item.project.sourceKind === "legacy_projection" || item.project.lifecycle === "archived") return item;
  const reasons: string[] = [];
  if (item.project.objectives.length === 0) reasons.push("Project objectives are not defined.");
  const blockers = openBlockers(item);
  if (blockers.length) reasons.push(`${blockers.length} open project blocker${blockers.length === 1 ? "" : "s"}.`);
  const overdueObjectives = item.project.objectives.filter(
    (objective) => !objective.completedAt && objective.targetAt && Date.parse(objective.targetAt) < Date.now()
  );
  if (overdueObjectives.length) reasons.push(`${overdueObjectives.length} overdue objective${overdueObjectives.length === 1 ? "" : "s"}.`);
  return { ...item, project:{...item.project,health:deriveProjectHealth(item.project,item,new Date().toISOString())}, attentionReasons: reasons };
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
  const displayTimeZone = useClientTimeZone();
  const formatDate = (value?: string, fallback?: string) => formatDateInZone(value, fallback, displayTimeZone);
  const formatTimestamp = (value?: string, fallback?: string) => formatTimestampInZone(value, fallback, displayTimeZone);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const repository = useMemo(() => createProjectsRepository(), []);
  const reviewsRepository = useMemo(() => createReviewsRepository(), []);
  const initialPeople = useMemo(
    () => initialPersonalRecords.filter((record) => !record.archivedAt && (record.className === "person" || record.className === "org")),
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
  const reducedMotion = useReducedMotion();
  const [view, setView] = useState<ProjectView>(initialUrlState.view);
  const pillOptions = ["active","planned","attention","blocked"] as const;
  type ProjectPill = typeof pillOptions[number];
  const parsePills = () => pillOptions.filter(value => (searchParams.get("views")?.split(",") || [searchParams.get("view")]).includes(value));
  const [selectedPills,setSelectedPills] = useState<ProjectPill[]>(parsePills);
  useEffect(()=>setSelectedPills(parsePills()),[searchParams]);
  const [filter, setFilter] = useState<ProjectFilter>(initialUrlState.filter);
  const [sort, setSort] = useState<ProjectSort>(initialUrlState.sort);
  const [query, setQuery] = useState(initialUrlState.query);
  const [compact, setCompact] = useState(initialUrlState.compact);
  const [grid, setGrid] = useState(initialUrlState.grid);
  const [activeTab, setActiveTab] = useState<ProjectTab>(initialUrlState.tab);
  const [selectedProjectId, setSelectedProjectId] = useState(initialSelectedProject || "");
  const [selectedChildId, setSelectedChildId] = useState(initialDetail ? initialUrlState.item : "");
  const [activityFilters, setActivityFilters] = useState<Set<string>>(() => new Set());
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
  const objectiveToggleLock = useRef(false);
  const [pendingObjective, setPendingObjective] = useState("");
  const [objectiveUndo, setObjectiveUndo] = useState<ObjectiveCompletionUndo>();
  const [objectiveUndoError, setObjectiveUndoError] = useState("");
  const [notice, setNotice] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [reviewViews, setReviewViews] = useState(initialReviewViews);
  const [reviewsError, setReviewsError] = useState(initialReviewsError);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const isMobile = useMediaQuery("(max-width: 760px)");
  const isInspectorOverlay = false;
  const searchParamKey = searchParams.toString();

  const selectedItem = useMemo(
    () => snapshot.projects.find((item) => item.project.id === selectedProjectId) || null,
    [selectedProjectId, snapshot.projects]
  );

  const directoryKey = JSON.stringify([query,view,filter,sort,grid,compact,selectedPills]);
  const [objectiveDirectoryHold,setObjectiveDirectoryHold] = useState<{key:string;ids:string[]}>();
  useEffect(()=>setObjectiveDirectoryHold(current=>current?.key===directoryKey?current:undefined),[directoryKey]);
  const visibleProjects = useMemo(
    // Inline edits may change a sort value or the very text being searched.
    // Keep the edited directory stable until an intentional navigation change.
    () => objectiveDirectoryHold?.key === directoryKey
      ? objectiveDirectoryHold.ids.flatMap(id=>{const item=snapshot.projects.find(row=>row.project.id===id);return item?[item]:[];})
      : sortProjects(
      snapshot.projects.filter((item) => matchesQuery(item, query) && (selectedPills.length ? selectedPills.some(pill=>matchesView(item,pill)) : matchesView(item, view)) && matchesFilter(item, filter)),
      sort
    ),
    [filter, query, snapshot.projects, sort, view, directoryKey, objectiveDirectoryHold, selectedPills]
  );

  const queryScopedProjects = useMemo(
    () => snapshot.projects.filter((item) => matchesQuery(item, query)),
    [query, snapshot.projects]
  );

  const reviewRefreshInFlight = useRef(false);
  useEffect(() => {
    if (activeTab !== "links") return;
    const refreshOnReturn = () => { if (!document.hidden) void refreshReviewContext(); };
    refreshOnReturn();
    void refreshDecisions();
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => { window.removeEventListener("focus", refreshOnReturn); document.removeEventListener("visibilitychange", refreshOnReturn); };
  }, [activeTab]);

  async function refreshReviewContext() {
    if (reviewRefreshInFlight.current) return;
    reviewRefreshInFlight.current = true;
    setReviewsLoading(true);
    const result = await reviewsRepository.readState({ includeArchived: true });
    reviewRefreshInFlight.current = false;
    if (!result.ok) {
      setReviewsError(result.error.message);
      setReviewsLoading(false);
      return;
    }
    setReviewViews(result.data.items);
    setReviewsError("");
    setReviewsLoading(false);

  }

  useEffect(() => {
    const next = parseProjectsUrlState(searchParams);
    setView(next.view);
    setFilter(next.filter);
    setSort(next.sort);
    setQuery(next.query);
    setCompact(next.compact);
    setGrid(next.grid);
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
    if (visibleProjects.some((item) => item.project.id === selectedProjectId)) return;
    // Updating a filter should not navigate again with an older URL and undo
    // a newer pill selection. Only explicit card opens write the selection.
    setSelectedProjectId(visibleProjects[0].project.id);
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
      const panel = selectedChildRef.current;
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: false });
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
        grid,
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
    object?: ProjectBlocker | ProjectLink | ProjectInteraction | ProjectMilestone,
    preset: Record<string, string | boolean> = {}
  ) {
    clearFeedback();
    let values: Record<string, string | boolean> = {};
    let objectives: EditorObjectiveDraft[] | undefined;
    let people: EditorPersonDraft[] | undefined;
    if (kind === "project-create") {
      values = { name: "", description: "", completionTarget: "", lifecycle: "idea", defaultCadence: "" };
      objectives = [{ id: `draft-objective-${crypto.randomUUID()}`, text: "", targetAt: "", completed: false }];
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
        targetAt: objective.targetAt || "",
        completed: false
      }));
    } else if (kind === "legacy-promote" && item) {
      values = { objective: item.project.objective || "" };
    } else if (kind === "milestone-create") {
      values = { title: "", description: "", dueAt: "", owner: "", completionCriteria: "" };
    } else if (kind === "milestone-edit" && object?.objectType === "milestone") {
      values = {title:object.title,description:object.description,dueAt:object.dueAt.slice(0,10),owner:object.owner || "",completionCriteria:object.completionCriteria.join("\n"),state:object.state,completionNote:object.completionNote || ""};
    } else if (kind === "blocker-create") {
      values = { title: "", condition: "", severity: "medium", owner: "", dueAt: "" };
    } else if (kind === "blocker-resolve" && object?.objectType === "blocker") {
      values = { resolution: object.resolution || "" };
    } else if (kind === "interaction-create") {
      values = { title: "", body: "", occurredAt: toLocalDateTimeInput() };
    } else if (kind === "interaction-edit" && object?.objectType === "project_interaction") {
      values = {
        title: object.title,
        body: object.body,
        occurredAt: toLocalDateTimeInput(new Date(object.occurredAt))
      };
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
    setEditor({ kind, projectId: item?.project.id, objectId: object?.id, expectedUpdatedAt:object?.updatedAt, values: { ...values, ...preset }, objectives, people });
    setInspectorOpen(true);
    setEditorDirty(false);
    setEditorError("");
  }

  function requestCloseEditor() {
    if (mutationBusy) return;
    if (editorDirty) setDiscardOpen(true);
    else closeEditor();
  }

  function closeEditor() {
    setEditor(null);
    if (initialDetail) setInspectorOpen(false);
    setEditorDirty(false);
    setEditorError("");
  }

  function updateDirectoryItem(projectId: string, transform: (item: ProjectDirectoryItem) => ProjectDirectoryItem) {
    setSnapshot((current) => ({
      ...current,
      projects: current.projects.map((item) => item.project.id === projectId ? recomputeAttention(transform(item)) : item)
    }));
  }

  function applyLinkedGoal(goal: PersonalOpsGoal) {
    setSnapshot(current => ({...current, projects: current.projects.map(item => ({...item, linkedContext: item.linkedContext.map(context =>
      context.ref.module === "personal_ops" && context.ref.objectId === goal.id
        ? {...context, ref: {...context.ref, label: goal.title}, summary: goal.description, legacyStatus: goal.lifecycle, updatedAt: goal.updatedAt}
        : context
    )}))}));
  }

  function dismissObjectiveUndo() {
    const target = objectiveUndo;
    setObjectiveUndo(undefined);
    setObjectiveUndoError("");
    if (target) requestAnimationFrame(() => document.getElementById(`objective-toggle-${target.projectId}-${target.objective.id}`)?.focus({preventScroll:true}));
  }

  async function toggleCardObjective(item: ProjectDirectoryItem, objective: ObjectivePreviewTarget, undo?: ObjectiveCompletionUndo) {
    if (mutationBusy || objectiveToggleLock.current || !item.project.editable || !item.project.updatedAt || ["complete", "archived"].includes(item.project.lifecycle)) return;
    const linkedGoal = objective.source?.module === "personal_ops" && objective.source.objectType === "goal";
    if (objective.id === "current-objective" || (objective.source && !linkedGoal)) return;
    let base = item.project;
    const completed = !objective.completed;
    objectiveToggleLock.current = true;
    setMutationBusy(true);
    setPendingObjective(`${base.id}:${objective.id}`);
    setObjectiveDirectoryHold({key: directoryKey, ids: visibleProjects.map(row => row.project.id)});
    clearFeedback();
    let originalGoal: PersonalOpsGoal | undefined;
    if (undo) setObjectiveUndoError("");
    try {
      if (linkedGoal && objective.source) {
        const personal = createPersonalOpsRepository();
        const loaded = await personal.get("goals", objective.source.objectId);
        if (!loaded.ok) throw new Error(loaded.error.message);
        originalGoal = loaded.data;
        if (originalGoal.archivedAt || originalGoal.lifecycle === "archived") throw new Error("This goal is archived. Restore it in Personal before changing it.");
        if (undo && (originalGoal.updatedAt !== undo.goalVersion || originalGoal.goalState !== "complete")) throw new Error("This goal has changed since completion. Open its preview to review the latest state.");
        const goalState = completed ? "complete" : undo?.previousGoalState || "active";
        applyLinkedGoal({...originalGoal, lifecycle: completed ? "complete" : "active"});
        const result = await personal.update("goals", originalGoal.id, {goalState}, originalGoal.updatedAt);
        if (!result.ok) throw new Error(result.error.message);
        applyLinkedGoal(result.data);
        if (completed && originalGoal.goalState !== "complete") {
          setObjectiveUndo({projectId:base.id,objective,goalVersion:result.data.updatedAt,previousGoalState:originalGoal.goalState || "active"});
          setObjectiveUndoError("");
        }
      } else {
        if (undo) {
          const loaded = await repository.get("projects", base.id);
          if (!loaded.ok) throw new Error(loaded.error.message);
          base = projectDisplayFromNative(loaded.data);
          const latest = base.objectives.find(row => row.id === objective.id);
          if (!latest?.completedAt || latest.completedAt !== undo.completedAt || ["complete","archived"].includes(base.lifecycle)) {
            throw new Error("This objective has changed since completion. Open its preview to review the latest state.");
          }
        }
        if (!base.objectives.some(row => row.id === objective.id)) return;
        updateDirectoryItem(base.id, current => ({...current, project: {...current.project, objectives: current.project.objectives.map(row =>
          row.id === objective.id ? {...row, completedAt: completed ? new Date().toISOString() : undefined} : row
        )}}));
        const result = await repository.update("projects", base.id, {objectives: base.objectives.map(row =>
          row.id === objective.id ? {id: row.id, text: row.text, targetAt: row.targetAt, completed} : {id: row.id, text: row.text, targetAt: row.targetAt, completedAt: row.completedAt}
        )}, base.updatedAt!);
        if (!result.ok) throw new Error(result.error.message);
        applyMutationEnvelope(result.data);
        if (completed) {
          setObjectiveUndo({projectId:base.id,objective,completedAt:result.data.project.objectives.find(row=>row.id===objective.id)?.completedAt});
          setObjectiveUndoError("");
        }
      }
      if (undo) dismissObjectiveUndo();
      else if (!completed && objectiveUndo?.projectId === base.id && objectiveUndo.objective.id === objective.id) {
        setObjectiveUndo(undefined);
        setObjectiveUndoError("");
      }
      setNotice(undo ? "Completion undone." : completed ? "Objective completed." : "Objective reopened.");
    } catch (error) {
      if (linkedGoal) {
        if (originalGoal) applyLinkedGoal(originalGoal);
      } else {
        updateDirectoryItem(base.id, current => ({...current, project: base}));
        // Refresh after a rejected write without retrying or overwriting another session.
        const latest = await repository.get("projects", base.id);
        if (latest.ok) applyProject(latest.data);
      }
      const message = error instanceof Error ? error.message : "Could not save the objective. Please try again.";
      if (undo) setObjectiveUndoError(message);
      else setMutationError(message);
    } finally {
      objectiveToggleLock.current = false;
      setMutationBusy(false);
      setPendingObjective("");
    }
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

  function applyTimelineEvent(event: ProjectTimelineEvent) {
    setSnapshot((current) => ({
      ...current,
      nativeState: {
        ...current.nativeState,
        timelineEvents: current.nativeState.timelineEvents.some((candidate) => candidate.id === event.id)
          ? current.nativeState.timelineEvents.map((candidate) => candidate.id === event.id ? event : candidate)
          : [...current.nativeState.timelineEvents, event]
      },
      projects: current.projects.map((item) => item.project.id === event.projectId
        ? {
            ...item,
            timelineEvents: item.timelineEvents.some((candidate) => candidate.id === event.id)
              ? item.timelineEvents.map((candidate) => candidate.id === event.id ? event : candidate).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
              : [event, ...item.timelineEvents].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
          }
        : item)
    }));
  }

  function applyMutationEnvelope(data: {
    item: ProjectsObjectByFamily[keyof ProjectsObjectByFamily];
    project: Project;
    timelineEvent?: ProjectsWorkspaceSnapshot["nativeState"]["timelineEvents"][number];
    auditEvent?: ProjectsWorkspaceSnapshot["nativeState"]["auditEvents"][number];
  }) {
    applyProject(data.project);
    if (data.item.objectType === "milestone") applyMilestone(data.item);
    if (data.item.objectType === "blocker") applyBlocker(data.item);
    if (data.item.objectType === "project_link") applyLink(data.item);
    if (data.item.objectType === "project_interaction") applyInteraction(data.item);
    if (data.timelineEvent) {
      const event = data.timelineEvent;
      if (data.item.objectType === "project_interaction") {
        setSnapshot((current) => ({
          ...current,
          nativeState: {
            ...current.nativeState,
            timelineEvents: current.nativeState.timelineEvents.filter((candidate) => candidate.relatedObjectRef?.objectId !== data.item.id)
          },
          projects: current.projects.map((item) => item.project.id === event.projectId
            ? { ...item, timelineEvents: item.timelineEvents.filter((candidate) => candidate.relatedObjectRef?.objectId !== data.item.id) }
            : item)
        }));
      }
      applyTimelineEvent(event);
    }
    if (data.auditEvent) {
      const auditEvent = data.auditEvent;
      setSnapshot((current) => ({
        ...current,
        nativeState: {
          ...current.nativeState,
          auditEvents: [...current.nativeState.auditEvents.filter((candidate) => candidate.id !== auditEvent.id), auditEvent]
        }
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
          .map((objective) => ({ id: objective.id, text: objective.text.trim(), targetAt: objective.targetAt || undefined, completed: false }));
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
            .map((objective) => ({ id: objective.id, text: objective.text.trim(), targetAt: objective.targetAt || undefined, completed: false })),
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
      } else if (editor.kind === "milestone-create" || editor.kind === "milestone-edit") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item?.project.editable) {
          setEditorError("Start native tracking before adding project-owned milestones.");
          return;
        }
        if (!value("title")) {
          setEditorError("Give this milestone a title.");
          return;
        }
        const fields = {
          title: value("title"),
          description: value("description"),
          dueAt: value("dueAt"),
          owner: value("owner"),
          completionCriteria: value("completionCriteria").split("\n").map((criterion) => criterion.trim()).filter(Boolean)
        };
        if (editor.kind === "milestone-edit" && (!editor.objectId || !editor.expectedUpdatedAt)) {
          setEditorError("Reopen this milestone to load its latest details."); return;
        }
        const result = editor.kind === "milestone-edit" && editor.objectId
          ? await repository.update("milestones", editor.objectId, {...fields, state:value("state") as ProjectMilestone["state"], completionNote:value("completionNote")}, editor.expectedUpdatedAt!)
          : await repository.create("milestones", {projectId:item.project.id,...fields});
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setActiveTab("timeline");
        setSelectedChildId(result.data.item.id);
        updateUrl({ tab: "timeline", item: initialDetail ? result.data.item.id : item.project.id });
        setNotice(`Milestone “${result.data.item.title}” ${editor.kind === "milestone-edit" ? "updated" : "added"}.`);
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
      } else if (editor.kind === "interaction-edit") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        const interaction = item?.interactions.find((candidate) => candidate.id === editor.objectId);
        if (!item || !interaction) {
          setEditorError("The selected project update is no longer available.");
          return;
        }
        if (!value("title") || !value("occurredAt")) {
          setEditorError("Update title and date are required.");
          return;
        }
        const result = await repository.update("interactions", interaction.id, {
          title: value("title"),
          body: optional("body"),
          occurredAt: value("occurredAt")
        }, interaction.updatedAt);
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setActiveTab("timeline");
        setSelectedChildId(result.data.timelineEvent?.id || "");
        updateUrl({ tab: "timeline", item: initialDetail ? result.data.timelineEvent?.id || "" : item.project.id });
        setNotice(`Update “${result.data.item.title}” was saved.`);
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

  const [photoProjectId, setPhotoProjectId] = useState<string | null>(null);
  const photoItem = snapshot.projects.find(item => item.project.id === photoProjectId);

  async function saveProjectPhoto(item: ProjectDirectoryItem, updatedAt: string) {
    if (!item.project.updatedAt) return false;
    const result = await repository.update("projects", item.project.id, { photoUpdatedAt: updatedAt }, item.project.updatedAt);
    if (!result.ok) { setMutationError(result.error.message); return false; }
    applyMutationEnvelope(result.data);
    return true;
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
    return true;
  }

  async function saveConnectionInline(item: ProjectDirectoryItem, link: ProjectLink, patch: ProjectLinkUpdateInput) {
    if (!item.project.editable || ["complete", "archived"].includes(item.project.lifecycle) || mutationBusy) return false;
    clearFeedback();
    setMutationBusy(true);
    const result = await repository.update("links", link.id, patch, link.updatedAt);
    setMutationBusy(false);
    if (!result.ok) {
      setMutationError(result.error.message);
      return false;
    }
    applyMutationEnvelope(result.data);
    setNotice(`Connection to “${result.data.item.source.label}” was updated.`);
    return true;
  }

  async function saveTimelineEvent(item: ProjectDirectoryItem, event: ProjectTimelineEvent, patch: { eventType: ProjectTimelineEventType; occurredAt: string }) {
    if (!item.project.editable || ["complete", "archived"].includes(item.project.lifecycle) || mutationBusy) return false;
    clearFeedback();
    setMutationBusy(true);
    const result = await repository.updateTimelineEvent(event.id, patch, event.updatedAt);
    setMutationBusy(false);
    if (!result.ok) {
      setMutationError(result.error.message);
      return false;
    }
    applyProject(result.data.project);
    applyTimelineEvent(result.data.item);
    setSnapshot((current) => ({
      ...current,
      nativeState: {
        ...current.nativeState,
        auditEvents: [...current.nativeState.auditEvents.filter((candidate) => candidate.id !== result.data.auditEvent.id), result.data.auditEvent]
      }
    }));
    setNotice("Timeline event details were updated and recorded in the change log.");
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
          ...(confirmationReason.trim() ? {completionNote: confirmationReason.trim()} : {})
        }, milestone.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`Milestone “${result.data.item.title}” reached.`);
      } else if (confirmation.kind === "link-remove") {
        const link = item.links.find((candidate) => candidate.id === confirmation.objectId);
        if (!link) return;
        const result = await repository.update("links", link.id, {
          linkState: "removed",
          removalReason: confirmationReason.trim() || "Removed from the project."
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
  const countForView = (candidateView: ProjectView) => queryScopedProjects.filter((item) => item.project.lifecycle !== "archived" && matchesView(item, candidateView)).length;
  const projectViewPills = <div className={styles.viewPills} role="group" aria-label="Project views">{pillOptions.map(value=><button type="button" key={value} aria-pressed={selectedPills.includes(value)} onClick={()=>{
    const next=selectedPills.includes(value)?selectedPills.filter(pill=>pill!==value):[...selectedPills,value];
    setSelectedPills(next);setView("all");setFilter("all");
    const params=new URLSearchParams(destinationFor({view:"all",filter:"all"}).split("?")[1]||"");
    if(next.length)params.set("views",next.join(","));else params.delete("views");
    window.history.replaceState(null, "", `${pathname}${params.size?`?${params}`:""}`);
  }}><UnigentamosIcon role={{active:"active",planned:"calendar",attention:"warning",blocked:"no-contact"}[value]} size={15}/>{value === "attention" ? <><span className={styles.fullPillLabel}>Needs attention</span><span className={styles.shortPillLabel}>Attention</span></> : <span>{VIEW_LABELS[value]}</span>}<small>{countForView(value)}</small></button>)}</div>;

  function projectQuickActions(item: ProjectDirectoryItem): readonly QuickAction[] {
    const native = item.project.editable;
    if (!native) return [];
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
        <div className={styles.projectIdentity}>
          <PeopleProfileAvatar initials={initials(item.project.name)} label={item.project.name} photoUrl={item.project.photoUpdatedAt ? `/api/projects/photos/${encodeURIComponent(item.project.id)}` : undefined} photoUpdatedAt={item.project.photoUpdatedAt}
            onSelect={item.project.editable && !["complete", "archived"].includes(item.project.lifecycle) ? () => setPhotoProjectId(item.project.id) : undefined} />
          <div className={styles.projectHeading}><Heading>{item.project.name}</Heading><div className={styles.projectHeaderMeta}>{renderStateChip(item.project.lifecycle)}<span><UnigentamosIcon role="clock" size={14} /> Updated {formatDate(item.project.updatedAt)}</span></div></div>
        </div>
        <div className={styles.projectHeroActions}>
          {item.project.editable && <button type="button" className={styles.button} onClick={() => openEditor("project-edit", item)} disabled={["complete", "archived"].includes(item.project.lifecycle)}><UnigentamosIcon role="edit" size={16} />Edit</button>}
        {item.project.editable && (
          <button type="button" className={styles.iconButton} onClick={() => void toggleStar(item)} disabled={mutationBusy || ["complete", "archived"].includes(item.project.lifecycle)} title={item.project.starred ? "Remove star" : "Star project"} aria-label={item.project.starred ? "Remove star" : "Star project"} aria-pressed={item.project.starred} data-icon-button="standard">
            <UnigentamosIcon role="star" size={20} />
          </button>
        )}
        <details className={styles.projectMenu}>
          <summary className={styles.iconButton} aria-label="More project options" data-icon-button="standard"><UnigentamosIcon role="more" size={20} /></summary>
          <div className={styles.projectMenuPanel} role="menu">
            {initialDetail && <button type="button" role="menuitem" onClick={() => setInspectorOpen(true)}>Project summary</button>}
            {item.project.editable ? <>
              <button type="button" role="menuitem" onClick={() => openEditor("project-edit", item)} disabled={["complete", "archived"].includes(item.project.lifecycle)}>Edit project</button>
              <button type="button" role="menuitem" data-danger="true" disabled={item.project.lifecycle === "archived"} onClick={() => {
                setConfirmationReason("");
                setConfirmation({ kind: "project-archive", projectId: item.project.id });
              }}>Delete project</button>
            </> : null}
            {isInspectorOverlay && <button type="button" role="menuitem" onClick={() => setInspectorOpen(false)}>Close panel</button>}
          </div>
        </details>
        </div>
      </header>
    );
  }

  function projectActivity(item: ProjectDirectoryItem): ProjectActivityItem[] {
    const timeline = item.timelineEvents.map((event) => ({
      id: event.id,
      title: activityTitle(event),
      summary: event.summary,
      occurredAt: event.occurredAt,
      tone: activityTone(event),
      openHref: event.eventType.startsWith("link_") ? event.sourceRef?.route || "" : "",
      kind: "timeline" as const,
      filterKey: activityFilterKey(event)
    }));
    const decisionActivity = getLinkedDecisions(decisions, projectDecisionSource(item.project)).map((decision) => ({
      id: `decision-${decision.id}`,
      title: decision.title,
      summary: decision.finalDecision || decision.question || "Decision recorded",
      occurredAt: decision.updatedAt || decision.createdAt,
      tone: "decision" as const,
      openHref: decisionOwnerRoute(decision),
      kind: "decision" as const,
      filterKey: "decision_linked"
    }));
    return [...timeline, ...decisionActivity].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }

  function renderActivityList(activity: ProjectActivityItem[], compact = false) {
    return (
      <motion.ol layout className={styles.activityList} data-compact={compact || undefined} transition={{duration:reducedMotion ? 0 : .24}}>
        <AnimatePresence initial={false} mode="popLayout">
        {activity.map((event) => (
          <motion.li layout key={event.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:reducedMotion ? 0 : .22,ease:[.22,1,.36,1]}} aria-current={selectedChildId === event.id || undefined}>
            <span className={styles.timelineDot} data-tone={event.tone} aria-hidden="true" />
            <span className={styles.itemBody}>
              <strong>{event.title}</strong>
              <small>{event.summary}</small>
            </span>
            <RowActionIcons
              inspectLabel={`Inspect ${event.title}`}
              onInspect={() => selectChild(event.id, "timeline")}
              openHref={event.openHref || undefined}
              openLabel={`Open ${event.title}`}
            />
            <time className={styles.timelineMeta}>{formatTimestamp(event.occurredAt)}</time>
          </motion.li>
        ))}
        </AnimatePresence>
      </motion.ol>
    );
  }

  function renderLinkedRows(item: ProjectDirectoryItem, modules?: readonly ModuleId[]) {
    const rows = modules
      ? item.linkedContext.filter((context) => modules.includes(context.ref.module))
      : item.linkedContext;
    if (!rows.length) {
      return <p>No linked objects.</p>;
    }
    return (
      <ProjectLinkedItems>
        {rows.map((context, index) => {
          const link = item.links.find((candidate) => candidate.linkState !== "removed" && candidate.source.module === context.ref.module && candidate.source.objectId === context.ref.objectId);
          return <ProjectLinkedItem key={`${context.ref.module}-${context.ref.objectId}-${context.relationship}-${index}`}
            source={context.ref} record={context.ref.module === "people" ? initialPersonalRecords.find(p=>p.id===context.ref.objectId) : undefined}
            description={context.summary ? excerpt(context.summary, 150) : undefined}
            actions={<RowActionIcons inspectLabel={`Inspect ${context.ref.label}`} onInspect={link ? () => selectChild(link.id, context.ref.module === "people" ? "people" : "notes-decisions") : undefined} />} />;
        })}
      </ProjectLinkedItems>
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
            <Heading><UnigentamosIcon role="module-reviews" size={18}/>Reviews</Heading>
          </div>
          <div className={styles.inlineActions}>
            <Link className={styles.button} href={buildProjectReviewHandoffRoute(target)}><UnigentamosIcon role="link" size={16} />Link review</Link>
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
          <ProjectLinkedItems>
            {contexts.map((context) => {
              const repairLink = context.links.find((link) => link.state === "stale" || link.state === "broken");
              return (
                <ProjectLinkedItem key={context.reviewRef.objectId} source={context.reviewRef}
                  description={[displayLabel(context.cadence),displayLabel(context.lifecycle),context.blockerCount ? `${context.blockerCount} incomplete item${context.blockerCount===1?"":"s"}` : ""].filter(Boolean).join(" · ")}
                  status={context.current ? <span>Current</span> : undefined}
                  actions={repairLink ? <Link prefetch={false} className={styles.button} href={`${context.reviewRef.route}?tab=overview&item=${encodeURIComponent(repairLink.id)}`}><UnigentamosIcon role="edit" size={15}/>Review link</Link> : undefined}/>
              );
            })}
          </ProjectLinkedItems>
        ) : (
          <p>No linked reviews.</p>
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
          actions={projectQuickActions(item).map(action => ({ ...action, icon: <UnigentamosIcon role={action.id === "interaction" ? "plus" : action.id === "milestone" ? "calendar" : "link"} size={16} /> }))}
          maxVisible={2}
          ariaLabel={`${item.project.name} quick actions`}
        />
        <div className={styles.overviewGrid}>
          <div className={styles.overviewPrimary}>
            <ProjectObjectivesEditor key={item.project.id} objectives={item.project.objectives} readOnly={readOnly} busy={mutationBusy} onSave={(objectives) => saveObjectives(item, objectives)} />
            <section className={styles.panel}>
              <div className={styles.panelHeader}><h2>Recent work</h2><button type="button" className={styles.button} onClick={() => openEditor("interaction-create", item)} disabled={readOnly}><UnigentamosIcon role="plus" size={16} />Log update</button></div>
              {activity.length ? renderActivityList(activity.slice(0, 6)) : <p>Log an update to keep track of your progress.</p>}
              {activity.length > 6 && <button type="button" className={styles.button} onClick={() => selectTab("activity")}>View all activity</button>}
            </section>
          </div>
          <aside className={styles.overviewAside} aria-label="Project context">
            <section className={styles.panel}>
              <div className={styles.panelHeader}><h2>About this project</h2>{!readOnly && <button type="button" className={styles.iconButton} aria-label="Edit project description" onClick={() => openEditor("project-edit", item)}><UnigentamosIcon role="edit" size={16} /></button>}</div>
              <p>{item.project.description || "Add a description to explain what you’re working toward."}</p>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><h2>Milestones</h2><button type="button" className={styles.iconButton} aria-label="Add milestone" disabled={readOnly} onClick={() => openEditor("milestone-create", item)}><UnigentamosIcon role="plus" size={16} /></button></div>
              {activeMilestones(item).length ? <ul className={styles.projectSummaryList}>{activeMilestones(item).slice(0, 4).map(milestone => <li key={milestone.id}><button type="button" onClick={() => selectChild(milestone.id, "activity")}><strong>{milestone.title}</strong><span>{milestone.dueAt ? formatDate(milestone.dueAt) : milestoneLabel(milestone.state)}</span></button></li>)}</ul> : <p>No upcoming milestones.</p>}
              {activeMilestones(item).length > 4 && <button type="button" className={styles.button} onClick={() => selectTab("activity")}>View all milestones</button>}
            </section>
            {blockers.length > 0 && <section className={styles.panel}><div className={styles.panelHeader}><h2>Open blockers</h2><span>{blockers.length}</span></div><ul className={styles.projectSummaryList}>{blockers.map(blocker => <li key={blocker.id}><button type="button" onClick={() => selectChild(blocker.id, "activity")}><strong>{blocker.title}</strong><span>{displayLabel(blocker.severity)}</span></button></li>)}</ul></section>}
          </aside>
        </div>
      </>
    );
  }

  function renderTimeline(item: ProjectDirectoryItem) {
    const readOnly = !item.project.editable || ["complete", "archived"].includes(item.project.lifecycle);
    const activity = projectActivity(item);
    const filterOptions = Array.from(new Set(activity.map((event) => event.filterKey)));
    const visibleActivity = activityFilters.size ? activity.filter((event) => activityFilters.has(event.filterKey)) : activity;
    return (
      <div className={styles.timelineLayout}>
        <section className={`${styles.panel} ${styles.timelineActivityPanel}`}>
          <div className={styles.panelHeader}>
            <h2>Activity</h2>
            <button type="button" className={styles.button} data-primary="true" onClick={() => openEditor("interaction-create", item)} disabled={readOnly}>Log update</button>
          </div>
          {filterOptions.length > 1 && <div className={styles.activityFilters} role="group" aria-label="Filter project activity">
            <button type="button" data-active={activityFilters.size === 0 || undefined} aria-pressed={activityFilters.size === 0} onClick={() => setActivityFilters(new Set())}>All</button>
            {filterOptions.map((option) => <button type="button" data-active={activityFilters.has(option) || undefined} aria-pressed={activityFilters.has(option)} onClick={() => setActivityFilters((current) => { const next = new Set(current); if (next.has(option)) next.delete(option); else next.add(option); return next; })} key={option}>{activityFilterLabel(option)}</button>)}
          </div>}
          {visibleActivity.length ? renderActivityList(visibleActivity) : <p>No activity matches these filters.</p>}
        </section>
        <aside className={styles.timelineSide}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2><UnigentamosIcon role="goal" size={18}/>Milestones</h2><button type="button" className={styles.button} onClick={() => openEditor("milestone-create", item)} disabled={readOnly}><UnigentamosIcon role="plus" size={15}/>Add milestone</button></div>
            {item.milestones.length ? <ul className={styles.milestoneList}>{item.milestones.map(milestone=><li key={milestone.id} aria-current={selectedChildId === milestone.id || undefined}>
              <button type="button" className={styles.milestoneOpen} aria-label={`Inspect ${milestone.title}`} onClick={()=>selectChild(milestone.id,"timeline")}><UnigentamosIcon role={milestone.state === "complete" ? "check" : "goal"} size={18}/><strong>{milestone.title}</strong><UnigentamosIcon role="chevron-right" size={15}/></button>
              <div className={styles.milestoneMeta}><span data-reached={milestone.state === "complete" || undefined}>{milestoneLabel(milestone.state)}</span>{milestone.dueAt && <time dateTime={milestone.dueAt}><UnigentamosIcon role="calendar" size={13}/>{formatDate(milestone.dueAt)}</time>}<div className={styles.milestoneActions}>
                {milestone.state !== "archived" && <button type="button" className={styles.iconButton} aria-label={`Edit ${milestone.title}`} title="Edit milestone" disabled={readOnly} onClick={()=>openEditor("milestone-edit",item,milestone)}><UnigentamosIcon role="edit" size={16}/></button>}
                {!["complete","archived"].includes(milestone.state) && <button type="button" className={styles.iconButton} aria-label={`Mark ${milestone.title} reached`} title="Mark reached" disabled={readOnly} onClick={()=>{setConfirmationReason("");setConfirmation({kind:"milestone-complete",projectId:item.project.id,objectId:milestone.id});}}><UnigentamosIcon role="check" size={16}/></button>}
              </div></div>
            </li>)}</ul> : <p>No milestones yet.</p>}
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2>Blockers</h2><button type="button" className={styles.button} onClick={() => openEditor("blocker-create", item)} disabled={readOnly}>Add blocker</button></div>
            {item.blockers.length ? <ul className={styles.objectList}>{item.blockers.map((blocker) => <li key={blocker.id} aria-current={selectedChildId === blocker.id || undefined}><span className={styles.itemBody}><strong>{blocker.title}</strong><small>{displayLabel(blocker.state)} · {displayLabel(blocker.severity)}</small></span><span className={styles.inlineActions}><RowActionIcons inspectLabel={`Inspect ${blocker.title}`} onInspect={() => selectChild(blocker.id, "timeline")} openLabel={`Open ${blocker.title}`} />{blocker.state === "open" && <button type="button" className={styles.button} disabled={readOnly} onClick={() => openEditor("blocker-resolve", item, blocker)}>Resolve</button>}</span></li>)}</ul> : <p>No blockers.</p>}
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
            <h2><UnigentamosIcon role="module-notes" size={18}/>Notes</h2>
            <span className={styles.inlineActions}>
              <Link className={styles.button} href={nativeCreateHref("notes", item.project)}><UnigentamosIcon role="plus" size={16} />New note</Link>
              <button type="button" className={styles.button} onClick={() => openEditor("link-create", item, undefined, { linkScope: "note", sourceModule: "notes", sourceObjectType: "note", relationship: "source_material" })} disabled={readOnly}><UnigentamosIcon role="link" size={16} />Link note</button>
            </span>
          </div>
          {noteContext.length ? renderLinkedRows(item, ["notes"]) : <p>No linked notes.</p>}
        </section>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}>
            <h2><UnigentamosIcon role="decision" size={18}/>Decisions</h2>
            <span className={styles.inlineActions}><Link className={styles.button} href={personalOpsCreateHref("decisions", item.project)}><UnigentamosIcon role="plus" size={16} />Add decision</Link></span>
          </div>
          {decisionsError && <p role="alert">{decisionsError} <button type="button" className={styles.button} onClick={()=>void refreshDecisions()}>Retry</button></p>}
          {getLinkedDecisions(decisions,projectDecisionSource(item.project)).length ? <ProjectLinkedItems>
            {getLinkedDecisions(decisions,projectDecisionSource(item.project)).map(decision=><ProjectLinkedItem key={decision.id}
              source={createNativeObjectRef({module:"personal_ops",objectType:"decision",objectId:decision.id,label:decision.title})}
              description={decision.finalDecision || decision.question || undefined}
              status={<PersonalOpsStatusChip tone={personalOpsToneForState(decision.decisionState)}>{personalStatusLabel(decision.decisionState)}</PersonalOpsStatusChip>}
              actions={<RowActionIcons inspectLabel={`Inspect ${decision.title}`} onInspect={()=>selectChild(`decision-${decision.id}`,"notes-decisions")}/>}/>)}
          </ProjectLinkedItems> : <p>{decisionsLoading ? "Loading decisions…" : "No linked decisions."}</p>}
        </section>
      </div>
    );
  }

  function renderPeople(item: ProjectDirectoryItem) {
    const readOnly = !item.project.editable || ["complete", "archived"].includes(item.project.lifecycle);
    return <>{(["person", "organization"] as const).map(type => {
      const people = item.links.filter(link => link.source.module === "people" && link.source.objectType === type && link.linkState !== "removed");
      const label = type === "person" ? "People" : "Organizations";
      return <section className={styles.panel} key={type} aria-label={"Linked " + label.toLowerCase()} data-project-people={type === "person" ? item.project.id : undefined}>
        <div className={styles.panelHeader}><h2><UnigentamosIcon role={type === "person" ? "module-people" : "organization"} size={18}/>{label}</h2>
          <button type="button" className={styles.button} disabled={readOnly}
            onClick={() => openEditor("link-create", item, undefined, {sourceModule:"people",sourceObjectType:type,linkScope:type === "person" ? "module-people" : "organization",relationship:"project_person"})}>
            <UnigentamosIcon role="link" size={16}/>Link {type}</button>
        </div>
        {people.length ? <ProjectLinkedItems>{people.map(link => <ProjectLinkedItem key={link.id} source={link.source}
          record={initialPersonalRecords.find(record => record.id === link.source.objectId)} unavailable={linkSourceIsUnsafe(link)}
          description={link.projectSpecificNote} status={link.role ? <span>{link.role}</span> : undefined}
          actions={<RowActionIcons inspectLabel={`Inspect ${link.source.label} connection`} onInspect={()=>selectChild(link.id, "people")}/>}/>)}</ProjectLinkedItems>
          : <p>No linked {label.toLowerCase()}.</p>}
      </section>;
    })}</>;
  }

  function renderFilesLinks(item: ProjectDirectoryItem) {
    const objectLinks = item.links.filter(link => link.source.module !== "people" && link.source.module !== "notes" && link.source.module !== "reviews" && !(link.source.module === "personal_ops" && link.source.objectType === "decision"));
    const readOnly = !item.project.editable || ["complete", "archived"].includes(item.project.lifecycle);
    const renderLink = (link: ProjectLink) => <ProjectLinkedItem key={link.id} source={link.source}
      unavailable={linkSourceIsUnsafe(link) || link.linkState === "removed"}
      description={link.healthNote || link.projectSpecificNote}
      status={link.linkState !== "active" ? <span className={styles.rowState} data-tone={stateTone(link.linkState)}>{displayLabel(link.linkState)}</span> : undefined}
      actions={<><RowActionIcons inspectLabel={`Inspect ${link.source.label} connection`} onInspect={()=>selectChild(link.id, "files-links")}/>
        {linkNeedsRepair(link) && <button type="button" className={styles.button} disabled={readOnly} onClick={()=>openEditor("link-repair",item,link)}><UnigentamosIcon role="edit" size={15}/>Repair</button>}
        <button type="button" className={styles.iconButton} disabled={readOnly}
          aria-label={`${link.linkState === "removed" ? "Restore" : "Remove"} ${link.source.label} link`}
          onClick={()=>{setConfirmationReason("");setConfirmation({kind:link.linkState === "removed" ? "link-restore" : "link-remove", projectId:item.project.id,objectId:link.id});}}>
          <UnigentamosIcon role={link.linkState === "removed" ? "discard-changes" : "delete"} size={16}/></button>
      </>}/>;
    const active = objectLinks.filter(link=>link.linkState !== "removed"), removed = objectLinks.filter(link=>link.linkState === "removed");
    return <section className={styles.panel}>
      <div className={styles.panelHeader}><h2><UnigentamosIcon role="module-resources" size={18}/>Files &amp; resources</h2>
        <button type="button" className={styles.button} disabled={readOnly} onClick={()=>openEditor("link-create",item,undefined,{linkScope:"object",sourceModule:"media"})}><UnigentamosIcon role="link" size={16}/>Link object</button></div>
      {active.length ? <ProjectLinkedItems>{active.map(renderLink)}</ProjectLinkedItems> : <p>No linked files or resources.</p>}
      {!!removed.length && <details className={styles.removedLinks}><summary>Removed links <span>{removed.length}</span></summary><ProjectLinkedItems>{removed.map(renderLink)}</ProjectLinkedItems></details>}
    </section>;
  }
  function renderProperties(item: ProjectDirectoryItem) {
    return <ProjectProperties key={item.project.id} project={{ ...item.project, updatedAt: item.project.updatedAt || "" }} readOnly={!item.project.editable || ["complete", "archived"].includes(item.project.lifecycle)} busy={mutationBusy} onSave={async (patch, expectedUpdatedAt) => {
      if (mutationBusy || !item.project.editable) return false;
      clearFeedback(); setMutationBusy(true);
      const result = await repository.update("projects", item.project.id, patch, expectedUpdatedAt);
      setMutationBusy(false);
      if (!result.ok) { setMutationError(result.error.message); return false; }
      applyMutationEnvelope(result.data); setNotice("Project properties saved."); return true;
    }} />;
  }

  function renderSelectedChildContext(item: ProjectDirectoryItem) {
    if (!selectedChildId) return null;
    const milestone = item.milestones.find((candidate) => candidate.id === selectedChildId);
    const blocker = item.blockers.find((candidate) => candidate.id === selectedChildId);
    const link = item.links.find((candidate) => candidate.id === selectedChildId);
    const timelineEvent = item.timelineEvents.find((candidate) => candidate.id === selectedChildId);
    const selectedDecision = decisions.find((candidate) => `decision-${candidate.id}` === selectedChildId);
    const interaction = timelineEvent?.relatedObjectRef?.objectType === "project_interaction"
      ? item.interactions.find((candidate) => candidate.id === timelineEvent.relatedObjectRef?.objectId)
      : undefined;
    const changeLog = timelineEvent ? timelineChangeLog(timelineEvent, snapshot.nativeState.auditEvents) : [];
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
    const hasBlockerDecisionOwner = blockerDecisionSource
      ? getLinkedDecisions(decisions, blockerDecisionSource).length > 0
      : false;
    const headingId = `project-selected-child-${selectedChildId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const parentReadOnly = !item.project.editable || ["complete", "archived"].includes(item.project.lifecycle);
    const parentReadOnlyReason = item.project.lifecycle === "complete"
      ? "Completed projects are read-only."
      : item.project.lifecycle === "archived"
        ? "Restore this project to make changes."
        : !item.project.editable ? "This project is read-only." : undefined;
    const inspectionType = milestone ? "Milestone" : blocker ? "Blocker" : link ? "Linked object" : selectedDecision ? "Decision" : interaction ? "Update" : "Activity";
    const inspectionIcon = milestone ? "goal" : blocker ? "warning" : link ? "link" : selectedDecision ? "decision" : interaction ? "interaction" : "timeline";
    const inspectionTitle = milestone?.title || blocker?.title || link?.source.label || timelineEvent?.title || selectedDecision?.title || "Unavailable item";
    const inspectionSummary = timelineEvent && !timelineEvent.isManual && timelineEvent.eventType === "project_updated"
      ? "Project details were updated."
      : timelineEvent && !timelineEvent.isManual && timelineEvent.eventType === "project_created"
        ? "This project was created."
        : timelineEvent?.summary;
    const removalReason = timelineEvent?.eventType === "link_removed"
      ? snapshot.nativeState.auditEvents.find((audit) => audit.object.objectId === timelineEvent.relatedObjectRef?.objectId && audit.occurredAt === timelineEvent.createdAt)?.after?.removalReason
      : undefined;
    const readableChange = (value: string, label: string) => {
      if (["Due date", "Completion target", "Occurred"].includes(label) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return label === "Occurred" ? formatTimestamp(value) : formatDate(value);
      }
      return ["Status", "State", "Severity", "Event type", "Link state", "Relationship", "Strength", "Review cadence"].includes(label) ? displayLabel(value) : value;
    };

    function clearSelectedChild() {
      setSelectedChildId("");
      updateUrl({ item: initialDetail ? "" : item.project.id });
    }

    return (
      <section
        ref={selectedChildRef}
        className={inspectionStyles.panel}
        tabIndex={-1}
        aria-labelledby={headingId}
        aria-live="polite"
      >
        <header className={inspectionStyles.header}>
          <div className={inspectionStyles.identity}>
            <UnigentamosIcon role={inspectionIcon} size={20} />
            <div>
              <h2 id={headingId}>{inspectionTitle}</h2>
              <div className={inspectionStyles.meta}>
                <span>{inspectionType}</span>
                {timelineEvent && <time dateTime={timelineEvent.occurredAt}>{formatTimestamp(timelineEvent.occurredAt)}</time>}
                {parentReadOnly && <span title={parentReadOnlyReason}>Read-only</span>}
              </div>
            </div>
          </div>
          <div className={inspectionStyles.headerActions}>
            {milestone && !parentReadOnly && milestone.state !== "archived" && <button type="button" className={styles.iconButton} onClick={()=>openEditor("milestone-edit",item,milestone)} aria-label="Edit milestone" title="Edit milestone"><UnigentamosIcon role="edit" size={18}/></button>}
            <button type="button" className={styles.iconButton} onClick={clearSelectedChild} aria-label="Close inspection" title="Close inspection"><UnigentamosIcon role="close" size={18} /></button>
          </div>
        </header>

        {milestone && (
          <div className={inspectionStyles.body}>
            <div className={inspectionStyles.milestoneSummary}>
              <span className={inspectionStyles.progressPill} data-reached={milestone.state === "complete" || undefined}><UnigentamosIcon role={milestone.state === "complete" ? "check" : "goal"} size={16}/>{milestoneLabel(milestone.state)}</span>
              {milestone.dueAt && <span><UnigentamosIcon role="calendar" size={16}/><span>Target <time dateTime={milestone.dueAt}>{formatDate(milestone.dueAt)}</time></span></span>}
              {milestone.owner && <span><UnigentamosIcon role="person" size={16}/>{milestone.owner}</span>}
              {!parentReadOnly && milestone.state !== "archived" && milestone.state !== "complete" && <WorkspaceButton icon="check" intent="primary" disabled={mutationBusy} onClick={()=>{
                setConfirmationReason("");setConfirmation({kind:"milestone-complete",projectId:item.project.id,objectId:milestone.id});
              }}>Mark reached</WorkspaceButton>}
            </div>
            {milestone.description && <p>{milestone.description}</p>}
            {milestone.completionCriteria.length > 0 && <div className={inspectionStyles.contentSection}><h3>Success criteria</h3><ul className={styles.criteriaList}>{milestone.completionCriteria.map((criterion,index)=><li key={`${index}-${criterion}`}>{criterion}</li>)}</ul></div>}
            {milestone.completionNote && <div className={inspectionStyles.contentSection}><h3>Reflection</h3><p>{milestone.completionNote}</p></div>}
            <ProjectDisclosure title="Linked work" icon="object">
              <div className={inspectionStyles.milestoneSupporting}>
                <section>
                  <header><h3><UnigentamosIcon role="follow-up" size={16}/>Follow-ups</h3><Link prefetch={false} className={styles.button} href={personalOpsCreateHref("follow-ups",item.project,{objectType:"milestone",objectId:milestone.id,label:milestone.title})}><UnigentamosIcon role="plus" size={15}/>Add follow-up</Link></header>
                  {followUpsError && <p role="alert">{followUpsError} <button type="button" className={styles.button} onClick={()=>void refreshFollowUps()}>Retry</button></p>}
                  {followUpsLoading ? <p>Loading follow-ups…</p> : getLinkedFollowUps(followUps,projectFollowUpSource(item.project,{objectType:"milestone",objectId:milestone.id,label:milestone.title})).length ? <ul>{getLinkedFollowUps(followUps,projectFollowUpSource(item.project,{objectType:"milestone",objectId:milestone.id,label:milestone.title})).map(followUp=><li key={followUp.id}><Link prefetch={false} href={followUpOwnerRoute(followUp)}><strong>{followUp.title}</strong><span>{personalStatusLabel(followUp.followUpState)}</span></Link></li>)}</ul> : <p>No linked follow-ups.</p>}
                </section>
                <section>
                  <header><h3><UnigentamosIcon role="decision" size={16}/>Decisions</h3><Link prefetch={false} className={styles.button} href={personalOpsCreateHref("decisions",item.project,{objectType:"milestone",objectId:milestone.id,label:milestone.title})}><UnigentamosIcon role="plus" size={15}/>Add decision</Link></header>
                  {decisionsError && <p role="alert">{decisionsError} <button type="button" className={styles.button} onClick={()=>void refreshDecisions()}>Retry</button></p>}
                  {decisionsLoading ? <p>Loading decisions…</p> : getLinkedDecisions(decisions,milestoneDecisionSource!).length ? <ul>{getLinkedDecisions(decisions,milestoneDecisionSource!).map(decision=><li key={decision.id}><Link prefetch={false} href={decisionOwnerRoute(decision)}><strong>{decision.title}</strong><span>{personalStatusLabel(decision.decisionState)}</span></Link></li>)}</ul> : <p>No linked decisions.</p>}
                </section>
                {renderReviewCoverage(item,{objectType:"milestone",objectId:milestone.id,label:milestone.title},true)}
                {milestone.linkedRefs.length > 0 && <section><header><h3><UnigentamosIcon role="object" size={16}/>Other links</h3></header><ProjectLinkedItems>{milestone.linkedRefs.map(ref=><ProjectLinkedItem key={`${ref.module}-${ref.objectId}`} source={ref}/>)}</ProjectLinkedItems></section>}
              </div>
            </ProjectDisclosure>
            <ProjectDisclosure title="Record details" icon="information"><dl className={inspectionStyles.recordDetails}><div><dt>Created</dt><dd>{formatTimestamp(milestone.createdAt)}</dd></div><div><dt>Last edited</dt><dd>{formatTimestamp(milestone.updatedAt)}</dd></div>{milestone.completedAt && <div><dt>Reached</dt><dd>{formatTimestamp(milestone.completedAt)}</dd></div>}<div><dt>Record ID</dt><dd>{milestone.id}</dd></div></dl></ProjectDisclosure>
          </div>
        )}
        {blocker && (
          <div className={inspectionStyles.body}>
            <p>{blocker.condition}</p>
            <div className={inspectionStyles.facts}>
              <div className={inspectionStyles.fact}><span>Status</span><strong>{displayLabel(blocker.state)}</strong></div>
              <div className={inspectionStyles.fact}><span>Severity</span><strong>{displayLabel(blocker.severity)}</strong></div>
              <div className={inspectionStyles.fact}><span>Owner</span><strong>{blocker.owner || "Unassigned"}</strong></div>
              <div className={inspectionStyles.fact}><span>Due</span><strong>{formatDate(blocker.dueAt, "No due date")}</strong></div>
            </div>
            {blocker.resolution && <p><strong>Resolution:</strong> {blocker.resolution}</p>}
            <div className={inspectionStyles.actions}>
              {blocker.state === "open" && <button type="button" className={styles.button} disabled={parentReadOnly} title={parentReadOnlyReason} onClick={() => openEditor("blocker-resolve", item, blocker)}><UnigentamosIcon role="check" size={16} />Resolve blocker</button>}
              <Link className={styles.button} href={personalOpsCreateHref("follow-ups", item.project, { objectType: "blocker", objectId: blocker.id, label: blocker.title }, { dueAt: blocker.dueAt })}><UnigentamosIcon role="follow-up" size={16} />Create follow-up</Link>
              {!hasBlockerDecisionOwner && <Link className={styles.button} href={personalOpsCreateHref("decisions", item.project, { objectType: "blocker", objectId: blocker.id, label: blocker.title }, { dueAt: blocker.dueAt })}><UnigentamosIcon role="decision" size={16} />File decision</Link>}
              {blocker.sourceRefs.map((ref) => <Link className={styles.button} href={ref.route} key={`${ref.module}-${ref.objectId}`}><UnigentamosIcon role="open" size={16} />Open {ref.label}</Link>)}
            </div>
            <details className={inspectionStyles.disclosure}>
              <summary>Follow-through &amp; review<UnigentamosIcon role="chevron-down" size={16} /></summary>
              <div className={inspectionStyles.supporting}>
            <LinkedFollowUpsPanel showRefresh={false}
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
            <LinkedDecisionsPanel showRefresh={false}
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
            </details>
          </div>
        )}

        {link && (
          <div className={inspectionStyles.body}>
            {link.healthNote && <div className={styles.boundary}><strong>{displayLabel(link.linkState)} association</strong>{link.healthNote}</div>}
            {link.lastRepair && <div className={styles.boundary}><strong>Last repaired {formatDate(link.lastRepair.repairedAt)}</strong>{link.lastRepair.reason} Previous source: {link.lastRepair.previousSource.label}.</div>}
            <ConnectionInspectionEditor
              link={link}
              readOnly={parentReadOnly || link.linkState === "removed" || linkNeedsRepair(link)}
              busy={mutationBusy}
              onSave={(patch) => saveConnectionInline(item, link, patch)}
            />
            <div className={inspectionStyles.actions}>
              <RowActionIcons inspectLabel={`Inspect ${link.source.label} connection`} openHref={linkSourceIsUnsafe(link) ? undefined : link.source.route} openLabel={`Open ${link.source.label}`} />
              {linkNeedsRepair(link) ? (
                <button type="button" className={styles.button} disabled={parentReadOnly} title={parentReadOnlyReason} onClick={() => openEditor("link-repair", item, link)}>Repair association</button>
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
          <div className={inspectionStyles.body}>
            <p>{inspectionSummary}</p>
            {typeof removalReason === "string" && removalReason && <div className={inspectionStyles.contentSection}><h3>Reason for removal</h3><p>{removalReason}</p></div>}
            {changeLog.length > 0 && <details className={inspectionStyles.disclosure} open={!interaction}>
              <summary>{interaction ? "Update history" : "What changed"}<UnigentamosIcon role="chevron-down" size={16} /></summary>
              <section className={inspectionStyles.changes} aria-label="Change log">
              <ul>{changeLog.map((change) => <li key={change.id}>
                <div className={inspectionStyles.changeHeading}><strong>{change.label === "State" ? "Status" : change.label === "Link state" ? "Link status" : change.label === "Occurred" ? "Date and time" : change.label}</strong><time dateTime={change.occurredAt}>{formatTimestamp(change.occurredAt)}</time></div>
                <div className={inspectionStyles.changeValues}><div><span>Before</span><p>{readableChange(change.before, change.label)}</p></div><UnigentamosIcon role="arrow-right" size={16} /><div><span>After</span><p>{readableChange(change.after, change.label)}</p></div></div>
              </li>)}</ul>
              </section>
            </details>}
            <div className={inspectionStyles.actions}>
              {interaction && <button type="button" className={styles.button} disabled={parentReadOnly || mutationBusy} title={parentReadOnlyReason} onClick={() => openEditor("interaction-edit", item, interaction)}><UnigentamosIcon role="edit" size={16} />Edit update</button>}
              {timelineEvent.eventType.startsWith("link_") && timelineEvent.sourceRef?.route && <Link className={styles.button} href={timelineEvent.sourceRef.route}><UnigentamosIcon role="open" size={16} />Open linked object</Link>}
            </div>
            <details className={inspectionStyles.disclosure}>
              <summary>Event details<UnigentamosIcon role="chevron-down" size={16} /></summary>
            <form
              className={inspectionStyles.eventEditor}
              key={timelineEvent.updatedAt}
              onSubmit={async (submitEvent) => {
                submitEvent.preventDefault();
                const form = new FormData(submitEvent.currentTarget);
                await saveTimelineEvent(item, timelineEvent, {
                  eventType: String(form.get("eventType")) as ProjectTimelineEventType,
                  occurredAt: String(form.get("occurredAt"))
                });
              }}
            >
              <label className={styles.field}>Event type<SelectField name="eventType" defaultValue={timelineEvent.eventType} disabled={parentReadOnly || mutationBusy}>{PROJECT_TIMELINE_EVENT_TYPES.map((eventType) => <option value={eventType} key={eventType}>{displayLabel(eventType)}</option>)}</SelectField></label>
              <label className={styles.field}>Date and time<input name="occurredAt" type="datetime-local" defaultValue={toLocalDateTimeInput(new Date(timelineEvent.occurredAt))} disabled={parentReadOnly || mutationBusy} required /></label>
              {!parentReadOnly && <button type="submit" className={styles.button} data-primary="true" disabled={mutationBusy}>{mutationBusy ? "Saving…" : "Save event details"}</button>}
            </form>
            </details>
          </div>
        )}

        {selectedDecision && (
          <div className={inspectionStyles.body}>
            <div className={inspectionStyles.contentSection}><h3>Question</h3><p>{selectedDecision.question || "No question recorded."}</p></div>
            <div className={inspectionStyles.contentSection}><h3>Decision</h3><p>{selectedDecision.finalDecision || "No decision recorded yet."}</p></div>
            <div className={inspectionStyles.actions}>
              <Link className={styles.button} href={decisionOwnerRoute(selectedDecision)}><UnigentamosIcon role="open" size={16} />Open decision</Link>
            </div>
          </div>
        )}

        {!milestone && !blocker && !link && !timelineEvent && !selectedDecision && (
          <SystemState variant="stale" compact title="This item is no longer available" description="Close this inspection to return to the project." />
        )}
      </section>
    );
  }

  function renderProjectBody(item: ProjectDirectoryItem) {
    const tabsId = `project-${item.project.id}`;
    return (
      <div className={styles.projectBody}>
        <DetailTabs id={tabsId} tabs={PROJECT_TABS} activeTab={visibleProjectTab(activeTab)} onTabChange={selectTab} ariaLabel={`${item.project.name} detail sections`} className={styles.tabs} />
        {mutationError && <p className={styles.errorBanner} role="alert">{mutationError}</p>}
        {notice && <p className={styles.successBanner} role="status">{notice}</p>}
        {renderSelectedChildContext(item)}
        <DetailTabPanel tabsId={tabsId} tabId="overview" active={activeTab === "overview"}>{renderOverview(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="activity" active={visibleProjectTab(activeTab) === "activity"}>{renderTimeline(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="links" active={visibleProjectTab(activeTab) === "links"}>
          <div className={styles.projectLinks}><div className={styles.linkColumn}>{renderPeople(item)}{renderFilesLinks(item)}</div><div className={styles.linkColumn}>{renderNotesDecisions(item)}{renderReviewCoverage(item)}</div><RelatedRecords module="projects" type="project" id={item.project.id} hideEmpty /></div>
        </DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="properties" active={activeTab === "properties"}>{renderProperties(item)}</DetailTabPanel>
      </div>
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
            <li><span>Upcoming milestones</span><strong>{incompleteMilestones.length}</strong></li>
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
    ? "New project"
    : editor?.kind === "project-edit"
      ? "Edit project"
      : editor?.kind === "legacy-promote"
        ? "Start project tracking"
        : editor?.kind === "milestone-create"
          ? "Add milestone"
          : editor?.kind === "milestone-edit"
            ? "Edit milestone"
          : editor?.kind === "blocker-create"
            ? "Add blocker"
        : editor?.kind === "blocker-resolve"
            ? "Resolve blocker"
            : editor?.kind === "interaction-create"
              ? "Log project update"
              : editor?.kind === "interaction-edit"
                ? "Edit project update"
              : editor?.kind === "link-edit"
                ? "Edit connection"
              : editor?.kind === "link-health"
                ? "Report association issue"
                : editor?.kind === "link-repair"
                  ? "Repair source association"
                  : editor?.values.linkScope === "organization" ? "Link organization" : editor?.values.linkScope === "people" ? "Link person" : editor?.values.linkScope === "note" ? "Link note" : "Link object";
  const editorDescription = editor?.kind === "legacy-promote"
    ? "Start tracking this project in the current workspace."
    : editor?.kind === "milestone-create" || editor?.kind === "milestone-edit"
      ? "A moment worth marking in your project’s progress."
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
        : editor?.kind === "interaction-edit"
          ? "Update the title, details, or occurrence time for this project update."
      : "Choose Save to keep your changes. The project history records each update.";

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
                <input className={styles.objectiveDate} type="date" value={objective.targetAt} onChange={(event) => updateEditorObjective(objective.id, { targetAt: event.target.value })} aria-label={`Objective ${index + 1} target date`} title="Objective target date" />
                <button type="button" className={styles.removeObjectiveButton} onClick={() => {
                  setEditor((current) => current ? { ...current, objectives: current.objectives?.filter((item) => item.id !== objective.id) } : current);
                  setEditorDirty(true);
                }} aria-label={`Delete objective ${index + 1}`} title="Delete objective" data-icon-button="compact"><ObjectiveDeleteIcon /></button>
              </li>)}
            </ul>
            <button type="button" className={styles.addRowButton} onClick={() => {
              setEditor((current) => current ? { ...current, objectives: [...(current.objectives || []), { id: `draft-objective-${crypto.randomUUID()}`, text: "", targetAt: "", completed: false }] } : current);
              setEditorDirty(true);
            }}><UnigentamosIcon role="plus" size={16} /> Add objective</button>
          </fieldset>
          {editor.kind === "project-create" && <fieldset className={styles.repeatableField} data-wide="true">
            <legend>People</legend>
            <div className={styles.peopleEditorRows}>
              {(editor.people || []).map((person, index) => <div className={styles.personEditorRow} key={person.id}>
                <label>Person<SelectField value={person.personId} onChange={(event) => updateEditorPerson(person.id, { personId: event.target.value })} aria-label={`Person ${index + 1}`}>
                  <option value="">Choose a People profile</option>
                  {initialPeople.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.profile?.fullName || candidate.title}</option>)}
                </SelectField></label>
                <label>Role<input value={person.role} onChange={(event) => updateEditorPerson(person.id, { role: event.target.value })} placeholder="e.g. Client, designer" /></label>
                <label>Context<input value={person.context} onChange={(event) => updateEditorPerson(person.id, { context: event.target.value })} placeholder="Optional context" /></label>
                <button type="button" className={styles.iconButton} onClick={() => {
                  setEditor((current) => current ? { ...current, people: current.people?.filter((item) => item.id !== person.id) } : current);
                  setEditorDirty(true);
                }} aria-label={`Remove person ${index + 1}`} data-icon-button="compact"><UnigentamosIcon role="close" size={14} /></button>
              </div>)}
            </div>
            <button type="button" className={styles.addRowButton} onClick={() => {
              setEditor((current) => current ? { ...current, people: [...(current.people || []), { id: `draft-person-${crypto.randomUUID()}`, personId: "", role: "", context: "" }] } : current);
              setEditorDirty(true);
            }}><UnigentamosIcon role="plus" size={16} /> Add person</button>
          </fieldset>}
          <label className={styles.field}>Status<SelectField name="lifecycle" value={value("lifecycle")} onChange={(event) => changeEditorValue("lifecycle", event.target.value)}>
            {!(["idea", "developing", "active", "monitoring", "dormant"] as string[]).includes(value("lifecycle")) && <option value={value("lifecycle")}>{displayLabel(value("lifecycle"))} (legacy)</option>}
            {["idea", "developing", "active", "monitoring", "dormant"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}
          </SelectField></label>
          <label className={styles.field}>Review cadence<SelectField name="defaultCadence" value={value("defaultCadence")} onChange={(event) => changeEditorValue("defaultCadence", event.target.value)}>
            <option value="">Not set</option>
            {value("defaultCadence") && !PROJECT_REVIEW_CADENCES.some((option) => option.value === value("defaultCadence")) && <option value={value("defaultCadence")}>{displayLabel(value("defaultCadence"))} (legacy)</option>}
            {PROJECT_REVIEW_CADENCES.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </SelectField></label>
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
    if (editor.kind === "milestone-create" || editor.kind === "milestone-edit") {
      return <div className={styles.milestoneForm}>
        <label className={styles.field}><span><UnigentamosIcon role="goal" size={16}/>Milestone title</span><input value={value("title")} onChange={event=>changeEditorValue("title",event.target.value)} placeholder="First customer, launch day, a meaningful result…" required autoFocus maxLength={240}/></label>
        <div className={styles.formGrid}>
          <label className={styles.field}><span><UnigentamosIcon role="calendar" size={16}/>Target date <small>(optional)</small></span><input type="date" value={value("dueAt")} onChange={event=>changeEditorValue("dueAt",event.target.value)}/></label>
          <label className={styles.field}><span><UnigentamosIcon role="person" size={16}/>Owner <small>(optional)</small></span><input value={value("owner")} onChange={event=>changeEditorValue("owner",event.target.value)}/></label>
        </div>
        <label className={styles.field}><span>Description <small>(optional)</small></span><textarea rows={3} value={value("description")} onChange={event=>changeEditorValue("description",event.target.value)} placeholder="What makes this moment meaningful?"/></label>
        {editor.kind === "milestone-edit" && <label className={styles.field}>Progress<SelectField value={value("state")} onChange={event=>changeEditorValue("state",event.target.value)} aria-label="Milestone progress">{(["planned","active","blocked","complete"] as const).map(state=><option key={state} value={state}>{milestoneLabel(state)}</option>)}{["open","due"].includes(value("state")) && <option value={value("state")}>Upcoming</option>}</SelectField></label>}
        <ProjectDisclosure title="Optional details" icon="notes" defaultOpen={Boolean(value("completionCriteria") || value("completionNote"))}>
          <div className={styles.milestoneForm}>
            <label className={styles.field}><span>Success criteria <small>(optional)</small></span><textarea rows={2} value={value("completionCriteria")} onChange={event=>changeEditorValue("completionCriteria",event.target.value)} placeholder="How you’ll recognize this milestone, one item per line"/></label>
            {editor.kind === "milestone-edit" && <label className={styles.field}><span>Reflection <small>(optional)</small></span><textarea rows={2} value={value("completionNote")} onChange={event=>changeEditorValue("completionNote",event.target.value)} placeholder="What happened or what you learned"/></label>}
          </div>
        </ProjectDisclosure>
      </div>;
    }
    if (editor.kind === "blocker-create") {
      return <div className={styles.formGrid}>
        <label className={styles.field} data-wide="true">Blocker title<input value={value("title")} onChange={(event) => changeEditorValue("title", event.target.value)} required autoFocus /></label>
        <label className={styles.field} data-wide="true">Blocking condition<textarea value={value("condition")} onChange={(event) => changeEditorValue("condition", event.target.value)} required /></label>
        <label className={styles.field}>Severity<SelectField value={value("severity")} onChange={(event) => changeEditorValue("severity", event.target.value)}>{["low", "medium", "high", "critical"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}</SelectField></label>
        <label className={styles.field}>Owner<input value={value("owner")} onChange={(event) => changeEditorValue("owner", event.target.value)} /></label>
        <label className={styles.field}>Due date<input type="date" value={value("dueAt")} onChange={(event) => changeEditorValue("dueAt", event.target.value)} /></label>
      </div>;
    }
    if (editor.kind === "blocker-resolve") {
      return <label className={styles.field}>Resolution record<textarea value={value("resolution")} onChange={(event) => changeEditorValue("resolution", event.target.value)} required autoFocus placeholder="What changed, and what evidence confirms the blocker is resolved?" /></label>;
    }
    if (editor.kind === "interaction-create" || editor.kind === "interaction-edit") {
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
          <label className={styles.field}>Relationship<SelectField value={value("relationship")} onChange={(event) => changeEditorValue("relationship", event.target.value)}>{LINK_RELATIONSHIPS.map((relationship) => <option value={relationship} key={relationship}>{displayLabel(relationship)}</option>)}</SelectField></label>
          <label className={styles.field}>Strength<SelectField value={value("relationshipStrength")} onChange={(event) => changeEditorValue("relationshipStrength", event.target.value)}>{["weak", "normal", "strong"].map((strength) => <option value={strength} key={strength}>{displayLabel(strength)}</option>)}</SelectField></label>
        </>}
        <label className={styles.field} data-wide="true">Description<textarea value={value("projectSpecificNote")} onChange={(event) => changeEditorValue("projectSpecificNote", event.target.value)} autoFocus={!editingPerson} /></label>
      </div>;
    }
    if (editor.kind === "link-health") {
      return <div className={styles.formGrid}>
        <label className={styles.field}>Observed state<SelectField value={value("healthState")} onChange={(event) => changeEditorValue("healthState", event.target.value)} autoFocus>{["stale", "broken", "missing"].map((state) => <option value={state} key={state}>{displayLabel(state)}</option>)}</SelectField></label>
        <label className={styles.field} data-wide="true">Health explanation<textarea value={value("healthReason")} onChange={(event) => changeEditorValue("healthReason", event.target.value)} maxLength={2000} required placeholder="What was checked, and why can this association no longer be trusted?" /><span>{value("healthReason").length}/2000 · preserved if the save fails</span></label>
        <div className={styles.boundary} data-wide="true"><strong>The link stays visible</strong>Broken and missing associations remain inspectable until you repair or explicitly remove them. The native source object is never deleted by this action.</div>
      </div>;
    }
    if (editor.kind === "link-repair") {
      return <div className={styles.formGrid}>
        <label className={styles.field}>Owner module<SelectField value={value("sourceModule")} onChange={(event) => changeEditorValues({ sourceModule: event.target.value, sourceObjectType: "", sourceObjectId: "", sourceContainerObjectId: "", sourceLabel: "" })} autoFocus>{LINK_MODULES.map((module) => <option value={module} key={module}>{displayLabel(module)}</option>)}</SelectField></label>
        <label className={styles.field}>Object type<input value={value("sourceObjectType")} onChange={(event) => changeEditorValue("sourceObjectType", event.target.value)} required /></label>
        <label className={styles.field}>Stable object ID<input value={value("sourceObjectId")} onChange={(event) => changeEditorValue("sourceObjectId", event.target.value)} required /></label>
        <label className={styles.field}>Parent / container ID<input value={value("sourceContainerObjectId")} onChange={(event) => changeEditorValue("sourceContainerObjectId", event.target.value)} placeholder="Required for nested Project or Review objects" /></label>
        <label className={styles.field} data-wide="true">Verified source label<input value={value("sourceLabel")} onChange={(event) => changeEditorValue("sourceLabel", event.target.value)} required /></label>
        <label className={styles.field} data-wide="true">Repair explanation<textarea value={value("repairReason")} onChange={(event) => changeEditorValue("repairReason", event.target.value)} maxLength={2000} required placeholder="What was verified, and why is this the correct native source?" /><span>{value("repairReason").length}/2000 · preserved if the save fails</span></label>
        <div className={styles.boundary} data-wide="true"><strong>Identity replacement only</strong>The relationship remains Project-owned. No Note, Resource, Media asset, Review, or other native object is copied, deleted, or merged.</div>
      </div>;
    }
    const linkScope = value("linkScope") || (value("sourceModule") === "people" ? "people" : "object");
    const linkingPeople = linkScope === "people" || linkScope === "organization";
    const linkingOrganizations = linkScope === "organization";
    const peopleOptions = initialPeople.filter(record=>linkingOrganizations ? record.className === "org" : record.className === "person");
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
          {linkingOrganizations ? "Organization" : "Person"}
          <SelectField
            aria-label={linkingOrganizations ? "Organization" : "Person"}
            searchable
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
            <option value="">Choose {linkingOrganizations ? "an organization" : "a person"}</option>
            {peopleOptions.map((person) => <option value={person.id} key={person.id}>{person.profile?.fullName || person.title}</option>)}
          </SelectField>
        </label>
      ) : (
        <>
          {!linkingNote && <label className={styles.field}>Object type<SelectField value={value("sourceModule")} onChange={(event) => changeEditorValues({
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
          </SelectField></label>}
          <label className={styles.field} data-wide="true">{linkingNote ? "Note" : "Object"}<SelectField value={value("sourceObjectId")} onChange={(event) => {
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
          </SelectField></label>
        </>
      )}
      {linkingPeople ? <>
        <label className={styles.field}>Role<input value={value("role")} onChange={(event) => changeEditorValue("role", event.target.value)} placeholder="e.g. Client, designer" /></label>
        <label className={styles.field} data-wide="true">Description<textarea value={value("projectSpecificNote")} onChange={(event) => changeEditorValue("projectSpecificNote", event.target.value)} placeholder="Anything else useful about their involvement" /></label>
      </> : <label className={styles.field} data-wide="true">Description<textarea value={value("projectSpecificNote")} onChange={(event) => changeEditorValue("projectSpecificNote", event.target.value)} /></label>}
    </div>;
  }

  const confirmationTarget = confirmation
    ? snapshot.projects.find((item) => item.project.id === confirmation.projectId) || null
    : null;
  const completionIssues = confirmation?.kind === "project-complete" && confirmationTarget
    ? [
        ...(confirmationTarget.project.objectives.length === 0 ? ["Record at least one project objective."] : []),

        ...openBlockers(confirmationTarget).map((blocker) => `Resolve, waive, or carry forward blocker: ${blocker.title}`)
      ]
    : [];
  const confirmationNeedsReason = confirmation?.kind === "project-archive";
  const confirmationTitle = confirmation?.kind === "project-complete"
    ? "Complete this project?"
    : confirmation?.kind === "project-archive"
      ? "Delete this project?"
      : confirmation?.kind === "project-restore"
        ? "Restore this project?"
        : confirmation?.kind === "milestone-complete"
          ? "Mark this milestone reached?"
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
          ? "Celebrate the progress. You can add a reflection now or come back to it later."
          : confirmation?.kind === "link-remove"
            ? "Only the Project reference will be removed. The source object remains unchanged in its owner module."
            : "The existing typed reference will return to its state from before removal.";

  const directory = (
    <DirectoryPane className={styles.directory} ariaLabel="Projects directory">
      <div className={styles.mainScroll}>
        <WorkspaceHeader title="Projects" count={visibleProjects.length}>

          <WorkspaceButton intent="primary" icon="plus" onClick={() => openEditor("project-create")}>Add project</WorkspaceButton>
        </WorkspaceHeader>
        {initialLoadError && <SystemState variant="error" compact title="Some project sources did not load" description={initialLoadError} />}
        {sourceErrors.length > 0 && <p className={styles.notice} role="status">Some linked context could not load. Existing projects remain available.</p>}
        <WorkspaceToolbar query={query} onQuery={(value) => { setQuery(value); updateUrl({ query: value }); }} placeholder="Search projects"
          activeFilters={filter === "all" ? 0 : 1}
          filters={<div className={styles.filterRow} aria-label="Project filters">
            {(["all", "due", "due-month", "needs-review", "archived"] as const).map((value) =>
              <WorkspaceButton key={value} aria-pressed={filter === value} onClick={() => { setFilter(value);setView(value==="archived"?"archived":"all");setSelectedPills([]);const params=new URLSearchParams(destinationFor({filter:value,view:value==="archived"?"archived":"all"}).split("?")[1]||"");params.delete("views");router.replace(`${pathname}?${params}`,{scroll:false}); }}>{FILTER_LABELS[value]}</WorkspaceButton>)}
          </div>}>
          <SelectField className={styles.selectControl} value={sort} onChange={(event) => { const value = event.target.value as ProjectSort; setSort(value); updateUrl({ sort: value }); }} aria-label="Sort projects">
            {Object.entries(SORT_LABELS).filter(([value]) => value !== "priority").map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </SelectField>
          <SelectField data-toolbar-view className={styles.layoutSelect} value={grid ? "grid" : compact ? "compact" : "comfortable"} aria-label="Project layout" onChange={event => {
            const nextGrid = event.target.value === "grid", nextCompact = event.target.value === "compact";
            setGrid(nextGrid); setCompact(nextCompact); updateUrl({ grid: nextGrid, compact: nextCompact });
          }}><option value="comfortable">Comfortable</option><option value="compact">Compact</option><option value="grid">Grid</option></SelectField>
        </WorkspaceToolbar>
        {visibleProjects.length ? (
          <ProjectDirectoryCards
            items={visibleProjects}
            view={grid ? "grid" : compact ? "compact" : "comfortable"}
            selectedId={selectedProjectId}
            busy={mutationBusy}
            timeZone={displayTimeZone}
            onSelect={selectProject}
            onToggleStar={item => void toggleStar(item)}
            onObjectiveOpen={()=>setObjectiveDirectoryHold({key:directoryKey,ids:visibleProjects.map(item=>item.project.id)})}
            onObjectiveSaved={applyMutationEnvelope}
            onGoalSaved={applyLinkedGoal}
            onObjectiveToggle={toggleCardObjective}
            pendingObjective={pendingObjective}
          />
        ) : (
          <SystemState
            variant="empty"
            title="No projects match this operating view"
            description="Try another search or clear your filters. Archived projects are available in Filters."
            action={{ label: "Clear view", onSelect: () => {
              setView("all");
              setFilter("all");
              setQuery("");
              setSelectedPills([]);
              const params = new URLSearchParams(destinationFor({view:"all",filter:"all",query:""}).split("?")[1] || "");
              params.delete("views");
              window.history.replaceState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
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
      {selectedItem ? renderProjectBody(selectedItem) : <div className={styles.emptyInspector}><h2>Select a project</h2><p>See its objectives, recent work, people, and next steps.</p></div>}
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
        submitLabel={editor.kind === "project-create" ? "Create project" : editor.kind === "milestone-create" ? "Add milestone" : "Save changes"}
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
      detailOpen={inspectorOpen}
      onBack={() => { if (editor) requestCloseEditor(); else setInspectorOpen(false); }}
        module="projects"
        mode={initialDetail ? "detail" : "directory"}
        className={`${styles.shell} ${initialDetail ? styles.detailShell : ""}`}
        ariaLabel={initialDetail && selectedItem ? `${selectedItem.project.name} project workspace` : "Projects workspace"}
        sidebar={<ModuleSidebar
          title="Projects"
          description="Plan work, track milestones, and keep related context together."
          sections={[]}
          className={styles.sidebar}
          mobileOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          status={!initialDetail ? projectViewPills : undefined}
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

        {initialDetail ? (
          <div className={styles.mainScroll}>
            {selectedItem ? <>{renderProjectHeader(selectedItem, "h1")}{renderProjectBody(selectedItem)}</> : <SystemState variant="error" title="Project not found" description="The requested project identity is not available in the current native or legacy snapshot." />}
          </div>
        ) : directory}
      </ModuleShell>

      <ProjectObjectiveUndo objective={objectiveUndo?.objective.text} error={objectiveUndoError} busy={mutationBusy} onDismiss={dismissObjectiveUndo} onUndo={()=>{
        if (!objectiveUndo) return;
        const item = snapshot.projects.find(row=>row.project.id === objectiveUndo.projectId);
        if (!item || !item.project.editable || ["complete","archived"].includes(item.project.lifecycle)) {
          setObjectiveUndoError("This project is no longer editable. Review its details before making changes.");
          return;
        }
        void toggleCardObjective(item,{...objectiveUndo.objective,completed:true},objectiveUndo);
      }}/>

      {(mobileSidebarOpen || (isInspectorOverlay && inspectorOpen)) && <button type="button" className={styles.scrim} onClick={() => {
        setMobileSidebarOpen(false);
        if (editor) requestCloseEditor();
        else setInspectorOpen(false);
      }} aria-label="Close open Projects panel" />}

      {photoItem && <PeopleProfilePhotoDialog open projectLogo personId={photoItem.project.id} personName={photoItem.project.name} hasPhoto={Boolean(photoItem.project.photoUpdatedAt)} photoEndpoint={`/api/projects/photos/${encodeURIComponent(photoItem.project.id)}`} cropDescription="Drag to reposition or adjust the zoom. This crop appears wherever the project is linked." onClose={() => setPhotoProjectId(null)} onSaved={photo => saveProjectPhoto(photoItem, photo.updatedAt)} onRemoved={() => saveProjectPhoto(photoItem, "")} />}
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
        confirmLabel={confirmation?.kind === "milestone-complete" ? "Mark reached" : confirmation?.kind === "project-archive" ? "Delete project" : confirmation?.kind === "link-remove" ? "Remove link" : confirmation?.kind === "project-restore" || confirmation?.kind === "link-restore" ? "Restore" : "Confirm completion"}
        tone={confirmation?.kind === "project-archive" || confirmation?.kind === "link-remove" ? "danger" : "default"}
        busy={mutationBusy}
        confirmDisabled={completionIssues.length > 0 || Boolean(confirmationNeedsReason && !confirmationReason.trim())}
        confirmDisabledReason={completionIssues.length ? "Resolve every listed completion gate first." : confirmationNeedsReason && !confirmationReason.trim() ? "A reason is required for this auditable mutation." : undefined}
      >
        {(confirmationNeedsReason || confirmation?.kind === "milestone-complete") && (
          <label className={styles.field}>
            {confirmation?.kind === "project-archive" ? "Deletion reason" : "Reflection (optional)"}
            <textarea value={confirmationReason} onChange={(event) => setConfirmationReason(event.target.value)} autoFocus={Boolean(confirmationNeedsReason)} />
          </label>
        )}
      </ConfirmationSheet>
    </>
  );
}
