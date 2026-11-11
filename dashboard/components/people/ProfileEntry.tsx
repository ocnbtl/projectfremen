"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

/** Grow the row itself so surrounding fields move with it; never clip settled menus. */
export default function ProfileEntry(props: HTMLMotionProps<"article">) {
  const reduced = useReducedMotion();
  return <motion.article {...props} layout={reduced ? false : "position"}
    initial={reduced ? false : { height: 0, opacity: 0, overflow: "hidden" }}
    animate={{ height: "auto", opacity: 1, overflow: "hidden", transitionEnd: { overflow: "visible" } }}
    exit={{ height: 0, opacity: 0, overflow: "hidden" }}
    transition={{ duration: reduced ? 0 : .32, ease: [.22, 1, .36, 1] }} />;
}
