"use client";

import { useLayoutEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

export type ChartPoint = { x: number; y: number };
const draw = (points: readonly ChartPoint[]) => points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ");
function at(points: readonly ChartPoint[], x: number) {
  if (x <= points[0].x) return points[0].y;
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i].x) {
      const previous = points[i - 1], next = points[i];
      return previous.y + (next.y - previous.y) * (x - previous.x) / (next.x - previous.x || 1);
    }
  }
  return points[points.length - 1].y;
}

export default function FinanceMorphLine({ points, className }: { points: ChartPoint[]; className: string }) {
  const path = useRef<SVGPathElement>(null), current = useRef(points), reduced = useReducedMotion();
  useLayoutEffect(() => {
    if (!path.current || !points.length) return;
    const previous = current.current;
    if (reduced || !previous.length || previous === points) {
      current.current = points;
      path.current.setAttribute("d", draw(points));
      return;
    }
    // The union of both sets of knots preserves every original vertex. Unlike
    // fixed resampling, this never flattens spikes in the final financial data.
    const xs = [...new Set([...previous, ...points].map(p => p.x))].sort((a, b) => a - b);
    const from = xs.map(x => ({ x, y: at(previous, x) }));
    const to = xs.map(x => ({ x, y: at(points, x) }));
    path.current.setAttribute("d", draw(from));
    const animation = animate(0, 1, {
      duration: .46, ease: [.22, .8, .2, 1],
      onUpdate: progress => {
        current.current = from.map((p, i) => ({ x: p.x, y: p.y + (to[i].y - p.y) * progress }));
        path.current?.setAttribute("d", draw(current.current));
      },
      onComplete: () => { current.current = points; path.current?.setAttribute("d", draw(points)); },
    });
    return () => animation.stop();
  }, [points, reduced]);
  return <path ref={path} d={draw(points)} data-chart-morph-line className={className} pathLength={1}/>;
}
