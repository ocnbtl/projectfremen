import { createHash } from "node:crypto";
import path from "node:path";
import { mutateJsonFile, readJsonFile } from "../../file-store";
import type { MutationErrorCode } from "../../native-objects/mutation-result";
import { resolveActiveNativeObjectRef } from "../../native-objects/resolve-reference";
import { isModuleId, type NativeObjectRef } from "../../native-objects/types";
import type {
  FinanceAccountKind,
  FinanceBillStatus,
  FinanceRecurringCadence,
  FinanceRuleAction,
  FinanceRuleCondition,
  FinanceRuleMode,
  FinanceRuleTestCase,
  FinanceRuleType,
  FinanceTransactionDirection
} from "./types";
import {
  FINANCE_SCHEMA_VERSION,
  type FinanceAccountRecord,
  type FinanceAuditEvent,
  type FinanceBillRecord,
  type FinanceBudgetRecord,
  type FinanceCloseCheck,
  type FinanceCloseCheckResolution,
  type FinanceClosePeriodRecord,
  type FinanceEntityScope,
  type FinanceIdempotencyRecord,
  type FinanceImportBatch,
  type FinanceImportMapping,
  type FinanceImportPreview,
  type FinanceImportPreviewRecord,
  type FinanceImportRowResult,
  type FinanceRecord,
  type FinanceRecordKind,
  type FinanceRuleRecord,
  type FinanceSavingsMovementRecord,
  type FinanceState,
  type FinanceTransactionRecord,
  type FinanceTransferRecord
} from "./native-types";
import { runFinanceRuleTests } from "./rules-view-model";

const FILE_NAME = "finance.json";
const MAX_AUDIT_EVENTS = 4000;
const MAX_IDEMPOTENCY_RECORDS = 2000;
const MAX_IMPORT_ROWS = 5000;
const MAX_IMPORT_PREVIEWS = 50;
const IMPORT_PREVIEW_TTL_MS = 30 * 60 * 1000;
const MAX_ABSOLUTE_MONEY = 90_071_992_547_409.9;

export class FinanceStoreError extends Error {
  readonly code: MutationErrorCode;
  readonly status: number;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;

  constructor(
    code: MutationErrorCode,
    message: string,
    options: { status?: number; fieldErrors?: Readonly<Record<string, readonly string[]>> } = {}
  ) {
    super(message);
    this.name = "FinanceStoreError";
    this.code = code;
    this.status = options.status ?? (
      code === "not_found" ? 404 : code === "stale" || code === "conflict" ? 409 : 400
    );
    this.fieldErrors = options.fieldErrors;
  }
}

export type FinanceMutationResult = {
  state: FinanceState;
  item: FinanceRecord | FinanceImportBatch;
  created: boolean;
  auditEvent?: FinanceAuditEvent;
};

export function createEmptyFinanceState(): FinanceState {
  return {
    schemaVersion: FINANCE_SCHEMA_VERSION,
    updatedAt: null,
    accounts: [],
    transactions: [],
    transfers: [],
    savingsMovements: [],
    bills: [],
    budgets: [],
    closePeriods: [],
    rules: [],
    importPreviews: [],
    importBatches: [],
    auditEvents: [],
    idempotency: []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validation(message: string, field?: string): never {
  throw new FinanceStoreError("validation", message, {
    status: 400,
    ...(field ? { fieldErrors: { [field]: [message] } } : {})
  });
}

function requiredText(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string") validation(`${field} is required`, field);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) validation(`${field} is required`, field);
  if (normalized.length > maxLength) validation(`${field} must be ${maxLength} characters or fewer`, field);
  return normalized;
}

function optionalText(value: unknown, field: string, maxLength = 4000): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") validation(`${field} must be text`, field);
  const normalized = value.replace(/\u0000/g, "").trim();
  if (normalized.length > maxLength) validation(`${field} must be ${maxLength} characters or fewer`, field);
  return normalized;
}

function positiveNumber(value: unknown, field: string, allowZero = false): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  const rounded = Math.round(parsed * 100) / 100;
  if (!Number.isFinite(parsed) || Math.abs(parsed) > MAX_ABSOLUTE_MONEY || !Number.isFinite(rounded) || !Number.isSafeInteger(Math.round(parsed * 100)) || (allowZero ? rounded < 0 : rounded <= 0)) {
    validation(`${field} must be ${allowZero ? "zero or " : ""}a positive number`, field);
  }
  return rounded;
}

function signedNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  const rounded = Math.round(parsed * 100) / 100;
  if (!Number.isFinite(parsed) || Math.abs(parsed) > MAX_ABSOLUTE_MONEY || !Number.isFinite(rounded) || !Number.isSafeInteger(Math.round(parsed * 100))) {
    validation(`${field} must be a finite amount with no more than two decimal places`, field);
  }
  return rounded;
}

function booleanValue(value: unknown, defaultValue = false): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  const normalized = requiredText(value, field, 80);
  if (!allowed.includes(normalized as T)) validation(`${field} has an unsupported value`, field);
  return normalized as T;
}

function dateValue(value: unknown, field: string): string {
  const normalized = requiredText(value, field, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    validation(`${field} must use YYYY-MM-DD`, field);
  }
  return normalized;
}

function periodValue(value: unknown, field = "period"): string {
  const normalized = requiredText(value, field, 20);
  if (!/^\d{4}-\d{2}$/.test(normalized)) validation(`${field} must use YYYY-MM`, field);
  return normalized;
}

function entityScope(value: unknown): FinanceEntityScope {
  return oneOf(value ?? "personal", "entityScope", ["personal", "business"] as const);
}

function parsedNativeRef(value: unknown, field: string): NativeObjectRef | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!isRecord(value)) validation(`${field} must be a native object reference`, field);
  const module = requiredText(value.module, `${field}.module`, 80);
  if (!isModuleId(module)) validation(`${field}.module has an unsupported value`, `${field}.module`);
  const objectType = requiredText(value.objectType, `${field}.objectType`, 100);
  const objectId = requiredText(value.objectId, `${field}.objectId`, 240);
  const label = requiredText(value.label, `${field}.label`, 500);
  const route = requiredText(value.route, `${field}.route`, 1000);
  return {
    module,
    objectType,
    objectId,
    label,
    route,
    ...(typeof value.containerObjectId === "string" && value.containerObjectId.trim()
      ? { containerObjectId: value.containerObjectId.trim() }
      : {}),
    ...(typeof value.versionId === "string" && value.versionId.trim()
      ? { versionId: value.versionId.trim() }
      : {})
  };
}

async function activeNativeRef(value: unknown, field: string): Promise<NativeObjectRef | undefined> {
  const parsed = parsedNativeRef(value, field);
  if (!parsed) return undefined;
  const resolved = await resolveActiveNativeObjectRef(parsed);
  if (!resolved) {
    throw new FinanceStoreError(
      "conflict",
      `${field} must identify an existing, active native object owned by another module.`,
      { status: 409, fieldErrors: { [field]: ["Reference could not be resolved to an active native object."] } }
    );
  }
  return resolved;
}

