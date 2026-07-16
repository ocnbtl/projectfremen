import { readJsonFile, writeJsonFile } from "../../file-store";
import {
  createAuditEvent,
  type AuditEvent,
  type AuditSnapshot,
  type AuditSource
} from "../../native-objects/audit";
import type { MutationErrorCode } from "../../native-objects/mutation-result";
import { createNativeObjectRef } from "../../native-objects/routes";
import {
  isModuleId,
  type CadenceState,
  type HealthState,
  type LifecycleState,
  type LinkState,
  type NativeObjectRef,
  type ReviewState
} from "../../native-objects/types";
import {
  findLegacyProjectMapping,
  getLegacyProjectDefinition
} from "./legacy-adapter";
import {
  PROJECT_OBJECT_FAMILIES,
  PROJECTS_SCHEMA_VERSION,
  type LegacyProjectPromotionInput,
  type Project,
  type ProjectBlocker,
  type ProjectBlockerSeverity,
  type ProjectBlockerState,
  type ProjectCadenceState,
  type ProjectCreateInput,
  type ProjectHistoryEntry,
  type ProjectLink,
  type ProjectLinkRelationship,
  type ProjectLinkStrength,
  type ProjectMilestone,
  type ProjectMilestoneState,
  type ProjectObjectFamily,
  type ProjectPriority,
  type ProjectReviewState,
  type ProjectsCreateInputByFamily,
  type ProjectsCreateResult,
  type ProjectsLegacyMapping,
  type ProjectsObjectByFamily,
  type ProjectsState,
  type ProjectsUpdateInputByFamily,
  type ProjectsUpdateResult,
  type ProjectTimelineEvent,
  type ProjectTimelineEventType,
  type ProjectVisibility,
  type ProjectPrivacyScope
} from "./types";

const FILE_NAME = "projects.json";
const MAX_MODULE_AUDIT_EVENTS = 1000;
const MAX_TIMELINE_EVENTS = 5000;

const LIFECYCLE_STATES: LifecycleState[] = ["draft", "planned", "active", "complete", "archived"];
const REVIEW_STATES: ProjectReviewState[] = [
  "not_required",
  "not_reviewed",
  "needs_review",
  "in_review",
  "reviewed",
  "waived",
  "unknown"
];
const CADENCE_STATES: ProjectCadenceState[] = [
  "current",
  "due_soon",
  "overdue",
  "dormant",
  "paused",
  "unset"
];
const PRIORITIES: ProjectPriority[] = ["low", "medium", "high", "critical"];
const VISIBILITIES: ProjectVisibility[] = ["private", "shared"];
const PRIVACY_SCOPES: ProjectPrivacyScope[] = ["project_only", "module_shared"];
const MILESTONE_STATES: ProjectMilestoneState[] = [
  "planned",
  "open",
  "active",
  "due",
  "blocked",
  "complete",
  "archived"
];
const BLOCKER_STATES: ProjectBlockerState[] = [
  "open",
  "resolved",
  "waived",
  "carried_forward",
  "archived"
];
const BLOCKER_SEVERITIES: ProjectBlockerSeverity[] = ["low", "medium", "high", "critical"];
const LINK_RELATIONSHIPS: ProjectLinkRelationship[] = [
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
  "related_project"
];
const LINK_STRENGTHS: ProjectLinkStrength[] = ["weak", "normal", "strong"];
const LINK_STATES: LinkState[] = ["active", "missing", "stale", "broken", "pending", "removed"];
const NATIVE_REVIEW_STATES: ReviewState[] = [
  "not_required",
  "not_reviewed",
  "needs_review",
  "in_review",
  "reviewed",
  "waived"
];

/**
 * Explicit, versioned health rules. These are category rules, not a weighted
 * readiness formula: high/critical blockers block; other open-loop conditions
 * need attention; an operational project with owner and objective is healthy.
 */
export const PROJECT_HEALTH_RULESET_VERSION = "projects-health-v1" as const;

const FAMILY_OBJECT_TYPE = {
  projects: "project",
  milestones: "milestone",
  blockers: "blocker",
  links: "project_link"
} as const;

let mutationQueue: Promise<void> = Promise.resolve();

export class ProjectsStoreError extends Error {
  readonly code: MutationErrorCode;
  readonly status: number;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;

  constructor(
    code: MutationErrorCode,
    message: string,
    options: {
      status?: number;
      fieldErrors?: Readonly<Record<string, readonly string[]>>;
    } = {}
  ) {
    super(message);
    this.name = "ProjectsStoreError";
    this.code = code;
    this.status =
      options.status ??
      (code === "not_found" ? 404 : code === "conflict" || code === "stale" ? 409 : 400);
    this.fieldErrors = options.fieldErrors;
  }
}

export function createEmptyProjectsState(): ProjectsState {
  return {
    schemaVersion: PROJECTS_SCHEMA_VERSION,
    projects: [],
    milestones: [],
    blockers: [],
    links: [],
    timelineEvents: [],
    auditEvents: [],
    legacyMappings: []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validation(message: string, field?: string): never {
  throw new ProjectsStoreError("validation", message, {
    status: 400,
    ...(field ? { fieldErrors: { [field]: [message] } } : {})
  });
}

function requiredText(value: unknown, field: string, maxLength = 4000): string {
  if (typeof value !== "string") validation(`${field} is required`, field);
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) validation(`${field} is required`, field);
  if (normalized.length > maxLength) {
    validation(`${field} must be ${maxLength} characters or fewer`, field);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maxLength = 12000): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") validation(`${field} must be text`, field);
  const normalized = value.replace(/\u0000/g, "").trim();
  if (normalized.length > maxLength) {
    validation(`${field} must be ${maxLength} characters or fewer`, field);
  }
  return normalized || undefined;
}

function optionalDate(value: unknown, field: string): string | undefined {
  const normalized = optionalText(value, field, 120);
  if (!normalized) return undefined;
  if (Number.isNaN(Date.parse(normalized))) {
    validation(`${field} must be a valid date or timestamp`, field);
  }
  return normalized;
}

function enumValue<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  fallback: Value,
  field: string
): Value {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    validation(`${field} has an unsupported value`, field);
  }
  return value as Value;
}

function booleanValue(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") validation(`${field} must be true or false`, field);
  return value;
}

function stringList(value: unknown, field: string, limit = 60): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation(`${field} must be a list`, field);
  const seen = new Set<string>();
  const result: string[] = [];
  value.slice(0, limit).forEach((item, index) => {
    const normalized = requiredText(item, `${field}.${index}`, 1000);
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  });
  return result;
}

