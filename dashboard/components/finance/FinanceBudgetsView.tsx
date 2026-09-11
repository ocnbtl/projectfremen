"use client";

import MetricStrip from "../operational/MetricStrip";
import SystemState from "../operational/SystemState";
import type { FinanceBudgetsViewModel } from "../../lib/modules/finance/budgets-view-model";
import type { FinanceFilter, FinanceSort } from "../../lib/native-objects/url-state";
import {
  Chip,
  HeaderAction,
  Icon,
  IconTile,
  Meter,
  Panel,
  WorkspaceHeader,
  hueStyle,
  money
} from "./FinancePrimitives";
import styles from "./FinanceOperational.module.css";

const FORECAST_REASON = "Forecasting is unavailable because no approved Finance forecast formula or durable forecast source is connected.";

export type FinanceBudgetsViewProps = {
  model: FinanceBudgetsViewModel;
  filter: FinanceFilter;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: FinanceFilter) => void;
  onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void;
  onOpenFilterPreview: () => void;
  onOpenPeriodPreview: () => void;
};

const PERCENT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

function percent(value: number | null): string {
  return value === null ? "Unavailable" : `${PERCENT.format(value)}%`;
}

export default function FinanceBudgetsView({
  model,
  filter,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onSelect,
  onOpenFilterPreview,
  onOpenPeriodPreview
}: FinanceBudgetsViewProps) {
  const displayedSort = model.sort;

  return (
    <>

      {model.rows.some(r => r.budget.evidence) && <p className="finance-view-explainer">{model.rows[0]?.budget.period} · Starter limits based on recorded history. Spending includes pending payments; transfers are excluded. Open a category to see its basis and adjust the limit.</p>}
      <MetricStrip
        className={styles.metrics}
        ariaLabel="Budget scope metrics"
        items={[
          { id: "spent", label: "Spent", value: money(model.totals.spent), detail: "Recorded expenses" },
          { id: "cap", label: "Planned", value: money(model.totals.limit), detail: "Monthly category limits" },
          { id: "remaining", label: "Remaining", value: money(model.totals.remaining), detail: `${percent(model.totals.usedPercent)} used`, tone: model.totals.remaining < 0 ? "danger" : "positive" },
        ]}
      />

      <div className={styles.scopeBar}>
        <div className={styles.filterGroup} role="group" aria-label="Budget filters">
          <button type="button" className={styles.filterButton} data-active={filter === ""} aria-pressed={filter === ""} onClick={() => onFilterChange("")}>All</button>
          <button type="button" className={styles.filterButton} data-active={filter === "over-budget"} aria-pressed={filter === "over-budget"} onClick={() => onFilterChange("over-budget")}>Over budget</button>
        </div>
        <label className={styles.sortLabel}>
          Sort
          <select
            className={styles.sortSelect}
            aria-label="Sort budgets"
            value={displayedSort}
            onChange={(event) => onSortChange(event.target.value as FinanceSort)}
          >
            <option value="attention">Highest utilization</option>
            <option value="spent-desc">Spend high to low</option>
            <option value="limit-desc">Cap high to low</option>
            <option value="remaining-asc">Remaining low to high</option>
            <option value="category-asc">Category A–Z</option>
          </select>
        </label>
      </div>

      <ul className={`finance-budget-grid ${styles.semanticList}`} aria-label="Budget categories">
        {model.rows.map(({ budget, remaining, usedPercent, forecast }) => {
          const over = remaining < 0;
          const selected = model.selectedId === budget.id;
          return (
            <li className={`${styles.semanticListItem} ${styles.semanticCardItem}`} key={budget.id}>
              <button
                type="button"
                className="finance-budget-card"
                data-finance-budget-id={budget.id}
                aria-pressed={selected}
                aria-controls="finance-inspector"
                onClick={() => onSelect(budget.id)}
                style={{
                  ...hueStyle(over ? "crimson" : budget.hue),
                  background: selected ? "var(--selected-bg)" : undefined,
                  boxShadow: selected ? "inset 3px 0 0 var(--action-primary)" : undefined
                }}
              >
                <IconTile hue={budget.hue} icon={budget.icon} />
                <span>
                  <strong>{budget.category} {over ? <Chip hue="crimson">Over cap</Chip> : null}</strong>
                  <small>{money(budget.spent, { cents: true })} spent · {money(budget.limit, { cents: true })} monthly limit</small>
                  <small>{money(Math.abs(remaining), { cents: true })} {over ? "over budget" : "remaining"}</small>
                </span>
                <strong className={over ? "is-negative" : ""}>{percent(usedPercent)}</strong>
                <Meter value={usedPercent ?? 0} hue={budget.hue} over={over} />
              </button>
            </li>
          );
        })}
      </ul>

      {model.rows.length === 0 && (
        <SystemState
          variant="empty"
          className={styles.empty}
          title={model.sourceCount ? "No matching budgets" : "Make a plan for this month"}
          description={model.sourceCount ? "Try another category or return to All." : "Create a category budget to compare your spending with a monthly limit."}
          action={{ label: "Clear filters", onSelect: () => { onQueryChange(""); onFilterChange(""); } }}
        />
      )}

    </>
  );
}
