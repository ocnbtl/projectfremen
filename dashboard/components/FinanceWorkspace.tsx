"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import FinanceOverviewView from "./finance/FinanceOverviewView";
import FinanceUtilityRail, { type FinanceUtility } from "./finance/FinanceUtilityRail";
import { HUES } from "./finance/FinancePrimitives";
import ModuleShell from "./admin-shell/ModuleShell";
import ModuleSidebar from "./admin-shell/ModuleSidebar";
import SharedAIDock from "./admin-shell/SharedAIDock";
import FinanceAccountsRouteView from "./finance/FinanceAccountsView";
import FinanceBillsRouteView from "./finance/FinanceBillsView";
import FinanceBudgetsRouteView from "./finance/FinanceBudgetsView";
import FinanceInspector, { isFinanceInspectableView, isFinanceTabAllowed } from "./finance/FinanceInspector";
import { usePersonalOpsDecisions } from "./operational/usePersonalOpsDecisions";
import type { PersonalOpsDecision } from "../lib/modules/personal-ops/types";
import FinanceMonthlyReviewRouteView from "./finance/FinanceMonthlyReviewView";
import FinanceRulesInspector, { isFinanceRuleTab } from "./finance/FinanceRulesInspector";
import FinanceRulesRouteView from "./finance/FinanceRulesView";
import FinanceTransactionsRouteView from "./finance/FinanceTransactionsView";
import FinanceMutationDialog, { activeCloseForState, type FinanceOperation } from "./finance/FinanceMutationDialog";
import UnigentamosIcon from "./icons/UnigentamosIcon";
import {
  createNativeObjectRef,
  getModuleRoute,
  getModuleViewRoute,
  getNativeObjectRoute
} from "../lib/native-objects/routes";
import { normalizeFinanceUrlStateForView, parseFinanceUrlState, serializeFinanceUrlState } from "../lib/native-objects/url-state";
import type { FinanceFilter, FinanceSort, FinanceTab, FinanceView } from "../lib/native-objects/url-state";
import { buildFinanceAccountsViewModel } from "../lib/modules/finance/accounts-view-model";
import { buildFinanceBillsViewModel } from "../lib/modules/finance/bills-view-model";
import { buildFinanceBudgetsViewModel } from "../lib/modules/finance/budgets-view-model";
import { buildFinanceMonthlyReviewViewModel } from "../lib/modules/finance/monthly-review-view-model";
import { financeStateToDataset, financeStateToRulesDataset } from "../lib/modules/finance/native-view-model";
import type { FinanceRecordKind, FinanceState } from "../lib/modules/finance/native-types";
import { createFinanceRepository } from "../lib/modules/finance/repository";
import {
  buildFinanceRulesViewModel,
  runFinanceRuleTests,
  type FinanceRuleTestRun
} from "../lib/modules/finance/rules-view-model";
import { buildFinanceTransactionsViewModel } from "../lib/modules/finance/transactions-view-model";
import {
  buildFinanceViewModel,
  getFinanceSmartViewCount,
  getFinanceViewBadge
} from "../lib/modules/finance/view-model";
import type {
  FinanceAccount as Account,
  FinanceAccountKind as AccountKind,
  FinanceBillStatus,
  FinanceHue as Hue,
  FinanceDataset,
  FinanceTransaction as Txn
} from "../lib/modules/finance/types";

type ViewId = FinanceView;
type ModalKind = "record" | "filter" | "account" | "category" | "bill" | "columns" | "pay" | "transfer" | "group" | "period" | null;

const VIEWS: Array<{ id: ViewId; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "view-grid" },
  { id: "accounts", label: "Accounts", icon: "wallet" },
  { id: "transactions", label: "Transactions", icon: "banknote" },
  { id: "budgets", label: "Budgets", icon: "piggy-bank" },
  { id: "bills", label: "Bills & subscriptions", icon: "calendar" },
  { id: "review", label: "Monthly review", icon: "review" },
  { id: "rules", label: "Rules & automation", icon: "sliders" }
];

const SMART_VIEWS: Array<{ id: FinanceFilter; label: string; icon: string; hue: Hue; view: ViewId }> = [
  { id: "attention", label: "Needs attention", icon: "alert", hue: "brown", view: "overview" },
  { id: "due-week", label: "Due this week", icon: "week", hue: "brown", view: "bills" },
  { id: "unreviewed", label: "Unreviewed", icon: "check", hue: "brown", view: "transactions" },
  { id: "recurring", label: "Recurring", icon: "routine", hue: "green", view: "bills" }
];

function hueStyle(hue: Hue) {
  const value = HUES[hue];
  return {
    "--finance-hue-fg": value.fg,
    "--finance-hue-tint": value.tint,
    "--finance-hue-border": value.border,
    "--finance-hue-solid": value.solid
  } as React.CSSProperties;
}

function money(value: number, options: { cents?: boolean; sign?: boolean } = {}) {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: options.cents ? 2 : 0,
    maximumFractionDigits: options.cents ? 2 : 0
  }).format(abs);
  if (options.sign) return `${value >= 0 ? "+" : "-"}${formatted}`;
  return `${value < 0 ? "-" : ""}${formatted}`;
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Icon({ name }: { name: string }) {
  const roles: Record<string, string> = {
    Wallet: "wallet", PiggyBank: "piggy-bank", CreditCard: "credit-card", LineChart: "line-chart",
    Banknote: "banknote", Briefcase: "briefcase", Alert: "alert", Trending: "trending",
    Calendar: "calendar", Filter: "filter", Plus: "plus", Search: "search", Sliders: "sliders",
    Check: "check", Link: "link", Sparkles: "sparkles", Send: "send", X: "close", Chevron: "chevron-down"
  };
  return <UnigentamosIcon role={roles[name] || "wallet"} />;
}

function Swatch({ hue }: { hue: Hue }) {
  return <span className="finance-swatch" style={hueStyle(hue)} aria-hidden="true" />;
}

function Chip({ hue, children, solid = false, dot = false }: { hue: Hue; children: React.ReactNode; solid?: boolean; dot?: boolean }) {
  return (
    <span className={classNames("finance-chip", solid && "is-solid", dot && "has-dot")} style={hueStyle(hue)}>
      {dot && <Swatch hue={hue} />}
      {children}
    </span>
  );
}

