"use client";

import MetricStrip from "../operational/MetricStrip";
import QuickActionBar from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import type { FinanceFilter, FinanceSort } from "../../lib/native-objects/url-state";
import type { FinanceTransactionsViewModel } from "../../lib/modules/finance/transactions-view-model";
import {
  Chip,
  HeaderAction,
  Icon,
  Panel,
  WorkspaceHeader,
  money
} from "./FinancePrimitives";
import styles from "./FinanceOperational.module.css";

const PREVIEW_REASON = "This Finance dataset is a read-only fixture. Persistent transaction writes, reconciliation, evidence attachment, and saved views are not connected.";

export type FinanceTransactionsViewProps = {
  model: FinanceTransactionsViewModel;
  filter: FinanceFilter;
  checkedIds: ReadonlySet<string>;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: FinanceFilter) => void;
  onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void;
  onCheckedChange: (id: string, checked: boolean) => void;
  onClearChecked: () => void;
  onOpenFilterPreview: () => void;
  onOpenColumnsPreview: () => void;
};

function statusTone(status: string) {
  return status === "pending" ? "yellow" as const : "green" as const;
}

export default function FinanceTransactionsView({
  model,
  filter,
  checkedIds,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onSelect,
  onCheckedChange,
  onClearChecked,
  onOpenFilterPreview,
  onOpenColumnsPreview
}: FinanceTransactionsViewProps) {
  const displayedSort = model.sort;
  const effectiveFilter = filter === "unreviewed" ? "unreviewed" : "";

  return (
    <>
      <WorkspaceHeader
        title="Transactions"
        subtitle="Search, classify, and inspect money movement without changing fixture records"
        actions={(
          <>
            <HeaderAction icon="Filter" onClick={onOpenFilterPreview}>Filter</HeaderAction>
            <HeaderAction icon="Sliders" onClick={onOpenColumnsPreview}>Columns</HeaderAction>
            <HeaderAction icon="Check" disabled title={PREVIEW_REASON} reasonId="finance-preview-status">Reconcile</HeaderAction>
            <HeaderAction icon="Plus" primary disabled title={PREVIEW_REASON} reasonId="finance-preview-status">Record</HeaderAction>
          </>
        )}
      />

      <MetricStrip
        className={styles.metrics}
        ariaLabel="Transaction scope metrics"
        items={[
          { id: "visible", label: "Visible", value: model.visibleCount, detail: `${model.sourceCount} fixture records` },
          { id: "income", label: "Income", value: money(model.totals.income, { cents: true }), detail: `${model.counts.income} classified`, tone: "positive" },
          { id: "spending", label: "Spending", value: money(model.totals.spending, { cents: true }), detail: `${model.counts.expense} classified` },
          { id: "pending", label: "Pending", value: model.counts.pending, detail: "Needs review", tone: model.counts.pending ? "attention" : "default" },
          { id: "receipts", label: "Receipts missing", value: model.counts.receiptMissing, detail: "Literal empty receipt fields", tone: model.counts.receiptMissing ? "attention" : "default" },
          { id: "savings", label: "Savings rows", value: money(model.totals.savingsMovement, { cents: true }), detail: `${model.counts.savings} classified · independent of income/spend` }
        ]}
      />

      <div className={styles.scopeBar}>
        <label className={styles.search}>
          <Icon name="Search" />
          <span className="sr-only">Search transactions</span>
          <input
            aria-label="Search transactions"
            value={model.query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search merchant, entity, amount, memo, receipt, category, account, or TX ID"
          />
        </label>
        <div className={styles.filterGroup} role="group" aria-label="Transaction filters">
          <button type="button" className={styles.filterButton} data-active={effectiveFilter === ""} aria-pressed={effectiveFilter === ""} onClick={() => onFilterChange("")}>All</button>
          <button type="button" className={styles.filterButton} data-active={effectiveFilter === "unreviewed"} aria-pressed={effectiveFilter === "unreviewed"} onClick={() => onFilterChange("unreviewed")}>Unreviewed</button>
          <button type="button" className={styles.filterButton} onClick={onOpenFilterPreview}>More filters</button>
        </div>
        <label className={styles.sortLabel}>
          Sort
          <select
            className={styles.sortSelect}
            aria-label="Sort transactions"
            value={displayedSort}
            onChange={(event) => onSortChange(event.target.value as FinanceSort)}
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="amount-desc">Amount high to low</option>
            <option value="amount-asc">Amount low to high</option>
            <option value="merchant-asc">Merchant A–Z</option>
          </select>
        </label>
      </div>

      <Panel className={`${styles.ledger} finance-transaction-table`}>
        <div className={styles.ledgerToolbar}>
          <div className={styles.ledgerSummary} aria-live="polite">
            <strong>{model.visibleCount} this period</strong>
            <code>{money(model.totals.income, { cents: true })} in</code>
            <code>{money(model.totals.spending, { cents: true })} out</code>
            <code>{money(model.totals.savingsMovement, { cents: true })} savings</code>
          </div>
          {checkedIds.size > 0 && (
            <div className={styles.batchState}>
              <strong>{checkedIds.size} selected</strong>
              <button type="button" onClick={onClearChecked}>Clear</button>
            </div>
          )}
        </div>

        {checkedIds.size > 0 && (
          <QuickActionBar
            ariaLabel="Transaction batch actions"
            actions={[
              { id: "finance-tx-batch-reconcile", label: "Reconcile", disabled: true, disabledReason: PREVIEW_REASON },
              { id: "finance-tx-batch-categorize", label: "Categorize", disabled: true, disabledReason: PREVIEW_REASON },
              { id: "finance-tx-batch-receipt", label: "Attach receipt", disabled: true, disabledReason: PREVIEW_REASON },
              { id: "finance-tx-batch-export", label: "Export", disabled: true, disabledReason: "No stable Finance export contract is connected." }
            ]}
          />
        )}

        <div className={styles.columnHeader} aria-hidden="true">
          <span />
          <div className={styles.columnHeaderBody}>
            <span>Date</span><span>Merchant / entity</span><span>TX ID</span><span>Account</span><span>Category</span><span>Status</span><span>Amount</span>
          </div>
        </div>

        <div role="list" aria-label="Finance transactions">
          {model.rows.map((transaction) => {
            const selected = model.selectedId === transaction.id;
            const accessibleTransaction = `${transaction.merchant}, ${transaction.date}, ${money(transaction.amount, { sign: true, cents: true })}, transaction ${transaction.id}, account ${transaction.account}`;
            return (
              <div
                role="listitem"
                className={styles.transactionRow}
                data-selected={selected || undefined}
                data-finance-transaction-id={transaction.id}
                key={transaction.id}
              >
                <label className={styles.rowCheckbox}>
                  <input
                    type="checkbox"
                    checked={checkedIds.has(transaction.id)}
                    onChange={(event) => onCheckedChange(transaction.id, event.target.checked)}
                    aria-label={`Select ${accessibleTransaction} for batch actions`}
                  />
                </label>
                <button
                  type="button"
                  className={styles.transactionBody}
                  aria-pressed={selected}
                  aria-controls="finance-inspector"
                  aria-label={`Inspect ${accessibleTransaction}`}
                  onClick={() => onSelect(transaction.id)}
                >
                  <span className={styles.secondaryCell}><strong>{transaction.date}</strong><span>{transaction.weekdayName} · W{transaction.week}</span></span>
                  <span className={styles.primaryCell}><strong>{transaction.merchant}</strong><span>{transaction.entity}</span></span>
                  <span className={styles.secondaryCell}><strong>{transaction.id}</strong><span>{transaction.ufInit ? "fixture source" : "manual"}</span></span>
                  <span className={styles.secondaryCell}><strong>{transaction.account}</strong><span>{transaction.accountType}</span></span>
                  <span><Chip hue={transaction.hue}>{transaction.category}</Chip></span>
                  <span><Chip hue={statusTone(transaction.status)}>{transaction.status}</Chip></span>
                  <strong className={`${styles.amount} ${transaction.amount > 0 ? styles.positive : ""}`}>{money(transaction.amount, { sign: true, cents: true })}</strong>
                </button>
              </div>
            );
          })}
        </div>

        {model.rows.length === 0 && (
          <SystemState
            variant="empty"
            className={styles.empty}
            title="No transactions match this scope"
            description="Clear the search or return to All. No fixture record was changed."
            action={{ label: "Clear filters", onSelect: () => { onQueryChange(""); onFilterChange(""); } }}
          />
        )}
      </Panel>
    </>
  );
}
