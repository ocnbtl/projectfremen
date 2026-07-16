import { readJsonFile, writeJsonFile } from "../../file-store";
import { createAuditEvent, type AuditEvent, type AuditSnapshot, type AuditSource } from "../../native-objects/audit";
import type { MutationErrorCode } from "../../native-objects/mutation-result";
import { createNativeObjectRef } from "../../native-objects/routes";
import { isModuleId, type ModuleId, type NativeObjectRef } from "../../native-objects/types";
import type { ReviewEntry } from "../../types";
import { legacyReviewSummary, legacyReviewToCreateInput } from "./legacy-adapter";
import { getReviewTemplate } from "./templates";
import {
  REVIEWS_SCHEMA_VERSION,
  REVIEW_CADENCES,
  type ReviewCadence,
  type ReviewCarryForwardItem,
  type ReviewCarryForwardMutation,
  type ReviewChecklistItem,
  type ReviewChecklistMutation,
  type ReviewChecklistState,
  type ReviewCompletionBlocker,
  type ReviewContextLink,
  type ReviewContextRelationship,
  type ReviewDecisionItem,
  type ReviewDecisionMutation,
  type ReviewDecisionState,
  type ReviewEvidenceItem,
  type ReviewEvidenceMutation,
  type ReviewEvidenceState,
  type ReviewFollowUpLink,
  type ReviewFollowUpMutation,
  type ReviewFollowUpState,
  type ReviewLegacyMapping,
  type ReviewReversibility,
  type ReviewRisk,
  type ReviewRun,
  type ReviewRunCounts,
  type ReviewRunCreateInput,
  type ReviewRunLifecycle,
  type ReviewRunPatch,
  type ReviewRunView,
  type ReviewStructuredSummary,
  type ReviewsState
} from "./types";

const FILE_NAME = "review-runs.json";
const MAX_AUDIT_EVENTS = 2000;

const RUN_LIFECYCLES: ReviewRunLifecycle[] = [
  "draft",
  "open",
  "in_progress",
  "completed",
  "archived",
  "canceled"
];
const CHECKLIST_STATES: ReviewChecklistState[] = [
  "open",
  "complete",
  "needs_evidence",
  "blocked",
  "waived",
  "carried_forward"
];
const CONTEXT_RELATIONSHIPS: ReviewContextRelationship[] = [
  "context",
  "evidence",
  "blocker_source",
  "decision_source",
  "follow_up_source",
  "carry_forward_source",
  "summary_source"
];
const EVIDENCE_STATES: ReviewEvidenceState[] = [
  "missing",
  "linked",
  "waived",
  "replaced",
  "stale",
  "duplicate",
  "carried_forward"
];
const DECISION_STATES: ReviewDecisionState[] = [
  "candidate",
  "needs_rationale",
  "needs_evidence",
  "ready_to_file",
  "filed",
  "deferred",
  "waived",
  "superseded",
  "carried_forward"
];
const FOLLOW_UP_STATES: ReviewFollowUpState[] = [
  "suggested",
  "created",
  "carried_forward",
  "dismissed",
  "completed"
];
const RISKS: ReviewRisk[] = ["low", "medium", "high"];
const REVERSIBILITIES: ReviewReversibility[] = [
  "reversible",
  "reversible_but_costly",
  "hard_to_reverse",
  "irreversible"
];

let mutationQueue: Promise<void> = Promise.resolve();

export class ReviewsStoreError extends Error {
  readonly code: MutationErrorCode;
  readonly status: number;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;

  constructor(
    code: MutationErrorCode,
    message: string,
    options: { status?: number; fieldErrors?: Readonly<Record<string, readonly string[]>> } = {}
  ) {
    super(message);
    this.name = "ReviewsStoreError";
    this.code = code;
    this.status = options.status ?? (
      code === "not_found" ? 404 : code === "stale" || code === "conflict" ? 409 : 400
    );
    this.fieldErrors = options.fieldErrors;
  }
}

export type ReviewRunCreateResult = {
  item: ReviewRun;
  view: ReviewRunView;
  auditEvent: AuditEvent;
};

export type ReviewLegacyConversionResult = {
  item: ReviewRun;
  view: ReviewRunView;
  mapping: ReviewLegacyMapping;
  created: boolean;
  auditEvent?: AuditEvent;
};

export type ReviewRunUpdateResult = {
  item: ReviewRun;
  view: ReviewRunView;
  auditEvent: AuditEvent;
};

function emptySummary(): ReviewStructuredSummary {
  return { summary: "", wins: "", blockers: "", decisions: "", carryForward: "", nextFocus: "" };
}

