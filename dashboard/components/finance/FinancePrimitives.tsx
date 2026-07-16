"use client";

import { useId } from "react";
import type {
  CSSProperties,
  MouseEventHandler,
  ReactNode
} from "react";
import type {
  FinanceAccountKind,
  FinanceCashflowSeries,
  FinanceHue
} from "../../lib/modules/finance/types";

export interface FinanceHueTokens {
  readonly fg: string;
  readonly tint: string;
  readonly border: string;
  readonly solid: string;
}

export type FinanceHueStyle = CSSProperties & {
  "--finance-hue-fg": string;
  "--finance-hue-tint": string;
  "--finance-hue-border": string;
  "--finance-hue-solid": string;
};

export const HUES: Readonly<Record<FinanceHue, FinanceHueTokens>> = {
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

export function hueStyle(hue: FinanceHue): FinanceHueStyle {
  const value = HUES[hue];
  return {
    "--finance-hue-fg": value.fg,
    "--finance-hue-tint": value.tint,
    "--finance-hue-border": value.border,
    "--finance-hue-solid": value.solid
  };
}

export interface MoneyOptions {
  readonly cents?: boolean;
  readonly sign?: boolean;
}

const WHOLE_DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const CENTS_DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function money(value: number, options: MoneyOptions = {}): string {
  const formatted = (options.cents ? CENTS_DOLLARS : WHOLE_DOLLARS).format(Math.abs(value));
  if (options.sign) return `${value >= 0 ? "+" : "-"}${formatted}`;
  return `${value < 0 ? "-" : ""}${formatted}`;
}

export type ClassNamePart = string | false | null | undefined;

export function classNames(...parts: readonly ClassNamePart[]): string {
  return parts.filter(Boolean).join(" ");
}

export type FinanceIconName =
  | "Wallet"
  | "PiggyBank"
  | "CreditCard"
  | "LineChart"
  | "Banknote"
  | "Briefcase"
  | "Alert"
  | "Trending"
  | "Calendar"
  | "Filter"
  | "Plus"
  | "Search"
  | "Sliders"
  | "Check"
  | "Link"
  | "Sparkles"
  | "Send"
  | "X"
  | "Chevron";

const ICON_PATHS: Readonly<Record<FinanceIconName, ReactNode>> = {
  Wallet: <><path d="M4 7.5h16v10H4z" /><path d="M16 11h4v3h-4z" /><path d="M6.5 7.5V5.8L16 4v3.5" /></>,
  PiggyBank: <><path d="M5 12c0-3 2.6-5 6.2-5H15c2.8 0 5 2 5 4.6 0 2.8-2.3 5.1-5.2 5.1H9l-2 2H5.5v-3.1A5 5 0 0 1 5 12z" /><path d="M16 8V5h2" /><circle cx="15.5" cy="10" r=".5" /></>,
  CreditCard: <><path d="M3.5 6.5h17v11h-17z" /><path d="M3.5 9.5h17" /><path d="M7 14h3" /></>,
  LineChart: <><path d="M4 18h16" /><path d="M5 15l4-4 3 2 5-7 2 2" /></>,
  Banknote: <><path d="M4 7h16v10H4z" /><circle cx="12" cy="12" r="2" /><path d="M7 9.5v5M17 9.5v5" /></>,
  Briefcase: <><path d="M4 8h16v10H4z" /><path d="M9 8V6h6v2" /><path d="M4 12h16" /></>,
  Alert: <><path d="M12 4l9 16H3z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  Trending: <><path d="M4 16l5-5 3 3 7-7" /><path d="M15 7h4v4" /></>,
  Calendar: <><path d="M5 5h14v15H5z" /><path d="M8 3v4M16 3v4M5 9h14" /></>,
  Filter: <path d="M4 5h16l-6 7v5l-4 2v-7z" />,
  Plus: <path d="M12 5v14M5 12h14" />,
  Search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="M15 15l5 5" /></>,
  Sliders: <><path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h12M20 17h0" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="18" cy="17" r="2" /></>,
  Check: <path d="M5 12l4 4L19 6" />,
  Link: <><path d="M10 8H8a4 4 0 0 0 0 8h2" /><path d="M14 8h2a4 4 0 0 1 0 8h-2" /><path d="M9 12h6" /></>,
  Sparkles: <><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  Send: <><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></>,
  X: <path d="M7 7l10 10M17 7L7 17" />,
  Chevron: <path d="M8 10l4 4 4-4" />
};

export interface IconProps {
  readonly name: string;
}

export function Icon({ name }: IconProps) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };
  const path = ICON_PATHS[name as FinanceIconName] ?? ICON_PATHS.Wallet;

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
      {path}
    </svg>
  );
}

