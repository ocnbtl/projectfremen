import { createNativeObjectRef } from "../../native-objects/routes";
import type {
  FinanceAccount,
  FinanceBill,
  FinanceBudget,
  FinanceDataset,
  FinanceHue,
  FinanceLinkedContext,
  FinanceRule,
  FinanceRulesDataset,
  FinanceTransaction
} from "./types";
import type { FinanceState } from "./native-types";

const HUES: readonly FinanceHue[] = [
  "indigo", "blue", "teal", "orange", "violet", "green", "cyan", "yellow", "pink", "brown"
];

function hue(index: number): FinanceHue {
  return HUES[index % HUES.length];
}

function dateParts(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - start.getTime()) / 86400000) + start.getUTCDay() + 1) / 7);
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return {
    date,
    label: `${month} ${String(date.getUTCDate()).padStart(2, "0")}`,
    weekdayName: date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    quarter: `Q${quarter}` as "Q1" | "Q2" | "Q3" | "Q4",
    quarterYear: `${date.getUTCFullYear()}-Q${quarter}`,
    week,
    weekYear: `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
  };
}

function active<T extends { archivedAt?: string }>(items: readonly T[]): T[] {
  return items.filter((item) => !item.archivedAt);
}

function currentPeriod(state: FinanceState): string {
  const periods = [
    ...active(state.budgets).map((item) => item.period),
    ...active(state.closePeriods).map((item) => item.period),
    ...active(state.transactions).map((item) => item.occurredOn.slice(0, 7))
  ].sort();
  return periods.at(-1) || new Date().toISOString().slice(0, 7);
}

function monthLabel(period: string): string {
  return new Date(`${period}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long", year: "numeric", timeZone: "UTC"
  });
}

function accountRows(state: FinanceState): FinanceAccount[] {
  return active(state.accounts).map((item, index) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    inst: item.institution || "Manual",
    mask: item.mask || "—",
    balance: item.currentBalance,
    delta30: 0,
    hue: hue(index),
    spark: [item.currentBalance, item.currentBalance]
  }));
}

function transactionRows(state: FinanceState): FinanceTransaction[] {
  const accountMap = new Map(state.accounts.map((item) => [item.id, item]));
  return active(state.transactions).map((item, index) => {
    const account = accountMap.get(item.accountId);
    const parts = dateParts(item.occurredOn);
    return {
      id: item.id,
      date: parts.label,
      quarter: parts.quarter,
      quarterYear: parts.quarterYear,
      week: parts.week,
      weekYear: parts.weekYear,
      weekdayName: parts.weekdayName,
      weekdayNum: parts.date.getUTCDay(),
      tzOffset: "+0000",
      entity: item.entityScope === "business" ? "Business" : "Personal",
      merchant: item.merchant,
      account: account?.name || "Unavailable account",
      accountId: item.accountId,
      accountType: account?.kind || "Cash",
      category: item.category,
      spendCategory: item.category,
      hue: hue(index),
      amount: item.direction === "expense" ? -item.amount : item.amount,
      io: item.direction,
      currency: "USD",
      memo: item.memo,
      receipt: item.receiptRef?.label || "",
      incomeSource: item.direction === "income" ? item.merchant : "",
      reimbursable: item.reimbursable,
      reimbursedOn: item.reimbursedOn || "",
      ufInit: item.reviewed,
      status: item.status
    };
  });
}

function budgetRows(state: FinanceState, period: string, transactions: readonly FinanceTransaction[]): FinanceBudget[] {
  return active(state.budgets)
    .filter((item) => item.period === period)
    .map((item, index) => ({
      id: item.id,
      category: item.category,
      hue: hue(index + 2),
      spent: transactions
        .filter((transaction) => transaction.io === "expense" && transaction.category === item.category)
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
      limit: item.limit,
      icon: "Circle"
    }));
}

