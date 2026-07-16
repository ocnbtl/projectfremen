"use client";

import MetricStrip from "../operational/MetricStrip";
import SystemState from "../operational/SystemState";
import type { FinanceSort } from "../../lib/native-objects/url-state";
import type { FinanceAccountsViewModel } from "../../lib/modules/finance/accounts-view-model";
import type { FinanceCashflowSeries } from "../../lib/modules/finance/types";
import {
  CashflowChart,
  Chip,
  HeaderAction,
  Icon,
  IconTile,
  Panel,
  SectionBand,
  Sparkline,
  WorkspaceHeader,
  accountIcon,
  money
} from "./FinancePrimitives";
import styles from "./FinanceOperational.module.css";

const PREVIEW_REASON = "This Finance dataset is a read-only fixture. Account linking, transfers, reconciliation, imports, and rules are not connected.";

export type FinanceAccountsViewProps = {
  model: FinanceAccountsViewModel;
  cashflow: FinanceCashflowSeries;
  cashflowSummary: string;
  actualSavingsMovement: number;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void;
  onOpenFilterPreview: () => void;
  onOpenGroupingPreview: () => void;
};

const groupLabels = {
  "cash-and-deposits": { label: "Cash & deposits", hue: "blue" as const },
  "credit-and-liabilities": { label: "Credit & liabilities", hue: "crimson" as const },
  "investments-and-business": { label: "Investments & business", hue: "violet" as const }
};