function monotonicTimestamp(previous?: string, preferred = new Date().toISOString()): string {
  if (!previous || preferred > previous) return preferred;
  return new Date(Date.parse(previous) + 1).toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function idempotencyRequestHash(actorId: string, operation: string, input: unknown): string {
  return createHash("sha256").update(canonicalJson({ actorId, operation, input })).digest("hex");
}

function assertFiniteNumbers(value: unknown, pathLabel = "state"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new FinanceStoreError("validation", `The persisted Finance ${pathLabel} value is not finite.`, { status: 500 });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteNumbers(item, `${pathLabel}.${index}`));
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) assertFiniteNumbers(item, `${pathLabel}.${key}`);
  }
}

function assertState(value: unknown): FinanceState {
  if (!isRecord(value) || value.schemaVersion !== FINANCE_SCHEMA_VERSION) {
    throw new FinanceStoreError(
      "validation",
      "The persisted Finance state is incompatible with this application version.",
      { status: 500 }
    );
  }
  if (!Array.isArray(value.importPreviews)) value.importPreviews = [];
  for (const key of [
    "accounts", "transactions", "transfers", "savingsMovements", "bills", "budgets",
    "closePeriods", "rules", "importPreviews", "importBatches", "auditEvents", "idempotency"
  ]) {
    if (!Array.isArray(value[key])) {
      throw new FinanceStoreError("validation", `The persisted Finance ${key} collection is invalid.`, { status: 500 });
    }
  }
  assertFiniteNumbers(value);
  return value as unknown as FinanceState;
}

function pruneExpiredImportPreviews(state: FinanceState, now = new Date().toISOString()): FinanceState {
  const importPreviews = state.importPreviews.filter((item) => item.expiresAt > now);
  return importPreviews.length === state.importPreviews.length ? state : { ...state, importPreviews };
}

export async function readFinanceState(): Promise<FinanceState> {
  // This fallback must stay empty. Passing demonstration data here could seed production app_state.
  return mutateJsonFile<unknown, FinanceState>(FILE_NAME, createEmptyFinanceState(), async (value) => {
    const persisted = assertState(value);
    const state = pruneExpiredImportPreviews(persisted);
    return { value: state, result: state, changed: state !== persisted };
  });
}

async function mutateFinanceState<Result>(
  mutate: (state: FinanceState) => Promise<{ state: FinanceState; result: Result; changed?: boolean }>
): Promise<Result> {
  return mutateJsonFile<unknown, Result>(FILE_NAME, createEmptyFinanceState(), async (value) => {
    const persisted = assertState(value);
    const state = pruneExpiredImportPreviews(persisted);
    const outcome = await mutate(state);
    return { value: outcome.state, result: outcome.result, changed: state !== persisted || outcome.changed };
  });
}

function recordByIdentity(
  state: FinanceState,
  objectType: FinanceRecordKind | "import_batch",
  objectId: string
): FinanceRecord | FinanceImportBatch | null {
  if (objectType === "account") return state.accounts.find((item) => item.id === objectId) || null;
  if (objectType === "transaction") return state.transactions.find((item) => item.id === objectId) || null;
  if (objectType === "transfer") return state.transfers.find((item) => item.id === objectId) || null;
  if (objectType === "savings_movement") return state.savingsMovements.find((item) => item.id === objectId) || null;
  if (objectType === "bill") return state.bills.find((item) => item.id === objectId) || null;
  if (objectType === "budget") return state.budgets.find((item) => item.id === objectId) || null;
  if (objectType === "close_period") return state.closePeriods.find((item) => item.id === objectId) || null;
  if (objectType === "rule") return state.rules.find((item) => item.id === objectId) || null;
  return state.importBatches.find((item) => item.id === objectId) || null;
}

function existingIdempotentResult(
  state: FinanceState,
  key: string,
  expected: { actorId: string; operation: string; requestHash: string }
): FinanceMutationResult | null {
  const record = state.idempotency.find((item) => item.key === key);
  if (!record) return null;
  if (
    record.actorId !== expected.actorId
    || record.operation !== expected.operation
    || record.requestHash !== expected.requestHash
  ) {
    throw new FinanceStoreError(
      "conflict",
      "This idempotency key was already used for a different Finance request. Retry with a new key.",
      { status: 409 }
    );
  }
  const item = recordByIdentity(state, record.objectType, record.objectId);
  if (!item) throw new FinanceStoreError("conflict", "The prior idempotent Finance result is unavailable.", { status: 409 });
  return { state, item, created: false };
}

function appendMutation(
  state: FinanceState,
  item: FinanceRecord | FinanceImportBatch,
  objectType: FinanceRecordKind | "import_batch",
  action: string,
  actorId: string,
  occurredAt: string,
  before: unknown,
  idempotency?: { key: string; actorId: string; operation: string; requestHash: string },
  detail?: string
): { auditEvent: FinanceAuditEvent; stateFields: Pick<FinanceState, "auditEvents" | "idempotency" | "updatedAt"> } {
  const event: FinanceAuditEvent = {
    id: `finance-audit-${crypto.randomUUID()}`,
    action,
    objectType,
    objectId: item.id,
    actorId,
    occurredAt,
    before: clone(before),
    after: clone(item),
    ...(detail ? { detail } : {})
  };
  const idempotencyRecords: FinanceIdempotencyRecord[] = idempotency
    ? [...state.idempotency, {
        key: idempotency.key,
        objectType,
        objectId: item.id,
        actorId: idempotency.actorId,
        operation: idempotency.operation,
        requestHash: idempotency.requestHash,
        createdAt: occurredAt
      }]
        .slice(-MAX_IDEMPOTENCY_RECORDS)
    : state.idempotency;
  return {
    auditEvent: event,
    stateFields: {
      updatedAt: occurredAt,
      auditEvents: [...state.auditEvents, event].slice(-MAX_AUDIT_EVENTS),
      idempotency: idempotencyRecords
    }
  };
}

function baseRecord(prefix: string, actorId: string, now: string) {
  return {
    id: `${prefix}-${crypto.randomUUID()}`,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now
  };
}

function requireActiveAccount(state: FinanceState, accountIdValue: unknown, field: string): FinanceAccountRecord {
  const accountId = requiredText(accountIdValue, field, 240);
  const account = state.accounts.find((item) => item.id === accountId && !item.archivedAt);
  if (!account) throw new FinanceStoreError("conflict", `${field} must reference an active Finance account.`, { status: 409 });
  return account;
}

function accountKind(value: unknown): FinanceAccountKind {
  return oneOf(value, "accountKind", ["Checking", "Savings", "Credit", "Brokerage", "Cash", "Business"] as const);
}

function direction(value: unknown): FinanceTransactionDirection {
  return oneOf(value, "direction", ["income", "expense", "transfer", "savings"] as const);
}

function billStatus(value: unknown): FinanceBillStatus {
  return oneOf(value ?? "scheduled", "status", ["due", "soon", "scheduled", "paid", "overdue"] as const);
}

function cadence(value: unknown): FinanceRecurringCadence {
  if (value === null || value === undefined || value === "") return null;
  return oneOf(value, "recurring", ["monthly", "annual", "weekly"] as const);
}

