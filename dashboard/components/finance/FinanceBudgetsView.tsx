"use client";

import MetricStrip from "../operational/MetricStrip";
import QuickActionBar from "../operational/QuickActionBar";
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

const MUTATION_REASON = "This Finance dataset is a read-only fixture. Budget caps, allocations, period resets, and persistent categories are not connected.";
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
  const selectedBudget = model.selected?.budget ?? null;

  return (
    <>
      <WorkspaceHeader
        title="Budgets"
        subtitle="Literal caps, spend, and remaining amounts; forecasting stays unavailable until its formula is approved"
        actions={(
          <>
            <HeaderAction icon="Calendar" onClick={onOpenPeriodPreview}>Period preview</HeaderAction>
            <HeaderAction icon="Filter" onClick={onOpenFilterPreview}>More filters</HeaderAction>
            <HeaderAction icon="Plus" primary disabled title={MUTATION_REASON} reasonId="finance-preview-status">New category</HeaderAction>
          </>
        )}
      />

      <MetricStrip
        className={styles.metrics}
        ariaLabel="Budget scope metrics"
        items={[
          { id: "visible", label: "Visible", value: model.visibleCount, detail: `${model.sourceCount} fixture categories` },
          { id: "spent", label: "Spent", value: money(model.totals.spent, { cents: true }), detail: "Visible fixture spend" },
          { id: "cap", label: "Cap", value: money(model.totals.limit, { cents: true }), detail: "Visible literal caps" },
          { id: "remaining", label: "Remaining", value: money(model.totals.remaining, { cents: true }), detail: `${percent(model.totals.usedPercent)} used`, tone: model.totals.remaining < 0 ? "danger" : "positive" },
          { id: "over", label: "Over cap", value: model.counts.overBudget, detail: `${model.counts.atOrUnderBudget} at or under`, tone: model.counts.overBudget ? "danger" : "default" },
          { id: "forecast", label: "Forecast", value: "Unavailable", detail: "No approved formula or connected source" }
        ]}
      />

      <div className={styles.scopeBar}>
        <label className={styles.search}>
          <Icon name="Search" />
          <span className="sr-only">Search budgets</span>
          <input
            aria-label="Search budgets"
            value={model.query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search category, cap, spend, or remaining amount"
          />
        </label>
        <div className={styles.filterGroup} role="group" aria-label="Budget filters">
          <button type="button" className={styles.filterButton} data-active={filter === ""} aria-pressed={filter === ""} onClick={() => onFilterChange("")}>All</button>
          <button type="button" className={styles.filterButton} data-active={filter === "over-budget"} aria-pressed={filter === "over-budget"} onClick={() => onFilterChange("over-budget")}>Over cap</button>
          <button type="button" className={styles.filterButton} onClick={onOpenFilterPreview}>More</button>
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

      <Panel hue="teal" className={styles.accountInventory}>
        <div className="finance-budget-summary">
          <div>
            <span>Visible spend / cap</span>
            <strong>{money(model.totals.spent, { cents: true })} <em>/ {money(model.totals.limit, { cents: true })}</em></strong>
          </div>
          <Chip hue={model.totals.remaining < 0 ? "crimson" : "green"}>{percent(model.totals.usedPercent)} literal use</Chip>
        </div>
        <div className={styles.compactList}>
          <div className={styles.compactRow}>
            <span><strong>Remaining</strong><small>Cap minus spend across the visible scope</small></span>
            <span className={`${styles.evidenceValue} ${model.totals.remaining >= 0 ? styles.positive : ""}`}>{money(model.totals.remaining, { cents: true })}</span>
          </div>
          <div className={styles.compactRow}>
            <span><strong>Forecast</strong><small>No approved formula or durable forecast source</small></span>
            <span className={styles.evidenceValue}>Unavailable</span>
          </div>
        </div>
      </Panel>

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
                  <small>{money(budget.spent, { cents: true })} spent · {money(budget.limit, { cents: true })} cap</small>
                  <small>{money(remaining, { cents: true })} remaining · forecast {forecast === null ? "unavailable" : forecast}</small>
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
          title="No budgets match this scope"
          description="Clear the search or return to All. No cap or spend value was changed."
          action={{ label: "Clear filters", onSelect: () => { onQueryChange(""); onFilterChange(""); } }}
        />
      )}

      {selectedBudget && (
        <QuickActionBar
          ariaLabel={`Actions for ${selectedBudget.category}`}
          label={<span>Selected: <strong>{selectedBudget.category}</strong></span>}
          actions={[
            { id: "finance-budget-cap", label: "Edit cap", intent: "primary", disabled: true, disabledReason: MUTATION_REASON },
            { id: "finance-budget-allocate", label: "Allocate", disabled: true, disabledReason: MUTATION_REASON },
            { id: "finance-budget-reset", label: "Reset period", disabled: true, disabledReason: MUTATION_REASON },
            { id: "finance-budget-forecast", label: "Run forecast", disabled: true, disabledReason: FORECAST_REASON }
          ]}
        />
      )}
    </>
  );
}