export default function FinanceAccountsView({
  model,
  cashflow,
  cashflowSummary,
  actualSavingsMovement,
  onQueryChange,
  onSortChange,
  onSelect,
  onOpenFilterPreview,
  onOpenGroupingPreview
}: FinanceAccountsViewProps) {
  const displayedSort = model.sort;
  const reconciliationRows = model.rows.filter((row) =>
    row.fixtureActivity.transactions.some((transaction) => transaction.status === "pending" || !transaction.receipt.trim())
  );

  return (
    <>
      <WorkspaceHeader
        title="Accounts & Cashflow"
        subtitle="Balances, movement, transfers, and fixture-scoped reconciliation evidence"
        actions={(
          <>
            <HeaderAction icon="Filter" onClick={onOpenFilterPreview}>Filter</HeaderAction>
            <HeaderAction icon="Sliders" onClick={onOpenGroupingPreview}>Group</HeaderAction>
            <HeaderAction icon="Check" disabled title={PREVIEW_REASON} reasonId="finance-preview-status">Reconcile</HeaderAction>
            <HeaderAction icon="Send" disabled title={PREVIEW_REASON} reasonId="finance-preview-status">Transfer</HeaderAction>
            <HeaderAction icon="Plus" primary disabled title={PREVIEW_REASON} reasonId="finance-preview-status">Link Account</HeaderAction>
          </>
        )}
      />

      <MetricStrip
        className={styles.metrics}
        ariaLabel="Account scope metrics"
        items={[
          { id: "liquid", label: "Liquid", value: money(model.totals.liquid, { cents: true }), detail: `${model.visibleCount} visible accounts`, tone: "positive" },
          { id: "debt", label: "Debt", value: money(model.totals.liabilities, { cents: true }), detail: "Signed fixture liability", tone: model.totals.debtOwed ? "danger" : "default" },
          { id: "net", label: "Net worth", value: money(model.totals.net, { cents: true }), detail: "Fixture balances only" },
          { id: "savings", label: "Savings moved", value: money(actualSavingsMovement, { sign: true, cents: true }), detail: "Snapshot movement · evidence unconnected", tone: "positive" },
          { id: "review", label: "Accounts needing review", value: reconciliationRows.length, detail: "Contain pending or missing-receipt activity", tone: reconciliationRows.length ? "attention" : "default" },
          { id: "imports", label: "Import health", value: "—", detail: "No documented formula or import repository" }
        ]}
      />

      <div className={styles.scopeBar}>
        <label className={styles.search}>
          <Icon name="Search" />
          <span className="sr-only">Search accounts</span>
          <input
            aria-label="Search accounts"
            value={model.query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search account, institution, type, or mask"
          />
        </label>
        <div className={styles.filterGroup} role="group" aria-label="Account view controls">
          <button type="button" className={styles.filterButton} data-active="true" aria-pressed={true} onClick={onOpenGroupingPreview}>Grouped by role</button>
          <button type="button" className={styles.filterButton} onClick={onOpenFilterPreview}>More filters</button>
        </div>
        <label className={styles.sortLabel}>
          Sort
          <select
            className={styles.sortSelect}
            aria-label="Sort accounts"
            value={displayedSort}
            onChange={(event) => onSortChange(event.target.value === "role" ? "default" : event.target.value as FinanceSort)}
          >
            <option value="role">Role</option>
            <option value="name-asc">Name A–Z</option>
            <option value="balance-desc">Balance high to low</option>
            <option value="balance-asc">Balance low to high</option>
            <option value="change-desc">30-day change</option>
          </select>
        </label>
      </div>

      <div className={styles.accountLayout}>
        <Panel hue="teal">
          <div className="finance-panel-heading">
            <h2>Cashflow <span>6 mo · fixture series</span></h2>
            <div><Chip hue="teal" dot>in</Chip><Chip hue="orange" dot>out</Chip><Chip hue="indigo" dot>savings</Chip></div>
          </div>
          <CashflowChart cashflow={cashflow} summary={cashflowSummary} ariaLabel="Cashflow over six months" />
        </Panel>

        <div className={styles.stack}>
          <Panel hue="orange">
            <div className="finance-panel-heading"><h2>Reconcile scope <span>before close</span></h2></div>
            {reconciliationRows.length ? (
              <ul className={`${styles.evidenceList} ${styles.semanticList}`} aria-label="Accounts needing reconciliation review">
                {reconciliationRows.map((row) => {
                  const issues = row.fixtureActivity.transactions.filter((transaction) => transaction.status === "pending" || !transaction.receipt.trim());
                  return (
                    <li className={styles.semanticListItem} key={row.account.id}>
                      <button type="button" className={styles.evidenceRow} onClick={() => onSelect(row.account.id)}>
                        <span><strong>{row.account.name}</strong><small>{issues.length} literal pending/evidence issue{issues.length === 1 ? "" : "s"}</small></span>
                        <span className={styles.evidenceValue}>{money(issues.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0), { cents: true })}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <SystemState variant="empty" compact title="No literal issues in this scope" />}
          </Panel>

          <Panel hue="violet">
            <div className="finance-panel-heading"><h2>Transfers & savings <span>evidence boundary</span></h2></div>
            <div className={styles.compactList}>
              <div className={styles.compactRow}>
                <span><strong>Actual fixture savings movement</strong><small>Snapshot value; source/destination proof is not connected</small></span>
                <span className={`${styles.evidenceValue} ${styles.positive}`}>{money(actualSavingsMovement, { sign: true, cents: true })}</span>
              </div>
              <div className={styles.compactRow}>
                <span><strong>Transfer records</strong><small>Internal transfer rows remain separate from income and spending</small></span>
                <span className={styles.evidenceValue}>0 classified</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel hue="blue" className={`${styles.accountInventory} finance-ledger-panel`}>
        <div className="finance-panel-heading"><h2>Accounts <span>{model.visibleCount} of {model.sourceCount}</span></h2></div>
        {Object.entries(groupLabels).map(([groupId, group]) => {
          const rows = model.rows.filter((row) => row.group === groupId);
          if (!rows.length) return null;
          return (
            <div key={groupId}>
              <SectionBand hue={group.hue} label={group.label} count={rows.length} />
              <ul className={`finance-account-list ${styles.semanticList}`} aria-label={group.label}>
                {rows.map(({ account, fixtureActivity }) => {
                  const selected = model.selectedId === account.id;
                  return (
                    <li className={styles.semanticListItem} key={account.id}>
                      <button
                        type="button"
                        className={`finance-account-row ${selected ? "is-selected" : ""}`}
                        data-finance-account-id={account.id}
                        aria-pressed={selected}
                        aria-controls="finance-inspector"
                        onClick={() => onSelect(account.id)}
                      >
                        <IconTile hue={account.hue} icon={accountIcon(account.kind)} />
                        <span className="finance-row-identity">
                          <strong>{account.name} <Chip hue={account.hue}>{account.kind}</Chip></strong>
                          <small>{account.inst} · {account.mask}</small>
                          <span className={styles.accountRowMeta}>{fixtureActivity.transactions.length} matching transactions · {fixtureActivity.bills.length} matching bills · fixture name match</span>
                        </span>
                        <Sparkline values={account.spark} hue={account.balance < 0 ? "crimson" : account.hue} />
                        <span className={`finance-row-money ${account.balance < 0 ? "is-negative" : ""}`}>
                          <strong>{money(account.balance, { cents: true })}</strong>
                          <small>{account.delta30 >= 0 ? "+" : ""}{account.delta30}% · 30d</small>
                        </span>
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
            title="No accounts match this search"
            description="Clear the query to return to the complete fixture inventory."
            action={{ label: "Clear search", onSelect: () => onQueryChange("") }}
          />
        )}
      </Panel>
    </>
  );
}
