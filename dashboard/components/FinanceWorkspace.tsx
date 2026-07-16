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
import FinanceMonthlyReviewRouteView from "./finance/FinanceMonthlyReviewView";
import FinanceTransactionsRouteView from "./finance/FinanceTransactionsView";
import {
  createNativeObjectRef,
  getModuleRoute,
  getModuleViewRoute,
  getNativeObjectRoute
} from "../lib/native-objects/routes";
import { normalizeFinanceUrlStateForView, parseFinanceUrlState, serializeFinanceUrlState } from "../lib/native-objects/url-state";
import type { FinanceFilter, FinanceSort, FinanceTab, FinanceView } from "../lib/native-objects/url-state";
import { financeFixtureRepository } from "../lib/modules/finance/fixture-repository";
import { buildFinanceAccountsViewModel } from "../lib/modules/finance/accounts-view-model";
import { buildFinanceBillsViewModel } from "../lib/modules/finance/bills-view-model";
import { buildFinanceBudgetsViewModel } from "../lib/modules/finance/budgets-view-model";
import { buildFinanceMonthlyReviewViewModel } from "../lib/modules/finance/monthly-review-view-model";
import { buildFinanceTransactionsViewModel } from "../lib/modules/finance/transactions-view-model";
import {
  buildFinanceFixtureViewModel,
  getFinanceSmartViewCount,
  getFinanceViewBadge
} from "../lib/modules/finance/view-model";
import type {
  FinanceAccount as Account,
  FinanceAccountKind as AccountKind,
  FinanceHue as Hue,
  FinanceTransaction as Txn
} from "../lib/modules/finance/types";

const financeDataset = financeFixtureRepository.read();
const financeViewModel = buildFinanceFixtureViewModel(financeDataset);
const { accounts, budgets, bills, transactions, reviewItems, reminders, linkedContext, snapshot } = financeDataset;
const FINANCE_PREVIEW_LABEL = financeFixtureRepository.metadata.previewLabel;
const FINANCE_PREVIEW_REASON = `${FINANCE_PREVIEW_LABEL}. Persistent Finance mutations are not connected.`;

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
  { id: "review", label: "Monthly Review", hue: "violet" }
];

const SMART_VIEWS: Array<{ id: string; label: string; hue: Hue; view: ViewId; notice: string; mode?: "filter" | "jump"; disabledReason?: string }> = [
  { id: "attention", label: "Needs attention", hue: "crimson", view: "overview", mode: "jump", notice: "Command shows all three fixture attention items. This is a summary jump, not a filtered record set." },
  { id: "due-week", label: "Due this week", hue: "orange", view: "bills", notice: "Bills are narrowed to obligations due within seven days." },
  { id: "unreviewed", label: "Unreviewed", hue: "yellow", view: "transactions", notice: "Transactions are narrowed to pending fixture items." },
  { id: "recurring", label: "Recurring", hue: "violet", view: "bills", notice: "Bills are narrowed to recurring fixture obligations." },
  { id: "linked-projects", label: "Linked to projects", hue: "indigo", view: "overview", notice: "", disabledReason: "A Finance-to-Projects filter is not connected in this fixture checkpoint." },
  { id: "savings-movement", label: "Savings movement", hue: "green", view: "accounts", mode: "jump", notice: "Accounts shows the fixture snapshot's actual $3,900 savings evidence. This is a summary jump, not a filtered record set; source, destination, and evidence records are not connected." }
];

function smartViewCount(id: string) {
  return getFinanceSmartViewCount(financeViewModel, id);
}

function viewBadge(view: ViewId) {
  return getFinanceViewBadge(financeViewModel, view);
}

