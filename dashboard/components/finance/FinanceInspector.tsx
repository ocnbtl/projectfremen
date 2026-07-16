"use client";

import InspectorRail from "../admin-shell/InspectorRail";
import DetailTabs, { DetailTabPanel, type DetailTab } from "../operational/DetailTabs";
import ObjectHeader from "../operational/ObjectHeader";
import QuickActionBar from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import type { FinanceAccountsViewModel } from "../../lib/modules/finance/accounts-view-model";
import type { FinanceBillsViewModel } from "../../lib/modules/finance/bills-view-model";
import type { FinanceBudgetsViewModel } from "../../lib/modules/finance/budgets-view-model";
import type { FinanceMonthlyReviewViewModel } from "../../lib/modules/finance/monthly-review-view-model";
import type { FinanceTransactionsViewModel } from "../../lib/modules/finance/transactions-view-model";
import type { FinanceLinkedContext, FinanceTransaction } from "../../lib/modules/finance/types";
import type { FinanceTab } from "../../lib/native-objects/url-state";
import { getModuleRoute, getModuleViewRoute } from "../../lib/native-objects/routes";
import { Chip, Icon, money } from "./FinancePrimitives";
import styles from "./FinanceOperational.module.css";

const READ_ONLY_REASON = "Persistent Finance mutations are not connected to this fixture-backed checkpoint.";

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
    ["Fixture source flag", transaction.ufInit ? "Yes" : "No"],
    ["Status", transaction.status]
  ];
  return <div className={styles.factGrid}>{values.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

type FinanceInspectorProps = {
  view: FinanceInspectableView;
  accountModel: FinanceAccountsViewModel;
  transactionModel: FinanceTransactionsViewModel;
  billsModel: FinanceBillsViewModel;
  budgetsModel: FinanceBudgetsViewModel;
  monthlyReviewModel: FinanceMonthlyReviewViewModel;
  linkedContext: readonly FinanceLinkedContext[];
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  onClose: () => void;
  mobileOpen: boolean;
  overlay: boolean;
  overlayOpen: boolean;
};

export default function FinanceInspector({
  view,
  accountModel,
  transactionModel,
  billsModel,
  budgetsModel,
  monthlyReviewModel,
  linkedContext,
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
          ? `${budgetRow.budget.id} · literal June fixture cap`
          : `${reviewRow?.item.id} · Finance-owned monthly close fixture`;
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
          states={<>{stateChip}<Chip hue="brown">Read-only fixture</Chip></>}
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
      footer={(
        <div className={styles.inspectorFooter}>
          <QuickActionBar
            ariaLabel={`${objectTitle} unavailable actions`}
            actions={accountRow ? [
              { id: "finance-account-reconcile", label: "Reconcile", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-account-transfer", label: "Transfer", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-account-import", label: "Import", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-account-link-review", label: "Link to close", disabled: true, disabledReason: READ_ONLY_REASON }
            ] : transaction ? [
              { id: "finance-transaction-reconcile", label: "Reconcile", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-transaction-categorize", label: "Categorize", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-transaction-receipt", label: "Attach receipt", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-transaction-link", label: "Link context", disabled: true, disabledReason: READ_ONLY_REASON }
            ] : billRow ? [
              { id: "finance-bill-payment", label: "Record payment", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-bill-paid", label: "Mark paid", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-bill-value", label: "Review value", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-bill-close", label: "Link to close", disabled: true, disabledReason: READ_ONLY_REASON }
            ] : budgetRow ? [
              { id: "finance-budget-decision", label: "Create decision", disabled: true, disabledReason: "Durable Decisions belong to Personal Ops; no accepted cross-module write path is connected." },
              { id: "finance-budget-adjust", label: "Adjust cap", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-budget-buffer", label: "Cover from buffer", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-budget-close", label: "Link to close", disabled: true, disabledReason: READ_ONLY_REASON }
            ] : [
              { id: "finance-close-item", label: reviewRow?.isComplete ? "Reopen item" : "Mark complete", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-close-evidence", label: "Attach evidence", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-close-carry", label: "Carry forward", disabled: true, disabledReason: READ_ONLY_REASON },
              { id: "finance-close-complete", label: "Complete close", disabled: true, disabledReason: "Required fixture checks remain open and close persistence, audit, and reopen semantics are not connected." }
            ]}
          />
        </div>
      )}
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
              <p>{transaction.memo || "No memo is recorded in the fixture."}</p>
            </section>
            <div className={styles.boundary}>
              <strong>Fixture identity only</strong>
              <span>The account match uses the display name “{transaction.account}”; it is not a durable account reference. Categorization, evidence, link, and audit writes remain unavailable.</span>
            </div>
          </DetailTabPanel>

          <DetailTabPanel tabsId="finance-object-tabs" tabId="properties" active={safeTab === "properties"} className={styles.inspectorPanel}>
            <TransactionProperties transaction={transaction} />
          </DetailTabPanel>

          <DetailTabPanel tabsId="finance-object-tabs" tabId="links" active={safeTab === "links"} className={styles.inspectorPanel}>
            <section className={styles.inspectorSection}>
              <h3>Owner-module search handoffs</h3>
              <p>These links search owner modules by retained fixture titles. They do not create or prove native object links.</p>
              <div className={styles.compactList}>
                <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "accounts")}?query=${encodeURIComponent(transaction.account)}`}><span><strong>{transaction.account}</strong><small>Finance account search · display-name match</small></span><span>Open</span></a>
                <a className={styles.compactRow} href={getModuleViewRoute("finance", "review")}><span><strong>Finance Monthly Review</strong><small>Finance owns close state</small></span><span>Open</span></a>
                {linkedContext.map((item) => <a className={styles.compactRow} href={linkedContextRoute(item)} key={item.id}><span><strong>{item.title}</strong><small>{item.type} owner search</small></span><span>Open</span></a>)}
              </div>
            </section>
          </DetailTabPanel>

          <DetailTabPanel tabsId="finance-object-tabs" tabId="audit" active={safeTab === "audit"}>
            <SystemState variant="read_only" title="Transaction audit is not connected" description="The fixture contains no append-only Finance audit events. No history is synthesized." />
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="rules" active={safeTab === "rules"}>
            <SystemState variant="read_only" title="Rules are not connected" description="There is no rule repository, risk policy, test record, or activation audit. The Rules route remains unavailable." />
          </DetailTabPanel>
        </div>
      )}

      {accountRow && (
        <div className={styles.inspectorPanel}>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="overview" active={safeTab === "overview"} className={styles.inspectorPanel}>
            <div className={styles.factGrid}>
              <div><span>Current balance</span><strong>{money(accountRow.account.balance, { cents: true })}</strong></div>
              <div><span>30-day delta</span><strong>{accountRow.account.delta30 >= 0 ? "+" : ""}{accountRow.account.delta30}%</strong></div>
              <div><span>Matched transactions</span><strong>{accountRow.fixtureActivity.transactions.length}</strong></div>
              <div><span>Matched bills</span><strong>{accountRow.fixtureActivity.bills.length}</strong></div>
              <div><span>Available balance</span><strong>Not recorded</strong></div>
              <div><span>Import health</span><strong>Not calculated</strong></div>
            </div>
            <section className={styles.inspectorSection}>
              <h3>Fixture-scoped activity</h3>
              <p>{accountRow.fixtureActivity.transactions.length} transactions and {accountRow.fixtureActivity.bills.length} bills match the account display name. This is useful for review but is not a persisted relationship.</p>
            </section>
            <div className={styles.boundary}>
              <strong>Account writes unavailable</strong>
              <span>Reconciliation, transfers, savings confirmation, imports, connection state, and close linkage need a native Finance repository and audit contract.</span>
            </div>
            <a className={styles.compactRow} href={getModuleViewRoute("finance", "review")}>
              <span><strong>Finance Monthly Review</strong><small>Finance owns monthly close; this account is not yet durably linked</small></span>
              <span>Open</span>
            </a>
          </DetailTabPanel>

          <DetailTabPanel tabsId="finance-object-tabs" tabId="transactions" active={safeTab === "transactions"} className={styles.inspectorPanel}>
            {accountRow.fixtureActivity.transactions.length ? (
              <div className={styles.compactList}>
                {accountRow.fixtureActivity.transactions.map((item) => (
                  <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "transactions")}?selected=${encodeURIComponent(item.id)}`} key={item.id}>
                    <span><strong>{item.merchant}</strong><small>{item.date} · {item.category} · fixture display-name match</small></span>
                    <span className={item.amount > 0 ? styles.positive : undefined}>{money(item.amount, { sign: true, cents: true })}</span>
                  </a>
                ))}
              </div>
            ) : <SystemState variant="empty" title="No matching fixture transactions" description="No transaction display-name match exists for this account." />}
          </DetailTabPanel>

          {(["reconcile", "transfers", "imports"] as const).map((tab) => (
            <DetailTabPanel tabsId="finance-object-tabs" tabId={tab} active={safeTab === tab} key={tab}>
              <SystemState
                variant="read_only"
                title={`${tab[0].toUpperCase()}${tab.slice(1)} not connected`}
                description={tab === "transfers"
                  ? "The fixture has no durable source/destination transfer identities. Savings remains separate from income and spending."
                  : tab === "imports"
                    ? "No import source, batch, mapping, health formula, or repair repository is connected."
                    : "No reconciliation session, statement balance, exception writer, or audit receipt is connected."}
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
              <div><span>Persistence</span><strong>Fixture only</strong></div>
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
              <p>{billRow.bill.name} is {billRow.bill.status}. The fixture records payment timing and autopay, but it has no persisted value-review state, payment evidence, or cancellation decision.</p>
            </section>
            <div className={styles.boundary}><strong>No payment execution</strong><span>Pay, schedule, mark-paid, autopay, evidence, and close-state writes require native Finance records, validation, and audit.</span></div>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="payments" active={safeTab === "payments"}>
            <SystemState variant="read_only" title="Payment history is not connected" description="No linked payment transaction, evidence record, exception, or audit event is available. The due state remains visible." />
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
              <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "accounts")}?query=${encodeURIComponent(billRow.bill.account)}`}><span><strong>{billRow.bill.account}</strong><small>Finance account search · fixture display-name match</small></span><span>Open</span></a>
              <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "transactions")}?query=${encodeURIComponent(billRow.bill.name)}`}><span><strong>Transaction candidates</strong><small>Merchant search only · no durable link inferred</small></span><span>Search</span></a>
              <a className={styles.compactRow} href={getModuleViewRoute("finance", "review")}><span><strong>Finance Monthly Review</strong><small>Finance owns close state</small></span><span>Open</span></a>
            </div>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="rules" active={safeTab === "rules"}>
            <SystemState variant="read_only" title="Recurring rules are not connected" description="No merchant matcher, cadence test, payment-account rule, activation state, or run history is stored." />
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="properties" active={safeTab === "properties"}>
            <div className={styles.factGrid}>
              <div><span>Bill ID</span><strong>{billRow.bill.id}</strong></div><div><span>Name</span><strong>{billRow.bill.name}</strong></div>
              <div><span>Due</span><strong>{billRow.bill.due}</strong></div><div><span>Due offset</span><strong>{billRow.bill.dueIn} days</strong></div>
              <div><span>Recurring</span><strong>{billRow.bill.recurring || "No"}</strong></div><div><span>Autopay</span><strong>{billRow.bill.autopay ? "Yes" : "No"}</strong></div>
              <div><span>Account</span><strong>{billRow.bill.account}</strong></div><div><span>Persistence</span><strong>Fixture only</strong></div>
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
            <section className={styles.inspectorSection}><h3>Literal variance only</h3><p>{budgetRow.budget.category} has {money(budgetRow.remaining, { cents: true })} remaining from its fixture cap. No forecast, confidence, project allocation, or decision is inferred.</p></section>
            <div className={styles.boundary}><strong>Cap changes require rationale and audit</strong><span>Adjust, buffer, reclassify, review, and decision actions remain unavailable. A material overage never silently changes the cap.</span></div>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="transactions" active={safeTab === "transactions"} className={styles.inspectorPanel}>
            <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "transactions")}?query=${encodeURIComponent(budgetRow.budget.category)}`}><span><strong>Search Transactions</strong><small>Transactions owns transaction facts; this is a category search, not a persisted link.</small></span><span>Open</span></a>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="subscriptions" active={safeTab === "subscriptions"} className={styles.inspectorPanel}>
            <a className={styles.compactRow} href={`${getModuleViewRoute("finance", "bills")}?query=${encodeURIComponent(budgetRow.budget.category)}`}><span><strong>Search Bills & Subscriptions</strong><small>Bills owns recurring-obligation state; category equality is fixture evidence only.</small></span><span>Open</span></a>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="projects" active={safeTab === "projects"}>
            <SystemState variant="read_only" title="Project allocation is not connected" description="The budget fixture has no stable Project reference or approved reclassification. No Project object is copied or inferred." />
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="rules" active={safeTab === "rules"}>
            <SystemState variant="read_only" title="Budget rules are not connected" description="Forecast triggers remain unavailable because the forecast formula, rule repository, test history, and activation audit are unresolved." />
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
              <div><span>Required / optional</span><strong>Not recorded</strong></div>
              <div><span>Evidence</span><strong>Not connected</strong></div>
              <div><span>Close completion</span><strong>{monthlyReviewModel.sourceCount - monthlyReviewModel.overallLiteralBlockers.length} / {monthlyReviewModel.sourceCount} literal checks</strong></div>
              <div><span>Weighted readiness</span><strong>Not calculated</strong></div>
            </div>
            <section className={styles.inspectorSection}><h3>Close item boundary</h3><p>{reviewRow.item.label} is a literal fixture checklist item. The fixture does not identify required versus optional status, evidence references, waivers, carry-forward destination, or audit history.</p></section>
            <div className={styles.boundary}><strong>Complete Close remains blocked</strong><span>Every required check must eventually be complete, waived with reason, or explicitly carried forward. This fixture cannot establish those states.</span></div>
          </DetailTabPanel>
          {(["evidence", "decisions", "activity"] as const).map((panelTab) => (
            <DetailTabPanel tabsId="finance-object-tabs" tabId={panelTab} active={safeTab === panelTab} key={panelTab}>
              <SystemState
                variant="read_only"
                title={`${panelTab[0].toUpperCase()}${panelTab.slice(1)} not connected`}
                description={panelTab === "evidence"
                  ? "No Resource- or Media-owned evidence reference is stored, and missing evidence is not silently waived."
                  : panelTab === "decisions"
                    ? "No FinanceCloseDecision or accepted Personal Ops Decision is stored. Drafting or filing cannot be simulated."
                    : "No context-pull, reconciliation, evidence, carry-forward, completion, or reopen audit event is available."}
              />
            </DetailTabPanel>
          ))}
          <DetailTabPanel tabsId="finance-object-tabs" tabId="links" active={safeTab === "links"} className={styles.inspectorPanel}>
            <a className={styles.compactRow} href={getModuleRoute("reviews")}><span><strong>Reviews coordination</strong><small>Reviews may reference Finance close state but does not own it.</small></span><span>Open</span></a>
            <a className={styles.compactRow} href={getModuleViewRoute("finance", "review")}><span><strong>Finance Monthly Review</strong><small>Canonical Finance-owned close route</small></span><span>Current</span></a>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="properties" active={safeTab === "properties"}>
            <div className={styles.factGrid}>
              <div><span>Checklist item ID</span><strong>{reviewRow.item.id}</strong></div><div><span>Label</span><strong>{reviewRow.item.label}</strong></div>
              <div><span>Done flag</span><strong>{reviewRow.item.done ? "true" : "false"}</strong></div><div><span>Required flag</span><strong>Not recorded</strong></div>
              <div><span>Blocker basis</span><strong>{reviewRow.blockerBasis || "None"}</strong></div><div><span>Persistence</span><strong>Fixture only</strong></div>
            </div>
          </DetailTabPanel>
        </div>
      )}
    </InspectorRail>
  );
}
