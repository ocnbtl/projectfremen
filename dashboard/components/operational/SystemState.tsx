import type { ReactNode } from "react";
import LogoLoader from "./LogoLoader";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton } from "../admin-shell/WorkspaceKit";
import styles from "./SystemState.module.css";

export type SystemStateVariant = "loading" | "empty" | "error" | "read_only" | "stale";

export type SystemStateAction = {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  icon?: string;
};

export type SystemStateProps = {
  variant: SystemStateVariant;
  title?: string;
  description?: ReactNode;
  action?: SystemStateAction;
  secondaryAction?: SystemStateAction;
  icon?: string;
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
  secondaryAction,
  icon,
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
      className={["system-state", styles.state, `is-${variant.replace("_", "-")}`, compact && styles.compact, className]
        .filter(Boolean)
        .join(" ")}
      role={variant === "error" ? "alert" : "status"}
    >
      <span className={styles.icon} aria-hidden="true" data-state={variant}><UnigentamosIcon role={icon || (variant === "empty" ? "search" : variant === "error" ? "alert" : variant === "read_only" ? "lock" : "refresh")} size={26}/></span>
      <div className="system-state__content">
        <h2>{title}</h2>
        {description && <div className="system-state__description">{description}</div>}
      </div>
      {(action || secondaryAction) && <div className={styles.actions}>{action && (
        <WorkspaceButton
          intent="primary"
          icon={action.icon}
          onClick={action.onSelect}
          disabled={unavailable}
          title={reason}
          aria-label={reason ? `${action.label}. ${reason}` : undefined}
        >
          {action.label}
        </WorkspaceButton>
      )}{secondaryAction && <WorkspaceButton icon={secondaryAction.icon} onClick={secondaryAction.onSelect} disabled={secondaryAction.disabled || !secondaryAction.onSelect} title={secondaryAction.disabledReason}>{secondaryAction.label}</WorkspaceButton>}</div>}
    </section>
  );
}
