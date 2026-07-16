"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type QuickAction = {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
  icon?: ReactNode;
  intent?: "primary" | "secondary" | "destructive";
  disabled?: boolean;
  disabledReason?: string;
};

export type QuickActionBarProps = {
  actions: readonly QuickAction[];
  label?: ReactNode;
  sticky?: boolean;
  ariaLabel?: string;
  className?: string;
};

export default function QuickActionBar({
  actions,
  label,
  sticky = false,
  ariaLabel = "Quick actions",
  className
}: QuickActionBarProps) {
  return (
    <div
      className={["quick-action-bar", sticky && "is-sticky", className].filter(Boolean).join(" ")}
      role="toolbar"
      aria-label={ariaLabel}
    >
      {label && <div className="quick-action-bar__label">{label}</div>}
      <div className="quick-action-bar__actions">
        {actions.map((action) => {
          const unavailable = action.disabled || (!action.href && !action.onSelect);
          const reason = action.disabledReason ?? (unavailable ? `${action.label} is not available yet.` : undefined);
          const content = (
            <>
              {action.icon && <span aria-hidden="true">{action.icon}</span>}
              <span>{action.label}</span>
            </>
          );
          const actionClassName = [
            "quick-action-bar__action",
            `is-${action.intent ?? "secondary"}`,
            unavailable && "is-disabled"
          ]
            .filter(Boolean)
            .join(" ");

          if (action.href && !unavailable) {
            return (
              <Link href={action.href} className={actionClassName} key={action.id}>
                {content}
              </Link>
            );
          }

          return (
            <button
              type="button"
              className={actionClassName}
              onClick={() => {
                if (!unavailable) action.onSelect?.();
              }}
              aria-label={action.label}
              aria-disabled={unavailable || undefined}
              title={reason}
              aria-describedby={reason ? `quick-action-${action.id}-reason` : undefined}
              key={action.id}
            >
              {content}
              {reason && (
                <span id={`quick-action-${action.id}-reason`} className="sr-only">
                  {reason}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
