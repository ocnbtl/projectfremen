"use client";

import FinanceMerchantAvatar,{FinanceMerchantPanel} from "./FinanceMerchants";
import detailStyles from "./FinanceDetails.module.css";
import { TransactionAccount } from "./FinanceTransactionAccount";
import FinanceAccountDetails from "./FinanceAccountDetails";
import UnigentamosIcon from "../icons/UnigentamosIcon";
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
import type { FinanceAuditEvent, FinanceRecordKind, FinanceState } from "../../lib/modules/finance/native-types";
import type { FinanceLinkedContext, FinanceTransaction } from "../../lib/modules/finance/types";
import type { FinanceTab } from "../../lib/native-objects/url-state";
import { createNativeObjectRef, getModuleRoute, getModuleViewRoute } from "../../lib/native-objects/routes";
import { Chip, Icon, money } from "./FinancePrimitives";
import type { FinanceOperation } from "./FinanceMutationDialog";
import styles from "./FinanceOperational.module.css";
import { overviewDate, transactionInBudget } from "../../lib/modules/finance/overview-model";

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
];

const BUDGET_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Spending" }
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
  return <button type="button" className="finance-rail-close" onClick={onClose} aria-label="Close Finance inspector" data-icon-button="standard"><Icon name="X" /></button>;
}

type OperationSelection = { kind: FinanceRecordKind; id: string };

function WorkbenchActions({ children }: { children: React.ReactNode }) {
  return <div className={styles.inspectorActions}>{children}</div>;
}

