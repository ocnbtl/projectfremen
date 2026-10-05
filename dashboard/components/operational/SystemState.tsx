import type { ReactNode } from "react";
import LogoLoader from "./LogoLoader";

export type SystemStateVariant = "loading" | "empty" | "error" | "read_only" | "stale";

export type SystemStateAction = {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  disabledReason?: string;
};

export type SystemStateProps = {
  variant: SystemStateVariant;
  title?: string;
  description?: ReactNode;
  action?: SystemStateAction;
  skeletonRows?: number;
  compact?: boolean;
  className?: string;
};

const DEFAULT_TITLES: Readonly<Record<SystemStateVariant, string>> = {
  loading: "Loading",
  empty: "Nothing here yet",
  error: "Unable to load this view",
  read_only: "Read-only access",
  stale: "This view may be out of date"
};

export default function SystemState({
  variant,
  title = DEFAULT_TITLES[variant],
  description,
  action,
  compact = false,
  className
}: SystemStateProps) {
  if (variant === "loading") {
    return <LogoLoader label={title} />;
  }

  const unavailable = action && (action.disabled || !action.onSelect);
  const reason = action?.disabledReason ?? (unavailable ? `${action?.label} is not available yet.` : undefined);

  return (
    <section
      className={["system-state", `is-${variant.replace("_", "-")}`, compact && "is-compact", className]
        .filter(Boolean)
        .join(" ")}
      role={variant === "error" ? "alert" : "status"}
    >
      <span className="system-state__icon" aria-hidden="true" data-state={variant} />
      <div className="system-state__content">
        <h2>{title}</h2>
        {description && <div className="system-state__description">{description}</div>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onSelect}
          disabled={unavailable}
          title={reason}
          aria-label={reason ? `${action.label}. ${reason}` : undefined}
        >
          {action.label}
        </button>
      )}
    </section>
  );
}
