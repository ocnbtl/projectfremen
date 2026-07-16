"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export type InspectorRailProps = {
  id?: string;
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  ariaLabel?: string;
  className?: string;
  overlay?: boolean;
  overlayOpen?: boolean;
  onRequestClose?: () => void;
  resolveReturnFocus?: () => HTMLElement | null;
};

export default function InspectorRail({
  id,
  title,
  actions,
  children,
  footer,
  busy = false,
  readOnly = false,
  hidden = false,
  ariaLabel = "Selected object inspector",
  className,
  overlay = false,
  overlayOpen = false,
  onRequestClose,
  resolveReturnFocus
}: InspectorRailProps) {
  const railRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onRequestClose);
  const returnFocusRef = useRef(resolveReturnFocus);
  returnFocusRef.current = resolveReturnFocus;
  const activeOverlay = overlay && overlayOpen;

  useEffect(() => {
    closeRef.current = onRequestClose;
  }, [onRequestClose]);

  useEffect(() => {
    if (!activeOverlay || !railRef.current) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(
      railRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      ) || []
    );
    controls()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && !railRef.current?.contains(activeElement)) {
        const activeModal = activeElement.closest<HTMLElement>("[role='dialog'][aria-modal='true']");
        if (activeModal && activeModal !== railRef.current) return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = controls();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const returnTarget = returnFocusRef.current?.() || previousFocus;
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [activeOverlay]);

  if (hidden) {
    return null;
  }

  const overlayHidden = overlay && !overlayOpen;

  return (
    <aside
      ref={railRef}
      id={id}
      className={["inspector-rail", readOnly && "is-read-only", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      role={activeOverlay ? "dialog" : undefined}
      aria-modal={activeOverlay || undefined}
      aria-hidden={overlayHidden || undefined}
      inert={overlayHidden || undefined}
      aria-busy={busy || undefined}
      data-read-only={readOnly || undefined}
      data-overlay-open={activeOverlay || undefined}
    >
      {(title || actions) && (
        <header className="inspector-rail__header">
          {typeof title === "string" ? <h2>{title}</h2> : title}
          {actions && <div className="inspector-rail__actions">{actions}</div>}
        </header>
      )}
      <div className="inspector-rail__content">{children}</div>
      {footer && <footer className="inspector-rail__footer">{footer}</footer>}
    </aside>
  );
}
