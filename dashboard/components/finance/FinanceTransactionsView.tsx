"use client";

import MetricStrip from "../operational/MetricStrip";
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
  const effectiveFilter = filter;

  return (
    <>

      <MetricStrip
        className={styles.metrics}
        ariaLabel="Transaction scope metrics"
        items={[
          { id: "visible", label: "Transactions", value: model.visibleCount, detail: `${model.sourceCount} transactions recorded` },
          { id: "income", label: "Income", value: money(model.totals.income), detail: `${model.counts.income} classified`, tone: "positive" },
          { id: "spending", label: "Spending", value: money(model.totals.spending), detail: `${model.counts.expense} classified` },
        ]}
      />

      <div className={styles.scopeBar}>
        <div className={styles.filterGroup} role="group" aria-label="Transaction filters">
          <button type="button" className={styles.filterButton} data-active={effectiveFilter === ""} aria-pressed={effectiveFilter === ""} onClick={() => onFilterChange("")}>All</button>
          <button type="button" className={styles.filterButton} data-active={effectiveFilter === "unreviewed"} aria-pressed={effectiveFilter === "unreviewed"} onClick={() => onFilterChange("unreviewed")}>To review</button>
          <button type="button" className={styles.filterButton} data-active={filter === "pending"} aria-pressed={filter === "pending"} onClick={() => onFilterChange("pending")}>Pending at bank</button>
          <button type="button" className={styles.filterButton} data-active={filter === "transfer"} aria-pressed={filter === "transfer"} onClick={() => onFilterChange("transfer")}>Transfers</button>
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
            <strong>{model.visibleCount} transactions</strong>
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
                  <span className={styles.secondaryCell}><strong>{transaction.id}</strong><span>{transaction.ufInit ? "reviewed" : "needs review"}</span></span>
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
            title={model.sourceCount ? "No matching transactions" : "Your transaction stream starts here"}
            description={model.sourceCount ? "Try another search or return to All." : "Record a transaction or import a CSV statement from one of your accounts."}
            action={{ label: "Clear filters", onSelect: () => { onQueryChange(""); onFilterChange(""); } }}
          />
        )}
      </Panel>
    </>
  );
}
