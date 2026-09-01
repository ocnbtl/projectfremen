"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ADMIN_NAV_ITEMS } from "../../lib/admin-navigation";
import { moduleColorIdForPathname, moduleThemeVariables } from "../../lib/design-system/color-system";
import PersonalViewportToggle from "../PersonalViewportToggle";
import UnigentamosIcon from "../icons/UnigentamosIcon";

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
        searchInputRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavOpen, searchAvailable]);

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
        <span aria-hidden="true">U</span>
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
          <span>Menu</span>
          {activeNavItem ? <UnigentamosIcon role={activeNavItem.iconRole} size={16} /> : null}
          <strong>{activeNavItem?.label || "Home"}</strong>
          <UnigentamosIcon role="chevron-down" size={12} />
        </button>
        <nav
          id="app-mobile-primary-navigation"
          className="app-top-nav__mobile-menu"
          aria-label="Mobile primary navigation"
          hidden={!mobileNavOpen}
        >
          {ADMIN_NAV_ITEMS.map((item) => {
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
                <UnigentamosIcon role={item.iconRole} size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <Link href="/vault?focus=search" data-module="vault" onClick={() => setMobileNavOpen(false)}>
            Search all records
          </Link>
        </nav>
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
              <UnigentamosIcon role={item.iconRole} size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="app-top-nav__utilities">
        <PersonalViewportToggle />
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
        {rightSlot}
      </div>
    </header>
  );
}
