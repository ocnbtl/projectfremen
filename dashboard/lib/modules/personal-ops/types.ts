import type { AuditEvent } from "../../native-objects/audit";
import type { MutationResult } from "../../native-objects/mutation-result";
import type {
  CadenceState,
  HealthState,
  LifecycleState,
  ModuleId,
  NativeObjectRef,
  ReviewState
} from "../../native-objects/types";

export const PERSONAL_OPS_PREVIOUS_SCHEMA_VERSION = 1 as const;
export const PERSONAL_OPS_SCHEMA_VERSION = 2 as const;

export const PERSONAL_OPS_FAMILIES = [
  "goals",
  "decisions",
  "obligations",
  "followUps"
] as const;

export const PERSONAL_OPS_SECONDARY_FAMILIES = [
  "routines",
  "captures",
  "templates"
] as const;

export type PersonalOpsFamily = (typeof PERSONAL_OPS_FAMILIES)[number];
export type PersonalOpsSecondaryFamily = (typeof PERSONAL_OPS_SECONDARY_FAMILIES)[number];
export type PersonalOpsObjectType = "goal" | "decision" | "obligation" | "follow_up";
export type PersonalOpsSecondaryObjectType = "routine" | "capture_item" | "template";
export type PersonalOpsPriority = "low" | "medium" | "high" | "critical";

export type PersonalOpsHistoryEntry = {
  id: string;
  action: string;
  occurredAt: string;
  actorId: string;
  detail?: string;
};