function statusHue(status: (typeof bills)[number]["status"]): Hue {
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

function totals() {
  return financeViewModel.accountTotals;
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Icon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    Wallet: <><path d="M4 7.5h16v10H4z" /><path d="M16 11h4v3h-4z" /><path d="M6.5 7.5V5.8L16 4v3.5" /></>,
    PiggyBank: <><path d="M5 12c0-3 2.6-5 6.2-5H15c2.8 0 5 2 5 4.6 0 2.8-2.3 5.1-5.2 5.1H9l-2 2H5.5v-3.1A5 5 0 0 1 5 12z" /><path d="M16 8V5h2" /><circle cx="15.5" cy="10" r=".5" /></>,
    CreditCard: <><path d="M3.5 6.5h17v11h-17z" /><path d="M3.5 9.5h17" /><path d="M7 14h3" /></>,
    LineChart: <><path d="M4 18h16" /><path d="M5 15l4-4 3 2 5-7 2 2" /></>,
    Banknote: <><path d="M4 7h16v10H4z" /><circle cx="12" cy="12" r="2" /><path d="M7 9.5v5M17 9.5v5" /></>,
    Briefcase: <><path d="M4 8h16v10H4z" /><path d="M9 8V6h6v2" /><path d="M4 12h16" /></>,
    Alert: <><path d="M12 4l9 16H3z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    Trending: <><path d="M4 16l5-5 3 3 7-7" /><path d="M15 7h4v4" /></>,
    Calendar: <><path d="M5 5h14v15H5z" /><path d="M8 3v4M16 3v4M5 9h14" /></>,
    Filter: <><path d="M4 5h16l-6 7v5l-4 2v-7z" /></>,
    Plus: <><path d="M12 5v14M5 12h14" /></>,
    Search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="M15 15l5 5" /></>,
    Sliders: <><path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h12M20 17h0" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="18" cy="17" r="2" /></>,
    Check: <><path d="M5 12l4 4L19 6" /></>,
    Link: <><path d="M10 8H8a4 4 0 0 0 0 8h2" /><path d="M14 8h2a4 4 0 0 1 0 8h-2" /><path d="M9 12h6" /></>,
    Sparkles: <><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
    Send: <><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></>,
    X: <><path d="M7 7l10 10M17 7L7 17" /></>,
    Chevron: <><path d="M8 10l4 4 4-4" /></>
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
      {paths[name] || paths.Wallet}
    </svg>
  );
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
      aria-describedby={disabled ? "finance-preview-status" : undefined}
      style={disabled ? { borderColor: "#dedee2", background: "#f4f4f5", color: "#71717a", cursor: "not-allowed" } : undefined}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}