function IconTile({ hue, icon, small = false }: { hue: Hue; icon: string; small?: boolean }) {
  return (
    <span className={classNames("finance-icon-tile", small && "is-small")} style={hueStyle(hue)}>
      <Icon name={icon} />
    </span>
  );
}

function Panel({
  hue,
  children,
  className = ""
}: {
  hue?: Hue;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={classNames("finance-panel", hue && "has-accent", className)} style={hue ? hueStyle(hue) : undefined}>
      {children}
    </section>
  );
}

function HeaderAction({
  children,
  icon,
  primary = false,
  onClick,
  disabled = false,
  title
}: {
  children: React.ReactNode;
  icon: string;
  primary?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={classNames("finance-action", primary && "is-primary")}
      onClick={() => {
        if (!disabled) onClick?.();
      }}
      aria-disabled={disabled || undefined}
      title={title}
      style={disabled ? { borderColor: "#dedee2", background: "#f4f4f5", color: "#71717a", cursor: "not-allowed" } : undefined}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}

function ArchivedFinanceRecords({ state, onRestore }: {
  state: FinanceState;
  onRestore: (selection: { kind: FinanceRecordKind; id: string }) => void;
}) {
  const archived = [
    ...state.accounts.filter((item) => item.archivedAt).map((item) => ({ kind: "account" as const, id: item.id, label: item.name })),
    ...state.transactions.filter((item) => item.archivedAt).map((item) => ({ kind: "transaction" as const, id: item.id, label: item.merchant })),
    ...state.transfers.filter((item) => item.archivedAt).map((item) => ({ kind: "transfer" as const, id: item.id, label: `Transfer ${money(item.amount, { cents: true })}` })),
    ...state.savingsMovements.filter((item) => item.archivedAt).map((item) => ({ kind: "savings_movement" as const, id: item.id, label: `Savings ${money(item.amount, { cents: true })}` })),
    ...state.bills.filter((item) => item.archivedAt).map((item) => ({ kind: "bill" as const, id: item.id, label: item.name })),
    ...state.budgets.filter((item) => item.archivedAt).map((item) => ({ kind: "budget" as const, id: item.id, label: `${item.period} ${item.category}` })),
    ...state.closePeriods.filter((item) => item.archivedAt).map((item) => ({ kind: "close_period" as const, id: item.id, label: `${item.period} close` })),
    ...state.rules.filter((item) => item.archivedAt).map((item) => ({ kind: "rule" as const, id: item.id, label: item.name }))
  ];
  if (!archived.length) return null;
  return <section className="finance-archived-records" aria-label="Archived Finance records">
    <strong>Archived</strong>
    <span>{archived.length} record{archived.length === 1 ? "" : "s"}</span>
    {archived.slice(0, 6).map((item) => <button key={`${item.kind}:${item.id}`} type="button" onClick={() => onRestore(item)}>{item.label} · restore</button>)}
    {archived.length > 6 && <small>{archived.length - 6} more retained in the Finance store.</small>}
  </section>;
}

function FinanceSidebar({ smartCounts, view, smartFilter, onSmart, onUtility, onImport, mobileOpen, onClose }: {
  smartCounts: Readonly<Record<string, number>>; view: ViewId; smartFilter: string;
  onSmart: (id: string) => void; onUtility: (utility: FinanceUtility) => void; onImport: () => void;
  mobileOpen: boolean; onClose: () => void;
}) {
  return <ModuleSidebar id="finance-module-sidebar" title="Finance" ariaLabel="Finance sidebar" className="finance-module-sidebar" mobileOpen={mobileOpen} onClose={onClose}
    sections={[
      { id: "finance-views", items: VIEWS.map(item => ({ id: item.id, label: item.label, icon: <UnigentamosIcon role={item.icon} />, active: view === item.id && !smartFilter, href: getModuleViewRoute("finance", item.id) })) },
      { id: "finance-smart-views", label: "Smart views", items: SMART_VIEWS.map(item => ({ id: item.id, label: item.label, icon: <UnigentamosIcon role={item.icon} />, count: smartCounts[item.id] || 0, active: smartFilter === item.id, onSelect: () => onSmart(item.id) })) }
    ]}
    footer={<div className="finance-sidebar-utilities" aria-label="Finance data tools">
      {[{ id: "data", label: "Accounts data", icon: "contact-file" }, { id: "categories", label: "Categories", icon: "list" }, { id: "import", label: "Import", icon: "import" }, { id: "settings", label: "Settings", icon: "sliders" }].map(item => <button key={item.id} type="button" aria-label={item.label} title={item.label} onClick={() => { onClose(); if (item.id === "import") onImport(); else onUtility(item.id as FinanceUtility); }}><UnigentamosIcon role={item.icon} /><span className="finance-utility-tooltip">{item.label}</span></button>)}
    </div>}
  />;
}

function NativeActionBar({
  view,
  hasSelection,
  hasAccounts,
  closeStatus,
  onOperation
}: {
  view: ViewId;
  hasSelection: boolean;
  hasAccounts: boolean;
  closeStatus: "none" | "open" | "closed";
  onOperation: (operation: FinanceOperation) => void;
}) {
  const actions: React.ReactNode[] = [];
  if (view === "overview") actions.push(
    <HeaderAction key="account" icon="Plus" onClick={() => onOperation("account")}>Add account</HeaderAction>,
    <HeaderAction key="transaction" icon="Plus" primary disabled={!hasAccounts} title={!hasAccounts ? "Add an account first" : undefined} onClick={() => onOperation("transaction")}>Record transaction</HeaderAction>
  );
  if (view === "accounts") actions.push(
    <HeaderAction key="account" icon="Plus" onClick={() => onOperation("account")}>Add account</HeaderAction>,
    <HeaderAction key="import" icon="Link" primary disabled={!hasAccounts} onClick={() => onOperation("import")}>Import CSV</HeaderAction>
  );
  if (view === "transactions") actions.push(
    <HeaderAction key="transaction" icon="Plus" primary disabled={!hasAccounts} onClick={() => onOperation("transaction")}>Record</HeaderAction>,
    <HeaderAction key="import" icon="Link" disabled={!hasAccounts} onClick={() => onOperation("import")}>Import CSV</HeaderAction>
  );
  if (view === "bills") actions.push(
    <HeaderAction key="bill" icon="Plus" primary disabled={!hasAccounts} onClick={() => onOperation("bill")}>Add bill</HeaderAction>
  );
  if (view === "budgets") actions.push(<HeaderAction key="budget" icon="Plus" primary onClick={() => onOperation("budget")}>New budget</HeaderAction>);
  if (view === "review") {
    if (closeStatus === "none") actions.push(<HeaderAction key="close" icon="Plus" primary onClick={() => onOperation("close")}>Start close</HeaderAction>);
    if (closeStatus === "open") actions.push(
      <HeaderAction key="check" icon="Check" disabled={!hasSelection} title={!hasSelection ? "Select a close check first." : undefined} onClick={() => onOperation("close_check")}>Resolve check</HeaderAction>,
      <HeaderAction key="complete" icon="Check" primary onClick={() => onOperation("complete_close")}>Complete close</HeaderAction>
    );
    if (closeStatus === "closed") actions.push(<HeaderAction key="reopen" icon="Calendar" onClick={() => onOperation("reopen_close")}>Reopen close</HeaderAction>);
  }
  if (view === "rules") actions.push(<HeaderAction key="rule" icon="Plus" primary onClick={() => onOperation("rule")}>New rule</HeaderAction>);
  if (hasSelection && view === "rules") actions.push(
    <HeaderAction key="archive" icon="X" onClick={() => onOperation("archive")}>Archive selected</HeaderAction>
  );
  if (!actions.length) return null;
  return <section className="finance-native-action-bar" aria-label="Finance actions">{actions}</section>;
}

function ModalShell({ modal, onClose }: { modal: ModalKind; onClose: () => void }) {
  const modalRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!modal || !modalRef.current) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(
      modalRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
      ) || []
    );
    controls()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = controls();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [modal]);
  if (!modal) return null;
  const content: Record<Exclude<ModalKind, null>, { title: string; body: string; fields: string[] }> = {
    record: { title: "Record a transaction", body: "Add the transaction details here. Your form stays in place if saving fails, so you can retry.", fields: ["Type", "Amount", "Linked context"] },
    filter: { title: "Finance filters", body: "Search your records by status, account, or category. Your filter choices stay in the page link.", fields: ["Status", "Account", "Category"] },
    account: { title: "Add an account", body: "Use Add account to keep an account record. An account name or display mask does not connect a bank.", fields: ["Account name", "Institution", "Type"] },
    category: { title: "Create a budget", body: "Use New budget to create a category cap for a specific month and entity scope.", fields: ["Category", "Monthly cap", "Period"] },
    bill: { title: "Add a bill", body: "Use Add bill to create a persistent obligation without executing payment.", fields: ["Vendor", "Amount", "Due date"] },
    columns: { title: "Transaction columns", body: "Core transaction columns are fixed in this version; filter and selection state is preserved in the URL.", fields: ["Date", "Category", "Evidence"] },
    pay: { title: "Record an observed payment", body: "Use Record payment on a selected bill. Finance records evidence or an explicit exception and never sends money.", fields: ["Bill", "Evidence", "Exception"] },
    transfer: { title: "Record a paired transfer", body: "Use Record transfer. Paired rows remain excluded from income and spending.", fields: ["From", "To", "Amount"] },
    group: { title: "Account grouping", body: "Accounts remain grouped by current role. Immutable account IDs preserve links when names or display masks change.", fields: ["Current grouping", "Entity scope", "Account type"] },
    period: { title: "Budget period", body: "Budgets are stored by YYYY-MM period. MTD and EOM are supported without invented forecasts.", fields: ["Current period", "Entity scope", "Variance"] }
  };
  const item = content[modal];
  return (
    <div className="finance-modal-backdrop" role="presentation">
      <section ref={modalRef} className="finance-modal" role="dialog" aria-modal="true" aria-label={item.title}>
        <button type="button" className="finance-rail-close" onClick={onClose} aria-label="Close modal"><Icon name="X" /></button>
        <h2>{item.title}</h2>
        <p>{item.body}</p>
        <div>
          {item.fields.map((field) => <label key={field}>{field}<input placeholder={field} disabled aria-describedby="finance-preview-status" /></label>)}
        </div>
        <button type="button" className="finance-action" onClick={onClose}>Close preview</button>
      </section>
    </div>
  );
}

