import { readJsonFile, writeJsonFile } from "../../file-store";
import { createAuditEvent, type AuditEvent, type AuditSnapshot } from "../../native-objects/audit";
import type { MutationErrorCode } from "../../native-objects/mutation-result";
import { createNativeObjectRef } from "../../native-objects/routes";
import {
  isModuleId,
  type CadenceState,
  type HealthState,
  type LifecycleState,
  type NativeObjectRef,
  type ReviewState
} from "../../native-objects/types";
import {
  classifyLegacyPersonalRecord,
  findLegacyMapping,
  getLegacySourceRef
} from "./legacy-adapter";
import {
  PERSONAL_OPS_FAMILIES,
  PERSONAL_OPS_PREVIOUS_SCHEMA_VERSION,
  PERSONAL_OPS_SCHEMA_VERSION,
  PERSONAL_OPS_SECONDARY_FAMILIES,
  type CaptureCreateInput,
  type CaptureProcessingAction,
  type CaptureProcessingOutputDraft,
  type CaptureProcessingPreview,
  type CaptureProcessingPreviewEntry,
  type CaptureProcessingPreviewInput,
  type CaptureSource,
  type CaptureSuggestion,
  type CaptureTriageState,
  type CaptureUpdateInput,
  type ConfirmCaptureProcessingInput,
  type ConfirmCaptureProcessingResult,
  type ConfirmRoutineRunInput,
  type ConfirmRoutineRunResult,
  type CreatePersonalOpsResult,
  type CreatePersonalOpsSecondaryResult,
  type DecisionCreateInput,
  type DecisionOption,
  type DecisionReversibility,
  type DecisionRisk,
  type DecisionState,
  type EvidenceRequirementState,
  type FollowUpCreateInput,
  type FollowUpState,
  type FollowUpType,
  type GoalCreateInput,
  type GoalKeyResult,
  type InstantiateTemplateInput,
  type InstantiateTemplateResult,
  type LegacyConversionSource,
  type LegacyPersonalRecordDescriptor,
  type ObligationCompletionCriterion,
  type ObligationCreateInput,
  type ObligationEvidenceRequirement,
  type ObligationState,
  type PersonalOpsCommon,
  type PersonalOpsCreateInputByFamily,
  type PersonalOpsDecision,
  type PersonalOpsFamily,
  type PersonalOpsFollowUp,
  type PersonalOpsGoal,
  type PersonalOpsHistoryEntry,
  type PersonalOpsLegacyMapping,
  type PersonalOpsObject,
  type PersonalOpsObjectByFamily,
  type PersonalOpsObjectType,
  type PersonalOpsObligation,
  type PersonalOpsPriority,
  type PersonalOpsCaptureItem,
  type PersonalOpsCoreDestinationDraft,
  type PersonalOpsDestinationDraft,
  type PersonalOpsRoutine,
  type PersonalOpsSecondaryCreateInputByFamily,
  type PersonalOpsSecondaryFamily,
  type PersonalOpsSecondaryObject,
  type PersonalOpsSecondaryObjectByFamily,
  type PersonalOpsSecondaryUpdateInputByFamily,
  type PersonalOpsState,
  type PersonalOpsTemplate,
  type PersonalOpsUpdateInputByFamily,
  type RoutineCadenceRule,
  type RoutineCreateInput,
  type RoutineFrequency,
  type RoutineGenerationRule,
  type RoutineLifecycleState,
  type RoutineRun,
  type RoutineRunPreview,
  type RoutineRunPreviewEntry,
  type RoutineRunPreviewInput,
  type RoutineTrigger,
  type RoutineUpdateInput,
  type TemplateAvailabilityState,
  type TemplateCreateInput,
  type TemplateField,
  type TemplateFieldValue,
  type TemplateGeneratedDefinition,
  type TemplateHealthState,
  type TemplateLifecycleState,
  type TemplateRule,
  type TemplateTestInput,
  type TemplateTestPreview,
  type TemplateTestPreviewEntry,
  type TemplateUpdateInput,
  type TemplateUsage
} from "./types";

const FILE_NAME = "personal-ops.json";
const MAX_MODULE_AUDIT_EVENTS = 1000;
const MIGRATED_FROM_V1 = Symbol("personal-ops-migrated-from-v1");
type MigratedPersonalOpsState = PersonalOpsState & { [MIGRATED_FROM_V1]?: true };

const LIFECYCLE_STATES: LifecycleState[] = ["draft", "planned", "active", "complete", "archived"];
const HEALTH_STATES: HealthState[] = ["healthy", "attention", "blocked", "stale", "unknown"];
const REVIEW_STATES: ReviewState[] = [
  "not_required",
  "not_reviewed",
  "needs_review",
  "in_review",
  "reviewed",
  "waived"
];
const CADENCE_STATES: CadenceState[] = ["current", "due_soon", "overdue", "dormant", "paused"];
const PRIORITIES: PersonalOpsPriority[] = ["low", "medium", "high", "critical"];
const DECISION_STATES: DecisionState[] = ["open", "decided", "deferred", "superseded"];
const REVERSIBILITY_STATES: DecisionReversibility[] = [
  "reversible",
  "reversible_costly",
  "irreversible",
  "unknown"
];
const DECISION_RISKS: DecisionRisk[] = ["low", "medium", "high", "critical", "unknown"];
const OBLIGATION_STATES: ObligationState[] = ["open", "waiting", "blocked", "complete"];
const EVIDENCE_STATES: EvidenceRequirementState[] = [
  "missing",
  "received",
  "verified",
  "not_applicable"
];
const FOLLOW_UP_STATES: FollowUpState[] = [
  "open",
  "scheduled",
  "waiting",
  "deferred",
  "complete",
  "carried_forward"
];
const FOLLOW_UP_TYPES: FollowUpType[] = [
  "person_check_in",
  "project_follow_up",
  "review_carry_forward",
  "finance_action",
  "obligation_follow_up",
  "decision_follow_up",
  "goal_check_in",
  "resource_review",
  "note_cleanup",
  "waiting_response",
  "recurring_cadence",
  "other"
];
const ROUTINE_LIFECYCLE_STATES: RoutineLifecycleState[] = ["draft", "planned", "active", "archived"];
const ROUTINE_FREQUENCIES: RoutineFrequency[] = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annual",
  "custom"
];
const ROUTINE_TRIGGERS: RoutineTrigger[] = ["manual", "scheduled_window", "after_completion"];
const CAPTURE_LIFECYCLE_STATES: PersonalOpsCaptureItem["lifecycle"][] = ["active", "archived"];
const CAPTURE_TRIAGE_STATES: CaptureTriageState[] = [
  "untriaged",
  "needs_context",
  "ready",
  "processed"
];
const TEMPLATE_LIFECYCLE_STATES: TemplateLifecycleState[] = ["draft", "active", "archived"];
const TEMPLATE_AVAILABILITY_STATES: TemplateAvailabilityState[] = [
  "draft",
  "active",
  "paused",
  "deprecated"
];
const TEMPLATE_HEALTH_STATES: TemplateHealthState[] = [
  "ready",
  "needs_attention",
  "invalid",
  "unknown"
];

const SECONDARY_ID_PREFIX: Record<PersonalOpsSecondaryFamily, string> = {
  routines: "routine",
  captures: "capture",
  templates: "template"
};

const FAMILY_OBJECT_TYPE: Record<PersonalOpsFamily, PersonalOpsObjectType> = {
  goals: "goal",
  decisions: "decision",
  obligations: "obligation",
  followUps: "follow_up"
};

const FAMILY_ID_PREFIX: Record<PersonalOpsFamily, string> = {
  goals: "goal",
  decisions: "decision",
  obligations: "obligation",
  followUps: "follow-up"
};

let mutationQueue: Promise<void> = Promise.resolve();

export class PersonalOpsStoreError extends Error {
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
    this.name = "PersonalOpsStoreError";
    this.code = code;
    this.status = options.status ?? (code === "not_found" ? 404 : code === "conflict" || code === "stale" ? 409 : 400);
    this.fieldErrors = options.fieldErrors;
  }
}

export type PersonalOpsStoreCreateResult<Family extends PersonalOpsFamily> =
  CreatePersonalOpsResult<Family> & {
    auditEvent?: AuditEvent;
  };

export type PersonalOpsStoreUpdateResult<Family extends PersonalOpsFamily> = {
  item: PersonalOpsObjectByFamily[Family];
  auditEvent: AuditEvent;
};

export type PersonalOpsSecondaryStoreCreateResult<
  Family extends PersonalOpsSecondaryFamily
> = CreatePersonalOpsSecondaryResult<Family> & {
  auditEvent: AuditEvent;
};

export type PersonalOpsSecondaryStoreUpdateResult<
  Family extends PersonalOpsSecondaryFamily
> = {
  item: PersonalOpsSecondaryObjectByFamily[Family];
  auditEvent: AuditEvent;
};

export type PersonalOpsRoutineRunStoreResult = ConfirmRoutineRunResult & {
  auditEvents: AuditEvent[];
};

export type PersonalOpsCaptureProcessingStoreResult = ConfirmCaptureProcessingResult & {
  auditEvents: AuditEvent[];
};

export type PersonalOpsTemplateInstantiationStoreResult = InstantiateTemplateResult & {
  auditEvents: AuditEvent[];
};

function newEmptyState(): PersonalOpsState {
  return {
    schemaVersion: PERSONAL_OPS_SCHEMA_VERSION,
    goals: [],
    decisions: [],
    obligations: [],
    followUps: [],
    routines: [],
    captures: [],
    templates: [],
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
  throw new PersonalOpsStoreError("validation", message, {
    status: 400,
    ...(field ? { fieldErrors: { [field]: [message] } } : {})
  });
}

function requiredText(value: unknown, field: string, maxLength = 4000): string {
  if (typeof value !== "string") validation(`${field} is required`, field);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) validation(`${field} is required`, field);
  if (normalized.length > maxLength) validation(`${field} must be ${maxLength} characters or fewer`, field);
  return normalized;
}

function requiredRawText(value: unknown, field: string, maxLength = 50000): string {
  if (typeof value !== "string" || !value.trim()) validation(`${field} is required`, field);
  if (value.length > maxLength) {
    validation(`${field} must be ${maxLength} characters or fewer`, field);
  }
  if (value.includes("\u0000")) {
    validation(`${field} cannot contain null characters`, field);
  }
  return value;
}

function optionalRawText(value: unknown, field: string, maxLength = 12000): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") validation(`${field} must be text`, field);
  if (!value.trim()) return undefined;
  if (value.length > maxLength) {
    validation(`${field} must be ${maxLength} characters or fewer`, field);
  }
  if (value.includes("\u0000")) {
    validation(`${field} cannot contain null characters`, field);
  }
  return value;
}

function optionalText(value: unknown, field: string, maxLength = 12000): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") validation(`${field} must be text`, field);
  const normalized = value.replace(/\u0000/g, "").trim();
  if (normalized.length > maxLength) validation(`${field} must be ${maxLength} characters or fewer`, field);
  return normalized || undefined;
}

function optionalDate(value: unknown, field: string): string | undefined {
  const normalized = optionalText(value, field, 120);
  if (!normalized) return undefined;
  if (Number.isNaN(Date.parse(normalized))) validation(`${field} must be a valid date or timestamp`, field);
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

function numberValue(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) validation(`${field} must be a finite number`, field);
  return value;
}

function stringList(value: unknown, field: string, limit = 40): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation(`${field} must be a list`, field);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const normalized = requiredText(item, field, 500);
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result.slice(0, limit);
}

function normalizeNativeRef(value: unknown, field: string): NativeObjectRef {
  if (!isRecord(value)) validation(`${field} must be a native object reference`, field);
  const module = requiredText(value.module, `${field}.module`, 40);
  if (!isModuleId(module)) validation(`${field}.module is unsupported`, `${field}.module`);
  const objectType = requiredText(value.objectType, `${field}.objectType`, 80);
  const objectId = requiredText(value.objectId, `${field}.objectId`, 240);
  const containerObjectId = optionalText(
    value.containerObjectId,
    `${field}.containerObjectId`,
    240
  );
  const label = requiredText(value.label, `${field}.label`, 240);
  const versionId = optionalText(value.versionId, `${field}.versionId`, 240);
  return createNativeObjectRef({
    module,
    objectType,
    objectId,
    containerObjectId,
    label,
    versionId
  });
}

