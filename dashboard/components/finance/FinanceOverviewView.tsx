"use client";

import { financeSpendingGroup } from "../../lib/modules/finance/planning";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import type { FinanceDataset } from "../../lib/modules/finance/types";
import type { FinanceView } from "../../lib/native-objects/url-state";
import { buildFinanceViewModel } from "../../lib/modules/finance/view-model";
import { accountIcon, Icon, IconTile, money, Panel } from "./FinancePrimitives";
import FinanceCashflowChart from "./FinanceCashflowChart";

export default function FinanceOverviewView({ state, dataset, query, attentionOnly, onView, onSmart, onOpen, onAddAccount, onPeriod }: {
  state: FinanceState; dataset: FinanceDataset; query: string; attentionOnly: boolean;
  onView: (view: FinanceView) => void; onSmart: (id: string) => void;
  onOpen: (view: "accounts" | "transactions" | "bills" | "budgets", id: string) => void;
  onAddAccount: () => void; onPeriod: (period: string) => void;
}) {
  const { accounts, transactions, bills, budgets, snapshot } = dataset;
  const totals = buildFinanceViewModel(dataset);
  const matches = (...values: unknown[]) => values.join(" ").toLowerCase().includes(query.trim().toLowerCase());
  const dates = new Map(state.transactions.map((item) => [item.id, item.occurredOn]));
  const recent = [...transactions].sort((a, b) => (dates.get(b.id) || "").localeCompare(dates.get(a.id) || ""));
  const overdue = bills.filter((bill) => !bill.evidence && bill.status !== "paid" && (bill.status === "overdue" || bill.dueIn < 0));
  const unreviewed = recent.filter((txn) => !txn.ufInit);
  const overBudget = budgets.filter((budget) => budget.spent > budget.limit);
  const checks = dataset.reviewItems.filter((item) => !item.done);
  const attentionCount = overdue.length + overBudget.length + checks.length;
  const upcoming = bills.filter((bill) => bill.status !== "paid" && bill.dueIn >= 0 && bill.dueIn <= 10).sort((a, b) => a.dueIn - b.dueIn);
  const latestPeriod = snapshot.cashflow.periods?.at(-1);
  const groupedSpend = new Map<string, number>();
  for (const t of state.transactions.filter(t => !t.archivedAt && t.status === "cleared" && t.direction === "expense" && t.occurredOn.startsWith(latestPeriod || "none"))) { const key = financeSpendingGroup(t.category); groupedSpend.set(key, (groupedSpend.get(key) || 0) + t.amount); }
  const rankedSpend = [...groupedSpend].sort((a, b) => b[1] - a[1]);
  const totalSpend = rankedSpend.reduce((s, [, amount]) => s + amount, 0);
  const queue = <div className="finance-focus-queue">
    {overdue.filter((bill) => matches(bill.name, bill.category, "bill overdue")).map((bill) => <button key={bill.id} onClick={() => onOpen("bills", bill.id)}><IconTile hue="brown" icon="Calendar" /><span><strong>{bill.name}</strong><small>Overdue · {bill.due}</small></span><strong>{money(bill.amount)}</strong></button>)}
    {overBudget.filter((budget) => matches(budget.category, "budget")).map((budget) => <button key={budget.id} onClick={() => onOpen("budgets", budget.id)}><IconTile hue="brown" icon="PiggyBank" /><span><strong>{budget.category}</strong><small>{money(budget.spent - budget.limit)} over budget</small></span><Icon name="Chevron" /></button>)}
    {!!checks.length && matches("monthly review close checks") && <button onClick={() => onView("review")}><IconTile hue="brown" icon="Check" /><span><strong>Finish your monthly review</strong><small>{checks.length} open check{checks.length === 1 ? "" : "s"}</small></span><Icon name="Chevron" /></button>}
    {!attentionCount && <div className="finance-inline-empty"><Icon name="Check" /><strong>{accounts.length ? "No exceptions to resolve." : "No items to review yet."}</strong><p>Overdue confirmed bills, budget overruns and open monthly checks appear here. Transaction approvals have their own To review view.</p></div>}
    {query && attentionCount > 0 && ![...overdue.map(b => `${b.name} ${b.category} bill overdue`), ...unreviewed.map(t => `${t.merchant} ${t.account} transaction unreviewed`), ...overBudget.map(b => `${b.category} budget`), ...(checks.length ? ["monthly review close checks"] : [])].some(value => matches(value)) && <p className="finance-inline-empty">No attention items match “{query}”.</p>}
  </div>;
  if (attentionOnly) return <>
    <div className="finance-focus-summary"><IconTile hue="brown" icon="Alert" /><div><h2>{attentionCount ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} to work through` : "A clear view of what needs you"}</h2><p>Resolve confirmed overdue bills, budget overruns and monthly checks.</p></div></div>
    <Panel className="finance-attention-page">{queue}</Panel>
    {unreviewed.length > 100 && <button className="finance-text-action" onClick={() => onSmart("unreviewed")}>View all {unreviewed.length} unreviewed transactions</button>}
  </>;
  if (query.trim()) {
    const results = [
      ...accounts.filter(a => matches(a.name, a.inst, a.kind, a.mask)).map(a => ({ id: a.id, label: a.name, detail: `Account · ${a.inst}`, amount: a.balance, view: "accounts" as const })),
      ...recent.filter(t => matches(t.merchant, t.category, t.account, t.memo)).map(t => ({ id: t.id, label: t.merchant, detail: `Transaction · ${t.date}`, amount: t.amount, view: "transactions" as const })),
      ...bills.filter(b => matches(b.name, b.category)).map(b => ({ id: b.id, label: b.name, detail: `Bill · ${b.due}`, amount: b.amount, view: "bills" as const })),
      ...budgets.filter(b => matches(b.category)).map(b => ({ id: b.id, label: b.category, detail: "Budget limit", amount: b.limit, view: "budgets" as const }))
    ];
    return <Panel><div className="finance-panel-heading"><h2>{results.length} result{results.length === 1 ? "" : "s"}</h2></div><div className="finance-focus-queue">{results.slice(0, 100).map(result => <button key={`${result.view}-${result.id}`} onClick={() => onOpen(result.view, result.id)}><IconTile hue="green" icon="Search" /><span><strong>{result.label}</strong><small>{result.detail}</small></span><strong>{money(result.amount)}</strong></button>)}{!results.length && <p className="finance-inline-empty">No records match “{query}”. Try an account, merchant or category.</p>}</div>{results.length > 100 && <p className="finance-inline-empty">Showing the first 100 matches. Narrow your search to find a specific record.</p>}</Panel>;
  }
  return <>
    {!accounts.length && <div className="finance-welcome"><IconTile hue="green" icon="Wallet" /><div><h2>Your money, in one place.</h2><p>Start with an account, then add transactions or import a statement.</p></div><button className="finance-action is-primary" onClick={onAddAccount}><Icon name="Plus" />Add your first account</button></div>}
    <div className="finance-summary-grid">
      {[['Net worth', money(totals.accountTotals.net), 'Across your recorded balances'], ['Available cash', money(totals.accountTotals.liquid), 'Checking, savings and cash'], ['Debt', money(Math.abs(totals.accountTotals.debt)), 'Recorded credit balances']].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{accounts.length ? value : "—"}</strong><small>{detail}</small></article>)}
    </div>
    <Panel className="finance-overview-cashflow"><div className="finance-panel-heading"><div><h2>Income & spending</h2><p>Select a month to see exactly what came in and went out</p></div><button onClick={() => onView("transactions")}>View transactions <span aria-hidden="true">↗</span></button></div>
      <FinanceCashflowChart cashflow={snapshot.cashflow} summary={totals.cashflowSummary} onPeriod={onPeriod} />
    </Panel>
    {!!rankedSpend.length && <Panel className="finance-spending-breakdown"><div className="finance-panel-heading"><div><h2>Where money went</h2><p>{latestPeriod} · posted spending by category</p></div><strong>{money(totalSpend, { cents: true })}</strong></div><ol>{rankedSpend.slice(0, 5).map(([category, amount]) => <li key={category}><div><span>{category}</span><strong>{money(amount, { cents: true })} <small>{Math.round(amount / totalSpend * 100)}%</small></strong></div><meter aria-label={`${category} share of spending`} min={0} max={totalSpend} value={amount} /></li>)}</ol>{rankedSpend.length > 5 && <p>{money(rankedSpend.slice(5).reduce((s, [, a]) => s + a, 0), { cents: true })} across {rankedSpend.length - 5} other categories</p>}</Panel>}
    <div className="finance-home-grid">
      <Panel><div className="finance-panel-heading"><h2>Accounts <span>{accounts.length}</span></h2><button onClick={() => onView("accounts")}>View all ↗</button></div><div className="finance-focus-queue">{accounts.slice(0, 4).map(a => <button key={a.id} onClick={() => onOpen("accounts", a.id)}><IconTile hue="green" icon={accountIcon(a.kind)} /><span><strong>{a.name}</strong><small>{a.inst} · {a.kind}</small></span><strong>{money(a.balance, { cents: true })}</strong></button>)}{!accounts.length && <p className="finance-inline-empty">Add checking, savings, credit or investment accounts to see their balances here.</p>}</div></Panel>
      <Panel><div className="finance-panel-heading"><h2>Exceptions <span>{attentionCount}</span></h2><button onClick={() => onSmart("unreviewed")}>To review · {unreviewed.length} ↗</button></div>{queue}</Panel>
      <Panel><div className="finance-panel-heading"><h2>Transaction stream</h2><button onClick={() => onView("transactions")}>View all ↗</button></div><div className="finance-focus-queue">{recent.slice(0, 5).map(txn => <button key={txn.id} onClick={() => onOpen("transactions", txn.id)}><IconTile hue={txn.io === "income" ? "green" : "brown"} icon="Banknote" /><span><strong>{txn.merchant}</strong><small>{txn.date} · {txn.io === "transfer" ? "Transfer · " : ""}{txn.category}</small></span><strong>{money(txn.amount, { sign: txn.io !== "transfer", cents: true })}</strong></button>)}{!recent.length && <p className="finance-inline-empty">Your latest recorded transactions will appear here.</p>}</div></Panel>
      <Panel><div className="finance-panel-heading"><h2>Coming up <span>Next 10 days</span></h2><button onClick={() => onView("bills")}>All bills ↗</button></div><div className="finance-focus-queue">{upcoming.slice(0, 5).map(bill => <button key={bill.id} onClick={() => onOpen("bills", bill.id)}><IconTile hue="brown" icon="Calendar" /><span><strong>{bill.name}</strong><small>{bill.dueIn === 0 ? "Today" : bill.due} · {!bill.recurring ? "One-time" : bill.recurring}</small></span><strong>{money(bill.amount, { cents: true })}</strong></button>)}{!upcoming.length && <p className="finance-inline-empty">No unpaid bills recorded for the next 10 days.</p>}</div></Panel>
    </div>
  </>;
}
