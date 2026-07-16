import type { ReactNode } from "react";

export type MetricStripItem = {
  id: string;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "positive" | "attention" | "danger";
};

export type MetricStripProps = {
  items: readonly MetricStripItem[];
  ariaLabel?: string;
  className?: string;
};

export default function MetricStrip({ items, ariaLabel = "Summary metrics", className }: MetricStripProps) {
  return (
    <dl className={["metric-strip", className].filter(Boolean).join(" ")} aria-label={ariaLabel}>
      {items.map((item) => (
        <div className={["metric-strip__item", item.tone && `is-${item.tone}`].filter(Boolean).join(" ")} key={item.id}>
          <dt>{item.label}</dt>
          <dd>
            <strong>{item.value}</strong>
            {item.detail && <span>{item.detail}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

