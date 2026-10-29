"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { useContext, useEffect, useState, useId } from "react";
import { LayoutGroup, motion } from "motion/react";
import { WorkspaceTopbarContext } from "./WorkspaceTopbar";
import * as Popover from "@radix-ui/react-popover";

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
  keepSelectionOpen?: boolean;
};

function SidebarItem({ item, onNavigate }: { item: ModuleSidebarItem; onNavigate?: () => void }) {
  const unavailable = item.disabled || (!item.href && !item.onSelect);
  const reason = item.disabledReason ?? (unavailable ? `${item.label} is not available yet.` : undefined);
  const content = (
    <>
      {item.active && <motion.span className="workspace-nav-selection" layoutId="selection" transition={{ type: "spring", stiffness: 400, damping: 36 }} aria-hidden="true" />}
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

export default function ModuleSidebar({ id, title, sections, footer, status, onClose, keepSelectionOpen = false, ariaLabel = title + " navigation" }: ModuleSidebarProps) {
  const layoutId = useId();
  const bar = useContext(WorkspaceTopbarContext);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const sync = () => setCompact(query.matches);
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const close = () => { if (!keepSelectionOpen) { setOpenSection(null); onClose?.(); } };
  return <nav id={id} className="workspace-topnav" aria-label={ariaLabel}>
    <h1 className="workspace-topnav__title">{title}</h1>
    {bar && <div className="workspace-topnav__search" ref={bar.setSearch} />}
    {compact && sections.length > 0 && <Popover.Root open={openSection === "compact"} onOpenChange={open => setOpenSection(open ? "compact" : null)}>
      <Popover.Trigger className="workspace-nav-trigger" aria-label={`${title} views`} title="Views"><UnigentamosIcon role="menu" size={18} /><span>Views</span></Popover.Trigger>
      <Popover.Portal><Popover.Content className="workspace-nav-menu" align="end" sideOffset={8} collisionPadding={12}>
        {sections.map(section => <LayoutGroup id={`${layoutId}-${section.id}`} key={section.id}><section><p>{section.label}</p><ul>{section.items.map(item => <li key={item.id}><SidebarItem item={item} onNavigate={close} /></li>)}</ul></section></LayoutGroup>)}
        {footer}
      </Popover.Content></Popover.Portal>
    </Popover.Root>}
    {!compact && <div className="workspace-topnav__sections">
      {sections.filter(section => section.items.length).map(section => {
        const active = section.items.find(item => item.active);
        return <Popover.Root key={section.id} open={openSection === section.id} onOpenChange={open => setOpenSection(open ? section.id : null)}>
          <Popover.Trigger className="workspace-nav-trigger" aria-label={section.label || title + " views"}>
            {active?.icon}<span>{active?.label || section.label || "Views"}</span><UnigentamosIcon role="chevron-down" size={16} />
          </Popover.Trigger>
          <Popover.Portal><Popover.Content className="workspace-nav-menu" align="start" sideOffset={8} collisionPadding={12}>
            {section.label && <p>{section.label}</p>}
            <LayoutGroup id={`${layoutId}-${section.id}`}><ul>{section.items.map(item => <li key={item.id}><SidebarItem item={item} onNavigate={close} /></li>)}</ul></LayoutGroup>
          </Popover.Content></Popover.Portal>
        </Popover.Root>;
      })}
    </div>}
    {status && <div className="workspace-nav-status">{status}</div>}
    {footer && !compact && <Popover.Root><Popover.Trigger className="workspace-nav-trigger" aria-label={title + " tools"}><UnigentamosIcon role="sliders" size={18} /><span>Tools</span></Popover.Trigger><Popover.Portal><Popover.Content className="workspace-nav-menu" align="end" sideOffset={8} collisionPadding={12}>{footer}</Popover.Content></Popover.Portal></Popover.Root>}
    {bar && (compact ? <Popover.Root open={actionsOpen} onOpenChange={setActionsOpen}><Popover.Trigger className="workspace-nav-trigger workspace-actions-trigger" aria-label={`${title} actions`} title="Actions"><UnigentamosIcon role="plus" size={18} /><span>Actions</span></Popover.Trigger><Popover.Portal forceMount><Popover.Content forceMount className="workspace-nav-menu workspace-actions-menu" align="end" sideOffset={8} collisionPadding={12}><div className="workspace-topnav__actions" ref={bar.setActions} onClick={event => { const action = (event.target as HTMLElement).closest("button, a"); if (action && !action.hasAttribute("aria-haspopup")) setActionsOpen(false); }} /></Popover.Content></Popover.Portal></Popover.Root> : <div className="workspace-topnav__actions" ref={bar.setActions} />)}
  </nav>;
}
