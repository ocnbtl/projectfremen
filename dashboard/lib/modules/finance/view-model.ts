import type { FinanceView } from "../../native-objects/url-state";
import type {
  FinanceAccount,
  FinanceBill,
  FinanceFixtureDataset,
  FinanceTransaction
} from "./types";

export type FinanceSmartViewId = "attention" | "due-week" | "unreviewed" | "recurring" | "linked-projects";

export interface FinanceFixtureViewModel {
  readonly counts: {
    readonly accounts: number;
    readonly budgets: number;
    readonly bills: number;
    readonly transactions: number;
    readonly reviewItems: number;
    readonly reminders: number;
    readonly linkedContext: number;
    readonly attention: number;
    readonly dueThisWeek: number;
    readonly pendingTransactions: number;
    readonly recurringBills: number;
    readonly linkedProjects: number;
    readonly overBudget: number;
    readonly dueOrOverdue: number;
    readonly manualPaymentBills: number;
    readonly decisionCandidates: number;
    readonly savingsMovements: number;
  };
  readonly accountTotals: {
    readonly liquid: number;
    readonly debt: number;
    readonly net: number;
    readonly runway: number;
  };
  readonly budgetTotals: {
    readonly spent: number;
    readonly limit: number;
    readonly usedPercent: number;
  };
  readonly monthlyRecurring: number;
  readonly autopayPercent: number;
  readonly reviewProgress: {
    readonly done: number;
    readonly total: number;
    readonly percent: number;
  };
  readonly cashflowSummary: string;
}

function monthlyEquivalent(amount: number, cadence: FinanceFixtureDataset["bills"][number]["recurring"]): number {
  if (cadence === "monthly") return amount;
  if (cadence === "annual") return amount / 12;
  if (cadence === "weekly") return amount * 52 / 12;
  return 0;
}

export function buildFinanceFixtureViewModel(dataset: FinanceFixtureDataset): FinanceFixtureViewModel {
  const overBudget = dataset.budgets.filter((budget) => budget.spent > budget.limit).length;
  const liquid = dataset.accounts
    .filter((account) => account.balance > 0 && account.kind !== "Brokerage")
    .reduce((sum, account) => sum + account.balance, 0);
  const debt = dataset.accounts
    .filter((account) => account.balance < 0)
    .reduce((sum, account) => sum + account.balance, 0);
  const net = dataset.accounts.reduce((sum, account) => sum + account.balance, 0);
  const lastMonthOut = dataset.snapshot.lastMonthOut;
  const budgetSpent = dataset.budgets.reduce((sum, budget) => sum + budget.spent, 0);
  const budgetLimit = dataset.budgets.reduce((sum, budget) => sum + budget.limit, 0);
  const reviewDone = dataset.reviewItems.filter((item) => item.done).length;
  const autopayBills = dataset.bills.filter((bill) => bill.autopay).length;
  const cashflow = dataset.snapshot.cashflow;
  const latestIncome = cashflow.income.at(-1) ?? 0;
  const latestSpend = cashflow.spend.at(-1) ?? 0;
  const firstSavings = cashflow.savings[0] ?? 0;
  const latestSavings = cashflow.savings.at(-1) ?? 0;
  const savingsValues = cashflow.savings.length ? cashflow.savings : [0];
  const minimumSavings = Math.min(...savingsValues);
  const maximumSavings = Math.max(...savingsValues);
  const savingsDirection = latestSavings >= firstSavings ? "rose" : "fell";
  const formatThousands = (value: number) => Math.abs(value).toFixed(1);
  const signedThousands = (value: number) => value < 0 ? `negative $${formatThousands(value)}` : `$${formatThousands(value)}`;

  return {
    counts: {
      accounts: dataset.accounts.length,
      budgets: dataset.budgets.length,
      bills: dataset.bills.length,
      transactions: dataset.transactions.length,
      reviewItems: dataset.reviewItems.length,
      reminders: dataset.reminders.length,
      linkedContext: dataset.linkedContext.length,
      attention: dataset.snapshot.attentionItems.length,
      dueThisWeek: dataset.bills.filter(
        (bill) => bill.status !== "overdue" && bill.status !== "paid" && bill.dueIn >= 0 && bill.dueIn <= 7
      ).length,
      pendingTransactions: dataset.transactions.filter((transaction) => transaction.status === "pending").length,
      recurringBills: dataset.bills.filter((bill) => Boolean(bill.recurring)).length,
      linkedProjects: dataset.linkedContext.filter((item) => item.type === "Project").length,
      overBudget,
      dueOrOverdue: dataset.bills.filter((bill) => bill.status === "overdue" || bill.status === "due").length,
      manualPaymentBills: dataset.bills.length - autopayBills,
      decisionCandidates: dataset.reminders.filter((item) => item.kind === "decision" || item.kind === "review").length,
      savingsMovements: dataset.snapshot.monthSaved === 0 ? 0 : 1
    },
    accountTotals: {
      liquid,
      debt,
      net,
      runway: liquid / lastMonthOut
    },
    budgetTotals: {
      spent: budgetSpent,
      limit: budgetLimit,
      usedPercent: budgetLimit ? Math.round((budgetSpent / budgetLimit) * 100) : 0
    },
    monthlyRecurring: dataset.bills.reduce((sum, bill) => sum + monthlyEquivalent(bill.amount, bill.recurring), 0),
    autopayPercent: dataset.bills.length ? Math.round((autopayBills / dataset.bills.length) * 100) : 0,
    reviewProgress: {
      done: reviewDone,
      total: dataset.reviewItems.length,
      percent: dataset.reviewItems.length ? Math.round((reviewDone / dataset.reviewItems.length) * 100) : 0
    },
    cashflowSummary: `Latest plotted values are income $${formatThousands(latestIncome)} thousand, spend $${formatThousands(latestSpend)} thousand, and savings $${formatThousands(latestSavings)} thousand. Savings ${savingsDirection} from $${formatThousands(firstSavings)} thousand at the start to $${formatThousands(latestSavings)} thousand and ranged from ${signedThousands(minimumSavings)} thousand to $${formatThousands(maximumSavings)} thousand.`
  };
}

