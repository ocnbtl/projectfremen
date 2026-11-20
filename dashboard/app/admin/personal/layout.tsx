"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { HOME_SHORTCUTS } from "../../../lib/modules/personal-ops/home-settings";
import styles from "./PersonalRoute.module.css";

const home = "/admin/personal";
const allowsMotion = () => typeof Element.prototype.animate === "function" && document.documentElement.dataset.productMotion !== "reduce" &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches;

function identity(root: HTMLElement, pathname: string, other: string) {
  if (pathname === home) {
    const links = root.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Personal spaces"] a');
    return [...links].find(link => new URL(link.href).pathname === other)?.querySelector("strong");
  }
  const label = HOME_SHORTCUTS.find(space => pathname === space.href || pathname.startsWith(space.href + "/"))?.label.toLowerCase();
  if (!label) return;
  return [...root.querySelectorAll<HTMLElement>(".workspace-nav-trigger > span, main h1")]
    .find(node => node.textContent?.trim().toLowerCase() === label && node.getClientRects().length);
}

// Take the text bounds so that headings which also contain an icon land precisely.
function measure(element?: Element | null) {
  if (!element) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const label = node.textContent?.trim();
    if (!label) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const bounds = range.getBoundingClientRect();
    if (!bounds.width || !bounds.height) continue;
    const style = getComputedStyle(node.parentElement || element);
    return { label, bounds, font: style.font, color: style.color };
  }
}

type Mark = NonNullable<ReturnType<typeof measure>>;

export default function PersonalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const outgoing = useRef<{ from: string; to: string; mark: Mark } | undefined>(undefined);

  useLayoutEffect(() => {
    const section = root.current;
    if (!section) return;
    let observer: MutationObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let label: HTMLSpanElement | undefined;
    let reveal: Animation | undefined;
    const previous = outgoing.current;
    outgoing.current = undefined;
    const arrive = () => {
      if (!previous || previous.to !== pathname || !allowsMotion()) return;
      const target = identity(section, pathname, previous.from);
      const next = measure(target);
      if (!target || !next) return;
      observer?.disconnect();
      const start = previous.mark.bounds;
      label = document.createElement("span");
      label.className = styles.movingLabel;
      label.setAttribute("aria-hidden", "true");
      label.textContent = previous.mark.label;
      Object.assign(label.style, { left: start.left + "px", top: start.top + "px", height: start.height + "px", font: previous.mark.font, color: previous.mark.color });
      document.body.append(label);
      const end = next.bounds;
      const transform = `translate(${end.left - start.left}px, ${end.top - start.top}px) scale(${end.width/start.width}, ${end.height/start.height})`;
      const timing = { duration: 280, easing: "cubic-bezier(.22, 1, .36, 1)" };
      const travel = label.animate([{ transform: "none", opacity: 1 }, { transform, opacity: 0 }], timing);
      reveal = target.animate([{ opacity: 0 }, { opacity: 1 }], timing);
      travel.onfinish = () => label?.remove();
      return true;
    };
    const frame = requestAnimationFrame(() => {
      if (previous?.to === pathname && allowsMotion() && !arrive() && pathname === home) {
        // Home shortcuts appear after the task workspace has loaded.
        observer = new MutationObserver(arrive);
        observer.observe(section, { childList: true, subtree: true });
        timeout = setTimeout(() => observer?.disconnect(), 1500);
      }
    });
    const remember = (to: string, source?: Element | null) => {
      outgoing.current = undefined;
      if (to === pathname || !(to === home || to.startsWith(home + "/")) || !allowsMotion()) return;
      const mark = measure(source || identity(section, pathname, to));
      if (mark) outgoing.current = { from: pathname, to, mark };
    };
    const click = (event: MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.origin !== location.origin || (link.target && link.target !== "_self")) return;
      remember(link.pathname, link.closest('nav[aria-label="Personal spaces"]') ? link.querySelector("strong") : undefined);
    };
    const pop = () => remember(location.pathname);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop, true);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", pop, true);
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      observer?.disconnect();
      label?.remove();
      reveal?.cancel();
    };
  }, [pathname]);

  return <div ref={root} className={styles.route}>{children}</div>;
}
