"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./ProjectStarButton.module.css";

export default function ProjectStarButton({ starred, disabled, onClick, size = 18 }: { starred: boolean; disabled?: boolean; onClick: () => void; size?: number }) {
  const reduced = useReducedMotion(), previous = useRef(starred);
  const [burst, setBurst] = useState(0);
  useEffect(() => { if (starred && !previous.current && !reduced) setBurst(value => value + 1); previous.current = starred; }, [starred, reduced]);
  return <button type="button" className={styles.button} disabled={disabled} aria-label={starred ? "Remove star" : "Star project"} aria-pressed={starred} onClick={onClick} data-icon-button="standard">
    <motion.span key={burst} animate={burst && starred && !reduced ? { scale: [1, 1.25, .95, 1], rotate: [0, -12, 8, 0] } : {scale:1,rotate:0}} transition={{duration:.4}}><UnigentamosIcon role="star" size={size} style={{fill:starred ? "currentColor" : "none"}}/></motion.span>
    {burst > 0 && starred && !reduced && <span key={`spark-${burst}`} className={styles.sparks} aria-hidden="true">{Array.from({length:6}, (_,index) => <motion.i key={index} initial={{x:0,y:0,opacity:1,scale:.6}} animate={{x:Math.cos(index*Math.PI/3)*23,y:Math.sin(index*Math.PI/3)*23,opacity:0,scale:0}} transition={{duration:.5,ease:"easeOut"}}/>)}</span>}
  </button>;
}