function billRows(state: FinanceState): FinanceBill[] {
  const accountMap = new Map(state.accounts.map((item) => [item.id, item]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return active(state.bills).map((item, index) => {
    const due = new Date(`${item.dueDate}T00:00:00`);
    const dueIn = Math.round((due.getTime() - today.getTime()) / 86400000);
    return {
      id: item.id,
      name: item.name,
      amount: item.amount,
      due: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dueIn,
      status: item.status,
      account: accountMap.get(item.accountId)?.name || "Unavailable account",
      accountId: item.accountId,
      category: item.category,
      hue: item.status === "overdue" ? "crimson" : item.status === "paid" ? "green" : hue(index + 3),
      recurring: item.recurring,
      autopay: item.autopay,
      icon: "Calendar",
      brandColors: ["#6366f1", "#818cf8", "#c7d2fe"]
    };
  });
}

function linkedContexts(state: FinanceState): FinanceLinkedContext[] {
  const refs = [
    ...state.transactions.map((item) => item.receiptRef),
    ...state.bills.map((item) => item.paymentEvidenceRef),
    ...state.budgets.map((item) => item.varianceDecisionRef),
    ...state.closePeriods.flatMap((period) => period.checks.flatMap((check) => [
      ...check.evidenceRefs,
      check.carryForwardOwnerRef
    ]))
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  return Array.from(new Map(refs.map((ref) => [`${ref.module}:${ref.objectType}:${ref.objectId}`, ref])).values())
    .map((ref, index) => ({
      id: `${ref.module}:${ref.objectType}:${ref.objectId}`,
      title: ref.label,
      type: ref.module === "notes" ? "Note" : ref.module === "projects" ? "Project" : ref.module === "resources" ? "Resource" : "Finance",
      hue: hue(index)
    }));
}

export function financeStateToDataset(state: FinanceState): FinanceDataset {
  const period = currentPeriod(state);
  const accounts = accountRows(state);
  const transactions = transactionRows(state);
  const budgets = budgetRows(state, period, transactions);
  const bills = billRows(state);
  const close = active(state.closePeriods).find((item) => item.period === period) || null;
  const periodTransactions = active(state.transactions).filter((item) => item.occurredOn.startsWith(period));
  const monthIncome = periodTransactions.filter((item) => item.direction === "income").reduce((sum, item) => sum + item.amount, 0);
  const monthSpend = periodTransactions.filter((item) => item.direction === "expense").reduce((sum, item) => sum + item.amount, 0);
  const monthSaved = active(state.savingsMovements).filter((item) => item.occurredOn.startsWith(period))
    .reduce((sum, item) => sum + (item.direction === "to_savings" ? item.amount : -item.amount), 0);
  const overdue = bills.filter((item) => item.status === "overdue");
  const pending = transactions.filter((item) => item.status === "pending" || !item.ufInit);
  const openChecks = close?.checks.filter((item) => item.required && item.resolution === "open") || [];
  const cashflowPeriods = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(`${period}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - (5 - offset));
    return date.toISOString().slice(0, 7);
  });
  const cashflowFor = (candidatePeriod: string, direction: "income" | "expense") =>
    active(state.transactions)
      .filter((item) => item.occurredOn.startsWith(candidatePeriod) && item.direction === direction)
      .reduce((sum, item) => sum + item.amount, 0);
  const savingsFor = (candidatePeriod: string) => active(state.savingsMovements)
    .filter((item) => item.occurredOn.startsWith(candidatePeriod))
    .reduce((sum, item) => sum + (item.direction === "to_savings" ? item.amount : -item.amount), 0);
  return {
    accounts,
    transactions,
    budgets,
    bills,
    reviewItems: close?.checks.map((item) => ({
      id: item.id,
      label: item.label,
      done: item.resolution !== "open",
      hue: item.resolution === "open" ? "yellow" : "green"
    })) || [],
    reminders: [],
    linkedContext: linkedContexts(state),
    snapshot: {
      lastMonthOut: cashflowFor(cashflowPeriods[4], "expense"),
      netWorthDeltaLabel: "No comparison snapshot",
      liquidDeltaLabel: "Balances are explicit facts",
      debtDeltaLabel: "No comparison snapshot",
      netThisMonth: monthIncome - monthSpend,
      averageBurn: cashflowPeriods.map((item) => cashflowFor(item, "expense")).reduce((sum, value) => sum + value, 0) / 6,
      savingsRate: monthIncome > 0 ? Math.round((monthSaved / monthIncome) * 100) : 0,
      monthIncome,
      monthSpend,
      monthSaved,
      accountDetailCode: "Native Finance record",
      cashflow: {
        months: cashflowPeriods.map((item) => new Date(`${item}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })),
        income: cashflowPeriods.map((item) => cashflowFor(item, "income")),
        spend: cashflowPeriods.map((item) => cashflowFor(item, "expense")),
        savings: cashflowPeriods.map(savingsFor)
      },
      attentionItems: [
        ...(overdue.length ? [{ icon: "Calendar", title: `${overdue.length} overdue bill${overdue.length === 1 ? "" : "s"}`, detail: "Resolve payment evidence or an explicit exception.", label: "Bills", hue: "crimson" as FinanceHue }] : []),
        ...(pending.length ? [{ icon: "Check", title: `${pending.length} transaction${pending.length === 1 ? "" : "s"} need review`, detail: "Imported and pending ledger facts remain unreconciled.", label: "Transactions", hue: "yellow" as FinanceHue }] : []),
        ...(openChecks.length ? [{ icon: "Alert", title: `${openChecks.length} close check${openChecks.length === 1 ? "" : "s"} open`, detail: `${monthLabel(period)} cannot close until each required check resolves.`, label: "Monthly close", hue: "violet" as FinanceHue }] : [])
      ]
    }
  };
}

const RULE_CAPABILITIES: Record<FinanceRule["type"], FinanceRule["capabilities"]> = {
  categorization: ["categorization"],
  receipt_evidence: ["receipts"],
  recurrence: ["recurring"],
  budget_variance: ["budget"],
  savings: ["savings"],
  import_repair: ["imports"],
  close_blocker: ["close"],
  project_link: ["project_linked"]
};

export function financeStateToRulesDataset(state: FinanceState): FinanceRulesDataset {
  return {
    rules: active(state.rules).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      type: item.type,
      scope: item.scope,
      trigger: item.trigger,
      mode: item.mode,
      health: item.lastTestPassed === false ? "broken" : item.mode === "draft" ? "draft" : "stable",
      enabled: item.enabled,
      requiresApproval: true,
      capabilities: RULE_CAPABILITIES[item.type],
      linkedObjects: [createNativeObjectRef({ module: "finance", objectType: "finance_rule", objectId: item.id, label: item.name })],
      generatedCloseBlockers: item.type === "close_blocker" && item.enabled ? 1 : 0,
      lastEventAt: item.lastTestedAt || item.updatedAt,
      nextAction: item.enabled ? "Review suggestions before confirmation" : "Enable after tests pass",
      conditions: item.conditions,
      actions: item.actions,
      tests: item.tests,
      guardrails: ["High-impact outcomes remain suggestions or drafts until explicitly confirmed."],
      failureMode: "No source record is mutated by rule evaluation alone.",
      activity: state.auditEvents
        .filter((event) => event.objectType === "rule" && event.objectId === item.id)
        .slice(-20)
        .map((event) => ({
          id: event.id,
          occurredAt: event.occurredAt,
          action: event.action.includes("test") ? "test_previewed" : event.action.includes("disabled") ? "disabled" : event.action.includes("created") ? "created" : "review_requested",
          summary: event.action.replaceAll(".", " ")
        }))
    }))
  };
}
