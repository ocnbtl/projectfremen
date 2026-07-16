import type { AuditEvent } from "../../native-objects/audit";
import type { ModuleId, NativeObjectRef } from "../../native-objects/types";
import type { MutationResult } from "../../native-objects/mutation-result";

export const REVIEWS_SCHEMA_VERSION = 1 as const;

export const REVIEW_CADENCES = ["weekly", "monthly"] as const;
export type ReviewCadence = (typeof REVIEW_CADENCES)[number];

export type ReviewRunLifecycle =
  | "draft"
  | "open"
  | "in_progress"
  | "completed"
  | "archived"
  | "canceled";

export type ReviewChecklistState =
  | "open"
  | "complete"
  | "needs_evidence"
  | "blocked"
  | "waived"
  | "carried_forward";

export type ReviewChecklistAction =
  | "link"
  | "open"
  | "review"
  | "file"
  | "resolve"
  | "reconcile"
  | "create_followup"
  | "carry_forward"
  | "draft"
  | "save";

export type ReviewContextRelationship =
  | "context"
  | "evidence"
  | "blocker_source"
  | "decision_source"
  | "follow_up_source"
  | "carry_forward_source"
  | "summary_source";

export type ReviewContextLinkState = "linked" | "stale" | "broken" | "removed";

export type ReviewEvidenceState =
  | "missing"
  | "linked"
  | "waived"
  | "replaced"
  | "stale"
  | "duplicate"
  | "carried_forward";

export type ReviewDecisionState =
  | "candidate"
  | "needs_rationale"
  | "needs_evidence"
  | "ready_to_file"
  | "filed"
  | "deferred"
  | "waived"
  | "superseded"
  | "carried_forward";

export type ReviewFollowUpState =
  | "suggested"
  | "created"
  | "carried_forward"
  | "dismissed"
  | "completed";

export type ReviewCarryForwardState = "pending" | "assigned" | "resolved";
export type ReviewRisk = "low" | "medium" | "high";
export type ReviewReversibility =
  | "reversible"
  | "reversible_but_costly"
  | "hard_to_reverse"
  | "irreversible";

export type ReviewStructuredSummary = {
  summary: string;
  wins: string;
  blockers: string;
  decisions: string;
  carryForward: string;
  nextFocus: string;
};

