"use client";

import * as Popover from "@radix-ui/react-popover";
import { WorkspaceButton } from "../admin-shell/WorkspaceKit";
import SelectField from "../ui/SelectField";
import type { FinanceOverviewModel, OverviewFilters } from "../../lib/modules/finance/overview-model";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import styles from "./FinanceChart.module.css";

type Props = {
  filters: OverviewFilters;
  model: FinanceOverviewModel;
  budgets: FinanceState["budgets"];
  activeCount: number;
  onFilters: (filters: OverviewFilters) => void;
};

export default function FinanceChartFilters({ filters, model, budgets, activeCount, onFilters }: Props) {
  const change = (patch: Partial<OverviewFilters>) => onFilters({ ...filters, ...patch });
  const picker = { portalToBody: true, menuClassName: styles.filterOptions };

  return <Popover.Root>
    <Popover.Trigger asChild>
      <WorkspaceButton icon="filter" aria-label="Filter chart" title="Filter chart" aria-pressed={activeCount > 0} />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content data-module="finance" className={styles.filterPanel} align="end" sideOffset={8} collisionPadding={12} aria-label="Chart filters">
        <header className={styles.filterHeader}>
          <h3>Chart filters</h3>
          <Popover.Close asChild><WorkspaceButton icon="close" title="Close filters" aria-label="Close filters" /></Popover.Close>
        </header>
        <div className={styles.filterGrid}>
          <label>Account
            <SelectField {...picker} searchable aria-label="Chart account" value={filters.account} onChange={event => change({ account: event.target.value })}>
              <option value="">All accounts</option>
              {model.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </SelectField>
          </label>
          <label>Category
            <SelectField {...picker} searchable aria-label="Chart category" value={filters.category} onChange={event => change({ category: event.target.value })}>
              <option value="">All categories</option>
              {model.categories.map(category => <option key={category}>{category}</option>)}
            </SelectField>
          </label>
          <label className={styles.budgetField}>Budget
            <SelectField {...picker} searchable aria-label="Chart budget" value={filters.budget} onChange={event => change({ budget: event.target.value })}>
              <option value="">All budgets</option>
              {budgets.filter(budget => !budget.archivedAt).map(budget =>
                <option key={budget.id} value={budget.id}>{budget.category} · {budget.period} · {budget.entityScope}</option>
              )}
            </SelectField>
          </label>
          <label>Transactions
            <SelectField {...picker} aria-label="Chart transaction direction" value={filters.direction} onChange={event => change({ direction: event.target.value as OverviewFilters["direction"] })}>
              <option value="all">Income &amp; spending</option>
              <option value="income">Income only</option>
              <option value="expense">Spending only</option>
            </SelectField>
          </label>
          <label>Status
            <SelectField {...picker} aria-label="Chart transaction status" value={filters.status} onChange={event => change({ status: event.target.value as OverviewFilters["status"] })}>
              <option value="cleared">Posted only</option>
              <option value="pending">Pending only</option>
              <option value="all">Posted &amp; pending</option>
            </SelectField>
          </label>
        </div>
        <footer className={styles.filterFooter}>
          <button type="button" onClick={() => change({ account: "", category: "", budget: "", direction: "all", status: "cleared" })}>Reset chart filters</button>
          <Popover.Close asChild><WorkspaceButton intent="primary">Done</WorkspaceButton></Popover.Close>
        </footer>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