function normalizeNativeRef(value: unknown, field: string): NativeObjectRef {
  if (!isRecord(value)) validation(`${field} must be a native object reference`, field);
  const module = requiredText(value.module, `${field}.module`, 40);
  if (!isModuleId(module)) validation(`${field}.module is unsupported`, `${field}.module`);
  return createNativeObjectRef({
    module,
    objectType: requiredText(value.objectType, `${field}.objectType`, 80),
    objectId: requiredText(value.objectId, `${field}.objectId`, 240),
    containerObjectId: optionalText(value.containerObjectId, `${field}.containerObjectId`, 240),
    label: requiredText(value.label, `${field}.label`, 240),
    versionId: optionalText(value.versionId, `${field}.versionId`, 240)
  });
}

function optionalNativeRef(value: unknown, field: string): NativeObjectRef | undefined {
  return value === undefined || value === null || value === ""
    ? undefined
    : normalizeNativeRef(value, field);
}

function normalizeNativeRefs(value: unknown, field: string): NativeObjectRef[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation(`${field} must be a list`, field);
  const seen = new Set<string>();
  return value.slice(0, 80).flatMap((item, index) => {
    const ref = normalizeNativeRef(item, `${field}.${index}`);
    const key = `${ref.module}:${ref.objectType}:${ref.containerObjectId || "root"}:${ref.objectId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [ref];
  });
}

function normalizeSlug(value: unknown, fallback: string): string {
  const source = optionalText(value, "slug", 120) || fallback;
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!slug) validation("slug must include at least one letter or number", "slug");
  return slug;
}

function historyEntry(
  action: string,
  occurredAt: string,
  actorId: string,
  detail?: string
): ProjectHistoryEntry {
  return {
    id: `history-${crypto.randomUUID()}`,
    action,
    occurredAt,
    actorId,
    ...(detail ? { detail } : {})
  };
}

function projectRef(project: Project): NativeObjectRef {
  return createNativeObjectRef({
    module: "projects",
    objectType: "project",
    objectId: project.id,
    label: project.name
  });
}

function objectRef(item: Project | ProjectMilestone | ProjectBlocker | ProjectLink): NativeObjectRef {
  if (item.objectType === "project") return projectRef(item);
  const label =
    item.objectType === "project_link"
      ? `${item.relationship.replace(/_/g, " ")}: ${item.source.label}`
      : item.title;
  return createNativeObjectRef({
    module: "projects",
    objectType: item.objectType,
    objectId: item.id,
    containerObjectId: item.projectId,
    label
  });
}

function snapshot(value: Project | ProjectMilestone | ProjectBlocker | ProjectLink | null): AuditSnapshot {
  if (!value) return null;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function moduleAuditEvent(input: {
  item: Project | ProjectMilestone | ProjectBlocker | ProjectLink;
  action: string;
  actorId: string;
  occurredAt: string;
  before: Project | ProjectMilestone | ProjectBlocker | ProjectLink | null;
  source?: AuditSource;
}): AuditEvent {
  return createAuditEvent({
    id: `audit-${crypto.randomUUID()}`,
    object: objectRef(input.item),
    action: input.action,
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    before: snapshot(input.before),
    after: snapshot(input.item),
    source: input.source || "user"
  });
}

function timelineEvent(input: {
  project: Project;
  eventType: ProjectTimelineEventType;
  title: string;
  summary: string;
  actorId: string;
  occurredAt: string;
  relatedObject?: Project | ProjectMilestone | ProjectBlocker | ProjectLink;
  sourceRef?: NativeObjectRef;
}): ProjectTimelineEvent {
  return {
    id: `project-event-${crypto.randomUUID()}`,
    objectType: "timeline_event",
    projectId: input.project.id,
    eventType: input.eventType,
    title: input.title,
    summary: input.summary,
    health: input.project.health,
    occurredAt: input.occurredAt,
    ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
    ...(input.relatedObject ? { relatedObjectRef: objectRef(input.relatedObject) } : {}),
    isManual: false,
    actorId: input.actorId,
    createdAt: input.occurredAt
  };
}

function monotonicTimestamp(previous: string, candidate: string): string {
  if (candidate > previous) return candidate;
  const parsed = Date.parse(previous);
  return Number.isNaN(parsed) ? candidate : new Date(parsed + 1).toISOString();
}

function appendModuleAudit(state: ProjectsState, event: AuditEvent): AuditEvent[] {
  return [...state.auditEvents, event].slice(-MAX_MODULE_AUDIT_EVENTS);
}

function appendTimeline(state: ProjectsState, event: ProjectTimelineEvent): ProjectTimelineEvent[] {
  return [...state.timelineEvents, event].slice(-MAX_TIMELINE_EVENTS);
}

function withMutationLock<Result>(task: () => Promise<Result>): Promise<Result> {
  const result = mutationQueue.catch(() => undefined).then(task);
  mutationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function assertState(value: unknown): ProjectsState {
  if (!isRecord(value) || value.schemaVersion !== PROJECTS_SCHEMA_VERSION) {
    throw new ProjectsStoreError(
      "server",
      "Projects data uses an unsupported schema version. A migration is required before writing.",
      { status: 500 }
    );
  }
  for (const key of [
    "projects",
    "milestones",
    "blockers",
    "links",
    "timelineEvents",
    "auditEvents",
    "legacyMappings"
  ] as const) {
    if (!Array.isArray(value[key])) {
      throw new ProjectsStoreError("server", `Projects data is malformed: ${key} must be a collection.`, {
        status: 500
      });
    }
  }
  return value as unknown as ProjectsState;
}

export async function readProjectsState(): Promise<ProjectsState> {
  const empty = createEmptyProjectsState();
  return assertState(await readJsonFile<unknown>(FILE_NAME, empty));
}

function collectionFor<Family extends ProjectObjectFamily>(
  state: ProjectsState,
  family: Family
): ProjectsObjectByFamily[Family][] {
  return state[family] as ProjectsObjectByFamily[Family][];
}

export async function listProjectsObjects<Family extends ProjectObjectFamily>(
  family: Family,
  options: { projectId?: string } = {}
): Promise<ProjectsObjectByFamily[Family][]> {
  const state = await readProjectsState();
  const projectId = options.projectId?.trim();
  return [...collectionFor(state, family)]
    .filter((item) => {
      if (!projectId || family === "projects") return true;
      return "projectId" in item && item.projectId === projectId;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readProjectsObject<Family extends ProjectObjectFamily>(
  family: Family,
  id: string
): Promise<ProjectsObjectByFamily[Family] | null> {
  const state = await readProjectsState();
  return collectionFor(state, family).find((item) => item.id === id) ?? null;
}

function projectById(state: ProjectsState, id: string): Project {
  const project = state.projects.find((item) => item.id === id);
  if (!project) throw new ProjectsStoreError("not_found", "Project not found", { status: 404 });
  return project;
}

function ensureOperationalProject(project: Project): void {
  if (project.lifecycle === "archived") {
    throw new ProjectsStoreError(
      "read_only",
      "Restore this project before changing its milestones, blockers, or links.",
      { status: 409 }
    );
  }
  if (project.lifecycle === "complete") {
    throw new ProjectsStoreError(
      "read_only",
      "Completed projects are read-only. Project reopen behavior is intentionally unfinished.",
      { status: 409 }
    );
  }
}

function deriveProjectHealth(project: Project, state: ProjectsState, now: string): HealthState {
  if (project.lifecycle === "archived") return "unknown";
  if (project.lifecycle === "complete") return "healthy";

  const blockers = state.blockers.filter(
    (blocker) => blocker.projectId === project.id && blocker.state === "open"
  );
  if (blockers.some((blocker) => blocker.severity === "high" || blocker.severity === "critical")) {
    return "blocked";
  }

  const milestones = state.milestones.filter(
    (milestone) => milestone.projectId === project.id && milestone.state !== "complete" && milestone.state !== "archived"
  );
  const hasOverdueMilestone = milestones.some((milestone) => Date.parse(milestone.dueAt) < Date.parse(now));
  if (
    blockers.length > 0 ||
    hasOverdueMilestone ||
    milestones.some((milestone) => milestone.state === "blocked" || milestone.state === "due") ||
    !project.owner ||
    !project.objective
  ) {
    return "attention";
  }
  return "healthy";
}

function replaceProject(state: ProjectsState, project: Project): Project[] {
  return state.projects.map((candidate) => (candidate.id === project.id ? project : candidate));
}

function touchProject(
  project: Project,
  stateWithChildMutation: ProjectsState,
  now: string,
  actorId: string,
  detail: string
): Project {
  const occurredAt = monotonicTimestamp(project.updatedAt, now);
  const next: Project = {
    ...project,
    updatedAt: occurredAt,
    updatedBy: actorId,
    lastActivityAt: occurredAt,
    history: [...project.history, historyEntry("related_object_updated", occurredAt, actorId, detail)]
  };
  next.health = deriveProjectHealth(next, stateWithChildMutation, occurredAt);
  return next;
}

function uniqueProjectSlug(state: ProjectsState, slug: string, excludingId?: string): void {
  if (state.projects.some((project) => project.id !== excludingId && project.slug === slug)) {
    validation("Another native project already uses this slug", "slug");
  }
}

function uniqueProjectName(state: ProjectsState, name: string, excludingId?: string): void {
  const key = name.toLowerCase();
  if (state.projects.some((project) => project.id !== excludingId && project.name.toLowerCase() === key)) {
    validation("Another native project already uses this name", "name");
  }
}

function newProjectId(): string {
  return `PRJ-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function buildNativeProject(
  input: ProjectCreateInput,
  state: ProjectsState,
  now: string,
  actorId: string
): Project {
  const raw = input as unknown as Record<string, unknown>;
  const name = requiredText(raw.name, "name", 240);
  const slug = normalizeSlug(raw.slug, name);
  uniqueProjectName(state, name);
  uniqueProjectSlug(state, slug);

  const legacyMatch = getLegacyProjectDefinition(slug) || getLegacyProjectDefinition(name);
  if (legacyMatch) {
    throw new ProjectsStoreError(
      "conflict",
      `“${legacyMatch.name}” is an existing legacy project identity. Use explicit promotion so its stable ID and provenance are preserved.`,
      { status: 409, fieldErrors: { name: ["Use explicit legacy promotion for this project."] } }
    );
  }

  const project: Project = {
    id: newProjectId(),
    objectType: "project",
    slug,
    name,
    description: optionalText(raw.description, "description") || "",
    area: optionalText(raw.area, "area", 160),
    objective: optionalText(raw.objective, "objective", 4000),
    lifecycle: enumValue(raw.lifecycle, ["draft", "planned", "active"] as const, "planned", "lifecycle"),
    health: "unknown",
    review: enumValue(raw.review, REVIEW_STATES, "not_reviewed", "review"),
    cadence: enumValue(raw.cadence, CADENCE_STATES, "unset", "cadence"),
    priority: enumValue(raw.priority, PRIORITIES, "medium", "priority"),
    owner: optionalText(raw.owner, "owner", 160),
    ownerRef: optionalNativeRef(raw.ownerRef, "ownerRef"),
    nextReviewAt: optionalDate(raw.nextReviewAt, "nextReviewAt"),
    defaultCadence: optionalText(raw.defaultCadence, "defaultCadence", 160),
    completionTarget: optionalText(raw.completionTarget, "completionTarget", 4000),
    visibility: enumValue(raw.visibility, VISIBILITIES, "private", "visibility"),
    privacyScope: enumValue(raw.privacyScope, PRIVACY_SCOPES, "project_only", "privacyScope"),
    starred: booleanValue(raw.starred, false, "starred"),
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    updatedBy: actorId,
    history: [historyEntry("created", now, actorId)]
  };
  project.health = deriveProjectHealth(project, { ...state, projects: [project, ...state.projects] }, now);
  return project;
}

export async function promoteLegacyProject(
  input: LegacyProjectPromotionInput,
  options: { actorId?: string; now?: Date } = {}
): Promise<ProjectsCreateResult<"projects">> {
  const actorId = options.actorId || "admin";
  const requestedNow = (options.now || new Date()).toISOString();
  const raw = input as unknown as Record<string, unknown>;
  if (raw.promotionConfirmed !== true) {
    validation("Explicit legacy promotion confirmation is required", "promotionConfirmed");
  }
  const definition = getLegacyProjectDefinition(requiredText(raw.legacyKey, "legacyKey", 240));
  if (!definition) validation("The legacy project identity is not recognized", "legacyKey");

  return withMutationLock(async () => {
    const state = await readProjectsState();
    const existingMapping = findLegacyProjectMapping(state, definition.key);
    if (existingMapping) {
      const mapped = state.projects.find((project) => project.id === existingMapping.projectId);
      if (!mapped) {
        throw new ProjectsStoreError(
          "conflict",
          "The legacy mapping points to a missing Project and must be repaired before promotion can continue.",
          { status: 409 }
        );
      }
      return { item: mapped, project: mapped, created: false, mapping: existingMapping };
    }
    if (state.projects.some((project) => project.id === definition.projectId)) {
      throw new ProjectsStoreError(
        "conflict",
        "A native Project already uses this stable legacy ID without a provenance mapping. Repair is required.",
        { status: 409 }
      );
    }
    uniqueProjectName(state, definition.name);
    uniqueProjectSlug(state, definition.slug);

    const now = requestedNow;
    const project: Project = {
      id: definition.projectId,
      objectType: "project",
      slug: definition.slug,
      name: definition.name,
      description: definition.description,
      area: optionalText(raw.area, "area", 160),
      objective: optionalText(raw.objective, "objective", 4000),
      lifecycle: definition.lifecycle,
      health: "unknown",
      review: "unknown",
      cadence: "unset",
      priority: enumValue(raw.priority, PRIORITIES, "medium", "priority"),
      owner: optionalText(raw.owner, "owner", 160),
      ownerRef: optionalNativeRef(raw.ownerRef, "ownerRef"),
      visibility: "private",
      privacyScope: "project_only",
      starred: false,
      lastActivityAt: now,
      legacySource: {
        key: definition.key,
        slug: definition.slug,
        legacyRoute: definition.legacyRoute,
        legacyStatus: definition.lifecycle,
        ...(definition.entitySlug ? { entitySlug: definition.entitySlug } : {}),
        ...(definition.entityName ? { entityName: definition.entityName } : {})
      },
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
      history: [historyEntry("promoted_from_legacy", now, actorId, definition.key)]
    };
    project.health = deriveProjectHealth(project, { ...state, projects: [project, ...state.projects] }, now);
    const mapping: ProjectsLegacyMapping = {
      id: `project-legacy-mapping-${crypto.randomUUID()}`,
      legacyKey: definition.key,
      projectId: project.id,
      nativeRef: projectRef(project),
      source: { ...definition, repos: [...definition.repos] },
      promotedAt: now,
      promotedBy: actorId
    };
    const auditEvent = moduleAuditEvent({
      item: project,
      action: "project.promoted_from_legacy",
      actorId,
      occurredAt: now,
      before: null,
      source: "migration"
    });
    const event = timelineEvent({
      project,
      eventType: "legacy_project_promoted",
      title: "Legacy project promoted",
      summary: `Promoted ${definition.name} without modifying its legacy route or related records.`,
      actorId,
      occurredAt: now,
      relatedObject: project
    });
    const nextState: ProjectsState = {
      ...state,
      projects: [project, ...state.projects],
      legacyMappings: [...state.legacyMappings, mapping],
      auditEvents: appendModuleAudit(state, auditEvent),
      timelineEvents: appendTimeline(state, event)
    };
    await writeJsonFile(FILE_NAME, nextState);
    return { item: project, project, created: true, mapping, auditEvent, timelineEvent: event };
  });
}

function buildMilestone(
  input: ProjectsCreateInputByFamily["milestones"],
  now: string,
  actorId: string
): ProjectMilestone {
  const raw = input as unknown as Record<string, unknown>;
  return {
    id: `milestone-${crypto.randomUUID()}`,
    objectType: "milestone",
    projectId: requiredText(raw.projectId, "projectId", 240),
    title: requiredText(raw.title, "title", 240),
    description: optionalText(raw.description, "description") || "",
    dueAt: requiredText(optionalDate(raw.dueAt, "dueAt"), "dueAt", 120),
    state: enumValue(raw.state, ["planned", "open", "active", "due", "blocked"] as const, "planned", "state"),
    owner: optionalText(raw.owner, "owner", 160),
    ownerRef: optionalNativeRef(raw.ownerRef, "ownerRef"),
    completionCriteria: stringList(raw.completionCriteria, "completionCriteria"),
    linkedRefs: normalizeNativeRefs(raw.linkedRefs, "linkedRefs"),
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    updatedBy: actorId,
    history: [historyEntry("created", now, actorId)]
  };
}

function buildBlocker(
  input: ProjectsCreateInputByFamily["blockers"],
  now: string,
  actorId: string
): ProjectBlocker {
  const raw = input as unknown as Record<string, unknown>;
  return {
    id: `blocker-${crypto.randomUUID()}`,
    objectType: "blocker",
    projectId: requiredText(raw.projectId, "projectId", 240),
    title: requiredText(raw.title, "title", 240),
    condition: requiredText(raw.condition, "condition", 4000),
    state: "open",
    severity: enumValue(raw.severity, BLOCKER_SEVERITIES, "medium", "severity"),
    owner: optionalText(raw.owner, "owner", 160),
    ownerRef: optionalNativeRef(raw.ownerRef, "ownerRef"),
    dueAt: optionalDate(raw.dueAt, "dueAt"),
    sourceRefs: normalizeNativeRefs(raw.sourceRefs, "sourceRefs"),
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    updatedBy: actorId,
    history: [historyEntry("opened", now, actorId)]
  };
}

function validateLinkAssociations(state: ProjectsState, input: Record<string, unknown>, projectId: string): void {
  const milestoneId = optionalText(input.linkedMilestoneId, "linkedMilestoneId", 240);
  if (
    milestoneId &&
    !state.milestones.some((milestone) => milestone.id === milestoneId && milestone.projectId === projectId)
  ) {
    validation("linkedMilestoneId must belong to this project", "linkedMilestoneId");
  }
}

function buildLink(
  input: ProjectsCreateInputByFamily["links"],
  state: ProjectsState,
  now: string,
  actorId: string
): ProjectLink {
  const raw = input as unknown as Record<string, unknown>;
  const projectId = requiredText(raw.projectId, "projectId", 240);
  const source = normalizeNativeRef(raw.source, "source");
  if (source.module === "projects" && source.objectId === projectId) {
    validation("A project cannot link to itself", "source");
  }
  validateLinkAssociations(state, raw, projectId);
  return {
    id: `project-link-${crypto.randomUUID()}`,
    objectType: "project_link",
    projectId,
    source,
    relationship: enumValue(raw.relationship, LINK_RELATIONSHIPS, "supporting_context", "relationship"),
    relationshipStrength: enumValue(raw.relationshipStrength, LINK_STRENGTHS, "normal", "relationshipStrength"),
    isRequiredEvidence: booleanValue(raw.isRequiredEvidence, false, "isRequiredEvidence"),
    isPinned: booleanValue(raw.isPinned, false, "isPinned"),
    isReviewed: booleanValue(raw.isReviewed, false, "isReviewed"),
    review: enumValue(raw.review, NATIVE_REVIEW_STATES, "not_reviewed", "review"),
    linkState: "active",
    projectSpecificNote: optionalText(raw.projectSpecificNote, "projectSpecificNote", 4000),
    linkedMilestoneId: optionalText(raw.linkedMilestoneId, "linkedMilestoneId", 240),
    linkedDecisionId: optionalText(raw.linkedDecisionId, "linkedDecisionId", 240),
    linkedReviewId: optionalText(raw.linkedReviewId, "linkedReviewId", 240),
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    updatedBy: actorId,
    history: [historyEntry("linked", now, actorId)]
  };
}

function createEventDetails(item: ProjectMilestone | ProjectBlocker | ProjectLink) {
  if (item.objectType === "milestone") {
    return {
      eventType: "milestone_created" as const,
      title: "Milestone added",
      summary: `${item.title} is due ${item.dueAt}.`
    };
  }
  if (item.objectType === "blocker") {
    return {
      eventType: "blocker_opened" as const,
      title: "Blocker opened",
      summary: `${item.title} opened with ${item.severity} severity.`
    };
  }
  return {
    eventType: "link_created" as const,
    title: "Context linked",
    summary: `${item.source.label} linked as ${item.relationship.replace(/_/g, " ")}.`
  };
}

export async function createProjectsObject<Family extends ProjectObjectFamily>(
  family: Family,
  input: ProjectsCreateInputByFamily[Family],
  options: { actorId?: string; now?: Date } = {}
): Promise<ProjectsCreateResult<Family>> {
  if (!PROJECT_OBJECT_FAMILIES.includes(family)) validation("Unsupported Projects family", "family");
  const actorId = options.actorId || "admin";
  const requestedNow = (options.now || new Date()).toISOString();

  return withMutationLock(async () => {
    const state = await readProjectsState();
    if (family === "projects") {
      const item = buildNativeProject(input as ProjectCreateInput, state, requestedNow, actorId);
      const auditEvent = moduleAuditEvent({
        item,
        action: "project.created",
        actorId,
        occurredAt: requestedNow,
        before: null
      });
      const event = timelineEvent({
        project: item,
        eventType: "project_created",
        title: "Project created",
        summary: `${item.name} became a native Project.`,
        actorId,
        occurredAt: requestedNow,
        relatedObject: item
      });
      await writeJsonFile(FILE_NAME, {
        ...state,
        projects: [item, ...state.projects],
        auditEvents: appendModuleAudit(state, auditEvent),
        timelineEvents: appendTimeline(state, event)
      } satisfies ProjectsState);
      return {
        item,
        project: item,
        created: true,
        auditEvent,
        timelineEvent: event
      } as ProjectsCreateResult<Family>;
    }

    let child: ProjectMilestone | ProjectBlocker | ProjectLink;
    if (family === "milestones") {
      child = buildMilestone(input as ProjectsCreateInputByFamily["milestones"], requestedNow, actorId);
    } else if (family === "blockers") {
      child = buildBlocker(input as ProjectsCreateInputByFamily["blockers"], requestedNow, actorId);
    } else {
      const linkCandidate = buildLink(
        input as ProjectsCreateInputByFamily["links"],
        state,
        requestedNow,
        actorId
      );
      child = linkCandidate;
      const existing = state.links.find(
        (link) =>
          link.projectId === linkCandidate.projectId &&
          link.linkState !== "removed" &&
          link.source.module === linkCandidate.source.module &&
          link.source.objectType === linkCandidate.source.objectType &&
          link.source.objectId === linkCandidate.source.objectId &&
          link.relationship === linkCandidate.relationship
      );
      if (existing) {
        const project = projectById(state, existing.projectId);
        return { item: existing, project, created: false } as ProjectsCreateResult<Family>;
      }
    }

    const currentProject = projectById(state, child.projectId);
    ensureOperationalProject(currentProject);
    const interim = {
      ...state,
      [family]: [child, ...collectionFor(state, family)]
    } as ProjectsState;
    const project = touchProject(
      currentProject,
      interim,
      requestedNow,
      actorId,
      `${child.objectType}:${child.id}`
    );
    const auditEvent = moduleAuditEvent({
      item: child,
      action: `${child.objectType}.created`,
      actorId,
      occurredAt: requestedNow,
      before: null
    });
    const details = createEventDetails(child);
    const event = timelineEvent({
      project,
      ...details,
      actorId,
      occurredAt: requestedNow,
      relatedObject: child,
      ...(child.objectType === "project_link" ? { sourceRef: child.source } : {})
    });
    const nextState: ProjectsState = {
      ...interim,
      projects: replaceProject(interim, project),
      auditEvents: appendModuleAudit(state, auditEvent),
      timelineEvents: appendTimeline(state, event)
    };
    await writeJsonFile(FILE_NAME, nextState);
    return {
      item: child,
      project,
      created: true,
      auditEvent,
      timelineEvent: event
    } as ProjectsCreateResult<Family>;
  });
}

function applyProjectPatch(
  current: Project,
  patch: Record<string, unknown>,
  state: ProjectsState,
  now: string,
  actorId: string
): Project {
  const next: Project = { ...current };
  const requestedLifecycle = hasOwn(patch, "lifecycle")
    ? enumValue(patch.lifecycle, LIFECYCLE_STATES, current.lifecycle, "lifecycle")
    : current.lifecycle;

  if (current.lifecycle === "complete") {
    throw new ProjectsStoreError(
      "read_only",
      requestedLifecycle === "complete"
        ? "Completed projects are read-only."
        : "Project reopen behavior is intentionally unfinished; this completed project remains read-only.",
      { status: 409 }
    );
  }
  if (
    current.lifecycle === "archived" &&
    (requestedLifecycle === "archived" || Object.keys(patch).some((key) => key !== "lifecycle"))
  ) {
    throw new ProjectsStoreError(
      "read_only",
      "Archived projects are read-only. Restore the project before editing it.",
      { status: 409 }
    );
  }
  if (requestedLifecycle === "complete") {
    throw new ProjectsStoreError(
      "read_only",
      "Project completion is intentionally disabled until completion gates are configured.",
      { status: 409, fieldErrors: { lifecycle: ["Completion gates are not configured."] } }
    );
  }

  if (hasOwn(patch, "name")) next.name = requiredText(patch.name, "name", 240);
  if (hasOwn(patch, "slug")) next.slug = normalizeSlug(patch.slug, next.name);
  if (hasOwn(patch, "description")) next.description = optionalText(patch.description, "description") || "";
  if (hasOwn(patch, "area")) next.area = optionalText(patch.area, "area", 160);
  if (hasOwn(patch, "objective")) next.objective = optionalText(patch.objective, "objective", 4000);
  if (hasOwn(patch, "review")) next.review = enumValue(patch.review, REVIEW_STATES, current.review, "review");
  if (hasOwn(patch, "cadence")) next.cadence = enumValue(patch.cadence, CADENCE_STATES, current.cadence, "cadence");
  if (hasOwn(patch, "priority")) next.priority = enumValue(patch.priority, PRIORITIES, current.priority, "priority");
  if (hasOwn(patch, "owner")) next.owner = optionalText(patch.owner, "owner", 160);
  if (hasOwn(patch, "ownerRef")) next.ownerRef = optionalNativeRef(patch.ownerRef, "ownerRef");
  if (hasOwn(patch, "nextReviewAt")) next.nextReviewAt = optionalDate(patch.nextReviewAt, "nextReviewAt");
  if (hasOwn(patch, "defaultCadence")) next.defaultCadence = optionalText(patch.defaultCadence, "defaultCadence", 160);
  if (hasOwn(patch, "completionTarget")) next.completionTarget = optionalText(patch.completionTarget, "completionTarget", 4000);
  if (hasOwn(patch, "visibility")) next.visibility = enumValue(patch.visibility, VISIBILITIES, current.visibility, "visibility");
  if (hasOwn(patch, "privacyScope")) {
    next.privacyScope = enumValue(patch.privacyScope, PRIVACY_SCOPES, current.privacyScope, "privacyScope");
  }
  if (hasOwn(patch, "starred")) next.starred = booleanValue(patch.starred, current.starred, "starred");

  if (current.lifecycle !== "archived" && requestedLifecycle === "archived") {
    if (patch.archiveConfirmed !== true) {
      validation("Confirm project archive after reviewing its active milestones and links", "archiveConfirmed");
    }
    next.lifecycleBeforeArchive = current.lifecycle as Exclude<LifecycleState, "archived" | "complete">;
    next.lifecycle = "archived";
    next.archivedAt = now;
    next.archiveReason = requiredText(patch.archiveReason, "archiveReason", 2000);
  } else if (current.lifecycle === "archived" && requestedLifecycle !== "archived") {
    if (!["draft", "planned", "active"].includes(requestedLifecycle)) {
      validation("Restore a project to draft, planned, or active", "lifecycle");
    }
    next.lifecycle = next.lifecycleBeforeArchive || requestedLifecycle;
    next.lifecycleBeforeArchive = undefined;
    next.archivedAt = undefined;
    next.archiveReason = undefined;
  } else {
    next.lifecycle = requestedLifecycle;
  }

  uniqueProjectName(state, next.name, current.id);
  uniqueProjectSlug(state, next.slug, current.id);
  const identityMatch = getLegacyProjectDefinition(next.slug) || getLegacyProjectDefinition(next.name);
  if (identityMatch && identityMatch.key !== current.legacySource?.key) {
    throw new ProjectsStoreError(
      "conflict",
      `That identity belongs to legacy project “${identityMatch.name}”. Promote it explicitly instead.`,
      { status: 409 }
    );
  }

  next.updatedAt = monotonicTimestamp(current.updatedAt, now);
  next.updatedBy = actorId;
  next.lastActivityAt = next.updatedAt;
  next.history = [
    ...current.history,
    historyEntry(
      current.lifecycle !== "archived" && next.lifecycle === "archived"
        ? "archived"
        : current.lifecycle === "archived" && next.lifecycle !== "archived"
          ? "restored"
          : "updated",
      next.updatedAt,
      actorId,
      next.archiveReason
    )
  ];
  next.health = deriveProjectHealth(next, { ...state, projects: replaceProject(state, next) }, next.updatedAt);
  return next;
}

function applyMilestonePatch(
  current: ProjectMilestone,
  patch: Record<string, unknown>,
  now: string,
  actorId: string
): ProjectMilestone {
  const next: ProjectMilestone = { ...current };
  const requestedState = hasOwn(patch, "state")
    ? enumValue(patch.state, MILESTONE_STATES, current.state, "state")
    : current.state;
  if (current.state === "archived" && requestedState === "archived") {
    throw new ProjectsStoreError("read_only", "Restore this milestone before editing it.", { status: 409 });
  }
  if (hasOwn(patch, "title")) next.title = requiredText(patch.title, "title", 240);
  if (hasOwn(patch, "description")) next.description = optionalText(patch.description, "description") || "";
  if (hasOwn(patch, "dueAt")) next.dueAt = requiredText(optionalDate(patch.dueAt, "dueAt"), "dueAt", 120);
  if (hasOwn(patch, "owner")) next.owner = optionalText(patch.owner, "owner", 160);
  if (hasOwn(patch, "ownerRef")) next.ownerRef = optionalNativeRef(patch.ownerRef, "ownerRef");
  if (hasOwn(patch, "completionCriteria")) {
    next.completionCriteria = stringList(patch.completionCriteria, "completionCriteria");
  }
  if (hasOwn(patch, "completionNote")) {
    next.completionNote = optionalText(patch.completionNote, "completionNote", 4000);
  }
  if (hasOwn(patch, "linkedRefs")) next.linkedRefs = normalizeNativeRefs(patch.linkedRefs, "linkedRefs");

  if (requestedState === "complete" && current.state !== "complete") {
    if (next.completionCriteria.length === 0) {
      validation("Add at least one completion criterion before completing the milestone", "completionCriteria");
    }
    if (!next.completionNote) {
      validation("Record a completion note before completing the milestone", "completionNote");
    }
    next.completedAt = now;
  } else if (current.state === "complete" && requestedState !== "complete") {
    next.completedAt = undefined;
  }
  if (requestedState === "archived" && current.state !== "archived") {
    next.archivedAt = now;
    next.archiveReason = requiredText(patch.archiveReason, "archiveReason", 2000);
  } else if (current.state === "archived" && requestedState !== "archived") {
    next.archivedAt = undefined;
    next.archiveReason = undefined;
  }
  next.state = requestedState;
  next.updatedAt = monotonicTimestamp(current.updatedAt, now);
  next.updatedBy = actorId;
  next.history = [
    ...current.history,
    historyEntry(
      next.state === "complete" && current.state !== "complete"
        ? "completed"
        : next.state === "archived" && current.state !== "archived"
          ? "archived"
          : current.state === "archived" && next.state !== "archived"
            ? "restored"
            : "updated",
      next.updatedAt,
      actorId,
      next.completionNote || next.archiveReason
    )
  ];
  return next;
}

function applyBlockerPatch(
  current: ProjectBlocker,
  patch: Record<string, unknown>,
  now: string,
  actorId: string
): ProjectBlocker {
  const next: ProjectBlocker = { ...current };
  const requestedState = hasOwn(patch, "state")
    ? enumValue(patch.state, BLOCKER_STATES, current.state, "state")
    : current.state;
  if (current.state === "archived" && requestedState === "archived") {
    throw new ProjectsStoreError("read_only", "Restore this blocker before editing it.", { status: 409 });
  }
  if (hasOwn(patch, "title")) next.title = requiredText(patch.title, "title", 240);
  if (hasOwn(patch, "condition")) next.condition = requiredText(patch.condition, "condition", 4000);
  if (hasOwn(patch, "severity")) {
    next.severity = enumValue(patch.severity, BLOCKER_SEVERITIES, current.severity, "severity");
  }
  if (hasOwn(patch, "owner")) next.owner = optionalText(patch.owner, "owner", 160);
  if (hasOwn(patch, "ownerRef")) next.ownerRef = optionalNativeRef(patch.ownerRef, "ownerRef");
  if (hasOwn(patch, "dueAt")) next.dueAt = optionalDate(patch.dueAt, "dueAt");
  if (hasOwn(patch, "sourceRefs")) next.sourceRefs = normalizeNativeRefs(patch.sourceRefs, "sourceRefs");
  if (hasOwn(patch, "resolution")) next.resolution = optionalText(patch.resolution, "resolution", 4000);
  if (hasOwn(patch, "waiverReason")) next.waiverReason = optionalText(patch.waiverReason, "waiverReason", 4000);
  if (hasOwn(patch, "carryForwardRef")) {
    next.carryForwardRef = optionalNativeRef(patch.carryForwardRef, "carryForwardRef");
  }

  if (requestedState === "resolved" && !next.resolution) {
    validation("Record how the blocker was resolved", "resolution");
  }
  if (requestedState === "waived" && !next.waiverReason) {
    validation("Record why the blocker is being waived", "waiverReason");
  }
  if (requestedState === "carried_forward" && !next.carryForwardRef) {
    validation("Link the Personal Ops follow-up carrying this blocker forward", "carryForwardRef");
  }
  if (requestedState === "archived" && current.state !== "archived") {
    next.archivedAt = now;
    next.archiveReason = requiredText(patch.archiveReason, "archiveReason", 2000);
  } else if (current.state === "archived" && requestedState !== "archived") {
    next.archivedAt = undefined;
    next.archiveReason = undefined;
  }
  next.state = requestedState;
  next.resolvedAt = ["resolved", "waived", "carried_forward"].includes(requestedState)
    ? current.resolvedAt || now
    : undefined;
  next.updatedAt = monotonicTimestamp(current.updatedAt, now);
  next.updatedBy = actorId;
  next.history = [
    ...current.history,
    historyEntry(
      requestedState === "resolved" && current.state !== "resolved"
        ? "resolved"
        : requestedState === "waived" && current.state !== "waived"
          ? "waived"
          : requestedState === "carried_forward" && current.state !== "carried_forward"
            ? "carried_forward"
            : requestedState === "archived" && current.state !== "archived"
              ? "archived"
              : current.state === "archived" && requestedState !== "archived"
                ? "restored"
                : "updated",
      next.updatedAt,
      actorId,
      next.resolution || next.waiverReason || next.archiveReason
    )
  ];
  return next;
}

function applyLinkPatch(
  current: ProjectLink,
  patch: Record<string, unknown>,
  state: ProjectsState,
  now: string,
  actorId: string
): ProjectLink {
  const next: ProjectLink = { ...current };
  const requestedState = hasOwn(patch, "linkState")
    ? enumValue(patch.linkState, LINK_STATES, current.linkState, "linkState")
    : current.linkState;
  if (current.linkState === "removed" && requestedState === "removed") {
    throw new ProjectsStoreError("read_only", "Restore this link before editing it.", { status: 409 });
  }
  if (hasOwn(patch, "relationship")) {
    next.relationship = enumValue(patch.relationship, LINK_RELATIONSHIPS, current.relationship, "relationship");
  }
  if (hasOwn(patch, "relationshipStrength")) {
    next.relationshipStrength = enumValue(
      patch.relationshipStrength,
      LINK_STRENGTHS,
      current.relationshipStrength,
      "relationshipStrength"
    );
  }
  if (hasOwn(patch, "isRequiredEvidence")) {
    next.isRequiredEvidence = booleanValue(patch.isRequiredEvidence, current.isRequiredEvidence, "isRequiredEvidence");
  }
  if (hasOwn(patch, "isPinned")) next.isPinned = booleanValue(patch.isPinned, current.isPinned, "isPinned");
  if (hasOwn(patch, "isReviewed")) {
    next.isReviewed = booleanValue(patch.isReviewed, current.isReviewed, "isReviewed");
  }
  if (hasOwn(patch, "review")) next.review = enumValue(patch.review, NATIVE_REVIEW_STATES, current.review, "review");
  if (hasOwn(patch, "projectSpecificNote")) {
    next.projectSpecificNote = optionalText(patch.projectSpecificNote, "projectSpecificNote", 4000);
  }
  if (hasOwn(patch, "linkedMilestoneId")) {
    next.linkedMilestoneId = optionalText(patch.linkedMilestoneId, "linkedMilestoneId", 240);
  }
  if (hasOwn(patch, "linkedDecisionId")) {
    next.linkedDecisionId = optionalText(patch.linkedDecisionId, "linkedDecisionId", 240);
  }
  if (hasOwn(patch, "linkedReviewId")) {
    next.linkedReviewId = optionalText(patch.linkedReviewId, "linkedReviewId", 240);
  }
  validateLinkAssociations(state, next as unknown as Record<string, unknown>, next.projectId);

  if (requestedState === "removed" && current.linkState !== "removed") {
    next.removalReason = requiredText(patch.removalReason, "removalReason", 2000);
    next.removedAt = now;
    next.removedBy = actorId;
  } else if (current.linkState === "removed" && requestedState !== "removed") {
    next.removalReason = undefined;
    next.removedAt = undefined;
    next.removedBy = undefined;
  }
  next.linkState = requestedState;
  next.updatedAt = monotonicTimestamp(current.updatedAt, now);
  next.updatedBy = actorId;
  next.history = [
    ...current.history,
    historyEntry(
      next.linkState === "removed" && current.linkState !== "removed"
        ? "removed"
        : current.linkState === "removed" && next.linkState !== "removed"
          ? "restored"
          : "updated",
      next.updatedAt,
      actorId,
      next.removalReason
    )
  ];
  return next;
}

function updateEventDetails(
  current: ProjectMilestone | ProjectBlocker | ProjectLink,
  next: ProjectMilestone | ProjectBlocker | ProjectLink
) {
  if (next.objectType === "milestone" && current.objectType === "milestone") {
    const completed = current.state !== "complete" && next.state === "complete";
    return {
      eventType: completed ? ("milestone_completed" as const) : ("milestone_updated" as const),
      title: completed ? "Milestone completed" : "Milestone updated",
      summary: completed ? `${next.title} was completed.` : `${next.title} was updated.`
    };
  }
  if (next.objectType === "blocker" && current.objectType === "blocker") {
    const eventType: ProjectTimelineEventType =
      next.state === "resolved" && current.state !== "resolved"
        ? "blocker_resolved"
        : next.state === "waived" && current.state !== "waived"
          ? "blocker_waived"
          : next.state === "carried_forward" && current.state !== "carried_forward"
            ? "blocker_carried_forward"
            : "blocker_updated";
    return {
      eventType,
      title: eventType === "blocker_updated" ? "Blocker updated" : `Blocker ${next.state.replace(/_/g, " ")}`,
      summary: `${next.title} is now ${next.state.replace(/_/g, " ")}.`
    };
  }
  const link = next as ProjectLink;
  const oldLink = current as ProjectLink;
  const eventType: ProjectTimelineEventType =
    link.linkState === "removed" && oldLink.linkState !== "removed"
      ? "link_removed"
      : oldLink.linkState === "removed" && link.linkState !== "removed"
        ? "link_restored"
        : "link_updated";
  return {
    eventType,
    title: eventType === "link_removed" ? "Link removed" : eventType === "link_restored" ? "Link restored" : "Link updated",
    summary: `${link.source.label} is ${link.linkState}.`
  };
}

export async function updateProjectsObject<Family extends ProjectObjectFamily>(
  family: Family,
  id: string,
  patch: ProjectsUpdateInputByFamily[Family],
  options: { expectedUpdatedAt: string; actorId?: string; now?: Date }
): Promise<ProjectsUpdateResult<Family>> {
  if (!PROJECT_OBJECT_FAMILIES.includes(family)) validation("Unsupported Projects family", "family");
  const objectId = requiredText(id, "id", 240);
  const expectedUpdatedAt = requiredText(options.expectedUpdatedAt, "expectedUpdatedAt", 120);
  const actorId = options.actorId || "admin";
  const requestedNow = (options.now || new Date()).toISOString();
  const rawPatch = patch as unknown as Record<string, unknown>;

  return withMutationLock(async () => {
    const state = await readProjectsState();
    const collection = collectionFor(state, family);
    const current = collection.find((item) => item.id === objectId);
    if (!current) throw new ProjectsStoreError("not_found", "Projects object not found", { status: 404 });
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new ProjectsStoreError(
        "stale",
        "This object changed after it was opened. Reload the latest version before saving again.",
        { status: 409 }
      );
    }

    if (family === "projects" && current.objectType === "project") {
      const item = applyProjectPatch(current, rawPatch, state, requestedNow, actorId);
      const wasArchived = current.lifecycle !== "archived" && item.lifecycle === "archived";
      const wasRestored = current.lifecycle === "archived" && item.lifecycle !== "archived";
      const action = wasArchived ? "project.archived" : wasRestored ? "project.restored" : "project.updated";
      const auditEvent = moduleAuditEvent({ item, action, actorId, occurredAt: item.updatedAt, before: current });
      const event = timelineEvent({
        project: item,
        eventType: wasArchived ? "project_archived" : wasRestored ? "project_restored" : "project_updated",
        title: wasArchived ? "Project archived" : wasRestored ? "Project restored" : "Project updated",
        summary: wasArchived
          ? `${item.name} was archived: ${item.archiveReason}.`
          : wasRestored
            ? `${item.name} returned to ${item.lifecycle}.`
            : `${item.name} properties were updated.`,
        actorId,
        occurredAt: item.updatedAt,
        relatedObject: item
      });
      const nextState: ProjectsState = {
        ...state,
        projects: replaceProject(state, item),
        auditEvents: appendModuleAudit(state, auditEvent),
        timelineEvents: appendTimeline(state, event)
      };
      await writeJsonFile(FILE_NAME, nextState);
      return { item, project: item, auditEvent, timelineEvent: event } as ProjectsUpdateResult<Family>;
    }

    const childCurrent = current as ProjectMilestone | ProjectBlocker | ProjectLink;
    const currentProject = projectById(state, childCurrent.projectId);
    ensureOperationalProject(currentProject);
    let childNext: ProjectMilestone | ProjectBlocker | ProjectLink;
    if (family === "milestones" && childCurrent.objectType === "milestone") {
      childNext = applyMilestonePatch(childCurrent, rawPatch, requestedNow, actorId);
    } else if (family === "blockers" && childCurrent.objectType === "blocker") {
      childNext = applyBlockerPatch(childCurrent, rawPatch, requestedNow, actorId);
    } else if (family === "links" && childCurrent.objectType === "project_link") {
      childNext = applyLinkPatch(childCurrent, rawPatch, state, requestedNow, actorId);
    } else {
      throw new ProjectsStoreError("server", "Projects object family did not match its object type", {
        status: 500
      });
    }

    const nextCollection = collection.map((item) =>
      item.id === childNext.id ? childNext : item
    ) as ProjectsObjectByFamily[Family][];
    const interim = { ...state, [family]: nextCollection } as ProjectsState;
    const project = touchProject(
      currentProject,
      interim,
      childNext.updatedAt,
      actorId,
      `${childNext.objectType}:${childNext.id}`
    );
    const auditEvent = moduleAuditEvent({
      item: childNext,
      action: `${childNext.objectType}.updated`,
      actorId,
      occurredAt: childNext.updatedAt,
      before: childCurrent
    });
    const details = updateEventDetails(childCurrent, childNext);
    const event = timelineEvent({
      project,
      ...details,
      actorId,
      occurredAt: childNext.updatedAt,
      relatedObject: childNext,
      ...(childNext.objectType === "project_link" ? { sourceRef: childNext.source } : {})
    });
    const nextState: ProjectsState = {
      ...interim,
      projects: replaceProject(interim, project),
      auditEvents: appendModuleAudit(state, auditEvent),
      timelineEvents: appendTimeline(state, event)
    };
    await writeJsonFile(FILE_NAME, nextState);
    return {
      item: childNext,
      project,
      auditEvent,
      timelineEvent: event
    } as ProjectsUpdateResult<Family>;
  });
}

export function isProjectObjectFamily(value: unknown): value is ProjectObjectFamily {
  return typeof value === "string" && PROJECT_OBJECT_FAMILIES.includes(value as ProjectObjectFamily);
}

export function projectObjectTypeForFamily(family: ProjectObjectFamily) {
  return FAMILY_OBJECT_TYPE[family];
}
