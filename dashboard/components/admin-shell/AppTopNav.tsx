"use client";

import Link from "next/link";
import { motionTokens } from "../../lib/design-system/motion";
import PlanningNotifications from "../planning/PlanningNotifications";
import { usePathname, useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ADMIN_NAV_ITEMS } from "../../lib/admin-navigation";
import { moduleColorIdForPathname, moduleThemeVariables } from "../../lib/design-system/color-system";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { useMotionPreference } from "./ExperienceProvider";

export type AppTopNavProps = {
  showCommandSearch?: boolean;
  onCommandSearch?: (query: string) => void;
  commandSearchDisabledReason?: string;
  rightSlot?: ReactNode;
  className?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function AppTopNav({
  showCommandSearch = true,
  onCommandSearch,
  commandSearchDisabledReason = "Global search is not connected yet.",
  rightSlot,
  className
}: AppTopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { preference, setPreference } = useMotionPreference();
  const systemReduceMotion = useReducedMotion();
  const reduceMotion = preference === "reduce" || systemReduceMotion;
  const [moduleQuery, setModuleQuery] = useState("");
  const moduleSearchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    delete document.documentElement.dataset.adminPreview;
    delete document.documentElement.dataset.personalPreview;
  }, []);
  const [commandQuery, setCommandQuery] = useState("");
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchAvailable = true;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!mobileNavRef.current?.contains(event.target as Node)) {
        setMobileNavOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (mobileNavOpen) {
          setMobileNavOpen(false);
          window.requestAnimationFrame(() => mobileNavTriggerRef.current?.focus());
        }
      }
      if (
        searchAvailable &&
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        event.preventDefault();
        if (searchInputRef.current?.offsetParent) searchInputRef.current.focus();
        else router.push("/vault?focus=search");
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavOpen, searchAvailable, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    const moduleId = moduleColorIdForPathname(pathname);
    const variables = moduleId ? moduleThemeVariables(moduleId) : {};
    const propertyNames = Object.keys(moduleThemeVariables("projects"));
    root.dataset.activeModule = moduleId || "home";
    for (const propertyName of propertyNames) {
      const value = variables[propertyName];
      if (value) root.style.setProperty(propertyName, value);
      else root.style.removeProperty(propertyName);
    }
    return () => {
      for (const propertyName of propertyNames) root.style.removeProperty(propertyName);
      delete root.dataset.activeModule;
    };
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("app-mobile-nav-open", mobileNavOpen);
    return () => document.body.classList.remove("app-mobile-nav-open");
  }, [mobileNavOpen]);

  useEffect(() => {
    if (mobileNavOpen) {
      window.dispatchEvent(new Event("app-mobile-navigation-open"));
      moduleSearchRef.current?.focus();
    } else {
      setModuleQuery("");
    }
  }, [mobileNavOpen]);

  function submitCommandSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = commandQuery.trim();
    if (!query) return;
    if (onCommandSearch) onCommandSearch(query);
    else router.push(`/vault?search=${encodeURIComponent(query)}&focus=search`);
  }

  const activeNavItem = ADMIN_NAV_ITEMS.find((item) => {
    const itemHref = item.href ?? "/admin";
    return pathname === itemHref
      || pathname.startsWith(`${itemHref}/`);
  });

  return (
    <header className={cx("admin-global-topnav", "app-top-nav", className)} data-active-module={moduleColorIdForPathname(pathname) || "home"}>
      <Link href="/admin" className="admin-global-brand app-top-nav__brand" aria-label="Unigentamos home">
        <img src="/unigentamos-logo.svg" alt="" width="32" height="32" />
        <strong>Unigentamos</strong>
      </Link>

      <div className="app-top-nav__mobile-navigation" ref={mobileNavRef}>
        <button
          ref={mobileNavTriggerRef}
          type="button"
          className="app-top-nav__mobile-trigger"
          aria-expanded={mobileNavOpen}
          aria-controls="app-mobile-primary-navigation"
          onClick={() => {
            setMobileNavOpen((current) => !current);
          }}
        >
          {activeNavItem ? <UnigentamosIcon role={activeNavItem.iconRole} size={24} /> : null}
          <strong>{activeNavItem?.label || "Home"}</strong>
          <UnigentamosIcon role="chevron-down" size={12} />
        </button>
        <AnimatePresence>{mobileNavOpen && <motion.nav
          id="app-mobile-primary-navigation"
          className="app-top-nav__mobile-menu"
          aria-label="Mobile primary navigation"
          initial={{ opacity: 0, y: reduceMotion ? 0 : -8, scale: reduceMotion ? 1 : 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : -6, scale: reduceMotion ? 1 : 0.98 }}
          transition={{ duration: reduceMotion ? 0 : motionTokens.standard }}
          style={{ x: "-50%" }}
        >
          <input ref={moduleSearchRef} className="app-top-nav__module-search" type="search" aria-label="Find a workspace" placeholder="Find a workspace" value={moduleQuery} onChange={event => setModuleQuery(event.target.value)} />
          {ADMIN_NAV_ITEMS.filter(item => item.label.toLowerCase().includes(moduleQuery.toLowerCase())).map((item) => {
            const itemHref = item.href ?? "/admin";
            const itemActive = pathname === itemHref
              || pathname.startsWith(`${itemHref}/`);
            return (
              <Link
                href={itemHref}
                className={itemActive ? "is-active" : undefined}
                data-module={moduleColorIdForPathname(itemHref) || undefined}
                aria-current={itemActive ? "page" : undefined}
                onClick={() => setMobileNavOpen(false)}
                key={item.label}
              >
                <UnigentamosIcon role={item.iconRole} size={24} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <Link href="/vault?focus=search" data-module="vault" onClick={() => setMobileNavOpen(false)}>
            Search all records
          </Link>
          <label className="app-top-nav__preference"><input type="checkbox" checked={preference === "reduce"} onChange={event => setPreference(event.target.checked ? "reduce" : "system")} />Reduce motion</label>
        </motion.nav>}</AnimatePresence>
      </div>

      <nav className="admin-global-links app-top-nav__links" aria-label="Primary navigation">
        {ADMIN_NAV_ITEMS.map((item) => {
          const itemHref = item.href ?? "/admin";
          const itemActive =
            pathname === itemHref ||
            pathname.startsWith(`${itemHref}/`);

          return (
            <Link
              href={itemHref}
              className={cx("admin-global-nav-link", itemActive && "is-active")}
              data-module={moduleColorIdForPathname(itemHref) || undefined}
              aria-current={itemActive ? "page" : undefined}
              key={item.label}
            >
              <UnigentamosIcon role={item.iconRole} size={24} />
              <span>{item.label}</span>
              {itemActive && <motion.span aria-hidden="true" className="work-nav-marker" layoutId="workspace-navigation-marker" initial={false} transition={{duration:reduceMotion ? 0 : motionTokens.standard, ease:motionTokens.arrive}} />}
            </Link>
          );
        })}
      </nav>

      <div className="app-top-nav__utilities">
        <button type="button" className="work-button work-button--quiet app-top-nav__motion" aria-pressed={preference === "reduce"} onClick={() => setPreference(preference === "reduce" ? "system" : "reduce")}>Reduce motion</button>
        {showCommandSearch && (
          <form
            className="admin-command-search app-top-nav__search"
            role="search"
            aria-label="Admin command search"
            onSubmit={submitCommandSearch}
          >
            <UnigentamosIcon role="search" size={16} />
            <input
              ref={searchInputRef}
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              aria-label="Search notes, files, people, reviews"
              aria-describedby={!searchAvailable ? "app-command-search-status" : undefined}
              placeholder="Search notes, files, people, reviews"
              title="Search the encrypted offline Vault"
            />
            <kbd aria-hidden="true">⌘K</kbd>
            {!searchAvailable && (
              <span id="app-command-search-status" className="sr-only">
                {commandSearchDisabledReason}
              </span>
            )}
          </form>
        )}
        <PlanningNotifications />
        {rightSlot}
      </div>
    </header>
  );
}