function normalizeNativeRefs(value: unknown, field: string): NativeObjectRef[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation(`${field} must be a list`, field);
  const refs = value.map((item, index) => normalizeNativeRef(item, `${field}.${index}`));
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.module}:${ref.objectType}:${ref.containerObjectId || "root"}:${ref.objectId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function optionalNativeRef(value: unknown, field: string): NativeObjectRef | undefined {
  return value === undefined || value === null ? undefined : normalizeNativeRef(value, field);
}

function historyEntry(action: string, occurredAt: string, actorId: string, detail?: string): PersonalOpsHistoryEntry {
  return {
    id: `history-${crypto.randomUUID()}`,
    action,
    occurredAt,
    actorId,
    ...(detail ? { detail } : {})
  };
}

type PersonalOpsAuditableObject = PersonalOpsObject | PersonalOpsSecondaryObject;

function objectRef(item: PersonalOpsAuditableObject): NativeObjectRef {
  return createNativeObjectRef({
    module: "personal_ops",
    objectType: item.objectType,
    objectId: item.id,
    label: item.title
  });
}

function snapshot(value: PersonalOpsAuditableObject | null): AuditSnapshot {
  if (!value) return null;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function moduleAuditEvent(input: {
  item: PersonalOpsAuditableObject;
  action: string;
  actorId: string;
  occurredAt: string;
  before: PersonalOpsAuditableObject | null;
  correlationId?: string;
}): AuditEvent {
  return createAuditEvent({
    id: `audit-${crypto.randomUUID()}`,
    object: objectRef(input.item),
    action: input.action,
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    before: snapshot(input.before),
    after: snapshot(input.item),
    source: "user",
    ...(input.correlationId ? { correlationId: input.correlationId } : {})
  });
}

function monotonicTimestamp(previous: string, candidate: string): string {
  if (candidate > previous) return candidate;
  const previousTime = Date.parse(previous);
  return Number.isNaN(previousTime)
    ? candidate
    : new Date(previousTime + 1).toISOString();
}

function appendModuleAudit(state: PersonalOpsState, event: AuditEvent): AuditEvent[] {
  return appendModuleAudits(state, [event]);
}

function appendModuleAudits(state: PersonalOpsState, events: readonly AuditEvent[]): AuditEvent[] {
  const migrated = (state as MigratedPersonalOpsState)[MIGRATED_FROM_V1] === true;
  const migrationEvent = migrated && events[0]
    ? createAuditEvent({
        id: `audit-${crypto.randomUUID()}`,
        object: createNativeObjectRef({
          module: "personal_ops",
          objectType: "personal_ops_schema",
          objectId: "personal-ops",
          label: "Personal Ops data"
        }),
        action: "personal_ops.schema_migrated_v1_to_v2",
        actorId: events[0].actorId,
        occurredAt: events[0].occurredAt,
        before: { schemaVersion: PERSONAL_OPS_PREVIOUS_SCHEMA_VERSION },
        after: { schemaVersion: PERSONAL_OPS_SCHEMA_VERSION },
        source: "migration"
      })
    : null;
  return [
    ...state.auditEvents,
    ...(migrationEvent ? [migrationEvent] : []),
    ...events
  ].slice(-MAX_MODULE_AUDIT_EVENTS);
}

function withMutationLock<Result>(task: () => Promise<Result>): Promise<Result> {
  const result = mutationQueue.catch(() => undefined).then(task);
  mutationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function assertStateCollections(
  value: Record<string, unknown>,
  keys: readonly string[]
): void {
  for (const key of keys) {
    if (!Array.isArray(value[key])) {
      throw new PersonalOpsStoreError(
        "server",
        `Personal Ops data is malformed: ${key} must be a collection.`,
        { status: 500 }
      );
    }
  }
}

function normalizeState(value: unknown): PersonalOpsState {
  if (!isRecord(value)) {
    throw new PersonalOpsStoreError(
      "server",
      "Personal Ops data is malformed and cannot be read safely.",
      { status: 500 }
    );
  }

  const coreKeys = [
    "goals",
    "decisions",
    "obligations",
    "followUps",
    "auditEvents",
    "legacyMappings"
  ] as const;
  assertStateCollections(value, coreKeys);

  if (value.schemaVersion === PERSONAL_OPS_PREVIOUS_SCHEMA_VERSION) {
    const migrated: MigratedPersonalOpsState = {
      schemaVersion: PERSONAL_OPS_SCHEMA_VERSION,
      goals: value.goals as PersonalOpsGoal[],
      decisions: value.decisions as PersonalOpsDecision[],
      obligations: value.obligations as PersonalOpsObligation[],
      followUps: value.followUps as PersonalOpsFollowUp[],
      routines: [],
      captures: [],
      templates: [],
      auditEvents: value.auditEvents as AuditEvent[],
      legacyMappings: value.legacyMappings as PersonalOpsLegacyMapping[]
    };
    Object.defineProperty(migrated, MIGRATED_FROM_V1, {
      value: true,
      enumerable: false,
      configurable: false
    });
    return migrated;
  }

  if (value.schemaVersion !== PERSONAL_OPS_SCHEMA_VERSION) {
    throw new PersonalOpsStoreError(
      "server",
      "Personal Ops data uses an unsupported schema version. A migration is required before writing.",
      { status: 500 }
    );
  }
  assertStateCollections(value, PERSONAL_OPS_SECONDARY_FAMILIES);
  return value as unknown as PersonalOpsState;
}

export async function readPersonalOpsState(): Promise<PersonalOpsState> {
  const empty = newEmptyState();
  const value = await readJsonFile<unknown>(FILE_NAME, empty);
  return normalizeState(value);
}

function collectionFor<Family extends PersonalOpsFamily>(
  state: PersonalOpsState,
  family: Family
): PersonalOpsObjectByFamily[Family][] {
  return state[family] as PersonalOpsObjectByFamily[Family][];
}

function secondaryCollectionFor<Family extends PersonalOpsSecondaryFamily>(
  state: PersonalOpsState,
  family: Family
): PersonalOpsSecondaryObjectByFamily[Family][] {
  return state[family] as PersonalOpsSecondaryObjectByFamily[Family][];
}

export async function listPersonalOpsObjects<Family extends PersonalOpsFamily>(
  family: Family
): Promise<PersonalOpsObjectByFamily[Family][]> {
  const state = await readPersonalOpsState();
  return [...collectionFor(state, family)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readPersonalOpsObject<Family extends PersonalOpsFamily>(
  family: Family,
  id: string
): Promise<PersonalOpsObjectByFamily[Family] | null> {
  const state = await readPersonalOpsState();
  return collectionFor(state, family).find((item) => item.id === id) ?? null;
}

function commonFromCreate(
  family: PersonalOpsFamily,
  input: Record<string, unknown>,
  now: string,
  actorId: string
): PersonalOpsCommon {
  const objectType = FAMILY_OBJECT_TYPE[family];
  const id = `${FAMILY_ID_PREFIX[family]}-${crypto.randomUUID()}`;
  return {
    id,
    objectType,
    title: requiredText(input.title, "title", 240),
    domain: optionalText(input.domain, "domain", 120) || "Personal Admin",
    description: optionalText(input.description, "description") || "",
    lifecycle: enumValue(input.lifecycle, LIFECYCLE_STATES, "draft", "lifecycle"),
    health: enumValue(input.health, HEALTH_STATES, "unknown", "health"),
    review: enumValue(input.review, REVIEW_STATES, "not_reviewed", "review"),
    cadence: enumValue(input.cadence, CADENCE_STATES, "dormant", "cadence"),
    priority: enumValue(input.priority, PRIORITIES, "medium", "priority"),
    owner: optionalText(input.owner, "owner", 160) || "You",
    dueAt: optionalDate(input.dueAt, "dueAt"),
    cadenceRule: optionalText(input.cadenceRule, "cadenceRule", 160),
    sourceRefs: normalizeNativeRefs(input.sourceRefs, "sourceRefs"),
    linkedRefs: normalizeNativeRefs(input.linkedRefs, "linkedRefs"),
    createdAt: now,
    updatedAt: now,
    history: [historyEntry("created", now, actorId)]
  };
}

function normalizeKeyResults(value: unknown): GoalKeyResult[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation("keyResults must be a list", "keyResults");
  return value.slice(0, 40).map((item, index) => {
    if (!isRecord(item)) validation("Each key result must be an object", `keyResults.${index}`);
    return {
      id: optionalText(item.id, `keyResults.${index}.id`, 240) || `key-result-${crypto.randomUUID()}`,
      title: requiredText(item.title, `keyResults.${index}.title`, 500),
      measure: optionalText(item.measure, `keyResults.${index}.measure`, 500),
      currentValue: numberValue(item.currentValue, `keyResults.${index}.currentValue`),
      targetValue: numberValue(item.targetValue, `keyResults.${index}.targetValue`),
      complete: booleanValue(item.complete, false, `keyResults.${index}.complete`)
    };
  });
}

function normalizeDecisionOptions(value: unknown): DecisionOption[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation("options must be a list", "options");
  return value.slice(0, 30).map((item, index) => {
    if (!isRecord(item)) validation("Each decision option must be an object", `options.${index}`);
    return {
      id: optionalText(item.id, `options.${index}.id`, 240) || `decision-option-${crypto.randomUUID()}`,
      title: requiredText(item.title, `options.${index}.title`, 500),
      pros: stringList(item.pros, `options.${index}.pros`),
      cons: stringList(item.cons, `options.${index}.cons`),
      selected: booleanValue(item.selected, false, `options.${index}.selected`),
      rejectionReason: optionalText(item.rejectionReason, `options.${index}.rejectionReason`, 2000)
    };
  });
}

function normalizeEvidenceRequirements(value: unknown): ObligationEvidenceRequirement[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation("requiredEvidence must be a list", "requiredEvidence");
  return value.slice(0, 60).map((item, index) => {
    if (!isRecord(item)) validation("Each evidence requirement must be an object", `requiredEvidence.${index}`);
    return {
      id:
        optionalText(item.id, `requiredEvidence.${index}.id`, 240) ||
        `evidence-requirement-${crypto.randomUUID()}`,
      label: requiredText(item.label, `requiredEvidence.${index}.label`, 500),
      required: booleanValue(item.required, true, `requiredEvidence.${index}.required`),
      state: enumValue(
        item.state,
        EVIDENCE_STATES,
        "missing",
        `requiredEvidence.${index}.state`
      ),
      evidenceRef: optionalNativeRef(item.evidenceRef, `requiredEvidence.${index}.evidenceRef`)
    };
  });
}

function normalizeCompletionCriteria(value: unknown): ObligationCompletionCriterion[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation("completionCriteria must be a list", "completionCriteria");
  return value.slice(0, 60).map((item, index) => {
    if (!isRecord(item)) validation("Each completion criterion must be an object", `completionCriteria.${index}`);
    return {
      id:
        optionalText(item.id, `completionCriteria.${index}.id`, 240) ||
        `completion-criterion-${crypto.randomUUID()}`,
      label: requiredText(item.label, `completionCriteria.${index}.label`, 500),
      satisfied: booleanValue(item.satisfied, false, `completionCriteria.${index}.satisfied`)
    };
  });
}

function buildGoal(input: GoalCreateInput, now: string, actorId: string): PersonalOpsGoal {
  const raw = input as unknown as Record<string, unknown>;
  const item: PersonalOpsGoal = {
    ...commonFromCreate("goals", raw, now, actorId),
    objectType: "goal",
    outcome: requiredText(raw.outcome, "outcome", 4000),
    targetPeriod: optionalText(raw.targetPeriod, "targetPeriod", 160),
    keyResults: normalizeKeyResults(raw.keyResults)
  };
  validateGoal(item);
  return item;
}

function buildDecision(input: DecisionCreateInput, now: string, actorId: string): PersonalOpsDecision {
  const raw = input as unknown as Record<string, unknown>;
  const decisionState = enumValue(raw.decisionState, DECISION_STATES, "open", "decisionState");
  const item: PersonalOpsDecision = {
    ...commonFromCreate("decisions", raw, now, actorId),
    objectType: "decision",
    decisionState,
    question: requiredText(raw.question, "question", 4000),
    finalDecision: optionalText(raw.finalDecision, "finalDecision"),
    rationale: optionalText(raw.rationale, "rationale"),
    deferReason: optionalText(raw.deferReason, "deferReason", 4000),
    revisitAt: optionalDate(raw.revisitAt, "revisitAt"),
    supersededBy: optionalNativeRef(raw.supersededBy, "supersededBy"),
    reversibility: enumValue(raw.reversibility, REVERSIBILITY_STATES, "unknown", "reversibility"),
    risk: enumValue(raw.risk, DECISION_RISKS, "unknown", "risk"),
    options: normalizeDecisionOptions(raw.options)
  };
  synchronizeDecision(item);
  validateDecision(item);
  return item;
}

function buildObligation(input: ObligationCreateInput, now: string, actorId: string): PersonalOpsObligation {
  const raw = input as unknown as Record<string, unknown>;
  const item: PersonalOpsObligation = {
    ...commonFromCreate("obligations", raw, now, actorId),
    objectType: "obligation",
    obligationState: enumValue(raw.obligationState, OBLIGATION_STATES, "open", "obligationState"),
    consequence: requiredText(raw.consequence, "consequence", 4000),
    requiredEvidence: normalizeEvidenceRequirements(raw.requiredEvidence),
    completionCriteria: normalizeCompletionCriteria(raw.completionCriteria),
    completionNote: optionalText(raw.completionNote, "completionNote", 4000)
  };
  synchronizeObligation(item);
  validateObligation(item);
  return item;
}

function buildFollowUp(input: FollowUpCreateInput, now: string, actorId: string): PersonalOpsFollowUp {
  const raw = input as unknown as Record<string, unknown>;
  const item: PersonalOpsFollowUp = {
    ...commonFromCreate("followUps", raw, now, actorId),
    objectType: "follow_up",
    followUpState: enumValue(raw.followUpState, FOLLOW_UP_STATES, "open", "followUpState"),
    followUpType: enumValue(raw.followUpType, FOLLOW_UP_TYPES, "other", "followUpType"),
    context: optionalText(raw.context, "context") || "",
    outcome: optionalText(raw.outcome, "outcome", 6000),
    deferReason: optionalText(raw.deferReason, "deferReason", 4000),
    deferredUntil: optionalDate(raw.deferredUntil, "deferredUntil"),
    completionCriteria: optionalText(raw.completionCriteria, "completionCriteria", 4000)
  };
  synchronizeFollowUp(item);
  validateFollowUp(item);
  return item;
}

function validateGoal(item: PersonalOpsGoal): void {
  if (!item.outcome) validation("outcome is required", "outcome");
  if (item.lifecycle === "complete" && item.keyResults.some((result) => !result.complete)) {
    validation("Complete every key result before completing the goal", "keyResults");
  }
}

function synchronizeDecision(item: PersonalOpsDecision): void {
  if (item.lifecycle === "archived") return;
  if (item.decisionState === "decided" || item.decisionState === "superseded") {
    item.lifecycle = "complete";
  }
  if (item.decisionState === "deferred" && item.lifecycle === "complete") {
    item.lifecycle = "active";
  }
}

function validateDecision(item: PersonalOpsDecision): void {
  if (item.lifecycle === "complete" && item.decisionState !== "decided" && item.decisionState !== "superseded") {
    validation("Only a decided or superseded Decision can be complete", "decisionState");
  }
  if (item.decisionState === "decided") {
    if (!item.finalDecision) validation("A final decision is required before marking decided", "finalDecision");
    if (!item.rationale) validation("Rationale is required before marking decided", "rationale");
  }
  if (item.decisionState === "deferred") {
    if (!item.deferReason) validation("A defer reason is required", "deferReason");
    if (!item.revisitAt) validation("A revisit date is required when deferring", "revisitAt");
  }
  if (item.decisionState === "superseded" && !item.supersededBy) {
    validation("A replacement Decision is required when superseding", "supersededBy");
  }
}

function synchronizeObligation(item: PersonalOpsObligation): void {
  if (item.lifecycle === "archived") return;
  if (item.obligationState === "complete") item.lifecycle = "complete";
  if (item.lifecycle === "complete") item.obligationState = "complete";
  if (item.obligationState === "blocked") item.health = "blocked";
}

function validateObligation(item: PersonalOpsObligation): void {
  if (item.obligationState !== "complete") return;
  const missingEvidence = item.requiredEvidence.filter(
    (requirement) => requirement.required && requirement.state === "missing"
  );
  if (missingEvidence.length > 0) {
    validation("Required evidence must be received, verified, or marked not applicable", "requiredEvidence");
  }
  if (item.completionCriteria.length === 0) {
    validation("At least one completion criterion is required before completing an obligation", "completionCriteria");
  }
  if (item.completionCriteria.some((criterion) => !criterion.satisfied)) {
    validation("Every completion criterion must be satisfied before completing", "completionCriteria");
  }
}

function synchronizeFollowUp(item: PersonalOpsFollowUp): void {
  if (item.lifecycle === "archived") return;
  if (item.followUpState === "complete") item.lifecycle = "complete";
  if (item.lifecycle === "complete") item.followUpState = "complete";
}

function validateFollowUp(item: PersonalOpsFollowUp): void {
  if (item.followUpState === "deferred") {
    if (!item.deferReason) validation("A defer reason is required", "deferReason");
    if (!item.deferredUntil) validation("A new date is required when deferring", "deferredUntil");
  }
  if (item.followUpState !== "complete") return;
  const outcomeRequired =
    item.priority === "high" ||
    item.priority === "critical" ||
    [...item.sourceRefs, ...item.linkedRefs].some(
      (ref) => ref.module === "people" || ref.module === "reviews"
    );
  if (outcomeRequired && !item.outcome) {
    validation(
      "An outcome is required to complete a high-priority, People-linked, or Review-linked follow-up",
      "outcome"
    );
  }
}

function buildByFamily<Family extends PersonalOpsFamily>(
  family: Family,
  input: PersonalOpsCreateInputByFamily[Family],
  now: string,
  actorId: string
): PersonalOpsObjectByFamily[Family] {
  let item: PersonalOpsObject;
  if (family === "goals") item = buildGoal(input as GoalCreateInput, now, actorId);
  else if (family === "decisions") item = buildDecision(input as DecisionCreateInput, now, actorId);
  else if (family === "obligations") item = buildObligation(input as ObligationCreateInput, now, actorId);
  else item = buildFollowUp(input as FollowUpCreateInput, now, actorId);
  return item as PersonalOpsObjectByFamily[Family];
}

function normalizeLegacyRecord(value: unknown): LegacyPersonalRecordDescriptor {
  if (!isRecord(value)) validation("legacySource.record must be an object", "legacySource.record");
  return {
    id: requiredText(value.id, "legacySource.record.id", 240),
    domain: requiredText(value.domain, "legacySource.record.domain", 160),
    className: requiredText(value.className, "legacySource.record.className", 120),
    status: requiredText(value.status, "legacySource.record.status", 120),
    title: requiredText(value.title, "legacySource.record.title", 240),
    createdAt: optionalDate(value.createdAt, "legacySource.record.createdAt"),
    updatedAt: optionalDate(value.updatedAt, "legacySource.record.updatedAt")
  };
}

function normalizeLegacySource(
  value: unknown,
  family: PersonalOpsFamily
): { source: LegacyConversionSource; conversionKey: string } | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) validation("legacySource must be an object", "legacySource");
  if (value.conversionConfirmed !== true) {
    validation("Explicit conversion confirmation is required", "legacySource.conversionConfirmed");
  }
  const record = normalizeLegacyRecord(value.record);
  const candidate = classifyLegacyPersonalRecord(record);
  if (!candidate.allowedConversions.includes(family)) {
    validation(
      `${candidate.currentOwner} owns this legacy record; it cannot be auto-promoted to ${family}`,
      "legacySource"
    );
  }
  const conversionKey = optionalText(value.conversionKey, "legacySource.conversionKey", 160) || family;
  return {
    source: { record, conversionConfirmed: true, conversionKey },
    conversionKey
  };
}

function withLegacySourceRef<Item extends PersonalOpsObject>(
  item: Item,
  legacy: ReturnType<typeof normalizeLegacySource>
): Item {
  if (!legacy) return item;
  const ref = getLegacySourceRef(legacy.source.record);
  const exists = item.sourceRefs.some(
    (existing) =>
      existing.module === ref.module &&
      existing.objectType === ref.objectType &&
      existing.objectId === ref.objectId
  );
  return exists ? item : { ...item, sourceRefs: [...item.sourceRefs, ref] };
}

function createMapping(
  family: PersonalOpsFamily,
  item: PersonalOpsObject,
  legacy: NonNullable<ReturnType<typeof normalizeLegacySource>>,
  now: string,
  actorId: string
): PersonalOpsLegacyMapping {
  return {
    id: `legacy-mapping-${crypto.randomUUID()}`,
    legacyPersonalRecordId: legacy.source.record.id,
    conversionKey: legacy.conversionKey,
    family,
    nativeRef: objectRef(item),
    source: { ...legacy.source.record },
    convertedAt: now,
    convertedBy: actorId
  };
}

function findMappedObject(
  state: PersonalOpsState,
  mapping: PersonalOpsLegacyMapping
): PersonalOpsObject | null {
  const collection = state[mapping.family] as PersonalOpsObject[];
  return collection.find((item) => item.id === mapping.nativeRef.objectId) ?? null;
}

export async function createPersonalOpsObject<Family extends PersonalOpsFamily>(
  family: Family,
  input: PersonalOpsCreateInputByFamily[Family],
  options: { actorId?: string; now?: Date } = {}
): Promise<PersonalOpsStoreCreateResult<Family>> {
  if (!PERSONAL_OPS_FAMILIES.includes(family)) {
    validation("Unsupported Personal Ops family", "family");
  }
  const actorId = options.actorId || "admin";
  const now = (options.now || new Date()).toISOString();

  return withMutationLock(async () => {
    const state = await readPersonalOpsState();
    const rawInput = input as unknown as Record<string, unknown>;
    const legacy = normalizeLegacySource(rawInput.legacySource, family);

    if (legacy) {
      const existingMapping = findLegacyMapping(
        state,
        legacy.source.record.id,
        legacy.conversionKey
      );
      if (existingMapping) {
        if (existingMapping.family !== family) {
          throw new PersonalOpsStoreError(
            "conflict",
            "This legacy conversion key already maps to another native object family.",
            { status: 409 }
          );
        }
        const mapped = findMappedObject(state, existingMapping);
        if (!mapped) {
          throw new PersonalOpsStoreError(
            "conflict",
            "The legacy mapping points to a missing native object and must be repaired.",
            { status: 409 }
          );
        }
        return {
          item: mapped as PersonalOpsObjectByFamily[Family],
          created: false,
          mapping: existingMapping
        };
      }
    }

    const built = buildByFamily(family, input, now, actorId);
    const item = withLegacySourceRef(built, legacy);
    const mapping = legacy ? createMapping(family, item, legacy, now, actorId) : undefined;
    const action = mapping ? `${item.objectType}.converted_from_legacy` : `${item.objectType}.created`;
    const auditEvent = moduleAuditEvent({ item, action, actorId, occurredAt: now, before: null });
    const nextState: PersonalOpsState = {
      ...state,
      [family]: [item, ...collectionFor(state, family)],
      auditEvents: appendModuleAudit(state, auditEvent),
      legacyMappings: mapping ? [...state.legacyMappings, mapping] : state.legacyMappings
    };
    await writeJsonFile(FILE_NAME, nextState);
    return {
      item,
      created: true,
      ...(mapping ? { mapping } : {}),
      auditEvent
    };
  });
}

function applyCommonPatch<Item extends PersonalOpsCommon>(
  current: Item,
  patch: Record<string, unknown>,
  now: string
): Item {
  const next = { ...current } as Item;
  if (hasOwn(patch, "title")) next.title = requiredText(patch.title, "title", 240);
  if (hasOwn(patch, "domain")) next.domain = requiredText(patch.domain, "domain", 120);
  if (hasOwn(patch, "description")) next.description = optionalText(patch.description, "description") || "";
  if (hasOwn(patch, "lifecycle")) {
    next.lifecycle = enumValue(patch.lifecycle, LIFECYCLE_STATES, current.lifecycle, "lifecycle");
  }
  if (hasOwn(patch, "health")) next.health = enumValue(patch.health, HEALTH_STATES, current.health, "health");
  if (hasOwn(patch, "review")) next.review = enumValue(patch.review, REVIEW_STATES, current.review, "review");
  if (hasOwn(patch, "cadence")) next.cadence = enumValue(patch.cadence, CADENCE_STATES, current.cadence, "cadence");
  if (hasOwn(patch, "priority")) {
    next.priority = enumValue(patch.priority, PRIORITIES, current.priority, "priority");
  }
  if (hasOwn(patch, "owner")) next.owner = requiredText(patch.owner, "owner", 160);
  if (hasOwn(patch, "dueAt")) next.dueAt = optionalDate(patch.dueAt, "dueAt");
  if (hasOwn(patch, "cadenceRule")) {
    next.cadenceRule = optionalText(patch.cadenceRule, "cadenceRule", 160);
  }
  if (hasOwn(patch, "sourceRefs")) next.sourceRefs = normalizeNativeRefs(patch.sourceRefs, "sourceRefs");
  if (hasOwn(patch, "linkedRefs")) next.linkedRefs = normalizeNativeRefs(patch.linkedRefs, "linkedRefs");

  if (current.lifecycle !== "archived" && next.lifecycle === "archived") {
    const archiveReason = requiredText(patch.archiveReason, "archiveReason", 2000);
    next.archivedAt = now;
    next.archiveReason = archiveReason;
  } else if (current.lifecycle === "archived" && next.lifecycle !== "archived") {
    next.archivedAt = undefined;
    next.archiveReason = undefined;
  }
  return next;
}

function updateGoal(
  current: PersonalOpsGoal,
  patch: Record<string, unknown>,
  now: string
): PersonalOpsGoal {
  const next = applyCommonPatch(current, patch, now);
  if (hasOwn(patch, "outcome")) next.outcome = requiredText(patch.outcome, "outcome", 4000);
  if (hasOwn(patch, "targetPeriod")) {
    next.targetPeriod = optionalText(patch.targetPeriod, "targetPeriod", 160);
  }
  if (hasOwn(patch, "keyResults")) next.keyResults = normalizeKeyResults(patch.keyResults);
  validateGoal(next);
  return next;
}

function updateDecision(
  current: PersonalOpsDecision,
  patch: Record<string, unknown>,
  now: string
): PersonalOpsDecision {
  const next = applyCommonPatch(current, patch, now);
  if (hasOwn(patch, "question")) next.question = requiredText(patch.question, "question", 4000);
  if (hasOwn(patch, "decisionState")) {
    next.decisionState = enumValue(
      patch.decisionState,
      DECISION_STATES,
      current.decisionState,
      "decisionState"
    );
  }
  if (hasOwn(patch, "finalDecision")) {
    next.finalDecision = optionalText(patch.finalDecision, "finalDecision");
  }
  if (hasOwn(patch, "rationale")) next.rationale = optionalText(patch.rationale, "rationale");
  if (hasOwn(patch, "deferReason")) {
    next.deferReason = optionalText(patch.deferReason, "deferReason", 4000);
  }
  if (hasOwn(patch, "revisitAt")) next.revisitAt = optionalDate(patch.revisitAt, "revisitAt");
  if (hasOwn(patch, "supersededBy")) {
    next.supersededBy = optionalNativeRef(patch.supersededBy, "supersededBy");
  }
  if (hasOwn(patch, "reversibility")) {
    next.reversibility = enumValue(
      patch.reversibility,
      REVERSIBILITY_STATES,
      current.reversibility,
      "reversibility"
    );
  }
  if (hasOwn(patch, "risk")) next.risk = enumValue(patch.risk, DECISION_RISKS, current.risk, "risk");
  if (hasOwn(patch, "options")) next.options = normalizeDecisionOptions(patch.options);
  synchronizeDecision(next);
  validateDecision(next);
  return next;
}

function updateObligation(
  current: PersonalOpsObligation,
  patch: Record<string, unknown>,
  now: string
): PersonalOpsObligation {
  const next = applyCommonPatch(current, patch, now);
  if (hasOwn(patch, "obligationState")) {
    next.obligationState = enumValue(
      patch.obligationState,
      OBLIGATION_STATES,
      current.obligationState,
      "obligationState"
    );
  }
  if (hasOwn(patch, "consequence")) {
    next.consequence = requiredText(patch.consequence, "consequence", 4000);
  }
  if (hasOwn(patch, "requiredEvidence")) {
    next.requiredEvidence = normalizeEvidenceRequirements(patch.requiredEvidence);
  }
  if (hasOwn(patch, "completionCriteria")) {
    next.completionCriteria = normalizeCompletionCriteria(patch.completionCriteria);
  }
  if (hasOwn(patch, "completionNote")) {
    next.completionNote = optionalText(patch.completionNote, "completionNote", 4000);
  }
  synchronizeObligation(next);
  validateObligation(next);
  return next;
}

function updateFollowUp(
  current: PersonalOpsFollowUp,
  patch: Record<string, unknown>,
  now: string
): PersonalOpsFollowUp {
  const next = applyCommonPatch(current, patch, now);
  if (hasOwn(patch, "followUpState")) {
    next.followUpState = enumValue(
      patch.followUpState,
      FOLLOW_UP_STATES,
      current.followUpState,
      "followUpState"
    );
  }
  if (hasOwn(patch, "followUpType")) {
    next.followUpType = enumValue(
      patch.followUpType,
      FOLLOW_UP_TYPES,
      current.followUpType,
      "followUpType"
    );
  }
  if (hasOwn(patch, "context")) next.context = optionalText(patch.context, "context") || "";
  if (hasOwn(patch, "outcome")) next.outcome = optionalText(patch.outcome, "outcome", 6000);
  if (hasOwn(patch, "deferReason")) {
    next.deferReason = optionalText(patch.deferReason, "deferReason", 4000);
  }
  if (hasOwn(patch, "deferredUntil")) {
    next.deferredUntil = optionalDate(patch.deferredUntil, "deferredUntil");
  }
  if (hasOwn(patch, "completionCriteria")) {
    next.completionCriteria = optionalText(patch.completionCriteria, "completionCriteria", 4000);
  }
  synchronizeFollowUp(next);
  validateFollowUp(next);
  return next;
}

function updatedByFamily<Family extends PersonalOpsFamily>(
  family: Family,
  current: PersonalOpsObjectByFamily[Family],
  patch: PersonalOpsUpdateInputByFamily[Family],
  now: string
): PersonalOpsObjectByFamily[Family] {
  const raw = patch as unknown as Record<string, unknown>;
  let item: PersonalOpsObject;
  if (family === "goals") item = updateGoal(current as PersonalOpsGoal, raw, now);
  else if (family === "decisions") item = updateDecision(current as PersonalOpsDecision, raw, now);
  else if (family === "obligations") item = updateObligation(current as PersonalOpsObligation, raw, now);
  else item = updateFollowUp(current as PersonalOpsFollowUp, raw, now);
  return item as PersonalOpsObjectByFamily[Family];
}

function updateAction(before: PersonalOpsObject, after: PersonalOpsObject): string {
  if (before.lifecycle !== "archived" && after.lifecycle === "archived") return `${after.objectType}.archived`;
  if (before.lifecycle === "archived" && after.lifecycle !== "archived") return `${after.objectType}.restored`;
  if (before.lifecycle !== "complete" && after.lifecycle === "complete") return `${after.objectType}.completed`;
  if (
    after.objectType === "decision" &&
    before.objectType === "decision" &&
    before.decisionState !== "deferred" &&
    after.decisionState === "deferred"
  ) return "decision.deferred";
  if (
    after.objectType === "decision" &&
    before.objectType === "decision" &&
    before.decisionState !== "superseded" &&
    after.decisionState === "superseded"
  ) return "decision.superseded";
  if (
    after.objectType === "follow_up" &&
    before.objectType === "follow_up" &&
    before.followUpState !== "deferred" &&
    after.followUpState === "deferred"
  ) return "follow_up.deferred";
  return `${after.objectType}.updated`;
}

function historyDetail(item: PersonalOpsObject, action: string): string | undefined {
  if (action.endsWith(".archived")) return item.archiveReason;
  if (item.objectType === "decision" && action === "decision.deferred") return item.deferReason;
  if (item.objectType === "follow_up" && action === "follow_up.deferred") return item.deferReason;
  if (item.objectType === "follow_up" && action.endsWith(".completed")) return item.outcome;
  if (item.objectType === "obligation" && action.endsWith(".completed")) return item.completionNote;
  return undefined;
}

export async function updatePersonalOpsObject<Family extends PersonalOpsFamily>(
  family: Family,
  id: string,
  patch: PersonalOpsUpdateInputByFamily[Family],
  options: { expectedUpdatedAt: string; actorId?: string; now?: Date }
): Promise<PersonalOpsStoreUpdateResult<Family>> {
  if (!PERSONAL_OPS_FAMILIES.includes(family)) {
    validation("Unsupported Personal Ops family", "family");
  }
  const cleanId = requiredText(id, "id", 240);
  const expectedUpdatedAt = requiredText(options.expectedUpdatedAt, "expectedUpdatedAt", 120);
  const actorId = options.actorId || "admin";
  const requestedAt = options.now?.toISOString();

  return withMutationLock(async () => {
    const state = await readPersonalOpsState();
    const collection = collectionFor(state, family);
    const index = collection.findIndex((item) => item.id === cleanId);
    if (index === -1) {
      throw new PersonalOpsStoreError("not_found", "Personal Ops object not found", { status: 404 });
    }
    const current = collection[index];
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new PersonalOpsStoreError(
        "stale",
        "This object changed after it was opened. Refresh before saving so newer work is not overwritten.",
        { status: 409 }
      );
    }

    const now = monotonicTimestamp(current.updatedAt, requestedAt || new Date().toISOString());
    const changed = updatedByFamily(family, current, patch, now);
    const action = updateAction(current, changed);
    const item = {
      ...changed,
      updatedAt: now,
      history: [
        ...current.history,
        historyEntry(action, now, actorId, historyDetail(changed, action))
      ]
    } as PersonalOpsObjectByFamily[Family];
    const auditEvent = moduleAuditEvent({
      item,
      action,
      actorId,
      occurredAt: now,
      before: current
    });
    const nextCollection = collection.map((existing, currentIndex) =>
      currentIndex === index ? item : existing
    );
    const nextState: PersonalOpsState = {
      ...state,
      [family]: nextCollection,
      auditEvents: appendModuleAudit(state, auditEvent)
    };
    await writeJsonFile(FILE_NAME, nextState);
    return { item, auditEvent };
  });
}

function positiveInteger(value: unknown, field: string, fallback: number, maximum = 365): number {
  if (value === undefined || value === null || value === "") return fallback;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    validation(`${field} must be a whole number between 0 and ${maximum}`, field);
  }
  return value as number;
}

function isCoreFamily(value: unknown): value is PersonalOpsFamily {
  return typeof value === "string" && PERSONAL_OPS_FAMILIES.includes(value as PersonalOpsFamily);
}

function normalizeDestination(value: unknown, field: string): PersonalOpsDestinationDraft {
  if (!isRecord(value)) validation(`${field} must be a destination`, field);
  const module = requiredText(value.module, `${field}.module`, 40);
  if (!isModuleId(module)) validation(`${field}.module is unsupported`, `${field}.module`);

  if (module === "personal_ops") {
    if (!isCoreFamily(value.family)) {
      validation(`${field}.family must be a core Personal Ops family`, `${field}.family`);
    }
    if (!isRecord(value.input)) validation(`${field}.input must be an object`, `${field}.input`);
    if (hasOwn(value.input, "legacySource")) {
      validation(
        `${field}.input cannot perform a legacy conversion`,
        `${field}.input.legacySource`
      );
    }
    return {
      module: "personal_ops",
      family: value.family,
      input: structuredClone(value.input) as PersonalOpsCreateInputByFamily[typeof value.family]
    } as PersonalOpsCoreDestinationDraft;
  }

  return {
    module,
    objectType: requiredText(value.objectType, `${field}.objectType`, 100),
    label: requiredText(value.label, `${field}.label`, 240)
  } as PersonalOpsDestinationDraft;
}

function normalizeRoutineCadenceRule(value: unknown, field: string): RoutineCadenceRule {
  if (!isRecord(value)) validation(`${field} must be an object`, field);
  const interval = positiveInteger(value.interval, `${field}.interval`, 1, 365);
  if (interval < 1) {
    validation(`${field}.interval must be at least 1`, `${field}.interval`);
  }
  const weekdays = value.weekdays === undefined
    ? []
    : (() => {
        if (!Array.isArray(value.weekdays)) validation(`${field}.weekdays must be a list`, `${field}.weekdays`);
        return [...new Set(value.weekdays.map((weekday, index) => {
          if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
            validation(`${field}.weekdays.${index} must be between 0 and 6`, `${field}.weekdays.${index}`);
          }
          return weekday;
        }))].sort((left, right) => left - right);
      })();
  if (value.autoCreateNext !== undefined && value.autoCreateNext !== false) {
    validation(
      "Automatic routine creation is not available; runs require an explicit preview and confirmation",
      `${field}.autoCreateNext`
    );
  }
  return {
    frequency: enumValue(value.frequency, ROUTINE_FREQUENCIES, "weekly", `${field}.frequency`),
    interval,
    label: optionalText(value.label, `${field}.label`, 240),
    timezone: optionalText(value.timezone, `${field}.timezone`, 120) || "America/New_York",
    anchorDate: optionalDate(value.anchorDate, `${field}.anchorDate`),
    weekdays,
    reminderWindowDays: positiveInteger(
      value.reminderWindowDays,
      `${field}.reminderWindowDays`,
      3,
      90
    ),
    trigger: enumValue(value.trigger, ROUTINE_TRIGGERS, "manual", `${field}.trigger`),
    skipBehavior: enumValue(
      value.skipBehavior,
      ["skip_occurrence", "move_to_next_window", "require_decision"] as const,
      "require_decision",
      `${field}.skipBehavior`
    ),
    autoCreateNext: false
  };
}