export default function FinanceWorkspace({
  initialView,
  initialFinanceState,
  initialFinanceError = "",
  initialPersonalOpsDecisions = [],
  initialDecisionsError = ""
}: {
  initialView?: FinanceView;
  initialFinanceState: FinanceState;
  initialFinanceError?: string;
  initialPersonalOpsDecisions?: PersonalOpsDecision[];
  initialDecisionsError?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    decisions,
    error: decisionsError,
    loading: decisionsLoading,
    refresh: refreshDecisions
  } = usePersonalOpsDecisions(initialPersonalOpsDecisions, initialDecisionsError);
  const [financeState, setFinanceState] = useState(initialFinanceState);
  const [financeError, setFinanceError] = useState(initialFinanceError);
  const [operation, setOperation] = useState<FinanceOperation | null>(null);
  const [operationTarget, setOperationTarget] = useState<{ kind: FinanceRecordKind; id: string } | null>(null);
  const financeRepository = useRef(createFinanceRepository()).current;
  const financeDataset = useMemo(() => financeStateToDataset(financeState), [financeState]);
  const financeRulesDataset = useMemo(() => financeStateToRulesDataset(financeState), [financeState]);
  const financeViewModel = useMemo(() => buildFinanceViewModel(financeDataset), [financeDataset]);
  const { accounts, budgets, bills, transactions, reminders, linkedContext, snapshot } = financeDataset;
  const parsedInitialUrlState = parseFinanceUrlState(searchParams);
  const routedInitialView = initialView || parsedInitialUrlState.view;
  const initialUrlState = normalizeFinanceUrlStateForView(routedInitialView, parsedInitialUrlState);
  const [view, setView] = useState<ViewId>(routedInitialView);
  const [selectedAccountId, setSelectedAccountId] = useState(
    routedInitialView === "accounts" || routedInitialView === "overview" ? initialUrlState.selected : ""
  );
  const [selectedTxnId, setSelectedTxnId] = useState(routedInitialView === "transactions" ? initialUrlState.selected : "");
  const [selectedSecondaryId, setSelectedSecondaryId] = useState(
    routedInitialView === "bills" || routedInitialView === "budgets" || routedInitialView === "review" || routedInitialView === "rules"
      ? initialUrlState.selected
      : ""
  );
  const [checkedTxnIds, setCheckedTxnIds] = useState<ReadonlySet<string>>(() => new Set());
  const [modal, setModal] = useState<ModalKind>(null);
  const [notice, setNotice] = useState("");
  const [smartFilter, setSmartFilter] = useState<FinanceFilter>(initialUrlState.filter);
  const [sort, setSort] = useState<FinanceSort>(initialUrlState.sort);
  const [tab, setTab] = useState<FinanceTab>(initialUrlState.tab);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorDismissed, setInspectorDismissed] = useState(false);
  const [utility, setUtility] = useState<FinanceUtility | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("oauth_state_id")) setUtility("settings");
  }, []);
  const [query, setQuery] = useState(initialUrlState.query);
  const [aiOpen, setAiOpen] = useState(initialUrlState.ai);
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const [ruleTestRuns, setRuleTestRuns] = useState<Readonly<Record<string, FinanceRuleTestRun>>>({});
  const smartCounts = useMemo(() => Object.fromEntries(SMART_VIEWS.map((item) => [item.id, getFinanceSmartViewCount(financeViewModel, item.id)])), [financeViewModel]);
  const searchParamKey = searchParams.toString();
  const accountsModel = buildFinanceAccountsViewModel(financeDataset, {
    query: view === "accounts" ? query : "",
    sort,
    selectedId: selectedAccountId
  });
  const transactionsModel = buildFinanceTransactionsViewModel(financeDataset, {
    query: view === "transactions" ? query : "",
    filter: smartFilter === "unreviewed" ? "unreviewed" : "all",
    sort,
    selectedId: selectedTxnId
  });
  const billsModel = buildFinanceBillsViewModel(financeDataset, {
    query: view === "bills" ? query : "",
    filter: smartFilter === "due-week" ? "due-this-week" : smartFilter === "recurring" ? "recurring" : "all",
    sort,
    selectedId: selectedSecondaryId
  });
  const budgetsModel = buildFinanceBudgetsViewModel(financeDataset, {
    query: view === "budgets" ? query : "",
    filter: smartFilter === "over-budget" ? "over-budget" : "all",
    sort,
    selectedId: selectedSecondaryId
  });
  const monthlyReviewModel = buildFinanceMonthlyReviewViewModel(financeDataset, {
    query: view === "review" ? query : "",
    filter: smartFilter === "incomplete" ? "open" : "all",
    sort,
    selectedId: selectedSecondaryId
  });
  const rulesModel = buildFinanceRulesViewModel(financeRulesDataset, {
    query: view === "rules" ? query : "",
    filter: view === "rules" ? smartFilter : "",
    sort,
    selectedId: selectedSecondaryId
  });
  const selectedAccount = accounts.find((account) => account.id === accountsModel.selectedId) || null;
  const activeClose = activeCloseForState(financeState);
  const operationSelection = view === "accounts" && accountsModel.selectedId
    ? { kind: "account" as const, id: accountsModel.selectedId }
    : view === "transactions" && transactionsModel.selectedId
      ? { kind: "transaction" as const, id: transactionsModel.selectedId }
      : view === "bills" && billsModel.selectedId
        ? { kind: "bill" as const, id: billsModel.selectedId }
        : view === "budgets" && budgetsModel.selectedId
          ? { kind: "budget" as const, id: budgetsModel.selectedId }
          : view === "review" && activeClose
            ? { kind: "close_period" as const, id: activeClose.id }
            : view === "rules" && rulesModel.selectedId
              ? { kind: "rule" as const, id: rulesModel.selectedId }
              : null;
  const hasRouteSelection = view === "review"
    ? Boolean(monthlyReviewModel.selectedId)
    : Boolean(operationSelection);

  useEffect(() => { setUtility(null); }, [pathname]);

  useEffect(() => {
    const parsed = parseFinanceUrlState(searchParams);
    const nextView = initialView || parsed.view;
    const next = normalizeFinanceUrlStateForView(nextView, parsed);
    setView(nextView);
    setSmartFilter(next.filter);
    setSort(next.sort);
    setQuery(next.query);
    setAiOpen(next.ai);
    setTab(
      nextView === "rules"
        ? isFinanceRuleTab(next.tab) ? next.tab : "overview"
        : isFinanceInspectableView(nextView) && isFinanceTabAllowed(nextView, next.tab)
          ? next.tab
          : "overview"
    );
    setInspectorDismissed((current) => current && !next.selected);
    if (nextView === "overview" || nextView === "accounts") {
      setSelectedAccountId(next.selected);
    } else {
      setSelectedAccountId("");
    }
    if (nextView === "transactions") {
      setSelectedTxnId(next.selected);
    } else {
      setSelectedTxnId("");
    }
    if (nextView === "bills" || nextView === "budgets" || nextView === "review" || nextView === "rules") {
      setSelectedSecondaryId(next.selected);
    } else {
      setSelectedSecondaryId("");
    }
    setCheckedTxnIds(new Set());
    setInspectorOpen(Boolean(next.selected && ["accounts", "transactions", "bills", "budgets", "review", "rules"].includes(nextView)));
    const canonicalParams = serializeFinanceUrlState(next, searchParams);
    if (initialView) canonicalParams.delete("view");
    if (canonicalParams.toString() !== searchParams.toString()) {
      window.history.replaceState(
        window.history.state,
        "",
        `${pathname}${canonicalParams.size ? `?${canonicalParams.toString()}` : ""}`
      );
    }
  }, [initialView, pathname, searchParamKey, searchParams]);

  useEffect(() => {
    if (inspectorDismissed || !["accounts", "transactions", "bills", "budgets", "review", "rules"].includes(view)) return;
    const resolvedSelectedId = view === "accounts"
      ? accountsModel.selectedId || ""
      : view === "transactions"
        ? transactionsModel.selectedId || ""
        : view === "bills"
          ? billsModel.selectedId || ""
          : view === "budgets"
            ? budgetsModel.selectedId || ""
            : view === "review"
              ? monthlyReviewModel.selectedId || ""
              : rulesModel.selectedId || "";
    const currentSelectedId = view === "accounts"
      ? selectedAccountId
      : view === "transactions"
        ? selectedTxnId
        : selectedSecondaryId;
    if (currentSelectedId === resolvedSelectedId) return;
    const selectionBecameHidden = Boolean(currentSelectedId && !resolvedSelectedId);
    if (selectionBecameHidden) {
      setInspectorDismissed(true);
      setInspectorOpen(false);
      setTab("overview");
    }
    if (view === "accounts") setSelectedAccountId(resolvedSelectedId);
    else if (view === "transactions") setSelectedTxnId(resolvedSelectedId);
    else setSelectedSecondaryId(resolvedSelectedId);
    const params = serializeFinanceUrlState(
      {
        view,
        filter: smartFilter,
        sort,
        query,
        selected: resolvedSelectedId,
        tab: selectionBecameHidden ? "overview" : tab,
        ai: aiOpen
      },
      searchParams
    );
    if (initialView) params.delete("view");
    window.history.replaceState(window.history.state, "", `${pathname}${params.size ? `?${params.toString()}` : ""}`);
  }, [
    accountsModel.selectedId,
    aiOpen,
    initialView,
    inspectorDismissed,
    pathname,
    billsModel.selectedId,
    budgetsModel.selectedId,
    monthlyReviewModel.selectedId,
    rulesModel.selectedId,
    query,
    searchParams,
    selectedAccountId,
    selectedSecondaryId,
    selectedTxnId,
    smartFilter,
    sort,
    tab,
    transactionsModel.selectedId,
    view
  ]);

  function buildFinanceDestination(partial: Partial<ReturnType<typeof parseFinanceUrlState>>) {
    const selectedId = view === "transactions"
      ? transactionsModel.selectedId || ""
      : view === "accounts" || view === "overview"
        ? accountsModel.selectedId || ""
        : view === "bills"
          ? billsModel.selectedId || ""
          : view === "budgets"
            ? budgetsModel.selectedId || ""
            : view === "review"
              ? monthlyReviewModel.selectedId || ""
              : view === "rules"
                ? rulesModel.selectedId || ""
                : "";
    const nextView = partial.view || view;
    const normalizedState = normalizeFinanceUrlStateForView(
      nextView,
      {
        view: nextView,
        filter: smartFilter,
        sort,
        query,
        selected: selectedId,
        tab,
        ai: aiOpen,
        ...partial
      }
    );
    const params = serializeFinanceUrlState(
      normalizedState,
      searchParams
    );
    params.delete("view");
    const destinationPath = getModuleViewRoute("finance", nextView);
    return `${destinationPath}${params.size ? `?${params.toString()}` : ""}`;
  }

  function updateFinanceUrl(
    partial: Partial<ReturnType<typeof parseFinanceUrlState>>,
    options: { history?: "push" | "replace"; native?: boolean } = {}
  ) {
    const destination = buildFinanceDestination(partial);
    if (options.native) {
      window.history.replaceState(window.history.state, "", destination);
      return;
    }
    if (options.history === "push") router.push(destination, { scroll: false });
    else router.replace(destination, { scroll: false });
  }

  function navigateView(next: ViewId) {
    setUtility(null);
    setView(next);
    setSmartFilter("");
    setSort("default");
    setTab("overview");
    setQuery("");
    setSelectedAccountId("");
    setSelectedTxnId("");
    setSelectedSecondaryId("");
    setCheckedTxnIds(new Set());
    setInspectorDismissed(false);
    setInspectorOpen(false);
    setNotice("");
    updateFinanceUrl({ view: next, filter: "", sort: "default", query: "", selected: "", tab: "overview" }, { history: "push" });
  }

  function navigateToSelected(
    next: "transactions" | "bills" | "budgets",
    selectedId: string
  ) {
    setUtility(null);
    setView(next);
    setSmartFilter("");
    setSort("default");
    setTab("overview");
    setQuery("");
    setSelectedAccountId("");
    setSelectedTxnId(next === "transactions" ? selectedId : "");
    setSelectedSecondaryId(next === "transactions" ? "" : selectedId);
    setCheckedTxnIds(new Set());
    setInspectorDismissed(false);
    setInspectorOpen(true);
    setNotice("");
    updateFinanceUrl(
      { view: next, filter: "", sort: "default", query: "", selected: selectedId, tab: "overview" },
      { history: "push" }
    );
  }

  function selectAccount(account: Account) {
    setUtility(null);
    if (view === "overview") {
      setView("accounts");
      setSmartFilter("");
      setSort("default");
      setQuery("");
      setSelectedTxnId("");
      setSelectedSecondaryId("");
      setCheckedTxnIds(new Set());
    }
    setSelectedAccountId(account.id);
    setTab("overview");
    setInspectorDismissed(false);
    setInspectorOpen(true);
    updateFinanceUrl(
      view === "overview"
        ? { view: "accounts", filter: "", sort: "default", query: "", selected: account.id, tab: "overview" }
        : { selected: account.id, tab: "overview" },
      { history: "push" }
    );
  }

  function selectTransaction(id: string) {
    setUtility(null);
    setSelectedTxnId(id);
    setTab("overview");
    setInspectorDismissed(false);
    setInspectorOpen(true);
    updateFinanceUrl({ selected: id, tab: "overview" }, { history: "push" });
  }

  function selectSecondary(id: string) {
    setUtility(null);
    setSelectedSecondaryId(id);
    setTab("overview");
    setInspectorDismissed(false);
    setInspectorOpen(true);
    updateFinanceUrl({ selected: id, tab: "overview" }, { history: "push" });
  }

  const showRail = !utility && !aiOpen
    && !inspectorDismissed
    && (
      (view === "accounts" && Boolean(accountsModel.selected))
      || (view === "transactions" && Boolean(transactionsModel.selected))
      || (view === "bills" && Boolean(billsModel.selected))
      || (view === "budgets" && Boolean(budgetsModel.selected))
      || (view === "review" && Boolean(monthlyReviewModel.selected))
      || (view === "rules" && Boolean(rulesModel.selected))
    );
  const showContext = !aiOpen && Boolean(utility);
  const activeSmart = useMemo(() => SMART_VIEWS.find((item) => item.id === smartFilter), [smartFilter]);
  const activeView = VIEWS.find((item) => item.id === view) || VIEWS[0];
  const selectedTransaction = view === "transactions" ? transactionsModel.selected || undefined : undefined;
  const selectedSecondary = view === "bills"
    ? { objectType: "bill", objectId: billsModel.selectedId || view, label: billsModel.selected?.bill.name || activeView.label }
    : view === "budgets"
      ? { objectType: "budget", objectId: budgetsModel.selectedId || view, label: budgetsModel.selected?.budget.category || activeView.label }
    : view === "review"
        ? { objectType: "finance_close_check", objectId: monthlyReviewModel.selectedId || view, label: monthlyReviewModel.selected?.item.label || activeView.label }
      : view === "rules"
        ? { objectType: "finance_rule", objectId: rulesModel.selectedId || view, label: rulesModel.selected?.name || activeView.label }
        : null;
  const aiObject = createNativeObjectRef({
    module: "finance",
    objectType: selectedAccount && view === "accounts" ? "account" : selectedTransaction ? "transaction" : selectedSecondary?.objectType || "finance_view",
    objectId: selectedAccount && view === "accounts" ? selectedAccount.id : selectedTransaction?.id || selectedSecondary?.objectId || view,
    label: selectedAccount && view === "accounts" ? selectedAccount.name : selectedTransaction?.merchant || selectedSecondary?.label || activeView.label
  });

  function handleSmart(id: string) {
    const smart = SMART_VIEWS.find((item) => item.id === id);
    if (smart) {
      const nextFilter = smart.id;
      setSmartFilter(nextFilter);
      setUtility(null);
      setView(smart.view);
      setSort("default");
      setTab("overview");
      setQuery("");
      setSelectedAccountId("");
      setSelectedTxnId("");
      setSelectedSecondaryId("");
      setCheckedTxnIds(new Set());
      setInspectorDismissed(false);
      setInspectorOpen(false);
      setNotice("");
      updateFinanceUrl({ view: smart.view, filter: nextFilter, sort: "default", query: "", selected: "", tab: "overview" }, { history: "push" });
      return;
    }
    const reminder = reminders.find((item) => item.id === id);
    setNotice(reminder ? `${reminder.text} opened as a follow-up shell.` : "");
  }

  function closeInspector() {
    setUtility(null);
    setInspectorDismissed(true);
    if (view === "accounts") setSelectedAccountId("");
    if (view === "transactions") setSelectedTxnId("");
    if (view === "bills" || view === "budgets" || view === "review" || view === "rules") setSelectedSecondaryId("");
    setTab("overview");
    updateFinanceUrl({ selected: "", tab: "overview" });
    setInspectorOpen(false);
  }

  async function runSelectedRuleTests() {
    const rule = rulesModel.selected;
    if (!rule) {
      setNotice("Select a visible rule before running its deterministic tests.");
      return;
    }
    const run = runFinanceRuleTests(rule, new Date().toISOString());
    setRuleTestRuns((current) => ({ ...current, [rule.id]: run }));
    const nativeRule = financeState.rules.find((item) => item.id === rule.id);
    if (nativeRule) {
      const saved = await financeRepository.patch({
        kind: "rule",
        id: nativeRule.id,
        expectedUpdatedAt: nativeRule.updatedAt,
        action: "test_rule",
        passed: run.failed === 0 && run.review === 0
      });
      if (saved.ok) setFinanceState(saved.data.state);
      else {
        setNotice(`${rule.name}: tests ran, but the audit save failed: ${saved.error.message}`);
        return;
      }
    }
    setNotice(
      `${rule.name}: ${run.passed} passed, ${run.failed} failed, ${run.review} need review. ` +
      "The deterministic result was audited; it made 0 source mutations."
    );
  }

  async function runVisibleRuleTests() {
    const executedAt = new Date().toISOString();
    const runs = Object.fromEntries(
      rulesModel.rows.map((rule) => [rule.id, runFinanceRuleTests(rule, executedAt)])
    );
    const values = Object.values(runs);
    const passed = values.reduce((sum, run) => sum + run.passed, 0);
    const failed = values.reduce((sum, run) => sum + run.failed, 0);
    const review = values.reduce((sum, run) => sum + run.review, 0);
    setRuleTestRuns((current) => ({ ...current, ...runs }));
    const saved = await Promise.all(financeState.rules
      .filter((rule) => Boolean(runs[rule.id]))
      .map((rule) => financeRepository.patch({
        kind: "rule",
        id: rule.id,
        expectedUpdatedAt: rule.updatedAt,
        action: "test_rule",
        passed: runs[rule.id].failed === 0 && runs[rule.id].review === 0
      })));
    const failedSave = saved.find((result) => !result.ok);
    const refreshed = await financeRepository.readState();
    if (refreshed.ok) setFinanceState(refreshed.data);
    if (failedSave && !failedSave.ok) {
      setNotice(`Rule tests ran, but an audit save failed: ${failedSave.error.message}`);
      return;
    }
    setNotice(
      `${rulesModel.visibleCount} visible rules tested: ${passed} passed, ${failed} failed, ${review} need review. ` +
      "Results were audited and made 0 source mutations."
    );
  }

  return (
    <ModuleShell
      module="finance"
      mode={showRail ? "detail" : "directory"}
      ariaLabel="Finance workspace"
      className={classNames("finance-workspace", "finance-module-shell", showContext && "has-context", showRail && "has-rail")}
      sidebar={<FinanceSidebar
        smartCounts={smartCounts}
        view={view}
        smartFilter={smartFilter}
        onSmart={handleSmart}
        onUtility={(next) => { setAiOpen(false); setUtility(next); }}
        onImport={() => { setOperationTarget(null); setOperation(accounts.length ? "import" : "account"); }}
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />}
      inspector={
        showRail
          ? view === "rules" && rulesModel.selected
            ? <FinanceRulesInspector
                rule={rulesModel.selected}
                run={ruleTestRuns[rulesModel.selected.id] || null}
                activeTab={tab}
                onTabChange={(nextTab) => {
                  setTab(nextTab);
                  updateFinanceUrl({ tab: nextTab }, { native: true });
                }}
                onRunTests={runSelectedRuleTests}
                onClose={closeInspector}
                mobileOpen={inspectorOpen}
                overlay={true}
                overlayOpen={inspectorOpen}
              />
            : <FinanceInspector
                financeState={financeState}
                view={view as "accounts" | "transactions" | "bills" | "budgets" | "review"}
                accountModel={accountsModel}
                transactionModel={transactionsModel}
                billsModel={billsModel}
                budgetsModel={budgetsModel}
                monthlyReviewModel={monthlyReviewModel}
                linkedContext={linkedContext}
                decisions={decisions}
                decisionsError={decisionsError}
                decisionsLoading={decisionsLoading}
                onRefreshDecisions={() => void refreshDecisions()}
                onOperation={(nextOperation, selection) => {
                  setOperationTarget(selection);
                  setOperation(nextOperation);
                }}
                activeTab={tab}
                onTabChange={(nextTab) => {
                  setTab(nextTab);
                  updateFinanceUrl({ tab: nextTab }, { native: true });
                }}
                onClose={closeInspector}
                mobileOpen={inspectorOpen}
                overlay={true}
                overlayOpen={inspectorOpen}
              />
          : showContext
            ? <FinanceUtilityRail utility={utility!} state={financeState} onClose={() => setUtility(null)} onView={navigateView}
                onBankChanged={async () => { const refreshed = await createFinanceRepository().readState(); if (refreshed.ok) setFinanceState(refreshed.data); else throw new Error(refreshed.error.message); }}
                onCategory={(category) => { setUtility(null); setView("transactions"); setSelectedAccountId(""); setSelectedTxnId(""); setSelectedSecondaryId(""); setSmartFilter(""); setSort("default"); setTab("overview"); setCheckedTxnIds(new Set()); setInspectorOpen(false); setQuery(category); updateFinanceUrl({ view: "transactions", query: category, filter: "", selected: "", tab: "overview", sort: "default" }, { history: "push" }); }}
                onImport={() => { setUtility(null); setOperationTarget(null); setOperation(accounts.length ? "import" : "account"); }} />
            : undefined
      }
      aiDock={
        <SharedAIDock
          className="finance-header-assistant"
          open={aiOpen}
          onOpenChange={(open) => {
            setAiOpen(open);
            if (open) setInspectorOpen(false);
            else requestAnimationFrame(() => aiButtonRef.current?.focus());
            updateFinanceUrl({ ai: open }, { native: true });
          }}
          context={{
            module: "finance",
            object: aiObject,
            activeTab: `${activeView.label} · ${tab}`,
            visibleScope: `${accounts.length} accounts · ${transactions.length} transactions · ${bills.length} bills`,
            allowedActions: [
              "Explain visible native Finance records",
              "Summarize the selected object without saving",
              "Draft questions for manual review"
            ]
          }}
          footer={<p className="finance-ai-disclaimer">The assistant is contextual and cannot silently mutate Finance records.</p>}
        />
      }
    >
      <span className="module-ref-regression-sentinel">Finance command view</span>
      <button
        type="button"
        className="finance-mobile-menu"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Open Finance sidebar"
        aria-expanded={mobileSidebarOpen}
        aria-controls="finance-module-sidebar"
      >
        Finance
      </button>
      {mobileSidebarOpen && <button type="button" className="finance-mobile-scrim" onClick={() => setMobileSidebarOpen(false)} aria-label="Close Finance sidebar" />}
      {(showContext || (showRail && inspectorOpen)) && <button type="button" className="finance-inspector-scrim" onClick={closeInspector} aria-label="Close Finance panel" />}
      <div className="finance-main-workspace">
        <header className="finance-page-header">
          <div className="finance-page-title"><span className="finance-title-icon"><UnigentamosIcon role={activeSmart?.icon || activeView.icon} /></span><h1>{activeSmart?.label || activeView.label}</h1></div>
          <div className="finance-page-actions"><NativeActionBar
          view={view}
          hasSelection={hasRouteSelection}
          hasAccounts={financeState.accounts.some((item) => !item.archivedAt)}
          closeStatus={activeClose?.status || "none"}
          onOperation={(nextOperation) => { setOperationTarget(null); setOperation(nextOperation); }}
        />{view === "accounts" && <button type="button" className="finance-action" onClick={() => { setAiOpen(false); setInspectorOpen(false); setUtility("settings"); }}><Icon name="Link" />Bank connections</button>}<button type="button" className="finance-action finance-activity-trigger" onClick={() => { setAiOpen(false); setUtility("activity"); }} aria-label="Recent activity" title="Recent activity" aria-expanded={utility === "activity"}><UnigentamosIcon role="clock" /><span>Activity</span></button><button ref={aiButtonRef} type="button" className="finance-action finance-assistant-trigger" aria-label={aiOpen ? "Close AI assistant" : "Open AI assistant"} aria-expanded={aiOpen} title="Finance assistant" onClick={() => { setAiOpen(!aiOpen); setUtility(null); setInspectorOpen(false); updateFinanceUrl({ ai: !aiOpen }, { native: true }); }}><Icon name="Sparkles" /></button></div>
        </header>
        <div className="finance-search-row"><label className="finance-global-search"><Icon name="Search" /><input type="search" aria-label={view === "overview" ? "Search finance" : view === "bills" ? "Search bills and subscriptions" : view === "review" ? "Search monthly review" : `Search ${view}`} value={query} placeholder={view === "overview" ? "Search accounts, transactions, bills and budgets" : `Search ${activeView.label.toLowerCase()}`} onChange={(event) => { setQuery(event.target.value); setCheckedTxnIds(new Set()); setInspectorDismissed(false); updateFinanceUrl({ query: event.target.value }, { native: true }); }} /></label></div>

        {financeError && <div className="finance-notice is-error" role="alert"><Swatch hue="crimson" /><span className="finance-notice__message">{financeError}</span></div>}
        <ArchivedFinanceRecords
          state={financeState}
          onRestore={(selection) => { setOperationTarget(selection); setOperation("restore"); }}
        />
        {notice && <div className="finance-notice" role="status" aria-live="polite"><Swatch hue={activeSmart?.hue || "indigo"} /><span className="finance-notice__message">{notice}</span><button type="button" onClick={() => setNotice("")}>Clear</button></div>}
        {view === "overview" && <FinanceOverviewView state={financeState} dataset={financeDataset} query={query} attentionOnly={smartFilter === "attention"} onView={navigateView} onSmart={handleSmart} onAddAccount={() => setOperation("account")} onOpen={(nextView, id) => { if (nextView === "accounts") { const account = accounts.find(item => item.id === id); if (account) selectAccount(account); } else navigateToSelected(nextView, id); }} />}
        {view === "accounts" && (
          <FinanceAccountsRouteView
            model={accountsModel}
            state={financeState}
            onAddAccount={() => setOperation("account")}
            cashflow={snapshot.cashflow}
            cashflowSummary={financeViewModel.cashflowSummary}
            actualSavingsMovement={snapshot.monthSaved}
            onQueryChange={(nextQuery) => {
              setQuery(nextQuery);
              setInspectorDismissed(false);
              updateFinanceUrl({ query: nextQuery }, { native: true });
            }}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              updateFinanceUrl({ sort: nextSort }, { native: true });
            }}
            onSelect={(id) => {
              const account = accounts.find((candidate) => candidate.id === id);
              if (account) selectAccount(account);
            }}
            onOpenFilterPreview={() => setModal("filter")}
            onOpenGroupingPreview={() => setModal("group")}
          />
        )}
        {view === "budgets" && (
          <FinanceBudgetsRouteView
            model={budgetsModel}
            filter={smartFilter}
            onQueryChange={(nextQuery) => {
              setQuery(nextQuery);
              updateFinanceUrl({ query: nextQuery }, { native: true });
            }}
            onFilterChange={(nextFilter) => {
              setSmartFilter(nextFilter);
              updateFinanceUrl({ filter: nextFilter }, { native: true });
            }}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              updateFinanceUrl({ sort: nextSort }, { native: true });
            }}
            onSelect={selectSecondary}
            onOpenFilterPreview={() => setModal("filter")}
            onOpenPeriodPreview={() => setModal("period")}
          />
        )}
        {view === "bills" && (
          <FinanceBillsRouteView
            model={billsModel}
            filter={smartFilter}
            onQueryChange={(nextQuery) => {
              setQuery(nextQuery);
              updateFinanceUrl({ query: nextQuery }, { native: true });
            }}
            onFilterChange={(nextFilter) => {
              setSmartFilter(nextFilter);
              updateFinanceUrl({ filter: nextFilter }, { native: true });
            }}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              updateFinanceUrl({ sort: nextSort }, { native: true });
            }}
            onSelect={selectSecondary}
            onOpenFilterPreview={() => setModal("filter")}
            onOpenPaymentPreview={() => setModal("pay")}
          />
        )}
        {view === "review" && (
          <FinanceMonthlyReviewRouteView
            model={monthlyReviewModel}
            decisions={decisions}
            filter={smartFilter}
            onQueryChange={(nextQuery) => {
              setQuery(nextQuery);
              updateFinanceUrl({ query: nextQuery }, { native: true });
            }}
            onFilterChange={(nextFilter) => {
              setSmartFilter(nextFilter);
              updateFinanceUrl({ filter: nextFilter }, { native: true });
            }}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              updateFinanceUrl({ sort: nextSort }, { native: true });
            }}
            onSelect={selectSecondary}
            onOpenFilterPreview={() => setModal("filter")}
            onOpenReviews={() => router.push(getModuleRoute("reviews"))}
            onPreviewReminder={(id) => {
              const reminder = reminders.find((item) => item.id === id);
              setNotice(reminder ? `${reminder.text} is a proposal reminder only; no savings movement was created.` : "Proposal reminder unavailable.");
            }}
          />
        )}
        {view === "rules" && (
          <FinanceRulesRouteView
            model={rulesModel}
            filter={smartFilter}
            onQueryChange={(nextQuery) => {
              setQuery(nextQuery);
              setInspectorDismissed(false);
              updateFinanceUrl({ query: nextQuery }, { native: true });
            }}
            onFilterChange={(nextFilter) => {
              setSmartFilter(nextFilter);
              setInspectorDismissed(false);
              updateFinanceUrl({ filter: nextFilter }, { native: true });
            }}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              updateFinanceUrl({ sort: nextSort }, { native: true });
            }}
            onSelect={selectSecondary}
            onRunVisibleTests={runVisibleRuleTests}
            onNotice={setNotice}
          />
        )}
        {view === "transactions" && (
          <FinanceTransactionsRouteView
            model={transactionsModel}
            filter={smartFilter}
            checkedIds={checkedTxnIds}
            onQueryChange={(nextQuery) => {
              setQuery(nextQuery);
              setCheckedTxnIds(new Set());
              setInspectorDismissed(false);
              updateFinanceUrl({ query: nextQuery }, { native: true });
            }}
            onFilterChange={(nextFilter) => {
              setSmartFilter(nextFilter);
              setCheckedTxnIds(new Set());
              setInspectorDismissed(false);
              updateFinanceUrl({ filter: nextFilter }, { native: true });
            }}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              updateFinanceUrl({ sort: nextSort }, { native: true });
            }}
            onSelect={selectTransaction}
            onCheckedChange={(id, checked) => {
              setCheckedTxnIds((current) => {
                const next = new Set(current);
                if (checked) next.add(id);
                else next.delete(id);
                return next;
              });
            }}
            onClearChecked={() => setCheckedTxnIds(new Set())}
            onOpenFilterPreview={() => setModal("filter")}
            onOpenColumnsPreview={() => setModal("columns")}
          />
        )}
      </div>
      <ModalShell modal={modal} onClose={() => setModal(null)} />
      <FinanceMutationDialog
        operation={operation}
        state={financeState}
        selection={operationTarget || operationSelection}
        closeCheckId={view === "review" ? monthlyReviewModel.selectedId || undefined : undefined}
        onClose={() => { setOperation(null); setOperationTarget(null); }}
        onState={(nextState, message) => {
          setFinanceState(nextState);
          setFinanceError("");
          setNotice(message);
          setOperationTarget(null);
        }}
      />
    </ModuleShell>
  );
}
