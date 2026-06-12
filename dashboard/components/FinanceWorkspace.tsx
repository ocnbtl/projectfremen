"use client";

import { useMemo, useState } from "react";

type Hue =
  | "neutral"
  | "green"
  | "lime"
  | "yellow"
  | "orange"
  | "brown"
  | "crimson"
  | "pink"
  | "purple"
  | "violet"
  | "indigo"
  | "blue"
  | "cyan"
  | "teal";

type ViewId = "overview" | "accounts" | "budgets" | "bills" | "review" | "transactions";
type BillStatus = "due" | "soon" | "scheduled" | "paid" | "overdue";
type Recurring = "monthly" | "annual" | "weekly" | null;
type ModalKind = "record" | "filter" | "account" | "category" | "bill" | "columns" | "pay" | "transfer" | null;
type TxnIo = "income" | "expense" | "transfer" | "savings";

type AccountKind = "Checking" | "Savings" | "Credit" | "Brokerage" | "Cash" | "Business";

interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  inst: string;
  mask: string;
  balance: number;
  delta30: number;
  hue: Hue;
  spark: number[];
}

interface Budget {
  id: string;
  category: string;
  hue: Hue;
  spent: number;
  limit: number;
  icon: string;
}

interface Bill {
  id: string;
  name: string;
  amount: number;
  due: string;
  dueIn: number;
  status: BillStatus;
  account: string;
  category: string;
  hue: Hue;
  recurring: Recurring;
  autopay: boolean;
  icon: string;
  brandColors: [string, string, string];
}

interface Txn {
  id: string;
  date: string;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  quarterYear: string;
  week: number;
  weekYear: string;
  weekdayName: string;
  weekdayNum: number;
  tzOffset: string;
  entity: string;
  merchant: string;
  account: string;
  accountType: AccountKind;
  category: string;
  spendCategory: string;
  hue: Hue;
  amount: number;
  io: TxnIo;
  currency: "USD";
  memo: string;
  receipt: string;
  incomeSource: string;
  reimbursable: boolean;
  reimbursedOn: string;
  ufInit: boolean;
  status: "cleared" | "pending";
}

interface ReviewItem {
  id: string;
  label: string;
  done: boolean;
  hue: Hue;
}

interface Reminder {
  id: string;
  text: string;
  due: string;
  hue: Hue;
  kind: "review" | "decision" | "action";
}

interface LinkItem {
  id: string;
  title: string;
  type: "Note" | "Project" | "Resource" | "Review";
  hue: Hue;
}

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

const VIEWS: Array<{ id: ViewId; label: string; hue: Hue; badge?: string }> = [
  { id: "overview", label: "Command", hue: "indigo" },
  { id: "accounts", label: "Accounts & Cashflow", hue: "blue" },
  { id: "budgets", label: "Budgets", hue: "teal", badge: "1 over" },
  { id: "bills", label: "Bills & Subscriptions", hue: "orange", badge: "1 due" },
  { id: "review", label: "Monthly Review", hue: "violet" },
  { id: "transactions", label: "Transactions", hue: "neutral" }
];

const SMART_VIEWS: Array<{ id: string; label: string; hue: Hue; count: number; view: ViewId; notice: string }> = [
  { id: "attention", label: "Needs attention", hue: "crimson", count: 3, view: "overview", notice: "Filtered to overdue, over-budget, and action items." },
  { id: "due-week", label: "Due this week", hue: "orange", count: 4, view: "bills", notice: "Bills queue narrowed to due this week." },
  { id: "unreviewed", label: "Unreviewed", hue: "yellow", count: 6, view: "transactions", notice: "Transactions narrowed to pending and review-needed items." },
  { id: "recurring", label: "Recurring", hue: "violet", count: 8, view: "bills", notice: "Bills queue narrowed to recurring obligations." },
  { id: "linked-projects", label: "Linked to projects", hue: "indigo", count: 5, view: "overview", notice: "Showing finance items with linked workspace context." }
];

const accounts: Account[] = [
  { id: "operating", name: "Operating", kind: "Checking", inst: "Mercury", mask: "4021", balance: 18420.55, delta30: 4.2, hue: "blue", spark: [18, 22, 20, 26, 24, 29, 31, 33] },
  { id: "reserve", name: "Reserve", kind: "Savings", inst: "Ally", mask: "7782", balance: 42500, delta30: 1.1, hue: "teal", spark: [39, 39, 41, 41, 43, 43, 44, 46] },
  { id: "petty-cash", name: "Petty / Cash", kind: "Cash", inst: "Vault", mask: "-", balance: 1240, delta30: 0, hue: "yellow", spark: [11, 11, 14, 11, 11, 12, 12, 12] },
  { id: "studio-card", name: "Studio Card", kind: "Credit", inst: "Amex", mask: "1009", balance: -3284.12, delta30: -12, hue: "crimson", spark: [34, 31, 28, 25, 20, 23, 21, 22] },
  { id: "long-hold", name: "Long Hold", kind: "Brokerage", inst: "Fidelity", mask: "5530", balance: 96240, delta30: 2.8, hue: "violet", spark: [84, 86, 85, 88, 91, 90, 93, 95] },
  { id: "unigentamos-llc", name: "Unigentamos LLC", kind: "Business", inst: "Mercury", mask: "3300", balance: 28160, delta30: 3.5, hue: "indigo", spark: [24, 24, 26, 27, 28, 30, 31, 33] }
];

const budgets: Budget[] = [
  { id: "studio-tools", category: "Studio & Tools", hue: "indigo", spent: 640, limit: 900, icon: "Wrench" },
  { id: "saas", category: "Software & SaaS", hue: "cyan", spent: 412, limit: 450, icon: "Cloud" },
  { id: "food", category: "Food & Dining", hue: "orange", spent: 588, limit: 600, icon: "Fork" },
  { id: "health", category: "Health", hue: "green", spent: 180, limit: 400, icon: "Heart" },
  { id: "travel", category: "Travel", hue: "teal", spent: 1240, limit: 1000, icon: "Plane" },
  { id: "home", category: "Home & Utilities", hue: "brown", spent: 720, limit: 850, icon: "Home" },
  { id: "learning", category: "Learning", hue: "violet", spent: 95, limit: 250, icon: "Book" },
  { id: "buffer", category: "Buffer / Misc", hue: "neutral", spent: 210, limit: 500, icon: "Circle" }
];

