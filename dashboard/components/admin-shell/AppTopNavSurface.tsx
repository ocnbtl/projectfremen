"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { motion } from "motion/react";
import { ADMIN_NAV_ITEMS } from "../../lib/admin-navigation";
import { MODULE_COLOR_SYSTEM, moduleColorIdForPathname, moduleThemeVariables } from "../../lib/design-system/color-system";
import { motionTokens } from "../../lib/design-system/motion";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import PlanningNotifications from "../planning/PlanningNotifications";
import type { AppTopNavProps } from "./AppTopNav";

export default function AppTopNavSurface({ showCommandSearch = true, onCommandSearch, rightSlot, className, reduceMotion: preference = false }: AppTopNavProps & { reduceMotion?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const reduceMotion = preference || systemReduceMotion;
  const [commandQuery, setCommandQuery] = useState("");
  const [logoRotation, setLogoRotation] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const activeHref = ADMIN_NAV_ITEMS.find(item => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href;
  const [indicator, setIndicator] = useState<{ x: number; y: number; width: number; height: number; color: string; border: string } | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    delete document.documentElement.dataset.adminPreview;
    delete document.documentElement.dataset.personalPreview;
    function keyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        if (searchInputRef.current?.offsetParent) searchInputRef.current.focus();
        else router.push("/vault?focus=search");
      }
    }
    document.addEventListener("keydown", keyDown);
    return () => document.removeEventListener("keydown", keyDown);
  }, [router]);

  useEffect(() => {
    const root = document.documentElement;
    const moduleId = moduleColorIdForPathname(pathname);
    const variables = moduleId ? moduleThemeVariables(moduleId) : {};
    const propertyNames = Object.keys(moduleThemeVariables("projects"));
    root.dataset.activeModule = moduleId || "home";
    for (const name of propertyNames) {
      if (variables[name]) root.style.setProperty(name, variables[name]);
      else root.style.removeProperty(name);
    }
    return () => {
      for (const name of propertyNames) root.style.removeProperty(name);
      delete root.dataset.activeModule;
    };
  }, [pathname]);

  useLayoutEffect(() => {
    const links = linksRef.current;
    if (!links) return;
    function measure() {
      const active = Array.from(links!.querySelectorAll<HTMLAnchorElement>("a")).find(link => link.getAttribute("href") === activeHref);
      const moduleId = activeHref ? moduleColorIdForPathname(activeHref) : null;
      if (!active || !moduleId) { setIndicator(null); return; }
      const palette = MODULE_COLOR_SYSTEM[moduleId];
      setIndicator({ x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight, color: palette.primary[100], border: palette.tokens.border });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(links);
    for (const link of links.querySelectorAll("a")) observer.observe(link);
    const active = links.querySelector<HTMLAnchorElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduceMotion ? "instant" : "smooth" });
    return () => observer.disconnect();
  }, [activeHref, reduceMotion]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = commandQuery.trim();
    if (!query) return;
    if (onCommandSearch) onCommandSearch(query);
    else router.push(`/vault?search=${encodeURIComponent(query)}&focus=search`);
  }

  return (
    <header className={`admin-global-topnav app-top-nav ${className || ""}`} data-active-module={moduleColorIdForPathname(pathname) || "home"}>
      <Link href="/admin" className="admin-global-brand app-top-nav__brand" aria-label="Unigentamos home" onClick={() => setLogoRotation(value => value + 360)}>
        <motion.img src="/unigentamos-logo.svg" alt="" width="32" height="32" initial={false}
          animate={{ rotate: reduceMotion ? 0 : logoRotation }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", duration: 1.85, bounce: 0.24, delay: 0.22 }} />
        <strong>Unigentamos</strong>
      </Link>
      <nav className="app-top-nav__scroll" aria-label="Primary navigation">
        <div className="admin-global-links app-top-nav__links" ref={linksRef}>
          {indicator && <motion.span className="app-top-nav__selection" aria-hidden="true" initial={false}
            animate={{ x: indicator.x, y: indicator.y, width: indicator.width, height: indicator.height, backgroundColor: indicator.color, borderColor: indicator.border }}
            transition={reduceMotion ? { duration: 0 } : {
              default: motionTokens.navigationSpring,
              backgroundColor: { duration: 0.4, ease: "easeInOut" },
              borderColor: { duration: 0.4, ease: "easeInOut" },
            }} />}
          {ADMIN_NAV_ITEMS.map(item => {
            const href = item.href || "/admin";
            const moduleId = moduleColorIdForPathname(href);
            const palette = moduleId ? MODULE_COLOR_SYSTEM[moduleId] : null;
            return <Link href={href} key={item.label} aria-label={item.label} title={item.label}
              className={`admin-global-nav-link${activeHref === href ? " is-active" : ""}`}
              aria-current={activeHref === href ? "page" : undefined} data-module={moduleId || undefined}
              style={palette ? { "--nav-module-accent": palette.tokens.icon, "--nav-module-surface": palette.tokens.quiet, "--nav-module-border": palette.tokens.border } as CSSProperties : undefined}>
              <UnigentamosIcon role={item.iconRole} size={24} /><span className="app-top-nav__label">{item.label}</span>
            </Link>;
          })}
        </div>
      </nav>
      <div className="app-top-nav__utilities">
        {showCommandSearch && <form className="admin-command-search app-top-nav__search" role="search" aria-label="Admin command search" onSubmit={submitSearch}>
          <UnigentamosIcon role="search" size={16} />
          <input ref={searchInputRef} value={commandQuery} onChange={event => setCommandQuery(event.target.value)} aria-label="Search notes, files, people, reviews" placeholder="Search notes, files, people, reviews" title="Search the encrypted offline Vault" />
          <kbd aria-hidden="true">⌘K</kbd>
        </form>}
        <PlanningNotifications />{rightSlot}
      </div>
    </header>
  );
}
