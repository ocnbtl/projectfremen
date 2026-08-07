"use client";

import InspectorRail from "../admin-shell/InspectorRail";
import DetailTabs, { DetailTabPanel, type DetailTab } from "../operational/DetailTabs";
import LinkedDecisionsPanel from "../operational/LinkedDecisionsPanel";
import ObjectHeader from "../operational/ObjectHeader";
import SystemState from "../operational/SystemState";
import {
  buildDecisionCreationRoute,
  type DecisionSourceRef
} from "../../lib/modules/personal-ops/decision-links";
import type { PersonalOpsDecision } from "../../lib/modules/personal-ops/types";
import type { FinanceAccountsViewModel } from "../../lib/modules/finance/accounts-view-model";
import type { FinanceBillsViewModel } from "../../lib/modules/finance/bills-view-model";
import type { FinanceBudgetsViewModel } from "../../lib/modules/finance/budgets-view-model";
import type { FinanceMonthlyReviewViewModel } from "../../lib/modules/finance/monthly-review-view-model";
import type { FinanceTransactionsViewModel } from "../../lib/modules/finance/transactions-view-model";
import type { FinanceAuditEvent, FinanceState } from "../../lib/modules/finance/native-types";
import type { FinanceLinkedContext, FinanceTransaction } from "../../lib/modules/finance/types";
import type { FinanceTab } from "../../lib/native-objects/url-state";
import { createNativeObjectRef, getModuleRoute, getModuleViewRoute } from "../../lib/native-objects/routes";
import { Chip, Icon, money } from "./FinancePrimitives";
import styles from "./FinanceOperational.module.css";

const TRANSACTION_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "properties", label: "Properties" },
  { id: "links", label: "Links" },
  { id: "audit", label: "Audit" },
  { id: "rules", label: "Rules" }
];

const ACCOUNT_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Transactions" },
  { id: "reconcile", label: "Reconcile" },
  { id: "transfers", label: "Transfers" },
  { id: "imports", label: "Imports" },
  { id: "properties", label: "Properties" }
];

const BILL_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "payments", label: "Payments" },
  { id: "value", label: "Value" },
  { id: "links", label: "Links" },
  { id: "rules", label: "Rules" },
  { id: "properties", label: "Properties" }
];

const BUDGET_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Transactions" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "projects", label: "Projects" },
  { id: "rules", label: "Rules" },
  { id: "properties", label: "Properties" }
];

const REVIEW_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Evidence" },
  { id: "decisions", label: "Decisions" },
  { id: "links", label: "Links" },
  { id: "activity", label: "Activity" },
  { id: "properties", label: "Properties" }
];

export type FinanceInspectableView = "accounts" | "transactions" | "bills" | "budgets" | "review";

export function isFinanceInspectableView(view: string): view is FinanceInspectableView {
  return view === "accounts" || view === "transactions" || view === "bills" || view === "budgets" || view === "review";
}

export function getFinanceTabsForView(view: FinanceInspectableView) {
  if (view === "accounts") return ACCOUNT_TABS;
  if (view === "transactions") return TRANSACTION_TABS;
  if (view === "bills") return BILL_TABS;
  if (view === "budgets") return BUDGET_TABS;
  return REVIEW_TABS;
}

export function isFinanceTabAllowed(view: FinanceInspectableView, tab: string): tab is FinanceTab {
  return getFinanceTabsForView(view).some((candidate) => candidate.id === tab);
}