function createAccount(raw: Record<string, unknown>, actorId: string, now: string): FinanceAccountRecord {
  return {
    ...baseRecord("finance-account", actorId, now),
    name: requiredText(raw.name, "name", 160),
    kind: accountKind(raw.accountKind ?? raw.kind),
    institution: optionalText(raw.institution, "institution", 160),
    mask: optionalText(raw.mask, "mask", 12),
    currentBalance: signedNumber(raw.currentBalance ?? 0, "currentBalance"),
    balanceAsOf: dateValue(raw.balanceAsOf ?? now.slice(0, 10), "balanceAsOf"),
    balanceSource: oneOf(raw.balanceSource ?? "manual", "balanceSource", ["manual", "imported"] as const),
    currency: "USD",
    entityScope: entityScope(raw.entityScope)
  };
}

function createTransaction(
  raw: Record<string, unknown>,
  state: FinanceState,
  actorId: string,
  now: string,
  source: FinanceTransactionRecord["source"] = { kind: "manual" },
  receiptRef?: NativeObjectRef
): FinanceTransactionRecord {
  const account = requireActiveAccount(state, raw.accountId, "accountId");
  const transactionDirection = direction(raw.direction);
  if (source.kind === "manual" && transactionDirection !== "income" && transactionDirection !== "expense") {
    validation("Manual transactions must be income or expense; use the dedicated transfer or savings workflow.", "direction");
  }
  return {
    ...baseRecord("finance-transaction", actorId, now),
    occurredOn: dateValue(raw.occurredOn ?? now.slice(0, 10), "occurredOn"),
    merchant: requiredText(raw.merchant, "merchant", 240),
    accountId: account.id,
    category: optionalText(raw.category, "category", 160) || "Uncategorized",
    amount: positiveNumber(raw.amount, "amount"),
    direction: transactionDirection,
    currency: "USD",
    entityScope: entityScope(raw.entityScope ?? account.entityScope),
    memo: optionalText(raw.memo, "memo"),
    status: oneOf(raw.status ?? "cleared", "status", ["cleared", "pending"] as const),
    reviewed: booleanValue(raw.reviewed),
    ...(receiptRef ? { receiptRef } : {}),
    reimbursable: booleanValue(raw.reimbursable),
    ...(typeof raw.reimbursedOn === "string" && raw.reimbursedOn.trim()
      ? { reimbursedOn: dateValue(raw.reimbursedOn, "reimbursedOn") }
      : {}),
    ...(typeof raw.transferId === "string" ? { transferId: raw.transferId } : {}),
    ...(typeof raw.savingsMovementId === "string" ? { savingsMovementId: raw.savingsMovementId } : {}),
    source
  };
}

function createBill(raw: Record<string, unknown>, state: FinanceState, actorId: string, now: string): FinanceBillRecord {
  const account = requireActiveAccount(state, raw.accountId, "accountId");
  return {
    ...baseRecord("finance-bill", actorId, now),
    name: requiredText(raw.name, "name", 240),
    amount: positiveNumber(raw.amount, "amount"),
    dueDate: dateValue(raw.dueDate, "dueDate"),
    status: billStatus(raw.status),
    accountId: account.id,
    category: optionalText(raw.category, "category", 160) || "Uncategorized",
    currency: "USD",
    entityScope: entityScope(raw.entityScope ?? account.entityScope),
    recurring: cadence(raw.recurring),
    autopay: booleanValue(raw.autopay)
  };
}

function createBudget(raw: Record<string, unknown>, actorId: string, now: string, varianceDecisionRef?: NativeObjectRef): FinanceBudgetRecord {
  return {
    ...baseRecord("finance-budget", actorId, now),
    period: periodValue(raw.period ?? now.slice(0, 7)),
    category: requiredText(raw.category, "category", 160),
    limit: positiveNumber(raw.limit, "limit", true),
    currency: "USD",
    entityScope: entityScope(raw.entityScope),
    ...(varianceDecisionRef ? { varianceDecisionRef } : {})
  };
}

function defaultCloseChecks(closePeriodId: string): FinanceCloseCheck[] {
  return [
    "Reconcile every active account",
    "Review pending and uncategorized transactions",
    "Resolve due and overdue bills",
    "Review budget variances",
    "Capture savings movement evidence",
    "Document exceptions and owner handoffs"
  ].map((label, index) => ({
    id: `${closePeriodId}-check-${index + 1}`,
    label,
    required: true,
    resolution: "open",
    reason: "",
    evidenceRefs: []
  }));
}

function createClosePeriod(raw: Record<string, unknown>, actorId: string, now: string): FinanceClosePeriodRecord {
  const base = baseRecord("finance-close", actorId, now);
  return {
    ...base,
    period: periodValue(raw.period ?? now.slice(0, 7)),
    status: "open",
    checks: defaultCloseChecks(base.id)
  };
}

function normalizeRuleConditions(value: unknown): FinanceRuleCondition[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation("conditions must be an array", "conditions");
  return value.map((candidate, index) => {
    if (!isRecord(candidate)) validation("Each condition must be an object", `conditions.${index}`);
    const rawValue = candidate.value;
    if (rawValue !== undefined && !["string", "number", "boolean"].includes(typeof rawValue)) {
      validation("Condition value must be text, a number, or a boolean", `conditions.${index}.value`);
    }
    return {
      id: requiredText(candidate.id, `conditions.${index}.id`, 240),
      field: oneOf(candidate.field, `conditions.${index}.field`, [
        "merchant", "amount", "category", "forecastPercent", "receiptPresent", "reimbursable", "reimbursed",
        "recurringOccurrences", "amountVariancePercent", "confidence", "statementPresent", "billReviewed",
        "projectLinked", "fromAccount", "toAccount", "closePeriod"
      ] as const),
      operator: oneOf(candidate.operator, `conditions.${index}.operator`, [
        "contains", "equals", "greater_than", "greater_than_or_equal", "less_than", "is_true", "is_false", "present", "missing"
      ] as const),
      ...(rawValue !== undefined ? { value: rawValue as string | number | boolean } : {}),
      label: requiredText(candidate.label, `conditions.${index}.label`, 500),
      required: booleanValue(candidate.required, true)
    };
  });
}

function normalizeRuleActions(value: unknown): FinanceRuleAction[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation("actions must be an array", "actions");
  return value.map((candidate, index) => {
    if (!isRecord(candidate)) validation("Each action must be an object", `actions.${index}`);
    return {
      id: requiredText(candidate.id, `actions.${index}.id`, 240),
      label: requiredText(candidate.label, `actions.${index}.label`, 500),
      destination: oneOf(candidate.destination, `actions.${index}.destination`, ["finance", "projects", "personal_ops", "reviews", "media"] as const),
      approvalRequired: true,
      mutationLevel: oneOf(candidate.mutationLevel, `actions.${index}.mutationLevel`, ["flag_only", "draft_record", "source_mutation"] as const)
    };
  });
}

