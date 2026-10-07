"use client";
import { useLayoutEffect, useRef, useState } from "react";
import styles from "./EventContinuation.module.css";

/** Draw the actual card outline, retaining round corners at continuation tips. */
export default function EventContinuation({ before, after }: { before: boolean; after: boolean }) {
  const element = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const parent = element.current?.parentElement;
    if (!parent) return;
    const measure = () => setSize({ width: parent.clientWidth, height: parent.clientHeight });
    const observer = new ResizeObserver(measure);
    measure(); observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  const { width: w, height: h } = size, r = Math.min(7, h / 4), tip = Math.min(11, w / 5), mid = h / 2;
  const left = before ? tip : 1, right = after ? w - tip : w - 1;
  const d = w && h ? `M ${left + r} 1 H ${right - r}
    ${after ? `Q ${right} 1 ${right + 2} 5 L ${w - 2} ${mid - 2} Q ${w} ${mid} ${w - 2} ${mid + 2} L ${right + 2} ${h - 5} Q ${right} ${h - 1} ${right - r} ${h - 1}` : `Q ${right} 1 ${right} ${r + 1} V ${h - r - 1} Q ${right} ${h - 1} ${right - r} ${h - 1}`}
    H ${left + r}
    ${before ? `Q ${left} ${h - 1} ${left - 2} ${h - 5} L 2 ${mid + 2} Q 0 ${mid} 2 ${mid - 2} L ${left - 2} 5 Q ${left} 1 ${left + r} 1` : `Q 1 ${h - 1} 1 ${h - r - 1} V ${r + 1} Q 1 1 ${left + r} 1`} Z` : "";
  return <svg ref={element} className={styles.outline} aria-hidden="true" data-continuation-outline><path d={d} /></svg>;
}
