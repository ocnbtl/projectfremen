"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

export type ConfirmationSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: ReactNode;
  consequences?: readonly string[];
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  confirmDisabled?: boolean;
  confirmDisabledReason?: string;
  dismissible?: boolean;
  className?: string;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export default function ConfirmationSheet({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  consequences,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  confirmDisabled = false,
  confirmDisabledReason,
  dismissible = true,
  className
}: ConfirmationSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const dismissibleRef = useRef(dismissible);
  const onOpenChangeRef = useRef(onOpenChange);

  busyRef.current = busy;
  dismissibleRef.current = dismissible;
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissibleRef.current && !busyRef.current) {
        event.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const descriptionAvailable = Boolean(description || consequences?.length);
  const confirmUnavailable = busy || confirmDisabled;

  return (
    <div
      className={["confirmation-sheet", `is-${tone}`, className].filter(Boolean).join(" ")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible && !busy) {
          onOpenChange(false);
        }
      }}
    >
      <div
        ref={panelRef}
        className="confirmation-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionAvailable ? descriptionId : undefined}
        aria-busy={busy || undefined}
      >
        <header className="confirmation-sheet__header">
          <div>
            <span className="confirmation-sheet__eyebrow">Confirm action</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              aria-label="Close confirmation"
            >
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="m4 4 12 12M16 4 4 16" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          )}
        </header>

        {descriptionAvailable && (
          <div id={descriptionId} className="confirmation-sheet__description">
            {description}
            {consequences && consequences.length > 0 && (
              <ul>
                {consequences.map((consequence) => <li key={consequence}>{consequence}</li>)}
              </ul>
            )}
          </div>
        )}

        {children && <div className="confirmation-sheet__content">{children}</div>}

        <footer className="confirmation-sheet__actions">
          <button ref={cancelRef} type="button" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === "danger" ? "is-danger" : "is-primary"}
            onClick={() => void onConfirm()}
            disabled={confirmUnavailable}
            aria-describedby={confirmDisabledReason ? `${descriptionId}-confirm-reason` : undefined}
            title={confirmDisabledReason}
          >
            {busy ? "Working…" : confirmLabel}
            {confirmDisabledReason && (
              <span id={`${descriptionId}-confirm-reason`} className="sr-only">
                {confirmDisabledReason}
              </span>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
