"use client";

import { useState } from "react";
import MetricStrip from "../operational/MetricStrip";
import SystemState from "../operational/SystemState";
import type { FinanceRule, FinanceRuleHealth, FinanceRuleMode, FinanceRuleType } from "../../lib/modules/finance/types";
import type { FinanceRulesViewModel } from "../../lib/modules/finance/rules-view-model";
import type { FinanceFilter, FinanceSort } from "../../lib/native-objects/url-state";
import {
  Chip,
  HeaderAction,
  Icon,
  Panel,
  WorkspaceHeader
} from "./FinancePrimitives";
import styles from "./FinanceRules.module.css";

const RULE_MUTATION_REASON = "Use the Finance action bar to create a persistent controlled rule. High-impact outcomes still require confirmation.";
const SAVED_VIEW_REASON = "Saved-view persistence remains an open product decision. This filter state is already preserved in the URL.";

const FILTERS: ReadonlyArray<{ id: FinanceFilter; label: string }> = [
  { id: "", label: "All" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "needs-review", label: "Needs Review" },
  { id: "categorization", label: "Categorization" },
  { id: "receipts", label: "Receipts" },
  { id: "bills-subs", label: "Bills / Subs" },
  { id: "budget-rules", label: "Budgets" },
  { id: "savings-rules", label: "Savings" },
  { id: "import-rules", label: "Imports" },
  { id: "close-rules", label: "Monthly Review" },
  { id: "project-linked", label: "Project-linked" },
  { id: "disabled", label: "Disabled" }
];

const SORTS: ReadonlyArray<{ id: FinanceSort; label: string }> = [
  { id: "attention", label: "Attention first" },
  { id: "name-asc", label: "Name A–Z" },
  { id: "last-desc", label: "Most recent" },
  { id: "next-asc", label: "Next action A–Z" }
];

function ruleTypeLabel(type: FinanceRuleType): string {
  const labels: Record<FinanceRuleType, string> = {
    categorization: "Categorization",
    receipt_evidence: "Receipt evidence",
    recurrence: "Recurring",
    budget_variance: "Budget variance",
    savings: "Savings",
    import_repair: "Import repair",
    close_blocker: "Close blocker",
    project_link: "Project link"
  };
  return labels[type];
}

export function financeRuleModeLabel(mode: FinanceRuleMode): string {
  const labels: Record<FinanceRuleMode, string> = {
    auto: "Auto",
    suggest: "Suggest",
    manual_approval: "Suggest + approve",
    draft: "Draft",
    disabled: "Disabled"
  };
  return labels[mode];
}

export function financeRuleHealthLabel(health: FinanceRuleHealth): string {
  const labels: Record<FinanceRuleHealth, string> = {
    stable: "Stable",
    needs_review: "Needs review",
    broken: "Broken",
    overfiring: "Overfiring",
    draft: "Draft"
  };
  return labels[health];
}

export function financeRuleHealthHue(health: FinanceRuleHealth) {
  if (health === "stable") return "green" as const;
  if (health === "draft") return "neutral" as const;
  if (health === "needs_review") return "orange" as const;
  return "crimson" as const;
}

function lastEventLabel(value: string | null): string {
  if (!value) return "Not run";
  const [date] = value.split("T");
  return date;
}

function RuleRow({
  rule,
  selected,
  onSelect
}: {
  rule: FinanceRule;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li className={styles.semanticListItem}>
      <button
        type="button"
        className={styles.ruleRow}
        data-finance-rule-id={rule.id}
        data-selected={selected ? "true" : undefined}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className={styles.primaryCell}>
          <strong>{rule.name}</strong>
          <small>{rule.id}</small>
        </span>
        <span className={styles.secondaryCell}>
          <strong>{ruleTypeLabel(rule.type)}</strong>
          <small>{rule.description}</small>
        </span>
        <span className={styles.secondaryCell}>
          <strong>{rule.scope}</strong>
          <small>{rule.capabilities.join(" · ")}</small>
        </span>
        <span className={styles.secondaryCell}>
          <strong>{rule.trigger}</strong>
          <small>{rule.conditions.length} condition{rule.conditions.length === 1 ? "" : "s"}</small>
        </span>
        <span className={styles.secondaryCell}>
          <strong>{rule.actions[0]?.label || "No action"}</strong>
          <small>{rule.actions.length} preview action{rule.actions.length === 1 ? "" : "s"}</small>
        </span>
        <span><Chip hue={rule.requiresApproval ? "purple" : rule.mode === "auto" ? "green" : "blue"}>{financeRuleModeLabel(rule.mode)}</Chip></span>
        <span className={styles.linkedCount}>{rule.linkedObjects.length}</span>
        <span><Chip hue={financeRuleHealthHue(rule.health)} dot>{financeRuleHealthLabel(rule.health)}</Chip></span>
        <span className={styles.mono}>{lastEventLabel(rule.lastEventAt)}</span>
        <span className={styles.secondaryCell}>
          <strong>{rule.nextAction}</strong>
          <small>{rule.generatedCloseBlockers ? `${rule.generatedCloseBlockers} close suggestion${rule.generatedCloseBlockers === 1 ? "" : "s"}` : "No close suggestion"}</small>
        </span>
      </button>
    </li>
  );
}

