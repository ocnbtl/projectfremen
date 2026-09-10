"use client";

import { useEffect, useId, useRef, useState } from "react";
import { financeChartScale } from "../../lib/modules/finance/chart-scale";
import type { FinanceCashflowSeries } from "../../lib/modules/finance/types";

const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const axisDollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: Math.abs(value) >= 1000 ? "compact" : "standard", maximumFractionDigits: Math.abs(value) < 1 && value !== 0 ? 4 : 1 }).format(value);

export default function FinanceCashflowChart({ cashflow, summary, ariaLabel = "Cashflow over six months" }: {
  cashflow: FinanceCashflowSeries; summary: string; ariaLabel?: string; compact?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const descriptionId = useId();
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const { months, income, spend, savings } = cashflow;
  const domain = financeChartScale([...income, ...spend, ...savings]);
  const height = 260;
  const left = 58;
  const bottom = 224;
  const y = (value: number) => 18 + (domain.max - value) / (domain.max - domain.min) * (bottom - 18);
  const step = (width - left - 12) / Math.max(months.length, 1);
  const x = (index: number) => left + step * (index + 0.5);
  const barWidth = Math.min(22, step * .23);
  const hasActivity = [...income, ...spend, ...savings].some((value) => value !== 0);
  return <div className="finance-cashflow" ref={container}>
    <div className="finance-chart-legend"><span><i className="income" />Income</span><span><i className="spend" />Spending</span><span><i className="savings" />Savings moved</span></div>
    {hasActivity ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} aria-describedby={descriptionId}>
      {domain.ticks.map((tick) => <g key={tick}>
        <line x1={left} x2={width - 8} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "finance-chart-zero" : "finance-chart-grid"} />
        <text x={left - 10} y={y(tick) + 4} textAnchor="end">{axisDollars(tick)}</text>
      </g>)}
      {months.map((month, index) => <g key={`${month}-${index}`}>
        <rect className="finance-bar-income" x={x(index) - barWidth - 2} y={Math.min(y(income[index] || 0), y(0))} width={barWidth} height={Math.abs(y(income[index] || 0) - y(0))} rx="3" />
        <rect className="finance-bar-spend" x={x(index) + 2} y={Math.min(y(spend[index] || 0), y(0))} width={barWidth} height={Math.abs(y(spend[index] || 0) - y(0))} rx="3" />
        <text x={x(index)} y={height - 10} textAnchor="middle">{month}</text>
      </g>)}
      <polyline className="finance-chart-savings" points={months.map((_, index) => `${x(index)},${y(savings[index] || 0)}`).join(" ")} />
      {months.map((month, index) => <circle key={`${month}-${index}`} cx={x(index)} cy={y(savings[index] || 0)} r="3.5" className="finance-chart-dot" />)}
    </svg> : <div className="finance-chart-empty"><strong>Your cashflow starts with your first transaction.</strong><p>Record income and spending, or import a statement, to see your monthly pattern here.</p></div>}
    <p id={descriptionId} className="sr-only">{summary} Income and spending are dollar amounts. Savings moved includes withdrawals below zero.</p>
    <details className="finance-chart-table"><summary>View monthly totals</summary><div><table><caption className="sr-only">Recorded monthly cashflow in US dollars</caption><thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Spending</th><th scope="col">Savings moved</th></tr></thead><tbody>{months.map((month, index) => <tr key={`${month}-${index}`}><th scope="row">{month}</th><td>{dollars(income[index] || 0)}</td><td>{dollars(spend[index] || 0)}</td><td>{dollars(savings[index] || 0)}</td></tr>)}</tbody></table></div></details>
  </div>;
}