export interface SwatchProps {
  readonly hue: FinanceHue;
}

export function Swatch({ hue }: SwatchProps) {
  return <span className="finance-swatch" style={hueStyle(hue)} aria-hidden="true" />;
}

export interface ChipProps {
  readonly hue: FinanceHue;
  readonly children: ReactNode;
  readonly solid?: boolean;
  readonly dot?: boolean;
}

export function Chip({ hue, children, solid = false, dot = false }: ChipProps) {
  return (
    <span className={classNames("finance-chip", solid && "is-solid", dot && "has-dot")} style={hueStyle(hue)}>
      {dot ? <Swatch hue={hue} /> : null}
      {children}
    </span>
  );
}

export interface IconTileProps {
  readonly hue: FinanceHue;
  readonly icon: string;
  readonly small?: boolean;
}

export function IconTile({ hue, icon, small = false }: IconTileProps) {
  return (
    <span className={classNames("finance-icon-tile", small && "is-small")} style={hueStyle(hue)}>
      <Icon name={icon} />
    </span>
  );
}

export interface PanelProps {
  readonly hue?: FinanceHue;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Panel({ hue, children, className = "" }: PanelProps) {
  return (
    <section className={classNames("finance-panel", hue && "has-accent", className)} style={hue ? hueStyle(hue) : undefined}>
      {children}
    </section>
  );
}

export interface WorkspaceHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  readonly actions: ReactNode;
}

