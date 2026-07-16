"use client";

import MetricStrip from "../operational/MetricStrip";
import QuickActionBar from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import type { FinanceBillsViewModel } from "../../lib/modules/finance/bills-view-model";
import type { FinanceBillStatus, FinanceHue } from "../../lib/modules/finance/types";
import type { FinanceFilter, FinanceSort } from "../../lib/native-objects/url-state";
import {
  Chip,
  HeaderAction,
  Icon,
  IconTile,
  Panel,
  SectionBand,
  WorkspaceHeader,
  hueStyle,
  money
} from "./FinancePrimitives";
import styles from "./FinanceOperational.module.css";

const MUTATION_REASON = "This Finance dataset is a read-only fixture. Bill payments, schedule changes, autopay changes, and persistent bill records are not connected.";

export type FinanceBillsViewProps = {
  model: FinanceBillsViewModel;
  filter: FinanceFilter;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: FinanceFilter) => void;
  onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void;
  onOpenFilterPreview: () => void;
  onOpenPaymentPreview: () => void;
};

const BILL_GROUPS: readonly FinanceBillStatus[] = ["overdue", "due", "soon", "scheduled", "paid"];

const BILL_STATUS_LABELS: Readonly<Record<FinanceBillStatus, string>> = {
  overdue: "Overdue",
  due: "Due now",
  soon: "Due soon",
  scheduled: "Scheduled",
  paid: "Paid"
};

const BILL_STATUS_HUES: Readonly<Record<FinanceBillStatus, FinanceHue>> = {
  overdue: "crimson",
  due: "orange",
  soon: "yellow",
  scheduled: "blue",
  paid: "green"
};

function dueDetail(status: FinanceBillStatus, dueIn: number): string {
  if (status === "overdue") return dueIn < 0 ? `${Math.abs(dueIn)}d overdue` : "marked overdue";
  if (status === "paid") return "paid";
  if (dueIn === 0) return "due today";
  if (dueIn === 1) return "due tomorrow";
  return `due in ${dueIn}d`;
}

