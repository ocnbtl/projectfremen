"use client";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import { DEFAULT_OVERVIEW_FILTERS, overviewDate, type FinanceOverviewModel, type OverviewFilters, type OverviewSelection } from "../../lib/modules/finance/overview-model";
import SelectField from "../ui/SelectField";
import DateField from "../people/DateField";
import { Icon, IconTile, money, Panel } from "./FinancePrimitives";
import FinanceOverviewChart from "./FinanceOverviewChart";

export default function FinanceOverviewView({ state, model, filters, selection, onFilters, onSelect, onAddAccount }: {
  state: FinanceState; model: FinanceOverviewModel; filters: OverviewFilters; selection: OverviewSelection;
  onFilters: (filters: OverviewFilters) => void; onSelect: (selection: OverviewSelection) => void; onAddAccount: () => void;
}) {
  const change = (patch: Partial<OverviewFilters>) => onFilters({ ...filters, ...patch });
  const activeFilters = [filters.account, filters.category, filters.budget, filters.status !== "cleared", filters.direction !== "all"].filter(Boolean).length;
  return <div className="finance-overview-content">
    {!model.accounts.length && <div className="finance-welcome"><IconTile hue="green" icon="Wallet" /><div><h2>Your money, in one place.</h2><p>Add an account or import a statement to begin.</p></div><button className="finance-action" onClick={onAddAccount}>Add account</button></div>}
    <Panel className="finance-overview-cashflow">
      <div className="finance-panel-heading"><div><h2>Income & spending</h2><p>{overviewDate(model.from)} – {overviewDate(model.to)}</p></div><button type="button" aria-label="Inspect selected range" onClick={() => onSelect({ kind: "summary", id: "" })}><Icon name="Chevron" /></button></div>
      <div className="finance-chart-controls">
        <div className="finance-range-presets" role="group" aria-label="Chart date range">{([['30d', '30 days'], ['90d', '90 days'], ['year', 'Year'], ['all', 'All'], ['custom', 'Custom']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filters.range === value} onClick={() => change({ range: value })}>{label}</button>)}</div>
        {filters.range === "custom" && <div className="finance-chart-dates"><DateField theme="finance" label="From date" compact value={filters.from || model.from} onChange={from => change({ from })} /><DateField theme="finance" label="To date" compact value={filters.to || model.to} onChange={to => change({ to })} /></div>}
        <details className="finance-chart-filters"><summary><Icon name="Filter" />Filters{activeFilters > 0 && <span>{activeFilters}</span>}</summary><div className="finance-chart-filter-grid">
          <label>Account<SelectField aria-label="Chart account" searchable value={filters.account} onChange={event => change({ account: event.target.value })}><option value="">All accounts</option>{model.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField></label>
          <label>Category<SelectField aria-label="Chart category" searchable value={filters.category} onChange={event => change({ category: event.target.value })}><option value="">All categories</option>{model.categories.map(category => <option key={category}>{category}</option>)}</SelectField></label>
          <label>Budget<SelectField aria-label="Chart budget" searchable value={filters.budget} onChange={event => change({ budget: event.target.value })}><option value="">All budgets</option>{state.budgets.filter(b => !b.archivedAt).map(b => <option key={b.id} value={b.id}>{b.category} · {b.period} · {b.entityScope}</option>)}</SelectField></label>
          <label>Transactions<SelectField aria-label="Chart transaction direction" value={filters.direction} onChange={event => change({ direction: event.target.value as OverviewFilters["direction"] })}><option value="all">Income & spending</option><option value="income">Income only</option><option value="expense">Spending only</option></SelectField></label>
          <label>Status<SelectField aria-label="Chart transaction status" value={filters.status} onChange={event => change({ status: event.target.value as OverviewFilters["status"] })}><option value="cleared">Posted only</option><option value="pending">Pending only</option><option value="all">Posted & pending</option></SelectField></label>
          <button type="button" className="finance-text-action" onClick={() => onFilters({ ...DEFAULT_OVERVIEW_FILTERS })}>Reset chart filters</button>
        </div></details>
        {activeFilters > 0 && <p className="finance-filter-caption">{[model.accountNames.get(filters.account), filters.category, model.budget ? `${model.budget.category} budget (${model.budget.period})` : filters.budget ? "Unavailable budget" : "", filters.status !== "cleared" ? `${filters.status === "all" ? "Includes" : "Only"} pending` : "", filters.direction !== "all" ? `${filters.direction} only` : ""].filter(Boolean).join(" · ")}</p>}
      </div>
      <div className="finance-flow-totals">{[["Income", model.income], ["Spending", model.spending], ["Net flow", model.net]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(Number(value))}</strong></div>)}</div>
      <FinanceOverviewChart model={model} selection={selection} onSelect={onSelect} />
      <p className="finance-chart-coverage">{model.hasRecords ? `Recorded history: ${overviewDate(model.first)} – ${overviewDate(model.latest)}. ` : "No recorded history yet. "}Transfers excluded. {model.pendingCount ? "Includes pending amounts that may change. " : ""}Gaps may reflect incomplete records.</p>
    </Panel>
    <Panel className="finance-spending-breakdown">
      <div className="finance-panel-heading"><div><h2>Where money went</h2><p>{model.spendingGroups.length} categories · same chart filters</p></div><strong>{money(model.spending, { cents: true })}</strong></div>
      <div className="finance-spending-sort"><label>Sort<SelectField aria-label="Sort spending categories" value={filters.spendingSort} onChange={event => change({ spendingSort: event.target.value as OverviewFilters["spendingSort"] })}><option value="amount-desc">Largest amount</option><option value="amount-asc">Smallest amount</option><option value="count">Most transactions</option><option value="name">Category A–Z</option></SelectField></label></div>
      <ol>{model.spendingGroups.map(group => <li key={group.category}><button type="button" aria-pressed={selection.kind === "category" && selection.id === group.category} onClick={() => onSelect({ kind: "category", id: group.category })}><span><strong>{group.category}</strong><small>{group.count} transaction{group.count === 1 ? "" : "s"}</small></span><span><strong>{money(group.amount, { cents: true })}</strong><small>{model.spending ? Math.round(group.amount / model.spending * 100) : 0}%</small></span><meter aria-label={`${group.category} share of spending`} min={0} max={model.spending || 1} value={group.amount} /></button></li>)}</ol>
      {!model.spendingGroups.length && <p className="finance-inline-empty">No spending matches these filters. Try another range, category or transaction type.</p>}
    </Panel>
    <Panel><div className="finance-panel-heading"><div><h2>Transaction stream</h2><p>Latest in this selection</p></div><span>{model.transactions.length}</span></div><div className="finance-focus-queue">{model.transactions.slice(0, 8).map(t => <button type="button" aria-pressed={selection.kind === "transaction" && selection.id === t.id} key={t.id} onClick={() => onSelect({ kind: "transaction", id: t.id })}><IconTile hue={t.direction === "income" ? "green" : "brown"} icon="Banknote" /><span><strong>{t.merchant}</strong><small>{overviewDate(t.occurredOn)} · {t.category}</small></span><strong>{money(t.direction === "income" ? t.amount : -t.amount, { sign: true, cents: true })}</strong></button>)}{!model.transactions.length && <p className="finance-inline-empty">Your matching transactions will appear here.</p>}</div></Panel>
  </div>;
}
