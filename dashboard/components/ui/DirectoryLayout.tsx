"use client";

import { createContext, useContext, useEffect, useId, useState, useRef, useImperativeHandle, type Ref, type HTMLAttributes } from "react";
import { LayoutGroup, motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { DirectoryView } from "./ViewCycleButton";

const DirectoryViewContext = createContext<string | null>(null);
// One critically damped spring preserves velocity when a view change is interrupted.
const layoutTransition = { type: "spring" as const, stiffness: 400, damping: 36, mass: 0.8, restDelta: 0.1, restSpeed: 3 };

/** Stable cards share a layout pass when their directory changes view. No remounts or requests. */
export function DirectoryLayout({ view, children, ...props }: HTMLAttributes<HTMLDivElement> & { view: string }) {
  const id = useId();
  return <DirectoryViewContext.Provider value={view}><LayoutGroup id={id}><div {...props} data-directory-view={view}>{children}</div></LayoutGroup></DirectoryViewContext.Provider>;
}
function useLayoutMotion(position = false) {
  const view = useContext(DirectoryViewContext);
  const reduced = useReducedMotion();
  return { layout: view !== null && !reduced ? (position ? "position" as const : true) : false,
    "data-directory-motion-part": true, layoutDependency: view, initial: false as const, transition: { layout: reduced ? { duration: 0 } : layoutTransition } };
}
function useCardBounds<T extends HTMLElement>(forwardedRef: Ref<T> | undefined) {
  const ref = useRef<T>(null);
  useImperativeHandle(forwardedRef, () => ref.current!, []);
  return { ref,
    onLayoutAnimationStart: () => ref.current?.setAttribute("data-layout-animating", "true"),
    onLayoutAnimationComplete: () => ref.current?.removeAttribute("data-layout-animating") };
}
export function MorphingArticle({ref, ...props}: HTMLMotionProps<"article">) { return <motion.article {...props} {...useLayoutMotion()} {...useCardBounds(ref)} data-directory-motion-card />; }
export function MorphingLi({ref, ...props}: HTMLMotionProps<"li">) { return <motion.li {...props} {...useLayoutMotion()} {...useCardBounds(ref)} data-directory-motion-card />; }
// Position-only children cancel the parent's scale so text and controls don't stretch.
export function MorphingDiv({ resize = false, ...props }: HTMLMotionProps<"div"> & { resize?: boolean }) { return <motion.div {...props} {...useLayoutMotion(!resize)} />; }
export function MorphingSpan({ resize = false, ...props }: HTMLMotionProps<"span"> & { resize?: boolean }) { return <motion.span {...props} {...useLayoutMotion(!resize)} />; }
export function MorphingButton(props: HTMLMotionProps<"button">) { return <motion.button {...props} {...useLayoutMotion(true)} />; }
export function MorphingP(props: HTMLMotionProps<"p">) { return <motion.p {...props} {...useLayoutMotion(true)} />; }

export function usePersonalDirectoryView() {
  const [view, setView] = useState<DirectoryView>("comfortable");
  useEffect(() => { try { const saved = localStorage.getItem("unigentamos.personal.directory-view"); if (saved === "comfortable" || saved === "compact" || saved === "grid") setView(saved); } catch {} }, []);
  return [view, (next: DirectoryView) => { setView(next); try { localStorage.setItem("unigentamos.personal.directory-view", next); } catch {} }] as const;
}
export function MorphingStrong(props: HTMLMotionProps<"strong">) { return <motion.strong {...props} {...useLayoutMotion(true)} />; }