function normalizeGenerationRules(value: unknown, field: string): RoutineGenerationRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation(`${field} must be a list`, field);
  const seen = new Set<string>();
  return value.slice(0, 40).map((raw, index) => {
    if (!isRecord(raw)) validation(`${field}.${index} must be an object`, `${field}.${index}`);
    const id = optionalText(raw.id, `${field}.${index}.id`, 240) || `generation-rule-${crypto.randomUUID()}`;
    if (seen.has(id)) validation(`${field} contains duplicate ids`, `${field}.${index}.id`);
    seen.add(id);
    return {
      id,
      label: requiredText(raw.label, `${field}.${index}.label`, 240),
      enabled: booleanValue(raw.enabled, true, `${field}.${index}.enabled`),
      destination: normalizeDestination(raw.destination, `${field}.${index}.destination`),
      conditions: stringList(raw.conditions, `${field}.${index}.conditions`, 20)
    };
  });
}

function normalizeCaptureSource(value: unknown, now: string): CaptureSource {
  const raw = isRecord(value) ? value : {};
  const kind = enumValue(
    raw.kind,
    ["quick_capture", "manual", "import", "linked_object"] as const,
    "quick_capture",
    "source.kind"
  );
  const sourceRef = optionalNativeRef(raw.sourceRef, "source.sourceRef");
  if (kind === "linked_object" && !sourceRef) {
    validation("A linked-object capture source requires a source reference", "source.sourceRef");
  }
  return {
    kind,
    label: optionalText(raw.label, "source.label", 240) || "Personal Ops capture",
    capturedAt: optionalDate(raw.capturedAt, "source.capturedAt") || now,
    sourceRef
  };
}