function FixtureDatasetNotice() {
  return (
    <section id="finance-preview-status" className="finance-dataset-notice" aria-label="Finance data source status">
      <IconTile hue="brown" icon="Wallet" />
      <div>
        <strong>{FINANCE_PREVIEW_LABEL}</strong>
        <span>Navigation, search, filters, sorting, selection, inspectors, and charts work across Finance. Persistent Finance mutations are not connected; saving, importing, reconciling, linking, paying, budgeting, and closing remain unavailable.</span>
      </div>
      <Chip hue="brown" dot>NOT CONNECTED</Chip>
    </section>
  );
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

function CashflowChart({ compact = false }: { compact?: boolean }) {
  const { income, spend, savings, months } = snapshot.cashflow;
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
      <p id={descriptionId} className="sr-only">{financeViewModel.cashflowSummary}</p>
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

function RecentTransactionsRail({ onOpenTransaction }: { onOpenTransaction: (id: string) => void }) {
  return (
    <section className="finance-context-card finance-recent-card" aria-label="Recent transactions">
      <div className="finance-context-heading">
        <span><Swatch hue="blue" />Recent</span>
        <strong>{financeViewModel.counts.transactions}</strong>
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
  onOpenTransaction,
  mobileOpen,
  overlay,
  overlayOpen,
  onClose
}: {
  onOpenTransaction: (id: string) => void;
  mobileOpen: boolean;
  overlay: boolean;
  overlayOpen: boolean;
  onClose: () => void;
}) {
  const closeAction = <button type="button" className="finance-rail-close" onClick={onClose} aria-label="Close Finance context"><Icon name="X" /></button>;
  return (
    <InspectorRail id="finance-inspector" title="Recent activity" actions={closeAction} className={classNames("finance-context-rail", mobileOpen && "is-mobile-open")} ariaLabel="Finance context" readOnly overlay={overlay} overlayOpen={overlayOpen} onRequestClose={onClose}>
      <RecentTransactionsRail onOpenTransaction={onOpenTransaction} />
    </InspectorRail>
  );
}

function FinanceSidebar({
  view,
  smartFilter,
  onSmart,
  mobileOpen,
  onClose
}: {
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
      description={`${financeFixtureRepository.metadata.periodLabel} · fixture dataset`}
      status={<Chip hue="brown" dot>READ ONLY</Chip>}
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
            label: viewBadge(item.id) ? `${item.label} · ${viewBadge(item.id)}` : item.label,
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
            count: smartViewCount(item.id),
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
              disabled: true,
              disabledReason: "Use Accounts & Cashflow for the current read path. A separate account-management surface remains unresolved."
            },
            {
              id: "data-categories",
              label: "Categories",
              disabled: true,
              disabledReason: "No native Finance category repository or management route is connected."
            },
            {
              id: "data-imports",
              label: "Imports",
              disabled: true,
              disabledReason: "No import source, batch, repair, or reconciliation repository is connected."
            },
            {
              id: "data-rules",
              label: "Rules / Automation",
              disabled: true,
              disabledReason: "No rule repository, risk policy, test history, or activation audit is connected."
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
      footer={<p className="finance-sidebar-footnote">Fixture values are not live account data.</p>}
    />
  );
}

function OverviewView({
  onSelect,
  onOpenBill,
  onOpenBudget,
  onView,
  onModal,
  onNotice
}: {
  onSelect: (account: Account) => void;
  onOpenBill: (id: string) => void;
  onOpenBudget: (id: string) => void;
  onView: (view: ViewId) => void;
  onModal: (modal: ModalKind) => void;
  onNotice: (notice: string) => void;
}) {
  const summary = totals();
  return (
    <>
      <WorkspaceHeader
        title="Command"
        subtitle="What matters now · due soon · changed · needs review"
        actions={<><HeaderAction icon="Filter" onClick={() => onModal("filter")}>Filter preview</HeaderAction><HeaderAction icon="Plus" primary disabled title={FINANCE_PREVIEW_REASON}>Record unavailable</HeaderAction></>}
      />
      <Panel className="finance-kpi-strip">
        {[
          ["Net worth", money(summary.net), snapshot.netWorthDeltaLabel, "indigo"],
          ["Liquid", money(summary.liquid), snapshot.liquidDeltaLabel, "teal"],
          ["Debt", money(summary.debt), snapshot.debtDeltaLabel, "crimson"],
          ["Runway", `${summary.runway.toFixed(1)} mo`, "at current spend", "violet"]
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
          <CashflowChart compact />
          <div className="finance-cash-footer">
            <div><span>Net this month</span><strong className="is-green">{money(snapshot.netThisMonth, { sign: true })}</strong></div>
            <div><span>Avg burn</span><strong>{money(snapshot.averageBurn)}</strong></div>
            <div><span>Savings rate</span><strong>{snapshot.savingsRate}%</strong></div>
          </div>
        </Panel>
        <Panel hue="crimson">
          <div className="finance-panel-heading"><h2>Needs attention <span>{financeViewModel.counts.attention}</span></h2></div>
          <div className="finance-attention-list">
            {snapshot.attentionItems.map((item) => (
              <button
                type="button"
                key={item.title}
                onClick={() => {
                  if (item.title.startsWith("AWS")) onOpenBill("aws");
                  else if (item.title.startsWith("Travel")) onOpenBudget("travel");
                  else {
                    const reserve = accounts.find((account) => account.id === "reserve");
                    if (reserve) onSelect(reserve);
                    else onNotice(`${item.title} is unavailable in this fixture.`);
                  }
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
          <div className="finance-panel-heading"><h2>Accounts <span>{financeViewModel.counts.accounts}</span></h2><button type="button" onClick={() => onView("accounts")}>View all -&gt;</button></div>
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
    record: { title: "Recording unavailable", body: FINANCE_PREVIEW_REASON, fields: ["Type", "Amount", "Linked context"] },
    filter: { title: "Finance filters preview", body: "Filter structure is shown for review. Use search and Smart Views for the working fixture interactions in this checkpoint.", fields: ["Status", "Account", "Category"] },
    account: { title: "Account linking unavailable", body: FINANCE_PREVIEW_REASON, fields: ["Account name", "Institution", "Type"] },
    category: { title: "Budget category creation unavailable", body: FINANCE_PREVIEW_REASON, fields: ["Category", "Monthly cap", "Hue"] },
    bill: { title: "Bill creation unavailable", body: FINANCE_PREVIEW_REASON, fields: ["Vendor", "Amount", "Due date"] },
    columns: { title: "Transaction columns preview", body: "Column customization is not persisted in this fixture checkpoint.", fields: ["Date", "Category", "Linked note"] },
    pay: { title: "Payments unavailable", body: FINANCE_PREVIEW_REASON, fields: ["Bill", "Amount", "Funding account"] },
    transfer: { title: "Transfers unavailable", body: FINANCE_PREVIEW_REASON, fields: ["From", "To", "Amount"] },
    group: { title: "Account grouping preview", body: "The current read path groups accounts by cash and deposits, credit and liabilities, and investments and business. Custom grouping is not persisted.", fields: ["Current grouping", "Custom grouping", "Saved view"] },
    period: { title: "Budget period preview", body: "The fixture represents June 2026. Changing, comparing, or closing budget periods requires a durable Finance period repository.", fields: ["Current period", "Comparison period", "Rollover policy"] }
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
  initialView
}: {
  initialView?: FinanceView;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsedInitialUrlState = parseFinanceUrlState(searchParams);
  const routedInitialView = initialView || parsedInitialUrlState.view;
  const initialUrlState = normalizeFinanceUrlStateForView(routedInitialView, parsedInitialUrlState);
  const [view, setView] = useState<ViewId>(routedInitialView);
  const [selectedAccountId, setSelectedAccountId] = useState(
    routedInitialView === "accounts" || routedInitialView === "overview" ? initialUrlState.selected : ""
  );
  const [selectedTxnId, setSelectedTxnId] = useState(routedInitialView === "transactions" ? initialUrlState.selected : "");
  const [selectedSecondaryId, setSelectedSecondaryId] = useState(
    routedInitialView === "bills" || routedInitialView === "budgets" || routedInitialView === "review"
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
  const selectedAccount = accounts.find((account) => account.id === accountsModel.selectedId) || null;

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
    setTab(isFinanceInspectableView(nextView) && isFinanceTabAllowed(nextView, next.tab) ? next.tab : "overview");
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
    if (nextView === "bills" || nextView === "budgets" || nextView === "review") {
      setSelectedSecondaryId(next.selected);
    } else {
      setSelectedSecondaryId("");
    }
    setCheckedTxnIds(new Set());
    setInspectorOpen(Boolean(next.selected && ["accounts", "transactions", "bills", "budgets", "review"].includes(nextView)));
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
    if (inspectorDismissed || !["accounts", "transactions", "bills", "budgets", "review"].includes(view)) return;
    const resolvedSelectedId = view === "accounts"
      ? accountsModel.selectedId || ""
      : view === "transactions"
        ? transactionsModel.selectedId || ""
        : view === "bills"
          ? billsModel.selectedId || ""
          : view === "budgets"
            ? budgetsModel.selectedId || ""
            : monthlyReviewModel.selectedId || "";
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
    if (view === "bills" || view === "budgets" || view === "review") setSelectedSecondaryId("");
    setTab("overview");
    updateFinanceUrl({ selected: "", tab: "overview" });
    setInspectorOpen(false);
  }

  return (
    <ModuleShell
      module="finance"
      mode={showRail ? "detail" : "directory"}
      ariaLabel="Finance workspace"
      className={classNames("finance-workspace", "finance-module-shell", showContext && "has-context", showRail && "has-rail")}
      sidebar={<FinanceSidebar view={view} smartFilter={smartFilter} onSmart={handleSmart} mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />}
      inspector={
        showRail
          ? <FinanceInspector
              view={view as "accounts" | "transactions" | "bills" | "budgets" | "review"}
              accountModel={accountsModel}
              transactionModel={transactionsModel}
              billsModel={billsModel}
              budgetsModel={budgetsModel}
              monthlyReviewModel={monthlyReviewModel}
              linkedContext={linkedContext}
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
            ? <FinanceContextRail onOpenTransaction={(id) => navigateToSelected("transactions", id)} mobileOpen={inspectorOpen} overlay={compactInspector} overlayOpen={compactInspector && inspectorOpen} onClose={closeInspector} />
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
            visibleScope: FINANCE_PREVIEW_LABEL,
            allowedActions: [
              "Explain visible fixture values",
              "Summarize the selected object without saving",
              "Draft questions for manual review"
            ]
          }}
          footer={<p className="finance-ai-disclaimer">Finance remains read-only while the shared assistant is disconnected.</p>}
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
                    : monthlyReviewModel.selected?.item.label || "close item"} detail`
            : "Open Finance context"}
        </button>
      )}
      {inspectorOpen && <button type="button" className="finance-inspector-scrim" onClick={closeInspector} aria-label="Close Finance context" />}
      <div className="finance-main-workspace">
        <FixtureDatasetNotice />
        {notice && <div className="finance-notice" role="status" aria-live="polite"><Swatch hue={activeSmart?.hue || "indigo"} /><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Clear</button></div>}
        {view === "overview" && <OverviewView onSelect={selectAccount} onOpenBill={(id) => navigateToSelected("bills", id)} onOpenBudget={(id) => navigateToSelected("budgets", id)} onView={navigateView} onModal={setModal} onNotice={setNotice} />}
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
    </ModuleShell>
  );
}