export default function FinanceRulesRouteView({
  model,
  filter,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onSelect,
  onRunVisibleTests,
  onNotice
}: {
  model: FinanceRulesViewModel;
  filter: FinanceFilter;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: FinanceFilter) => void;
  onSortChange: (value: FinanceSort) => void;
  onSelect: (id: string) => void;
  onRunVisibleTests: () => void;
  onNotice: (message: string) => void;
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const counts = model.counts;
  const metrics = [
    { id: "active", label: "Active", value: counts.active, detail: `${counts.stable} stable · ${counts.watch} watch`, tone: "positive" as const },
    { id: "draft", label: "Draft", value: counts.draft, detail: "approval needed" },
    { id: "review", label: "Review", value: counts.needsReview, detail: "overfire / repair", tone: "attention" as const },
    { id: "category", label: "Cat rules", value: counts.categorization, detail: "merchant context" },
    { id: "receipts", label: "Receipts", value: counts.receipts, detail: "evidence requests" },
    { id: "recurring", label: "Recurring", value: counts.recurring, detail: "bills / subs detect" },
    { id: "budget", label: "Budget", value: counts.budget, detail: "variance flags" },
    { id: "savings", label: "Savings", value: counts.savings, detail: "confirm only" },
    { id: "imports", label: "Imports", value: counts.imports, detail: "mapping repair" },
    { id: "close", label: "Close", value: counts.closeBlockersGenerated, detail: "controlled suggestions" }
  ];

  return (
    <>
      <WorkspaceHeader
        title="Rules / Automation"
        subtitle="Categorization, evidence, recurrence, import repair, and close-blocker rules."
        actions={(
          <>
            <HeaderAction icon="Filter" onClick={() => setFiltersExpanded((current) => !current)}>
              {filtersExpanded ? "Hide filters" : "Filter"}
            </HeaderAction>
            <HeaderAction
              icon="Sliders"
              disabled
              title="Rule grouping is not persisted. Use filters and attention sorting in this checkpoint."
            >
              Group
            </HeaderAction>
            <HeaderAction icon="Check" primary onClick={onRunVisibleTests}>Test rules</HeaderAction>
            <HeaderAction icon="Plus" disabled title={RULE_MUTATION_REASON}>New rule</HeaderAction>
          </>
        )}
      />

      <MetricStrip className={styles.metrics} ariaLabel="Finance rule metrics" items={metrics} />

      <section className={styles.scopeBar} aria-label="Rule search and filters">
        <label className={styles.search}>
          <Icon name="Search" />
          <span className="sr-only">Search rules</span>
          <input
            type="search"
            value={model.query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search rules, trigger, action, linked object, blocker, or source module..."
          />
        </label>
        <button
          type="button"
          className={styles.unavailableButton}
          aria-disabled="true"
          title={SAVED_VIEW_REASON}
          onClick={(event) => event.preventDefault()}
        >
          Save view
          <span className="sr-only">{SAVED_VIEW_REASON}</span>
        </button>
        <button type="button" className={styles.auditButton} onClick={onRunVisibleTests}>Run safe audit</button>
        <label className={styles.sortLabel}>
          Sort
          <select value={model.sort} onChange={(event) => onSortChange(event.target.value as FinanceSort)}>
            {SORTS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
          </select>
        </label>
        {filtersExpanded ? (
          <div className={styles.filterGroup} role="group" aria-label="Rule filters">
            {FILTERS.map((item) => (
              <button
                type="button"
                key={item.id || "all"}
                className={styles.filterButton}
                data-active={filter === item.id ? "true" : undefined}
                aria-pressed={filter === item.id}
                onClick={() => onFilterChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <Panel className={styles.ledger}>
        <div className={styles.ledgerToolbar}>
          <div>
            <strong>Rules ledger</strong>
            <span>auditable automation preview</span>
          </div>
          <div>
            <code>{model.visibleCount} / {model.sourceCount} rules</code>
            <span>{counts.active} active</span>
            <span>{counts.draft} draft</span>
            <span>{counts.highImpactApproval} high-impact approval</span>
            <span>Suggest first · audit every run</span>
          </div>
        </div>
        {model.rows.length ? (
          <>
            <div className={styles.columnHeader} aria-hidden="true">
              <span>Rule</span>
              <span>Rule type</span>
              <span>Scope</span>
              <span>Trigger</span>
              <span>Action</span>
              <span>Mode</span>
              <span>Linked</span>
              <span>Health</span>
              <span>Last</span>
              <span>Next</span>
            </div>
            <ul className={styles.semanticList} aria-label="Rules ledger">
              {model.rows.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  selected={model.selectedId === rule.id}
                  onSelect={() => onSelect(rule.id)}
                />
              ))}
            </ul>
          </>
        ) : (
          <SystemState
            className={styles.empty}
            variant="empty"
            title="No rules match this scope"
            description="Clear the query or choose All to return to all current Finance rules."
            action={{
              label: "Clear scope",
              onSelect: () => {
                onQueryChange("");
                onFilterChange("");
                onNotice("Rules scope reset to all current rules.");
              }
            }}
          />
        )}
      </Panel>
    </>
  );
}

export { RULE_MUTATION_REASON };
