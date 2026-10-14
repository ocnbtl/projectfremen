"use client";
import { useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { useTravelSheetMotion } from "./useTravelSheetMotion";
import styles from "./TravelPanel.module.css";

/** Mount inside the dialog portal so its elements exist before measuring. */
export default function TravelSheetBody({children}:{children:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null);
  const reduced=useReducedMotion();
  useTravelSheetMotion(ref,true,reduced);
  return <div ref={ref} className={styles.panel}>{children}</div>;
}
