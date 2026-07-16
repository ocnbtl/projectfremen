import type { AuditEvent } from "../../native-objects/audit";
import type { MutationResult } from "../../native-objects/mutation-result";
import type {
  CadenceState,
  HealthState,
  LifecycleState,
  LinkState,
  NativeObjectRef,
  ReviewState
} from "../../native-objects/types";

export const PROJECTS_SCHEMA_VERSION = 1 as const;

export const PROJECT_OBJECT_FAMILIES = [
  "projects",
  "milestones",
  "blockers",
  "links"
] as const;

export type ProjectObjectFamily = (typeof PROJECT_OBJECT_FAMILIES)[number];
export type ProjectObjectType = "project" | "milestone" | "blocker" | "project_link";
export type ProjectPriority = "low" | "medium" | "high" | "critical";
export type ProjectReviewState = ReviewState | "unknown";
export type ProjectCadenceState = CadenceState | "unset";
export type ProjectVisibility = "private" | "shared";
export type ProjectPrivacyScope = "project_only" | "module_shared";

export type ProjectHistoryEntry = {
  id: string;
  action: string;
  occurredAt: string;
  actorId: string;
  detail?: string;
};

export type LegacyProjectSource = {
  key: string;
  slug: string;
  legacyRoute: string;
  legacyStatus: "active" | "planned";
  entitySlug?: string;
  entityName?: string;
};

export type Project = {
  id: string;
  objectType: "project";
  slug: string;
  name: string;
  description: string;
  area?: string;
  objective?: string;
  lifecycle: LifecycleState;
  health: HealthState;
  review: ProjectReviewState;
  cadence: ProjectCadenceState;
  priority: ProjectPriority;
  owner?: string;
  ownerRef?: NativeObjectRef;
  nextReviewAt?: string;
  defaultCadence?: string;
  completionTarget?: string;
  visibility: ProjectVisibility;
  privacyScope: ProjectPrivacyScope;
  starred: boolean;
  lastActivityAt?: string;
  completedAt?: string;
  archivedAt?: string;
  archiveReason?: string;
  lifecycleBeforeArchive?: Exclude<LifecycleState, "archived" | "complete">;
  legacySource?: LegacyProjectSource;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  history: ProjectHistoryEntry[];
};

export type ProjectMilestoneState =
  | "planned"
  | "open"
  | "active"
  | "due"
  | "blocked"
  | "complete"
  | "archived";

export type ProjectMilestone = {
  id: string;
  objectType: "milestone";
  projectId: string;
  title: string;
  description: string;
  dueAt: string;
  state: ProjectMilestoneState;
  owner?: string;
  ownerRef?: NativeObjectRef;
  completionCriteria: string[];
  completionNote?: string;
  linkedRefs: NativeObjectRef[];
  completedAt?: string;
  archivedAt?: string;
  archiveReason?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  history: ProjectHistoryEntry[];
};

export type ProjectBlockerState =
  | "open"
  | "resolved"
  | "waived"
  | "carried_forward"
  | "archived";
export type ProjectBlockerSeverity = "low" | "medium" | "high" | "critical";

export type ProjectBlocker = {
  id: string;
  objectType: "blocker";
  projectId: string;
  title: string;
  condition: string;
  state: ProjectBlockerState;
  severity: ProjectBlockerSeverity;
  owner?: string;
  ownerRef?: NativeObjectRef;
  dueAt?: string;
  sourceRefs: NativeObjectRef[];
  resolution?: string;
  waiverReason?: string;
  carryForwardRef?: NativeObjectRef;
  resolvedAt?: string;
  archivedAt?: string;
  archiveReason?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  history: ProjectHistoryEntry[];
};

export type ProjectLinkRelationship =
  | "evidence"
  | "source_material"
  | "review_input"
  | "launch_proof"
  | "supporting_context"
  | "background_reference"
  | "decision_support"
  | "blocker_evidence"
  | "advisor_context"
  | "finance_context"
  | "follow_up_context"
  | "related_project";

export type ProjectLinkStrength = "weak" | "normal" | "strong";

export type ProjectLink = {
  id: string;
  objectType: "project_link";
  projectId: string;
  source: NativeObjectRef;
  relationship: ProjectLinkRelationship;
  relationshipStrength: ProjectLinkStrength;
  isRequiredEvidence: boolean;
  isPinned: boolean;
  isReviewed: boolean;
  review: ReviewState;
  linkState: LinkState;
  projectSpecificNote?: string;
  linkedMilestoneId?: string;
  linkedDecisionId?: string;
  linkedReviewId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  removedAt?: string;
  removedBy?: string;
  removalReason?: string;
  history: ProjectHistoryEntry[];
};

export type ProjectTimelineEventType =
  | "project_created"
  | "legacy_project_promoted"
  | "project_updated"
  | "project_archived"
  | "project_restored"
  | "milestone_created"
  | "milestone_updated"
  | "milestone_completed"
  | "blocker_opened"
  | "blocker_updated"
  | "blocker_resolved"
  | "blocker_waived"
  | "blocker_carried_forward"
  | "link_created"
  | "link_updated"
  | "link_removed"
  | "link_restored";

export type ProjectTimelineEvent = {
  id: string;
  objectType: "timeline_event";
  projectId: string;
  eventType: ProjectTimelineEventType;
  title: string;
  summary: string;
  health: HealthState;
  occurredAt: string;
  sourceRef?: NativeObjectRef;
  relatedObjectRef?: NativeObjectRef;
  isManual: boolean;
  actorId: string;
  createdAt: string;
};

