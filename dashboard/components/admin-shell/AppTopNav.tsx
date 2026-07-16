"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ADMIN_NAV_ITEMS } from "../../lib/admin-navigation";
import PersonalViewportToggle from "../PersonalViewportToggle";

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
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const projectsGroupRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchAvailable = Boolean(onCommandSearch);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!projectsGroupRef.current?.contains(event.target as Node)) {
        setProjectsOpen(false);
      }
      if (!mobileNavRef.current?.contains(event.target as Node)) {
        setMobileNavOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProjectsOpen(false);
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
    setProjectsOpen(false);
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
    if (!query || !onCommandSearch) {
      return;
    }
    onCommandSearch(query);
  }

  const activeNavItem = ADMIN_NAV_ITEMS.find((item) => {
    const itemHref = item.href ?? "/admin";
    return pathname === itemHref
      || pathname.startsWith(`${itemHref}/`)
      || Boolean(item.children?.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`)));
  });

  return (
    <header className={cx("admin-global-topnav", "app-top-nav", className)}>
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
            setProjectsOpen(false);
            setMobileNavOpen((current) => !current);
          }}
        >
          <span>Menu</span>
          <strong>{activeNavItem?.label || "Home"}</strong>
          <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true" focusable="false">
            <path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
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
              || pathname.startsWith(`${itemHref}/`)
              || Boolean(item.children?.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`)));
            return (
              <Link
                href={itemHref}
                className={itemActive ? "is-active" : undefined}
                aria-current={itemActive ? "page" : undefined}
                onClick={() => setMobileNavOpen(false)}
                key={item.label}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <nav className="admin-global-links app-top-nav__links" aria-label="Primary navigation">
        {ADMIN_NAV_ITEMS.map((item) => {
          const itemHref = item.href ?? "/admin";
          const itemActive =
            pathname === itemHref ||
            pathname.startsWith(`${itemHref}/`) ||
            Boolean(item.children?.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`)));

          if (!item.children) {
            return (
              <Link
                href={itemHref}
                className={cx("admin-global-nav-link", itemActive && "is-active")}
                aria-current={itemActive ? "page" : undefined}
                key={item.label}
              >
                {item.label}
              </Link>
            );
          }

          return (
            <div className="admin-global-nav-group" key={item.label} ref={projectsGroupRef}>
              <button
                type="button"
                className={cx("admin-global-nav-button", itemActive && "is-active")}
                onClick={() => setProjectsOpen((current) => !current)}
                aria-expanded={projectsOpen}
                aria-haspopup="menu"
                aria-controls="app-project-navigation"
              >
                {item.label}
                <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true" focusable="false">
                  <path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
              <div
                id="app-project-navigation"
                className="admin-project-menu"
                role="menu"
                aria-label="Project navigation"
                hidden={!projectsOpen}
              >
                <Link
                  href={itemHref}
                  className="admin-project-menu-overview"
                  role="menuitem"
                  onClick={() => setProjectsOpen(false)}
                >
                  All projects
                </Link>
                {item.children.map((project) => (
                  <Link
                    href={project.href}
                    className="admin-project-menu-item"
                    role="menuitem"
                    key={project.slug}
                    onClick={() => setProjectsOpen(false)}
                  >
                    <span>{project.shortLabel}</span>
                    <small>{project.status === "active" ? "Active" : "Planned"}</small>
                  </Link>
                ))}
              </div>
            </div>
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
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
              <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="m12.5 12.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <input
              ref={searchInputRef}
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              aria-label="Search notes, files, people, reviews"
              aria-describedby={!searchAvailable ? "app-command-search-status" : undefined}
              placeholder="Search notes, files, people, reviews"
              disabled={!searchAvailable}
              title={!searchAvailable ? commandSearchDisabledReason : undefined}
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