function normalizeCaptureSuggestions(value: unknown): CaptureSuggestion[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation("suggestions must be a list", "suggestions");
  return value.slice(0, 40).map((raw, index) => {
    if (!isRecord(raw)) validation(`suggestions.${index} must be an object`, `suggestions.${index}`);
    const destinationModuleValue = optionalText(
      raw.destinationModule,
      `suggestions.${index}.destinationModule`,
      40
    );
    if (destinationModuleValue && !isModuleId(destinationModuleValue)) {
      validation(
        `suggestions.${index}.destinationModule is unsupported`,
        `suggestions.${index}.destinationModule`
      );
    }
    const destinationModule = destinationModuleValue as CaptureSuggestion["destinationModule"];
    const destinationFamilyValue = optionalText(
      raw.destinationFamily,
      `suggestions.${index}.destinationFamily`,
      40
    );
    if (destinationFamilyValue && !isCoreFamily(destinationFamilyValue)) {
      validation(
        `suggestions.${index}.destinationFamily is unsupported`,
        `suggestions.${index}.destinationFamily`
      );
    }
    const destinationFamily = destinationFamilyValue as CaptureSuggestion["destinationFamily"];
    return {
      id: optionalText(raw.id, `suggestions.${index}.id`, 240) || `capture-suggestion-${crypto.randomUUID()}`,
      kind: enumValue(
        raw.kind,
        ["destination", "title", "domain", "split"] as const,
        "destination",
        `suggestions.${index}.kind`
      ),
      label: requiredText(raw.label, `suggestions.${index}.label`, 500),
      state: enumValue(
        raw.state,
        ["proposed", "accepted", "rejected"] as const,
        "proposed",
        `suggestions.${index}.state`
      ),
      ...(destinationModule ? { destinationModule } : {}),
      ...(destinationFamily ? { destinationFamily } : {}),
      explanation: optionalText(raw.explanation, `suggestions.${index}.explanation`, 2000)
    };
  });
}

function normalizeTemplateFields(value: unknown): TemplateField[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation("fields must be a list", "fields");
  const seen = new Set<string>();
  return value.slice(0, 60).map((raw, index) => {
    if (!isRecord(raw)) validation(`fields.${index} must be an object`, `fields.${index}`);
    const key = requiredText(raw.key, `fields.${index}.key`, 120);
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      validation(`fields.${index}.key must use lower-case letters, numbers, and underscores`, `fields.${index}.key`);
    }
    if (seen.has(key)) validation("Template field keys must be unique", `fields.${index}.key`);
    seen.add(key);
    const defaultValue = normalizeTemplateFieldValue(raw.defaultValue, `fields.${index}.defaultValue`);
    const type = enumValue(
      raw.type,
      ["short_text", "long_text", "number", "date", "boolean", "select"] as const,
      "short_text",
      `fields.${index}.type`
    );
    const options = stringList(raw.options, `fields.${index}.options`, 50);
    if (type === "select" && options.length === 0) {
      validation(`fields.${index}.options needs at least one choice`, `fields.${index}.options`);
    }
    if (defaultValue !== undefined) {
      if (type === "number" && typeof defaultValue !== "number") {
        validation(`fields.${index}.defaultValue must be a number`, `fields.${index}.defaultValue`);
      }
      if (type === "boolean" && typeof defaultValue !== "boolean") {
        validation(`fields.${index}.defaultValue must be true or false`, `fields.${index}.defaultValue`);
      }
      if (type === "date" && (typeof defaultValue !== "string" || Number.isNaN(Date.parse(defaultValue)))) {
        validation(`fields.${index}.defaultValue must be a valid date`, `fields.${index}.defaultValue`);
      }
      if (type === "select" && (typeof defaultValue !== "string" || !options.includes(defaultValue))) {
        validation(`fields.${index}.defaultValue must be one of the field options`, `fields.${index}.defaultValue`);
      }
    }
    return {
      id: optionalText(raw.id, `fields.${index}.id`, 240) || `template-field-${crypto.randomUUID()}`,
      key,
      label: requiredText(raw.label, `fields.${index}.label`, 240),
      type,
      required: booleanValue(raw.required, false, `fields.${index}.required`),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      options,
      helpText: optionalText(raw.helpText, `fields.${index}.helpText`, 1000)
    };
  });
}