function normalizeRuleTests(value: unknown): FinanceRuleTestCase[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) validation("tests must be an array", "tests");
  return value.map((candidate, index) => {
    if (!isRecord(candidate) || !isRecord(candidate.input)) validation("Each test must include an input object", `tests.${index}`);
    if (!Array.isArray(candidate.expectedActionIds) || !candidate.expectedActionIds.every((id) => typeof id === "string" && id.trim())) {
      validation("expectedActionIds must be an array of action IDs", `tests.${index}.expectedActionIds`);
    }
    const input = Object.fromEntries(Object.entries(candidate.input).filter(([, raw]) => raw === null || ["string", "number", "boolean"].includes(typeof raw)));
    if (Object.keys(input).length !== Object.keys(candidate.input).length) validation("Test inputs must contain only scalar values", `tests.${index}.input`);
    return {
      id: requiredText(candidate.id, `tests.${index}.id`, 240),
      label: requiredText(candidate.label, `tests.${index}.label`, 500),
      input,
      expectedActionIds: candidate.expectedActionIds.map((id) => id.trim())
    } as FinanceRuleTestCase;
  });
}

function createRule(raw: Record<string, unknown>, actorId: string, now: string): FinanceRuleRecord {
  return {
    ...baseRecord("finance-rule", actorId, now),
    name: requiredText(raw.name, "name", 200),
    description: optionalText(raw.description, "description"),
    type: oneOf(raw.type ?? "categorization", "type", [
      "categorization", "receipt_evidence", "recurrence", "budget_variance", "savings",
      "import_repair", "close_blocker", "project_link"
    ] as const) as FinanceRuleType,
    mode: oneOf(raw.mode ?? "suggest", "mode", ["auto", "suggest", "manual_approval", "draft", "disabled"] as const) as FinanceRuleMode,
    enabled: booleanValue(raw.enabled),
    scope: optionalText(raw.scope, "scope", 400) || "Finance",
    trigger: optionalText(raw.trigger, "trigger", 400) || "Manual evaluation",
    conditions: normalizeRuleConditions(raw.conditions),
    actions: normalizeRuleActions(raw.actions),
    tests: normalizeRuleTests(raw.tests)
  };
}

function ensureNoDuplicateCreate(state: FinanceState, kind: FinanceRecordKind, item: FinanceRecord) {
  if (kind === "account") {
    const account = item as FinanceAccountRecord;
    if (state.accounts.some((candidate) => !candidate.archivedAt && candidate.name.toLowerCase() === account.name.toLowerCase())) {
      throw new FinanceStoreError("conflict", "An active account already uses this name.", { status: 409 });
    }
  } else if (kind === "budget") {
    const budget = item as FinanceBudgetRecord;
    if (state.budgets.some((candidate) => !candidate.archivedAt && candidate.period === budget.period && candidate.entityScope === budget.entityScope && candidate.category.toLowerCase() === budget.category.toLowerCase())) {
      throw new FinanceStoreError("conflict", "This budget category already exists for the period and entity scope.", { status: 409 });
    }
  } else if (kind === "close_period") {
    const close = item as FinanceClosePeriodRecord;
    if (state.closePeriods.some((candidate) => !candidate.archivedAt && candidate.period === close.period)) {
      throw new FinanceStoreError("conflict", "A Finance close already exists for this period.", { status: 409 });
    }
  } else if (kind === "rule") {
    const rule = item as FinanceRuleRecord;
    if (state.rules.some((candidate) => !candidate.archivedAt && candidate.name.toLowerCase() === rule.name.toLowerCase())) {
      throw new FinanceStoreError("conflict", "An active Finance rule already uses this name.", { status: 409 });
    }
  }
}

