"use client";

import { createContext, useContext, useEffect, useId, useState, type HTMLAttributes } from "react";
import { LayoutGroup, motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { DirectoryView } from "./ViewCycleButton";

const DirectoryViewContext = createContext<string | null>(null);
const layoutTransition = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

/** Stable cards share a layout pass when their directory changes view. No remounts or requests. */
export function DirectoryLayout({ view, children, ...props }: HTMLAttributes<HTMLDivElement> & { view: string }) {
  const id = useId();
  return <DirectoryViewContext.Provider value={view}><LayoutGroup id={id}><div {...props} data-directory-view={view}>{children}</div></LayoutGroup></DirectoryViewContext.Provider>;
}
function useLayoutMotion(position = false) {
  const view = useContext(DirectoryViewContext);
  const reduced = useReducedMotion();
  return { layout: view !== null && !reduced ? (position ? "position" as const : true) : false,
    layoutDependency: view, initial: false as const, transition: { layout: reduced ? { duration: 0 } : layoutTransition } };
}
export function MorphingArticle(props: HTMLMotionProps<"article">) { return <motion.article {...props} {...useLayoutMotion()} data-directory-motion-card />; }
export function MorphingLi(props: HTMLMotionProps<"li">) { return <motion.li {...props} {...useLayoutMotion()} data-directory-motion-card />; }
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