function normalizeTemplateFieldValue(value: unknown, field: string): TemplateFieldValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  validation(`${field} must be text, a number, true or false, or null`, field);
}

function normalizeTemplateRules(value: unknown): TemplateRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation("rules must be a list", "rules");
  return value.slice(0, 40).map((raw, index) => {
    if (!isRecord(raw)) validation(`rules.${index} must be an object`, `rules.${index}`);
    const when = enumValue(
      raw.when,
      ["always", "field_equals", "field_present"] as const,
      "always",
      `rules.${index}.when`
    );
    const fieldKey = optionalText(raw.fieldKey, `rules.${index}.fieldKey`, 120);
    if (when !== "always" && !fieldKey) {
      validation(`rules.${index}.fieldKey is required for this rule`, `rules.${index}.fieldKey`);
    }
    return {
      id: optionalText(raw.id, `rules.${index}.id`, 240) || `template-rule-${crypto.randomUUID()}`,
      label: requiredText(raw.label, `rules.${index}.label`, 240),
      enabled: booleanValue(raw.enabled, true, `rules.${index}.enabled`),
      when,
      ...(fieldKey ? { fieldKey } : {}),
      ...(hasOwn(raw, "expectedValue")
        ? { expectedValue: normalizeTemplateFieldValue(raw.expectedValue, `rules.${index}.expectedValue`) ?? null }
        : {}),
      explanation: optionalText(raw.explanation, `rules.${index}.explanation`, 2000)
    };
  });
}

function normalizeTemplateDefinitions(value: unknown): TemplateGeneratedDefinition[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation("generatedDefinitions must be a list", "generatedDefinitions");
  const seen = new Set<string>();
  return value.slice(0, 30).map((raw, index) => {
    if (!isRecord(raw)) {
      validation(`generatedDefinitions.${index} must be an object`, `generatedDefinitions.${index}`);
    }
    const id = optionalText(raw.id, `generatedDefinitions.${index}.id`, 240) || `template-definition-${crypto.randomUUID()}`;
    if (seen.has(id)) {
      validation("Generated definition ids must be unique", `generatedDefinitions.${index}.id`);
    }
    seen.add(id);
    return {
      id,
      label: requiredText(raw.label, `generatedDefinitions.${index}.label`, 240),
      enabled: booleanValue(raw.enabled, true, `generatedDefinitions.${index}.enabled`),
      destination: normalizeDestination(raw.destination, `generatedDefinitions.${index}.destination`)
    };
  });
}

function buildRoutine(input: RoutineCreateInput, now: string, actorId: string): PersonalOpsRoutine {
  const raw = input as unknown as Record<string, unknown>;
  const item: PersonalOpsRoutine = {
    id: `${SECONDARY_ID_PREFIX.routines}-${crypto.randomUUID()}`,
    objectType: "routine",
    title: requiredText(raw.title, "title", 240),
    summary: optionalText(raw.summary, "summary", 6000) || "",
    domain: optionalText(raw.domain, "domain", 120) || "Personal Admin",
    owner: optionalText(raw.owner, "owner", 160) || "You",
    lifecycle: enumValue(raw.lifecycle, ROUTINE_LIFECYCLE_STATES, "draft", "lifecycle"),
    health: enumValue(raw.health, HEALTH_STATES, "unknown", "health"),
    review: enumValue(raw.review, REVIEW_STATES, "not_reviewed", "review"),
    cadence: enumValue(raw.cadence, CADENCE_STATES, "dormant", "cadence"),
    priority: enumValue(raw.priority, PRIORITIES, "medium", "priority"),
    cadenceRule: normalizeRoutineCadenceRule(raw.cadenceRule, "cadenceRule"),
    generationRules: normalizeGenerationRules(raw.generationRules, "generationRules"),
    completionCriteria: stringList(raw.completionCriteria, "completionCriteria", 40),
    linkedRefs: normalizeNativeRefs(raw.linkedRefs, "linkedRefs"),
    nextRunAt: optionalDate(raw.nextRunAt, "nextRunAt"),
    runHistory: [],
    createdAt: now,
    updatedAt: now,
    history: [historyEntry("routine.created", now, actorId)]
  };
  validateRoutine(item, now, actorId);
  return item;
}

function buildCapture(input: CaptureCreateInput, now: string, actorId: string): PersonalOpsCaptureItem {
  const raw = input as unknown as Record<string, unknown>;
  const rawText = requiredRawText(raw.rawText, "rawText", 50000);
  const title =
    optionalText(raw.title, "title", 240) ||
    rawText.trim().replace(/\s+/g, " ").slice(0, 120);
  const item: PersonalOpsCaptureItem = {
    id: `${SECONDARY_ID_PREFIX.captures}-${crypto.randomUUID()}`,
    objectType: "capture_item",
    title,
    rawText,
    domain: optionalText(raw.domain, "domain", 120) || "Personal Admin",
    owner: optionalText(raw.owner, "owner", 160) || "You",
    lifecycle: "active",
    health: enumValue(raw.health, HEALTH_STATES, "unknown", "health"),
    review: enumValue(raw.review, REVIEW_STATES, "not_reviewed", "review"),
    triageState: enumValue(raw.triageState, CAPTURE_TRIAGE_STATES, "untriaged", "triageState"),
    source: normalizeCaptureSource(raw.source, now),
    missingContext: stringList(raw.missingContext, "missingContext", 40),
    suggestions: normalizeCaptureSuggestions(raw.suggestions),
    linkedRefs: normalizeNativeRefs(raw.linkedRefs, "linkedRefs"),
    processedRefs: [],
    processingActions: [],
    createdAt: now,
    updatedAt: now,
    history: [historyEntry("capture_item.created", now, actorId)]
  };
  validateCapture(item);
  return item;
}

function buildTemplate(input: TemplateCreateInput, now: string, actorId: string): PersonalOpsTemplate {
  const raw = input as unknown as Record<string, unknown>;
  const item: PersonalOpsTemplate = {
    id: `${SECONDARY_ID_PREFIX.templates}-${crypto.randomUUID()}`,
    objectType: "template",
    title: requiredText(raw.title, "title", 240),
    summary: optionalText(raw.summary, "summary", 6000) || "",
    domain: optionalText(raw.domain, "domain", 120) || "Personal Admin",
    owner: optionalText(raw.owner, "owner", 160) || "You",
    lifecycle: enumValue(raw.lifecycle, TEMPLATE_LIFECYCLE_STATES, "draft", "lifecycle"),
    availability: enumValue(
      raw.availability,
      TEMPLATE_AVAILABILITY_STATES,
      "draft",
      "availability"
    ),
    health: enumValue(raw.health, TEMPLATE_HEALTH_STATES, "unknown", "health"),
    review: enumValue(raw.review, REVIEW_STATES, "not_reviewed", "review"),
    fields: normalizeTemplateFields(raw.fields),
    rules: normalizeTemplateRules(raw.rules),
    generatedDefinitions: normalizeTemplateDefinitions(raw.generatedDefinitions),
    linkedRefs: normalizeNativeRefs(raw.linkedRefs, "linkedRefs"),
    usages: [],
    createdAt: now,
    updatedAt: now,
    history: [historyEntry("template.created", now, actorId)]
  };
  validateTemplate(item, now, actorId);
  return item;
}

function validateCoreDestination(destination: PersonalOpsCoreDestinationDraft, now: string, actorId: string): void {
  buildByFamily(destination.family, destination.input, now, actorId);
}

function validateRoutine(item: PersonalOpsRoutine, now: string, actorId: string): void {
  if (item.lifecycle === "active" && item.generationRules.length === 0) {
    validation("An active routine needs at least one generation rule", "generationRules");
  }
  const enabledCore = item.generationRules.filter(
    (rule) =>
      rule.enabled &&
      rule.conditions.length === 0 &&
      rule.destination.module === "personal_ops"
  );
  if (item.lifecycle === "active" && enabledCore.length === 0) {
    validation(
      "An active routine needs at least one enabled, unconditional core Personal Ops destination. Condition evaluation is not connected yet.",
      "generationRules"
    );
  }
  if (item.lifecycle === "active") {
    for (const rule of enabledCore) {
      if (rule.destination.module === "personal_ops") {
        validateCoreDestination(rule.destination, now, actorId);
      }
    }
  }
}

function validateCapture(item: PersonalOpsCaptureItem): void {
  if (item.triageState === "processed" && item.processedRefs.length === 0) {
    validation("A capture can be processed only after outputs have been created", "triageState");
  }
}

function validateTemplate(item: PersonalOpsTemplate, now: string, actorId: string): void {
  const fieldKeys = new Set(item.fields.map((field) => field.key));
  for (const rule of item.rules) {
    if (rule.fieldKey && !fieldKeys.has(rule.fieldKey)) {
      validation(`Template rule ${rule.label} references a missing field`, "rules");
    }
  }
  if (item.lifecycle === "draft" && item.availability !== "draft") {
    validation("A draft template must remain draft-only", "availability");
  }
  if (item.lifecycle === "archived" && item.availability === "active") {
    validation("An archived template cannot remain available for use", "availability");
  }
  if (item.availability !== "active") return;
  if (item.lifecycle !== "active") {
    validation("An available template must have an active lifecycle", "lifecycle");
  }
  if (item.health === "invalid") {
    validation("An invalid template cannot be active", "health");
  }
  if (item.rules.some((rule) => rule.enabled)) {
    validation(
      "Template rule evaluation is not connected. Disable the rules before activation; tests remain preview-only.",
      "rules"
    );
  }
  const enabled = item.generatedDefinitions.filter((definition) => definition.enabled);
  if (enabled.length === 0) {
    validation("An active template needs at least one enabled generated definition", "generatedDefinitions");
  }
  const enabledCore = enabled.filter(
    (definition) => definition.destination.module === "personal_ops"
  );
  if (enabledCore.length === 0) {
    validation(
      "An active template needs at least one enabled core Personal Ops destination",
      "generatedDefinitions"
    );
  }
  const sampleValues: Record<string, TemplateFieldValue> = {};
  for (const field of item.fields) {
    if (field.defaultValue !== undefined) sampleValues[field.key] = field.defaultValue;
    else if (field.type === "number") sampleValues[field.key] = 0;
    else if (field.type === "boolean") sampleValues[field.key] = false;
    else if (field.type === "date") sampleValues[field.key] = now;
    else if (field.type === "select") sampleValues[field.key] = field.options[0] || "";
    else sampleValues[field.key] = "Template value";
  }
  for (const definition of enabledCore) {
    if (definition.destination.module !== "personal_ops") continue;
    const serialized = JSON.stringify(definition.destination.input);
    const placeholders = [...serialized.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)]
      .map((match) => match[1]);
    const unknown = placeholders.find((key) => !fieldKeys.has(key));
    if (unknown) {
      validation(
        `Generated definition ${definition.label} references unknown field ${unknown}`,
        "generatedDefinitions"
      );
    }
    const resolved = {
      ...definition.destination,
      input: replaceTemplateValues(
        definition.destination.input,
        sampleValues
      ) as PersonalOpsCreateInputByFamily[typeof definition.destination.family]
    } as PersonalOpsCoreDestinationDraft;
    validateCoreDestination(resolved, now, actorId);
  }
}

function buildSecondaryByFamily<Family extends PersonalOpsSecondaryFamily>(
  family: Family,
  input: PersonalOpsSecondaryCreateInputByFamily[Family],
  now: string,
  actorId: string
): PersonalOpsSecondaryObjectByFamily[Family] {
  let item: PersonalOpsSecondaryObject;
  if (family === "routines") item = buildRoutine(input as RoutineCreateInput, now, actorId);
  else if (family === "captures") item = buildCapture(input as CaptureCreateInput, now, actorId);
  else item = buildTemplate(input as TemplateCreateInput, now, actorId);
  return item as PersonalOpsSecondaryObjectByFamily[Family];
}

