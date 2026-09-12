import type { FinanceState, FinanceTransactionRecord } from "./native-types";
import { financeSpendingGroup } from "./planning";

export type OverviewFilters = {
  range: "30d" | "90d" | "year" | "all" | "custom";
  from: string; to: string; account: string; category: string; budget: string;
  status: "cleared" | "pending" | "all";
  direction: "all" | "income" | "expense";
  spendingSort: "amount-desc" | "amount-asc" | "name" | "count";
};
export type OverviewSelection = { kind: "summary" | "period" | "category" | "transaction"; id: string };
export const DEFAULT_OVERVIEW_FILTERS: OverviewFilters = { range: "90d", from: "", to: "", account: "", category: "", budget: "", status: "cleared", direction: "all", spendingSort: "amount-desc" };
const DAY = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= "1900-01-01" && date <= "2100-12-31" && Number.isFinite(Date.parse(date)) && iso(new Date(date)) === date;
export function readOverviewUrl(params: URLSearchParams) {
  const filters = { ...DEFAULT_OVERVIEW_FILTERS };
  for (const key of Object.keys(filters) as (keyof OverviewFilters)[]) {
    const value = params.get(`chart-${key}`);
    if (value !== null) Object.assign(filters, { [key]: value });
  }
  if (!["30d", "90d", "year", "all", "custom"].includes(filters.range)) filters.range = "90d";
  if (!["cleared", "pending", "all"].includes(filters.status)) filters.status = "cleared";
  if (!["all", "income", "expense"].includes(filters.direction)) filters.direction = "all";
  if (!["amount-desc", "amount-asc", "name", "count"].includes(filters.spendingSort)) filters.spendingSort = "amount-desc";
  if (!validDate(filters.from)) filters.from = "";
  if (!validDate(filters.to)) filters.to = "";
  const kind = params.get("chart-detail");
  const selection: OverviewSelection = { kind: kind === "period" || kind === "category" || kind === "transaction" ? kind : "summary", id: params.get("chart-id") || "" };
  return { filters, selection };
}
export function writeOverviewUrl(base: URLSearchParams, filters: OverviewFilters, selection: OverviewSelection) {
  const params = new URLSearchParams(base);
  for (const key of Object.keys(filters) as (keyof OverviewFilters)[]) {
    if (filters[key] === DEFAULT_OVERVIEW_FILTERS[key]) params.delete(`chart-${key}`);
    else params.set(`chart-${key}`, filters[key]);
  }
  if (selection.kind === "summary") { params.delete("chart-detail"); params.delete("chart-id"); }
  else { params.set("chart-detail", selection.kind); params.set("chart-id", selection.id); }
  return params;
}
export function overviewDate(value: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}
export function transactionInBudget(transaction: FinanceTransactionRecord, budget: FinanceState["budgets"][number]) {
  return transaction.direction === "expense" && transaction.entityScope === budget.entityScope && transaction.occurredOn.startsWith(budget.period)
    && (budget.categoryGroup ? financeSpendingGroup(transaction.category) === budget.categoryGroup : transaction.category.toLowerCase() === budget.category.toLowerCase());
}
export function buildFinanceOverview(state: FinanceState, filters: OverviewFilters, query = "") {
  const accounts = state.accounts.filter(a => !a.archivedAt);
  const accountNames = new Map(state.accounts.map(a => [a.id, a.name]));
  const recorded = state.transactions.filter(t => !t.archivedAt && validDate(t.occurredOn));
  const dates = recorded.map(t => t.occurredOn).sort();
  const latest = dates.at(-1) || iso(new Date());
  const first = dates[0] || latest;
  const endDate = new Date(`${latest}T00:00:00Z`);
  const defaultStart = iso(new Date(endDate.getTime() - (filters.range === "30d" ? 29 : 89) * DAY));
  let from = filters.range === "all" ? first : filters.range === "year" ? `${latest.slice(0, 4)}-01-01` : filters.range === "custom" ? filters.from || first : defaultStart;
  let to = filters.range === "custom" ? filters.to || latest : latest;
  const invalidRange = from > to;
  const budget = state.budgets.find(b => !b.archivedAt && b.id === filters.budget);
  const needle = query.trim().toLowerCase();
  const transactions = recorded.filter(t => !invalidRange && t.occurredOn >= from && t.occurredOn <= to && t.direction !== "transfer"
    && (!filters.account || t.accountId === filters.account)
    && (!filters.category || t.category === filters.category)
    && (!filters.budget || (budget && transactionInBudget(t, budget)))
    && (filters.status === "all" || t.status === filters.status)
    && (filters.direction === "all" || t.direction === filters.direction)
    && (!needle || [t.merchant, t.memo, t.category, t.occurredOn, accountNames.get(t.accountId), String(t.amount)].join(" ").toLowerCase().includes(needle)))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.id.localeCompare(b.id));
  const cents = (value: number) => Math.round(value * 100);
  const income = transactions.filter(t => t.direction === "income").reduce((s, t) => s + cents(t.amount), 0) / 100;
  const spending = transactions.filter(t => t.direction === "expense").reduce((s, t) => s + cents(t.amount), 0) / 100;
  const categories = [...new Set(recorded.filter(t => t.direction !== "transfer").map(t => t.category))].sort((a, b) => a.localeCompare(b));
  const grouped = new Map<string, { category: string; amount: number; count: number }>();
  transactions.filter(t => t.direction === "expense").forEach(t => {
    const item = grouped.get(t.category) || { category: t.category, amount: 0, count: 0 };
    item.amount += cents(t.amount); item.count++; grouped.set(t.category, item);
  });
  const spendingGroups = [...grouped.values()].map(g => ({ ...g, amount: g.amount / 100 })).sort((a, b) =>
    (filters.spendingSort === "name" ? a.category.localeCompare(b.category) : filters.spendingSort === "count" ? b.count - a.count : filters.spendingSort === "amount-asc" ? a.amount - b.amount : b.amount - a.amount) || a.category.localeCompare(b.category));
  // Plot only the observed span: an unobserved month is never presented as zero spending.
  const plotFrom = from > first ? from : first, plotTo = to < latest ? to : latest;
  const span = (Date.parse(plotTo) - Date.parse(plotFrom)) / DAY;
  const unit = span <= 21 ? "day" : span <= 120 ? "week" : span <= 1095 ? "month" : "year";
  const periods: { id: string; to: string; label: string; income: number; spending: number; count: number }[] = [];
  if (!invalidRange && recorded.length && plotFrom <= plotTo) {
    let cursor = plotFrom;
    while (cursor <= plotTo && periods.length < 240) {
      const next = new Date(`${cursor}T00:00:00Z`);
      if (unit === "month") { next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1); }
      else if (unit === "year") { next.setUTCMonth(0, 1); next.setUTCFullYear(next.getUTCFullYear() + 1); }
      else next.setUTCDate(next.getUTCDate() + (unit === "day" ? 1 : 7));
      const periodEnd = iso(new Date(next.getTime() - DAY));
      periods.push({ id: cursor, to: periodEnd < plotTo ? periodEnd : plotTo, label: overviewDate(cursor, unit === "year" ? { year: "numeric" } : unit === "month" ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" }), income: 0, spending: 0, count: 0 });
      cursor = iso(next);
    }
    transactions.forEach(t => {
      const period = periods.find(p => t.occurredOn >= p.id && t.occurredOn <= p.to);
      if (period) { period.count++; if (t.direction === "income") period.income += cents(t.amount); else period.spending += cents(t.amount); }
    });
    periods.forEach(p => { p.income /= 100; p.spending /= 100; });
  }
  return { accounts, accountNames, categories, transactions, income, spending, net: Math.round((income - spending) * 100) / 100, spendingGroups, periods, unit, from, to, first, latest, hasRecords: recorded.length > 0, invalidRange, budget, pendingCount: transactions.filter(t => t.status === "pending").length };
}
export type FinanceOverviewModel = ReturnType<typeof buildFinanceOverview>;
