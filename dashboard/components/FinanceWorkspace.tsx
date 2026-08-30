"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import InspectorRail from "./admin-shell/InspectorRail";
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

const HUES: Record<Hue, { fg: string; tint: string; border: string; solid: string }> = {
  neutral: { fg: "#71717a", tint: "#f4f4f5", border: "#d4d4d8", solid: "#71717a" },
  green: { fg: "#15803d", tint: "#ecfdf3", border: "#bbf7d0", solid: "#22c55e" },
  lime: { fg: "#4d7c0f", tint: "#f7fee7", border: "#d9f99d", solid: "#84cc16" },
  yellow: { fg: "#a16207", tint: "#fefce8", border: "#fde68a", solid: "#eab308" },
  orange: { fg: "#c2410c", tint: "#fff7ed", border: "#fed7aa", solid: "#f97316" },
  brown: { fg: "#8a6238", tint: "#f5f0ea", border: "#dac8b3", solid: "#9a6b43" },
  crimson: { fg: "#be123c", tint: "#fff1f2", border: "#fecdd3", solid: "#e11d48" },
  pink: { fg: "#be185d", tint: "#fdf2f8", border: "#fbcfe8", solid: "#ec4899" },
  purple: { fg: "#7e22ce", tint: "#faf5ff", border: "#e9d5ff", solid: "#a855f7" },
  violet: { fg: "#6d28d9", tint: "#f5f3ff", border: "#ddd6fe", solid: "#8b5cf6" },
  indigo: { fg: "#4f46e5", tint: "#eef2ff", border: "#c7d2fe", solid: "#6366f1" },
  blue: { fg: "#2563eb", tint: "#eff6ff", border: "#bfdbfe", solid: "#3b82f6" },
  cyan: { fg: "#0891b2", tint: "#ecfeff", border: "#a5f3fc", solid: "#06b6d4" },
  teal: { fg: "#0f766e", tint: "#f0fdfa", border: "#99f6e4", solid: "#14b8a6" }
};

const VIEWS: Array<{ id: ViewId; label: string; hue: Hue }> = [
  { id: "overview", label: "Command", hue: "indigo" },
  { id: "accounts", label: "Accounts & Cashflow", hue: "blue" },
  { id: "transactions", label: "Transactions", hue: "neutral" },
  { id: "budgets", label: "Budgets", hue: "teal" },
  { id: "bills", label: "Bills & Subscriptions", hue: "orange" },
  { id: "review", label: "Monthly Review", hue: "violet" },
  { id: "rules", label: "Rules / Automation", hue: "purple" }
];

const SMART_VIEWS: Array<{ id: string; label: string; hue: Hue; view: ViewId; notice: string; mode?: "filter" | "jump"; disabledReason?: string }> = [
  { id: "attention", label: "Needs attention", hue: "crimson", view: "overview", mode: "jump", notice: "Command shows the current derived attention queue." },
  { id: "due-week", label: "Due this week", hue: "orange", view: "bills", notice: "Bills are narrowed to obligations due within seven days." },
  { id: "unreviewed", label: "Unreviewed", hue: "yellow", view: "transactions", notice: "Transactions are narrowed to pending or unreconciled records." },
  { id: "recurring", label: "Recurring", hue: "violet", view: "bills", notice: "Bills are narrowed to current recurring obligations." },
  { id: "linked-projects", label: "Linked to projects", hue: "indigo", view: "overview", notice: "", disabledReason: "No current Finance records contain canonical Project references." },
  { id: "savings-movement", label: "Savings movement", hue: "green", view: "accounts", mode: "jump", notice: "Accounts shows current first-class savings movement evidence." }
];

function statusHue(status: FinanceBillStatus): Hue {
  if (status === "overdue") return "crimson";
  if (status === "due") return "orange";
  if (status === "soon") return "yellow";
  if (status === "paid") return "green";
  return "blue";
}

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

function WorkspaceHeader({
  title,
  subtitle,
  actions
}: {
  title: string;
  subtitle: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="finance-workspace-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="finance-workspace-actions">{actions}</div>
    </div>
  );
}

