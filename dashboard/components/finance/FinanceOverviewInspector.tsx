"use client";
import { useEffect, useState } from "react";
import InspectorRail from "../admin-shell/InspectorRail";
import { overviewDate, type FinanceOverviewModel, type OverviewSelection } from "../../lib/modules/finance/overview-model";
import { Icon, IconTile, money } from "./FinancePrimitives";

export default function FinanceOverviewInspector({ model, selection, mobileOpen, mobile, onClose, onSelect, onOpenTransaction, emptyView }: {
  model: FinanceOverviewModel; selection: OverviewSelection; mobileOpen: boolean; mobile: boolean; onClose: () => void;
  onSelect: (selection: OverviewSelection) => void; onOpenTransaction: (id: string) => void; emptyView?: string;
}) {
  const [limit, setLimit] = useState(30);
  useEffect(() => setLimit(30), [selection.kind, selection.id, model]);
  const period = selection.kind === "period" ? model.periods.find(p => p.id === selection.id) : null;
  const transaction = selection.kind === "transaction" ? model.transactions.find(t => t.id === selection.id) : null;
  const category = selection.kind === "category" && model.spendingGroups.some(g => g.category === selection.id) ? selection.id : "";
  const selectedRows = transaction ? [transaction] : period ? model.transactions.filter(t => t.occurredOn >= period.id && t.occurredOn <= period.to) : category ? model.transactions.filter(t => t.direction === "expense" && t.category === category) : model.transactions;
  const rows = emptyView ? [] : selectedRows;
  const income = rows.filter(t => t.direction === "income").reduce((s, t) => s + Math.round(t.amount * 100), 0) / 100;
  const spending = rows.filter(t => t.direction === "expense").reduce((s, t) => s + Math.round(t.amount * 100), 0) / 100;
  const title = emptyView ? `${emptyView} details` : transaction?.merchant || category || (period ? `${overviewDate(period.id)}${period.id !== period.to ? ` – ${overviewDate(period.to)}` : ""}` : "Your money at a glance");
  const merchants = new Map<string, number>();
  rows.filter(t => t.direction === "expense").forEach(t => merchants.set(t.merchant, (merchants.get(t.merchant) || 0) + t.amount));
  const topMerchants = [...merchants].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return <InspectorRail id="finance-inspector" className={`finance-right-rail finance-overview-inspector ${mobileOpen ? "is-mobile-open" : ""}`} ariaLabel="Finance overview details" overlay={mobile} overlayOpen={mobileOpen} onRequestClose={onClose}
    title={<div className="finance-detail-title"><IconTile hue="green" icon={transaction ? "Banknote" : category ? "PiggyBank" : "LineChart"} /><div><p>{transaction ? "Transaction" : category ? "Spending category" : period ? "Cash flow" : "Overview"}</p><h2>{title}</h2></div></div>}
    actions={<button type="button" className="finance-rail-close" aria-label="Return to Finance list" onClick={onClose}><Icon name="X" /></button>}>
    <div className="finance-overview-detail-body">
      {emptyView ? <div className="finance-detail-empty"><IconTile hue="green" icon="Check" /><h3>No records in this view</h3><p>Choose another filter or search to see a record here.</p></div> : <>
        {selection.kind !== "summary" && <button type="button" className="finance-text-action" onClick={() => onSelect({ kind: "summary", id: "" })}>← Back to range summary</button>}
        <p className="finance-detail-period">{overviewDate(period?.id || model.from)} – {overviewDate(period?.to || model.to)}</p>
        {transaction ? <>
          <div className="finance-detail-amount"><span>{transaction.direction === "income" ? "Money in" : "Money out"}</span><strong>{money(transaction.amount, { cents: true })}</strong><small>{transaction.status === "cleared" ? "Posted" : "Pending at bank"} · {transaction.reviewed ? "Reviewed" : "To review"}</small></div>
          <dl className="finance-detail-facts"><div><dt>Account</dt><dd>{model.accountNames.get(transaction.accountId) || "Archived account"}</dd></div><div><dt>Category</dt><dd>{transaction.category}</dd></div><div><dt>Date</dt><dd>{overviewDate(transaction.occurredOn)}</dd></div><div><dt>Scope</dt><dd>{transaction.entityScope}</dd></div></dl>
          {transaction.memo && <section><h3>Notes</h3><p className="finance-detail-notes">{transaction.memo}</p></section>}
          <button type="button" className="finance-action is-primary" onClick={() => onOpenTransaction(transaction.id)}>Open transaction <Icon name="Chevron" /></button>
        </> : <>
          <div className="finance-detail-amount"><span>{category ? "Category spending" : "Net cash flow"}</span><strong>{money(category ? spending : income - spending, { cents: true })}</strong><small>{rows.length} matching transaction{rows.length === 1 ? "" : "s"}</small></div>
          {!category && <div className="finance-detail-in-out"><div><span>Income</span><strong>{money(income, { cents: true })}</strong></div><div><span>Spending</span><strong>{money(spending, { cents: true })}</strong></div></div>}
          {!!topMerchants.length && <section><h3>Largest destinations</h3><dl className="finance-detail-facts">{topMerchants.map(([merchant, amount]) => <div key={merchant}><dt>{merchant}</dt><dd>{money(amount, { cents: true })}</dd></div>)}</dl></section>}
          <section><h3>Behind the numbers</h3><div className="finance-detail-transactions">{rows.slice(0, limit).map(t => <button type="button" key={t.id} onClick={() => onSelect({ kind: "transaction", id: t.id })}><IconTile hue={t.direction === "income" ? "green" : "brown"} icon="Banknote" /><span><strong>{t.merchant}</strong><small>{overviewDate(t.occurredOn)} · {model.accountNames.get(t.accountId)}</small><small>{t.category}{t.status === "pending" ? " · pending" : ""}</small></span><strong>{money(t.direction === "income" ? t.amount : -t.amount, { sign: true, cents: true })}</strong></button>)}</div>{rows.length > limit && <button type="button" className="finance-text-action" onClick={() => setLimit(current => current + 30)}>Show more transactions ({rows.length - limit} remaining)</button>}{!rows.length && <p className="finance-inline-empty">No transactions match the current chart filters.</p>}</section>
        </>}
      </>}
    </div>
  </InspectorRail>;
}
