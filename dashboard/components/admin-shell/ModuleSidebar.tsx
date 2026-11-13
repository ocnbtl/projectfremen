"use client";

import Link from "next/link";
import { workspaceReturnUrl } from "./useWorkspaceReturn";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { useContext, useEffect, useLayoutEffect, useState, useId, useRef } from "react";
import { LayoutGroup, motion } from "motion/react";
import { WorkspaceTopbarContext, WorkspaceHomeContext } from "./WorkspaceTopbar";
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
  onHome?: () => void;
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

export default function ModuleSidebar({ id, title, sections, footer, status, onClose, onHome, keepSelectionOpen = false, ariaLabel = title + " navigation" }: ModuleSidebarProps) {
  const layoutId = useId();
  const returnHome = useContext(WorkspaceHomeContext);
  const pathname = usePathname();
  const module = pathname.split("/")[2] || "personal";
  const root = "/admin/"+module;
  const saved = workspaceReturnUrl(module,root);
  const home = module !== "personal" && saved.split("?")[0]===root ? saved : root;
  const bar = useContext(WorkspaceTopbarContext);
  const [actionsOpen, setActionsOpenState] = useState(false);
  const [actionsExiting, setActionsExiting] = useState(false);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const actionsMenu = useRef<HTMLDivElement>(null);
  const setActionsOpen = (next: boolean) => {
    setActionsExiting(!next && actionsOpen && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setActionsOpenState(next);
  };
  // Keep the portal host mounted so closing never discards module drafts or menu state.
  useEffect(() => {
    if (actionsOpen) {
      const frame = requestAnimationFrame(() => {
        const first = [...(actionsMenu.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") || [])].find(item => item.getClientRects().length);
        first?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    if (actionsExiting) {
      // Fallback for a cancelled animation or a motion-preference change during exit.
      const timer = setTimeout(() => setActionsExiting(false), 200);
      return () => clearTimeout(timer);
    }
  }, [actionsOpen, actionsExiting]);
  const [compact, setCompact] = useState(false);
  const [actionCount, setActionCount] = useState(0);
  useLayoutEffect(() => {
    const host = bar?.actions;
    if (!host) return;
    const automaticNames = new WeakMap<HTMLElement, string>();
    const automaticTitles = new WeakMap<HTMLElement, string>();
    const inspect = () => {
      // Count real actions, not alternate mobile navigation or hidden menu copies.
      const actions = [...host.querySelectorAll<HTMLElement>("button, a[href]")].filter(action => {
        for (let node: HTMLElement | null = action; node && node !== host; node = node.parentElement) {
          if (node.matches('[data-task-navigation], [hidden], .work-mobile-only, [class*="mobileMenuButton"], .finance-mobile-menu, .people-mobile-nav-trigger, .workspace-create-actions, [role="menu"], [role="dialog"]')) return false;
        }
        return true;
      });
      for (const action of actions) {
        const label = action.textContent?.trim();
        if (label && (!action.hasAttribute("aria-label") || action.getAttribute("aria-label") === automaticNames.get(action))) {
          action.setAttribute("aria-label", label);
          automaticNames.set(action, label);
        }
        if (label && (!action.hasAttribute("title") || action.getAttribute("title") === automaticTitles.get(action))) {
          action.setAttribute("title", label);
          automaticTitles.set(action, label);
        }
      }
      setActionCount(actions.length);
    };
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(host, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [bar?.actions]);
  const collapseActions = compact && actionCount > 3;
  useEffect(() => {
    const host = bar?.actions;
    if (!host || !actionsOpen) return;
    // Slotted actions are React portals: their synthetic clicks follow the source
    // tree, so listen on the actual menu host to dismiss after a leaf action.
    const closeAction = (event: MouseEvent) => {
      const action = event.target instanceof Element ? event.target.closest("button, a") : null;
      if (action && !action.hasAttribute("aria-haspopup") && !action.hasAttribute("disabled")) setActionsOpen(false);
    };
    host.addEventListener("click", closeAction);
    return () => host.removeEventListener("click", closeAction);
  }, [bar?.actions, actionsOpen]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const sync = () => setCompact(query.matches);
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const currentSection = sections.flatMap(section => section.items).find(item => item.active);
  const close = () => { if (!keepSelectionOpen) { setOpenSection(null); onClose?.(); } };
  return <nav id={id} className="workspace-topnav" data-inline-actions={!collapseActions || undefined} aria-label={ariaLabel}>
    <h1 className="workspace-topnav__title">{onHome || returnHome?<button type="button" className="workspace-home-link" onClick={onHome || returnHome} aria-label={"Return to "+title}>{title}</button>:<Link prefetch={false} className="workspace-home-link" href={home} aria-label={"Return to "+title}>{title}</Link>}</h1>
    {bar && <div className="workspace-topnav__search" ref={bar.setSearch} />}
    {compact && sections.length > 0 && <Popover.Root open={openSection === "compact"} onOpenChange={open => setOpenSection(open ? "compact" : null)}>
      <Popover.Trigger className="workspace-nav-trigger workspace-browse-trigger" aria-label={`${title} views`} title={`Browse ${title}`}><UnigentamosIcon role="workspace-navigation" size={18} /><span>{currentSection?.label || "Browse"}</span><UnigentamosIcon role="chevron-down" size={14} /></Popover.Trigger>
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
    {bar && (collapseActions ? <Popover.Root open={actionsOpen} onOpenChange={setActionsOpen}><Popover.Trigger ref={actionsTrigger} className="workspace-nav-trigger workspace-actions-trigger" aria-label={`${title} actions`} title="Actions"><UnigentamosIcon role="plus" size={18} /><span>Actions</span></Popover.Trigger><Popover.Portal forceMount><Popover.Content forceMount ref={actionsMenu} data-exiting={actionsExiting || undefined} inert={!actionsOpen} aria-hidden={!actionsOpen} onOpenAutoFocus={event => event.preventDefault()} onInteractOutside={event => { if ((event.target as HTMLElement)?.closest(".workspace-actions-submenu,[data-actions-submenu]")) event.preventDefault(); }} onEscapeKeyDown={event => { event.preventDefault(); setActionsOpen(false); actionsTrigger.current?.focus({preventScroll:true}); }} onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === "workspace-menu-fold") setActionsExiting(false); }} className="workspace-nav-menu workspace-actions-menu" aria-label={`${title} actions`} align="end" sideOffset={8} collisionPadding={12}><div className="workspace-actions-heading"><UnigentamosIcon role={`module-${module}`} size={18}/><span>{title}</span></div><div className="workspace-topnav__actions" ref={bar.setActions} onClick={event => { const action = (event.target as HTMLElement).closest("button, a"); if (action && !action.hasAttribute("aria-haspopup")) setActionsOpen(false); }} /></Popover.Content></Popover.Portal></Popover.Root> : <div className="workspace-topnav__actions" ref={bar.setActions} />)}
  </nav>;
}