function WorkbenchAction({ children, primary = false, onClick }: { children: React.ReactNode; primary?: boolean; onClick: () => void }) {
  const label = typeof children === "string" ? children : "";
  const icon = label.startsWith("Edit") || label.startsWith("Update") ? "edit" : label === "Archive" ? "archive" : label.includes("payment") ? "banknote" : "check";
  return <button type="button" className={`finance-action ${primary ? "is-primary" : ""}`} aria-label={label || undefined} title={label || undefined} onClick={onClick}><UnigentamosIcon role={icon} size={16}/><span>{children}</span></button>;
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
    ["Reviewed", transaction.reviewDenied ? "Denied" : transaction.ufInit ? "Yes" : "No"],
    ["Status", transaction.status]
  ];
  return <div className={styles.factGrid}>{values.map(([label, value]) => <div key={label}><span>{label}</span><strong>{label==="Account" ? <TransactionAccount id={transaction.accountId} label={value}/> : value}</strong></div>)}</div>;
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
  onOperation: (operation: FinanceOperation, selection: OperationSelection) => void;
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
  onOperation,
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
  const accountSelection = accountRow ? { kind: "account" as const, id: accountRow.account.id } : null;
  const transactionSelection = transaction ? { kind: "transaction" as const, id: transaction.id } : null;
  const billSelection = billRow ? { kind: "bill" as const, id: billRow.bill.id } : null;
  const budgetSelection = budgetRow ? { kind: "budget" as const, id: budgetRow.budget.id } : null;
  const closeSelection = closePeriod ? { kind: "close_period" as const, id: closePeriod.id } : null;
  const objectTitle = accountRow?.account.name
    || transaction?.merchant
    || billRow?.bill.name
    || budgetRow?.budget.category
    || reviewRow?.item.label
    || "Finance object";
  const objectType = accountRow
    ? "Account"
    : transaction
      ? "Transaction"
      : billRow
        ? "Bill / subscription"
        : budgetRow
          ? "Budget"
          : "Monthly review";
  const subtitle = accountRow
    ? undefined
    : transaction
      ? <><TransactionAccount id={transaction.accountId} label={transaction.account}/> · {transaction.date}</>
      : billRow
        ? `${billRow.bill.account} · ${billRow.bill.due}`
        : budgetRow
          ? `Monthly spending plan`
          : `${closePeriod?.period || ""} · Month-end checklist`;
  const stateChip = accountRow
    ? <Chip hue={accountRow.account.balance < 0 ? "crimson" : accountRow.account.hue}>{accountRow.account.kind}</Chip>
    : transaction
      ? <Chip hue={transaction.status === "pending" ? "yellow" : "green"}>{transaction.status}</Chip>
      : billRow
        ? <Chip hue={billRow.bill.status === "overdue" ? "crimson" : billRow.bill.status === "paid" ? "green" : "orange"}>{billRow.bill.status}</Chip>
        : budgetRow
          ? <Chip hue={budgetRow.remaining < 0 ? "crimson" : "green"}>{budgetRow.remaining < 0 ? "over cap" : "within cap"}</Chip>
          : <Chip hue={reviewRow?.isComplete ? "green" : "orange"}>{reviewRow?.isComplete ? "complete" : "open"}</Chip>;

  const budget = budgetRow && financeState.budgets.find(item => item.id === budgetRow.budget.id);
  const bill = billRow && financeState.bills.find(item => item.id === billRow.bill.id);
  const periodLabel = budget && new Date(budget.period + "-01T12:00:00Z").toLocaleDateString("en-US", {month:"long", year:"numeric", timeZone:"UTC"});
  const paymentIds = new Set(bill?.evidence?.transactionIds);
  if (bill?.paymentEvidenceRef?.module === "finance" && ["transaction","finance_transaction"].includes(bill.paymentEvidenceRef.objectType)) {
    paymentIds.add(bill.paymentEvidenceRef.objectId);
  }
  const relatedPayments = financeState.transactions.filter(t => paymentIds.has(t.id)).sort((a,b) => b.occurredOn.localeCompare(a.occurredOn));
  const billPeriod = bill?.dueDate.slice(0,7);
  const billReview = bill && financeState.closePeriods.find(period => !period.archivedAt && period.period === billPeriod);
  const billRules = bill ? financeState.rules.filter(rule => !rule.archivedAt && rule.conditions.some(condition => {
    const field = condition.field === "merchant" ? bill.name : condition.field === "category" ? bill.category : "";
    const term = typeof condition.value === "string" && condition.value.trim().toLowerCase();
    if (!field || !term) return false;
    return condition.operator === "equals" ? field.toLowerCase() === term : condition.operator === "contains" && field.toLowerCase().includes(term);
  })) : [];
  const budgetSpending = budget ? financeState.transactions.filter(t => !t.archivedAt && transactionInBudget(t, budget)).sort((a,b) => b.occurredOn.localeCompare(a.occurredOn)) : [];

  return (
    <InspectorRail
      id="finance-inspector"
      title={billRow || budgetRow ? <div className={detailStyles.planHeader}>
        <div className={detailStyles.planIdentity}>
          {billRow ? <FinanceMerchantAvatar kind="bill" id={billRow.bill.id} label={objectTitle}/> : <span className={detailStyles.budgetIcon}><Icon name="PiggyBank"/></span>}
          <div><h2>{objectTitle}</h2><div className={detailStyles.planMeta}>{billRow ? <><span><Icon name="Wallet"/>{billRow.bill.account}</span><span><Icon name="Calendar"/>Due {billRow.bill.due}</span></> : <><span><Icon name="Calendar"/>{periodLabel}</span><span>{budget?.entityScope === "business" ? "Business" : "Personal"}</span></>}</div></div>
        </div>
        <div className={detailStyles.planAmount}><strong>{money(billRow ? billRow.bill.amount : budgetRow!.budget.limit, {cents:true})}</strong>{billRow ? stateChip : <span>Monthly limit</span>}</div>
        <div className={detailStyles.planActions}>
        {billSelection && <WorkbenchActions>
          <WorkbenchAction primary onClick={() => onOperation("edit", billSelection)}>Edit bill</WorkbenchAction>
          {billRow?.bill.status !== "paid" && <WorkbenchAction onClick={() => onOperation("payment", billSelection)}>Record payment</WorkbenchAction>}
          {bill && <a className={detailStyles.inlineAction} href={getModuleViewRoute("finance","accounts")+"?selected="+encodeURIComponent(bill.accountId)}><UnigentamosIcon role="wallet" size={16}/>Open account</a>}
          <WorkbenchAction onClick={() => onOperation("archive", billSelection)}>Archive</WorkbenchAction>
        </WorkbenchActions>}
        {budgetSelection && <WorkbenchActions><WorkbenchAction primary onClick={() => onOperation("edit", budgetSelection)}>Edit budget</WorkbenchAction><WorkbenchAction onClick={() => onOperation("archive", budgetSelection)}>Archive</WorkbenchAction></WorkbenchActions>}
        </div>
      </div> : (
        <ObjectHeader
          headingLevel="h2"
          className={styles.inspectorHeader}
          objectType={accountRow ? "" : objectType}
          title={objectTitle}
          subtitle={subtitle}
          identity={transaction?<FinanceMerchantAvatar kind="transaction" id={transaction.id} label={transaction.merchant}/>:<Icon name={accountRow ? "Wallet" : "Check"} />}
          states={accountRow ? undefined : stateChip}
          metadata={accountRow
            ? stateChip
            : transaction
              ? money(transaction.amount, { sign: true, cents: true })
              : monthlyReviewModel.completion.ratioLabel}
        />
      )}
      actions={<CloseButton onClose={onClose} />}
      showCloseButton={!accountRow}
      footer={accountRow || billRow || budgetRow ? undefined : <div className={styles.inspectorFooter}>
        {transactionSelection && <WorkbenchActions>
          <WorkbenchAction onClick={() => onOperation("edit", transactionSelection)}>Edit transaction</WorkbenchAction>
          <WorkbenchAction primary onClick={() => onOperation("transaction_review", transactionSelection)}>Mark reconciled</WorkbenchAction>
          <WorkbenchAction onClick={() => onOperation("archive", transactionSelection)}>Archive</WorkbenchAction>
        </WorkbenchActions>}
        {closeSelection && <WorkbenchActions><WorkbenchAction onClick={() => onOperation("close_check", closeSelection)}>Update check</WorkbenchAction><WorkbenchAction primary onClick={() => onOperation(closePeriod?.status === "closed" ? "reopen_close" : "complete_close", closeSelection)}>{closePeriod?.status === "closed" ? "Reopen month" : "Complete month"}</WorkbenchAction></WorkbenchActions>}
      </div>}
      className={`${detailStyles.detail} finance-right-rail ${accountRow ? "finance-account-inspector" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}
      ariaLabel={`${objectTitle} Finance inspector`}
      overlay={overlay}
      overlayOpen={overlayOpen}
      onRequestClose={onClose}
    >
      <div className={accountRow ? "finance-account-tabbar" : undefined}><DetailTabs
        id="finance-object-tabs"
        className={styles.inspectorTabs}
        tabs={tabs}
        activeTab={safeTab}
        onTabChange={(tab) => onTabChange(tab as FinanceTab)}
        ariaLabel={`${objectTitle} details`}
      />{accountSelection && <div className="finance-account-tab-actions">{[{op:"edit" as const,icon:"edit",label:"Edit account properties"},{op:"transaction" as const,icon:"plus",label:"Add transaction"},{op:"archive" as const,icon:"archive",label:"Archive account"}].map(action=><button key={action.op} type="button" title={action.label} aria-label={action.label} onClick={()=>onOperation(action.op,accountSelection)} data-icon-button="standard"><UnigentamosIcon role={action.icon} size={18}/></button>)}</div>}</div>

      {transaction && (
        <div className={styles.inspectorPanel}>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="overview" active={safeTab === "overview"} className={styles.inspectorPanel}>
            <FinanceMerchantPanel kind="transaction" id={transaction.id} label={transaction.merchant}/><div className={styles.factGrid}>
              <div><span>Amount</span><strong>{money(transaction.amount, { sign: true, cents: true })}</strong></div>
              <div><span>Status</span><strong>{transaction.status === "cleared" ? "Posted" : transaction.status === "pending" ? "Pending" : transaction.status}</strong></div>
              <div><span>Type</span><strong>{transaction.io === "income" ? "Money in" : transaction.io === "transfer" ? "Transfer" : "Money out"}</strong></div>
              <div><span>Account</span><TransactionAccount id={transaction.accountId} label={transaction.account}/></div>
              <div><span>Category</span><strong>{transaction.category}</strong></div>
              <div><span>Review</span><strong>{transaction.reviewDenied ? "Denied" : transaction.ufInit ? "Approved" : "To review"}</strong></div>
            </div>
            <section className={styles.inspectorSection}>
              <h3>Notes</h3>
              <p>{transaction.memo || "No memo is recorded."}</p>
            </section>
            <section className={styles.inspectorSection}><h3>Recorded from</h3><p>{({ plaid: "Linked bank account", csv_import: "Imported statement", transfer: "Account transfer", manual: "Manual entry" })[financeState.transactions.find(t => t.id === transaction.id)?.source.kind || "manual"]}</p></section>
          </DetailTabPanel>

          <DetailTabPanel tabsId="finance-object-tabs" tabId="properties" active={safeTab === "properties"} className={styles.inspectorPanel}>
            <TransactionProperties transaction={transaction} />
          </DetailTabPanel>

          <DetailTabPanel tabsId="finance-object-tabs" tabId="links" active={safeTab === "links"} className={styles.inspectorPanel}>
            <section className={styles.inspectorSection}>
              <h3>Related records</h3>

              <div className={styles.compactList}>
                <div className={styles.compactRow}><span><small>Account</small><TransactionAccount id={transaction.accountId} label={transaction.account}/></span></div>
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

      {accountRow && <FinanceAccountDetails row={accountRow} state={financeState} tab={safeTab} onOperation={onOperation}/> }

      {billRow && (
        <div className={styles.inspectorPanel}>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="overview" active={safeTab === "overview"} className={styles.inspectorPanel}>
            <div className={styles.factGrid}>
              <div><span>Repeats</span><strong>{billRow.bill.recurring || "One-time"}</strong></div>
              <div><span>Autopay</span><strong>{billRow.bill.evidence && !billRow.bill.autopayConfirmed ? "Not confirmed" : billRow.bill.autopay ? "On" : "Off"}</strong></div>
              <div><span>Category</span><strong>{billRow.bill.category}</strong></div>
              {billRow.bill.recurring && billRow.bill.recurring !== "monthly" && <div><span>Monthly equivalent</span><strong>{money(billRow.monthlyEquivalent,{cents:true})}</strong></div>}
            </div>
            <FinanceMerchantPanel kind="bill" id={billRow.bill.id} label={billRow.bill.name}/>
            <section className={detailStyles.merchantPanel}>
              <h3><UnigentamosIcon role="sliders" size={17}/>Related rules</h3>
              {billRules.length ? billRules.map(rule => <a key={rule.id} href={getModuleViewRoute("finance","rules")+"?selected="+encodeURIComponent(rule.id)}>{rule.name}<UnigentamosIcon role="chevron-right" size={15}/></a>) : <small>No related rules.</small>}
            </section>
            <section className={detailStyles.merchantPanel}>
              <h3><UnigentamosIcon role="review" size={17}/>Monthly review</h3>
              <small>{billReview ? billReview.period + " · " + (billReview.status === "closed" ? "Closed" : "Open") : "No review for this bill’s month."}</small>
              {billReview && monthlyReviewModel.rows.some(row => billReview.checks.some(check => check.id === row.item.id)) &&
                <a className={detailStyles.inlineAction} href={getModuleViewRoute("finance","review")}>Open monthly review</a>}
            </section>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="payments" active={safeTab === "payments"} className={styles.inspectorPanel}>
            <section className={styles.inspectorSection}><h3>Payment history</h3>
              {bill?.paidAt && <p>Marked paid on {overviewDate(bill.paidAt.slice(0,10))}.{bill.paymentExceptionReason && " " + bill.paymentExceptionReason} {bill.paymentEvidenceRef && <a href={bill.paymentEvidenceRef.route}>{bill.paymentEvidenceRef.label}</a>}</p>}
              {bill?.evidence && <p>We estimated this bill from earlier payments to {objectTitle}. You can adjust its amount or next due date.</p>}
              {!relatedPayments.length && !bill?.paidAt && <p>No payments recorded yet.</p>}
              <div className={detailStyles.paymentList}>{relatedPayments.map(t => <a key={t.id} href={getModuleViewRoute("finance","transactions")+"?selected="+encodeURIComponent(t.id)}>
                <span><FinanceMerchantAvatar kind="transaction" id={t.id} label={t.merchant}/><strong>{t.merchant}</strong></span>
                <time dateTime={t.occurredOn}>{overviewDate(t.occurredOn)}{t.archivedAt && " · Archived"}</time>
                <strong>{money(t.amount,{cents:true})}</strong>
              </a>)}</div>
              <a className={detailStyles.inlineAction} href={getModuleViewRoute("finance","transactions")+"?query="+encodeURIComponent(objectTitle)}><UnigentamosIcon role="search" size={16}/>Find transactions</a>
            </section>
            {nativeAuditEvents.some(e => e.action.includes("paid")) && <AuditTimeline events={nativeAuditEvents.filter(e => e.action.includes("paid"))}/>}
          </DetailTabPanel>
        </div>
      )}

      {budgetRow && budget && (
        <div className={styles.inspectorPanel}>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="overview" active={safeTab === "overview"} className={styles.inspectorPanel}>
            <section className={styles.inspectorSection}>
              <h3>Monthly spending</h3>
              <div className={styles.factGrid}><div><span>Spent</span><strong>{money(budgetRow.budget.spent,{cents:true})}</strong></div><div><span>{budgetRow.remaining < 0 ? "Over budget" : "Remaining"}</span><strong>{money(Math.abs(budgetRow.remaining),{cents:true})}</strong></div></div>
              {budgetRow.usedPercent !== null && <progress className={detailStyles.budgetMeter} aria-label="Budget used" value={Math.min(100,budgetRow.usedPercent)} max={100}/>}
            </section>
            {budget.evidence && <section className={styles.inspectorSection}><h3>{budget.evidence.automatic ? "Auto-created budget" : "From your spending history"}</h3><p>{budget.evidence.basis}</p></section>}
            <LinkedDecisionsPanel source={budgetDecisionSource!} decisions={decisions} loading={decisionsLoading} error={decisionsError} onRefresh={onRefreshDecisions} createHref={buildDecisionCreationRoute(budgetDecisionSource!)} compact title="Budget decisions"/>
            <div className={detailStyles.relatedLinks}><a href={getModuleViewRoute("finance","bills")+"?query="+encodeURIComponent(budget.category)}>Find related bills</a><a href={getModuleViewRoute("finance","rules")+"?filter=budget-rules"}>Budget rules</a></div>
          </DetailTabPanel>
          <DetailTabPanel tabsId="finance-object-tabs" tabId="transactions" active={safeTab === "transactions"} className={styles.inspectorPanel}>
            <section className={styles.inspectorSection}><h3>Spending in {periodLabel}</h3>{!budgetSpending.length && <p>No spending recorded for this category yet.</p>}
              <div className={styles.compactList}>{budgetSpending.map(t => <a key={t.id} className={styles.compactRow} href={getModuleViewRoute("finance","transactions")+"?selected="+encodeURIComponent(t.id)}><span><strong>{t.merchant}</strong><small>{overviewDate(t.occurredOn)} · {t.status === "cleared" ? "Posted" : "Pending"}</small></span><strong>{money(t.amount,{cents:true})}</strong></a>)}</div>
            </section>
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
            <div className={styles.boundary}><strong>Finance retains close ownership</strong><span>Personal owns the durable Decision. Filing one does not resolve this checklist item unless Finance explicitly records the check outcome.</span></div>
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
