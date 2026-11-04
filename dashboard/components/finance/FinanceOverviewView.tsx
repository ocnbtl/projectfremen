"use client";
import * as Popover from "@radix-ui/react-popover";
import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {WorkspaceButton} from "../admin-shell/WorkspaceKit";
import styles from "./FinanceCollections.module.css";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import { overviewDate, type FinanceOverviewModel, type OverviewFilters, type OverviewSelection } from "../../lib/modules/finance/overview-model";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import DateField from "../people/DateField";
import { IconTile, money, Panel } from "./FinancePrimitives";
import FinanceMerchantAvatar from "./FinanceMerchants";
import FinanceOverviewChart from "./FinanceOverviewChart";
import FinanceChartFilters from "./FinanceChartFilters";
import { TransactionAccount } from "./FinanceTransactionAccount";
import FinanceDirectionDot from "./FinanceDirectionDot";
import chartStyles from "./FinanceChart.module.css";

export default function FinanceOverviewView({ state, model, filters, selection, onFilters, onSelect, onAddAccount }: {
  state: FinanceState; model: FinanceOverviewModel; filters: OverviewFilters; selection: OverviewSelection;
  onFilters: (filters: OverviewFilters) => void; onSelect: (selection: OverviewSelection) => void; onAddAccount: () => void;
}) {
  const [datesOpen, setDatesOpen] = useState(false), rangeId = useId(), reduced = useReducedMotion();
  const change = (patch: Partial<OverviewFilters>) => onFilters({ ...filters, ...patch });
  const chooseRange = (range: OverviewFilters["range"]) => {
    change(range === "custom" ? { range, from: filters.from || model.from, to: filters.to || model.to } : { range });
    setDatesOpen(range === "custom");
  };
  const activeFilters = [filters.account, filters.category, filters.budget, filters.status !== "cleared", filters.direction !== "all"].filter(Boolean).length;
  return <div className={"finance-overview-content "+styles.overview}>
    {!model.accounts.length && <div className="finance-welcome"><IconTile hue="green" icon="Wallet" /><div><h2>No accounts yet</h2><p>Add an account to get started.</p></div><button className="finance-action" onClick={onAddAccount}>Add account</button></div>}
    <Panel className="finance-overview-cashflow">
      <div className="finance-panel-heading"><div><h2>Income & spending</h2><Popover.Root open={datesOpen} onOpenChange={setDatesOpen}><Popover.Trigger asChild><button type="button" className={styles.rangeLabel} aria-label="Edit chart date range"><UnigentamosIcon role="calendar" size={15}/>{overviewDate(model.from)} – {overviewDate(model.to)}<UnigentamosIcon role="chevron-down" size={13}/></button></Popover.Trigger><Popover.Portal><Popover.Content className={"workspace-nav-menu "+styles.dateMenu} align="start" sideOffset={8} collisionPadding={12} aria-label="Chart date range editor"><div className="finance-chart-dates"><DateField theme="finance" label="From date" compact value={filters.range === "custom" ? filters.from || model.from : model.from} onChange={from => change({ range:"custom", from, to: model.to })}/><DateField theme="finance" label="To date" compact value={filters.range === "custom" ? filters.to || model.to : model.to} onChange={to => change({ range:"custom", to, from: model.from })}/></div><WorkspaceButton onClick={()=>setDatesOpen(false)} icon="check">Done</WorkspaceButton></Popover.Content></Popover.Portal></Popover.Root></div><div className={styles.chartActions}>
        <FinanceChartFilters filters={filters} model={model} budgets={state.budgets} activeCount={activeFilters} onFilters={onFilters} />
        <Popover.Root>
          <Popover.Trigger asChild><WorkspaceButton icon="information" aria-label="About these totals" title="About these totals" /></Popover.Trigger>
          <Popover.Portal><Popover.Content className={"workspace-nav-menu "+styles.coverage} align="end" sideOffset={8} collisionPadding={12} aria-label="About these totals">
            <div className={chartStyles.coverage}>
              <h3>About these totals</h3>
              <p>{model.hasRecords ? `Your records run from ${overviewDate(model.first)} to ${overviewDate(model.latest)}.` : "Your totals will appear here once you add transactions."}</p>
              <p>Transfers between accounts don’t count toward income or spending.{model.pendingCount > 0 && " Pending amounts are included and may change when they post."}</p>
              {model.hasRecords && <p>Dates with no entries may be missing transactions.</p>}
            </div>
          </Popover.Content></Popover.Portal>
        </Popover.Root><WorkspaceButton icon="list" title="View transactions in this range" aria-label="View transactions in this range" onClick={() => onSelect({kind:"summary",id:""})}/></div></div>
      <div className="finance-chart-controls">
        <div className={"finance-range-presets "+styles.rangePresets} role="group" aria-label="Chart date range">{([['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['year', 'Year'], ['all', 'All'], ['custom', 'Custom']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filters.range === value} onClick={() => chooseRange(value)}>{filters.range===value && <motion.span aria-hidden="true" className={styles.rangeIndicator} layoutId={rangeId} transition={{duration:reduced?0:.3,ease:[.22,.78,.18,1]}}/>}<span>{label}</span></button>)}</div>

        {activeFilters > 0 && <p className="finance-filter-caption">{[model.accountNames.get(filters.account), filters.category, model.budget ? `${model.budget.category} budget (${model.budget.period})` : filters.budget ? "Unavailable budget" : "", filters.status !== "cleared" ? `${filters.status === "all" ? "Includes" : "Only"} pending` : "", filters.direction === "expense" ? "Spending only" : filters.direction === "income" ? "Income only" : ""].filter(Boolean).join(" · ")}</p>}
      </div>
      <div className="finance-flow-totals">
        {(["income", "spending"] as const).map(kind => <button type="button" key={kind} className={chartStyles.totalButton}
          aria-label={`View ${kind} transactions`} aria-description={`Total ${kind}: ${money(model[kind], { cents: true })}`} onClick={() => onSelect({ kind, id: "" })}>
          <span><UnigentamosIcon role={kind === "income" ? "banknote" : "credit-card"} size={16} />{kind === "income" ? "Income" : "Spending"}<UnigentamosIcon role="chevron-right" size={13} /></span>
          <strong>{money(model[kind], { cents: true })}</strong>
        </button>)}
        <div><span><UnigentamosIcon role="trending" size={16} />Net flow</span><strong>{money(model.net, { cents: true })}</strong></div>
      </div>
      <FinanceOverviewChart model={model} selection={selection} onSelect={onSelect} />

    </Panel>
    <Panel className="finance-spending-breakdown">
      <div className="finance-panel-heading"><div><h2>Spending by category</h2><p>{model.spendingGroups.length} categories</p></div><strong className={styles.categoryTotal}>{money(model.spending, { cents: true })}</strong><div className={styles.chartActions}><SelectField title="Sort spending categories" className="toolbar-icon-select" triggerContent={<UnigentamosIcon role="sort" size={20}/>} aria-label="Sort spending categories" value={filters.spendingSort} onChange={event => change({ spendingSort: event.target.value as OverviewFilters["spendingSort"] })}><option value="amount-desc">Largest amount</option><option value="amount-asc">Smallest amount</option><option value="count">Most transactions</option><option value="name">Category A–Z</option></SelectField></div></div>

      <ol>{model.spendingGroups.map(group => {const usage=group.budgetUsage;return <li key={group.category}><button type="button" aria-pressed={selection.kind === "category" && selection.id === group.category} onClick={() => onSelect({ kind: "category", id: group.category })}><span><strong>{group.category}</strong><small>{group.count} transaction{group.count === 1 ? "" : "s"}</small></span><span><strong>{money(group.amount, { cents: true })}</strong><small>Spent in range</small></span><div className={styles.budgetUsage} data-over={usage.spent>usage.limit && usage.kind === "available" || undefined}>{usage.kind === "available" ? <><span><span>{usage.shared ? "Shared budget" : "Budget"}</span><b>{usage.percent===null ? "No allowance" : `${Math.round(usage.percent)}% used`}</b></span><meter aria-label={`${group.category} ${usage.shared?"shared ":""}budget usage`} min={0} max={usage.limit || 1} value={Math.min(usage.spent,usage.limit || 1)} /><small>{money(usage.spent,{cents:true})} of {money(usage.limit,{cents:true})} · {usage.periods.join(", ")}</small></> : <small>{usage.kind === "ambiguous" ? "Multiple budgets — review in Budgets" : "No budget set"}</small>}</div></button></li>;})}</ol>
      {model.spendingGroups.some(g=>g.budgetUsage.kind === "available") && <p className={styles.budgetNote}>Budget usage covers full saved months and all accounts{filters.status === "cleared" ? " · Posted only" : filters.status === "pending" ? " · Pending only" : " · Posted & pending"}.</p>}
      {!model.spendingGroups.length && <p className="finance-inline-empty">No spending matches these filters. Try another range, category or transaction type.</p>}
    </Panel>
    <Panel className="finance-recent-transactions"><div className="finance-panel-heading"><div><h2>Recent transactions</h2></div><span>{model.transactions.length}</span></div><div className="finance-focus-queue" tabIndex={0} aria-label="Recent transactions, scroll for more">{model.transactions.map(t => <article key={t.id} className={styles.recentRow}><button type="button" aria-pressed={selection.kind === "transaction" && selection.id === t.id} onClick={() => onSelect({ kind: "transaction", id: t.id })}><FinanceMerchantAvatar kind="transaction" id={t.id} label={t.merchant}/><span><strong>{t.merchant}</strong><small>{overviewDate(t.occurredOn)} · {t.category}</small></span><strong>{money(t.direction === "income" ? t.amount : -t.amount, { sign: true, cents: true })}<FinanceDirectionDot direction={t.direction} /></strong></button><TransactionAccount id={t.accountId} label={model.accountNames.get(t.accountId)}/></article>)}{!model.transactions.length && <p className="finance-inline-empty">Your matching transactions will appear here.</p>}</div></Panel>
  </div>;
}
