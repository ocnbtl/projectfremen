import styles from "./EvidenceChecklist.module.css";

export type EvidenceChecklistItem = {
  id: string;
  label: string;
  detail: string;
  outcome: "supported" | "attention" | "unavailable";
  outcomeLabel?: string;
};

export default function EvidenceChecklist({
  items,
  ariaLabel,
  className
}: {
  items: readonly EvidenceChecklistItem[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <ol className={[styles.list, className].filter(Boolean).join(" ")} aria-label={ariaLabel}>
      {items.map((item) => (
        <li className={styles.item} data-outcome={item.outcome} key={item.id}>
          <span className={styles.marker} aria-hidden="true">
            {item.outcome === "supported" ? "✓" : "!"}
          </span>
          <span className={styles.copy}>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </span>
          <span className={styles.state}>
            {item.outcomeLabel || (item.outcome === "supported" ? "Evidence available" : "Not connected")}
          </span>
        </li>
      ))}
    </ol>
  );
}

