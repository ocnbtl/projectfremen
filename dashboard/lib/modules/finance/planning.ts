import type { FinanceState, FinanceTransactionRecord, FinanceEntityScope } from "./native-types";

// These groups affect planning only. Original bank categories remain intact.
export function financeSpendingGroup(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("groceries")) return "Groceries";
  if (c.includes("coffee")) return "Coffee";
  if (c.startsWith("food and drink")) return "Dining & takeout";
  if (c.startsWith("transportation")) return "Transport & fuel";
  if (c.includes("insurance")) return "Insurance";
  if (c.startsWith("rent and utilities") || c.startsWith("home improvement")) return "Home & utilities";
  if (c === "general services other general services") return "Software & services";
  if (c.includes("pet supplies")) return "Pets";
  if (c.startsWith("general merchandise") || c.startsWith("personal care")) return "Shopping & personal";
  if (c.startsWith("entertainment") || c.startsWith("travel")) return "Leisure & travel";
  if (c.startsWith("medical")) return "Health";
  if (c.startsWith("bank fees")) return "Bank fees";
  return "Other spending";
}

export type PlanningEvidence = {
  kind: "transaction_history"; transactionIds: string[]; basis: string;
  generatedOn: string; estimated: true; sourceKey: string;
};
export type PlannedBudget = { category: string; categoryGroup: string; limit: number; period: string; entityScope: FinanceEntityScope; evidence: PlanningEvidence };
export type PlannedBill = { name: string; amount: number; dueDate: string; accountId: string; category: string; entityScope: FinanceEntityScope; recurring: "monthly"; evidence: PlanningEvidence };
export type FinancePlan = { asOf: string; fingerprint?: string; periods: string[]; budgets: PlannedBudget[]; bills: PlannedBill[]; reviewIds: string[]; pendingCount: number; notes: string[] };
const round = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (a: string, b: string) => (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000;
function nextMonth(date: string) {
  const d = new Date(`${date}T12:00:00Z`), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10);
}
function recurrenceIdentity(t: FinanceTransactionRecord) {
  // Only an explicit utility description is collapsed; ordinary merchant text is exact.
  const utility = t.category.toLowerCase().startsWith("rent and utilities") && /electric.*internet|internet.*electric/i.test(t.merchant);
  const name = utility ? `${t.merchant.split(/["“]/)[0].trim()} · electricity & internet` : t.merchant.trim();
  return { name, key: `${t.accountId}:${t.entityScope}:${name.toLowerCase()}` };
}

