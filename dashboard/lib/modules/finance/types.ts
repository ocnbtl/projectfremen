import type { NativeObjectRef } from "../../native-objects/types";

export type FinanceHue =
  | "neutral"
  | "green"
  | "lime"
  | "yellow"
  | "orange"
  | "brown"
  | "crimson"
  | "pink"
  | "purple"
  | "violet"
  | "indigo"
  | "blue"
  | "cyan"
  | "teal";

export type FinanceAccountKind = "Checking" | "Savings" | "Credit" | "Brokerage" | "Cash" | "Business";
export type FinanceBillStatus = "due" | "soon" | "scheduled" | "paid" | "overdue";
export type FinanceRecurringCadence = "monthly" | "annual" | "weekly" | null;
export type FinanceTransactionDirection = "income" | "expense" | "transfer" | "savings";

export interface FinanceAccount {
  id: string;
  name: string;
  kind: FinanceAccountKind;
  inst: string;
  mask: string;
  balance: number;
  delta30: number;
  hue: FinanceHue;
  spark: readonly number[];
}

export interface FinanceBudget {
  id: string;
  category: string;
  hue: FinanceHue;
  spent: number;
  limit: number;
  icon: string;
}

export interface FinanceBill {
  id: string;
  name: string;
  amount: number;
  due: string;
  dueIn: number;
  status: FinanceBillStatus;
  account: string;
  category: string;
  hue: FinanceHue;
  recurring: FinanceRecurringCadence;
  autopay: boolean;
  icon: string;
  brandColors: readonly [string, string, string];
}

export interface FinanceTransaction {
  id: string;
  date: string;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  quarterYear: string;
  week: number;
  weekYear: string;
  weekdayName: string;
  weekdayNum: number;
  tzOffset: string;
  entity: string;
  merchant: string;
  account: string;
  accountType: FinanceAccountKind;
  category: string;
  spendCategory: string;
  hue: FinanceHue;
  amount: number;
  io: FinanceTransactionDirection;
  currency: "USD";
  memo: string;
  receipt: string;
  incomeSource: string;
  reimbursable: boolean;
  reimbursedOn: string;
  ufInit: boolean;
  status: "cleared" | "pending";
}

export interface FinanceReviewItem {
  id: string;
  label: string;
  done: boolean;
  hue: FinanceHue;
}

export interface FinanceReminder {
  id: string;
  text: string;
  due: string;
  hue: FinanceHue;
  kind: "review" | "decision" | "action";
}

export interface FinanceLinkedContext {
  id: string;
  title: string;
  type: "Note" | "Project" | "Resource" | "Finance";
  hue: FinanceHue;
}

export interface FinanceAttentionItem {
  icon: string;
  title: string;
  detail: string;
  label: string;
  hue: FinanceHue;
}

export interface FinanceCashflowSeries {
  readonly months: readonly string[];
  readonly income: readonly number[];
  readonly spend: readonly number[];
  readonly savings: readonly number[];
}

export interface FinanceFixtureSnapshot {
  readonly lastMonthOut: number;
  readonly netWorthDeltaLabel: string;
  readonly liquidDeltaLabel: string;
  readonly debtDeltaLabel: string;
  readonly netThisMonth: number;
  readonly averageBurn: number;
  readonly savingsRate: number;
  readonly monthIncome: number;
  readonly monthSpend: number;
  readonly monthSaved: number;
  readonly accountDetailCode: string;
  readonly cashflow: FinanceCashflowSeries;
  readonly attentionItems: readonly FinanceAttentionItem[];
}

export interface FinanceFixtureDataset {
  readonly accounts: readonly FinanceAccount[];
  readonly budgets: readonly FinanceBudget[];
  readonly bills: readonly FinanceBill[];
  readonly transactions: readonly FinanceTransaction[];
  readonly reviewItems: readonly FinanceReviewItem[];
  readonly reminders: readonly FinanceReminder[];
  readonly linkedContext: readonly FinanceLinkedContext[];
  readonly snapshot: FinanceFixtureSnapshot;
}

