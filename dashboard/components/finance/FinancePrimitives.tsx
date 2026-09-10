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
import UnigentamosIcon from "../icons/UnigentamosIcon";

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

const JADE = { fg: "#0A5A36", tint: "#E8F5EE", border: "#80CCA8", solid: "#0E7848" };
const BRONZE = { fg: "#6A5228", tint: "#F7F3E8", border: "#DDD0AF", solid: "#9A7840" };
export const HUES: Readonly<Record<FinanceHue, FinanceHueTokens>> = {
  neutral: { fg: "#606A64", tint: "#F2F4F1", border: "#DCE3DD", solid: "#68756C" },
  green: JADE, lime: JADE, teal: JADE, indigo: JADE, blue: JADE, cyan: JADE,
  yellow: BRONZE, orange: BRONZE, brown: BRONZE, pink: BRONZE, purple: BRONZE, violet: BRONZE,
  crimson: { fg: "#A33832", tint: "#FCF0EE", border: "#EAC3BC", solid: "#B64B43" }
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

const ICON_ROLE: Readonly<Record<FinanceIconName, string>> = {
  Wallet: "wallet",
  PiggyBank: "piggy-bank",
  CreditCard: "credit-card",
  LineChart: "line-chart",
  Banknote: "banknote",
  Briefcase: "briefcase",
  Alert: "alert",
  Trending: "trending",
  Calendar: "calendar",
  Filter: "filter",
  Plus: "plus",
  Search: "search",
  Sliders: "sliders",
  Check: "check",
  Link: "link",
  Sparkles: "sparkles",
  Send: "send",
  X: "close",
  Chevron: "chevron-down"
};

export interface IconProps {
  readonly name: string;
}

export function Icon({ name }: IconProps) {
  return <UnigentamosIcon role={ICON_ROLE[name as FinanceIconName] || "wallet"} />;
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
  /** Optionally associates the action with an existing visible explanation. */
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

export { default as CashflowChart } from "./FinanceCashflowChart";
