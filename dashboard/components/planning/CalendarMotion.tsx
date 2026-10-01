"use client";

import { animate, motion, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useMotionPreference } from "../admin-shell/ExperienceProvider";
import styles from "./CalendarWorkspace.module.css";

export const calendarSpring = { type: "spring" as const, stiffness: 340, damping: 36, mass: 0.9 };
const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const readMotion = () => window.matchMedia(reducedQuery).matches;
const serverMotion = () => true;

export function useCalendarMotion() {
  const systemReduced = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
  const { preference } = useMotionPreference();
  const reduced = !!systemReduced || preference === "reduce";
  return { reduced, layoutTransition: reduced ? { duration: 0 } : calendarSpring };
}

export function CalendarScene({ id, direction = 1, children }: { id: string; direction?: number; children: ReactNode }) {
  const { reduced } = useCalendarMotion();
  const previous = useRef(id), running = useRef<AnimationPlaybackControls[]>([]);
  const x = useMotionValue(0), opacity = useMotionValue(1);
  useLayoutEffect(() => {
    if (reduced) {
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
