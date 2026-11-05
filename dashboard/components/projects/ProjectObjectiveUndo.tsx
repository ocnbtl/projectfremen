"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import styles from "./ProjectObjectiveUndo.module.css";

export default function ProjectObjectiveUndo({objective, error, busy, onUndo, onDismiss}: {
  objective?: string; error: string; busy: boolean; onUndo: () => void; onDismiss: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<AnimatePresence initial={false}>
    {objective && <motion.aside className={styles.toast} style={moduleThemeVariables("projects") as CSSProperties} aria-label="Objective completion" initial={{opacity:0,y:-6,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-4,scale:.98}} transition={{duration:reducedMotion ? 0 : .2,ease:[.22,1,.36,1]}}>
      <UnigentamosIcon role="check" size={18}/>
      <div className={styles.message} role="status"><strong>Objective complete</strong><span title={objective}>{objective}</span></div>
      <button type="button" className={styles.undo} disabled={busy} onClick={onUndo}>Undo</button>
      <button type="button" className={styles.dismiss} disabled={busy} onClick={onDismiss} aria-label="Dismiss completion notification"><UnigentamosIcon role="close" size={17}/></button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </motion.aside>}
  </AnimatePresence>, document.body);
}
