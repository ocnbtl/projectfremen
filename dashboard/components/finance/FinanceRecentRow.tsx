"use client";

import { forwardRef, type ReactNode } from "react";
import { motion, useIsPresent, useReducedMotion } from "motion/react";
import styles from "./FinanceCollections.module.css";

const FinanceRecentRow = forwardRef<HTMLElement, { children: ReactNode; id: string }>(function FinanceRecentRow({ children, id }, ref) {
  const present = useIsPresent(), reduced = useReducedMotion();
  return <motion.article ref={ref} layout="position" data-transaction-row={id} className={styles.recentRow}
    inert={!present} aria-hidden={!present || undefined}
    initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: reduced ? 0 : -8 }}
    transition={{ duration: reduced ? 0 : .24, layout: { duration: reduced ? 0 : .34, ease: [.22, .8, .2, 1] } }}>{children}</motion.article>;
});
export default FinanceRecentRow;