export async function listPersonalOpsSecondaryObjects<Family extends PersonalOpsSecondaryFamily>(
  family: Family
): Promise<PersonalOpsSecondaryObjectByFamily[Family][]> {
  if (!PERSONAL_OPS_SECONDARY_FAMILIES.includes(family)) {
    validation("Unsupported Personal Ops secondary family", "secondaryFamily");
  }
  const state = await readPersonalOpsState();
  return [...secondaryCollectionFor(state, family)].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

export async function readPersonalOpsSecondaryObject<Family extends PersonalOpsSecondaryFamily>(
  family: Family,
  id: string
): Promise<PersonalOpsSecondaryObjectByFamily[Family] | null> {
  if (!PERSONAL_OPS_SECONDARY_FAMILIES.includes(family)) {
    validation("Unsupported Personal Ops secondary family", "secondaryFamily");
  }
  const state = await readPersonalOpsState();
  return secondaryCollectionFor(state, family).find((item) => item.id === id) ?? null;
}

export async function createPersonalOpsSecondaryObject<Family extends PersonalOpsSecondaryFamily>(
  family: Family,
  input: PersonalOpsSecondaryCreateInputByFamily[Family],
  options: { actorId?: string; now?: Date } = {}
): Promise<PersonalOpsSecondaryStoreCreateResult<Family>> {
  if (!PERSONAL_OPS_SECONDARY_FAMILIES.includes(family)) {
    validation("Unsupported Personal Ops secondary family", "secondaryFamily");
  }
  const actorId = options.actorId || "admin";
  const now = (options.now || new Date()).toISOString();
  return withMutationLock(async () => {
    const state = await readPersonalOpsState();
    const item = buildSecondaryByFamily(family, input, now, actorId);
    const auditEvent = moduleAuditEvent({
      item,
      action: `${item.objectType}.created`,
      actorId,
      occurredAt: now,
      before: null
    });
    const nextState: PersonalOpsState = {
      ...state,
      [family]: [item, ...secondaryCollectionFor(state, family)],
      auditEvents: appendModuleAudit(state, auditEvent)
    };
    await writeJsonFile(FILE_NAME, nextState);
    return { item, created: true, auditEvent } as PersonalOpsSecondaryStoreCreateResult<Family>;
  });
}

function secondaryUpdateAction(
  before: PersonalOpsSecondaryObject,
  after: PersonalOpsSecondaryObject
): string {
  if (before.lifecycle !== "archived" && after.lifecycle === "archived") {
    return `${after.objectType}.archived`;
  }
  if (before.lifecycle === "archived" && after.lifecycle !== "archived") {
    return `${after.objectType}.restored`;
  }
  return `${after.objectType}.updated`;
}

function applySecondaryArchive<
  Item extends PersonalOpsRoutine | PersonalOpsCaptureItem | PersonalOpsTemplate
>(current: Item, next: Item, patch: Record<string, unknown>, now: string): Item {
  if (current.lifecycle !== "archived" && next.lifecycle === "archived") {
    if (patch.archiveConfirmed !== true) {
      validation("Archive confirmation is required", "archiveConfirmed");
    }
    next.archivedAt = now;
    next.archiveReason = requiredText(patch.archiveReason, "archiveReason", 2000);
  } else if (current.lifecycle === "archived" && next.lifecycle !== "archived") {
    if (patch.restoreConfirmed !== true) {
      validation("Restore confirmation is required", "restoreConfirmed");
    }
    next.archivedAt = undefined;
    next.archiveReason = undefined;
  }
  return next;
}

function updateRoutine(
  current: PersonalOpsRoutine,
  patch: Record<string, unknown>,
  now: string,
  actorId: string
): PersonalOpsRoutine {
  const next = { ...current };
  if (hasOwn(patch, "title")) next.title = requiredText(patch.title, "title", 240);
  if (hasOwn(patch, "summary")) next.summary = optionalText(patch.summary, "summary", 6000) || "";
  if (hasOwn(patch, "domain")) next.domain = requiredText(patch.domain, "domain", 120);
  if (hasOwn(patch, "owner")) next.owner = requiredText(patch.owner, "owner", 160);
  if (hasOwn(patch, "lifecycle")) {
    next.lifecycle = enumValue(patch.lifecycle, ROUTINE_LIFECYCLE_STATES, current.lifecycle, "lifecycle");
  }
  if (hasOwn(patch, "health")) next.health = enumValue(patch.health, HEALTH_STATES, current.health, "health");
  if (hasOwn(patch, "review")) next.review = enumValue(patch.review, REVIEW_STATES, current.review, "review");
  if (hasOwn(patch, "cadence")) next.cadence = enumValue(patch.cadence, CADENCE_STATES, current.cadence, "cadence");
  if (hasOwn(patch, "priority")) next.priority = enumValue(patch.priority, PRIORITIES, current.priority, "priority");
  if (hasOwn(patch, "cadenceRule")) next.cadenceRule = normalizeRoutineCadenceRule(patch.cadenceRule, "cadenceRule");
  if (hasOwn(patch, "generationRules")) next.generationRules = normalizeGenerationRules(patch.generationRules, "generationRules");
  if (hasOwn(patch, "completionCriteria")) next.completionCriteria = stringList(patch.completionCriteria, "completionCriteria", 40);
  if (hasOwn(patch, "linkedRefs")) next.linkedRefs = normalizeNativeRefs(patch.linkedRefs, "linkedRefs");
  if (hasOwn(patch, "nextRunAt")) next.nextRunAt = optionalDate(patch.nextRunAt, "nextRunAt");
  applySecondaryArchive(current, next, patch, now);
  validateRoutine(next, now, actorId);
  return next;
}

function updateCapture(
  current: PersonalOpsCaptureItem,
  patch: Record<string, unknown>,
  now: string
): PersonalOpsCaptureItem {
  if (hasOwn(patch, "rawText")) {
    validation("Capture raw text is immutable; create a new capture instead", "rawText");
  }
  const next = { ...current };
  if (hasOwn(patch, "title")) next.title = requiredText(patch.title, "title", 240);
  if (hasOwn(patch, "domain")) next.domain = requiredText(patch.domain, "domain", 120);
  if (hasOwn(patch, "owner")) next.owner = requiredText(patch.owner, "owner", 160);
  if (hasOwn(patch, "lifecycle")) {
    next.lifecycle = enumValue(patch.lifecycle, CAPTURE_LIFECYCLE_STATES, current.lifecycle, "lifecycle");
  }
  if (hasOwn(patch, "health")) next.health = enumValue(patch.health, HEALTH_STATES, current.health, "health");
  if (hasOwn(patch, "review")) next.review = enumValue(patch.review, REVIEW_STATES, current.review, "review");
  if (hasOwn(patch, "triageState")) {
    next.triageState = enumValue(patch.triageState, CAPTURE_TRIAGE_STATES, current.triageState, "triageState");
  }
  if (current.triageState === "processed" && next.triageState !== "processed") {
    validation(
      "Processed captures cannot be reopened or reprocessed in this checkpoint. Create a new Capture to preserve duplicate safety and provenance.",
      "triageState"
    );
  }
  if (hasOwn(patch, "missingContext")) next.missingContext = stringList(patch.missingContext, "missingContext", 40);
  if (hasOwn(patch, "suggestions")) next.suggestions = normalizeCaptureSuggestions(patch.suggestions);
  if (hasOwn(patch, "linkedRefs")) next.linkedRefs = normalizeNativeRefs(patch.linkedRefs, "linkedRefs");
  applySecondaryArchive(current, next, patch, now);
  validateCapture(next);
  return next;
}

function updateTemplate(
  current: PersonalOpsTemplate,
  patch: Record<string, unknown>,
  now: string,
  actorId: string
): PersonalOpsTemplate {
  const next = { ...current };
  if (hasOwn(patch, "title")) next.title = requiredText(patch.title, "title", 240);
  if (hasOwn(patch, "summary")) next.summary = optionalText(patch.summary, "summary", 6000) || "";
  if (hasOwn(patch, "domain")) next.domain = requiredText(patch.domain, "domain", 120);
  if (hasOwn(patch, "owner")) next.owner = requiredText(patch.owner, "owner", 160);
  if (hasOwn(patch, "lifecycle")) {
    next.lifecycle = enumValue(patch.lifecycle, TEMPLATE_LIFECYCLE_STATES, current.lifecycle, "lifecycle");
  }
  if (hasOwn(patch, "availability")) {
    next.availability = enumValue(
      patch.availability,
      TEMPLATE_AVAILABILITY_STATES,
      current.availability,
      "availability"
    );
  }
  if (hasOwn(patch, "health")) {
    next.health = enumValue(patch.health, TEMPLATE_HEALTH_STATES, current.health, "health");
  }
  if (hasOwn(patch, "review")) next.review = enumValue(patch.review, REVIEW_STATES, current.review, "review");
  if (hasOwn(patch, "fields")) next.fields = normalizeTemplateFields(patch.fields);
  if (hasOwn(patch, "rules")) next.rules = normalizeTemplateRules(patch.rules);
  if (hasOwn(patch, "generatedDefinitions")) {
    next.generatedDefinitions = normalizeTemplateDefinitions(patch.generatedDefinitions);
  }
  if (hasOwn(patch, "linkedRefs")) next.linkedRefs = normalizeNativeRefs(patch.linkedRefs, "linkedRefs");
  if (
    current.lifecycle !== "archived" &&
    next.lifecycle === "archived" &&
    next.availability === "active" &&
    !hasOwn(patch, "availability")
  ) {
    next.availability = "paused";
  }
  applySecondaryArchive(current, next, patch, now);
  validateTemplate(next, now, actorId);
  return next;
}

function updatedSecondaryByFamily<Family extends PersonalOpsSecondaryFamily>(
  family: Family,
  current: PersonalOpsSecondaryObjectByFamily[Family],
  patch: PersonalOpsSecondaryUpdateInputByFamily[Family],
  now: string,
  actorId: string
): PersonalOpsSecondaryObjectByFamily[Family] {
  const raw = patch as unknown as Record<string, unknown>;
  let item: PersonalOpsSecondaryObject;
  if (family === "routines") item = updateRoutine(current as PersonalOpsRoutine, raw, now, actorId);
  else if (family === "captures") item = updateCapture(current as PersonalOpsCaptureItem, raw, now);
  else item = updateTemplate(current as PersonalOpsTemplate, raw, now, actorId);
  return item as PersonalOpsSecondaryObjectByFamily[Family];
}

const SECONDARY_PATCH_KEYS: Record<PersonalOpsSecondaryFamily, readonly string[]> = {
  routines: [
    "title",
    "summary",
    "domain",
    "owner",
    "lifecycle",
    "health",
    "review",
    "cadence",
    "priority",
    "cadenceRule",
    "generationRules",
    "completionCriteria",
    "linkedRefs",
    "nextRunAt",
    "archiveReason",
    "archiveConfirmed",
    "restoreConfirmed"
  ],
  captures: [
    "title",
    "domain",
    "owner",
    "lifecycle",
    "health",
    "review",
    "triageState",
    "missingContext",
    "suggestions",
    "linkedRefs",
    "archiveReason",
    "archiveConfirmed",
    "restoreConfirmed"
  ],
  templates: [
    "title",
    "summary",
    "domain",
    "owner",
    "lifecycle",
    "availability",
    "health",
    "review",
    "fields",
    "rules",
    "generatedDefinitions",
    "linkedRefs",
    "archiveReason",
    "archiveConfirmed",
    "restoreConfirmed"
  ]
};

function validateSecondaryPatch(
  family: PersonalOpsSecondaryFamily,
  value: unknown
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) validation("patch must be an object", "patch");
  const keys = Object.keys(value);
  if (keys.length === 0) validation("At least one change is required", "patch");
  const unknown = keys.find((key) => !SECONDARY_PATCH_KEYS[family].includes(key));
  if (unknown) validation(`${unknown} is not an editable ${family} field`, unknown);
}

export async function updatePersonalOpsSecondaryObject<Family extends PersonalOpsSecondaryFamily>(
  family: Family,
  id: string,
  patch: PersonalOpsSecondaryUpdateInputByFamily[Family],
  options: { expectedUpdatedAt: string; actorId?: string; now?: Date }
): Promise<PersonalOpsSecondaryStoreUpdateResult<Family>> {
  if (!PERSONAL_OPS_SECONDARY_FAMILIES.includes(family)) {
    validation("Unsupported Personal Ops secondary family", "secondaryFamily");
  }
  const cleanId = requiredText(id, "id", 240);
  validateSecondaryPatch(family, patch);
  const expectedUpdatedAt = requiredText(options.expectedUpdatedAt, "expectedUpdatedAt", 120);
  const actorId = options.actorId || "admin";
  const requestedAt = options.now?.toISOString();
  return withMutationLock(async () => {
    const state = await readPersonalOpsState();
    const collection = secondaryCollectionFor(state, family);
    const index = collection.findIndex((item) => item.id === cleanId);
    if (index === -1) {
      throw new PersonalOpsStoreError("not_found", "Personal Ops object not found", { status: 404 });
    }
    const current = collection[index];
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new PersonalOpsStoreError(
        "stale",
        "This object changed after it was opened. Refresh before saving so newer work is not overwritten.",
        { status: 409 }
      );
    }
    const now = monotonicTimestamp(current.updatedAt, requestedAt || new Date().toISOString());
    const changed = updatedSecondaryByFamily(family, current, patch, now, actorId);
    if (JSON.stringify(changed) === JSON.stringify(current)) {
      validation("The patch does not change this object", "patch");
    }
    const action = secondaryUpdateAction(current, changed);
    const item = {
      ...changed,
      updatedAt: now,
      history: [
        ...current.history,
        historyEntry(action, now, actorId, action.endsWith(".archived") ? changed.archiveReason : undefined)
      ]
    } as PersonalOpsSecondaryObjectByFamily[Family];
    const auditEvent = moduleAuditEvent({
      item,
      action,
      actorId,
      occurredAt: now,
      before: current
    });
    const nextCollection = collection.map((existing, currentIndex) =>
      currentIndex === index ? item : existing
    );
    const nextState: PersonalOpsState = {
      ...state,
      [family]: nextCollection,
      auditEvents: appendModuleAudit(state, auditEvent)
    };
    await writeJsonFile(FILE_NAME, nextState);
    return { item, auditEvent };
  });
}

function operationKey(value: unknown): string {
  return requiredText(value, "operationKey", 200);
}

function templateRequestFingerprint(
  definitionId: string,
  values: Readonly<Record<string, TemplateFieldValue>>
): string {
  return JSON.stringify({
    definitionId,
    values: Object.fromEntries(
      Object.keys(values)
        .sort()
        .map((key) => [key, values[key]])
    )
  });
}

function assertConfirmed(value: unknown): asserts value is true {
  if (value !== true) validation("Explicit confirmation is required", "confirmed");
}

function sourceRefFor(item: PersonalOpsSecondaryObject): NativeObjectRef {
  return objectRef(item);
}

function coreInputWithSource<Family extends PersonalOpsFamily>(
  destination: Extract<PersonalOpsCoreDestinationDraft, { family: Family }>,
  sourceRef: NativeObjectRef
): PersonalOpsCreateInputByFamily[Family] {
  const raw = structuredClone(destination.input) as unknown as Record<string, unknown>;
  delete raw.legacySource;
  const existing = normalizeNativeRefs(raw.sourceRefs, "sourceRefs");
  const hasSource = existing.some(
    (ref) =>
      ref.module === sourceRef.module &&
      ref.objectType === sourceRef.objectType &&
      ref.objectId === sourceRef.objectId
  );
  raw.sourceRefs = hasSource ? existing : [...existing, sourceRef];
  return raw as PersonalOpsCreateInputByFamily[Family];
}

