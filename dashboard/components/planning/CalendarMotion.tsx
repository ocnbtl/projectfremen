"use client";

import { animate, motion, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore, type RefObject, type ReactNode } from "react";
import { useMotionPreference } from "../admin-shell/ExperienceProvider";
import { flushSync } from "react-dom";
import styles from "./CalendarWorkspace.module.css";

export const calendarSpring = { type: "spring" as const, stiffness: 210, damping: 30, mass: 1 };
const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const readMotion = () => window.matchMedia(reducedQuery).matches;
const serverMotion = () => true;
// A pinch already supplies continuous geometry; nested springs must not chase it.
export const CalendarGestureContext = createContext(false);

export function useCalendarMotion() {
  const directGesture = useContext(CalendarGestureContext);
  const systemReduced = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
  const { preference } = useMotionPreference();
  const reduced = !!systemReduced || preference === "reduce";
  // Native snapshots already interpolate geometry. A second layout animation
  // would capture transformed text and then jump when the snapshots disappear.
  const snapshotting = typeof document !== "undefined" && !!document.documentElement.dataset.calendarMorph;
  return { reduced, directGesture, layoutTransition: reduced || snapshotting || directGesture ? { duration: 0 } : calendarSpring };
}

export function CalendarScene({ id, direction = 1, children }: { id: string; direction?: number; children: ReactNode }) {
  const { reduced } = useCalendarMotion();
  const previous = useRef(id), running = useRef<AnimationPlaybackControls[]>([]);
  const x = useMotionValue(0), opacity = useMotionValue(1);
  useLayoutEffect(() => {
    if (reduced || document.documentElement.dataset.calendarMorph) {
      running.current.forEach(animation => animation.stop());
      x.set(0); opacity.set(1); previous.current = id;
      return;
    }
    if (previous.current === id) return;
    previous.current = id;
    running.current.forEach(animation => animation.stop());
    // Keep one live calendar: rapid navigation retargets the current motion,
    // without retaining stale weeks, focusable controls or duplicate event IDs.
    x.set(reduced ? 0 : Math.max(-18, Math.min(18, x.get() + direction * 12)));
    opacity.set(reduced ? 1 : 0.86);
    running.current = [animate(x, 0, reduced ? { duration: 0 } : calendarSpring), animate(opacity, 1, { duration: 0.18 })];
  }, [id, direction, reduced, x, opacity]);
  useLayoutEffect(() => () => running.current.forEach(animation => animation.stop()), []);
  return <div className={styles.calendarStage}>
    <motion.div className={styles.calendarScene} style={{ x, opacity }}>{children}</motion.div>
  </div>;
}

/** Match visible dates and events across projections without retaining duplicate live controls. */
export function useCalendarMorph(root: RefObject<HTMLElement | null>) {
  const { reduced } = useCalendarMotion();
  const active = useRef<ViewTransition | null>(null), revision = useRef(0);
  const cleanup = useRef<() => void>(() => {});
  useLayoutEffect(() => () => { revision.current++; active.current?.skipTransition(); cleanup.current(); }, []);
  return (update: () => void) => {
    const version = ++revision.current;
    active.current?.skipTransition(); cleanup.current();
    if (reduced || !document.startViewTransition || !root.current) { update(); return; }
    const names = new Map<string, string>(), touched = new Map<HTMLElement, string>(), classes = new Map<HTMLElement, string>();
    const outgoing = new Map<string, HTMLElement>(), fromMonth = root.current.dataset.view === "month";
    const mark = (node: HTMLElement, name: string) => { if (!classes.has(node)) classes.set(node,node.style.getPropertyValue("view-transition-class")); node.style.setProperty("view-transition-class",name); };
    const capture = (incoming = false) => {
      const surface = root.current; if (!surface) return;
      const monthChange = fromMonth && surface.dataset.view === "month";
      if (incoming && monthChange) document.documentElement.dataset.calendarMonthMorph = "true";
      const rect = surface.getBoundingClientRect(), used = new Set<string>();
      if (!touched.has(surface)) touched.set(surface, surface.style.viewTransitionName); surface.style.viewTransitionName = "calendar-surface";
      const focus = Date.parse(surface.dataset.morphFocus || "");
      const nodes = [...surface.querySelectorAll<HTMLElement>("[data-morph-date], [data-morph-event]")].sort((a, b) => (a.dataset.morphDate ? Math.abs(Date.parse(a.dataset.morphDate) - focus) : -1) - (b.dataset.morphDate ? Math.abs(Date.parse(b.dataset.morphDate) - focus) : -1));
      for (const node of nodes) {
        const box = node.getBoundingClientRect(), key = node.dataset.morphDate ? "date:" + node.dataset.morphDate : "event:" + node.dataset.morphEvent;
        if (node.inert || used.has(key) || !box.width || box.bottom < rect.top || box.top > Math.min(rect.bottom, innerHeight) || names.size > 120 && !names.has(key)) continue;
        // View-transition layers escape scroll clipping. Leave clipped events
        // inside their parent snapshot instead of exposing offscreen portraits.
        let clipped = false;
        for (let parent = node.parentElement; parent && parent !== surface; parent = parent.parentElement) {
          const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1) || /(auto|scroll|hidden|clip)/.test(style.overflowX) && (box.left < bounds.left - 1 || box.right > bounds.right + 1)) { clipped = true; break; }
        }
        if (clipped) continue;
        const entering = incoming && !names.has(key);
        used.add(key); if (!names.has(key)) names.set(key, "calendar-item-" + names.size);
        if (!touched.has(node)) touched.set(node, node.style.viewTransitionName);
        node.style.viewTransitionName = names.get(key)!;
        if (!incoming) outgoing.set(key,node);
        if (incoming && monthChange && node.dataset.morphEvent && outgoing.has(key)) {
          // Keep one opaque identity throughout its trip between month rows.
          mark(outgoing.get(key)!,"calendar-shared-event"); mark(node,"calendar-shared-event");
        }
        if (entering && node.dataset.morphDate) {
          mark(node,"calendar-entering-date");
        }
      }
    };
    document.documentElement.dataset.calendarMorph = "true";
    cleanup.current = () => { for (const [node, name] of touched) node.style.viewTransitionName = name; for (const [node, value] of classes) node.style.setProperty("view-transition-class", value); delete document.documentElement.dataset.calendarMorph; delete document.documentElement.dataset.calendarMonthMorph; };
    capture();
    const transition = document.startViewTransition(() => { if (version !== revision.current) return; flushSync(update); capture(true); });
    active.current = transition;
    void transition.ready.catch(() => {}); // Unsupported/hidden documents still apply the update.
    void transition.finished.finally(() => { if (version === revision.current) { cleanup.current(); active.current = null; } }).catch(() => {});
  };
}
