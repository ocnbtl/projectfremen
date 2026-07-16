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