function buildCoreFromDestination(
  destination: PersonalOpsCoreDestinationDraft,
  sourceRef: NativeObjectRef,
  now: string,
  actorId: string
): { family: PersonalOpsFamily; item: PersonalOpsObject; input: PersonalOpsCreateInputByFamily[PersonalOpsFamily] } {
  const withProvenanceHistory = <Item extends PersonalOpsObject>(item: Item): Item => ({
    ...item,
    history: [
      ...item.history,
      historyEntry(
        `created_from_${sourceRef.objectType}`,
        now,
        actorId,
        `${sourceRef.label} (${sourceRef.objectId})`
      )
    ]
  });
  if (destination.family === "goals") {
    const input = coreInputWithSource(destination, sourceRef);
    return { family: "goals", item: withProvenanceHistory(buildGoal(input, now, actorId)), input };
  }
  if (destination.family === "decisions") {
    const input = coreInputWithSource(destination, sourceRef);
    return {
      family: "decisions",
      item: withProvenanceHistory(buildDecision(input, now, actorId)),
      input
    };
  }
  if (destination.family === "obligations") {
    const input = coreInputWithSource(destination, sourceRef);
    return {
      family: "obligations",
      item: withProvenanceHistory(buildObligation(input, now, actorId)),
      input
    };
  }
  const input = coreInputWithSource(destination, sourceRef);
  return {
    family: "followUps",
    item: withProvenanceHistory(buildFollowUp(input, now, actorId)),
    input
  };
}

function coreCollectionsWith(
  state: PersonalOpsState,
  generated: readonly { family: PersonalOpsFamily; item: PersonalOpsObject }[]
): Pick<PersonalOpsState, "goals" | "decisions" | "obligations" | "followUps"> {
  const goals: PersonalOpsGoal[] = [];
  const decisions: PersonalOpsDecision[] = [];
  const obligations: PersonalOpsObligation[] = [];
  const followUps: PersonalOpsFollowUp[] = [];
  for (const entry of generated) {
    if (entry.family === "goals") goals.push(entry.item as PersonalOpsGoal);
    else if (entry.family === "decisions") decisions.push(entry.item as PersonalOpsDecision);
    else if (entry.family === "obligations") obligations.push(entry.item as PersonalOpsObligation);
    else followUps.push(entry.item as PersonalOpsFollowUp);
  }
  return {
    goals: [...goals, ...state.goals],
    decisions: [...decisions, ...state.decisions],
    obligations: [...obligations, ...state.obligations],
    followUps: [...followUps, ...state.followUps]
  };
}

function selectedGenerationRules(
  routine: PersonalOpsRoutine,
  input: RoutineRunPreviewInput
): RoutineGenerationRule[] {
  if (!input.ruleIds?.length) return routine.generationRules;
  const selected = new Set(stringList(input.ruleIds, "ruleIds", 40));
  const missing = [...selected].filter(
    (ruleId) => !routine.generationRules.some((rule) => rule.id === ruleId)
  );
  if (missing.length) validation(`Unknown routine rule: ${missing.join(", ")}`, "ruleIds");
  return routine.generationRules.filter((rule) => selected.has(rule.id));
}

function routinePreviewFromItem(
  routine: PersonalOpsRoutine,
  input: RoutineRunPreviewInput,
  generatedAt: string,
  actorId: string
): RoutineRunPreview {
  const scheduledFor = optionalDate(input.scheduledFor, "scheduledFor");
  const sourceRef = sourceRefFor(routine);
  const entries: RoutineRunPreviewEntry[] = selectedGenerationRules(routine, input).map((rule) => {
    const base = {
      ruleId: rule.id,
      label: rule.label,
      destinationModule: rule.destination.module,
      ...(rule.destination.module === "personal_ops"
        ? { destinationFamily: rule.destination.family }
        : {})
    };
    if (!rule.enabled) {
      return { ...base, canCreate: false, disabledReason: "This generation rule is disabled." };
    }
    if (rule.destination.module !== "personal_ops") {
      return {
        ...base,
        canCreate: false,
        disabledReason: `${rule.destination.module} creation is not connected. This preview will not mutate another module.`
      };
    }
    try {
      const proposed = buildCoreFromDestination(rule.destination, sourceRef, generatedAt, actorId);
      if (routine.lifecycle !== "active") {
        return {
          ...base,
          canCreate: false,
          disabledReason: "Activate this routine before running it.",
          proposedInput: proposed.input
        };
      }
      if (routine.cadence === "paused") {
        return {
          ...base,
          canCreate: false,
          disabledReason: "Paused routines cannot run.",
          proposedInput: proposed.input
        };
      }
      if (rule.conditions.length > 0) {
        return {
          ...base,
          canCreate: false,
          disabledReason: "Condition evaluation is not connected. Remove the conditions or keep this rule preview-only.",
          proposedInput: proposed.input
        };
      }
      return { ...base, canCreate: true, proposedInput: proposed.input };
    } catch (error) {
      return {
        ...base,
        canCreate: false,
        disabledReason: error instanceof Error ? error.message : "This rule is not ready to create an object."
      };
    }
  });
  return {
    routineId: routine.id,
    routineUpdatedAt: routine.updatedAt,
    generatedAt,
    ...(scheduledFor ? { scheduledFor } : {}),
    entries,
    confirmableCount: entries.filter((entry) => entry.canCreate).length,
    disabledCount: entries.filter((entry) => !entry.canCreate).length
  };
}

export async function previewPersonalOpsRoutineRun(
  id: string,
  input: RoutineRunPreviewInput,
  options: { actorId?: string; now?: Date } = {}
): Promise<RoutineRunPreview> {
  const cleanId = requiredText(id, "id", 240);
  const state = await readPersonalOpsState();
  const routine = state.routines.find((item) => item.id === cleanId);
  if (!routine) {
    throw new PersonalOpsStoreError("not_found", "Routine not found", { status: 404 });
  }
  return routinePreviewFromItem(
    routine,
    input,
    (options.now || new Date()).toISOString(),
    options.actorId || "admin"
  );
}

export async function confirmPersonalOpsRoutineRun(
  id: string,
  input: ConfirmRoutineRunInput,
  options: { actorId?: string; now?: Date } = {}
): Promise<PersonalOpsRoutineRunStoreResult> {
  const cleanId = requiredText(id, "id", 240);
  const key = operationKey(input.operationKey);
  assertConfirmed(input.confirmed);
  const expectedUpdatedAt = requiredText(input.expectedUpdatedAt, "expectedUpdatedAt", 120);
  const actorId = options.actorId || "admin";
  const requestedAt = (options.now || new Date()).toISOString();

  return withMutationLock(async () => {
    const state = await readPersonalOpsState();
    const index = state.routines.findIndex((item) => item.id === cleanId);
    if (index === -1) {
      throw new PersonalOpsStoreError("not_found", "Routine not found", { status: 404 });
    }
    const current = state.routines[index];
    const existingRun = current.runHistory.find((run) => run.operationKey === key);
    if (existingRun) {
      const requestedScheduledFor = optionalDate(input.scheduledFor, "scheduledFor");
      const requestedRuleIds = input.ruleIds?.length
        ? [...new Set(stringList(input.ruleIds, "ruleIds", 40))].sort()
        : null;
      const existingRuleIds = [...new Set(existingRun.results.map((result) => result.ruleId))].sort();
      if (
        requestedScheduledFor !== existingRun.scheduledFor ||
        (requestedRuleIds && JSON.stringify(requestedRuleIds) !== JSON.stringify(existingRuleIds))
      ) {
        throw new PersonalOpsStoreError(
          "conflict",
          "This routine operation key was already used with different run inputs.",
          { status: 409 }
        );
      }
      return { item: current, run: existingRun, created: false, auditEvents: [] };
    }
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new PersonalOpsStoreError(
        "stale",
        "This routine changed after the preview. Preview it again before confirming the run.",
        { status: 409 }
      );
    }
    if (current.lifecycle !== "active") {
      validation("Only an active routine can run", "lifecycle");
    }
    if (current.cadence === "paused") {
      validation("Paused routines cannot run", "cadence");
    }

    const now = monotonicTimestamp(current.updatedAt, requestedAt);
    const preview = routinePreviewFromItem(current, input, now, actorId);
    const selectedRules = selectedGenerationRules(current, input);
    const entryByRule = new Map(preview.entries.map((entry) => [entry.ruleId, entry]));
    const generated: Array<{ family: PersonalOpsFamily; item: PersonalOpsObject }> = [];
    const results: RoutineRun["results"] = [];
    const coreAudits: AuditEvent[] = [];
    const routineRef = sourceRefFor(current);

    for (const rule of selectedRules) {
      const previewEntry = entryByRule.get(rule.id);
      if (!previewEntry?.canCreate || rule.destination.module !== "personal_ops") {
        results.push({
          ruleId: rule.id,
          label: rule.label,
          destinationModule: rule.destination.module,
          ...(rule.destination.module === "personal_ops"
            ? { destinationFamily: rule.destination.family }
            : {}),
          outcome: "disabled",
          disabledReason: previewEntry?.disabledReason || "This rule cannot create an object."
        });
        continue;
      }
      const created = buildCoreFromDestination(rule.destination, routineRef, now, actorId);
      generated.push(created);
      const createdRef = objectRef(created.item);
      results.push({
        ruleId: rule.id,
        label: rule.label,
        destinationModule: "personal_ops",
        destinationFamily: created.family,
        outcome: "created",
        createdRef
      });
      coreAudits.push(moduleAuditEvent({
        item: created.item,
        action: `${created.item.objectType}.created_from_routine`,
        actorId,
        occurredAt: now,
        before: null,
        correlationId: key
      }));
    }
    if (generated.length === 0) {
      validation("This routine has no confirmed core Personal Ops outputs to create", "ruleIds");
    }

    const run: RoutineRun = {
      id: `routine-run-${crypto.randomUUID()}`,
      operationKey: key,
      ...(preview.scheduledFor ? { scheduledFor: preview.scheduledFor } : {}),
      startedAt: now,
      completedAt: now,
      completedBy: actorId,
      outcome: "completed",
      generatedRefs: generated.map((entry) => objectRef(entry.item)),
      results
    };
    const item: PersonalOpsRoutine = {
      ...current,
      cadence: "current",
      lastRunAt: now,
      updatedAt: now,
      runHistory: [...current.runHistory, run],
      history: [
        ...current.history,
        historyEntry(
          "routine.run_confirmed",
          now,
          actorId,
          `${generated.length} core object${generated.length === 1 ? "" : "s"} created`
        )
      ]
    };
    const routineAudit = moduleAuditEvent({
      item,
      action: "routine.run_confirmed",
      actorId,
      occurredAt: now,
      before: current,
      correlationId: key
    });
    const routines = state.routines.map((existing, currentIndex) =>
      currentIndex === index ? item : existing
    );
    const auditEvents = [...coreAudits, routineAudit];
    const nextState: PersonalOpsState = {
      ...state,
      ...coreCollectionsWith(state, generated),
      routines,
      auditEvents: appendModuleAudits(state, auditEvents)
    };
    await writeJsonFile(FILE_NAME, nextState);
    return { item, run, created: true, auditEvents };
  });
}

function normalizeCaptureProcessingOutputs(value: unknown): CaptureProcessingOutputDraft[] {
  if (!Array.isArray(value) || value.length === 0) {
    validation("At least one processing output is required", "outputs");
  }
  const seen = new Set<string>();
  return value.slice(0, 40).map((raw, index) => {
    if (!isRecord(raw)) validation(`outputs.${index} must be an object`, `outputs.${index}`);
    const id = requiredText(raw.id, `outputs.${index}.id`, 240);
    if (seen.has(id)) validation("Processing output ids must be unique", `outputs.${index}.id`);
    seen.add(id);
    return {
      id,
      excerpt: optionalRawText(raw.excerpt, `outputs.${index}.excerpt`, 12000),
      destination: normalizeDestination(raw.destination, `outputs.${index}.destination`)
    };
  });
}

function capturePreviewFromItem(
  capture: PersonalOpsCaptureItem,
  input: CaptureProcessingPreviewInput,
  generatedAt: string,
  actorId: string
): CaptureProcessingPreview {
  const outputs = normalizeCaptureProcessingOutputs(input.outputs);
  for (const output of outputs) {
    if (output.excerpt && !capture.rawText.includes(output.excerpt)) {
      validation(
        `Output ${output.id} excerpt must be copied from the immutable capture text`,
        "outputs"
      );
    }
  }
  const captureRef = sourceRefFor(capture);
  const entries: CaptureProcessingPreviewEntry[] = outputs.map((output) => {
    const base = {
      outputId: output.id,
      ...(output.excerpt ? { excerpt: output.excerpt } : {}),
      destinationModule: output.destination.module,
      ...(output.destination.module === "personal_ops"
        ? { destinationFamily: output.destination.family }
        : {})
    };
    if (capture.lifecycle === "archived") {
      return { ...base, canCreate: false, disabledReason: "Restore this capture before processing it." };
    }
    if (capture.triageState === "processed") {
      return { ...base, canCreate: false, disabledReason: "This capture has already been processed." };
    }
    if (output.destination.module !== "personal_ops") {
      return {
        ...base,
        canCreate: false,
        disabledReason: `${output.destination.module} creation is not connected. Keep this output as a preview or choose a core Personal Ops destination.`
      };
    }
    try {
      const proposed = buildCoreFromDestination(output.destination, captureRef, generatedAt, actorId);
      return { ...base, canCreate: true, proposedInput: proposed.input };
    } catch (error) {
      return {
        ...base,
        canCreate: false,
        disabledReason: error instanceof Error ? error.message : "This output is not ready to create an object."
      };
    }
  });
  return {
    captureId: capture.id,
    captureUpdatedAt: capture.updatedAt,
    rawText: capture.rawText,
    generatedAt,
    entries,
    confirmableCount: entries.filter((entry) => entry.canCreate).length,
    disabledCount: entries.filter((entry) => !entry.canCreate).length
  };
}

export async function previewPersonalOpsCaptureProcessing(
  id: string,
  input: CaptureProcessingPreviewInput,
  options: { actorId?: string; now?: Date } = {}
): Promise<CaptureProcessingPreview> {
  const cleanId = requiredText(id, "id", 240);
  const state = await readPersonalOpsState();
  const capture = state.captures.find((item) => item.id === cleanId);
  if (!capture) {
    throw new PersonalOpsStoreError("not_found", "Capture item not found", { status: 404 });
  }
  return capturePreviewFromItem(
    capture,
    input,
    (options.now || new Date()).toISOString(),
    options.actorId || "admin"
  );
}