export type ReviewChecklistItem = {
  id: string;
  definitionId: string;
  label: string;
  description: string;
  required: boolean;
  state: ReviewChecklistState;
  ownerModule?: ModuleId;
  action: ReviewChecklistAction;
  evidenceRequired: boolean;
  evidenceRequirementIds: string[];
  carryForwardAllowed: boolean;
  waiverAllowed: boolean;
  waiverReason?: string;
  carryForwardId?: string;
  completedAt?: string;
  completedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewContextLink = {
  id: string;
  sourceRef: NativeObjectRef;
  relationship: ReviewContextRelationship;
  state: ReviewContextLinkState;
  linkedAt: string;
  linkedBy: string;
  removedAt?: string;
  lastKnownLabel: string;
  sourceVersion?: string;
};

export type ReviewEvidenceWaiver = {
  reason: string;
  riskNote: string;
  waivedBy: string;
  waivedAt: string;
};

export type ReviewEvidenceReplacement = {
  previousSourceRef?: NativeObjectRef;
  replacementSourceRef: NativeObjectRef;
  reason: string;
  reviewed: boolean;
  reviewedAt?: string;
  reviewedBy?: string;
};

export type ReviewEvidenceItem = {
  id: string;
  requirementId: string;
  title: string;
  description: string;
  required: boolean;
  blocksCompletion: boolean;
  ownerModule: ModuleId;
  allowedSourceModules: ModuleId[];
  relationship: ReviewContextRelationship;
  state: ReviewEvidenceState;
  sourceRef?: NativeObjectRef;
  dependencyIds: string[];
  waiver?: ReviewEvidenceWaiver;
  replacement?: ReviewEvidenceReplacement;
  carryForwardId?: string;
  duplicateOfId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewDecisionResolution = {
  deferUntil?: string;
  deferReason?: string;
  futureDestination?: string;
  waiverReason?: string;
  waiverRiskNote?: string;
  supersededByRef?: NativeObjectRef;
  carryForwardId?: string;
};

export type ReviewDecisionItem = {
  id: string;
  title: string;
  question: string;
  sourceRef: NativeObjectRef;
  destinationModule: ModuleId;
  destinationObjectType: string;
  destinationRef?: NativeObjectRef;
  state: ReviewDecisionState;
  ownerId: string;
  risk: ReviewRisk;
  impact: ReviewRisk;
  confidence: ReviewRisk;
  reversibility: ReviewReversibility;
  dueDate?: string;
  reviewDate?: string;
  rationale: string;
  recommendation: string;
  alternatives: string[];
  reversalCondition: string;
  evidenceIds: string[];
  required: boolean;
  blocksCompletion: boolean;
  resolution: ReviewDecisionResolution;
  filedAt?: string;
  filedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewFollowUpLink = {
  id: string;
  title: string;
  sourceRef: NativeObjectRef;
  destinationModule: ModuleId;
  ownerId?: string;
  dueDate?: string;
  state: ReviewFollowUpState;
  createdObjectRef?: NativeObjectRef;
  carryForwardId?: string;
  dismissReason?: string;
  required: boolean;
  blocksCompletion: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReviewCarryForwardItem = {
  id: string;
  title: string;
  sourceType: "checklist" | "evidence" | "decision" | "follow_up" | "summary";
  sourceId: string;
  sourceRef?: NativeObjectRef;
  destinationModule?: ModuleId;
  destinationReviewId?: string;
  destinationObjectType?: string;
  destinationObjectRef?: NativeObjectRef;
  ownerId: string;
  reason: string;
  nextAction: string;
  dueDate?: string;
  state: ReviewCarryForwardState;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
};

export type ReviewLegacyMapping = {
  id: string;
  legacyReviewEntryId: string;
  nativeReviewRunId: string;
  cadence: ReviewCadence;
  scheduledFor: string;
  mappedAt: string;
  mappedBy: string;
};

export type ReviewRun = {
  id: string;
  templateId: string;
  templateVersion: number;
  cadence: ReviewCadence;
  title: string;
  periodStart: string;
  periodEnd: string;
  dueAt?: string;
  nextReviewAt?: string;
  ownerId: string;
  lifecycle: ReviewRunLifecycle;
  current: boolean;
  summary: ReviewStructuredSummary;
  checklist: ReviewChecklistItem[];
  contextLinks: ReviewContextLink[];
  evidence: ReviewEvidenceItem[];
  decisions: ReviewDecisionItem[];
  followUps: ReviewFollowUpLink[];
  carryForward: ReviewCarryForwardItem[];
  legacyReviewEntryId?: string;
  completedAt?: string;
  completedBy?: string;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  lifecycleBeforeArchive?: Exclude<ReviewRunLifecycle, "archived">;
  createdAt: string;
  updatedAt: string;
};

export type ReviewsState = {
  schemaVersion: typeof REVIEWS_SCHEMA_VERSION;
  runs: ReviewRun[];
  auditEvents: AuditEvent[];
  legacyMappings: ReviewLegacyMapping[];
};

export type ReviewCompletionBlockerType =
  | "checklist"
  | "evidence"
  | "decision"
  | "follow_up"
  | "carry_forward"
  | "summary"
  | "external_gate";

export type ReviewCompletionBlocker = {
  id: string;
  type: ReviewCompletionBlockerType;
  sourceItemId: string;
  label: string;
  routeTab: "overview" | "checklist" | "evidence" | "decisions" | "follow-ups" | "finance";
  severity: "blocking";
};

export type ReviewRunCounts = {
  requiredChecks: number;
  resolvedRequiredChecks: number;
  evidenceLinked: number;
  evidenceMissing: number;
  decisionsOpen: number;
  decisionsFiled: number;
  decisionsResolved: number;
  followUpsOpen: number;
  followUpsCreated: number;
  carryForwardOpen: number;
  contextLinks: number;
  blockers: number;
};

export type ReviewRunView = {
  run: ReviewRun;
  blockers: ReviewCompletionBlocker[];
  counts: ReviewRunCounts;
  canComplete: boolean;
};

export type LegacyReviewRunProjection = {
  reviewId: string;
  legacyReviewEntryId: string;
  cadence: ReviewCadence;
  title: string;
  scheduledFor: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  rawValues: Readonly<Record<string, string>>;
  lifecycle: "legacy_read_only";
  updatedAt: string;
  route: string;
};

export type FinanceReviewBridge = {
  state: "read_only_preview";
  label: string;
  href: "/admin/finance/monthly-review";
  reason: string;
};

export type ReviewRunCreateInput = {
  cadence: ReviewCadence;
  title?: string;
  periodStart: string;
  periodEnd: string;
  dueAt?: string;
  nextReviewAt?: string;
  ownerId?: string;
  current?: boolean;
};

export type ReviewChecklistMutation = {
  itemId: string;
  state: ReviewChecklistState;
  waiverReason?: string;
  carryForwardId?: string;
};

export type ReviewSummaryMutation = Partial<ReviewStructuredSummary>;

export type ReviewEvidenceMutation = {
  evidenceId: string;
  state: ReviewEvidenceState;
  sourceRef?: NativeObjectRef;
  waiver?: { reason: string; riskNote: string };
  replacement?: {
    replacementSourceRef: NativeObjectRef;
    reason: string;
    reviewed: boolean;
  };
  carryForwardId?: string;
  duplicateOfId?: string;
};

export type ReviewDecisionMutation = Omit<
  ReviewDecisionItem,
  "id" | "createdAt" | "updatedAt" | "filedAt" | "filedBy"
> & {
  id?: string;
};

export type ReviewFollowUpMutation = Omit<ReviewFollowUpLink, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

export type ReviewCarryForwardMutation = Omit<
  ReviewCarryForwardItem,
  "id" | "createdAt" | "updatedAt" | "resolvedAt"
> & {
  id?: string;
};

export type ReviewRunPatch =
  | { action: "update_summary"; summary: ReviewSummaryMutation }
  | { action: "update_checklist"; checklist: ReviewChecklistMutation }
  | { action: "link_context"; sourceRef: NativeObjectRef; relationship?: ReviewContextRelationship }
  | { action: "unlink_context"; contextLinkId: string }
  | { action: "update_evidence"; evidence: ReviewEvidenceMutation }
  | { action: "upsert_decision"; decision: ReviewDecisionMutation }
  | { action: "upsert_follow_up"; followUp: ReviewFollowUpMutation }
  | { action: "upsert_carry_forward"; carryForward: ReviewCarryForwardMutation }
  | { action: "complete" }
  | { action: "archive"; reason: string }
  | { action: "restore" };

export type ReviewsMutationResult<Data> = MutationResult<Data>;
