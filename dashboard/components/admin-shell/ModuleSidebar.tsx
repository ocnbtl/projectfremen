"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export type ModuleSidebarItem = {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
  icon?: ReactNode;
  count?: number;
  active?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  tone?: "default" | "attention" | "danger";
};

export type ModuleSidebarSection = {
  id: string;
  label?: string;
  items: readonly ModuleSidebarItem[];
};

export type ModuleSidebarProps = {
  id?: string;
  title: string;
  description?: string;
  status?: ReactNode;
  sections: readonly ModuleSidebarSection[];
  footer?: ReactNode;
  mobileOpen?: boolean;
  onClose?: () => void;
  ariaLabel?: string;
  className?: string;
};

function SidebarItem({ item, onNavigate }: { item: ModuleSidebarItem; onNavigate?: () => void }) {
  const unavailable = item.disabled || (!item.href && !item.onSelect);
  const reason = item.disabledReason ?? (unavailable ? `${item.label} is not available yet.` : undefined);
  const content = (
    <>
      {item.icon && (
        <span className="module-sidebar__item-icon" aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className="module-sidebar__item-label">{item.label}</span>
      {item.count !== undefined && (
        <span className="module-sidebar__item-count" aria-label={`${item.count} items`}>
          {item.count}
        </span>
      )}
    </>
  );
  const className = [
    "module-sidebar__item",
    item.active && "is-active",
    unavailable && "is-disabled",
    item.tone && `is-${item.tone}`
  ]
    .filter(Boolean)
    .join(" ");

  if (item.href && !unavailable) {
    return (
      <Link
        href={item.href}
        className={className}
        aria-current={item.active ? "page" : undefined}
        onClick={onNavigate}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (unavailable) return;
        item.onSelect?.();
        onNavigate?.();
      }}
      aria-disabled={unavailable || undefined}
      aria-current={item.active ? "page" : undefined}
      aria-describedby={reason ? `module-sidebar-item-${item.id}-reason` : undefined}
      title={reason}
    >
      {content}
      {reason && (
        <span id={`module-sidebar-item-${item.id}-reason`} className="sr-only">
          {reason}
        </span>
      )}
    </button>
  );
}

export default function ModuleSidebar({
  id,
  title,
  description,
  status,
  sections,
  footer,
  mobileOpen = false,
  onClose,
  ariaLabel = `${title} navigation`,
  className
}: ModuleSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!mobileOpen || !sidebarRef.current) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(
      sidebarRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      ) || []
    );
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
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
      previousFocus?.focus();
    };
  }, [mobileOpen]);

  return (
    <aside
      ref={sidebarRef}
      id={id}
      className={["module-sidebar", mobileOpen && "is-mobile-open", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      role={mobileOpen ? "dialog" : undefined}
      aria-modal={mobileOpen || undefined}
      data-mobile-open={mobileOpen || undefined}
    >
      <header className="module-sidebar__header">
        <div>
          <p className="module-sidebar__eyebrow">Module</p>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {onClose && (
          <button type="button" className="module-sidebar__close" onClick={onClose} aria-label={`Close ${title} navigation`}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="m4 4 12 12M16 4 4 16" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        )}
        {status && <div className="module-sidebar__status">{status}</div>}
      </header>

      <nav className="module-sidebar__navigation" aria-label={ariaLabel}>
        {sections.map((section) => (
          <section className="module-sidebar__section" aria-labelledby={section.label ? `module-sidebar-${section.id}` : undefined} key={section.id}>
            {section.label && <h2 id={`module-sidebar-${section.id}`}>{section.label}</h2>}
            <ul>
              {section.items.map((item) => (
                <li key={item.id}>
                  <SidebarItem item={item} onNavigate={onClose} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      {footer && <footer className="module-sidebar__footer">{footer}</footer>}
    </aside>
  );
}