export function createEmptyReviewsState(): ReviewsState {
  return { schemaVersion: REVIEWS_SCHEMA_VERSION, runs: [], auditEvents: [], legacyMappings: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validation(message: string, field?: string): never {
  throw new ReviewsStoreError("validation", message, {
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

function optionalText(value: unknown, field: string, maxLength = 12000): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") validation(`${field} must be text`, field);
  const normalized = value.replace(/\u0000/g, "").trim();
  if (normalized.length > maxLength) validation(`${field} must be ${maxLength} characters or fewer`, field);
  return normalized || undefined;
}

function isoDate(value: unknown, field: string): string {
  const normalized = requiredText(value, field, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00`))) {
    validation(`${field} must use YYYY-MM-DD`, field);
  }
  return normalized;
}

function optionalDate(value: unknown, field: string): string | undefined {
  const normalized = optionalText(value, field, 120);
  if (!normalized) return undefined;
  if (Number.isNaN(Date.parse(normalized))) validation(`${field} must be a valid date or timestamp`, field);
  return normalized;
}

function booleanValue(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") validation(`${field} must be true or false`, field);
  return value;
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

function stringList(value: unknown, field: string, limit = 50): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation(`${field} must be a list`, field);
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const normalized = requiredText(item, field, 1000);
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key) || seen.size >= limit) return [];
    seen.add(key);
    return [normalized];
  });
}

function normalizeNativeRef(value: unknown, field: string): NativeObjectRef {
  if (!isRecord(value)) validation(`${field} must be a native object reference`, field);
  const module = requiredText(value.module, `${field}.module`, 40);
  if (!isModuleId(module)) validation(`${field}.module is unsupported`, `${field}.module`);
  const containerObjectId = optionalText(
    value.containerObjectId,
    `${field}.containerObjectId`,
    240
  );
  const versionId = optionalText(value.versionId, `${field}.versionId`, 240);
  return createNativeObjectRef({
    module,
    objectType: requiredText(value.objectType, `${field}.objectType`, 80),
    objectId: requiredText(value.objectId, `${field}.objectId`, 240),
    label: requiredText(value.label, `${field}.label`, 240),
    ...(containerObjectId ? { containerObjectId } : {}),
    ...(versionId ? { versionId } : {})
  });
}

function optionalNativeRef(value: unknown, field: string): NativeObjectRef | undefined {
  return value === undefined || value === null ? undefined : normalizeNativeRef(value, field);
}

function nativeRefKey(ref: NativeObjectRef): string {
  return `${ref.module}:${ref.objectType}:${ref.containerObjectId || ""}:${ref.objectId}`;
}

function assertState(value: unknown): ReviewsState {
  if (!isRecord(value) || value.schemaVersion !== REVIEWS_SCHEMA_VERSION) {
    throw new ReviewsStoreError(
      "server",
      "Reviews data uses an unsupported schema version. A migration is required before writing.",
      { status: 500 }
    );
  }
  for (const key of ["runs", "auditEvents", "legacyMappings"] as const) {
    if (!Array.isArray(value[key])) {
      throw new ReviewsStoreError("server", `Reviews data is malformed: ${key} must be a collection.`, { status: 500 });
    }
  }
  return value as unknown as ReviewsState;
}

function withMutationLock<Result>(task: () => Promise<Result>): Promise<Result> {
  const result = mutationQueue.catch(() => undefined).then(task);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function monotonicTimestamp(previous: string, candidate = new Date().toISOString()): string {
  if (candidate > previous) return candidate;
  const previousTime = Date.parse(previous);
  return Number.isNaN(previousTime) ? candidate : new Date(previousTime + 1).toISOString();
}

function cloneRun(run: ReviewRun): ReviewRun {
  return JSON.parse(JSON.stringify(run)) as ReviewRun;
}

function snapshot(run: ReviewRun | null): AuditSnapshot {
  return run ? JSON.parse(JSON.stringify(run)) as Record<string, unknown> : null;
}

function runRef(run: ReviewRun): NativeObjectRef {
  return createNativeObjectRef({
    module: "reviews",
    objectType: "review_run",
    objectId: run.id,
    label: run.title
  });
}

function auditEvent(input: {
  run: ReviewRun;
  action: string;
  actorId: string;
  occurredAt: string;
  before: ReviewRun | null;
  source?: AuditSource;
}): AuditEvent {
  return createAuditEvent({
    id: `audit-${crypto.randomUUID()}`,
    object: runRef(input.run),
    action: input.action,
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    before: snapshot(input.before),
    after: snapshot(input.run),
    source: input.source || "user"
  });
}

function appendAudit(state: ReviewsState, event: AuditEvent): AuditEvent[] {
  return [...state.auditEvents, event].slice(-MAX_AUDIT_EVENTS);
}

function resolvedCarry(run: ReviewRun, carryForwardId: string | undefined): boolean {
  if (!carryForwardId) return false;
  const carry = run.carryForward.find((item) => item.id === carryForwardId);
  return Boolean(
    carry &&
    (carry.state === "assigned" || carry.state === "resolved") &&
    (carry.destinationModule || carry.destinationReviewId) &&
    carry.ownerId.trim() &&
    carry.reason.trim() &&
    carry.nextAction.trim()
  );
}

export function isReviewEvidenceReady(run: ReviewRun, item: ReviewEvidenceItem): boolean {
  if (item.state === "linked") return Boolean(item.sourceRef);
  if (item.state === "waived") {
    return Boolean(item.waiver?.reason.trim() && item.waiver.riskNote.trim() && item.waiver.waivedBy);
  }
  if (item.state === "replaced") {
    return Boolean(
      item.replacement?.replacementSourceRef &&
      item.replacement.reason.trim() &&
      item.replacement.reviewed &&
      item.replacement.reviewedAt &&
      item.replacement.reviewedBy
    );
  }
  return item.state === "carried_forward" && resolvedCarry(run, item.carryForwardId);
}

function decisionResolved(run: ReviewRun, item: ReviewDecisionItem): boolean {
  if (item.state === "filed") return Boolean(item.destinationRef && item.filedAt && item.filedBy);
  if (item.state === "deferred") {
    return Boolean(
      item.resolution.deferUntil &&
      item.resolution.deferReason?.trim() &&
      item.resolution.futureDestination?.trim() &&
      item.ownerId.trim()
    );
  }
  if (item.state === "waived") {
    return Boolean(item.resolution.waiverReason?.trim() && item.resolution.waiverRiskNote?.trim());
  }
  if (item.state === "superseded") return Boolean(item.resolution.supersededByRef);
  return item.state === "carried_forward" && resolvedCarry(run, item.resolution.carryForwardId);
}

function followUpResolved(run: ReviewRun, item: ReviewFollowUpLink): boolean {
  if (item.state === "created" || item.state === "completed") return Boolean(item.createdObjectRef);
  if (item.state === "dismissed") return Boolean(item.dismissReason?.trim());
  return item.state === "carried_forward" && resolvedCarry(run, item.carryForwardId);
}

function checklistResolved(run: ReviewRun, item: ReviewChecklistItem): boolean {
  if (item.state === "waived") return Boolean(item.waiverAllowed && item.waiverReason?.trim());
  if (item.state === "carried_forward") {
    return Boolean(item.carryForwardAllowed && resolvedCarry(run, item.carryForwardId));
  }
  if (item.state !== "complete") return false;
  if (item.evidenceRequirementIds.some((id) => {
    const evidence = run.evidence.find((candidate) => candidate.requirementId === id);
    return !evidence || !isReviewEvidenceReady(run, evidence);
  })) return false;
  if (item.definitionId === "decisions-filed") {
    return run.decisions.every((decision) => !decision.blocksCompletion || decisionResolved(run, decision));
  }
  if (item.definitionId === "followups-scheduled") {
    return run.followUps.every((followUp) => !followUp.blocksCompletion || followUpResolved(run, followUp));
  }
  if (item.definitionId === "carry-forward-confirmed" || item.definitionId === "carry-forward-assigned") {
    return run.carryForward.every((carry) => resolvedCarry(run, carry.id));
  }
  return true;
}

export function deriveReviewCompletionBlockers(run: ReviewRun): ReviewCompletionBlocker[] {
  const blockers: ReviewCompletionBlocker[] = [];
  for (const item of run.checklist) {
    if (item.required && !checklistResolved(run, item)) {
      blockers.push({
        id: `checklist:${item.id}`,
        type: "checklist",
        sourceItemId: item.id,
        label: `${item.label} is unresolved`,
        routeTab: item.ownerModule === "finance" && run.cadence === "monthly" ? "finance" : "checklist",
        severity: "blocking"
      });
    }
  }
  for (const item of run.evidence) {
    if (item.blocksCompletion && !isReviewEvidenceReady(run, item)) {
      blockers.push({
        id: `evidence:${item.id}`,
        type: "evidence",
        sourceItemId: item.id,
        label: `${item.title} is unresolved`,
        routeTab: item.ownerModule === "finance" && run.cadence === "monthly" ? "finance" : "evidence",
        severity: "blocking"
      });
    }
  }
  for (const item of run.decisions) {
    if (item.blocksCompletion && !decisionResolved(run, item)) {
      blockers.push({
        id: `decision:${item.id}`,
        type: "decision",
        sourceItemId: item.id,
        label: `${item.title} needs a durable resolution`,
        routeTab: "decisions",
        severity: "blocking"
      });
    }
  }
  for (const item of run.followUps) {
    if (item.blocksCompletion && !followUpResolved(run, item)) {
      blockers.push({
        id: `follow-up:${item.id}`,
        type: "follow_up",
        sourceItemId: item.id,
        label: `${item.title} needs creation or carry-forward`,
        routeTab: "follow-ups",
        severity: "blocking"
      });
    }
  }
  for (const item of run.carryForward) {
    if (!resolvedCarry(run, item.id)) {
      blockers.push({
        id: `carry-forward:${item.id}`,
        type: "carry_forward",
        sourceItemId: item.id,
        label: `${item.title} needs destination, owner, reason, and next action`,
        routeTab: "follow-ups",
        severity: "blocking"
      });
    }
  }
  if (!run.summary.summary.trim()) {
    blockers.push({
      id: "summary:summary",
      type: "summary",
      sourceItemId: "summary",
      label: "Review summary is required",
      routeTab: "overview",
      severity: "blocking"
    });
  }
  if (run.cadence === "monthly" && !run.summary.nextFocus.trim()) {
    blockers.push({
      id: "summary:next-focus",
      type: "summary",
      sourceItemId: "nextFocus",
      label: "Next month focus is required",
      routeTab: "overview",
      severity: "blocking"
    });
  }
  if (run.cadence === "monthly") {
    blockers.push({
      id: "external-gate:finance-close",
      type: "external_gate",
      sourceItemId: "finance-close",
      label: "Finance close readiness cannot yet be verified from the read-only Finance preview",
      routeTab: "finance",
      severity: "blocking"
    });
  }
  return blockers;
}

export function deriveReviewRunCounts(run: ReviewRun): ReviewRunCounts {
  const blockers = deriveReviewCompletionBlockers(run);
  const required = run.checklist.filter((item) => item.required);
  return {
    requiredChecks: required.length,
    resolvedRequiredChecks: required.filter((item) => checklistResolved(run, item)).length,
    evidenceLinked: run.evidence.filter((item) => isReviewEvidenceReady(run, item)).length,
    evidenceMissing: run.evidence.filter((item) => item.required && !isReviewEvidenceReady(run, item)).length,
    decisionsOpen: run.decisions.filter((item) => !decisionResolved(run, item)).length,
    decisionsFiled: run.decisions.filter((item) => item.state === "filed" && decisionResolved(run, item)).length,
    decisionsResolved: run.decisions.filter((item) => decisionResolved(run, item)).length,
    followUpsOpen: run.followUps.filter((item) => !followUpResolved(run, item)).length,
    followUpsCreated: run.followUps.filter((item) => (item.state === "created" || item.state === "completed") && item.createdObjectRef).length,
    carryForwardOpen: run.carryForward.filter((item) => !resolvedCarry(run, item.id)).length,
    contextLinks: run.contextLinks.filter((link) => link.state !== "removed").length,
    blockers: blockers.length
  };
}

export function toReviewRunView(run: ReviewRun): ReviewRunView {
  const blockers = deriveReviewCompletionBlockers(run);
  return { run, blockers, counts: deriveReviewRunCounts(run), canComplete: blockers.length === 0 };
}

function instantiateRun(input: ReviewRunCreateInput, now: string, state: ReviewsState): ReviewRun {
  const cadence = enumValue(input.cadence, REVIEW_CADENCES, "weekly", "cadence");
  const periodStart = isoDate(input.periodStart, "periodStart");
  const periodEnd = isoDate(input.periodEnd, "periodEnd");
  if (periodStart > periodEnd) validation("periodEnd must be on or after periodStart", "periodEnd");
  const template = getReviewTemplate(cadence);
  const shortId = crypto.randomUUID().slice(0, 8);
  const id = cadence === "weekly"
    ? `rev-wk-${periodEnd}-${shortId}`
    : `rev-mo-${periodStart.slice(0, 7)}-${shortId}`;
  const currentWasProvided = input.current !== undefined;
  const requestedCurrent = booleanValue(input.current, false, "current");
  const hasCurrent = state.runs.some(
    (run) =>
      run.cadence === cadence &&
      run.current &&
      run.lifecycle !== "archived" &&
      run.lifecycle !== "completed" &&
      run.lifecycle !== "canceled"
  );
  if (requestedCurrent && hasCurrent) {
    throw new ReviewsStoreError(
      "conflict",
      `A current ${cadence} ReviewRun already exists. Continue it or create this review as scheduled.`,
      { status: 409 }
    );
  }
  const current = currentWasProvided ? requestedCurrent : !hasCurrent;
  const checklist: ReviewChecklistItem[] = template.checklist.map((definition) => ({
    id: `${id}:check:${definition.id}`,
    definitionId: definition.id,
    label: definition.label,
    description: definition.description,
    required: definition.required,
    state: definition.evidence ? "needs_evidence" : "open",
    ...(definition.ownerModule ? { ownerModule: definition.ownerModule } : {}),
    action: definition.action,
    evidenceRequired: Boolean(definition.evidence?.required),
    evidenceRequirementIds: definition.evidence ? [definition.evidence.id] : [],
    carryForwardAllowed: definition.carryForwardAllowed,
    waiverAllowed: definition.waiverAllowed,
    createdAt: now,
    updatedAt: now
  }));
  const evidence: ReviewEvidenceItem[] = template.checklist.flatMap((definition) => definition.evidence ? [{
    id: `${id}:evidence:${definition.evidence.id}`,
    requirementId: definition.evidence.id,
    title: definition.evidence.title,
    description: definition.evidence.description,
    required: definition.evidence.required,
    blocksCompletion: definition.evidence.blocksCompletion,
    ownerModule: definition.evidence.ownerModule,
    allowedSourceModules: [...definition.evidence.allowedSourceModules],
    relationship: definition.evidence.relationship,
    state: "missing" as const,
    dependencyIds: [`${id}:check:${definition.id}`],
    createdAt: now,
    updatedAt: now
  }] : []);
  return {
    id,
    templateId: template.id,
    templateVersion: template.version,
    cadence,
    title: optionalText(input.title, "title", 240) || template.title,
    periodStart,
    periodEnd,
    dueAt: optionalDate(input.dueAt, "dueAt"),
    nextReviewAt: optionalDate(input.nextReviewAt, "nextReviewAt"),
    ownerId: optionalText(input.ownerId, "ownerId", 120) || "admin",
    lifecycle: "open",
    current,
    summary: emptySummary(),
    checklist,
    contextLinks: [],
    evidence,
    decisions: [],
    followUps: [],
    carryForward: [],
    createdAt: now,
    updatedAt: now
  };
}

export async function readReviewsState(): Promise<ReviewsState> {
  return assertState(await readJsonFile<unknown>(FILE_NAME, createEmptyReviewsState()));
}

export async function listReviewRuns(options: { includeArchived?: boolean } = {}): Promise<ReviewRun[]> {
  const state = await readReviewsState();
  return [...state.runs]
    .filter((run) => options.includeArchived || run.lifecycle !== "archived")
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd) || right.createdAt.localeCompare(left.createdAt));
}

export async function readReviewRun(id: string): Promise<ReviewRun | null> {
  const state = await readReviewsState();
  return state.runs.find((run) => run.id === id) || null;
}

export async function createReviewRun(
  input: ReviewRunCreateInput,
  options: { actorId?: string } = {}
): Promise<ReviewRunCreateResult> {
  return withMutationLock(async () => {
    const state = await readReviewsState();
    const now = new Date().toISOString();
    const item = instantiateRun(input, now, state);
    const event = auditEvent({ run: item, action: "review_run.created", actorId: options.actorId || "admin", occurredAt: now, before: null });
    await writeJsonFile(FILE_NAME, {
      ...state,
      runs: [item, ...state.runs],
      auditEvents: appendAudit(state, event)
    } satisfies ReviewsState);
    return { item, view: toReviewRunView(item), auditEvent: event };
  });
}

export async function convertLegacyReviewEntry(
  entry: ReviewEntry,
  options: { actorId?: string } = {}
): Promise<ReviewLegacyConversionResult> {
  return withMutationLock(async () => {
    const state = await readReviewsState();
    const actorId = options.actorId || "admin";
    const existingMapping = state.legacyMappings.find((mapping) => mapping.legacyReviewEntryId === entry.id);
    if (existingMapping) {
      const existingRun = state.runs.find((run) => run.id === existingMapping.nativeReviewRunId);
      if (!existingRun) throw new ReviewsStoreError("server", "Legacy review mapping points to a missing ReviewRun.", { status: 500 });
      return { item: existingRun, view: toReviewRunView(existingRun), mapping: existingMapping, created: false };
    }
    const now = new Date().toISOString();
    const item = instantiateRun(legacyReviewToCreateInput(entry), now, state);
    item.summary = legacyReviewSummary(entry);
    item.legacyReviewEntryId = entry.id;
    const mapping: ReviewLegacyMapping = {
      id: `review-mapping-${crypto.randomUUID()}`,
      legacyReviewEntryId: entry.id,
      nativeReviewRunId: item.id,
      cadence: entry.kind,
      scheduledFor: entry.scheduledFor,
      mappedAt: now,
      mappedBy: actorId
    };
    const event = auditEvent({
      run: item,
      action: "review_run.legacy_converted",
      actorId,
      occurredAt: now,
      before: null,
      source: "migration"
    });
    await writeJsonFile(FILE_NAME, {
      ...state,
      runs: [item, ...state.runs],
      legacyMappings: [...state.legacyMappings, mapping],
      auditEvents: appendAudit(state, event)
    } satisfies ReviewsState);
    return { item, view: toReviewRunView(item), mapping, created: true, auditEvent: event };
  });
}

function requireCarry(run: ReviewRun, id: string | undefined, field: string): string {
  const normalized = requiredText(id, field, 240);
  if (!resolvedCarry(run, normalized)) validation(`${field} must reference an assigned carry-forward item`, field);
  return normalized;
}

function requestedChecklistState(run: ReviewRun, item: ReviewChecklistItem, input: ReviewChecklistMutation): ReviewChecklistState {
  const requested = enumValue(input.state, CHECKLIST_STATES, item.state, "checklist.state");
  if (requested === "waived") {
    if (!item.waiverAllowed) validation("This checklist item cannot be waived", "checklist.state");
    requiredText(input.waiverReason, "checklist.waiverReason", 2000);
  }
  if (requested === "carried_forward") {
    if (!item.carryForwardAllowed) validation("This checklist item cannot be carried forward", "checklist.state");
    requireCarry(run, input.carryForwardId, "checklist.carryForwardId");
  }
  if (requested !== "complete") return requested;
  if (item.evidenceRequirementIds.some((requirementId) => {
    const evidence = run.evidence.find((candidate) => candidate.requirementId === requirementId);
    return !evidence || !isReviewEvidenceReady(run, evidence);
  })) return "needs_evidence";
  if (item.definitionId === "decisions-filed" && run.decisions.some((decision) => decision.blocksCompletion && !decisionResolved(run, decision))) return "blocked";
  if (item.definitionId === "followups-scheduled" && run.followUps.some((followUp) => followUp.blocksCompletion && !followUpResolved(run, followUp))) return "blocked";
  if ((item.definitionId === "carry-forward-confirmed" || item.definitionId === "carry-forward-assigned") && run.carryForward.some((carry) => !resolvedCarry(run, carry.id))) return "blocked";
  return "complete";
}

function addContext(run: ReviewRun, sourceRef: NativeObjectRef, relationship: ReviewContextRelationship, now: string, actorId: string) {
  const key = nativeRefKey(sourceRef);
  const existing = run.contextLinks.find((link) => nativeRefKey(link.sourceRef) === key);
  if (existing) {
    existing.sourceRef = sourceRef;
    existing.lastKnownLabel = sourceRef.label;
    existing.sourceVersion = sourceRef.versionId;
    existing.relationship = relationship === "context" ? existing.relationship : relationship;
    existing.state = "linked";
    existing.removedAt = undefined;
    existing.linkedAt = now;
    existing.linkedBy = actorId;
    return;
  }
  run.contextLinks.push({
    id: `review-context-${crypto.randomUUID()}`,
    sourceRef,
    relationship,
    state: "linked",
    linkedAt: now,
    linkedBy: actorId,
    lastKnownLabel: sourceRef.label,
    ...(sourceRef.versionId ? { sourceVersion: sourceRef.versionId } : {})
  });
}

function mutateEvidence(run: ReviewRun, input: ReviewEvidenceMutation, now: string, actorId: string) {
  const id = requiredText(input.evidenceId, "evidence.evidenceId", 240);
  const item = run.evidence.find((candidate) => candidate.id === id);
  if (!item) throw new ReviewsStoreError("not_found", "Review evidence item not found", { status: 404 });
  const previousSourceRef = item.sourceRef;
  const state = enumValue(input.state, EVIDENCE_STATES, item.state, "evidence.state");
  item.state = state;
  item.sourceRef = undefined;
  item.waiver = undefined;
  item.replacement = undefined;
  item.carryForwardId = undefined;
  item.duplicateOfId = undefined;
  if (state === "linked") {
    const sourceRef = normalizeNativeRef(input.sourceRef, "evidence.sourceRef");
    if (!item.allowedSourceModules.includes(sourceRef.module)) {
      validation("The selected source module is not allowed for this evidence requirement", "evidence.sourceRef.module");
    }
    item.sourceRef = sourceRef;
    addContext(run, sourceRef, "evidence", now, actorId);
  } else if (state === "waived") {
    const template = getReviewTemplate(run.cadence);
    const waiverAllowed =
      template.id === run.templateId &&
      template.version === run.templateVersion &&
      template.checklist.some(
        (definition) =>
          definition.evidence?.id === item.requirementId && definition.waiverAllowed
      );
    if (!waiverAllowed) {
      validation(
        "This evidence requirement cannot be waived by its Review template",
        "evidence.state"
      );
    }
    if (!input.waiver) validation("evidence.waiver is required", "evidence.waiver");
    item.waiver = {
      reason: requiredText(input.waiver.reason, "evidence.waiver.reason", 4000),
      riskNote: requiredText(input.waiver.riskNote, "evidence.waiver.riskNote", 4000),
      waivedBy: actorId,
      waivedAt: now
    };
  } else if (state === "replaced") {
    if (!input.replacement) validation("evidence.replacement is required", "evidence.replacement");
    const replacementSourceRef = normalizeNativeRef(input.replacement.replacementSourceRef, "evidence.replacement.replacementSourceRef");
    if (!item.allowedSourceModules.includes(replacementSourceRef.module)) {
      validation("The replacement source module is not allowed for this evidence requirement", "evidence.replacement.replacementSourceRef.module");
    }
    item.replacement = {
      previousSourceRef,
      replacementSourceRef,
      reason: requiredText(input.replacement.reason, "evidence.replacement.reason", 4000),
      reviewed: booleanValue(input.replacement.reviewed, false, "evidence.replacement.reviewed"),
      ...(input.replacement.reviewed ? { reviewedAt: now, reviewedBy: actorId } : {})
    };
    addContext(run, replacementSourceRef, "evidence", now, actorId);
  } else if (state === "carried_forward") {
    item.carryForwardId = requireCarry(run, input.carryForwardId, "evidence.carryForwardId");
  } else if (state === "duplicate") {
    const duplicateOfId = requiredText(input.duplicateOfId, "evidence.duplicateOfId", 240);
    if (duplicateOfId === item.id || !run.evidence.some((candidate) => candidate.id === duplicateOfId)) {
      validation("evidence.duplicateOfId must reference another evidence item", "evidence.duplicateOfId");
    }
    item.duplicateOfId = duplicateOfId;
  }
  item.updatedAt = now;
}

function normalizeDecision(run: ReviewRun, input: ReviewDecisionMutation, now: string, actorId: string): ReviewDecisionItem {
  const state = enumValue(input.state, DECISION_STATES, "candidate", "decision.state");
  const risk = enumValue(input.risk, RISKS, "medium", "decision.risk");
  const sourceRef = normalizeNativeRef(input.sourceRef, "decision.sourceRef");
  const destinationModule = requiredText(input.destinationModule, "decision.destinationModule", 40);
  if (!isModuleId(destinationModule)) validation("decision.destinationModule is unsupported", "decision.destinationModule");
  if (destinationModule !== "personal_ops") {
    validation(
      "Durable review Decisions must be filed in Personal Ops",
      "decision.destinationModule"
    );
  }
  const destinationRef = optionalNativeRef(input.destinationRef, "decision.destinationRef");
  if (destinationRef && (destinationRef.module !== "personal_ops" || destinationRef.objectType !== "decision")) {
    validation(
      "decision.destinationRef must reference a Personal Ops Decision",
      "decision.destinationRef"
    );
  }
  const rationale = optionalText(input.rationale, "decision.rationale", 12000) || "";
  const evidenceIds = stringList(input.evidenceIds, "decision.evidenceIds").filter((id) => run.evidence.some((item) => item.id === id));
  const resolution = isRecord(input.resolution) ? input.resolution : {};
  const normalizedResolution = {
    deferUntil: optionalDate(resolution.deferUntil, "decision.resolution.deferUntil"),
    deferReason: optionalText(resolution.deferReason, "decision.resolution.deferReason", 4000),
    futureDestination: optionalText(resolution.futureDestination, "decision.resolution.futureDestination", 500),
    waiverReason: optionalText(resolution.waiverReason, "decision.resolution.waiverReason", 4000),
    waiverRiskNote: optionalText(resolution.waiverRiskNote, "decision.resolution.waiverRiskNote", 4000),
    supersededByRef: optionalNativeRef(resolution.supersededByRef, "decision.resolution.supersededByRef"),
    carryForwardId: optionalText(resolution.carryForwardId, "decision.resolution.carryForwardId", 240)
  };
  const ownerId = requiredText(input.ownerId, "decision.ownerId", 120);
  if (state === "filed") {
    if (!destinationRef) validation("A filed decision requires a durable destination reference", "decision.destinationRef");
    if (!rationale) validation("A filed decision requires rationale", "decision.rationale");
    if (risk === "high" && !evidenceIds.some((id) => {
      const evidence = run.evidence.find((item) => item.id === id);
      return evidence && isReviewEvidenceReady(run, evidence);
    })) validation("A high-risk decision requires ready evidence before filing", "decision.evidenceIds");
  } else if (state === "deferred") {
    if (!normalizedResolution.deferUntil || !normalizedResolution.deferReason || !normalizedResolution.futureDestination) {
      validation("A deferred decision requires a date, reason, and future destination", "decision.resolution");
    }
  } else if (state === "waived") {
    if (!normalizedResolution.waiverReason || !normalizedResolution.waiverRiskNote) {
      validation("A waived decision requires a reason and risk note", "decision.resolution");
    }
  } else if (state === "superseded" && !normalizedResolution.supersededByRef) {
    validation("A superseded decision requires a replacement reference", "decision.resolution.supersededByRef");
  } else if (state === "carried_forward") {
    normalizedResolution.carryForwardId = requireCarry(run, normalizedResolution.carryForwardId, "decision.resolution.carryForwardId");
  }
  const existing = input.id ? run.decisions.find((item) => item.id === input.id) : undefined;
  return {
    id: existing?.id || `review-decision-${crypto.randomUUID()}`,
    title: requiredText(input.title, "decision.title", 500),
    question: requiredText(input.question, "decision.question", 2000),
    sourceRef,
    destinationModule,
    destinationObjectType: requiredText(input.destinationObjectType, "decision.destinationObjectType", 120),
    ...(destinationRef ? { destinationRef } : {}),
    state,
    ownerId,
    risk,
    impact: enumValue(input.impact, RISKS, "medium", "decision.impact"),
    confidence: enumValue(input.confidence, RISKS, "medium", "decision.confidence"),
    reversibility: enumValue(input.reversibility, REVERSIBILITIES, "reversible", "decision.reversibility"),
    dueDate: optionalDate(input.dueDate, "decision.dueDate"),
    reviewDate: optionalDate(input.reviewDate, "decision.reviewDate"),
    rationale,
    recommendation: optionalText(input.recommendation, "decision.recommendation", 12000) || "",
    alternatives: stringList(input.alternatives, "decision.alternatives", 20),
    reversalCondition: optionalText(input.reversalCondition, "decision.reversalCondition", 4000) || "",
    evidenceIds,
    required: booleanValue(input.required, true, "decision.required"),
    blocksCompletion: booleanValue(input.blocksCompletion, true, "decision.blocksCompletion"),
    resolution: normalizedResolution,
    ...(state === "filed" ? { filedAt: existing?.filedAt || now, filedBy: existing?.filedBy || actorId } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function upsertDecision(run: ReviewRun, input: ReviewDecisionMutation, now: string, actorId: string) {
  const normalized = normalizeDecision(run, input, now, actorId);
  const key = `${nativeRefKey(normalized.sourceRef)}:${normalized.title.toLocaleLowerCase().replace(/\s+/g, " ")}`;
  const index = run.decisions.findIndex((item) => item.id === normalized.id || `${nativeRefKey(item.sourceRef)}:${item.title.toLocaleLowerCase().replace(/\s+/g, " ")}` === key);
  if (index >= 0) {
    if (run.decisions[index].state === "filed" && normalized.state !== "filed") {
      validation("A filed decision cannot return to candidate state; supersede it or create a new candidate", "decision.state");
    }
    normalized.id = run.decisions[index].id;
    normalized.createdAt = run.decisions[index].createdAt;
    normalized.filedAt = normalized.filedAt || run.decisions[index].filedAt;
    normalized.filedBy = normalized.filedBy || run.decisions[index].filedBy;
    run.decisions[index] = normalized;
  } else {
    run.decisions.push(normalized);
  }
  addContext(run, normalized.sourceRef, "decision_source", now, actorId);
}

function normalizeFollowUp(run: ReviewRun, input: ReviewFollowUpMutation, now: string): ReviewFollowUpLink {
  const state = enumValue(input.state, FOLLOW_UP_STATES, "suggested", "followUp.state");
  const sourceRef = normalizeNativeRef(input.sourceRef, "followUp.sourceRef");
  const destinationModule = requiredText(input.destinationModule, "followUp.destinationModule", 40);
  if (!isModuleId(destinationModule)) validation("followUp.destinationModule is unsupported", "followUp.destinationModule");
  if (destinationModule !== "personal_ops") {
    validation(
      "Actionable review Follow-ups must be created in Personal Ops",
      "followUp.destinationModule"
    );
  }
  const createdObjectRef = optionalNativeRef(input.createdObjectRef, "followUp.createdObjectRef");
  if (createdObjectRef && (createdObjectRef.module !== "personal_ops" || createdObjectRef.objectType !== "follow_up")) {
    validation(
      "followUp.createdObjectRef must reference a Personal Ops Follow-up",
      "followUp.createdObjectRef"
    );
  }
  const carryForwardId = optionalText(input.carryForwardId, "followUp.carryForwardId", 240);
  const dismissReason = optionalText(input.dismissReason, "followUp.dismissReason", 4000);
  if ((state === "created" || state === "completed") && !createdObjectRef) {
    validation("A created or completed follow-up requires its durable object reference", "followUp.createdObjectRef");
  }
  if (state === "carried_forward") requireCarry(run, carryForwardId, "followUp.carryForwardId");
  if (state === "dismissed" && !dismissReason) validation("A dismissed follow-up requires a reason", "followUp.dismissReason");
  const existing = input.id ? run.followUps.find((item) => item.id === input.id) : undefined;
  return {
    id: existing?.id || `review-follow-up-${crypto.randomUUID()}`,
    title: requiredText(input.title, "followUp.title", 500),
    sourceRef,
    destinationModule,
    ownerId: optionalText(input.ownerId, "followUp.ownerId", 120),
    dueDate: optionalDate(input.dueDate, "followUp.dueDate"),
    state,
    ...(createdObjectRef ? { createdObjectRef } : {}),
    ...(carryForwardId ? { carryForwardId } : {}),
    ...(dismissReason ? { dismissReason } : {}),
    required: booleanValue(input.required, true, "followUp.required"),
    blocksCompletion: booleanValue(input.blocksCompletion, true, "followUp.blocksCompletion"),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function upsertFollowUp(run: ReviewRun, input: ReviewFollowUpMutation, now: string, actorId: string) {
  const normalized = normalizeFollowUp(run, input, now);
  const key = normalized.createdObjectRef
    ? `created:${nativeRefKey(normalized.createdObjectRef)}`
    : `source:${nativeRefKey(normalized.sourceRef)}:${normalized.title.toLocaleLowerCase().replace(/\s+/g, " ")}`;
  const index = run.followUps.findIndex((item) => item.id === normalized.id || (
    item.createdObjectRef
      ? key === `created:${nativeRefKey(item.createdObjectRef)}`
      : key === `source:${nativeRefKey(item.sourceRef)}:${item.title.toLocaleLowerCase().replace(/\s+/g, " ")}`
  ));
  if (index >= 0) {
    normalized.id = run.followUps[index].id;
    normalized.createdAt = run.followUps[index].createdAt;
    run.followUps[index] = normalized;
  } else {
    run.followUps.push(normalized);
  }
  addContext(run, normalized.sourceRef, "follow_up_source", now, actorId);
}

function normalizeCarryForward(run: ReviewRun, input: ReviewCarryForwardMutation, now: string): ReviewCarryForwardItem {
  const sourceType = enumValue(input.sourceType, ["checklist", "evidence", "decision", "follow_up", "summary"] as const, "summary", "carryForward.sourceType");
  const destinationModuleText = optionalText(input.destinationModule, "carryForward.destinationModule", 40);
  if (destinationModuleText && !isModuleId(destinationModuleText)) validation("carryForward.destinationModule is unsupported", "carryForward.destinationModule");
  const destinationModule: ModuleId | undefined = destinationModuleText && isModuleId(destinationModuleText)
    ? destinationModuleText
    : undefined;
  const destinationReviewId = optionalText(input.destinationReviewId, "carryForward.destinationReviewId", 240);
  if (!destinationModuleText && !destinationReviewId) {
    validation("Carry-forward requires a destination module or destination ReviewRun", "carryForward.destinationModule");
  }
  const existing = input.id ? run.carryForward.find((item) => item.id === input.id) : undefined;
  return {
    id: existing?.id || `review-carry-${crypto.randomUUID()}`,
    title: requiredText(input.title, "carryForward.title", 500),
    sourceType,
    sourceId: requiredText(input.sourceId, "carryForward.sourceId", 240),
    sourceRef: optionalNativeRef(input.sourceRef, "carryForward.sourceRef"),
    ...(destinationModule ? { destinationModule } : {}),
    ...(destinationReviewId ? { destinationReviewId } : {}),
    destinationObjectType: optionalText(input.destinationObjectType, "carryForward.destinationObjectType", 120),
    destinationObjectRef: optionalNativeRef(input.destinationObjectRef, "carryForward.destinationObjectRef"),
    ownerId: requiredText(input.ownerId, "carryForward.ownerId", 120),
    reason: requiredText(input.reason, "carryForward.reason", 4000),
    nextAction: requiredText(input.nextAction, "carryForward.nextAction", 4000),
    dueDate: optionalDate(input.dueDate, "carryForward.dueDate"),
    state: enumValue(input.state, ["pending", "assigned", "resolved"] as const, "assigned", "carryForward.state"),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    ...(input.state === "resolved" ? { resolvedAt: now } : {})
  };
}

function upsertCarryForward(run: ReviewRun, input: ReviewCarryForwardMutation, now: string, actorId: string) {
  const normalized = normalizeCarryForward(run, input, now);
  const index = run.carryForward.findIndex((item) => item.id === normalized.id || (
    item.sourceType === normalized.sourceType && item.sourceId === normalized.sourceId
  ));
  if (index >= 0) {
    normalized.id = run.carryForward[index].id;
    normalized.createdAt = run.carryForward[index].createdAt;
    run.carryForward[index] = normalized;
  } else {
    run.carryForward.push(normalized);
  }
  if (normalized.sourceRef) addContext(run, normalized.sourceRef, "carry_forward_source", now, actorId);
}

function normalizePatch(value: unknown): ReviewRunPatch {
  if (!isRecord(value)) validation("patch must be an object", "patch");
  const action = requiredText(value.action, "patch.action", 80);
  if (![
    "update_summary",
    "update_checklist",
    "link_context",
    "unlink_context",
    "update_evidence",
    "upsert_decision",
    "upsert_follow_up",
    "upsert_carry_forward",
    "complete",
    "archive",
    "restore"
  ].includes(action)) validation("patch.action is unsupported", "patch.action");
  return value as unknown as ReviewRunPatch;
}

function applyPatch(run: ReviewRun, rawPatch: unknown, now: string, actorId: string): { run: ReviewRun; action: string } {
  const patch = normalizePatch(rawPatch);
  const next = cloneRun(run);
  if (run.lifecycle === "archived" && patch.action !== "restore") {
    throw new ReviewsStoreError("conflict", "Archived ReviewRuns are read-only until restored.", { status: 409 });
  }
  if (run.lifecycle === "completed" && patch.action !== "archive") {
    throw new ReviewsStoreError("conflict", "Completed ReviewRuns are read-only. Reopen behavior is not approved.", { status: 409 });
  }
  if (run.lifecycle === "canceled") {
    throw new ReviewsStoreError("conflict", "Canceled ReviewRuns are read-only.", { status: 409 });
  }
  if (patch.action === "update_summary") {
    if (!isRecord(patch.summary)) validation("summary must be an object", "summary");
    for (const field of ["summary", "wins", "blockers", "decisions", "carryForward", "nextFocus"] as const) {
      if (patch.summary[field] !== undefined) next.summary[field] = optionalText(patch.summary[field], `summary.${field}`, 16000) || "";
    }
  } else if (patch.action === "update_checklist") {
    if (!isRecord(patch.checklist)) validation("checklist must be an object", "checklist");
    const itemId = requiredText(patch.checklist.itemId, "checklist.itemId", 240);
    const item = next.checklist.find((candidate) => candidate.id === itemId);
    if (!item) throw new ReviewsStoreError("not_found", "Review checklist item not found", { status: 404 });
    item.state = requestedChecklistState(next, item, patch.checklist);
    item.waiverReason = item.state === "waived" ? requiredText(patch.checklist.waiverReason, "checklist.waiverReason", 2000) : undefined;
    item.carryForwardId = item.state === "carried_forward" ? patch.checklist.carryForwardId : undefined;
    item.completedAt = item.state === "complete" ? now : undefined;
    item.completedBy = item.state === "complete" ? actorId : undefined;
    item.updatedAt = now;
  } else if (patch.action === "link_context") {
    addContext(
      next,
      normalizeNativeRef(patch.sourceRef, "sourceRef"),
      enumValue(patch.relationship, CONTEXT_RELATIONSHIPS, "context", "relationship"),
      now,
      actorId
    );
  } else if (patch.action === "unlink_context") {
    const contextLinkId = requiredText(patch.contextLinkId, "contextLinkId", 240);
    const link = next.contextLinks.find((candidate) => candidate.id === contextLinkId);
    if (!link) throw new ReviewsStoreError("not_found", "Review context link not found", { status: 404 });
    link.state = "removed";
    link.removedAt = now;
  } else if (patch.action === "update_evidence") {
    if (!isRecord(patch.evidence)) validation("evidence must be an object", "evidence");
    mutateEvidence(next, patch.evidence, now, actorId);
  } else if (patch.action === "upsert_decision") {
    if (!isRecord(patch.decision)) validation("decision must be an object", "decision");
    upsertDecision(next, patch.decision, now, actorId);
  } else if (patch.action === "upsert_follow_up") {
    if (!isRecord(patch.followUp)) validation("followUp must be an object", "followUp");
    upsertFollowUp(next, patch.followUp, now, actorId);
  } else if (patch.action === "upsert_carry_forward") {
    if (!isRecord(patch.carryForward)) validation("carryForward must be an object", "carryForward");
    upsertCarryForward(next, patch.carryForward, now, actorId);
  } else if (patch.action === "complete") {
    const blockers = deriveReviewCompletionBlockers(next);
    if (blockers.length) {
      throw new ReviewsStoreError("conflict", `ReviewRun cannot be completed while ${blockers.length} blocking requirement${blockers.length === 1 ? " remains" : "s remain"}.`, {
        status: 409,
        fieldErrors: { completion: blockers.map((blocker) => blocker.label) }
      });
    }
    next.lifecycle = "completed";
    next.current = false;
    next.completedAt = now;
    next.completedBy = actorId;
  } else if (patch.action === "archive") {
    const reason = requiredText(patch.reason, "reason", 4000);
    next.lifecycleBeforeArchive = next.lifecycle === "archived" ? next.lifecycleBeforeArchive : next.lifecycle;
    next.lifecycle = "archived";
    next.current = false;
    next.archivedAt = now;
    next.archivedBy = actorId;
    next.archiveReason = reason;
  } else if (patch.action === "restore") {
    if (run.lifecycle !== "archived") validation("Only archived ReviewRuns can be restored", "patch.action");
    next.lifecycle = run.lifecycleBeforeArchive || "open";
    next.lifecycleBeforeArchive = undefined;
    next.archivedAt = undefined;
    next.archivedBy = undefined;
    next.archiveReason = undefined;
  }
  if (next.lifecycle === "open" && patch.action !== "archive" && patch.action !== "restore") next.lifecycle = "in_progress";
  next.updatedAt = monotonicTimestamp(run.updatedAt, now);
  return { run: next, action: `review_run.${patch.action}` };
}

export async function updateReviewRun(
  id: string,
  rawPatch: unknown,
  options: { expectedUpdatedAt: string; actorId?: string }
): Promise<ReviewRunUpdateResult> {
  return withMutationLock(async () => {
    const state = await readReviewsState();
    const index = state.runs.findIndex((run) => run.id === id);
    if (index < 0) throw new ReviewsStoreError("not_found", "ReviewRun not found", { status: 404 });
    const before = state.runs[index];
    if (!options.expectedUpdatedAt || before.updatedAt !== options.expectedUpdatedAt) {
      throw new ReviewsStoreError("stale", "This ReviewRun changed after it was loaded. Refresh before retrying.", { status: 409 });
    }
    const actorId = options.actorId || "admin";
    const now = monotonicTimestamp(before.updatedAt);
    const result = applyPatch(before, rawPatch, now, actorId);
    const event = auditEvent({ run: result.run, action: result.action, actorId, occurredAt: now, before });
    const runs = [...state.runs];
    runs[index] = result.run;
    await writeJsonFile(FILE_NAME, { ...state, runs, auditEvents: appendAudit(state, event) } satisfies ReviewsState);
    return { item: result.run, view: toReviewRunView(result.run), auditEvent: event };
  });
}

export function isReviewRunLifecycle(value: string): value is ReviewRunLifecycle {
  return RUN_LIFECYCLES.includes(value as ReviewRunLifecycle);
}