function initials(label: string) {
  return label.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function linkedContextRoute(item: FinanceLinkedContext) {
  if (item.type === "Finance") return getModuleViewRoute("finance", "review");
  const module = item.type === "Note" ? "notes" : item.type === "Project" ? "projects" : "resources";
  return `${getModuleRoute(module)}?query=${encodeURIComponent(item.title)}`;
}

function financeDecisionSource(
  objectType: "budget" | "finance_close_check",
  objectId: string,
  label: string,
  containerObjectId?: string
): DecisionSourceRef {
  return createNativeObjectRef({
    module: "finance",
    objectType,
    objectId,
    ...(containerObjectId ? { containerObjectId } : {}),
    label
  }) as DecisionSourceRef;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return <button type="button" className="finance-rail-close" onClick={onClose} aria-label="Close Finance inspector"><Icon name="X" /></button>;
}

function TransactionProperties({ transaction }: { transaction: FinanceTransaction }) {
  const values: Array<[string, string]> = [
    ["Transaction ID", transaction.id],
    ["Date", transaction.date],
    ["Quarter", transaction.quarterYear],
    ["Week", transaction.weekYear],
    ["Weekday", `${transaction.weekdayName} · ${transaction.weekdayNum}`],
    ["Timezone", transaction.tzOffset],
    ["Entity", transaction.entity],
    ["Merchant", transaction.merchant],
    ["Account", transaction.account],
    ["Account type", transaction.accountType],
    ["Amount", money(transaction.amount, { sign: true, cents: true })],
    ["IO type", transaction.io],
    ["Currency", transaction.currency],
    ["Category", transaction.category],
    ["Spend category", transaction.spendCategory || "Not recorded"],
    ["Receipt", transaction.receipt || "Not attached"],
    ["Income source", transaction.incomeSource || "Not applicable"],
    ["Reimbursable", transaction.reimbursable ? "Yes" : "No"],
    ["Reimbursed on", transaction.reimbursedOn || "Not recorded"],
    ["Reviewed", transaction.ufInit ? "Yes" : "No"],
    ["Status", transaction.status]
  ];
  return <div className={styles.factGrid}>{values.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function AuditTimeline({ events }: { events: readonly FinanceAuditEvent[] }) {
  if (!events.length) return <SystemState variant="empty" title="No audit events yet" description="The record has not changed since its initial persisted state, or this view has no matching event." />;
  return <div className={styles.compactList}>{events.slice().reverse().map((event) => (
    <article className={styles.compactRow} key={event.id}>
      <span><strong>{event.action.replaceAll(".", " ")}</strong><small>{new Date(event.occurredAt).toLocaleString()} · {event.actorId}</small></span>
      <span>{event.id.slice(-8)}</span>
    </article>
  ))}</div>;
}

type FinanceInspectorProps = {
  financeState: FinanceState;
  view: FinanceInspectableView;
  accountModel: FinanceAccountsViewModel;
  transactionModel: FinanceTransactionsViewModel;
  billsModel: FinanceBillsViewModel;
  budgetsModel: FinanceBudgetsViewModel;
  monthlyReviewModel: FinanceMonthlyReviewViewModel;
  linkedContext: readonly FinanceLinkedContext[];
  decisions: PersonalOpsDecision[];
  decisionsError: string;
  decisionsLoading: boolean;
  onRefreshDecisions: () => void;
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  onClose: () => void;
  mobileOpen: boolean;
  overlay: boolean;
  overlayOpen: boolean;
};

export default function FinanceInspector({
  financeState,
  view,
  accountModel,
  transactionModel,
  billsModel,
  budgetsModel,
  monthlyReviewModel,
  linkedContext,
  decisions,
  decisionsError,
  decisionsLoading,
  onRefreshDecisions,
  activeTab,
  onTabChange,
  onClose,
  mobileOpen,
  overlay,
  overlayOpen
}: FinanceInspectorProps) {
  const tabs = getFinanceTabsForView(view);
  const safeTab = isFinanceTabAllowed(view, activeTab) ? activeTab : "overview";
  const accountRow = view === "accounts" ? accountModel.selected : null;
  const transaction = view === "transactions" ? transactionModel.selected : null;
  const billRow = view === "bills" ? billsModel.selected : null;
  const budgetRow = view === "budgets" ? budgetsModel.selected : null;
  const reviewRow = view === "review" ? monthlyReviewModel.selected : null;
  if (!accountRow && !transaction && !billRow && !budgetRow && !reviewRow) return null;
  const budgetDecisionSource = budgetRow
    ? financeDecisionSource("budget", budgetRow.budget.id, budgetRow.budget.category)
    : null;
  const closePeriod = reviewRow ? financeState.closePeriods.find((period) => period.checks.some((check) => check.id === reviewRow.item.id)) || null : null;
  const closeDecisionSource = reviewRow
    ? financeDecisionSource("finance_close_check", reviewRow.item.id, reviewRow.item.label, closePeriod?.id)
    : null;
  const objectId = accountRow?.account.id || transaction?.id || billRow?.bill.id || budgetRow?.budget.id || reviewRow?.item.id || "";
  const objectKind = accountRow ? "account" : transaction ? "transaction" : billRow ? "bill" : budgetRow ? "budget" : "close_period";
  const selectedCloseCheck = reviewRow ? closePeriod?.checks.find((check) => check.id === reviewRow.item.id) || null : null;
  const nativeAuditEvents = financeState.auditEvents.filter((event) => event.objectType === objectKind && event.objectId === (closePeriod?.id || objectId));

  const objectTitle = accountRow?.account.name
    || transaction?.merchant
    || billRow?.bill.name
    || budgetRow?.budget.category
    || reviewRow?.item.label
    || "Finance object";
  const objectType = accountRow
    ? "Selected account"
    : transaction
      ? "Selected transaction"
      : billRow
        ? "Selected bill / subscription"
        : budgetRow
          ? "Selected budget category"
          : "Selected close item";
  const subtitle = accountRow
    ? `${accountRow.account.inst} · ••${accountRow.account.mask} · ${accountRow.account.kind}`
    : transaction
      ? `${transaction.id} · ${transaction.account} · ${transaction.date}`
      : billRow
        ? `${billRow.bill.id} · ${billRow.bill.account} · ${billRow.bill.due}`
        : budgetRow
          ? `${budgetRow.budget.id} · persistent monthly cap`
          : `${reviewRow?.item.id} · Finance-owned monthly close`;
  const stateChip = accountRow
    ? <Chip hue={accountRow.account.balance < 0 ? "crimson" : accountRow.account.hue}>{accountRow.account.kind}</Chip>
    : transaction
      ? <Chip hue={transaction.status === "pending" ? "yellow" : "green"}>{transaction.status}</Chip>
      : billRow
        ? <Chip hue={billRow.bill.status === "overdue" ? "crimson" : "orange"}>{billRow.bill.status}</Chip>
        : budgetRow
          ? <Chip hue={budgetRow.remaining < 0 ? "crimson" : "green"}>{budgetRow.remaining < 0 ? "over cap" : "within cap"}</Chip>
          : <Chip hue={reviewRow?.isComplete ? "green" : "orange"}>{reviewRow?.isComplete ? "complete" : "open"}</Chip>;

  return (
    <InspectorRail
      id="finance-inspector"
      title={(
        <ObjectHeader
          headingLevel="h2"
          className={styles.inspectorHeader}
          objectType={objectType}
          title={objectTitle}
          subtitle={subtitle}
          identity={initials(objectTitle)}
          states={<>{stateChip}<Chip hue="green">Native</Chip></>}
          metadata={accountRow
            ? `${money(accountRow.account.balance, { cents: true })} · ${accountRow.account.delta30 >= 0 ? "+" : ""}${accountRow.account.delta30}% over 30d`
            : transaction
              ? money(transaction.amount, { sign: true, cents: true })
              : billRow
                ? money(billRow.bill.amount, { cents: true })
                : budgetRow
                  ? `${money(budgetRow.budget.spent, { cents: true })} / ${money(budgetRow.budget.limit, { cents: true })}`
                  : monthlyReviewModel.completion.ratioLabel}
        />
      )}
      actions={<CloseButton onClose={onClose} />}
      footer={<div className={styles.inspectorFooter}><p>Use the Finance action bar above the route to mutate the selected record. This inspector preserves URL-restorable context and audit visibility.</p></div>}
      className={`finance-right-rail ${mobileOpen ? "is-mobile-open" : ""}`}
      ariaLabel={`${objectTitle} Finance inspector`}
      readOnly
      overlay={overlay}
      overlayOpen={overlayOpen}
      onRequestClose={onClose}
    >
      <DetailTabs
        id="finance-object-tabs"
        className={styles.inspectorTabs}
        tabs={tabs}
        activeTab={safeTab}
        onTabChange={(tab) => onTabChange(tab as FinanceTab)}
        ariaLabel={`${objectTitle} details`}
      />

      {transaction && (
        <div className={styles.inspectorPanel}>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="overview" active={safeTab === "overview"} className={styles.inspectorPanel}>
            <div className={styles.factGrid}>
              <div><span>Amount</span><strong>{money(transaction.amount, { sign: true, cents: true })}</strong></div>
              <div><span>Status</span><strong>{transaction.status}</strong></div>
              <div><span>IO type</span><strong>{transaction.io}</strong></div>
              <div><span>Account</span><strong>{transaction.account}</strong></div>
              <div><span>Category</span><strong>{transaction.category}</strong></div>
              <div><span>Receipt</span><strong>{transaction.receipt || "Not attached"}</strong></div>
            </div>
            <section className={styles.inspectorSection}>
              <h3>Memo / finance context</h3>
              <p>{transaction.memo || "No memo is recorded."}</p>
            </section>
            <div className={styles.boundary}>
              <strong>Native ledger identity</strong>
              <span>The persisted transaction retains its immutable account ID; this display uses the current account label “{transaction.account}”. Balance snapshots remain explicit and are never silently recalculated.</span>
            </div>
          </DetailTabPanel>

          <DetailTabPanel tabsId="finance-object-tabs" tabId="properties" active={safeTab === "properties"} className={styles.inspectorPanel}>
            <TransactionProperties transaction={transaction} />
          </DetailTabPanel>

          <DetailTabPanel tabsId="finance-object-tabs" tabId="links" active={safeTab === "links"} className={styles.inspectorPanel}>
            <section className={styles.inspectorSection}>
              <h3>Owner-module search handoffs</h3>
              <p>Exact NativeObjectRef evidence opens its canonical owner. Search handoffs remain visibly distinct from persisted links.</p>
              <div className={styles.compactList}>
                <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "accounts")}?query=${encodeURIComponent(transaction.account)}`}><span><strong>{transaction.account}</strong><small>Finance account search · display-name match</small></span><span>Open</span></a>
                <a className={styles.compactRow} href={getModuleViewRoute("finance", "review")}><span><strong>Finance Monthly Review</strong><small>Finance owns close state</small></span><span>Open</span></a>
                {linkedContext.map((item) => <a className={styles.compactRow} href={linkedContextRoute(item)} key={item.id}><span><strong>{item.title}</strong><small>{item.type} owner search</small></span><span>Open</span></a>)}
              </div>
            </section>
          </DetailTabPanel>

          <DetailTabPanel tabsId="finance-object-tabs" tabId="audit" active={safeTab === "audit"}>
            <AuditTimeline events={nativeAuditEvents} />
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="rules" active={safeTab === "rules"}>
            <SystemState
              variant="read_only"
              title="Rule outcomes require confirmation"
              description={<span>Persistent Finance rules can evaluate deterministic cases and record test outcomes. They never silently mutate this transaction. <a href={`${getModuleViewRoute("finance", "rules")}?query=${encodeURIComponent(transaction.merchant)}`}>Search rules.</a></span>}
            />
          </DetailTabPanel>
        </div>
      )}

      {accountRow && (
        <div className={styles.inspectorPanel}>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="overview" active={safeTab === "overview"} className={styles.inspectorPanel}>
            <div className={styles.factGrid}>
              <div><span>Current balance</span><strong>{money(accountRow.account.balance, { cents: true })}</strong></div>
              <div><span>30-day delta</span><strong>{accountRow.account.delta30 >= 0 ? "+" : ""}{accountRow.account.delta30}%</strong></div>
              <div><span>Matched transactions</span><strong>{accountRow.activity.transactions.length}</strong></div>
              <div><span>Matched bills</span><strong>{accountRow.activity.bills.length}</strong></div>
              <div><span>Available balance</span><strong>Not recorded</strong></div>
              <div><span>Import health</span><strong>Not calculated</strong></div>
            </div>
            <section className={styles.inspectorSection}>
              <h3>Native account activity</h3>
              <p>{accountRow.activity.transactions.length} transactions and {accountRow.activity.bills.length} bills resolve to this account through immutable Finance IDs.</p>
            </section>
            <div className={styles.boundary}>
              <strong>Explicit balance boundary</strong>
              <span>Transfers, savings movements, and imports persist with audit history, but none silently rewrites this account’s balance snapshot.</span>
            </div>
            <a className={styles.compactRow} href={getModuleViewRoute("finance", "review")}>
              <span><strong>Finance Monthly Review</strong><small>Finance owns monthly close; this account is not yet durably linked</small></span>
              <span>Open</span>
            </a>
          </DetailTabPanel>

          <DetailTabPanel tabsId="finance-object-tabs" tabId="transactions" active={safeTab === "transactions"} className={styles.inspectorPanel}>
            {accountRow.activity.transactions.length ? (
              <div className={styles.compactList}>
                {accountRow.activity.transactions.map((item) => (
                  <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "transactions")}?selected=${encodeURIComponent(item.id)}`} key={item.id}>
                    <span><strong>{item.merchant}</strong><small>{item.date} · {item.category} · native account reference</small></span>
                    <span className={item.amount > 0 ? styles.positive : undefined}>{money(item.amount, { sign: true, cents: true })}</span>
                  </a>
                ))}
              </div>
            ) : <SystemState variant="empty" title="No account transactions" description="No current transaction references this account." />}
          </DetailTabPanel>

          {(["reconcile", "transfers", "imports"] as const).map((tab) => (
            <DetailTabPanel tabsId="finance-object-tabs" tabId={tab} active={safeTab === tab} key={tab}>
              <SystemState
                variant="read_only"
                title={`${tab[0].toUpperCase()}${tab.slice(1)} is available from the route action bar`}
                description={tab === "transfers"
                  ? "Paired transfers retain source and destination IDs and remain excluded from income and spending."
                  : tab === "imports"
                    ? "CSV preview, mapping, exact-source deduplication, counts, provenance, and explicit confirmation are persistent and auditable."
                    : "Record a balance snapshot or reconcile selected ledger facts without inferring a new balance."}
              />
            </DetailTabPanel>
          ))}

          <DetailTabPanel tabsId="finance-object-tabs" tabId="properties" active={safeTab === "properties"}>
            <div className={styles.factGrid}>
              <div><span>Account ID</span><strong>{accountRow.account.id}</strong></div>
              <div><span>Name</span><strong>{accountRow.account.name}</strong></div>
              <div><span>Institution</span><strong>{accountRow.account.inst}</strong></div>
              <div><span>Mask</span><strong>{accountRow.account.mask}</strong></div>
              <div><span>Kind</span><strong>{accountRow.account.kind}</strong></div>
              <div><span>Current balance</span><strong>{money(accountRow.account.balance, { cents: true })}</strong></div>
              <div><span>30-day delta</span><strong>{accountRow.account.delta30}%</strong></div>
              <div><span>Persistence</span><strong>Native Finance store</strong></div>
            </div>
          </DetailTabPanel>
        </div>
      )}

      {billRow && (
        <div className={styles.inspectorPanel}>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="overview" active={safeTab === "overview"} className={styles.inspectorPanel}>
            <div className={styles.factGrid}>
              <div><span>Amount</span><strong>{money(billRow.bill.amount, { cents: true })}</strong></div>
              <div><span>Payment status</span><strong>{billRow.bill.status}</strong></div>
              <div><span>Cadence</span><strong>{billRow.bill.recurring || "Not recorded"}</strong></div>
              <div><span>Autopay</span><strong>{billRow.bill.autopay ? "On" : "Manual"}</strong></div>
              <div><span>Account</span><strong>{billRow.bill.account}</strong></div>
              <div><span>Category</span><strong>{billRow.bill.category}</strong></div>
            </div>
            <section className={styles.inspectorSection}>
              <h3>Payment and value stay separate</h3>
              <p>{billRow.bill.name} is {billRow.bill.status}. Payment outcome, recurrence, autopay, canonical evidence, or an explicit exception remain separate facts.</p>
            </section>
            <div className={styles.boundary}><strong>No payment execution</strong><span>Finance records an observed payment only with evidence or an explicit audited exception; it never sends money.</span></div>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="payments" active={safeTab === "payments"}>
            <AuditTimeline events={nativeAuditEvents.filter((event) => event.action.includes("paid"))} />
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="value" active={safeTab === "value"} className={styles.inspectorPanel}>
            <div className={styles.factGrid}>
              <div><span>Current amount</span><strong>{money(billRow.bill.amount, { cents: true })}</strong></div>
              <div><span>Monthly equivalent</span><strong>{money(billRow.monthlyEquivalent, { cents: true })}</strong></div>
              <div><span>Value state</span><strong>Not recorded</strong></div>
              <div><span>Last reviewed</span><strong>Not recorded</strong></div>
            </div>
            <SystemState variant="read_only" title="Value decisions are unavailable" description="Keep, cancel, downgrade, replace, pause, and follow-up actions need a durable value-review contract." />
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="links" active={safeTab === "links"} className={styles.inspectorPanel}>
            <div className={styles.compactList}>
              <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "accounts")}?query=${encodeURIComponent(billRow.bill.account)}`}><span><strong>{billRow.bill.account}</strong><small>Finance account owner</small></span><span>Open</span></a>
              <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "transactions")}?query=${encodeURIComponent(billRow.bill.name)}`}><span><strong>Transaction candidates</strong><small>Merchant search only · no durable link inferred</small></span><span>Search</span></a>
              <a className={styles.compactRow} href={getModuleViewRoute("finance", "review")}><span><strong>Finance Monthly Review</strong><small>Finance owns close state</small></span><span>Open</span></a>
            </div>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="rules" active={safeTab === "rules"}>
            <SystemState
              variant="read_only"
              title="Recurring rules are controlled"
              description={<span>Persistent rules can be searched and deterministically tested. Suggested changes still require confirmation. <a href={`${getModuleViewRoute("finance", "rules")}?query=${encodeURIComponent(billRow.bill.name)}`}>Search rules.</a></span>}
            />
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="properties" active={safeTab === "properties"}>
            <div className={styles.factGrid}>
              <div><span>Bill ID</span><strong>{billRow.bill.id}</strong></div><div><span>Name</span><strong>{billRow.bill.name}</strong></div>
              <div><span>Due</span><strong>{billRow.bill.due}</strong></div><div><span>Due offset</span><strong>{billRow.bill.dueIn} days</strong></div>
              <div><span>Recurring</span><strong>{billRow.bill.recurring || "No"}</strong></div><div><span>Autopay</span><strong>{billRow.bill.autopay ? "Yes" : "No"}</strong></div>
              <div><span>Account</span><strong>{billRow.bill.account}</strong></div><div><span>Persistence</span><strong>Native Finance store</strong></div>
            </div>
          </DetailTabPanel>
        </div>
      )}

      {budgetRow && (
        <div className={styles.inspectorPanel}>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="overview" active={safeTab === "overview"} className={styles.inspectorPanel}>
            <div className={styles.factGrid}>
              <div><span>Cap</span><strong>{money(budgetRow.budget.limit, { cents: true })}</strong></div>
              <div><span>Spent</span><strong>{money(budgetRow.budget.spent, { cents: true })}</strong></div>
              <div><span>Remaining</span><strong>{money(budgetRow.remaining, { cents: true })}</strong></div>
              <div><span>Used</span><strong>{budgetRow.usedPercent === null ? "Unavailable" : `${budgetRow.usedPercent.toFixed(2)}%`}</strong></div>
              <div><span>Forecast</span><strong>Not calculated</strong></div>
              <div><span>Review state</span><strong>{budgetRow.remaining < 0 ? "Literal overage" : "No literal overage"}</strong></div>
            </div>
            <section className={styles.inspectorSection}><h3>Literal variance only</h3><p>{budgetRow.budget.category} has {money(budgetRow.remaining, { cents: true })} remaining from its persistent cap. No forecast, confidence, project allocation, or decision is inferred.</p></section>
            <LinkedDecisionsPanel
              source={budgetDecisionSource!}
              decisions={decisions}
              loading={decisionsLoading}
              error={decisionsError}
              onRefresh={onRefreshDecisions}
              createHref={buildDecisionCreationRoute(budgetDecisionSource!)}
              compact
              title="Budget decisions"
            />
            <div className={styles.boundary}><strong>Finance owns the cap</strong><span>A Personal Ops Decision may record a choice without changing Finance. A material overage never silently changes the cap.</span></div>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="transactions" active={safeTab === "transactions"} className={styles.inspectorPanel}>
            <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "transactions")}?query=${encodeURIComponent(budgetRow.budget.category)}`}><span><strong>Search Transactions</strong><small>Transactions owns transaction facts; this is a category search, not a persisted link.</small></span><span>Open</span></a>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="subscriptions" active={safeTab === "subscriptions"} className={styles.inspectorPanel}>
            <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "bills")}?query=${encodeURIComponent(budgetRow.budget.category)}`}><span><strong>Search Bills & Subscriptions</strong><small>Bills owns recurring-obligation state; category equality is only search evidence.</small></span><span>Open</span></a>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="projects" active={safeTab === "projects"}>
            <SystemState variant="read_only" title="No Project allocation reference" description="No stable Project reference is stored for this budget. No Project object is copied or inferred." />
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="rules" active={safeTab === "rules"}>
            <SystemState
              variant="read_only"
              title="Budget rules require confirmation"
              description={<span>Persistent variance rules can be inspected and tested without source writes. Forecasting remains unavailable until a formula is approved. <a href={`${getModuleViewRoute("finance", "rules")}?filter=budget-rules`}>Open budget rules.</a></span>}
            />
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="properties" active={safeTab === "properties"}>
            <div className={styles.factGrid}>
              <div><span>Budget ID</span><strong>{budgetRow.budget.id}</strong></div><div><span>Category</span><strong>{budgetRow.budget.category}</strong></div>
              <div><span>Cap</span><strong>{money(budgetRow.budget.limit, { cents: true })}</strong></div><div><span>Spent</span><strong>{money(budgetRow.budget.spent, { cents: true })}</strong></div>
              <div><span>Remaining</span><strong>{money(budgetRow.remaining, { cents: true })}</strong></div><div><span>Forecast</span><strong>Unavailable</strong></div>
            </div>
          </DetailTabPanel>
        </div>
      )}

      {reviewRow && (
        <div className={styles.inspectorPanel}>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="overview" active={safeTab === "overview"} className={styles.inspectorPanel}>
            <div className={styles.factGrid}>
              <div><span>Item state</span><strong>{reviewRow.isComplete ? "Complete" : "Open"}</strong></div>
              <div><span>Literal blocker</span><strong>{reviewRow.isLiteralBlocker ? "Yes" : "No"}</strong></div>
              <div><span>Required / optional</span><strong>{closePeriod?.checks.find((check) => check.id === reviewRow.item.id)?.required ? "Required" : "Optional"}</strong></div>
              <div><span>Evidence</span><strong>{closePeriod?.checks.find((check) => check.id === reviewRow.item.id)?.evidenceRefs.length || 0} references</strong></div>
              <div><span>Close completion</span><strong>{monthlyReviewModel.sourceCount - monthlyReviewModel.overallLiteralBlockers.length} / {monthlyReviewModel.sourceCount} named checks</strong></div>
              <div><span>Weighted readiness</span><strong>Not calculated</strong></div>
            </div>
            <section className={styles.inspectorSection}><h3>Close item boundary</h3><p>{reviewRow.item.label} is a named persistent check. Its resolution, evidence, reasoned waiver, or canonical carry-forward owner is stored on the Finance-owned close.</p></section>
            <div className={styles.boundary}><strong>Explainable close gate</strong><span>Every required check must be complete, waived with a reason, or explicitly carried forward before close.</span></div>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="evidence" active={safeTab === "evidence"}>
            {selectedCloseCheck?.evidenceRefs.length ? <div className={styles.compactList}>{selectedCloseCheck.evidenceRefs.map((ref) => (
              <a className={styles.compactRow} href={ref.route} key={`${ref.module}:${ref.objectType}:${ref.objectId}`}><span><strong>{ref.label}</strong><small>{ref.module} · {ref.objectType}</small></span><span>Open</span></a>
            ))}</div> : <SystemState variant="empty" title="No close evidence references" description="Missing evidence is not silently waived. Resolve the check with evidence, a reasoned waiver, or canonical carry-forward owner." />}
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="activity" active={safeTab === "activity"}>
            <AuditTimeline events={nativeAuditEvents} />
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="decisions" active={safeTab === "decisions"} className={styles.inspectorPanel}>
            <LinkedDecisionsPanel
              source={closeDecisionSource!}
              decisions={decisions}
              loading={decisionsLoading}
              error={decisionsError}
              onRefresh={onRefreshDecisions}
              createHref={buildDecisionCreationRoute(closeDecisionSource!)}
              title="Close-item decisions"
            />
            <div className={styles.boundary}><strong>Finance retains close ownership</strong><span>Personal Ops owns the durable Decision. Filing one does not resolve this checklist item unless Finance explicitly records the check outcome.</span></div>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="links" active={safeTab === "links"} className={styles.inspectorPanel}>
            <a className={styles.compactRow} href={getModuleRoute("reviews")}><span><strong>Reviews coordination</strong><small>Reviews may reference Finance close state but does not own it.</small></span><span>Open</span></a>
            <a className={styles.compactRow} href={getModuleViewRoute("finance", "review")}><span><strong>Finance Monthly Review</strong><small>Canonical Finance-owned close route</small></span><span>Current</span></a>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="properties" active={safeTab === "properties"}>
            <div className={styles.factGrid}>
              <div><span>Checklist item ID</span><strong>{reviewRow.item.id}</strong></div><div><span>Label</span><strong>{reviewRow.item.label}</strong></div>
              <div><span>Done flag</span><strong>{reviewRow.item.done ? "true" : "false"}</strong></div><div><span>Required flag</span><strong>{closePeriod?.checks.find((check) => check.id === reviewRow.item.id)?.required ? "true" : "false"}</strong></div>
              <div><span>Resolution</span><strong>{closePeriod?.checks.find((check) => check.id === reviewRow.item.id)?.resolution || "unknown"}</strong></div><div><span>Persistence</span><strong>Native Finance store</strong></div>
            </div>
          </DetailTabPanel>
        </div>
      )}
    </InspectorRail>
  );
}