export interface FinanceFixtureMetadata {
  readonly id: string;
  readonly periodLabel: string;
  readonly previewLabel: string;
  readonly readOnly: true;
  readonly persistenceConnected: false;
}

export interface FinanceFixtureRepository {
  readonly metadata: FinanceFixtureMetadata;
  read(): FinanceFixtureDataset;
}

export type FinanceRuleType =
  | "categorization"
  | "receipt_evidence"
  | "recurrence"
  | "budget_variance"
  | "savings"
  | "import_repair"
  | "close_blocker"
  | "project_link";

export type FinanceRuleMode =
  | "auto"
  | "suggest"
  | "manual_approval"
  | "draft"
  | "disabled";

export type FinanceRuleHealth =
  | "stable"
  | "needs_review"
  | "broken"
  | "overfiring"
  | "draft";

export type FinanceRuleCapability =
  | "categorization"
  | "receipts"
  | "recurring"
  | "budget"
  | "savings"
  | "imports"
  | "close"
  | "project_linked";

export type FinanceRuleInputField =
  | "merchant"
  | "amount"
  | "category"
  | "forecastPercent"
  | "receiptPresent"
  | "reimbursable"
  | "reimbursed"
  | "recurringOccurrences"
  | "amountVariancePercent"
  | "confidence"
  | "statementPresent"
  | "billReviewed"
  | "projectLinked"
  | "fromAccount"
  | "toAccount"
  | "closePeriod";

export type FinanceRuleConditionOperator =
  | "contains"
  | "equals"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "is_true"
  | "is_false"
  | "present"
  | "missing";

export type FinanceRuleTestInput = Partial<
  Record<FinanceRuleInputField, string | number | boolean | null>
>;

export interface FinanceRuleCondition {
  readonly id: string;
  readonly field: FinanceRuleInputField;
  readonly operator: FinanceRuleConditionOperator;
  readonly value?: string | number | boolean;
  readonly label: string;
  readonly required: boolean;
}

export interface FinanceRuleAction {
  readonly id: string;
  readonly label: string;
  readonly destination: "finance" | "projects" | "personal_ops" | "reviews" | "media";
  readonly approvalRequired: boolean;
  readonly mutationLevel: "flag_only" | "draft_record" | "source_mutation";
}

export interface FinanceRuleTestCase {
  readonly id: string;
  readonly label: string;
  readonly input: FinanceRuleTestInput;
  readonly expectedActionIds: readonly string[];
}

export interface FinanceRuleActivity {
  readonly id: string;
  readonly occurredAt: string;
  readonly action: "fixture_defined" | "test_previewed" | "review_requested" | "disabled";
  readonly summary: string;
}

export interface FinanceRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly type: FinanceRuleType;
  readonly scope: string;
  readonly trigger: string;
  readonly mode: FinanceRuleMode;
  readonly health: FinanceRuleHealth;
  readonly enabled: boolean;
  readonly requiresApproval: boolean;
  readonly capabilities: readonly FinanceRuleCapability[];
  readonly linkedObjects: readonly NativeObjectRef[];
  readonly generatedCloseBlockers: number;
  readonly lastEventAt: string | null;
  readonly nextAction: string;
  readonly conditions: readonly FinanceRuleCondition[];
  readonly actions: readonly FinanceRuleAction[];
  readonly tests: readonly FinanceRuleTestCase[];
  readonly guardrails: readonly string[];
  readonly failureMode: string;
  readonly activity: readonly FinanceRuleActivity[];
}

export interface FinanceRulesFixtureDataset {
  readonly rules: readonly FinanceRule[];
}

export interface FinanceRulesFixtureMetadata {
  readonly id: string;
  readonly previewLabel: string;
  readonly readOnly: true;
  readonly persistenceConnected: false;
  readonly testExecution: "deterministic_browser_preview";
}

export interface FinanceRulesFixtureRepository {
  readonly metadata: FinanceRulesFixtureMetadata;
  read(): FinanceRulesFixtureDataset;
}