export async function confirmPersonalOpsCaptureProcessing(
  id: string,
  input: ConfirmCaptureProcessingInput,
  options: { actorId?: string; now?: Date } = {}
): Promise<PersonalOpsCaptureProcessingStoreResult> {
  const cleanId = requiredText(id, "id", 240);
  const key = operationKey(input.operationKey);
  assertConfirmed(input.confirmed);
  const expectedUpdatedAt = requiredText(input.expectedUpdatedAt, "expectedUpdatedAt", 120);
  const actorId = options.actorId || "admin";
  const requestedAt = (options.now || new Date()).toISOString();

  return withMutationLock(async () => {
    const state = await readPersonalOpsState();
    const index = state.captures.findIndex((item) => item.id === cleanId);
    if (index === -1) {
      throw new PersonalOpsStoreError("not_found", "Capture item not found", { status: 404 });
    }
    const current = state.captures[index];
    const outputs = normalizeCaptureProcessingOutputs(input.outputs);
    const existingAction = current.processingActions.find((action) => action.operationKey === key);
    if (existingAction) {
      if (JSON.stringify(outputs) !== JSON.stringify(existingAction.outputs)) {
        throw new PersonalOpsStoreError(
          "conflict",
          "This capture operation key was already used with different outputs.",
          { status: 409 }
        );
      }
      return { item: current, action: existingAction, created: false, auditEvents: [] };
    }
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new PersonalOpsStoreError(
        "stale",
        "This capture changed after the preview. Preview it again before confirming processing.",
        { status: 409 }
      );
    }
    if (current.lifecycle === "archived") {
      validation("Restore this capture before processing it", "lifecycle");
    }
    if (current.triageState === "processed") {
      validation("This capture has already been processed", "triageState");
    }

    const now = monotonicTimestamp(current.updatedAt, requestedAt);
    const preview = capturePreviewFromItem(current, { outputs }, now, actorId);
    const blocked = preview.entries.filter((entry) => !entry.canCreate);
    if (blocked.length) {
      validation(
        `Every selected output must be ready before processing. ${blocked[0].disabledReason || "An output is disabled."}`,
        "outputs"
      );
    }

    const captureRef = sourceRefFor(current);
    const generated = outputs.map((output) => {
      if (output.destination.module !== "personal_ops") {
        validation("Cross-module capture outputs cannot be confirmed yet", "outputs");
      }
      return buildCoreFromDestination(output.destination, captureRef, now, actorId);
    });
    const createdRefs = generated.map((entry) => objectRef(entry.item));
    const action: CaptureProcessingAction = {
      id: `capture-action-${crypto.randomUUID()}`,
      operationKey: key,
      action: "split_and_create",
      processedAt: now,
      processedBy: actorId,
      outcome: "completed",
      outputs,
      createdRefs
    };
    const item: PersonalOpsCaptureItem = {
      ...current,
      triageState: "processed",
      processedAt: now,
      processedRefs: [...current.processedRefs, ...createdRefs],
      processingActions: [...current.processingActions, action],
      updatedAt: now,
      history: [
        ...current.history,
        historyEntry(
          "capture_item.processed",
          now,
          actorId,
          `${generated.length} core object${generated.length === 1 ? "" : "s"} created`
        )
      ]
    };
    const coreAudits = generated.map((entry) => moduleAuditEvent({
      item: entry.item,
      action: `${entry.item.objectType}.created_from_capture`,
      actorId,
      occurredAt: now,
      before: null,
      correlationId: key
    }));
    const captureAudit = moduleAuditEvent({
      item,
      action: "capture_item.processed",
      actorId,
      occurredAt: now,
      before: current,
      correlationId: key
    });
    const captures = state.captures.map((existing, currentIndex) =>
      currentIndex === index ? item : existing
    );
    const auditEvents = [...coreAudits, captureAudit];
    const nextState: PersonalOpsState = {
      ...state,
      ...coreCollectionsWith(state, generated),
      captures,
      auditEvents: appendModuleAudits(state, auditEvents)
    };
    await writeJsonFile(FILE_NAME, nextState);
    return { item, action, created: true, auditEvents };
  });
}

function normalizeTemplateValues(
  template: PersonalOpsTemplate,
  value: unknown
): {
  values: Readonly<Record<string, TemplateFieldValue>>;
  fieldErrors: Readonly<Record<string, readonly string[]>>;
} {
  if (!isRecord(value)) validation("values must be an object", "values");
  const values: Record<string, TemplateFieldValue> = {};
  const errors: Record<string, string[]> = {};
  const allowed = new Set(template.fields.map((field) => field.key));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors[key] = ["This field is not defined by the template."];
  }

  for (const field of template.fields) {
    const supplied = hasOwn(value, field.key) ? value[field.key] : field.defaultValue;
    const normalized = normalizeTemplateFieldValue(supplied, `values.${field.key}`);
    const missing = normalized === undefined || normalized === null || normalized === "";
    if (field.required && missing) {
      errors[field.key] = ["This field is required."];
      continue;
    }
    if (normalized === undefined) continue;
    if (field.type === "number" && typeof normalized !== "number") {
      errors[field.key] = ["Enter a number."];
      continue;
    }
    if (field.type === "boolean" && typeof normalized !== "boolean") {
      errors[field.key] = ["Choose true or false."];
      continue;
    }
    if (field.type === "date" && (typeof normalized !== "string" || Number.isNaN(Date.parse(normalized)))) {
      errors[field.key] = ["Enter a valid date or timestamp."];
      continue;
    }
    if (field.type === "select" && (typeof normalized !== "string" || !field.options.includes(normalized))) {
      errors[field.key] = ["Choose one of the available options."];
      continue;
    }
    values[field.key] = normalized;
  }
  return { values, fieldErrors: errors };
}

function replaceTemplateValues(value: unknown, values: Readonly<Record<string, TemplateFieldValue>>): unknown {
  if (typeof value === "string") {
    const exact = value.match(/^\{\{\s*([a-z][a-z0-9_]*)\s*\}\}$/);
    if (exact) return values[exact[1]] ?? "";
    return value.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_match, key: string) =>
      String(values[key] ?? "")
    );
  }
  if (Array.isArray(value)) return value.map((item) => replaceTemplateValues(item, values));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceTemplateValues(item, values)])
    );
  }
  return value;
}

function selectedTemplateDefinitions(
  template: PersonalOpsTemplate,
  definitionId?: string
): TemplateGeneratedDefinition[] {
  if (!definitionId) return template.generatedDefinitions;
  const cleanId = requiredText(definitionId, "definitionId", 240);
  const definition = template.generatedDefinitions.find((item) => item.id === cleanId);
  if (!definition) validation("The selected template definition does not exist", "definitionId");
  return [definition];
}

function templateTestFromItem(
  template: PersonalOpsTemplate,
  input: TemplateTestInput,
  generatedAt: string,
  actorId: string
): TemplateTestPreview {
  const normalized = normalizeTemplateValues(template, input.values);
  const hasFieldErrors = Object.keys(normalized.fieldErrors).length > 0;
  const templateRef = sourceRefFor(template);
  const entries: TemplateTestPreviewEntry[] = selectedTemplateDefinitions(
    template,
    input.definitionId
  ).map((definition) => {
    const base = {
      definitionId: definition.id,
      label: definition.label,
      destinationModule: definition.destination.module,
      ...(definition.destination.module === "personal_ops"
        ? { destinationFamily: definition.destination.family }
        : {})
    };
    if (!definition.enabled) {
      return { ...base, canCreate: false, disabledReason: "This generated definition is disabled." };
    }
    if (hasFieldErrors) {
      return { ...base, canCreate: false, disabledReason: "Resolve the template field errors first." };
    }
    if (definition.destination.module !== "personal_ops") {
      return {
        ...base,
        canCreate: false,
        disabledReason: `${definition.destination.module} creation is not connected. Testing remains preview-only.`
      };
    }
    try {
      const resolvedDestination = {
        ...definition.destination,
        input: replaceTemplateValues(
          definition.destination.input,
          normalized.values
        ) as PersonalOpsCreateInputByFamily[typeof definition.destination.family]
      } as PersonalOpsCoreDestinationDraft;
      const proposed = buildCoreFromDestination(resolvedDestination, templateRef, generatedAt, actorId);
      let disabledReason: string | undefined;
      if (template.lifecycle === "archived") {
        disabledReason = "Restore this template before using it.";
      } else if (template.availability === "draft") {
        disabledReason = "This is a non-writing draft test. Activate the template before use.";
      } else if (template.availability === "paused") {
        disabledReason = "This template is paused. Resume it before use.";
      } else if (template.availability === "deprecated") {
        disabledReason = "This template is deprecated and cannot create new objects.";
      } else if (template.health === "invalid") {
        disabledReason = "Repair this invalid template before use.";
      } else if (template.rules.some((rule) => rule.enabled)) {
        disabledReason = "Template rule evaluation is not connected. This remains a preview only.";
      }
      if (disabledReason) {
        return {
          ...base,
          canCreate: false,
          disabledReason,
          proposedInput: proposed.input
        };
      }
      return { ...base, canCreate: true, proposedInput: proposed.input };
    } catch (error) {
      return {
        ...base,
        canCreate: false,
        disabledReason: error instanceof Error ? error.message : "This definition is not ready."
      };
    }
  });
  return {
    templateId: template.id,
    templateUpdatedAt: template.updatedAt,
    generatedAt,
    values: normalized.values,
    fieldErrors: normalized.fieldErrors,
    entries,
    confirmableCount: entries.filter((entry) => entry.canCreate).length,
    disabledCount: entries.filter((entry) => !entry.canCreate).length
  };
}

export async function testPersonalOpsTemplate(
  id: string,
  input: TemplateTestInput,
  options: { actorId?: string; now?: Date } = {}
): Promise<TemplateTestPreview> {
  const cleanId = requiredText(id, "id", 240);
  const state = await readPersonalOpsState();
  const template = state.templates.find((item) => item.id === cleanId);
  if (!template) {
    throw new PersonalOpsStoreError("not_found", "Template not found", { status: 404 });
  }
  return templateTestFromItem(
    template,
    input,
    (options.now || new Date()).toISOString(),
    options.actorId || "admin"
  );
}

export async function instantiatePersonalOpsTemplate(
  id: string,
  input: InstantiateTemplateInput,
  options: { actorId?: string; now?: Date } = {}
): Promise<PersonalOpsTemplateInstantiationStoreResult> {
  const cleanId = requiredText(id, "id", 240);
  const key = operationKey(input.operationKey);
  assertConfirmed(input.confirmed);
  const expectedUpdatedAt = requiredText(input.expectedUpdatedAt, "expectedUpdatedAt", 120);
  const definitionId = requiredText(input.definitionId, "definitionId", 240);
  const requestFingerprint = templateRequestFingerprint(definitionId, input.values);
  const actorId = options.actorId || "admin";
  const requestedAt = (options.now || new Date()).toISOString();

  return withMutationLock(async () => {
    const state = await readPersonalOpsState();
    const index = state.templates.findIndex((item) => item.id === cleanId);
    if (index === -1) {
      throw new PersonalOpsStoreError("not_found", "Template not found", { status: 404 });
    }
    const current = state.templates[index];
    const existingUsage = current.usages.find((usage) => usage.operationKey === key);
    if (existingUsage) {
      if (
        existingUsage.definitionId !== definitionId ||
        (existingUsage.requestFingerprint !== undefined &&
          existingUsage.requestFingerprint !== requestFingerprint)
      ) {
        throw new PersonalOpsStoreError(
          "conflict",
          "This template operation key was already used with different values or a different definition.",
          { status: 409 }
        );
      }
      return { item: current, usage: existingUsage, created: false, auditEvents: [] };
    }
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new PersonalOpsStoreError(
        "stale",
        "This template changed after the test. Test it again before instantiating.",
        { status: 409 }
      );
    }
    if (current.lifecycle !== "active" || current.availability !== "active") {
      validation("Only an active, available template can be instantiated", "availability");
    }
    if (current.health === "invalid") {
      validation("Repair this invalid template before instantiating it", "health");
    }

    const now = monotonicTimestamp(current.updatedAt, requestedAt);
    const preview = templateTestFromItem(
      current,
      { values: input.values, definitionId },
      now,
      actorId
    );
    const previewEntry = preview.entries[0];
    if (!previewEntry?.canCreate) {
      validation(previewEntry?.disabledReason || "This template cannot create the selected output", "definitionId");
    }
    const definition = current.generatedDefinitions.find((item) => item.id === definitionId);
    if (!definition || definition.destination.module !== "personal_ops") {
      validation("Only core Personal Ops template destinations can be instantiated", "definitionId");
    }
    const resolvedDestination = {
      ...definition.destination,
      input: replaceTemplateValues(
        definition.destination.input,
        preview.values
      ) as PersonalOpsCreateInputByFamily[typeof definition.destination.family]
    } as PersonalOpsCoreDestinationDraft;
    const generated = buildCoreFromDestination(resolvedDestination, sourceRefFor(current), now, actorId);
    const createdRef = objectRef(generated.item);
    const usage: TemplateUsage = {
      id: `template-usage-${crypto.randomUUID()}`,
      operationKey: key,
      requestFingerprint,
      definitionId,
      usedAt: now,
      usedBy: actorId,
      values: preview.values,
      createdRef
    };
    const item: PersonalOpsTemplate = {
      ...current,
      usages: [...current.usages, usage],
      lastUsedAt: now,
      updatedAt: now,
      history: [
        ...current.history,
        historyEntry("template.instantiated", now, actorId, definition.label)
      ]
    };
    const coreAudit = moduleAuditEvent({
      item: generated.item,
      action: `${generated.item.objectType}.created_from_template`,
      actorId,
      occurredAt: now,
      before: null,
      correlationId: key
    });
    const templateAudit = moduleAuditEvent({
      item,
      action: "template.instantiated",
      actorId,
      occurredAt: now,
      before: current,
      correlationId: key
    });
    const templates = state.templates.map((existing, currentIndex) =>
      currentIndex === index ? item : existing
    );
    const auditEvents = [coreAudit, templateAudit];
    const nextState: PersonalOpsState = {
      ...state,
      ...coreCollectionsWith(state, [generated]),
      templates,
      auditEvents: appendModuleAudits(state, auditEvents)
    };
    await writeJsonFile(FILE_NAME, nextState);
    return { item, usage, created: true, auditEvents };
  });
}