export function buildFinancePlan(state: FinanceState, asOf: string): FinancePlan {
  const period = asOf.slice(0, 7);
  const active = state.transactions.filter(t => !t.archivedAt && t.occurredOn <= asOf);
  const posted = active.filter(t => t.status === "cleared");
  const firstDate = [...posted.map(t => t.occurredOn)].sort()[0];
  // Exclude the first observed partial month and the current incomplete month.
  const periods = [...new Set(posted.map(t => t.occurredOn.slice(0, 7)))]
    .filter(p => p < period && firstDate && `${p}-01` >= firstDate).sort().slice(-3);
  const expenses = active.filter(t => t.direction === "expense" && state.accounts.some(a => a.id === t.accountId && !a.archivedAt));
  const groups = new Map<string, FinanceTransactionRecord[]>();
  for (const t of expenses) {
    const { key } = recurrenceIdentity(t);
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  const bills: PlannedBill[] = [];
  for (const [key, unsorted] of groups) {
    const rows = [...unsorted].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    const cleared = rows.filter(t => t.status === "cleared");
    const latest = rows.at(-1)!;
    const eligibleCategory = /^(general services (other general services|insurance)|rent and utilities|entertainment other entertainment|general merchandise other general merchandise)/i.test(latest.category);
    if (!eligibleCategory) continue;
    if (cleared.length < 2 || daysBetween(latest.occurredOn, asOf) > 45 || /^(bank fees|loan payments)/i.test(latest.category)) continue;
    // Multiple purchases per month are not evidence of a subscription.
    if (new Set(rows.map(t => t.occurredOn.slice(0, 7))).size !== rows.length) continue;
    const recent = rows.slice(-3);
    if (recent.slice(1).some((t, i) => { const gap = daysBetween(recent[i].occurredOn, t.occurredOn); return gap < 20 || gap > 45; })) continue;
    const tail = rows.slice(-2);
    const variableUtility = latest.category.toLowerCase().startsWith("rent and utilities");
    if (!variableUtility && Math.max(...tail.map(t => t.amount)) / Math.min(...tail.map(t => t.amount)) > 1.3) continue;
    const { name } = recurrenceIdentity(latest);
    const sourceKey = `recurring:${key}`;
    if (state.bills.some(b => b.evidence?.sourceKey === sourceKey || (!b.archivedAt && b.accountId === latest.accountId && b.name.toLowerCase() === name.toLowerCase()))) continue;
    const variable = tail[0].amount !== tail[1].amount;
    const amount = variableUtility ? round(recent.reduce((s, t) => s + t.amount, 0) / recent.length) : latest.amount;
    bills.push({ name, amount, dueDate: nextMonth(latest.occurredOn), accountId: latest.accountId, category: latest.category, entityScope: latest.entityScope, recurring: "monthly", evidence: {
      kind: "transaction_history", sourceKey, transactionIds: rows.map(t => t.id), generatedOn: asOf, estimated: true,
      basis: `${cleared.length} posted payments, ${rows[0].occurredOn}–${latest.occurredOn}. ${variableUtility ? "Average recent amount" : variable ? "Latest amount; previous charges vary" : "Latest repeated amount"}. Next date estimated from payment timing; autopay unconfirmed.${latest.status === "pending" ? " Latest bank payment is still pending." : ""}`
    } });
  }
  const budgetGroups = new Map<string, FinanceTransactionRecord[]>();
  for (const t of posted.filter(t => t.direction === "expense" && periods.includes(t.occurredOn.slice(0, 7)))) {
    const key = `${t.entityScope}:${financeSpendingGroup(t.category)}`;
    budgetGroups.set(key, [...(budgetGroups.get(key) || []), t]);
  }
  const budgets: PlannedBudget[] = [];
  for (const [key, rows] of budgetGroups) {
    const entityScope = rows[0].entityScope, category = financeSpendingGroup(rows[0].category);
    if (state.budgets.some(b => !b.archivedAt && b.period === period && b.entityScope === entityScope && (b.categoryGroup === category || b.category === category || rows.some(t => t.category === b.category)))) continue;
    const mean = rows.reduce((s, t) => s + t.amount, 0) / periods.length;
    const recurringFloor = bills.filter(b => b.entityScope === entityScope && financeSpendingGroup(b.category) === category).reduce((s, b) => s + b.amount, 0);
    const limit = Math.ceil(Math.max(mean, recurringFloor) / 5) * 5;
    budgets.push({ category, categoryGroup: category, entityScope, period, limit, evidence: {
      kind: "transaction_history", sourceKey: `budget:${period}:${key}`, transactionIds: rows.map(t => t.id), generatedOn: asOf, estimated: true,
      basis: `Recorded ${periods.join(", ")} average ${round(mean).toFixed(2)} USD/month, rounded up to $5${recurringFloor > mean ? "; raised to cover detected recurring charges" : ""}. Transfers and pending payments excluded from the baseline. Limited imported history; adjustable starting limit.`
    } });
  }
  return { asOf, periods, budgets: budgets.sort((a, b) => b.limit - a.limit), bills: bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate)), reviewIds: active.filter(t => !t.reviewed).map(t => t.id).sort(), pendingCount: active.filter(t => !t.reviewed && t.status === "pending").length, notes: [
    "Starter limits reflect recorded spending, not a verified income or affordability target. Missing accounts, cash spending and annual costs may change this plan.",
    "Only repeated monthly payment patterns become bills. Single charges and multiple purchases in one month are not assumed to be subscriptions.",
    "Estimated bills are reminders, not confirmation of a debt, payment, or autopay enrollment. Transfers and credit-card repayments are excluded."
  ] };
}
