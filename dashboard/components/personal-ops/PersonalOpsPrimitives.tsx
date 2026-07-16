"use client";

import type { ReactNode } from "react";
import styles from "./PersonalOpsWorkspace.module.css";

export type PersonalOpsTone =
  | "default"
  | "positive"
  | "attention"
  | "danger"
  | "review"
  | "people"
  | "neutral";

function toneData(tone?: PersonalOpsTone) {
  return tone && tone !== "default" ? tone : undefined;
}

export type PersonalOpsStatusItem = {
  id: string;
  label: ReactNode;
  tone?: PersonalOpsTone;
};

export function PersonalOpsStatusLine({
  items,
  ariaLabel = "Current scope status",
  className
}: {
  items: readonly PersonalOpsStatusItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={[styles.statusLine, className].filter(Boolean).join(" ")} aria-label={ariaLabel}>
      {items.map((item) => (
        <span className={styles.statusLineItem} data-tone={toneData(item.tone)} key={item.id}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

export type PersonalOpsMetricItem = {
  id: string;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: PersonalOpsTone;
  active?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  disabledReason?: string;
};

function MetricContent({ item }: { item: PersonalOpsMetricItem }) {
  return (
    <>
      {item.icon && (
        <span className={styles.metricIcon} aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className={styles.metricLabel}>{item.label}</span>
      <strong className={styles.metricValue}>{item.value}</strong>
      {item.detail && <span className={styles.metricDetail}>{item.detail}</span>}
    </>
  );
}

export function PersonalOpsMetricRail({
  items,
  ariaLabel = "Summary metrics",
  className
}: {
  items: readonly PersonalOpsMetricItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={[styles.metricRail, className].filter(Boolean).join(" ")} aria-label={ariaLabel}>
      {items.map((item) => {
        const interactive = Boolean(item.onSelect);
        const reason = item.disabledReason ?? (item.disabled ? "This metric is unavailable." : undefined);
        if (interactive) {
          return (
            <button
              type="button"
              className={styles.metric}
              data-tone={toneData(item.tone)}
              data-active={item.active || undefined}
              aria-pressed={item.active || undefined}
              disabled={item.disabled}
              title={reason}
              onClick={item.onSelect}
              key={item.id}
            >
              <MetricContent item={item} />
            </button>
          );
        }

        return (
          <div
            className={styles.metric}
            data-tone={toneData(item.tone)}
            data-active={item.active || undefined}
            key={item.id}
          >
            <MetricContent item={item} />
          </div>
        );
      })}
    </div>
  );
}

export type PersonalOpsFilterItem = {
  id: string;
  label: string;
  count?: number;
  active?: boolean;
  onSelect: () => void;
  disabled?: boolean;
  disabledReason?: string;
};

export function PersonalOpsFilterRail({
  items,
  ariaLabel = "Filter this ledger",
  className
}: {
  items: readonly PersonalOpsFilterItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={[styles.filterRail, className].filter(Boolean).join(" ")} role="toolbar" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          type="button"
          className={styles.filterChip}
          data-active={item.active || undefined}
          aria-pressed={item.active}
          aria-label={item.count === undefined ? item.label : `${item.label}, ${item.count} items`}
          disabled={item.disabled}
          title={item.disabledReason}
          onClick={item.onSelect}
          key={item.id}
        >
          <span>{item.label}</span>
          {item.count !== undefined && <span className={styles.filterCount}>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PersonalOpsStatusChip({
  children,
  tone,
  className
}: {
  children: ReactNode;
  tone?: PersonalOpsTone;
  className?: string;
}) {
  return (
    <span className={[styles.statusChip, className].filter(Boolean).join(" ")} data-tone={toneData(tone)}>
      {children}
    </span>
  );
}

export type PersonalOpsStateItem = {
  id: string;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: PersonalOpsTone;
};

export function PersonalOpsStateGrid({
  items,
  ariaLabel = "Object state",
  className
}: {
  items: readonly PersonalOpsStateItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <dl className={[styles.stateGrid, className].filter(Boolean).join(" ")} aria-label={ariaLabel}>
      {items.map((item) => (
        <div className={styles.stateCard} data-tone={toneData(item.tone)} key={item.id}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.detail && <small>{item.detail}</small>}
        </div>
      ))}
    </dl>
  );
}

export function PersonalOpsPanel({
  title,
  meta,
  actions,
  children,
  wide = false,
  className
}: {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <section className={[styles.panel, wide && styles.widePanel, className].filter(Boolean).join(" ")}>
      {(title || meta || actions) && (
        <header className={styles.panelHeader}>
          <div>
            {title && <h3>{title}</h3>}
            {meta && <p>{meta}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
