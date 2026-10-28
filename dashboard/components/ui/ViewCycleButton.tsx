"use client";
import { motion, useReducedMotion } from "motion/react";
export type DirectoryView = "comfortable" | "compact" | "grid";
export type DirectoryViewMode = DirectoryView | "gallery";
const order: DirectoryView[] = ["comfortable", "compact", "grid"];
const labels = { comfortable: "Comfortable", compact: "Compact", grid: "Grid", gallery: "Gallery" };
export default function ViewCycleButton<T extends DirectoryViewMode = DirectoryView>({value, onChange, label = "View", options}: {value: T; onChange: (value: T) => void; label?: string; options?: readonly T[]}) {
  const modes: readonly DirectoryViewMode[] = options ?? order;
  const next = modes[(modes.indexOf(value) + 1) % modes.length] as T;
  return <button type="button" className="directory-view-cycle" data-toolbar-view data-icon-button="standard" aria-label={label + ": " + labels[value] + ". Switch to " + labels[next]} title={labels[value] + " view · switch to " + labels[next]} onClick={() => onChange(next)}><MorphingViewIcon mode={value}/></button>;
}
const VIEW_MORPH_PATHS: Record<DirectoryViewMode, string[]> = {
  comfortable: [
    "M3 5 L7 5 L7 5 L7 5", "M9 5 L21 5 L21 5 L21 5",
    "M3 12 L7 12 L7 12 L7 12", "M9 12 L21 12 L21 12 L21 12",
    "M3 19 L7 19 L7 19 L7 19", "M9 19 L21 19 L21 19 L21 19"
  ],
  compact: [
    "M4 4 L20 4 L20 4 L20 4", "M4 7.2 L20 7.2 L20 7.2 L20 7.2",
    "M4 10.4 L20 10.4 L20 10.4 L20 10.4", "M4 13.6 L20 13.6 L20 13.6 L20 13.6",
    "M4 16.8 L20 16.8 L20 16.8 L20 16.8", "M4 20 L20 20 L20 20 L20 20"
  ],
  gallery: [
    "M3 3 L21 3 L21 3 L21 3", "M21 3 L21 21 L21 21 L21 21",
    "M21 21 L3 21 L3 21 L3 21", "M3 21 L3 3 L3 3 L3 3",
    "M3 17 L9 10 L15 17 L21 12", "M16 7 L17 7 L17 8 L16 8"
  ],
  grid: [
    "M3 3 L9 3 L9 8 L3 8", "M15 3 L21 3 L21 8 L15 8",
    "M3 9.5 L9 9.5 L9 14.5 L3 14.5", "M15 9.5 L21 9.5 L21 14.5 L15 14.5",
    "M3 16 L9 16 L9 21 L3 21", "M15 16 L21 16 L21 21 L15 21"
  ]
};

export function MorphingViewIcon({ mode }: { mode: DirectoryViewMode }) {
  const reduceMotion = useReducedMotion();
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-view-morph={mode}>
      {VIEW_MORPH_PATHS[mode].map((path, index) => (
        <motion.path
          initial={false}
          animate={{ d: path }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          fill="none"
          vectorEffect="non-scaling-stroke"
          key={index}
        />
      ))}
    </svg>
  );
}
