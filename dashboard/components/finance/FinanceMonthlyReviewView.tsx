"use client";

import MetricStrip from "../operational/MetricStrip";
import QuickActionBar from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import type { FinanceMonthlyReviewViewModel } from "../../lib/modules/finance/monthly-review-view-model";
import type { FinanceFilter, FinanceSort } from "../../lib/native-objects/url-state";
import {
  Chip,
  HeaderAction,
  Icon,
  IconTile,
  Panel,
  WorkspaceHeader,
  hueStyle,
  money
} from "./FinancePrimitives";
import styles from "./FinanceOperational.module.css";

const WRITE_REASON = "This Finance Monthly Review is a read-only fixture. Checklist writes, evidence links, durable Decisions, carry-forward, and close audit are not connected.";

export type FinanceMonthlyReviewViewProps = {
  model: FinanceMonthlyReviewViewModel;
  filter: FinanceFilter;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: FinanceFilter) => void;
  onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void;
  onOpenFilterPreview: () => void;
  onOpenReviews: () => void;
  onPreviewReminder: (id: string) => void;
};

export default function FinanceMonthlyReviewView({
  model,
  filter,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onSelect,
  onOpenFilterPreview,
  onOpenReviews,
  onPreviewReminder
}: FinanceMonthlyReviewViewProps) {
  const displayedSort = model.sort;
  const overallOpen = model.overallLiteralBlockers.length;
  const overallComplete = model.sourceCount - overallOpen;
  const selectedItem = model.selected?.item ?? null;
  const closeReason = overallOpen > 0
    ? `Complete Close is unavailable: ${overallOpen} literal checklist item${overallOpen === 1 ? " remains" : "s remain"} open, and close persistence and reopen policy are not connected.`
    : "Complete Close is unavailable because close persistence, audit, and reopen policy are not connected.";

  return (
    <>
      <WorkspaceHeader
        title="Monthly Review"
        subtitle="Finance owns the monthly close; Reviews coordinates through linked references"
        actions={(
          <>
            <HeaderAction icon="Link" onClick={onOpenReviews}>Open Reviews</HeaderAction>
            <HeaderAction icon="Filter" onClick={onOpenFilterPreview}>More filters</HeaderAction>
            <HeaderAction icon="Check" primary disabled title={closeReason}>Complete Close</HeaderAction>
          </>
        )}
      />

      <MetricStrip
        className={styles.metrics}
        ariaLabel="Monthly close literal metrics"
        items={[
          { id: "complete", label: "Complete", value: overallComplete, detail: `${model.sourceCount} literal checklist items`, tone: "positive" },
          { id: "open", label: "Open", value: overallOpen, detail: "Each open item blocks fixture close", tone: overallOpen ? "attention" : "default" },
          { id: "visible", label: "Visible", value: model.visibleCount, detail: `${model.visibleCompletion.complete} complete · ${model.visibleCompletion.open} open in current scope` },
          { id: "actual-savings", label: "Actual snapshot movement", value: money(model.savings.actualSnapshotMovement.amount, { sign: true, cents: true }), detail: "Fixture snapshot; transfer proof not connected", tone: "positive" },
          { id: "proposal", label: "Savings proposals", value: model.savings.proposalReminders.rows.length, detail: "Reminder candidates; not persisted movement" },
          { id: "readiness", label: "Readiness score", value: "Not calculated", detail: "No approved weighted formula" }
        ]}
      />

      <div className={styles.scopeBar}>
        <label className={styles.search}>
          <Icon name="Search" />
          <span className="sr-only">Search close checklist</span>
          <input
            aria-label="Search close checklist"
            value={model.query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search close checklist labels or fixture IDs"
          />
        </label>
        <div className={styles.filterGroup} role="group" aria-label="Monthly review filters">
          <button type="button" className={styles.filterButton} data-active={filter === ""} aria-pressed={filter === ""} onClick={() => onFilterChange("")}>All</button>
          <button type="button" className={styles.filterButton} data-active={filter === "incomplete"} aria-pressed={filter === "incomplete"} onClick={() => onFilterChange("incomplete")}>Open</button>
          <button type="button" className={styles.filterButton} onClick={onOpenFilterPreview}>More</button>
        </div>
        <label className={styles.sortLabel}>
          Sort
          <select
            className={styles.sortSelect}
            aria-label="Sort monthly close checklist"
            value={displayedSort}
            onChange={(event) => onSortChange(event.target.value as FinanceSort)}
          >
            <option value="open-first">Open first</option>
            <option value="source-order">Fixture order</option>
            <option value="label-asc">Label A–Z</option>
          </select>
        </label>
      </div>

      <div className="finance-two-col">
        <Panel hue="violet" className="finance-span-2">
          <div className="finance-panel-heading">
            <h2>Close checklist <span>{overallComplete} complete · {overallOpen} open</span></h2>
          </div>
          <ul className={`finance-checklist ${styles.semanticList} ${styles.reviewChecklist}`} aria-label="Finance close checklist">
            {model.rows.map(({ item, isComplete, isLiteralBlocker }) => {
              const selected = model.selectedId === item.id;
              return (
                <li className={styles.semanticListItem} key={item.id}>
                  <button
                    type="button"
                    className={isComplete ? "is-done" : ""}
                    data-finance-review-item-id={item.id}
                    aria-pressed={selected}
                    aria-controls="finance-inspector"
                    aria-label={`Inspect ${item.label}. Status: ${isComplete ? "complete" : "open"}.`}
                    onClick={() => onSelect(item.id)}
                    style={{
                      ...hueStyle(item.hue),
                      background: selected ? "var(--selected-bg)" : undefined,
                      boxShadow: selected ? "inset 3px 0 0 var(--action-primary)" : undefined
                    }}
                  >
                    <span className="finance-checkbox" aria-hidden="true">{isComplete ? <Icon name="Check" /> : null}</span>
                    <strong>{item.label}</strong>
                    <Chip hue={isLiteralBlocker ? "orange" : "green"}>{isLiteralBlocker ? "Open" : "Complete"}</Chip>
                  </button>
                </li>
              );
            })}
          </ul>
          {model.rows.length === 0 && (
            <SystemState
              variant="empty"
              className={styles.empty}
              title="No checklist items match this scope"
              description="Clear the search or return to All. No close state was changed."
              action={{ label: "Clear filters", onSelect: () => { onQueryChange(""); onFilterChange(""); } }}
            />
          )}
        </Panel>

        <div className="finance-side-stack">
          <Panel hue="teal">
            <div className="finance-panel-heading"><h2>Savings evidence <span>movement versus proposal</span></h2></div>
            <div className={styles.compactList}>
              <div className={styles.compactRow}>
                <span>
                  <strong>Actual snapshot movement</strong>
                  <small>Fixture month-saved value; source and destination proof are not connected</small>
                </span>
                <span className={`${styles.evidenceValue} ${styles.positive}`}>{money(model.savings.actualSnapshotMovement.amount, { sign: true, cents: true })}</span>
              </div>
            </div>
          </Panel>

          <Panel hue="yellow">
            <div className="finance-panel-heading">
              <h2>Proposal reminders <span>{model.savings.proposalReminders.rows.length} candidate{model.savings.proposalReminders.rows.length === 1 ? "" : "s"}</span></h2>
            </div>
            <ul className={`finance-decision-list ${styles.semanticList}`} aria-label="Savings proposal reminders">
              {model.savings.proposalReminders.rows.map((reminder) => (
                <li className={styles.semanticListItem} key={reminder.id}>
                  <button type="button" onClick={() => onPreviewReminder(reminder.id)}>
                    <IconTile hue={reminder.hue} icon="Trending" small />
                    <span>
                      <strong>{reminder.text}</strong>
                      <small>Due {reminder.due} · proposal only · not recorded as movement</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {model.savings.proposalReminders.rows.length === 0 ? (
              <SystemState variant="empty" compact title="No savings proposal reminders in this fixture" />
            ) : null}
          </Panel>

          <Panel hue="orange">
            <div className="finance-panel-heading"><h2>Close boundary</h2></div>
            <div className={styles.compactList}>
              <div className={styles.compactRow}>
                <span><strong>Literal blockers</strong><small>Incomplete fixture checklist items; no weighted readiness formula</small></span>
                <span className={styles.evidenceValue}>{overallOpen}</span>
              </div>
              <div className={styles.compactRow}>
                <span><strong>Close persistence</strong><small>Completion, audit, carry-forward, and reopen behavior remain unresolved</small></span>
                <Chip hue="brown">Not connected</Chip>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {selectedItem && (
        <QuickActionBar
          ariaLabel={`Actions for ${selectedItem.label}`}
          label={<span>Selected: <strong>{selectedItem.label}</strong></span>}
          actions={[
            { id: "finance-close-item-status", label: selectedItem.done ? "Reopen item" : "Mark complete", intent: "primary", disabled: true, disabledReason: WRITE_REASON },
            { id: "finance-close-evidence", label: "Attach evidence", disabled: true, disabledReason: WRITE_REASON },
            { id: "finance-close-decision", label: "File Decision", disabled: true, disabledReason: "Durable Decisions belong to Personal Ops, and the cross-module write path is not connected." },
            { id: "finance-close-complete", label: "Complete Close", disabled: true, disabledReason: closeReason }
          ]}
        />
      )}
    </>
  );
}