export type LegacyProjectDefinition = {
  key: string;
  projectId: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  lifecycle: "planned" | "active";
  legacyRoute: string;
  entitySlug?: string;
  entityName?: string;
  repos: string[];
};

export type ProjectsLegacyMapping = {
  id: string;
  legacyKey: string;
  projectId: string;
  nativeRef: NativeObjectRef;
  source: LegacyProjectDefinition;
  promotedAt: string;
  promotedBy: string;
};

export type ProjectsState = {
  schemaVersion: typeof PROJECTS_SCHEMA_VERSION;
  projects: Project[];
  milestones: ProjectMilestone[];
  blockers: ProjectBlocker[];
  links: ProjectLink[];
  timelineEvents: ProjectTimelineEvent[];
  auditEvents: AuditEvent[];
  legacyMappings: ProjectsLegacyMapping[];
};

export type ProjectCreateInput = {
  name: string;
  slug?: string;
  description?: string;
  area?: string;
  objective?: string;
  lifecycle?: Extract<LifecycleState, "draft" | "planned" | "active">;
  review?: ProjectReviewState;
  cadence?: ProjectCadenceState;
  priority?: ProjectPriority;
  owner?: string;
  ownerRef?: NativeObjectRef;
  nextReviewAt?: string;
  defaultCadence?: string;
  completionTarget?: string;
  visibility?: ProjectVisibility;
  privacyScope?: ProjectPrivacyScope;
  starred?: boolean;
};

export type LegacyProjectPromotionInput = {
  legacyKey: string;
  promotionConfirmed: true;
  objective?: string;
  area?: string;
  owner?: string;
  ownerRef?: NativeObjectRef;
  priority?: ProjectPriority;
};

export type ProjectUpdateInput = Partial<
  Pick<
    Project,
    | "name"
    | "slug"
    | "description"
    | "area"
    | "objective"
    | "lifecycle"
    | "review"
    | "cadence"
    | "priority"
    | "owner"
    | "ownerRef"
    | "nextReviewAt"
    | "defaultCadence"
    | "completionTarget"
    | "visibility"
    | "privacyScope"
    | "starred"
  >
> & {
  archiveReason?: string;
  archiveConfirmed?: true;
};

export type ProjectMilestoneCreateInput = {
  projectId: string;
  title: string;
  description?: string;
  dueAt: string;
  state?: Exclude<ProjectMilestoneState, "complete" | "archived">;
  owner?: string;
  ownerRef?: NativeObjectRef;
  completionCriteria?: string[];
  linkedRefs?: NativeObjectRef[];
};

export type ProjectMilestoneUpdateInput = Partial<
  Pick<
    ProjectMilestone,
    | "title"
    | "description"
    | "dueAt"
    | "state"
    | "owner"
    | "ownerRef"
    | "completionCriteria"
    | "completionNote"
    | "linkedRefs"
  >
> & {
  archiveReason?: string;
};

export type ProjectBlockerCreateInput = {
  projectId: string;
  title: string;
  condition: string;
  severity?: ProjectBlockerSeverity;
  owner?: string;
  ownerRef?: NativeObjectRef;
  dueAt?: string;
  sourceRefs?: NativeObjectRef[];
};

export type ProjectBlockerUpdateInput = Partial<
  Pick<
    ProjectBlocker,
    | "title"
    | "condition"
    | "state"
    | "severity"
    | "owner"
    | "ownerRef"
    | "dueAt"
    | "sourceRefs"
    | "resolution"
    | "waiverReason"
    | "carryForwardRef"
  >
> & {
  archiveReason?: string;
};

export type ProjectLinkCreateInput = {
  projectId: string;
  source: NativeObjectRef;
  relationship: ProjectLinkRelationship;
  relationshipStrength?: ProjectLinkStrength;
  isRequiredEvidence?: boolean;
  isPinned?: boolean;
  isReviewed?: boolean;
  review?: ReviewState;
  projectSpecificNote?: string;
  linkedMilestoneId?: string;
  linkedDecisionId?: string;
  linkedReviewId?: string;
};

export type ProjectLinkUpdateInput = Partial<
  Pick<
    ProjectLink,
    | "relationship"
    | "relationshipStrength"
    | "isRequiredEvidence"
    | "isPinned"
    | "isReviewed"
    | "review"
    | "linkState"
    | "projectSpecificNote"
    | "linkedMilestoneId"
    | "linkedDecisionId"
    | "linkedReviewId"
  >
> & {
  removalReason?: string;
};

export type ProjectsCreateInputByFamily = {
  projects: ProjectCreateInput;
  milestones: ProjectMilestoneCreateInput;
  blockers: ProjectBlockerCreateInput;
  links: ProjectLinkCreateInput;
};

export type ProjectsUpdateInputByFamily = {
  projects: ProjectUpdateInput;
  milestones: ProjectMilestoneUpdateInput;
  blockers: ProjectBlockerUpdateInput;
  links: ProjectLinkUpdateInput;
};

export type ProjectsObjectByFamily = {
  projects: Project;
  milestones: ProjectMilestone;
  blockers: ProjectBlocker;
  links: ProjectLink;
};

export type ProjectsCreateResult<Family extends ProjectObjectFamily> = {
  item: ProjectsObjectByFamily[Family];
  project: Project;
  created: boolean;
  mapping?: ProjectsLegacyMapping;
  auditEvent?: AuditEvent;
  timelineEvent?: ProjectTimelineEvent;
};

export type ProjectsUpdateResult<Family extends ProjectObjectFamily> = {
  item: ProjectsObjectByFamily[Family];
  project: Project;
  auditEvent: AuditEvent;
  timelineEvent: ProjectTimelineEvent;
};

export type ProjectsMutationResult<Data> = MutationResult<Data>;
