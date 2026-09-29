"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { WorkspaceButton } from "../admin-shell/WorkspaceKit";

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
  maxVisible?: number;
};

export default function QuickActionBar({
  actions,
  label,
  sticky = false,
  ariaLabel = "Quick actions",
  className,
  maxVisible = 3
}: QuickActionBarProps) {
  const [open,setOpen] = useState(false);
  const available = actions.filter(action => action.href || action.onSelect);
  const overflow = available.slice(maxVisible);
  return (
    <div
      className={["quick-action-bar", sticky && "is-sticky", className].filter(Boolean).join(" ")}
      role="toolbar"
      aria-label={ariaLabel}
    >
      {label && <div className="quick-action-bar__label">{label}</div>}
      <div className="quick-action-bar__actions">
        {available.slice(0,maxVisible).map((action) => {
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
        {overflow.length > 0 && <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><WorkspaceButton aria-label="More actions">More</WorkspaceButton></Popover.Trigger><Popover.Portal><Popover.Content className="work-action-menu" sideOffset={6} collisionPadding={12} aria-label="More actions">
          {overflow.map(action=>action.href && !action.disabled ? <Link key={action.id} href={action.href} onClick={()=>setOpen(false)}>{action.label}</Link> : <button key={action.id} type="button" disabled={action.disabled} title={action.disabledReason} onClick={()=>{setOpen(false);action.onSelect?.();}}>{action.label}</button>)}
        </Popover.Content></Popover.Portal></Popover.Root>}
      </div>
    </div>
  );
}