function polylinePoints(values: readonly number[], width: number, height: number, pad = 4) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = pad + (index / Math.max(values.length - 1, 1)) * (width - pad * 2);
      const y = height - pad - ((value - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function Sparkline({ values, hue }: { values: readonly number[]; hue: Hue }) {
  return (
    <svg className="finance-sparkline" viewBox="0 0 96 34" aria-hidden="true" style={hueStyle(hue)}>
      <polyline points={polylinePoints(values, 96, 34)} />
    </svg>
  );
}

function CashflowChart({ dataset, summary, compact = false }: { dataset: FinanceDataset; summary: string; compact?: boolean }) {
  const { income: rawIncome, spend: rawSpend, savings: rawSavings, months } = dataset.snapshot.cashflow;
  const income = rawIncome.map((value) => value / 1000);
  const spend = rawSpend.map((value) => value / 1000);
  const savings = rawSavings.map((value) => value / 1000);
  const width = 920;
  const height = compact ? 185 : 210;
  const padX = 48;
  const padY = 24;
  const plotH = height - padY * 2;
  const yMin = -4;
  const yMax = 16;
  const toPoints = (values: readonly number[]) => values
    .map((value, index) => {
      const x = padX + (index / Math.max(values.length - 1, 1)) * (width - padX - 12);
      const y = padY + ((yMax - value) / (yMax - yMin)) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const points = toPoints(spend);
  const area = `${padX},${height - padY} ${points} ${width - 12},${height - padY}`;
  const incomePoints = toPoints(income);
  const savingsPoints = toPoints(savings);
  const zeroY = padY + ((yMax - 0) / (yMax - yMin)) * plotH;
  const descriptionId = compact ? "finance-cashflow-summary-compact" : "finance-cashflow-summary";

  return (
    <div className={classNames("finance-chart", compact && "is-compact")}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Cashflow over six months"
        aria-describedby={descriptionId}
      >
        <defs>
          <linearGradient id="financeSpendGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="financeIncomeGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[16, 12, 8, 4, 0, -4].map((tick) => {
          const y = padY + ((yMax - tick) / (yMax - yMin)) * plotH;
          return (
            <g key={tick}>
              <line className={tick === 0 ? "zero-line" : ""} x1={padX} x2={width - 12} y1={y} y2={y} />
              <text x="12" y={y + 4}>{tick}k</text>
            </g>
          );
        })}
        <line className="savings-baseline" x1={padX} x2={width - 12} y1={zeroY} y2={zeroY} />
        <polygon points={area} fill="url(#financeSpendGradient)" />
        <polyline className="income-line" points={incomePoints} />
        <polyline className="spend-line" points={points} />
        <polyline className="savings-line" points={savingsPoints} />
        {months.map((label, index) => (
          <text className="axis-month" key={label} x={padX + (index / Math.max(months.length - 1, 1)) * (width - padX - 12)} y={height - 4}>
            {label}
          </text>
        ))}
      </svg>
      <p id={descriptionId} className="sr-only">{summary}</p>
    </div>
  );
}

function accountIcon(kind: AccountKind) {
  const icons: Record<AccountKind, string> = {
    Checking: "Wallet",
    Savings: "PiggyBank",
    Credit: "CreditCard",
    Brokerage: "LineChart",
    Cash: "Banknote",
    Business: "Briefcase"
  };
  return icons[kind];
}

function AccountRow({
  account,
  onSelect
}: {
  account: Account;
  onSelect: (account: Account) => void;
}) {
  const moneyHue = account.balance < 0 ? "crimson" : account.hue;
  return (
    <button
      type="button"
      className="finance-account-row"
      onClick={() => onSelect(account)}
      aria-label={`Open ${account.name} in Accounts & Cashflow`}
    >
      <IconTile hue={account.hue} icon={accountIcon(account.kind)} />
      <span className="finance-row-identity">
        <strong>
          {account.name} <Chip hue={account.hue}>{account.kind}</Chip>
        </strong>
        <small>{account.inst} · {account.mask}</small>
      </span>
      <Sparkline values={account.spark} hue={moneyHue} />
      <span className={classNames("finance-row-money", account.balance < 0 && "is-negative")}>
        <strong>{money(account.balance, { cents: true })}</strong>
        <small>{account.delta30 >= 0 ? "+" : ""}{account.delta30}% · 30d</small>
      </span>
    </button>
  );
}

function RecentTransactionsRail({ transactions, onOpenTransaction }: { transactions: readonly Txn[]; onOpenTransaction: (id: string) => void }) {
  return (
    <section className="finance-context-card finance-recent-card" aria-label="Recent transactions">
      <div className="finance-context-heading">
        <span><Swatch hue="blue" />Recent</span>
        <strong>{transactions.length}</strong>
      </div>
      <div className="finance-recent-list">
        {transactions.slice(0, 7).map((txn) => (
          <button type="button" key={txn.id} onClick={() => onOpenTransaction(txn.id)} style={hueStyle(txn.hue)}>
            <span><Swatch hue={txn.hue} /><strong>{txn.merchant}</strong></span>
            <small>{txn.date} · {txn.account}</small>
            <em className={txn.amount > 0 ? "is-green" : ""}>{money(txn.amount, { sign: true, cents: true })}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function FinanceContextRail({
  transactions,
  onOpenTransaction,
  mobileOpen,
  overlay,
  overlayOpen,
  onClose
}: {
  transactions: readonly Txn[];
  onOpenTransaction: (id: string) => void;
  mobileOpen: boolean;
  overlay: boolean;
  overlayOpen: boolean;
  onClose: () => void;
}) {
  const closeAction = <button type="button" className="finance-rail-close" onClick={onClose} aria-label="Close Finance context"><Icon name="X" /></button>;
  return (
    <InspectorRail id="finance-inspector" title="Recent activity" actions={closeAction} className={classNames("finance-context-rail", mobileOpen && "is-mobile-open")} ariaLabel="Finance context" readOnly overlay={overlay} overlayOpen={overlayOpen} onRequestClose={onClose}>
      <RecentTransactionsRail transactions={transactions} onOpenTransaction={onOpenTransaction} />
    </InspectorRail>
  );
}

function FinanceSidebar({
  periodLabel,
  viewBadges,
  smartCounts,
  view,
  smartFilter,
  onSmart,
  mobileOpen,
  onClose
}: {
  periodLabel: string;
  viewBadges: Readonly<Record<string, string>>;
  smartCounts: Readonly<Record<string, number>>;
  view: ViewId;
  smartFilter: string;
  onSmart: (id: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <ModuleSidebar
      id="finance-module-sidebar"
      title="Finance"
      description={`${periodLabel} · native records`}
      status={<Chip hue="green" dot>CONNECTED</Chip>}
      ariaLabel="Finance sidebar"
      className="finance-module-sidebar"
      mobileOpen={mobileOpen}
      onClose={onClose}
      sections={[
        {
          id: "finance-views",
          label: "Finance",
          items: VIEWS.map((item) => ({
            id: item.id,
            label: viewBadges[item.id] ? `${item.label} · ${viewBadges[item.id]}` : item.label,
            icon: <Swatch hue={item.hue} />,
            active: view === item.id && !smartFilter,
            href: getModuleViewRoute("finance", item.id)
          }))
        },
        {
          id: "finance-smart-views",
          label: "Smart views",
          items: SMART_VIEWS.map((item) => ({
            id: item.id,
            label: item.label,
            icon: <Swatch hue={item.hue} />,
            count: smartCounts[item.id] || 0,
            active: smartFilter === item.id,
            onSelect: item.disabledReason ? undefined : () => onSmart(item.id),
            disabled: Boolean(item.disabledReason),
            disabledReason: item.disabledReason
          }))
        },
        {
          id: "finance-data",
          label: "Data",
          items: [
            {
              id: "data-accounts",
              label: "Accounts data",
              href: getModuleViewRoute("finance", "accounts")
            },
            {
              id: "data-categories",
              label: "Categories",
              href: getModuleViewRoute("finance", "budgets")
            },
            {
              id: "data-imports",
              label: "Imports",
              href: `${getModuleViewRoute("finance", "transactions")}?filter=unreviewed`
            },
            {
              id: "data-settings",
              label: "Settings",
              disabled: true,
              disabledReason: "Finance settings and permission taxonomy are not yet defined."
            }
          ]
        }
      ]}
    />
  );
}

function OverviewView({
  dataset,
  viewModel,
  onSelect,
  onOpenBill,
  onOpenBudget,
  onView,
  onOperation,
  onNotice
}: {
  dataset: FinanceDataset;
  viewModel: ReturnType<typeof buildFinanceViewModel>;
  onSelect: (account: Account) => void;
  onOpenBill: (id: string) => void;
  onOpenBudget: (id: string) => void;
  onView: (view: ViewId) => void;
  onOperation: (operation: FinanceOperation) => void;
  onNotice: (notice: string) => void;
}) {
  const { accounts, bills, snapshot } = dataset;
  const summary = viewModel.accountTotals;
  return (
    <>
      <WorkspaceHeader
        title="Command"
        subtitle="What matters now · due soon · changed · needs review"
        actions={<><HeaderAction icon="Plus" onClick={() => onOperation("account")}>Add account</HeaderAction><HeaderAction icon="Plus" primary disabled={!accounts.length} title={!accounts.length ? "Add an account before recording ledger facts." : undefined} onClick={() => onOperation("transaction")}>Record transaction</HeaderAction></>}
      />
      <Panel className="finance-kpi-strip">
        {[
          ["Net worth", money(summary.net), snapshot.netWorthDeltaLabel, "indigo"],
          ["Liquid", money(summary.liquid), snapshot.liquidDeltaLabel, "teal"],
          ["Debt", money(summary.debt), snapshot.debtDeltaLabel, "crimson"],
          ["Runway", snapshot.lastMonthOut > 0 ? `${summary.runway.toFixed(1)} mo` : "Unavailable", snapshot.lastMonthOut > 0 ? "at prior-month spend" : "no prior-month spend", "violet"]
        ].map(([label, value, sub, hue]) => (
          <article key={label} style={hueStyle(hue as Hue)}>
            <p><Swatch hue={hue as Hue} />{label}</p>
            <strong>{value}</strong>
            <small>{sub}</small>
          </article>
        ))}
      </Panel>
      <div className="finance-overview-grid">
        <Panel hue="teal" className="finance-span-2">
          <div className="finance-panel-heading">
            <h2>Cashflow <span>6 mo · $k</span></h2>
            <div><Chip hue="teal" dot>in</Chip><Chip hue="orange" dot>out</Chip><Chip hue="indigo" dot>savings</Chip></div>
          </div>
          <CashflowChart dataset={dataset} summary={viewModel.cashflowSummary} compact />
          <div className="finance-cash-footer">
            <div><span>Net this month</span><strong className="is-green">{money(snapshot.netThisMonth, { sign: true })}</strong></div>
            <div><span>Avg burn</span><strong>{money(snapshot.averageBurn)}</strong></div>
            <div><span>Savings rate</span><strong>{snapshot.savingsRate}%</strong></div>
          </div>
        </Panel>
        <Panel hue="crimson">
          <div className="finance-panel-heading"><h2>Needs attention <span>{viewModel.counts.attention}</span></h2></div>
          <div className="finance-attention-list">
            {snapshot.attentionItems.map((item) => (
              <button
                type="button"
                key={item.title}
                onClick={() => {
                  if (item.label === "Bills") {
                    const target = bills.find((bill) => bill.status === "overdue") || bills[0];
                    if (target) onOpenBill(target.id);
                  } else if (item.label === "Transactions") onView("transactions");
                  else if (item.label === "Monthly close") onView("review");
                  else onNotice(`${item.title} remains available through its owner route.`);
                }}
              >
                <IconTile hue={item.hue} icon={item.icon} />
                <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                <Chip hue={item.hue}>{item.label}</Chip>
              </button>
            ))}
          </div>
        </Panel>
        <Panel hue="blue" className="finance-span-2">
          <div className="finance-panel-heading"><h2>Accounts <span>{viewModel.counts.accounts}</span></h2><button type="button" onClick={() => onView("accounts")}>View all -&gt;</button></div>
          <div className="finance-account-list">
            {accounts.slice(0, 4).map((account) => (
              <AccountRow key={account.id} account={account} onSelect={onSelect} />
            ))}
          </div>
        </Panel>
        <Panel hue="orange">
          <div className="finance-panel-heading"><h2>Due soon <span>next 10d</span></h2></div>
          <div className="finance-timeline">
            {bills.filter((bill) => bill.dueIn >= 0).slice(0, 5).map((bill) => (
              <button type="button" key={bill.id} onClick={() => onOpenBill(bill.id)} style={hueStyle(statusHue(bill.status))}>
                <Swatch hue={statusHue(bill.status)} />
                <span><strong>{bill.name}</strong><small>{bill.due} · {bill.dueIn === 0 ? "today" : `${bill.dueIn}d`}</small></span>
                <strong>{money(bill.amount, { cents: true })}</strong>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
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
    filter: { title: "Finance filters", body: "Search, URL-restorable filters, and Smart Views operate on current native records.", fields: ["Status", "Account", "Category"] },
    account: { title: "Add an account", body: "Use the native Add account action. Labels and masks are display-only; immutable IDs own relationships.", fields: ["Account name", "Institution", "Type"] },
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
  const financeRulesSummary = useMemo(() => buildFinanceRulesViewModel(financeRulesDataset), [financeRulesDataset]);
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
  const [compactInspector, setCompactInspector] = useState(false);
  const [query, setQuery] = useState(initialUrlState.query);
  const [aiOpen, setAiOpen] = useState(initialUrlState.ai);
  const [ruleTestRuns, setRuleTestRuns] = useState<Readonly<Record<string, FinanceRuleTestRun>>>({});
  const smartCounts = useMemo(() => Object.fromEntries(SMART_VIEWS.map((item) => [item.id, getFinanceSmartViewCount(financeViewModel, item.id)])), [financeViewModel]);
  const viewBadges = useMemo(() => Object.fromEntries(VIEWS.map((item) => [
    item.id,
    item.id === "rules" ? `${financeRulesSummary.counts.active} active` : getFinanceViewBadge(financeViewModel, item.id)
  ])), [financeRulesSummary, financeViewModel]);
  const searchParamKey = searchParams.toString();
  const accountsModel = buildFinanceAccountsViewModel(financeDataset, {
    query: view === "accounts" ? query : "",
    sort,
    selectedId: selectedAccountId
  });
  const transactionsModel = buildFinanceTransactionsViewModel(financeDataset, {
    query: view === "transactions" ? query : "",
    filter: smartFilter === "unreviewed" ? "pending" : "all",
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
    selectedId: selectedSecondaryId || undefined
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

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const sync = () => setCompactInspector(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

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
    setSelectedTxnId(id);
    setTab("overview");
    setInspectorDismissed(false);
    setInspectorOpen(true);
    updateFinanceUrl({ selected: id, tab: "overview" }, { history: "push" });
  }

  function selectSecondary(id: string) {
    setSelectedSecondaryId(id);
    setTab("overview");
    setInspectorDismissed(false);
    setInspectorOpen(true);
    updateFinanceUrl({ selected: id, tab: "overview" }, { history: "push" });
  }

  const showRail = !aiOpen
    && !inspectorDismissed
    && (
      (view === "accounts" && Boolean(accountsModel.selected))
      || (view === "transactions" && Boolean(transactionsModel.selected))
      || (view === "bills" && Boolean(billsModel.selected))
      || (view === "budgets" && Boolean(budgetsModel.selected))
      || (view === "review" && Boolean(monthlyReviewModel.selected))
      || (view === "rules" && Boolean(rulesModel.selected))
    );
  const showContext = !aiOpen && !inspectorDismissed && view === "overview";
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
    if (smart && !smart.disabledReason) {
      const nextFilter = smart.mode === "jump" ? "" : id as ReturnType<typeof parseFinanceUrlState>["filter"];
      setSmartFilter(nextFilter);
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
      setNotice(smart.notice);
      updateFinanceUrl({ view: smart.view, filter: nextFilter, sort: "default", query: "", selected: "", tab: "overview" }, { history: "push" });
      return;
    }
    const reminder = reminders.find((item) => item.id === id);
    setNotice(reminder ? `${reminder.text} opened as a follow-up shell.` : "");
  }

  function closeInspector() {
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
        periodLabel={activeClose?.period || new Date().toISOString().slice(0, 7)}
        viewBadges={viewBadges}
        smartCounts={smartCounts}
        view={view}
        smartFilter={smartFilter}
        onSmart={handleSmart}
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
                overlay={compactInspector}
                overlayOpen={compactInspector && inspectorOpen}
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
                overlay={compactInspector}
                overlayOpen={compactInspector && inspectorOpen}
              />
          : showContext
            ? <FinanceContextRail transactions={transactions} onOpenTransaction={(id) => navigateToSelected("transactions", id)} mobileOpen={inspectorOpen} overlay={compactInspector} overlayOpen={compactInspector && inspectorOpen} onClose={closeInspector} />
            : undefined
      }
      aiDock={
        <SharedAIDock
          open={aiOpen}
          onOpenChange={(open) => {
            setAiOpen(open);
            if (open) setInspectorOpen(false);
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
      {(showContext || showRail || (!aiOpen && view === "overview")) && (
        <button
          type="button"
          className="finance-inspector-toggle"
          onClick={() => {
            setInspectorDismissed(false);
            setInspectorOpen(true);
          }}
          aria-expanded={inspectorOpen}
          aria-controls="finance-inspector"
        >
          {showRail
            ? `Open ${view === "accounts"
              ? accountsModel.selected?.account.name || "account"
              : view === "transactions"
                ? transactionsModel.selected?.merchant || "transaction"
                : view === "bills"
                  ? billsModel.selected?.bill.name || "bill"
                : view === "budgets"
                  ? budgetsModel.selected?.budget.category || "budget"
                  : view === "review"
                    ? monthlyReviewModel.selected?.item.label || "close item"
                    : rulesModel.selected?.name || "rule"} detail`
            : "Open Finance context"}
        </button>
      )}
      {inspectorOpen && <button type="button" className="finance-inspector-scrim" onClick={closeInspector} aria-label="Close Finance context" />}
      <div className="finance-main-workspace">
        {financeError && <div className="finance-notice is-error" role="alert"><Swatch hue="crimson" /><span className="finance-notice__message">{financeError}</span></div>}
        <ArchivedFinanceRecords
          state={financeState}
          onRestore={(selection) => { setOperationTarget(selection); setOperation("restore"); }}
        />
        <NativeActionBar
          view={view}
          hasSelection={hasRouteSelection}
          hasAccounts={financeState.accounts.some((item) => !item.archivedAt)}
          closeStatus={activeClose?.status || "none"}
          onOperation={(nextOperation) => { setOperationTarget(null); setOperation(nextOperation); }}
        />
        {notice && <div className="finance-notice" role="status" aria-live="polite"><Swatch hue={activeSmart?.hue || "indigo"} /><span className="finance-notice__message">{notice}</span><button type="button" onClick={() => setNotice("")}>Clear</button></div>}
        {view === "overview" && <OverviewView dataset={financeDataset} viewModel={financeViewModel} onSelect={selectAccount} onOpenBill={(id) => navigateToSelected("bills", id)} onOpenBudget={(id) => navigateToSelected("budgets", id)} onView={navigateView} onOperation={setOperation} onNotice={setNotice} />}
        {view === "accounts" && (
          <FinanceAccountsRouteView
            model={accountsModel}
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