export default function FinanceBillsView({
  model,
  filter,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onSelect,
  onOpenFilterPreview,
  onOpenPaymentPreview
}: FinanceBillsViewProps) {
  const displayedSort = model.sort;
  const selectedBill = model.selected?.bill ?? null;

  return (
    <>
      <WorkspaceHeader
        title="Bills & Subscriptions"
        subtitle="Payment timing, recurring value, and autopay evidence kept as separate fixture facts"
        actions={(
          <>
            <HeaderAction icon="Filter" onClick={onOpenFilterPreview}>More filters</HeaderAction>
            <HeaderAction icon="Send" onClick={onOpenPaymentPreview}>Payment preview</HeaderAction>
            <HeaderAction icon="Plus" primary disabled title={MUTATION_REASON} reasonId="finance-preview-status">Add bill</HeaderAction>
          </>
        )}
      />

      <MetricStrip
        className={styles.metrics}
        ariaLabel="Bill scope metrics"
        items={[
          { id: "visible", label: "Visible", value: model.visibleCount, detail: `${model.sourceCount} fixture obligations` },
          { id: "urgent", label: "Due / overdue", value: model.counts.due + model.counts.overdue, detail: `${model.counts.overdue} overdue`, tone: model.counts.overdue ? "danger" : "default" },
          { id: "week", label: "Due this week", value: model.counts.dueThisWeek, detail: "Literal due-date window", tone: model.counts.dueThisWeek ? "attention" : "default" },
          { id: "recurring", label: "Monthly recurring", value: money(model.totals.monthlyRecurring, { cents: true }), detail: `${model.counts.recurring} recurring rows` },
          { id: "autopay", label: "Autopay", value: model.counts.autopay, detail: `${model.counts.manual} manual-payment rows` },
          { id: "value", label: "Visible nominal value", value: money(model.totals.nominalAmount, { cents: true }), detail: "Not a paid, forecast, or cashflow total" }
        ]}
      />

      <div className={styles.scopeBar}>
        <label className={styles.search}>
          <Icon name="Search" />
          <span className="sr-only">Search bills and subscriptions</span>
          <input
            aria-label="Search bills and subscriptions"
            value={model.query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search bill, account, category, cadence, status, or amount"
          />
        </label>
        <div className={styles.filterGroup} role="group" aria-label="Bill filters">
          <button type="button" className={styles.filterButton} data-active={filter === ""} aria-pressed={filter === ""} onClick={() => onFilterChange("")}>All</button>
          <button type="button" className={styles.filterButton} data-active={filter === "due-week"} aria-pressed={filter === "due-week"} onClick={() => onFilterChange("due-week")}>Due this week</button>
          <button type="button" className={styles.filterButton} data-active={filter === "recurring"} aria-pressed={filter === "recurring"} onClick={() => onFilterChange("recurring")}>Recurring</button>
          <button type="button" className={styles.filterButton} onClick={onOpenFilterPreview}>More</button>
        </div>
        <label className={styles.sortLabel}>
          Sort
          <select
            className={styles.sortSelect}
            aria-label="Sort bills"
            value={displayedSort}
            onChange={(event) => onSortChange(event.target.value as FinanceSort)}
          >
            <option value="urgency">Urgency</option>
            <option value="due-soon">Due date</option>
            <option value="amount-desc">Amount high to low</option>
            <option value="amount-asc">Amount low to high</option>
            <option value="name-asc">Name A–Z</option>
          </select>
        </label>
      </div>

      <Panel hue="orange" className={`${styles.ledger} finance-ledger-panel`}>
        <div className="finance-panel-heading">
          <h2>Payment queue <span>{model.visibleCount} shown · grouped by literal status</span></h2>
        </div>
        {BILL_GROUPS.map((status) => {
          const rows = model.rows.filter(({ bill }) => bill.status === status);
          if (!rows.length) return null;
          return (
            <div key={status}>
              <SectionBand hue={BILL_STATUS_HUES[status]} label={BILL_STATUS_LABELS[status]} count={rows.length} />
              <ul className={styles.semanticList} aria-label={`${BILL_STATUS_LABELS[status]} bills`}>
                {rows.map(({ bill, monthlyEquivalent }) => {
                  const selected = model.selectedId === bill.id;
                  return (
                    <li className={styles.semanticListItem} key={bill.id}>
                      <button
                        type="button"
                        className="finance-bill-row"
                        data-finance-bill-id={bill.id}
                        aria-pressed={selected}
                        aria-controls="finance-inspector"
                        onClick={() => onSelect(bill.id)}
                        style={{
                          ...hueStyle(bill.hue),
                          background: selected ? "var(--selected-bg)" : undefined,
                          boxShadow: selected ? "inset 3px 0 0 var(--action-primary)" : undefined
                        }}
                      >
                        <IconTile hue={bill.hue} icon={bill.icon} />
                        <span>
                          <strong>{bill.name}</strong>
                          <small>{bill.account} · {bill.category}</small>
                          <span className={styles.accountRowMeta}>
                            <Chip hue={bill.autopay ? "cyan" : "neutral"}>{bill.autopay ? "Autopay on" : "Manual payment"}</Chip>
                            <Chip hue={bill.recurring ? "violet" : "neutral"}>{bill.recurring ? `${bill.recurring} cadence` : "One-time / cadence unset"}</Chip>
                          </span>
                        </span>
                        <span>
                          <strong>{money(bill.amount, { cents: true })}</strong>
                          <small>{bill.due} · {dueDetail(bill.status, bill.dueIn)}</small>
                          {bill.recurring ? <small>{money(monthlyEquivalent, { cents: true })}/mo equivalent</small> : null}
                        </span>
                        <Chip hue={BILL_STATUS_HUES[bill.status]} solid={bill.status === "overdue"}>{BILL_STATUS_LABELS[bill.status]}</Chip>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {model.rows.length === 0 && (
          <SystemState
            variant="empty"
            className={styles.empty}
            title="No bills match this scope"
            description="Clear the search or return to All. No fixture obligation was changed."
            action={{ label: "Clear filters", onSelect: () => { onQueryChange(""); onFilterChange(""); } }}
          />
        )}
      </Panel>

      {selectedBill && (
        <QuickActionBar
          ariaLabel={`Actions for ${selectedBill.name}`}
          label={<span>Selected: <strong>{selectedBill.name}</strong></span>}
          actions={[
            { id: "finance-bill-pay", label: "Record payment", intent: "primary", disabled: true, disabledReason: MUTATION_REASON },
            { id: "finance-bill-paid", label: "Mark paid", disabled: true, disabledReason: MUTATION_REASON },
            { id: "finance-bill-schedule", label: "Edit schedule", disabled: true, disabledReason: MUTATION_REASON },
            { id: "finance-bill-autopay", label: "Change autopay", disabled: true, disabledReason: MUTATION_REASON }
          ]}
        />
      )}
    </>
  );
}
