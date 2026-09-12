"use client";
import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { FinanceOverviewModel, OverviewSelection } from "../../lib/modules/finance/overview-model";
import { financeChartScale } from "../../lib/modules/finance/chart-scale";
import { money } from "./FinancePrimitives";

export default function FinanceOverviewChart({ model, selection, onSelect }: { model: FinanceOverviewModel; selection: OverviewSelection; onSelect: (selection: OverviewSelection) => void }) {
  const host = useRef<HTMLDivElement>(null), title = useId();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(430), [hovered, setHovered] = useState("");
  useEffect(() => { if (!host.current) return; const observer = new ResizeObserver(([entry]) => setWidth(Math.max(220, Math.round(entry.contentRect.width)))); observer.observe(host.current); return () => observer.disconnect(); }, []);
  const { periods } = model;
  const scale = financeChartScale(periods.flatMap(p => [p.income, p.spending]));
  const left = 52, right = width - 16, top = 20, bottom = width < 350 ? 186 : 216, height = bottom + 34;
  const x = (index: number) => periods.length === 1 ? (left + right) / 2 : left + (right - left) * index / (periods.length - 1);
  const y = (value: number) => bottom - (bottom - top) * (value - scale.min) / (scale.max - scale.min);
  const path = (field: "income" | "spending") => periods.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(p[field]).toFixed(2)}`).join(" ");
  const active = periods.find(p => p.id === hovered || (!hovered && selection.kind === "period" && p.id === selection.id));
  const tickEvery = Math.max(1, Math.ceil((periods.length - 1) / (width < 380 ? 3 : 4)));
  return <div className="finance-overview-chart" ref={host}>
    <div className="finance-chart-legend"><span><i className="income" />Income</span><span><i className="spend" />Spending</span><small>USD · by {model.unit}</small></div>
    {!model.transactions.length ? <div className="finance-chart-empty"><strong>{model.invalidRange ? "Check your date range" : "No matching transactions"}</strong><p>{model.invalidRange ? "The end date must be on or after the start date." : "Choose another date range or adjust the filters to explore your records."}</p></div> : <>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="group" aria-labelledby={title}>
        <title id={title}>{`Income and spending by ${model.unit}. Select a period to inspect its transactions.`}</title>
        {scale.ticks.map(tick => <g key={tick}><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="finance-chart-grid" /><text x={left - 9} y={y(tick) + 4} textAnchor="end">{new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: scale.max < 1 ? 4 : scale.max < 10 ? 2 : 1 }).format(tick)}</text></g>)}
        {active && <rect className="finance-chart-selection" x={Math.max(left - 10, x(periods.indexOf(active)) - 14)} y={top} width={28} height={bottom - top} rx={8} />}
        {(["income", "spending"] as const).map(field => <motion.path key={`${field}-${periods.length}`} initial={false} animate={{ d: path(field) }} transition={{ duration: reduceMotion ? 0 : .42, ease: [.16, 1, .3, 1] }} className={`finance-flow-line is-${field}`} pathLength={1} />)}
        {periods.map((p, i) => <g key={p.id} role="button" tabIndex={0} aria-label={`${p.label}: ${money(p.income)} income, ${money(p.spending)} spending, ${p.count} transactions`} aria-pressed={selection.kind === "period" && selection.id === p.id} onFocus={() => setHovered(p.id)} onBlur={() => setHovered("")} onMouseEnter={() => setHovered(p.id)} onMouseLeave={() => setHovered("")} onClick={() => onSelect({ kind: "period", id: p.id })} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect({ kind: "period", id: p.id }); } }}>
          <rect x={x(i) - Math.min(22, (right - left) / Math.max(1, periods.length - 1) / 2)} y={top} width={Math.min(44, (right - left) / Math.max(1, periods.length - 1))} height={bottom - top} fill="transparent" />
          <circle cx={x(i)} cy={y(p.income)} r={active?.id === p.id ? 5 : 3} className="finance-flow-point is-income" /><circle cx={x(i)} cy={y(p.spending)} r={active?.id === p.id ? 5 : 3} className="finance-flow-point is-spending" />
          {(i % tickEvery === 0 || i === periods.length - 1) && <text x={x(i)} y={bottom + 24} textAnchor={i === 0 ? "start" : i === periods.length - 1 ? "end" : "middle"}>{p.label}</text>}
        </g>)}
      </svg>
      <div className="finance-chart-readout" aria-live="polite">{active ? <><strong>{active.label}</strong><span>{money(active.income)} in</span><span>{money(active.spending)} out</span></> : <span>Select a point to explore that period.</span>}</div>
      <details className="finance-chart-table"><summary>Explore periods as a table</summary><div><table><thead><tr><th scope="col">Period</th><th scope="col">Income</th><th scope="col">Spending</th></tr></thead><tbody>{periods.map(p => <tr key={p.id}><th scope="row"><button type="button" onClick={() => onSelect({ kind: "period", id: p.id })}>{p.label}</button></th><td>{money(p.income, { cents: true })}</td><td>{money(p.spending, { cents: true })}</td></tr>)}</tbody></table></div></details>
    </>}
  </div>;
}