const bills: Bill[] = [
  { id: "aws", name: "AWS", amount: 188.4, due: "Jun 12", dueIn: 0, status: "overdue", account: "Unigentamos LLC", category: "Software & SaaS", hue: "orange", recurring: "monthly", autopay: false, icon: "Server", brandColors: ["#ff9900", "#232f3e", "#ec7211"] },
  { id: "studio-rent", name: "Studio Rent", amount: 2400, due: "Jun 15", dueIn: 3, status: "due", account: "Operating", category: "Home & Utilities", hue: "crimson", recurring: "monthly", autopay: false, icon: "Building", brandColors: ["#a855f7", "#e11d48", "#f97316"] },
  { id: "adobe", name: "Adobe Creative Cloud", amount: 59.99, due: "Jun 14", dueIn: 2, status: "soon", account: "Studio Card", category: "Software & SaaS", hue: "cyan", recurring: "monthly", autopay: true, icon: "Cloud", brandColors: ["#ff0000", "#fa0f00", "#470137"] },
  { id: "phone", name: "Phone & Data", amount: 78, due: "Jun 16", dueIn: 4, status: "soon", account: "Operating", category: "Home & Utilities", hue: "blue", recurring: "monthly", autopay: true, icon: "Phone", brandColors: ["#0ea5e9", "#2563eb", "#22d3ee"] },
  { id: "health", name: "Health Insurance", amount: 412, due: "Jun 18", dueIn: 6, status: "scheduled", account: "Operating", category: "Health", hue: "green", recurring: "monthly", autopay: true, icon: "Heart", brandColors: ["#16a34a", "#14b8a6", "#86efac"] },
  { id: "figma", name: "Figma Org", amount: 45, due: "Jun 20", dueIn: 8, status: "scheduled", account: "Unigentamos LLC", category: "Software & SaaS", hue: "violet", recurring: "monthly", autopay: true, icon: "Pen", brandColors: ["#f24e1e", "#a259ff", "#1abcfe"] },
  { id: "notion", name: "Notion Team", amount: 32, due: "Jun 22", dueIn: 10, status: "scheduled", account: "Operating", category: "Software & SaaS", hue: "indigo", recurring: "monthly", autopay: true, icon: "Notebook", brandColors: ["#18181b", "#71717a", "#f4f4f5"] },
  { id: "domain", name: "Domain Renewal", amount: 22, due: "Jun 09", dueIn: -3, status: "paid", account: "Studio Card", category: "Software & SaaS", hue: "neutral", recurring: "annual", autopay: true, icon: "Globe", brandColors: ["#71717a", "#d4d4d8", "#a1a1aa"] }
];

function makeTxn(input: Omit<Txn, "currency" | "quarter" | "quarterYear" | "week" | "weekYear" | "tzOffset" | "ufInit"> & Partial<Pick<Txn, "quarter" | "quarterYear" | "week" | "weekYear" | "tzOffset" | "ufInit">>): Txn {
  return {
    currency: "USD",
    quarter: "Q2",
    quarterYear: "2026-Q2",
    week: 24,
    weekYear: "2026-W24",
    tzOffset: "-0400",
    ufInit: true,
    ...input
  };
}