export async function createFinanceRecord(
  rawInput: unknown,
  options: { actorId?: string; idempotencyKey: string }
): Promise<FinanceMutationResult> {
  return mutateFinanceState(async (state) => {
    if (!isRecord(rawInput)) validation("input must be an object", "input");
    const kind = oneOf(rawInput.kind, "kind", [
      "account", "transaction", "transfer", "savings_movement", "bill", "budget", "close_period", "rule"
    ] as const) as FinanceRecordKind;
    const key = requiredText(options.idempotencyKey, "idempotencyKey", 240);
    const actorId = options.actorId || "admin";
    const idempotency = {
      key,
      actorId,
      operation: `create:${kind}`,
      requestHash: idempotencyRequestHash(actorId, `create:${kind}`, rawInput)
    };
    const prior = existingIdempotentResult(state, key, idempotency);
    if (prior) return { state, result: prior, changed: false };
    const now = new Date().toISOString();

    if (kind === "transfer") {
      const from = requireActiveAccount(state, rawInput.fromAccountId, "fromAccountId");
      const to = requireActiveAccount(state, rawInput.toAccountId, "toAccountId");
      if (from.id === to.id) validation("Transfers require two different accounts", "toAccountId");
      const amount = positiveNumber(rawInput.amount, "amount");
      const occurredOn = dateValue(rawInput.occurredOn ?? now.slice(0, 10), "occurredOn");
      const memo = optionalText(rawInput.memo, "memo");
      const transferId = `finance-transfer-${crypto.randomUUID()}`;
      const outgoing = createTransaction({
        merchant: `Transfer to ${to.name}`, accountId: from.id, category: "Transfer", amount,
        direction: "transfer", occurredOn, memo, entityScope: from.entityScope, transferId, reviewed: true
      }, state, actorId, now, { kind: "transfer" });
      const incoming = createTransaction({
        merchant: `Transfer from ${from.name}`, accountId: to.id, category: "Transfer", amount,
        direction: "transfer", occurredOn, memo, entityScope: to.entityScope, transferId, reviewed: true
      }, state, actorId, monotonicTimestamp(now), { kind: "transfer" });
      const item: FinanceTransferRecord = {
        ...baseRecord("finance-transfer", actorId, monotonicTimestamp(incoming.updatedAt)),
        id: transferId,
        occurredOn,
        fromAccountId: from.id,
        toAccountId: to.id,
        amount,
        currency: "USD",
        memo,
        outgoingTransactionId: outgoing.id,
        incomingTransactionId: incoming.id
      };
      const appended = appendMutation(state, item, kind, "finance.transfer.created", actorId, item.updatedAt, null, idempotency);
      const nextState: FinanceState = {
        ...state,
        transactions: [...state.transactions, outgoing, incoming],
        transfers: [...state.transfers, item],
        ...appended.stateFields
      };
      return { state: nextState, result: { state: nextState, item, created: true, auditEvent: appended.auditEvent } };
    }

    if (kind === "savings_movement") {
      const from = requireActiveAccount(state, rawInput.fromAccountId, "fromAccountId");
      const to = requireActiveAccount(state, rawInput.toAccountId, "toAccountId");
      if (from.id === to.id) validation("Savings movement requires two different accounts", "toAccountId");
      const transferId = optionalText(rawInput.transferId, "transferId", 240);
      if (transferId && !state.transfers.some((item) => item.id === transferId && !item.archivedAt)) {
        throw new FinanceStoreError("conflict", "transferId must reference an active Finance transfer.", { status: 409 });
      }
      const item: FinanceSavingsMovementRecord = {
        ...baseRecord("finance-savings", actorId, now),
        occurredOn: dateValue(rawInput.occurredOn ?? now.slice(0, 10), "occurredOn"),
        direction: oneOf(rawInput.direction ?? "to_savings", "direction", ["to_savings", "from_savings"] as const),
        amount: positiveNumber(rawInput.amount, "amount"),
        currency: "USD",
        fromAccountId: from.id,
        toAccountId: to.id,
        ...(transferId ? { transferId } : {}),
        memo: optionalText(rawInput.memo, "memo")
      };
      const appended = appendMutation(state, item, kind, "finance.savings_movement.created", actorId, now, null, idempotency);
      const nextState: FinanceState = { ...state, savingsMovements: [...state.savingsMovements, item], ...appended.stateFields };
      return { state: nextState, result: { state: nextState, item, created: true, auditEvent: appended.auditEvent } };
    }

    let item: FinanceRecord;
    if (kind === "account") item = createAccount(rawInput, actorId, now);
    else if (kind === "transaction") item = createTransaction(rawInput, state, actorId, now, { kind: "manual" }, await activeNativeRef(rawInput.receiptRef, "receiptRef"));
    else if (kind === "bill") item = createBill(rawInput, state, actorId, now);
    else if (kind === "budget") item = createBudget(rawInput, actorId, now, await activeNativeRef(rawInput.varianceDecisionRef, "varianceDecisionRef"));
    else if (kind === "close_period") item = createClosePeriod(rawInput, actorId, now);
    else item = createRule(rawInput, actorId, now);
    ensureNoDuplicateCreate(state, kind, item);
    const appended = appendMutation(state, item, kind, `finance.${kind}.created`, actorId, now, null, idempotency);
    const nextState: FinanceState = {
      ...state,
      ...(kind === "account" ? { accounts: [...state.accounts, item as FinanceAccountRecord] } : {}),
      ...(kind === "transaction" ? { transactions: [...state.transactions, item as FinanceTransactionRecord] } : {}),
      ...(kind === "bill" ? { bills: [...state.bills, item as FinanceBillRecord] } : {}),
      ...(kind === "budget" ? { budgets: [...state.budgets, item as FinanceBudgetRecord] } : {}),
      ...(kind === "close_period" ? { closePeriods: [...state.closePeriods, item as FinanceClosePeriodRecord] } : {}),
      ...(kind === "rule" ? { rules: [...state.rules, item as FinanceRuleRecord] } : {}),
      ...appended.stateFields
    };
    return { state: nextState, result: { state: nextState, item, created: true, auditEvent: appended.auditEvent } };
  });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function inferMapping(headers: string[]): FinanceImportMapping {
  const find = (...names: string[]) => headers.find((header) => names.includes(normalizeHeader(header))) || "";
  return {
    date: find("date", "posted_date", "posting_date", "transaction_date", "effective_date"),
    description: find("description", "transaction_description", "merchant", "name", "payee", "details"),
    amount: find("amount", "transaction_amount"),
    debit: find("debit", "debits", "withdrawal", "withdrawals"),
    credit: find("credit", "credits", "deposit", "deposits"),
    direction: find("direction", "type", "debit_credit"),
    category: find("category"),
    memo: find("memo", "notes")
  };
}

function mappedCell(row: string[], headerIndex: Map<string, number>, header: string | undefined): string {
  if (!header) return "";
  const index = headerIndex.get(normalizeHeader(header));
  return index === undefined ? "" : (row[index] || "").trim();
}

function parseImportDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function parseImportAmount(value: string): number | null {
  const normalized = value.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const parsed = Number(normalized);
  const rounded = Math.round(parsed * 100) / 100;
  return Number.isFinite(parsed)
    && Math.abs(parsed) <= MAX_ABSOLUTE_MONEY
    && Number.isFinite(rounded)
    && Number.isSafeInteger(Math.round(parsed * 100))
    && rounded !== 0
    ? rounded
    : null;
}

export async function previewFinanceCsv(
  rawInput: unknown,
  options: { actorId?: string } = {}
): Promise<FinanceImportPreview> {
  if (!isRecord(rawInput)) validation("input must be an object", "input");
  return mutateFinanceState(async (state) => {
    const account = requireActiveAccount(state, rawInput.accountId, "accountId");
    const sourceFilename = path.basename(requiredText(rawInput.sourceFilename, "sourceFilename", 240));
    const csvText = typeof rawInput.csvText === "string" ? rawInput.csvText : validation("csvText is required", "csvText");
    if (csvText.length > 5_000_000) validation("csvText exceeds the 5 MB preview limit", "csvText");
    const table = parseCsv(csvText);
    if (table.length < 2) validation("The CSV must include a header and at least one data row", "csvText");
    if (table.length - 1 > MAX_IMPORT_ROWS) validation(`The CSV exceeds the ${MAX_IMPORT_ROWS}-row preview limit`, "csvText");
    const headers = table[0].map((value) => value.trim());
    const inferred = inferMapping(headers);
    const mappingValue = isRecord(rawInput.mapping) ? rawInput.mapping : {};
    const mapping: FinanceImportMapping = {
    date: optionalText(mappingValue.date, "mapping.date", 120) || inferred.date,
    description: optionalText(mappingValue.description, "mapping.description", 120) || inferred.description,
    amount: optionalText(mappingValue.amount, "mapping.amount", 120) || inferred.amount,
    debit: optionalText(mappingValue.debit, "mapping.debit", 120) || inferred.debit,
    credit: optionalText(mappingValue.credit, "mapping.credit", 120) || inferred.credit,
    direction: optionalText(mappingValue.direction, "mapping.direction", 120) || inferred.direction,
    category: optionalText(mappingValue.category, "mapping.category", 120) || inferred.category,
    memo: optionalText(mappingValue.memo, "mapping.memo", 120) || inferred.memo
    };
    if (!mapping.date || !mapping.description || (!mapping.amount && !mapping.debit && !mapping.credit)) {
      validation("Map date, description, and either amount or debit/credit columns before previewing", "mapping");
    }
    const headerIndex = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
    const priorFingerprints = new Set(state.transactions.map((item) => item.source.sourceRowFingerprint).filter(Boolean));
    const seen = new Set<string>();
    const rows: FinanceImportRowResult[] = table.slice(1).map((row, index) => {
    const rawDate = mappedCell(row, headerIndex, mapping.date);
    const merchant = mappedCell(row, headerIndex, mapping.description);
    const rawAmount = mappedCell(row, headerIndex, mapping.amount);
    const rawDebit = mappedCell(row, headerIndex, mapping.debit);
    const rawCredit = mappedCell(row, headerIndex, mapping.credit);
    const occurredOn = parseImportDate(rawDate);
    const amountValue = parseImportAmount(rawAmount);
    const debitValue = parseImportAmount(rawDebit);
    const creditValue = parseImportAmount(rawCredit);
    const signedAmount = amountValue !== null
      ? amountValue
      : debitValue !== null
        ? -Math.abs(debitValue)
        : creditValue !== null
          ? Math.abs(creditValue)
          : null;
    const directionCell = mappedCell(row, headerIndex, mapping.direction).toLowerCase();
    const fingerprint = createHash("sha256")
      .update(`${account.id}|${occurredOn || rawDate}|${merchant.toLowerCase()}|${signedAmount ?? `${rawAmount}|${rawDebit}|${rawCredit}`}`)
      .digest("hex");
    const base = { rowNumber: index + 2, fingerprint };
    if (!occurredOn || !merchant || signedAmount === null) {
      return { ...base, status: "rejected" as const, reason: "Date, description, or non-zero amount is invalid." };
    }
    if (priorFingerprints.has(fingerprint) || seen.has(fingerprint)) {
      return { ...base, status: "rejected" as const, reason: "Exact imported row already exists." };
    }
    seen.add(fingerprint);
    let rowDirection: "income" | "expense";
    if (directionCell.includes("credit") || directionCell.includes("income")) rowDirection = "income";
    else if (directionCell.includes("debit") || directionCell.includes("expense")) rowDirection = "expense";
    else if (debitValue !== null) rowDirection = "expense";
    else if (creditValue !== null) rowDirection = "income";
    else if (account.kind === "Credit") rowDirection = signedAmount < 0 ? "income" : "expense";
    else rowDirection = signedAmount < 0 ? "expense" : "income";
    const category = mappedCell(row, headerIndex, mapping.category) || "Uncategorized";
    const status = category === "Uncategorized" ? "ambiguous" as const : "accepted" as const;
    return {
      ...base,
      status,
      occurredOn,
      merchant,
      amount: Math.abs(signedAmount),
      direction: rowDirection,
      category,
      memo: mappedCell(row, headerIndex, mapping.memo),
      ...(status === "ambiguous" ? { reason: "Category requires review before reconciliation." } : {})
    };
    });
    const counts = {
    accepted: rows.filter((row) => row.status === "accepted").length,
    ambiguous: rows.filter((row) => row.status === "ambiguous").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
    unreconciled: rows.filter((row) => row.status === "accepted" || row.status === "ambiguous").length
    };
    const sourceHash = createHash("sha256").update(csvText).digest("hex");
    const preview: FinanceImportPreview = {
      previewId: `finance-import-preview-${crypto.randomUUID()}`,
      accountId: account.id,
      entityScope: entityScope(rawInput.entityScope ?? account.entityScope),
      sourceFilename,
      sourceHash,
      mapping,
      counts,
      rows
    };
    const createdAt = new Date().toISOString();
    const record: FinanceImportPreviewRecord = {
      ...preview,
      createdAt,
      createdBy: options.actorId || "admin",
      expiresAt: new Date(Date.parse(createdAt) + IMPORT_PREVIEW_TTL_MS).toISOString()
    };
    const nextState: FinanceState = {
      ...state,
      updatedAt: monotonicTimestamp(state.updatedAt || undefined, createdAt),
      importPreviews: [
        ...state.importPreviews.filter((item) => item.expiresAt > createdAt),
        record
      ].slice(-MAX_IMPORT_PREVIEWS)
    };
    return { state: nextState, result: preview };
  });
}

export async function confirmFinanceImport(
  rawInput: unknown,
  options: { actorId?: string; idempotencyKey: string }
): Promise<FinanceMutationResult> {
  return mutateFinanceState(async (state) => {
    if (!isRecord(rawInput)) validation("input must be an object", "input");
    const key = requiredText(options.idempotencyKey, "idempotencyKey", 240);
    const actorId = options.actorId || "admin";
    const idempotency = {
      key,
      actorId,
      operation: "confirm_import",
      requestHash: idempotencyRequestHash(actorId, "confirm_import", rawInput)
    };
    const prior = existingIdempotentResult(state, key, idempotency);
    if (prior) return { state, result: prior, changed: false };
    const previewId = requiredText(rawInput.previewId, "previewId", 240);
    const now = new Date().toISOString();
    const preview = state.importPreviews.find((item) =>
      item.previewId === previewId && item.createdBy === actorId && item.expiresAt > now
    );
    if (!preview) {
      throw new FinanceStoreError("conflict", "The server-held import preview is missing, expired, or belongs to another actor. Preview the CSV again.", { status: 409 });
    }
    const account = requireActiveAccount(state, preview.accountId, "accountId");
    const sourceFilename = preview.sourceFilename;
    const sourceHash = preview.sourceHash;
    if (state.importBatches.some((batch) => batch.sourceHash === sourceHash && batch.accountId === account.id)) {
      throw new FinanceStoreError("conflict", "This exact CSV was already confirmed for the account.", { status: 409 });
    }
    const rows = clone(preview.rows);
    const selected = new Set(
      Array.isArray(rawInput.selectedFingerprints)
        ? rawInput.selectedFingerprints.filter((value): value is string => typeof value === "string")
        : rows.filter((row) => row.status !== "rejected").map((row) => row.fingerprint)
    );
    const previewFingerprints = new Set(rows.map((row) => row.fingerprint));
    if ([...selected].some((fingerprint) => !previewFingerprints.has(fingerprint))) {
      validation("selectedFingerprints contains a row outside the server-held preview", "selectedFingerprints");
    }
    const importableFingerprints = new Set(rows.filter((row) => row.status !== "rejected").map((row) => row.fingerprint));
    if ([...selected].some((fingerprint) => !importableFingerprints.has(fingerprint))) {
      validation("selectedFingerprints may contain only importable preview rows", "selectedFingerprints");
    }
    const priorFingerprints = new Set(state.transactions.map((item) => item.source.sourceRowFingerprint).filter(Boolean));
    const importBatchId = `finance-import-${crypto.randomUUID()}`;
    const transactions: FinanceTransactionRecord[] = [];
    for (const row of rows) {
      if (!selected.has(row.fingerprint)) continue;
      if (row.status === "rejected") continue;
      if (!row.occurredOn || !row.merchant || !row.amount || !row.direction || priorFingerprints.has(row.fingerprint)) continue;
      transactions.push(createTransaction({
        occurredOn: row.occurredOn,
        merchant: row.merchant,
        accountId: account.id,
        category: row.category || "Uncategorized",
        amount: row.amount,
        direction: row.direction,
        memo: row.memo || "",
        entityScope: preview.entityScope,
        status: "pending",
        reviewed: false
      }, state, actorId, monotonicTimestamp(transactions.at(-1)?.updatedAt || now), {
        kind: "csv_import",
        importBatchId,
        sourceRowFingerprint: row.fingerprint,
        sourceFilename
      }));
      priorFingerprints.add(row.fingerprint);
    }
    const mapping = clone(preview.mapping);
    const counts = {
      accepted: rows.filter((row) => row.status === "accepted").length,
      ambiguous: rows.filter((row) => row.status === "ambiguous").length,
      rejected: rows.filter((row) => row.status === "rejected").length,
      unreconciled: transactions.length
    };
    const item: FinanceImportBatch = {
      ...baseRecord("finance-import", actorId, monotonicTimestamp(transactions.at(-1)?.updatedAt || now)),
      id: importBatchId,
      accountId: account.id,
      entityScope: preview.entityScope,
      sourceFilename,
      sourceHash,
      mapping,
      counts,
      rows,
      confirmedAt: now,
      confirmedBy: actorId
    };
    const appended = appendMutation(
      state, item, "import_batch", "finance.import.confirmed", actorId, item.updatedAt, null, idempotency,
      `${transactions.length} transaction${transactions.length === 1 ? "" : "s"} created; raw CSV not retained.`
    );
    const nextState: FinanceState = {
      ...state,
      transactions: [...state.transactions, ...transactions],
      importPreviews: state.importPreviews.filter((candidate) => candidate.previewId !== preview.previewId && candidate.expiresAt > now),
      importBatches: [...state.importBatches, item],
      ...appended.stateFields
    };
    return { state: nextState, result: { state: nextState, item, created: true, auditEvent: appended.auditEvent } };
  });
}

function collectionItem(state: FinanceState, kind: FinanceRecordKind, id: string): FinanceRecord {
  const item = recordByIdentity(state, kind, id);
  if (!item || kind === "account" && !("institution" in item)) {
    throw new FinanceStoreError("not_found", "Finance record not found", { status: 404 });
  }
  return item as FinanceRecord;
}

function replaceRecord(state: FinanceState, kind: FinanceRecordKind, item: FinanceRecord): FinanceState {
  const replace = <T extends FinanceRecord>(rows: T[]) => rows.map((row) => row.id === item.id ? item as T : row);
  if (kind === "account") return { ...state, accounts: replace(state.accounts) };
  if (kind === "transaction") return { ...state, transactions: replace(state.transactions) };
  if (kind === "transfer") return { ...state, transfers: replace(state.transfers) };
  if (kind === "savings_movement") return { ...state, savingsMovements: replace(state.savingsMovements) };
  if (kind === "bill") return { ...state, bills: replace(state.bills) };
  if (kind === "budget") return { ...state, budgets: replace(state.budgets) };
  if (kind === "close_period") return { ...state, closePeriods: replace(state.closePeriods) };
  return { ...state, rules: replace(state.rules) };
}

function applyGenericUpdate(kind: FinanceRecordKind, before: FinanceRecord, fields: Record<string, unknown>, now: string, state: FinanceState): FinanceRecord {
  if (kind === "account") {
    const item = clone(before as FinanceAccountRecord);
    if (fields.name !== undefined) item.name = requiredText(fields.name, "fields.name", 160);
    if (fields.kind !== undefined) item.kind = accountKind(fields.kind);
    if (fields.institution !== undefined) item.institution = optionalText(fields.institution, "fields.institution", 160);
    if (fields.mask !== undefined) item.mask = optionalText(fields.mask, "fields.mask", 12);
    if (fields.currentBalance !== undefined) item.currentBalance = signedNumber(fields.currentBalance, "fields.currentBalance");
    if (fields.balanceAsOf !== undefined) item.balanceAsOf = dateValue(fields.balanceAsOf, "fields.balanceAsOf");
    if (fields.balanceSource !== undefined) item.balanceSource = oneOf(fields.balanceSource, "fields.balanceSource", ["manual", "imported"] as const);
    if (fields.entityScope !== undefined) item.entityScope = entityScope(fields.entityScope);
    item.updatedAt = now;
    return item;
  }
  if (kind === "transaction") {
    const item = clone(before as FinanceTransactionRecord);
    if (fields.occurredOn !== undefined) item.occurredOn = dateValue(fields.occurredOn, "fields.occurredOn");
    if (fields.merchant !== undefined) item.merchant = requiredText(fields.merchant, "fields.merchant", 240);
    if (fields.category !== undefined) item.category = requiredText(fields.category, "fields.category", 160);
    if (fields.accountId !== undefined) item.accountId = requireActiveAccount(state, fields.accountId, "fields.accountId").id;
    if (fields.amount !== undefined) item.amount = positiveNumber(fields.amount, "fields.amount");
    if (fields.direction !== undefined) {
      item.direction = oneOf(fields.direction, "fields.direction", ["income", "expense"] as const);
    }
    if (fields.memo !== undefined) item.memo = optionalText(fields.memo, "fields.memo");
    if (fields.status !== undefined) item.status = oneOf(fields.status, "fields.status", ["cleared", "pending"] as const);
    if (fields.reviewed !== undefined) item.reviewed = booleanValue(fields.reviewed);
    if (fields.entityScope !== undefined) item.entityScope = entityScope(fields.entityScope);
    item.updatedAt = now;
    return item;
  }
  if (kind === "bill") {
    const item = clone(before as FinanceBillRecord);
    if (fields.name !== undefined) item.name = requiredText(fields.name, "fields.name", 240);
    if (fields.amount !== undefined) item.amount = positiveNumber(fields.amount, "fields.amount");
    if (fields.dueDate !== undefined) item.dueDate = dateValue(fields.dueDate, "fields.dueDate");
    if (fields.category !== undefined) item.category = requiredText(fields.category, "fields.category", 160);
    if (fields.accountId !== undefined) item.accountId = requireActiveAccount(state, fields.accountId, "fields.accountId").id;
    if (fields.status !== undefined && fields.status !== "paid") item.status = billStatus(fields.status);
    if (fields.recurring !== undefined) item.recurring = cadence(fields.recurring);
    if (fields.autopay !== undefined) item.autopay = booleanValue(fields.autopay);
    if (fields.entityScope !== undefined) item.entityScope = entityScope(fields.entityScope);
    item.updatedAt = now;
    return item;
  }
  if (kind === "budget") {
    const item = clone(before as FinanceBudgetRecord);
    if (fields.period !== undefined) item.period = periodValue(fields.period, "fields.period");
    if (fields.category !== undefined) item.category = requiredText(fields.category, "fields.category", 160);
    if (fields.limit !== undefined) item.limit = positiveNumber(fields.limit, "fields.limit", true);
    if (fields.entityScope !== undefined) item.entityScope = entityScope(fields.entityScope);
    item.updatedAt = now;
    return item;
  }
  if (kind === "rule") {
    const item = clone(before as FinanceRuleRecord);
    if (fields.name !== undefined) item.name = requiredText(fields.name, "fields.name", 200);
    if (fields.description !== undefined) item.description = optionalText(fields.description, "fields.description");
    if (fields.mode !== undefined) item.mode = oneOf(fields.mode, "fields.mode", ["auto", "suggest", "manual_approval", "draft", "disabled"] as const) as FinanceRuleMode;
    if (fields.enabled !== undefined) item.enabled = booleanValue(fields.enabled);
    if (fields.conditions !== undefined) item.conditions = normalizeRuleConditions(fields.conditions);
    if (fields.actions !== undefined) item.actions = normalizeRuleActions(fields.actions);
    if (fields.tests !== undefined) item.tests = normalizeRuleTests(fields.tests);
    item.updatedAt = now;
    return item;
  }
  const item = clone(before);
  if ("memo" in item && fields.memo !== undefined) item.memo = optionalText(fields.memo, "fields.memo");
  item.updatedAt = now;
  return item;
}

export async function updateFinanceRecord(
  rawInput: unknown,
  options: { actorId?: string; idempotencyKey?: string }
): Promise<FinanceMutationResult> {
  return mutateFinanceState(async (state) => {
    if (!isRecord(rawInput)) validation("input must be an object", "input");
    const kind = oneOf(rawInput.kind, "kind", [
      "account", "transaction", "transfer", "savings_movement", "bill", "budget", "close_period", "rule"
    ] as const) as FinanceRecordKind;
    const id = requiredText(rawInput.id, "id", 240);
    const expectedUpdatedAt = requiredText(rawInput.expectedUpdatedAt, "expectedUpdatedAt", 80);
    const action = oneOf(rawInput.action, "action", [
      "update", "archive", "restore", "mark_paid", "resolve_close_check", "complete_close", "reopen_close", "test_rule"
    ] as const);
    const actorId = options.actorId || "admin";
    const idempotency = options.idempotencyKey ? {
      key: requiredText(options.idempotencyKey, "idempotencyKey", 240),
      actorId,
      operation: `update:${kind}:${action}`,
      requestHash: idempotencyRequestHash(actorId, `update:${kind}:${action}`, rawInput)
    } : undefined;
    if (idempotency) {
      const prior = existingIdempotentResult(state, idempotency.key, idempotency);
      if (prior) return { state, result: prior, changed: false };
    }
    const before = collectionItem(state, kind, id);
    if (before.updatedAt !== expectedUpdatedAt) {
      throw new FinanceStoreError("stale", "This Finance record changed after it was loaded. Refresh before retrying.", { status: 409 });
    }
    if (before.archivedAt && action !== "restore") {
      throw new FinanceStoreError("conflict", "Archived Finance records are read-only until restored.", { status: 409 });
    }
    if (!before.archivedAt && action === "restore") {
      throw new FinanceStoreError("conflict", "Only archived Finance records can be restored.", { status: 409 });
    }
    if (kind === "transaction") {
      const transaction = before as FinanceTransactionRecord;
      if (transaction.transferId || transaction.savingsMovementId || transaction.source.kind === "transfer") {
        throw new FinanceStoreError(
          "conflict",
          "Linked ledger rows are immutable. Correct the owning transfer or savings aggregate instead of mutating one side.",
          { status: 409 }
        );
      }
    }
    if ((kind === "transfer" || kind === "savings_movement") && ["update", "archive", "restore"].includes(action)) {
      throw new FinanceStoreError(
        "conflict",
        "Transfer and savings aggregates are immutable; record a compensating correction instead of rewriting or archiving financial history.",
        { status: 409 }
      );
    }
    const now = monotonicTimestamp(before.updatedAt);
    let item = clone(before);
    let auditAction = `finance.${kind}.updated`;

    if (action === "archive") {
      item.archivedAt = now;
      item.archivedBy = actorId;
      item.archiveReason = requiredText(rawInput.reason, "reason", 4000);
      item.updatedAt = now;
      auditAction = `finance.${kind}.archived`;
    } else if (action === "restore") {
      delete item.archivedAt;
      delete item.archivedBy;
      delete item.archiveReason;
      ensureNoDuplicateCreate(state, kind, item);
      item.updatedAt = now;
      auditAction = `finance.${kind}.restored`;
    } else if (action === "update") {
      if (!isRecord(rawInput.fields)) validation("fields must be an object", "fields");
      item = applyGenericUpdate(kind, before, rawInput.fields, now, state);
    } else if (action === "mark_paid") {
      if (kind !== "bill") validation("mark_paid only supports bills", "action");
      const bill = clone(before as FinanceBillRecord);
      const evidence = await activeNativeRef(rawInput.paymentEvidenceRef, "paymentEvidenceRef");
      const exceptionReason = optionalText(rawInput.exceptionReason, "exceptionReason");
      if (!evidence && !exceptionReason) {
        validation("Paid bills require evidence or an explicit exception reason", "paymentEvidenceRef");
      }
      bill.status = "paid";
      bill.paidAt = now;
      bill.updatedAt = now;
      if (evidence) bill.paymentEvidenceRef = evidence;
      if (exceptionReason) bill.paymentExceptionReason = exceptionReason;
      item = bill;
      auditAction = "finance.bill.paid";
    } else if (action === "resolve_close_check") {
      if (kind !== "close_period") validation("resolve_close_check only supports close periods", "action");
      const close = clone(before as FinanceClosePeriodRecord);
      if (close.status === "closed") throw new FinanceStoreError("conflict", "Reopen the close before changing checks.", { status: 409 });
      const checkId = requiredText(rawInput.checkId, "checkId", 160);
      const check = close.checks.find((candidate) => candidate.id === checkId);
      if (!check) throw new FinanceStoreError("not_found", "Finance close check not found", { status: 404 });
      const resolution = oneOf(rawInput.resolution, "resolution", ["open", "complete", "waived", "carried_forward"] as const) as FinanceCloseCheckResolution;
      const reason = optionalText(rawInput.reason, "reason");
      const evidenceRefs = Array.isArray(rawInput.evidenceRefs)
        ? (await Promise.all(rawInput.evidenceRefs.map((value, index) => activeNativeRef(value, `evidenceRefs.${index}`)))).filter((value): value is NativeObjectRef => Boolean(value))
        : [];
      const ownerRef = await activeNativeRef(rawInput.carryForwardOwnerRef, "carryForwardOwnerRef");
      if (resolution === "waived" && !reason) validation("Waivers require a reason", "reason");
      if (resolution === "complete" && !reason && !evidenceRefs.length) {
        validation("Completed checks require an evidence reference or evidence note", "evidenceRefs");
      }
      if (resolution === "carried_forward" && (!reason || !ownerRef)) {
        validation("Carry-forward requires a reason and canonical owner reference", "carryForwardOwnerRef");
      }
      check.resolution = resolution;
      check.reason = reason;
      check.evidenceRefs = evidenceRefs;
      if (ownerRef) check.carryForwardOwnerRef = ownerRef;
      else delete check.carryForwardOwnerRef;
      if (resolution === "open") {
        delete check.resolvedAt;
        delete check.resolvedBy;
      } else {
        check.resolvedAt = now;
        check.resolvedBy = actorId;
      }
      close.updatedAt = now;
      item = close;
      auditAction = `finance.close_check.${resolution}`;
    } else if (action === "complete_close") {
      if (kind !== "close_period") validation("complete_close only supports close periods", "action");
      const close = clone(before as FinanceClosePeriodRecord);
      const unresolved = close.checks.filter((check) => check.required && check.resolution === "open");
      if (unresolved.length) {
        throw new FinanceStoreError("conflict", `${unresolved.length} required close check${unresolved.length === 1 ? " remains" : "s remain"} unresolved.`, { status: 409 });
      }
      close.status = "closed";
      close.completedAt = now;
      close.completedBy = actorId;
      close.updatedAt = now;
      item = close;
      auditAction = "finance.close.completed";
    } else if (action === "reopen_close") {
      if (kind !== "close_period") validation("reopen_close only supports close periods", "action");
      const close = clone(before as FinanceClosePeriodRecord);
      if (close.status !== "closed") throw new FinanceStoreError("conflict", "Only a completed close can be reopened.", { status: 409 });
      close.status = "open";
      close.reopenedAt = now;
      close.reopenedBy = actorId;
      close.reopenReason = requiredText(rawInput.reason, "reason", 4000);
      close.updatedAt = now;
      item = close;
      auditAction = "finance.close.reopened";
    } else if (action === "test_rule") {
      if (kind !== "rule") validation("test_rule only supports Finance rules", "action");
      const rule = clone(before as FinanceRuleRecord);
      const run = runFinanceRuleTests(rule, now, "deterministic_server");
      rule.lastTestedAt = now;
      rule.lastTestPassed = run.failed === 0 && run.review === 0;
      rule.updatedAt = now;
      item = rule;
      auditAction = "finance.rule.test_recorded";
    }

    const appended = appendMutation(state, item, kind, auditAction, actorId, now, before, idempotency);
    const nextState = { ...replaceRecord(state, kind, item), ...appended.stateFields };
    return { state: nextState, result: { state: nextState, item, created: false, auditEvent: appended.auditEvent } };
  });
}
