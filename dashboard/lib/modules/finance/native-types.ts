import type { NativeObjectRef } from "../../native-objects/types";
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

export const FINANCE_SCHEMA_VERSION = 1 as const;

export type FinanceEntityScope = "personal" | "business";
export type FinanceCurrency = "USD";
export type FinanceRecordKind =
  | "account"
  | "transaction"
  | "transfer"
  | "savings_movement"
  | "bill"
  | "budget"
  | "close_period"
  | "rule";

export interface FinanceRecordBase {
  id: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
}

export interface FinanceAccountRecord extends FinanceRecordBase {
  name: string;
  kind: FinanceAccountKind;
  institution: string;
  mask: string;
  currentBalance: number;
  balanceAsOf: string;
  balanceSource: "manual" | "imported";
  currency: FinanceCurrency;
  entityScope: FinanceEntityScope;
}

export interface FinanceTransactionSource {
  kind: "manual" | "csv_import" | "transfer";
  importBatchId?: string;
  sourceRowFingerprint?: string;
  sourceFilename?: string;
}

export interface FinanceTransactionRecord extends FinanceRecordBase {
  occurredOn: string;
  merchant: string;
  accountId: string;
  category: string;
  amount: number;
  direction: FinanceTransactionDirection;
  currency: FinanceCurrency;
  entityScope: FinanceEntityScope;
  memo: string;
  status: "cleared" | "pending";
  reviewed: boolean;
  receiptRef?: NativeObjectRef;
  reimbursable: boolean;
  reimbursedOn?: string;
  transferId?: string;
  savingsMovementId?: string;
  source: FinanceTransactionSource;
}

export interface FinanceTransferRecord extends FinanceRecordBase {
  occurredOn: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: FinanceCurrency;
  memo: string;
  outgoingTransactionId: string;
  incomingTransactionId: string;
}

export interface FinanceSavingsMovementRecord extends FinanceRecordBase {
  occurredOn: string;
  direction: "to_savings" | "from_savings";
  amount: number;
  currency: FinanceCurrency;
  fromAccountId: string;
  toAccountId: string;
  transferId?: string;
  memo: string;
}

export interface FinanceBillRecord extends FinanceRecordBase {
  name: string;
  amount: number;
  dueDate: string;
  status: FinanceBillStatus;
  accountId: string;
  category: string;
  currency: FinanceCurrency;
  entityScope: FinanceEntityScope;
  recurring: FinanceRecurringCadence;
  autopay: boolean;
  paymentEvidenceRef?: NativeObjectRef;
  paymentExceptionReason?: string;
  paidAt?: string;
}

export interface FinanceBudgetRecord extends FinanceRecordBase {
  period: string;
  category: string;
  limit: number;
  currency: FinanceCurrency;
  entityScope: FinanceEntityScope;
  varianceDecisionRef?: NativeObjectRef;
}

export type FinanceCloseCheckResolution = "open" | "complete" | "waived" | "carried_forward";

export interface FinanceCloseCheck {
  id: string;
  label: string;
  required: boolean;
  resolution: FinanceCloseCheckResolution;
  reason: string;
  evidenceRefs: NativeObjectRef[];
  carryForwardOwnerRef?: NativeObjectRef;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface FinanceClosePeriodRecord extends FinanceRecordBase {
  period: string;
  status: "open" | "closed";
  checks: FinanceCloseCheck[];
  completedAt?: string;
  completedBy?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
}

export interface FinanceRuleRecord extends FinanceRecordBase {
  name: string;
  description: string;
  type: FinanceRuleType;
  mode: FinanceRuleMode;
  enabled: boolean;
  scope: string;
  trigger: string;
  conditions: FinanceRuleCondition[];
  actions: FinanceRuleAction[];
  tests: FinanceRuleTestCase[];
  lastTestedAt?: string;
  lastTestPassed?: boolean;
}

export interface FinanceImportMapping {
  date: string;
  description: string;
  amount: string;
  debit?: string;
  credit?: string;
  direction?: string;
  category?: string;
  memo?: string;
}

export type FinanceImportRowStatus = "accepted" | "ambiguous" | "rejected" | "unreconciled";

export interface FinanceImportRowResult {
  rowNumber: number;
  status: FinanceImportRowStatus;
  fingerprint: string;
  occurredOn?: string;
  merchant?: string;
  amount?: number;
  direction?: "income" | "expense";
  category?: string;
  memo?: string;
  reason?: string;
}

export interface FinanceImportBatch extends FinanceRecordBase {
  accountId: string;
  entityScope: FinanceEntityScope;
  sourceFilename: string;
  sourceHash: string;
  mapping: FinanceImportMapping;
  counts: Record<FinanceImportRowStatus, number>;
  rows: FinanceImportRowResult[];
  confirmedAt: string;
  confirmedBy: string;
}

export interface FinanceImportPreview {
  previewId: string;
  accountId: string;
  entityScope: FinanceEntityScope;
  sourceFilename: string;
  sourceHash: string;
  mapping: FinanceImportMapping;
  counts: Record<FinanceImportRowStatus, number>;
  rows: FinanceImportRowResult[];
}

export interface FinanceImportPreviewRecord extends FinanceImportPreview {
  createdAt: string;
  createdBy: string;
  expiresAt: string;
}

export interface FinanceAuditEvent {
  id: string;
  action: string;
  objectType: FinanceRecordKind | "import_batch";
  objectId: string;
  actorId: string;
  occurredAt: string;
  before: unknown;
  after: unknown;
  detail?: string;
}

export interface FinanceIdempotencyRecord {
  key: string;
  objectType: FinanceRecordKind | "import_batch";
  objectId: string;
  actorId?: string;
  operation?: string;
  requestHash?: string;
  createdAt: string;
}

export interface FinanceState {
  schemaVersion: typeof FINANCE_SCHEMA_VERSION;
  updatedAt: string | null;
  accounts: FinanceAccountRecord[];
  transactions: FinanceTransactionRecord[];
  transfers: FinanceTransferRecord[];
  savingsMovements: FinanceSavingsMovementRecord[];
  bills: FinanceBillRecord[];
  budgets: FinanceBudgetRecord[];
  closePeriods: FinanceClosePeriodRecord[];
  rules: FinanceRuleRecord[];
  importPreviews: FinanceImportPreviewRecord[];
  importBatches: FinanceImportBatch[];
  auditEvents: FinanceAuditEvent[];
  idempotency: FinanceIdempotencyRecord[];
}

export type FinanceRecord =
  | FinanceAccountRecord
  | FinanceTransactionRecord
  | FinanceTransferRecord
  | FinanceSavingsMovementRecord
  | FinanceBillRecord
  | FinanceBudgetRecord
  | FinanceClosePeriodRecord
  | FinanceRuleRecord;