const transactions: Txn[] = [
  makeTxn({ id: "TX-7741", date: "Jun 12", weekdayName: "Friday", weekdayNum: 5, entity: "Apple", merchant: "Apple Store", account: "Studio Card", accountType: "Credit", category: "Studio & Tools", spendCategory: "Hardware", hue: "indigo", amount: -1299, io: "expense", memo: "iPad Pro setup for dashboard review and design work.", receipt: "Apple receipt pending", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "pending" }),
  makeTxn({ id: "TX-7740", date: "Jun 11", weekdayName: "Thursday", weekdayNum: 4, entity: "Stripe", merchant: "Stripe Payout", account: "Operating", accountType: "Checking", category: "Income", spendCategory: "", hue: "green", amount: 6840, io: "income", memo: "Weekly payout cleared to Operating.", receipt: "Stripe payout report", incomeSource: "Client revenue", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTxn({ id: "TX-7739", date: "Jun 11", weekdayName: "Thursday", weekdayNum: 4, entity: "Blue Bottle", merchant: "Blue Bottle", account: "Studio Card", accountType: "Credit", category: "Food & Dining", spendCategory: "Meals", hue: "orange", amount: -18.5, io: "expense", memo: "Coffee before studio block.", receipt: "", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTxn({ id: "TX-7738", date: "Jun 10", weekdayName: "Wednesday", weekdayNum: 3, entity: "AWS", merchant: "AWS", account: "Unigentamos LLC", accountType: "Business", category: "Software & SaaS", spendCategory: "Infrastructure", hue: "cyan", amount: -188.4, io: "expense", memo: "June infra charge; no autopay on bill record.", receipt: "AWS invoice", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTxn({ id: "TX-7737", date: "Jun 10", weekdayName: "Wednesday", weekdayNum: 3, entity: "Whole Foods", merchant: "Whole Foods", account: "Operating", accountType: "Checking", category: "Food & Dining", spendCategory: "Groceries", hue: "orange", amount: -132.18, io: "expense", memo: "Weekly groceries.", receipt: "", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTxn({ id: "TX-7736", date: "Jun 09", weekdayName: "Tuesday", weekdayNum: 2, entity: "Delta", merchant: "Delta Air Lines", account: "Studio Card", accountType: "Credit", category: "Travel", spendCategory: "Flights", hue: "teal", amount: -642, io: "expense", memo: "Project travel; review for reimbursement.", receipt: "Delta itinerary", incomeSource: "", reimbursable: true, reimbursedOn: "", status: "cleared" }),
  makeTxn({ id: "TX-7735", date: "Jun 09", weekdayName: "Tuesday", weekdayNum: 2, entity: "Lumen", merchant: "Consulting - Lumen", account: "Unigentamos LLC", accountType: "Business", category: "Income", spendCategory: "", hue: "green", amount: 3200, io: "income", memo: "Consulting invoice paid.", receipt: "Invoice 2026-06-LUM", incomeSource: "Consulting", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTxn({ id: "TX-7734", date: "Jun 08", weekdayName: "Monday", weekdayNum: 1, entity: "Figma", merchant: "Figma", account: "Unigentamos LLC", accountType: "Business", category: "Software & SaaS", spendCategory: "Design tools", hue: "violet", amount: -45, io: "expense", memo: "Org seat.", receipt: "Figma invoice", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTxn({ id: "TX-7733", date: "Jun 08", weekdayName: "Monday", weekdayNum: 1, entity: "Uber", merchant: "Uber", account: "Operating", accountType: "Checking", category: "Travel", spendCategory: "Ground transport", hue: "teal", amount: -27.4, io: "expense", memo: "Ride from studio.", receipt: "Uber receipt", incomeSource: "", reimbursable: true, reimbursedOn: "", status: "cleared" }),
  makeTxn({ id: "TX-7732", date: "Jun 07", weekdayName: "Sunday", weekdayNum: 7, entity: "Notion", merchant: "Notion", account: "Operating", accountType: "Checking", category: "Software & SaaS", spendCategory: "Knowledge tools", hue: "indigo", amount: -32, io: "expense", memo: "Team workspace.", receipt: "Notion invoice", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "cleared" })
];

const initialReviewItems: ReviewItem[] = [
  { id: "reconcile", label: "Reconcile all accounts", done: true, hue: "green" },
  { id: "categorize", label: "Categorize uncleared transactions", done: true, hue: "green" },
  { id: "budget-overruns", label: "Review budget overruns (Travel +24%)", done: false, hue: "orange" },
  { id: "subscriptions", label: "Audit active subscriptions", done: false, hue: "violet" },
  { id: "caps", label: "Set next month's budget caps", done: false, hue: "indigo" },
  { id: "decisions", label: "File decisions to Notes & Projects", done: false, hue: "cyan" }
];

const reminders: Reminder[] = [
  { id: "rate", text: "Confirm Q3 contractor rate before invoicing", due: "Jun 13", hue: "orange", kind: "decision" },
  { id: "transfer", text: "Move $5k surplus -> Reserve", due: "Jun 14", hue: "teal", kind: "action" },
  { id: "vimeo", text: "Cancel unused Vimeo Pro", due: "Jun 16", hue: "crimson", kind: "action" },
  { id: "close", text: "Monthly close - reconcile Studio Card", due: "Jun 30", hue: "violet", kind: "review" }
];

const linkedContext: LinkItem[] = [
  { id: "pricing", title: "2026 Pricing model rev. C", type: "Note", hue: "yellow" },
  { id: "studio-buildout", title: "Studio buildout", type: "Project", hue: "indigo" },
  { id: "contracts", title: "Vendor contracts / 2026", type: "Resource", hue: "brown" },
  { id: "may-close", title: "May monthly close", type: "Review", hue: "violet" }
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

function totals() {
  const liquid = accounts
    .filter((account) => account.balance > 0 && account.kind !== "Brokerage")
    .reduce((sum, account) => sum + account.balance, 0);
  const debt = accounts.filter((account) => account.balance < 0).reduce((sum, account) => sum + account.balance, 0);
  const net = accounts.reduce((sum, account) => sum + account.balance, 0);
  const lastMonthOut = 6084;
  return { liquid, debt, net, runway: liquid / lastMonthOut };
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
  onClick
}: {
  children: React.ReactNode;
  icon: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={classNames("finance-action", primary && "is-primary")} onClick={onClick}>
      <Icon name={icon} />
      {children}
    </button>
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

function polylinePoints(values: number[], width: number, height: number, pad = 4) {
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

function Sparkline({ values, hue }: { values: number[]; hue: Hue }) {
  return (
    <svg className="finance-sparkline" viewBox="0 0 96 34" aria-hidden="true" style={hueStyle(hue)}>
      <polyline points={polylinePoints(values, 96, 34)} />
    </svg>
  );
}

function CashflowChart({ compact = false }: { compact?: boolean }) {
  const income = [9.1, 8.8, 8.7, 10.6, 11.1, 10.4, 10.0, 11.4, 12.7, 12.4, 11.6, 10.0];
  const spend = [9.2, 8.7, 8.6, 10.5, 11.1, 10.5, 10.0, 11.2, 12.7, 12.5, 11.7, 10.1];
  const savings = [1.6, 0.8, 1.1, 2.4, 3.0, -0.4, 1.2, 2.8, 3.4, 2.7, -0.6, 3.9];
  const width = 920;
  const height = compact ? 185 : 210;
  const padX = 48;
  const padY = 24;
  const plotH = height - padY * 2;
  const yMin = -4;
  const yMax = 16;
  const toPoints = (values: number[]) => values
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

  return (
    <div className={classNames("finance-chart", compact && "is-compact")}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Cashflow chart">
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
        {["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((label, index) => (
          <text className="axis-month" key={label} x={padX + (index / 5) * (width - padX - 12)} y={height - 4}>
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Meter({ value, hue, over = false }: { value: number; hue: Hue; over?: boolean }) {
  return (
    <div className="finance-meter" style={hueStyle(over ? "crimson" : hue)}>
      <span style={{ width: `${Math.min(value, 100)}%` }} />
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
  selected,
  onSelect
}: {
  account: Account;
  selected?: boolean;
  onSelect: (account: Account) => void;
}) {
  const moneyHue = account.balance < 0 ? "crimson" : account.hue;
  return (
    <button type="button" className={classNames("finance-account-row", selected && "is-selected")} onClick={() => onSelect(account)}>
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

function SectionBand({ hue, label, count }: { hue: Hue; label: string; count: number }) {
  return (
    <div className="finance-section-band" style={hueStyle(hue)}>
      <Swatch hue={hue} />
      <span>{label}</span>
      <small>· {count}</small>
    </div>
  );
}

function transactionProperties(txn: Txn) {
  return [
    ["quarter", txn.quarter],
    ["quarteryear", txn.quarterYear],
    ["week", String(txn.week)],
    ["weekyear", txn.weekYear],
    ["weekday_name", txn.weekdayName],
    ["weekday_num", String(txn.weekdayNum)],
    ["tz_offset", txn.tzOffset],
    ["entity", txn.entity],
    ["account", txn.account],
    ["amount", money(txn.amount, { sign: true, cents: true })],
    ["io", txn.io],
    ["currency", txn.currency],
    ["account_type", txn.accountType],
    ["spend_category", txn.spendCategory || "n/a"],
    ["memo", txn.memo],
    ["receipt", txn.receipt || "none"],
    ["income_source", txn.incomeSource || "none"],
    ["reimbursable", txn.reimbursable ? "true" : "false"],
    ["reimbursed_on", txn.reimbursedOn || "none"],
    ["uf_init", txn.ufInit ? "true" : "false"]
  ];
}

function RecentTransactionsRail({ onNotice }: { onNotice: (notice: string) => void }) {
  return (
    <section className="finance-context-card finance-recent-card" aria-label="Recent transactions">
      <div className="finance-context-heading">
        <span><Swatch hue="blue" />Recent</span>
        <strong>{transactions.length}</strong>
      </div>
      <div className="finance-recent-list">
        {transactions.slice(0, 7).map((txn) => (
          <button type="button" key={txn.id} onClick={() => onNotice(`${txn.merchant} opened from recent transactions.`)} style={hueStyle(txn.hue)}>
            <span><Swatch hue={txn.hue} /><strong>{txn.merchant}</strong></span>
            <small>{txn.date} · {txn.account}</small>
            <em className={txn.amount > 0 ? "is-green" : ""}>{money(txn.amount, { sign: true, cents: true })}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function SubscriptionValueRail({ onNotice }: { onNotice: (notice: string) => void }) {
  const monthlyBills = bills.filter((bill) => bill.recurring);
  const [expanded, setExpanded] = useState("");
  const selected = monthlyBills.find((bill) => bill.id === expanded);
  return (
    <section className="finance-context-card finance-subscription-card" aria-label="Blind subscription value audit">
      <div className="finance-context-heading">
        <span><Swatch hue="violet" />Subscriptions</span>
        <strong>{monthlyBills.length}</strong>
      </div>
      <p className="finance-context-copy">Judge the monthly cost first. Hover or click to reveal the vendor.</p>
      <div className="finance-subscription-orbits">
        {monthlyBills.map((bill) => (
          <button
            type="button"
            key={bill.id}
            className={classNames("finance-subscription-squircle", expanded === bill.id && "is-expanded")}
            onClick={() => {
              setExpanded(bill.id);
              onNotice(`${bill.name} subscription selected for value review.`);
            }}
            style={{
              ...hueStyle(bill.hue),
              "--subscription-a": bill.brandColors[0],
              "--subscription-b": bill.brandColors[1],
              "--subscription-c": bill.brandColors[2]
            } as React.CSSProperties}
          >
            <strong>{money(bill.amount, { cents: bill.amount % 1 !== 0 })}</strong>
            <span>{bill.name}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="finance-subscription-detail" style={hueStyle(selected.hue)}>
          <span>Selected</span>
          <strong>{selected.name}</strong>
          <small>{money(selected.amount, { cents: true })}/mo · {selected.account}</small>
          <button type="button" onClick={() => onNotice(`${selected.name} expanded into subscription detail.`)}>Open detail</button>
        </div>
      )}
    </section>
  );
}

function FinanceContextRail({ view, onNotice }: { view: ViewId; onNotice: (notice: string) => void }) {
  if (view === "bills") {
    return (
      <aside className="finance-context-rail" aria-label="Finance context">
        <SubscriptionValueRail onNotice={onNotice} />
      </aside>
    );
  }
  if (view === "overview" || view === "transactions") {
    return (
      <aside className="finance-context-rail" aria-label="Finance context">
        <RecentTransactionsRail onNotice={onNotice} />
      </aside>
    );
  }
  return null;
}

function FinanceSidebar({
  view,
  setView,
  smartFilter,
  onSmart,
  mobileOpen,
  onClose
}: {
  view: ViewId;
  setView: (view: ViewId) => void;
  smartFilter: string;
  onSmart: (id: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <aside className={classNames("finance-sidebar", mobileOpen && "is-mobile-open")} aria-label="Finance sidebar">
      <div className="finance-sidebar-header">
        <div>
          <h2>Finance</h2>
          <p>June 2026 · monthly close in 18d</p>
        </div>
        <Chip hue="green" dot>LIVE</Chip>
      </div>
      <nav className="finance-sidebar-nav" aria-label="Finance views">
        {VIEWS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={classNames(view === item.id && "is-active")}
            onClick={() => {
              setView(item.id);
              onClose();
            }}
            style={hueStyle(item.hue)}
          >
            <Swatch hue={item.hue} />
            <span>{item.label}</span>
            {item.badge && <small>{item.badge}</small>}
          </button>
        ))}
      </nav>
      <div className="finance-sidebar-section">
        <p>SMART VIEWS</p>
        {SMART_VIEWS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={classNames(smartFilter === item.id && "is-active")}
            onClick={() => {
              onSmart(item.id);
              onClose();
            }}
            style={hueStyle(item.hue)}
          >
            <Swatch hue={item.hue} />
            <span>{item.label}</span>
            <small>{item.count}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}

function OverviewView({
  selected,
  onSelect,
  onModal,
  onNotice
}: {
  selected: Account | null;
  onSelect: (account: Account) => void;
  onModal: (modal: ModalKind) => void;
  onNotice: (notice: string) => void;
}) {
  const summary = totals();
  return (
    <>
      <WorkspaceHeader
        title="Command"
        subtitle="What matters now · due soon · changed · needs review"
        actions={<><HeaderAction icon="Filter" onClick={() => onModal("filter")}>Filter</HeaderAction><HeaderAction icon="Plus" primary onClick={() => onModal("record")}>Record</HeaderAction></>}
      />
      <Panel className="finance-kpi-strip">
        {[
          ["Net worth", money(summary.net), "+3.4% vs last month", "indigo"],
          ["Liquid", money(summary.liquid), "+2.1% across 5 accts", "teal"],
          ["Debt", money(summary.debt), "-12% 1 card", "crimson"],
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
            <div><span>Net this month</span><strong className="is-green">+$3,900</strong></div>
            <div><span>Avg burn</span><strong>$7,766</strong></div>
            <div><span>Savings rate</span><strong>39%</strong></div>
          </div>
        </Panel>
        <Panel hue="crimson">
          <div className="finance-panel-heading"><h2>Needs attention <span>3</span></h2></div>
          <div className="finance-attention-list">
            {[
              ["Alert", "AWS payment overdue", "$188.40 · no autopay", "OVERDUE", "crimson"],
              ["Trending", "Travel over budget", "+24% · $1,240 / $1,000", "BUDGET", "orange"],
              ["PiggyBank", "$5k surplus idle", "move to Reserve?", "ACTION", "violet"]
            ].map(([icon, title, sub, chip, hue]) => (
              <button type="button" key={title} onClick={() => onNotice(`${title} selected for review.`)}>
                <IconTile hue={hue as Hue} icon={icon} />
                <span><strong>{title}</strong><small>{sub}</small></span>
                <Chip hue={hue as Hue}>{chip}</Chip>
              </button>
            ))}
          </div>
        </Panel>
        <Panel hue="blue" className="finance-span-2">
          <div className="finance-panel-heading"><h2>Accounts <span>6</span></h2><button type="button" onClick={() => onModal("account")}>All -&gt;</button></div>
          <div className="finance-account-list">
            {accounts.slice(0, 4).map((account) => (
              <AccountRow key={account.id} account={account} selected={selected?.id === account.id} onSelect={onSelect} />
            ))}
          </div>
        </Panel>
        <Panel hue="orange">
          <div className="finance-panel-heading"><h2>Due soon <span>next 10d</span></h2></div>
          <div className="finance-timeline">
            {bills.filter((bill) => bill.dueIn >= 0).slice(0, 5).map((bill) => (
              <button type="button" key={bill.id} onClick={() => onNotice(`${bill.name} bill opened.`)} style={hueStyle(statusHue(bill.status))}>
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

function AccountsView({
  selected,
  onSelect,
  onModal
}: {
  selected: Account | null;
  onSelect: (account: Account) => void;
  onModal: (modal: ModalKind) => void;
}) {
  const groups = [
    { label: "Cash & deposits", hue: "blue" as Hue, rows: accounts.filter((account) => ["Checking", "Savings", "Cash"].includes(account.kind)) },
    { label: "Credit & liabilities", hue: "crimson" as Hue, rows: accounts.filter((account) => account.kind === "Credit") },
    { label: "Investments & business", hue: "violet" as Hue, rows: accounts.filter((account) => ["Brokerage", "Business"].includes(account.kind)) }
  ];
  return (
    <>
      <WorkspaceHeader
        title="Accounts & Cashflow"
        subtitle="Balances, movement, and money in vs out"
        actions={<><HeaderAction icon="Sliders" onClick={() => onModal("filter")}>Group: Type</HeaderAction><HeaderAction icon="Plus" primary onClick={() => onModal("account")}>Link account</HeaderAction></>}
      />
      <Panel hue="teal"><div className="finance-panel-heading"><h2>Cashflow <span>6 mo · $k</span></h2><div><Chip hue="teal" dot>in</Chip><Chip hue="orange" dot>out</Chip><Chip hue="indigo" dot>savings</Chip></div></div><CashflowChart /></Panel>
      <Panel hue="blue" className="finance-ledger-panel">
        <div className="finance-panel-heading"><h2>All accounts <span>6</span></h2></div>
        {groups.map((group) => (
          <div key={group.label}>
            <SectionBand hue={group.hue} label={group.label} count={group.rows.length} />
            <div className="finance-account-list">
              {group.rows.map((account) => (
                <AccountRow key={account.id} account={account} selected={selected?.id === account.id} onSelect={onSelect} />
              ))}
            </div>
          </div>
        ))}
      </Panel>
    </>
  );
}

function BudgetsView({ onModal, onNotice }: { onModal: (modal: ModalKind) => void; onNotice: (notice: string) => void }) {
  const totalSpent = budgets.reduce((sum, budget) => sum + budget.spent, 0);
  const totalLimit = budgets.reduce((sum, budget) => sum + budget.limit, 0);
  const pct = Math.round((totalSpent / totalLimit) * 100);
  return (
    <>
      <WorkspaceHeader
        title="Budgets"
        subtitle={`June · ${money(totalSpent)} of ${money(totalLimit)} spent`}
        actions={<><HeaderAction icon="Calendar" onClick={() => onModal("filter")}>June</HeaderAction><HeaderAction icon="Plus" primary onClick={() => onModal("category")}>New category</HeaderAction></>}
      />
      <Panel hue="teal">
        <div className="finance-budget-summary">
          <div><span>Total spent</span><strong>{money(totalSpent)} <em>/ {money(totalLimit)}</em></strong></div>
          <Chip hue={pct > 100 ? "crimson" : "green"}>{pct}% used</Chip>
        </div>
        <div className="finance-stacked-bar">
          {budgets.map((budget) => (
            <span key={budget.id} title={budget.category} style={{ width: `${(budget.spent / totalLimit) * 100}%`, background: HUES[budget.hue].solid }} />
          ))}
        </div>
      </Panel>
      <div className="finance-budget-grid">
        {budgets.map((budget) => {
          const used = Math.round((budget.spent / budget.limit) * 100);
          const over = used > 100;
          return (
            <button type="button" key={budget.id} className="finance-budget-card" style={hueStyle(over ? "crimson" : budget.hue)} onClick={() => onNotice(`${budget.category} detail shell opened.`)}>
              <IconTile hue={budget.hue} icon={budget.icon} />
              <span><strong>{budget.category} {over && <Chip hue="crimson">OVER</Chip>}</strong><small>{money(budget.spent)} of {money(budget.limit)}</small></span>
              <strong className={over ? "is-negative" : ""}>{used}%</strong>
              <Meter value={used} hue={budget.hue} over={over} />
            </button>
          );
        })}
      </div>
    </>
  );
}

function statusHue(status: BillStatus): Hue {
  return ({ overdue: "crimson", due: "orange", soon: "yellow", scheduled: "blue", paid: "green" } as Record<BillStatus, Hue>)[status];
}

function statusLabel(status: BillStatus) {
  return ({ overdue: "OVERDUE", due: "DUE", soon: "SOON", scheduled: "SCHEDULED", paid: "PAID" } as Record<BillStatus, string>)[status];
}

function BillsView({
  onModal,
  recurringOnly,
  onNotice
}: {
  onModal: (modal: ModalKind) => void;
  recurringOnly: boolean;
  onNotice: (notice: string) => void;
}) {
  const visibleBills = recurringOnly ? bills.filter((bill) => bill.recurring) : bills;
  const monthly = bills.reduce((sum, bill) => sum + (bill.recurring === "monthly" ? bill.amount : bill.recurring === "annual" ? bill.amount / 12 : bill.amount * 4), 0);
  const autopayPct = Math.round((bills.filter((bill) => bill.autopay).length / bills.length) * 100);
  const groups: BillStatus[] = ["overdue", "due", "soon", "scheduled", "paid"];
  return (
    <>
      <WorkspaceHeader
        title="Bills & Subscriptions"
        subtitle={`${bills.length} obligations · ${money(monthly, { cents: true })}/mo recurring`}
        actions={<><HeaderAction icon="Filter" onClick={() => onModal("filter")}>Status</HeaderAction><HeaderAction icon="Plus" primary onClick={() => onModal("bill")}>Add bill</HeaderAction></>}
      />
      <div className="finance-two-col">
        <Panel hue="orange" className="finance-span-2">
          <div className="finance-panel-heading"><h2>Payment queue <span>by urgency</span></h2></div>
          {groups.map((status) => {
            const rows = visibleBills.filter((bill) => bill.status === status);
            if (rows.length === 0) return null;
            return (
              <div key={status}>
                <SectionBand hue={statusHue(status)} label={statusLabel(status)} count={rows.length} />
                {rows.map((bill) => (
                  <button type="button" className="finance-bill-row" key={bill.id} onClick={() => onNotice(`${bill.name} bill detail shell opened.`)}>
                    <IconTile hue={bill.hue} icon={bill.icon} />
                    <span><strong>{bill.name} {bill.autopay && <Chip hue="cyan">auto</Chip>} {bill.recurring && <Chip hue="neutral">{bill.recurring}</Chip>}</strong><small>{bill.account} · {bill.category}</small></span>
                    <span><strong>{money(bill.amount, { cents: true })}</strong><small>{bill.due}</small></span>
                    <Chip hue={statusHue(bill.status)} solid={bill.status === "overdue"}>{statusLabel(bill.status)}</Chip>
                  </button>
                ))}
              </div>
            );
          })}
        </Panel>
        <div className="finance-side-stack">
          <Panel hue="violet"><div className="finance-panel-heading"><h2>Recurring spend <span>monthly</span></h2></div><strong className="finance-big-number">{money(monthly, { cents: true })}</strong><p className="finance-muted">{bills.filter((bill) => bill.recurring).length} active subscriptions</p><div className="finance-mini-list">{bills.filter((bill) => bill.recurring).slice(0, 5).map((bill) => <div key={bill.id}><Swatch hue={bill.hue} /><span>{bill.name}</span><strong>{money(bill.amount, { cents: true })}</strong></div>)}</div></Panel>
          <Panel hue="cyan"><div className="finance-panel-heading"><h2>Autopay coverage</h2></div><strong className="finance-big-number">{autopayPct}% <span>on autopay</span></strong><Meter value={autopayPct} hue="cyan" /><p className="finance-muted">2 bills need manual payment this month, including AWS overdue.</p></Panel>
        </div>
      </div>
    </>
  );
}

function ReviewView({
  reviewItems,
  setReviewItems,
  onNotice
}: {
  reviewItems: ReviewItem[];
  setReviewItems: (items: ReviewItem[]) => void;
  onNotice: (notice: string) => void;
}) {
  const done = reviewItems.filter((item) => item.done).length;
  const pct = Math.round((done / reviewItems.length) * 100);
  function toggle(id: string) {
    setReviewItems(reviewItems.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  }
  return (
    <>
      <WorkspaceHeader
        title="Monthly Review"
        subtitle="June close · prep, reconcile, and file decisions"
        actions={<><a className="finance-action" href="/admin/reviews/monthly"><Icon name="Link" />Link to Reviews</a><HeaderAction icon="Check" primary onClick={() => onNotice("June close snapshot queued for Reviews and decision Notes.")}>Complete close</HeaderAction></>}
      />
      <div className="finance-two-col">
        <Panel hue="violet" className="finance-span-2">
          <div className="finance-panel-heading"><h2>Close checklist <span>{done}/{reviewItems.length}</span></h2></div>
          <Meter value={pct} hue="violet" />
          <div className="finance-checklist">
            {reviewItems.map((item) => (
              <button type="button" key={item.id} onClick={() => toggle(item.id)} className={item.done ? "is-done" : ""} style={hueStyle(item.hue)}>
                <span className="finance-checkbox">{item.done && <Icon name="Check" />}</span>
                <strong>{item.label}</strong>
                <Swatch hue={item.hue} />
              </button>
            ))}
          </div>
        </Panel>
        <div className="finance-side-stack">
          <Panel hue="indigo"><div className="finance-panel-heading"><h2>Month at a glance</h2></div><div className="finance-month-grid"><div><span>Income</span><strong className="is-green">+$10,040</strong></div><div><span>Spend</span><strong className="is-orange">-$6,140</strong></div><div><span>Net saved</span><strong>+$3,900</strong></div></div></Panel>
          <Panel hue="yellow"><div className="finance-panel-heading"><h2>Decisions to file <span>2</span></h2></div><div className="finance-decision-list">{reminders.filter((item) => item.kind === "decision" || item.kind === "review").map((item) => <button type="button" key={item.id} onClick={() => onNotice(`${item.text} will file to Notes.`)}><IconTile hue={item.hue} icon="Notebook" small /><span><strong>{item.text}</strong><small>due {item.due} -&gt; Notes</small></span></button>)}</div></Panel>
        </div>
      </div>
    </>
  );
}

function TransactionPropertiesPanel({ txn }: { txn: Txn }) {
  return (
    <Panel hue={txn.hue} className="finance-transaction-properties">
      <div className="finance-panel-heading">
        <h2>{txn.merchant} <span>{txn.id}</span></h2>
        <Chip hue={txn.io === "income" ? "green" : txn.io === "savings" ? "indigo" : "neutral"}>{txn.io}</Chip>
      </div>
      <div className="finance-property-grid">
        {transactionProperties(txn).map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TransactionsView({
  query,
  setQuery,
  pendingOnly,
  onModal,
  onNotice
}: {
  query: string;
  setQuery: (query: string) => void;
  pendingOnly: boolean;
  onModal: (modal: ModalKind) => void;
  onNotice: (notice: string) => void;
}) {
  const [selectedTxnId, setSelectedTxnId] = useState(transactions[0]?.id || "");
  const cleanQuery = query.trim().toLowerCase();
  const visible = transactions.filter((txn) => {
    const text = `${txn.date} ${txn.merchant} ${txn.account} ${txn.category} ${txn.amount} ${txn.id}`.toLowerCase();
    return (!pendingOnly || txn.status === "pending") && (!cleanQuery || text.includes(cleanQuery));
  });
  const selectedTxn = visible.find((txn) => txn.id === selectedTxnId) || visible[0] || transactions[0];
  return (
    <>
      <WorkspaceHeader
        title="Transactions"
        subtitle={`${visible.length} this period · search, filter, reconcile`}
        actions={<><HeaderAction icon="Sliders" onClick={() => onModal("columns")}>Columns</HeaderAction><HeaderAction icon="Plus" primary onClick={() => onModal("record")}>Record</HeaderAction></>}
      />
      <Panel className="finance-filter-panel">
        <label><Icon name="Search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search merchant, amount, note..." /></label>
        {["Account: All", "Category: All", "Status: All", "This month"].map((label, index) => <button type="button" key={label} onClick={() => onModal("filter")}><Swatch hue={["blue", "indigo", "green", "violet"][index] as Hue} />{label}<Icon name="Chevron" /></button>)}
      </Panel>
      <Panel className="finance-transaction-table">
        <div className="finance-table-head"><span>Date</span><span>Merchant</span><span>Account</span><span>Category</span><span>Status</span><span>Amount</span></div>
        {visible.map((txn) => (
          <button
            type="button"
            className={classNames("finance-table-row", selectedTxn.id === txn.id && "is-selected")}
            key={txn.id}
            onClick={() => {
              setSelectedTxnId(txn.id);
              onNotice(`${txn.merchant} properties selected.`);
            }}
          >
            <span>{txn.date}</span>
            <strong><Swatch hue={txn.hue} />{txn.merchant} <small>{txn.id}</small></strong>
            <span>{txn.account}</span>
            <span><Chip hue={txn.hue}>{txn.category}</Chip></span>
            <span><Chip hue={txn.status === "pending" ? "yellow" : "neutral"}>{txn.status}</Chip></span>
            <strong className={txn.amount > 0 ? "is-green" : ""}>{money(txn.amount, { sign: true, cents: true })}</strong>
          </button>
        ))}
      </Panel>
      {selectedTxn && <TransactionPropertiesPanel txn={selectedTxn} />}
    </>
  );
}

function RightRail({ account, onClose, onNotice }: { account: Account | null; onClose: () => void; onNotice: (notice: string) => void }) {
  if (!account) return null;
  return (
    <aside className="finance-right-rail" aria-label={`${account.name} detail`}>
      <button type="button" className="finance-rail-close" onClick={onClose} aria-label="Close account detail"><Icon name="X" /></button>
      <IconTile hue={account.hue} icon={accountIcon(account.kind)} />
      <h2>{account.name} <Chip hue={account.hue}>{account.kind}</Chip></h2>
      <p>{account.inst} · {account.mask} · AC-01</p>
      <div className="finance-rail-balance">
        <span>Current balance</span>
        <strong className={account.balance < 0 ? "is-negative" : ""}>{money(account.balance, { cents: true })}</strong>
        <small>{account.delta30 >= 0 ? "+" : ""}{account.delta30}% over 30 days</small>
        <Sparkline values={account.spark} hue={account.balance < 0 ? "crimson" : account.hue} />
      </div>
      <div className="finance-rail-actions">
        <button type="button" onClick={() => onNotice(`Transfer flow opened for ${account.name}.`)}>Transfer</button>
        <button type="button" onClick={() => onNotice(`Reconcile flow opened for ${account.name}.`)}>Reconcile</button>
      </div>
      <SectionBand hue="blue" label="Recent activity" count={4} />
      <div className="finance-rail-list">
        {transactions.slice(1, 5).map((txn) => <button type="button" key={txn.id} onClick={() => onNotice(`${txn.merchant} opened from account rail.`)}><Swatch hue={txn.hue} /><span><strong>{txn.merchant}</strong><small>{txn.date} · {txn.category}</small></span><strong>{money(txn.amount, { sign: true, cents: true })}</strong></button>)}
      </div>
      <SectionBand hue="indigo" label="Linked context" count={linkedContext.length} />
      <div className="finance-rail-list">
        {linkedContext.map((item) => <a key={item.id} href={`/admin/${item.type === "Note" ? "notes" : item.type.toLowerCase() + "s"}`}><IconTile hue={item.hue} icon={item.type === "Project" ? "Briefcase" : item.type === "Resource" ? "LineChart" : "Notebook"} small /><span><strong>{item.title}</strong><small>{item.type}</small></span></a>)}
      </div>
    </aside>
  );
}

function ModalShell({ modal, onClose, onNotice }: { modal: ModalKind; onClose: () => void; onNotice: (notice: string) => void }) {
  if (!modal) return null;
  const content: Record<Exclude<ModalKind, null>, { title: string; body: string; fields: string[]; action: string }> = {
    record: { title: "Record finance item", body: "Create a manual transaction, reminder, or decision without adding bank credentials.", fields: ["Type", "Amount", "Linked context"], action: "Save record shell" },
    filter: { title: "Finance filters", body: "Apply deterministic filters to the current finance view.", fields: ["Status", "Account", "Category"], action: "Apply filters" },
    account: { title: "Link or add account", body: "Slice 1 uses a manual account shell. Future bank linking plugs in here.", fields: ["Account name", "Institution", "Type"], action: "Save manual account" },
    category: { title: "New budget category", body: "Create a budget cap with a hue, icon, and review cadence.", fields: ["Category", "Monthly cap", "Hue"], action: "Save category" },
    bill: { title: "Add bill", body: "Capture vendor, due date, amount, cadence, account, and autopay status.", fields: ["Vendor", "Amount", "Due date"], action: "Save bill" },
    columns: { title: "Transaction columns", body: "Choose the visible ledger columns for repeated review.", fields: ["Date", "Category", "Linked note"], action: "Apply columns" },
    pay: { title: "Pay AWS now", body: "Open a guarded payment flow for the overdue AWS obligation.", fields: ["Bill", "Amount", "Funding account"], action: "Prepare payment" },
    transfer: { title: "Draft surplus transfer", body: "Prefill a transfer from Operating to Reserve for monthly close review.", fields: ["From", "To", "Amount"], action: "Draft transfer" }
  };
  const item = content[modal];
  return (
    <div className="finance-modal-backdrop" role="presentation">
      <section className="finance-modal" role="dialog" aria-modal="true" aria-label={item.title}>
        <button type="button" className="finance-rail-close" onClick={onClose} aria-label="Close modal"><Icon name="X" /></button>
        <h2>{item.title}</h2>
        <p>{item.body}</p>
        <div>
          {item.fields.map((field) => <label key={field}>{field}<input placeholder={field} /></label>)}
        </div>
        <button type="button" className="finance-action is-primary" onClick={() => { onNotice(`${item.title} action is ready for backend wiring.`); onClose(); }}>{item.action}</button>
      </section>
    </div>
  );
}

export default function FinanceWorkspace() {
  const [view, setView] = useState<ViewId>("overview");
  const [selected, setSelected] = useState<Account | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [notice, setNotice] = useState("");
  const [smartFilter, setSmartFilter] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [reviewItems, setReviewItems] = useState(initialReviewItems);

  const showRail = (view === "overview" || view === "accounts") && selected;
  const showContext = view === "overview" || view === "bills" || view === "transactions";
  const activeSmart = useMemo(() => SMART_VIEWS.find((item) => item.id === smartFilter), [smartFilter]);

  function handleSmart(id: string) {
    const smart = SMART_VIEWS.find((item) => item.id === id);
    if (smart) {
      setSmartFilter(id);
      setView(smart.view);
      setNotice(smart.notice);
      return;
    }
    const reminder = reminders.find((item) => item.id === id);
    setNotice(reminder ? `${reminder.text} opened as a follow-up shell.` : "");
  }

  return (
    <div className={classNames("finance-workspace", showContext && "has-context", showRail && "has-rail")}>
      <span className="module-ref-regression-sentinel">Finance command view</span>
      <button type="button" className="finance-mobile-menu" onClick={() => setMobileSidebarOpen(true)} aria-label="Open Finance sidebar">Finance</button>
      {mobileSidebarOpen && <button type="button" className="finance-mobile-scrim" onClick={() => setMobileSidebarOpen(false)} aria-label="Close Finance sidebar" />}
      <FinanceSidebar view={view} setView={(next) => { setView(next); setSmartFilter(""); }} smartFilter={smartFilter} onSmart={handleSmart} mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      {showContext && <FinanceContextRail view={view} onNotice={setNotice} />}
      <main className="finance-main-workspace">
        {notice && <div className="finance-notice"><Swatch hue={activeSmart?.hue || "indigo"} /><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Clear</button></div>}
        {view === "overview" && <OverviewView selected={selected} onSelect={setSelected} onModal={setModal} onNotice={setNotice} />}
        {view === "accounts" && <AccountsView selected={selected} onSelect={setSelected} onModal={setModal} />}
        {view === "budgets" && <BudgetsView onModal={setModal} onNotice={setNotice} />}
        {view === "bills" && <BillsView onModal={setModal} recurringOnly={smartFilter === "recurring"} onNotice={setNotice} />}
        {view === "review" && <ReviewView reviewItems={reviewItems} setReviewItems={setReviewItems} onNotice={setNotice} />}
        {view === "transactions" && <TransactionsView query={query} setQuery={setQuery} pendingOnly={smartFilter === "unreviewed"} onModal={setModal} onNotice={setNotice} />}
      </main>
      <RightRail account={showRail ? selected : null} onClose={() => setSelected(null)} onNotice={setNotice} />
      <ModalShell modal={modal} onClose={() => setModal(null)} onNotice={setNotice} />
    </div>
  );
}
