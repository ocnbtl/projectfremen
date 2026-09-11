"use client";
import { useEffect, useId, useRef, useState } from "react";
import { financeChartScale } from "../../lib/modules/finance/chart-scale";
import type { FinanceCashflowSeries } from "../../lib/modules/finance/types";
const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const axisDollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: Math.abs(value) >= 1000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);

export default function FinanceCashflowChart({ cashflow, summary, ariaLabel = "Recorded income and spending", onPeriod }: {
  cashflow: FinanceCashflowSeries; summary: string; ariaLabel?: string; compact?: boolean; onPeriod?: (period: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null), descriptionId = useId();
  const [width, setWidth] = useState(800), [choice, setChoice] = useState<number | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  const { months, income, spend } = cashflow;
  const selected = Math.min(choice ?? months.length - 1, months.length - 1);
  const selectedPeriod = cashflow.periods?.[selected];
  const domain = financeChartScale([...income, ...spend]);
  const height = 280, left = 54, bottom = 248;
  const y = (value: number) => 22 + (domain.max - value) / (domain.max - domain.min) * (bottom - 22);
  const step = (width - left - 12) / Math.max(months.length, 1);
  const x = (index: number) => left + step * (index + 0.5), barWidth = Math.min(36, step * .24);
  const hasActivity = [...income, ...spend].some(value => value !== 0);
  return <div className="finance-cashflow" ref={container}>
    <div className="finance-chart-legend"><span><i className="income" />Income</span><span><i className="spend" />Spending</span><small>Posted payments · transfers excluded</small></div>
    {hasActivity ? <>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} aria-describedby={descriptionId}>
        {domain.ticks.map(tick => <g key={tick}><line x1={left} x2={width - 8} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "finance-chart-zero" : "finance-chart-grid"} /><text x={left - 8} y={y(tick) + 4} textAnchor="end">{axisDollars(tick)}</text></g>)}
        {months.map((month, i) => <g key={`${month}-${i}`} className="finance-chart-month" onMouseEnter={() => setChoice(i)} onClick={() => setChoice(i)}>
          <title>{`${cashflow.periods?.[i] || month}: income ${dollars(income[i] || 0)}, spending ${dollars(spend[i] || 0)}`}</title>
          <rect x={left + step * i} y={8} width={step} height={bottom - 8} fill={selected === i ? "#f0f5ee" : "transparent"} rx={6} />
          <rect className="finance-bar-income" x={x(i) - barWidth - 2} y={Math.min(y(income[i] || 0), y(0))} width={barWidth} height={Math.abs(y(income[i] || 0) - y(0))} rx={4} />
          <rect className="finance-bar-spend" x={x(i) + 2} y={Math.min(y(spend[i] || 0), y(0))} width={barWidth} height={Math.abs(y(spend[i] || 0) - y(0))} rx={4} />
          <text x={x(i)} y={height - 10} textAnchor="middle">{month}</text>
        </g>)}
      </svg>
      <div className="finance-chart-periods" role="group" aria-label="Choose cashflow month">{months.map((m, i) => <button key={`${m}-${i}`} type="button" aria-pressed={selected === i} onClick={() => setChoice(i)}>{cashflow.periods?.[i] || m}{cashflow.periods?.[i] === new Date().toISOString().slice(0, 7) ? " · so far" : ""}</button>)}</div>
      <div className="finance-month-totals" aria-live="polite">{[["Income", income[selected] || 0], ["Spending", spend[selected] || 0], ["Net difference", (income[selected] || 0) - (spend[selected] || 0)]].map(([label, value]) => <div key={label}><span>{months[selected]} · {label}</span><strong>{dollars(Number(value))}</strong></div>)}</div>
      {onPeriod && selectedPeriod && <button className="finance-text-action" type="button" onClick={() => onPeriod(selectedPeriod)}>See transactions for {selectedPeriod} ↗</button>}
    </> : <div className="finance-chart-empty"><strong>Your cashflow starts with your first transaction.</strong><p>Record income and spending, or import a statement, to see your monthly pattern.</p></div>}
    <p className="finance-chart-coverage">{cashflow.firstObservedOn ? `Records ${cashflow.firstObservedOn}–${cashflow.lastObservedOn}. First and current months may be partial; missing history is not zero spending.` : "Based on recorded transactions only."}</p>
    <p id={descriptionId} className="sr-only">{summary} Income and spending are dollar amounts. Use the month buttons or totals table for exact amounts.</p>
    <details className="finance-chart-table"><summary>View monthly totals</summary><div><table><caption className="sr-only">Recorded monthly cashflow in US dollars</caption><thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Spending</th><th scope="col">Net difference</th></tr></thead><tbody>{months.map((m, i) => <tr key={`${m}-${i}`}><th scope="row">{cashflow.periods?.[i] || m}</th><td>{dollars(income[i] || 0)}</td><td>{dollars(spend[i] || 0)}</td><td>{dollars((income[i] || 0) - (spend[i] || 0))}</td></tr>)}</tbody></table></div></details>
  </div>;
}