export function WorkspaceHeader({ title, subtitle, actions }: WorkspaceHeaderProps) {
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

export interface HeaderActionProps {
  readonly children: ReactNode;
  readonly icon: string;
  readonly primary?: boolean;
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Compatibility name for an unavailable action; the native disabled attribute is intentionally not used. */
  readonly disabled?: boolean;
  /** A concise unavailable reason. It is visible as a tooltip and announced through aria-describedby. */
  readonly title?: string;
  /** Optionally associates the action with an existing visible explanation, such as FixtureDatasetNotice. */
  readonly reasonId?: string;
}

const UNAVAILABLE_ACTION_STYLE: CSSProperties = {
  borderColor: "#dedee2",
  background: "#f4f4f5",
  color: "#71717a",
  cursor: "not-allowed",
  opacity: 1
};

export function HeaderAction({
  children,
  icon,
  primary = false,
  onClick,
  disabled = false,
  title,
  reasonId
}: HeaderActionProps) {
  const generatedReasonId = `finance-action-reason-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const unavailableReason = title?.trim() || "This action is currently unavailable.";
  const descriptionId = disabled ? reasonId || generatedReasonId : undefined;
  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      type="button"
      className={classNames("finance-action", primary && "is-primary")}
      onClick={handleClick}
      title={disabled ? unavailableReason : title}
      aria-disabled={disabled || undefined}
      aria-describedby={descriptionId}
      data-unavailable={disabled ? "true" : undefined}
      style={disabled ? UNAVAILABLE_ACTION_STYLE : undefined}
    >
      <Icon name={icon} />
      {children}
      {disabled && !reasonId ? <span id={generatedReasonId} className="sr-only">{unavailableReason}</span> : null}
    </button>
  );
}

export interface MeterProps {
  readonly value: number;
  readonly hue: FinanceHue;
  readonly over?: boolean;
}

export function Meter({ value, hue, over = false }: MeterProps) {
  return (
    <div className="finance-meter" style={hueStyle(over ? "crimson" : hue)}>
      <span style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

export interface SectionBandProps {
  readonly hue: FinanceHue;
  readonly label: string;
  readonly count: number;
}

export function SectionBand({ hue, label, count }: SectionBandProps) {
  return (
    <div className="finance-section-band" style={hueStyle(hue)}>
      <Swatch hue={hue} />
      <span>{label}</span>
      <small>· {count}</small>
    </div>
  );
}

export function accountIcon(kind: FinanceAccountKind): FinanceIconName {
  const icons: Record<FinanceAccountKind, FinanceIconName> = {
    Checking: "Wallet",
    Savings: "PiggyBank",
    Credit: "CreditCard",
    Brokerage: "LineChart",
    Cash: "Banknote",
    Business: "Briefcase"
  };
  return icons[kind];
}

function polylinePoints(values: readonly number[], width: number, height: number, pad = 4): string {
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

export interface SparklineProps {
  readonly values: readonly number[];
  readonly hue: FinanceHue;
}

export function Sparkline({ values, hue }: SparklineProps) {
  return (
    <svg className="finance-sparkline" viewBox="0 0 96 34" aria-hidden="true" style={hueStyle(hue)}>
      <polyline points={polylinePoints(values, 96, 34)} />
    </svg>
  );
}

export interface CashflowChartProps {
  readonly cashflow: FinanceCashflowSeries;
  readonly summary: string;
  readonly compact?: boolean;
  readonly ariaLabel?: string;
}

export function CashflowChart({ cashflow, summary, compact = false, ariaLabel }: CashflowChartProps) {
  const { income, spend, savings, months } = cashflow;
  const width = 920;
  const height = compact ? 185 : 210;
  const padX = 48;
  const padY = 24;
  const plotH = height - padY * 2;
  const yMin = -4;
  const yMax = 16;
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const descriptionId = `finance-cashflow-summary-${instanceId}`;
  const spendGradientId = `finance-spend-gradient-${instanceId}`;
  const incomeGradientId = `finance-income-gradient-${instanceId}`;
  const toPoints = (values: readonly number[]) => values
    .map((value, index) => {
      const x = padX + (index / Math.max(values.length - 1, 1)) * (width - padX - 12);
      const y = padY + ((yMax - value) / (yMax - yMin)) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const spendPoints = toPoints(spend);
  const incomePoints = toPoints(income);
  const savingsPoints = toPoints(savings);
  const spendArea = `${padX},${height - padY} ${spendPoints} ${width - 12},${height - padY}`;
  const zeroY = padY + ((yMax - 0) / (yMax - yMin)) * plotH;
  const chartLabel = ariaLabel || `Cashflow over ${months.length} months`;

  return (
    <div className={classNames("finance-chart", compact && "is-compact")}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={chartLabel}
        aria-describedby={descriptionId}
      >
        <defs>
          <linearGradient id={spendGradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={incomeGradientId} x1="0" x2="0" y1="0" y2="1">
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
        <polygon points={spendArea} fill={`url(#${spendGradientId})`} />
        <polyline className="income-line" points={incomePoints} />
        <polyline className="spend-line" points={spendPoints} />
        <polyline className="savings-line" points={savingsPoints} />
        {months.map((label, index) => (
          <text
            className="axis-month"
            key={`${label}-${index}`}
            x={padX + (index / Math.max(months.length - 1, 1)) * (width - padX - 12)}
            y={height - 4}
          >
            {label}
          </text>
        ))}
      </svg>
      <p id={descriptionId} className="sr-only">{summary}</p>
    </div>
  );
}

export interface FixtureDatasetNoticeProps {
  readonly previewLabel: string;
  readonly reason: string;
  readonly id?: string;
  readonly statusLabel?: string;
}

export function FixtureDatasetNotice({
  previewLabel,
  reason,
  id = "finance-preview-status",
  statusLabel = "NOT CONNECTED"
}: FixtureDatasetNoticeProps) {
  return (
    <section id={id} className="finance-dataset-notice" aria-label="Finance data source status">
      <IconTile hue="brown" icon="Wallet" />
      <div>
        <strong>{previewLabel}</strong>
        <span>{reason}</span>
      </div>
      <Chip hue="brown" dot>{statusLabel}</Chip>
    </section>
  );
}