export type PersonalOpsCommon = {
  id: string;
  objectType: PersonalOpsObjectType;
  title: string;
  domain: string;
  description: string;
  lifecycle: LifecycleState;
  health: HealthState;
  review: ReviewState;
  cadence: CadenceState;
  priority: PersonalOpsPriority;
  owner: string;
  dueAt?: string;
  cadenceRule?: string;
  sourceRefs: NativeObjectRef[];
  linkedRefs: NativeObjectRef[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archiveReason?: string;
  history: PersonalOpsHistoryEntry[];
};

export type GoalKeyResult = {
  id: string;
  title: string;
  measure?: string;
  currentValue?: number;
  targetValue?: number;
  complete: boolean;
};

export type PersonalOpsGoal = PersonalOpsCommon & {
  objectType: "goal";
  outcome: string;
  targetPeriod?: string;
  keyResults: GoalKeyResult[];
};

export type DecisionState = "open" | "decided" | "deferred" | "superseded";
export type DecisionReversibility =
  | "reversible"
  | "reversible_costly"
  | "irreversible"
  | "unknown";
export type DecisionRisk = "low" | "medium" | "high" | "critical" | "unknown";

export type DecisionOption = {
  id: string;
  title: string;
  pros: string[];
  cons: string[];
  selected: boolean;
  rejectionReason?: string;
};

export type PersonalOpsDecision = PersonalOpsCommon & {
  objectType: "decision";
  decisionState: DecisionState;
  question: string;
  finalDecision?: string;
  rationale?: string;
  deferReason?: string;
  revisitAt?: string;
  supersededBy?: NativeObjectRef;
  reversibility: DecisionReversibility;
  risk: DecisionRisk;
  options: DecisionOption[];
};

export type ObligationState = "open" | "waiting" | "blocked" | "complete";
export type EvidenceRequirementState = "missing" | "received" | "verified" | "not_applicable";

export type ObligationEvidenceRequirement = {
  id: string;
  label: string;
  required: boolean;
  state: EvidenceRequirementState;
  evidenceRef?: NativeObjectRef;
};

export type ObligationCompletionCriterion = {
  id: string;
  label: string;
  satisfied: boolean;
};

export type PersonalOpsObligation = PersonalOpsCommon & {
  objectType: "obligation";
  obligationState: ObligationState;
  consequence: string;
  requiredEvidence: ObligationEvidenceRequirement[];
  completionCriteria: ObligationCompletionCriterion[];
  completionNote?: string;
};

export type FollowUpState =
  | "open"
  | "scheduled"
  | "waiting"
  | "deferred"
  | "complete"
  | "carried_forward";

export type FollowUpType =
  | "person_check_in"
  | "project_follow_up"
  | "review_carry_forward"
  | "finance_action"
  | "obligation_follow_up"
  | "decision_follow_up"
  | "goal_check_in"
  | "resource_review"
  | "note_cleanup"
  | "waiting_response"
  | "recurring_cadence"
  | "other";

export type PersonalOpsFollowUp = PersonalOpsCommon & {
  objectType: "follow_up";
  followUpState: FollowUpState;
  followUpType: FollowUpType;
  context: string;
  outcome?: string;
  deferReason?: string;
  deferredUntil?: string;
  completionCriteria?: string;
};

export type PersonalOpsObject =
  | PersonalOpsGoal
  | PersonalOpsDecision
  | PersonalOpsObligation
  | PersonalOpsFollowUp;

export type RoutineLifecycleState = Exclude<LifecycleState, "complete">;
export type RoutineFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "custom";
export type RoutineTrigger = "manual" | "scheduled_window" | "after_completion";

export type RoutineCadenceRule = {
  frequency: RoutineFrequency;
  interval: number;
  label?: string;
  timezone: string;
  anchorDate?: string;
  weekdays: number[];
  reminderWindowDays: number;
  trigger: RoutineTrigger;
  skipBehavior: "skip_occurrence" | "move_to_next_window" | "require_decision";
  autoCreateNext: false;
};

export type RoutineGenerationRule = {
  id: string;
  label: string;
  enabled: boolean;
  destination: PersonalOpsDestinationDraft;
  conditions: string[];
};

export type RoutineRunResult = {
  ruleId: string;
  label: string;
  destinationModule: ModuleId;
  destinationFamily?: PersonalOpsFamily;
  outcome: "created" | "disabled";
  disabledReason?: string;
  createdRef?: NativeObjectRef;
};

export type RoutineRun = {
  id: string;
  operationKey: string;
  scheduledFor?: string;
  startedAt: string;
  completedAt: string;
  completedBy: string;
  outcome: "completed";
  generatedRefs: NativeObjectRef[];
  results: RoutineRunResult[];
};

export type PersonalOpsRoutine = {
  id: string;
  objectType: "routine";
  title: string;
  summary: string;
  domain: string;
  owner: string;
  lifecycle: RoutineLifecycleState;
  health: HealthState;
  review: ReviewState;
  cadence: CadenceState;
  priority: PersonalOpsPriority;
  cadenceRule: RoutineCadenceRule;
  generationRules: RoutineGenerationRule[];
  completionCriteria: string[];
  linkedRefs: NativeObjectRef[];
  lastRunAt?: string;
  nextRunAt?: string;
  runHistory: RoutineRun[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archiveReason?: string;
  history: PersonalOpsHistoryEntry[];
};

export type CaptureLifecycleState = "active" | "archived";
export type CaptureTriageState = "untriaged" | "needs_context" | "ready" | "processed";

export type CaptureSource = {
  kind: "quick_capture" | "manual" | "import" | "linked_object";
  label: string;
  capturedAt: string;
  sourceRef?: NativeObjectRef;
};

export type CaptureSuggestion = {
  id: string;
  kind: "destination" | "title" | "domain" | "split";
  label: string;
  state: "proposed" | "accepted" | "rejected";
  destinationModule?: ModuleId;
  destinationFamily?: PersonalOpsFamily;
  explanation?: string;
};

export type CaptureProcessingOutputDraft = {
  id: string;
  excerpt?: string;
  destination: PersonalOpsDestinationDraft;
};

export type CaptureProcessingAction = {
  id: string;
  operationKey: string;
  action: "split_and_create";
  processedAt: string;
  processedBy: string;
  outcome: "completed";
  outputs: CaptureProcessingOutputDraft[];
  createdRefs: NativeObjectRef[];
};

export type PersonalOpsCaptureItem = {
  id: string;
  objectType: "capture_item";
  title: string;
  rawText: string;
  domain: string;
  owner: string;
  lifecycle: CaptureLifecycleState;
  health: HealthState;
  review: ReviewState;
  triageState: CaptureTriageState;
  source: CaptureSource;
  missingContext: string[];
  suggestions: CaptureSuggestion[];
  linkedRefs: NativeObjectRef[];
  processedRefs: NativeObjectRef[];
  processingActions: CaptureProcessingAction[];
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archiveReason?: string;
  history: PersonalOpsHistoryEntry[];
};

export type TemplateLifecycleState = "draft" | "active" | "archived";
export type TemplateAvailabilityState = "draft" | "active" | "paused" | "deprecated";
export type TemplateHealthState = "ready" | "needs_attention" | "invalid" | "unknown";
export type TemplateFieldValue = string | number | boolean | null;

export type TemplateField = {
  id: string;
  key: string;
  label: string;
  type: "short_text" | "long_text" | "number" | "date" | "boolean" | "select";
  required: boolean;
  defaultValue?: TemplateFieldValue;
  options: string[];
  helpText?: string;
};

export type TemplateRule = {
  id: string;
  label: string;
  enabled: boolean;
  when: "always" | "field_equals" | "field_present";
  fieldKey?: string;
  expectedValue?: TemplateFieldValue;
  explanation?: string;
};

export type TemplateGeneratedDefinition = {
  id: string;
  label: string;
  enabled: boolean;
  destination: PersonalOpsDestinationDraft;
};

export type TemplateUsage = {
  id: string;
  operationKey: string;
  /** Canonical request identity used to reject operation-key reuse with different inputs. */
  requestFingerprint?: string;
  definitionId: string;
  usedAt: string;
  usedBy: string;
  values: Readonly<Record<string, TemplateFieldValue>>;
  createdRef: NativeObjectRef;
};

export type PersonalOpsTemplate = {
  id: string;
  objectType: "template";
  title: string;
  summary: string;
  domain: string;
  owner: string;
  lifecycle: TemplateLifecycleState;
  availability: TemplateAvailabilityState;
  health: TemplateHealthState;
  review: ReviewState;
  fields: TemplateField[];
  rules: TemplateRule[];
  generatedDefinitions: TemplateGeneratedDefinition[];
  linkedRefs: NativeObjectRef[];
  usages: TemplateUsage[];
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archiveReason?: string;
  history: PersonalOpsHistoryEntry[];
};

export type PersonalOpsSecondaryObject =
  | PersonalOpsRoutine
  | PersonalOpsCaptureItem
  | PersonalOpsTemplate;

export type LegacyPersonalRecordDescriptor = {
  id: string;
  domain: string;
  className: string;
  status: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
};

export type LegacyCandidateClassification =
  | "decision_candidate"
  | "unclassified_capture"
  | "owned_elsewhere";

export type LegacyPersonalOpsCandidate = {
  legacyPersonalRecordId: string;
  title: string;
  classification: LegacyCandidateClassification;
  currentOwner: ModuleId;
  allowedConversions: PersonalOpsFamily[];
  requiresExplicitChoice: true;
  reason: string;
  source: LegacyPersonalRecordDescriptor;
};

export type LegacyConversionSource = {
  record: LegacyPersonalRecordDescriptor;
  conversionConfirmed: true;
  /** Stable caller-supplied operation key. Defaults to the destination family. */
  conversionKey?: string;
};

export type PersonalOpsLegacyMapping = {
  id: string;
  legacyPersonalRecordId: string;
  conversionKey: string;
  family: PersonalOpsFamily;
  nativeRef: NativeObjectRef;
  source: LegacyPersonalRecordDescriptor;
  convertedAt: string;
  convertedBy: string;
};

export type PersonalOpsState = {
  schemaVersion: typeof PERSONAL_OPS_SCHEMA_VERSION;
  goals: PersonalOpsGoal[];
  decisions: PersonalOpsDecision[];
  obligations: PersonalOpsObligation[];
  followUps: PersonalOpsFollowUp[];
  routines: PersonalOpsRoutine[];
  captures: PersonalOpsCaptureItem[];
  templates: PersonalOpsTemplate[];
  auditEvents: AuditEvent[];
  legacyMappings: PersonalOpsLegacyMapping[];
};

export type PersonalOpsObjectByFamily = {
  goals: PersonalOpsGoal;
  decisions: PersonalOpsDecision;
  obligations: PersonalOpsObligation;
  followUps: PersonalOpsFollowUp;
};

export type PersonalOpsSecondaryObjectByFamily = {
  routines: PersonalOpsRoutine;
  captures: PersonalOpsCaptureItem;
  templates: PersonalOpsTemplate;
};

export type GoalCreateInput = {
  title: string;
  outcome: string;
  domain?: string;
  description?: string;
  lifecycle?: LifecycleState;
  health?: HealthState;
  review?: ReviewState;
  cadence?: CadenceState;
  priority?: PersonalOpsPriority;
  owner?: string;
  dueAt?: string;
  cadenceRule?: string;
  targetPeriod?: string;
  keyResults?: Array<Partial<GoalKeyResult> & { title: string }>;
  sourceRefs?: NativeObjectRef[];
  linkedRefs?: NativeObjectRef[];
  legacySource?: LegacyConversionSource;
};

export type DecisionCreateInput = {
  title: string;
  question: string;
  domain?: string;
  description?: string;
  lifecycle?: LifecycleState;
  health?: HealthState;
  review?: ReviewState;
  cadence?: CadenceState;
  priority?: PersonalOpsPriority;
  owner?: string;
  dueAt?: string;
  cadenceRule?: string;
  decisionState?: DecisionState;
  finalDecision?: string;
  rationale?: string;
  deferReason?: string;
  revisitAt?: string;
  supersededBy?: NativeObjectRef;
  reversibility?: DecisionReversibility;
  risk?: DecisionRisk;
  options?: Array<Partial<DecisionOption> & { title: string }>;
  sourceRefs?: NativeObjectRef[];
  linkedRefs?: NativeObjectRef[];
  legacySource?: LegacyConversionSource;
};

export type ObligationCreateInput = {
  title: string;
  consequence: string;
  domain?: string;
  description?: string;
  lifecycle?: LifecycleState;
  health?: HealthState;
  review?: ReviewState;
  cadence?: CadenceState;
  priority?: PersonalOpsPriority;
  owner?: string;
  dueAt?: string;
  cadenceRule?: string;
  obligationState?: ObligationState;
  requiredEvidence?: Array<Partial<ObligationEvidenceRequirement> & { label: string }>;
  completionCriteria?: Array<Partial<ObligationCompletionCriterion> & { label: string }>;
  completionNote?: string;
  sourceRefs?: NativeObjectRef[];
  linkedRefs?: NativeObjectRef[];
  legacySource?: LegacyConversionSource;
};

export type FollowUpCreateInput = {
  title: string;
  followUpType: FollowUpType;
  context?: string;
  domain?: string;
  description?: string;
  lifecycle?: LifecycleState;
  health?: HealthState;
  review?: ReviewState;
  cadence?: CadenceState;
  priority?: PersonalOpsPriority;
  owner?: string;
  dueAt?: string;
  cadenceRule?: string;
  followUpState?: FollowUpState;
  outcome?: string;
  deferReason?: string;
  deferredUntil?: string;
  completionCriteria?: string;
  sourceRefs?: NativeObjectRef[];
  linkedRefs?: NativeObjectRef[];
  legacySource?: LegacyConversionSource;
};

export type PersonalOpsCreateInputByFamily = {
  goals: GoalCreateInput;
  decisions: DecisionCreateInput;
  obligations: ObligationCreateInput;
  followUps: FollowUpCreateInput;
};

type CommonUpdateInput = {
  title?: string;
  domain?: string;
  description?: string;
  lifecycle?: LifecycleState;
  health?: HealthState;
  review?: ReviewState;
  cadence?: CadenceState;
  priority?: PersonalOpsPriority;
  owner?: string;
  dueAt?: string;
  cadenceRule?: string;
  sourceRefs?: NativeObjectRef[];
  linkedRefs?: NativeObjectRef[];
  archiveReason?: string;
};

export type GoalUpdateInput = CommonUpdateInput & {
  outcome?: string;
  targetPeriod?: string;
  keyResults?: Array<Partial<GoalKeyResult> & { title: string }>;
};

export type DecisionUpdateInput = CommonUpdateInput & {
  question?: string;
  decisionState?: DecisionState;
  finalDecision?: string;
  rationale?: string;
  deferReason?: string;
  revisitAt?: string;
  supersededBy?: NativeObjectRef;
  reversibility?: DecisionReversibility;
  risk?: DecisionRisk;
  options?: Array<Partial<DecisionOption> & { title: string }>;
};

export type ObligationUpdateInput = CommonUpdateInput & {
  obligationState?: ObligationState;
  consequence?: string;
  requiredEvidence?: Array<Partial<ObligationEvidenceRequirement> & { label: string }>;
  completionCriteria?: Array<Partial<ObligationCompletionCriterion> & { label: string }>;
  completionNote?: string;
};

export type FollowUpUpdateInput = CommonUpdateInput & {
  followUpState?: FollowUpState;
  followUpType?: FollowUpType;
  context?: string;
  outcome?: string;
  deferReason?: string;
  deferredUntil?: string;
  completionCriteria?: string;
};

export type PersonalOpsUpdateInputByFamily = {
  goals: GoalUpdateInput;
  decisions: DecisionUpdateInput;
  obligations: ObligationUpdateInput;
  followUps: FollowUpUpdateInput;
};

export type PersonalOpsCoreDestinationDraft = {
  [Family in PersonalOpsFamily]: {
    module: "personal_ops";
    family: Family;
    input: PersonalOpsCreateInputByFamily[Family];
  }
}[PersonalOpsFamily];

export type PersonalOpsExternalDestinationDraft = {
  module: Exclude<ModuleId, "personal_ops">;
  objectType: string;
  label: string;
};

export type PersonalOpsDestinationDraft =
  | PersonalOpsCoreDestinationDraft
  | PersonalOpsExternalDestinationDraft;

export type RoutineCreateInput = {
  title: string;
  summary?: string;
  domain?: string;
  owner?: string;
  lifecycle?: RoutineLifecycleState;
  health?: HealthState;
  review?: ReviewState;
  cadence?: CadenceState;
  priority?: PersonalOpsPriority;
  cadenceRule: Partial<RoutineCadenceRule> & Pick<RoutineCadenceRule, "frequency">;
  generationRules?: Array<Partial<RoutineGenerationRule> & Pick<RoutineGenerationRule, "label" | "destination">>;
  completionCriteria?: string[];
  linkedRefs?: NativeObjectRef[];
  nextRunAt?: string;
};

export type RoutineUpdateInput = Partial<Omit<RoutineCreateInput, "cadenceRule">> & {
  cadenceRule?: Partial<RoutineCadenceRule> & Pick<RoutineCadenceRule, "frequency">;
  archiveReason?: string;
  archiveConfirmed?: boolean;
  restoreConfirmed?: boolean;
};

export type CaptureCreateInput = {
  rawText: string;
  title?: string;
  domain?: string;
  owner?: string;
  health?: HealthState;
  review?: ReviewState;
  triageState?: CaptureTriageState;
  source?: Partial<CaptureSource>;
  missingContext?: string[];
  suggestions?: Array<Partial<CaptureSuggestion> & Pick<CaptureSuggestion, "kind" | "label">>;
  linkedRefs?: NativeObjectRef[];
};

export type CaptureUpdateInput = {
  title?: string;
  domain?: string;
  owner?: string;
  lifecycle?: CaptureLifecycleState;
  health?: HealthState;
  review?: ReviewState;
  triageState?: CaptureTriageState;
  missingContext?: string[];
  suggestions?: Array<Partial<CaptureSuggestion> & Pick<CaptureSuggestion, "kind" | "label">>;
  linkedRefs?: NativeObjectRef[];
  archiveReason?: string;
  archiveConfirmed?: boolean;
  restoreConfirmed?: boolean;
};

export type TemplateCreateInput = {
  title: string;
  summary?: string;
  domain?: string;
  owner?: string;
  lifecycle?: TemplateLifecycleState;
  availability?: TemplateAvailabilityState;
  health?: TemplateHealthState;
  review?: ReviewState;
  fields?: Array<Partial<TemplateField> & Pick<TemplateField, "key" | "label" | "type">>;
  rules?: Array<Partial<TemplateRule> & Pick<TemplateRule, "label" | "when">>;
  generatedDefinitions?: Array<
    Partial<TemplateGeneratedDefinition> & Pick<TemplateGeneratedDefinition, "label" | "destination">
  >;
  linkedRefs?: NativeObjectRef[];
};

export type TemplateUpdateInput = Partial<TemplateCreateInput> & {
  archiveReason?: string;
  archiveConfirmed?: boolean;
  restoreConfirmed?: boolean;
};

export type PersonalOpsSecondaryCreateInputByFamily = {
  routines: RoutineCreateInput;
  captures: CaptureCreateInput;
  templates: TemplateCreateInput;
};

export type PersonalOpsSecondaryUpdateInputByFamily = {
  routines: RoutineUpdateInput;
  captures: CaptureUpdateInput;
  templates: TemplateUpdateInput;
};

export type CreatePersonalOpsSecondaryResult<
  Family extends PersonalOpsSecondaryFamily = PersonalOpsSecondaryFamily
> = {
  item: PersonalOpsSecondaryObjectByFamily[Family];
  created: true;
};

export type RoutineRunPreviewInput = {
  scheduledFor?: string;
  ruleIds?: string[];
};

export type RoutineRunPreviewEntry = {
  ruleId: string;
  label: string;
  destinationModule: ModuleId;
  destinationFamily?: PersonalOpsFamily;
  canCreate: boolean;
  disabledReason?: string;
  proposedInput?: PersonalOpsCreateInputByFamily[PersonalOpsFamily];
};

export type RoutineRunPreview = {
  routineId: string;
  routineUpdatedAt: string;
  generatedAt: string;
  scheduledFor?: string;
  entries: RoutineRunPreviewEntry[];
  confirmableCount: number;
  disabledCount: number;
};

export type ConfirmRoutineRunInput = RoutineRunPreviewInput & {
  expectedUpdatedAt: string;
  operationKey: string;
  confirmed: true;
};

export type ConfirmRoutineRunResult = {
  item: PersonalOpsRoutine;
  run: RoutineRun;
  created: boolean;
};

export type CaptureProcessingPreviewInput = {
  outputs: CaptureProcessingOutputDraft[];
};

export type CaptureProcessingPreviewEntry = {
  outputId: string;
  excerpt?: string;
  destinationModule: ModuleId;
  destinationFamily?: PersonalOpsFamily;
  canCreate: boolean;
  disabledReason?: string;
  proposedInput?: PersonalOpsCreateInputByFamily[PersonalOpsFamily];
};

export type CaptureProcessingPreview = {
  captureId: string;
  captureUpdatedAt: string;
  rawText: string;
  generatedAt: string;
  entries: CaptureProcessingPreviewEntry[];
  confirmableCount: number;
  disabledCount: number;
};

export type ConfirmCaptureProcessingInput = CaptureProcessingPreviewInput & {
  expectedUpdatedAt: string;
  operationKey: string;
  confirmed: true;
};

export type ConfirmCaptureProcessingResult = {
  item: PersonalOpsCaptureItem;
  action: CaptureProcessingAction;
  created: boolean;
};

export type TemplateTestInput = {
  values: Readonly<Record<string, TemplateFieldValue>>;
  definitionId?: string;
};

export type TemplateTestPreviewEntry = {
  definitionId: string;
  label: string;
  destinationModule: ModuleId;
  destinationFamily?: PersonalOpsFamily;
  canCreate: boolean;
  disabledReason?: string;
  proposedInput?: PersonalOpsCreateInputByFamily[PersonalOpsFamily];
};

export type TemplateTestPreview = {
  templateId: string;
  templateUpdatedAt: string;
  generatedAt: string;
  values: Readonly<Record<string, TemplateFieldValue>>;
  fieldErrors: Readonly<Record<string, readonly string[]>>;
  entries: TemplateTestPreviewEntry[];
  confirmableCount: number;
  disabledCount: number;
};

export type InstantiateTemplateInput = TemplateTestInput & {
  expectedUpdatedAt: string;
  operationKey: string;
  definitionId: string;
  confirmed: true;
};

export type InstantiateTemplateResult = {
  item: PersonalOpsTemplate;
  usage: TemplateUsage;
  created: boolean;
};

export type CreatePersonalOpsResult<Family extends PersonalOpsFamily = PersonalOpsFamily> = {
  item: PersonalOpsObjectByFamily[Family];
  created: boolean;
  mapping?: PersonalOpsLegacyMapping;
};

export type PersonalOpsMutationResult<Data> = MutationResult<Data>;
