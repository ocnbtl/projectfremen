"use client";

import MetricStrip from "../operational/MetricStrip";
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

  return (
    <>

      <MetricStrip
        className={styles.metrics}
        ariaLabel="Bill scope metrics"
        items={[
          { id: "urgent", label: "Due / overdue", value: model.counts.due + model.counts.overdue, detail: `${model.counts.overdue} overdue`, tone: model.counts.overdue ? "danger" : "default" },
          { id: "week", label: "Due this week", value: model.counts.dueThisWeek, detail: "Next seven days", tone: model.counts.dueThisWeek ? "attention" : "default" },
          { id: "recurring", label: "Monthly recurring", value: money(model.totals.monthlyRecurring), detail: `${model.counts.recurring} recurring bills` },
        ]}
      />

      <div className={styles.scopeBar}>
        <div className={styles.filterGroup} role="group" aria-label="Bill filters">
          <button type="button" className={styles.filterButton} data-active={filter === ""} aria-pressed={filter === ""} onClick={() => onFilterChange("")}>All</button>
          <button type="button" className={styles.filterButton} data-active={filter === "due-week"} aria-pressed={filter === "due-week"} onClick={() => onFilterChange("due-week")}>Due this week</button>
          <button type="button" className={styles.filterButton} data-active={filter === "recurring"} aria-pressed={filter === "recurring"} onClick={() => onFilterChange("recurring")}>Recurring</button>
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
          <h2>{filter === "recurring" ? "Recurring commitments" : filter === "due-week" ? "Expected this week" : "Payment calendar"} <span>{model.visibleCount} shown · grouped by status</span></h2>
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
                            <Chip hue={bill.autopay ? "cyan" : "neutral"}>{bill.evidence && !bill.autopayConfirmed ? "Autopay unconfirmed" : bill.autopay ? "Autopay on" : "Manual payment"}</Chip>
                            <Chip hue={bill.recurring ? "violet" : "neutral"}>{bill.recurring ? `${bill.recurring} cadence` : "One-time"}</Chip>
                          </span>
                        </span>
                        <span>
                          <strong>{money(bill.amount, { cents: true })}</strong>
                          <small>{bill.evidence ? `Expected ${bill.due} · estimated` : `${bill.due} · ${dueDetail(bill.status, bill.dueIn)}`}</small>
                          {bill.recurring ? <small>{money(monthlyEquivalent, { cents: true })}/mo equivalent</small> : null}
                        </span>
                        <Chip hue={BILL_STATUS_HUES[bill.status]} solid={bill.status === "overdue"}>{bill.evidence ? "Estimated" : BILL_STATUS_LABELS[bill.status]}</Chip>
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
            title={filter === "due-week" ? "No bills due this week" : filter === "recurring" ? "No recurring bills in this view" : model.sourceCount ? "No matching bills" : "Keep your bills in view"}
            description={model.sourceCount ? "Try another search or return to All." : "Add your bills and subscriptions to track due dates, amounts and payment records."}
            action={{ label: "Clear filters", onSelect: () => { onQueryChange(""); onFilterChange(""); } }}
          />
        )}
      </Panel>

    </>
  );
}