export function getFinanceSmartViewCount(viewModel: FinanceFixtureViewModel, id: string): number {
  if (id === "attention") return viewModel.counts.attention;
  if (id === "due-week") return viewModel.counts.dueThisWeek;
  if (id === "unreviewed") return viewModel.counts.pendingTransactions;
  if (id === "recurring") return viewModel.counts.recurringBills;
  if (id === "linked-projects") return viewModel.counts.linkedProjects;
  if (id === "savings-movement") return viewModel.counts.savingsMovements;
  return 0;
}

export function getFinanceViewBadge(viewModel: FinanceFixtureViewModel, view: FinanceView): string {
  if (view === "budgets") return `${viewModel.counts.overBudget} over`;
  if (view === "bills") return `${viewModel.counts.dueOrOverdue} due/overdue`;
  return "";
}

export function filterFinanceTransactions(
  transactions: readonly FinanceTransaction[],
  query: string,
  pendingOnly: boolean
): FinanceTransaction[] {
  const cleanQuery = query.trim().toLowerCase();
  return transactions.filter((transaction) => {
    const text = `${transaction.date} ${transaction.merchant} ${transaction.account} ${transaction.category} ${transaction.amount} ${transaction.id}`.toLowerCase();
    return (!pendingOnly || transaction.status === "pending") && (!cleanQuery || text.includes(cleanQuery));
  });
}

export function groupFinanceAccounts(accounts: readonly FinanceAccount[]) {
  return [
    { label: "Cash & deposits", hue: "blue" as const, rows: accounts.filter((account) => ["Checking", "Savings", "Cash"].includes(account.kind)) },
    { label: "Credit & liabilities", hue: "crimson" as const, rows: accounts.filter((account) => account.kind === "Credit") },
    { label: "Investments & business", hue: "violet" as const, rows: accounts.filter((account) => ["Brokerage", "Business"].includes(account.kind)) }
  ];
}

export function recurringFinanceBills(bills: readonly FinanceBill[]): FinanceBill[] {
  return bills.filter((bill) => Boolean(bill.recurring));
}
