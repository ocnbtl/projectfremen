"use client";
import { useEffect, useState } from "react";
import InspectorRail from "../admin-shell/InspectorRail";
import { WorkspaceButton } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { overviewDate, type FinanceOverviewModel, type OverviewSelection } from "../../lib/modules/finance/overview-model";
import { money } from "./FinancePrimitives";
import FinanceMerchantAvatar from "./FinanceMerchants";
import styles from "./FinanceOverviewInspector.module.css";

export default function FinanceOverviewInspector({ model, selection, mobileOpen, mobile, onClose, onSelect, onOpenTransaction, emptyView }: {
  model: FinanceOverviewModel; selection: OverviewSelection; mobileOpen: boolean; mobile: boolean; onClose: () => void;
  onSelect: (selection: OverviewSelection) => void; onOpenTransaction: (id: string) => void; emptyView?: string;
}) {
  const [limit, setLimit] = useState(40);
  useEffect(() => setLimit(40), [selection.kind, selection.id, model]);
  const period = selection.kind === "period" ? model.periods.find(p => p.id === selection.id) : null;
  const transaction = selection.kind === "transaction" ? model.transactions.find(t => t.id === selection.id) : null;
  const category = selection.kind === "category" && model.spendingGroups.some(g => g.category === selection.id) ? selection.id : "";
  const rows = emptyView ? [] : transaction ? [transaction] : period ? model.transactions.filter(t => t.occurredOn >= period.id && t.occurredOn <= period.to) : category ? model.transactions.filter(t => t.direction === "expense" && t.category === category) : model.transactions;
  const income = rows.filter(t => t.direction === "income").reduce((s,t) => s + Math.round(t.amount*100),0)/100;
  const spending = rows.filter(t => t.direction === "expense").reduce((s,t) => s + Math.round(t.amount*100),0)/100;
  const title = emptyView ? `${emptyView} details` : transaction?.merchant || category || "Transactions in range";
  return <InspectorRail id="finance-inspector" className={`finance-right-rail ${styles.inspector} ${mobileOpen ? "is-mobile-open" : ""}`} ariaLabel="Finance overview details" overlay={mobile} overlayOpen={mobileOpen} onRequestClose={onClose}
    title={<div className={styles.title}>{transaction ? <FinanceMerchantAvatar kind="transaction" id={transaction.id} label={transaction.merchant}/> : <span><UnigentamosIcon role={category?"pie-chart":"list"} size={22}/></span>}<h2>{title}</h2></div>}
    actions={<WorkspaceButton icon="close" aria-label="Return to Finance list" title="Return to Finance list" onClick={onClose}/> }>
    <div className={styles.body}>
      {selection.kind !== "summary" && <WorkspaceButton icon="chevron-left" className={styles.back} onClick={()=>onSelect({kind:"summary",id:""})}>Range summary</WorkspaceButton>}
      <div className={styles.period}><UnigentamosIcon role="calendar" size={16}/><span>{overviewDate(period?.id || model.from)} – {overviewDate(period?.to || model.to)}</span><span>{rows.length} transaction{rows.length===1?"":"s"}</span></div>
      {transaction ? <>
        <div className={styles.amount}><span>{transaction.direction === "income" ? "Income" : "Spending"}</span><strong>{money(transaction.amount,{cents:true})}</strong><small>{transaction.status === "cleared" ? "Posted" : "Pending"} · {transaction.reviewed ? "Reviewed" : "Needs review"}</small></div>
        <dl className={styles.facts}>{[["Account",model.accountNames.get(transaction.accountId)||"Archived account"],["Category",transaction.category],["Date",overviewDate(transaction.occurredOn)],["Scope",transaction.entityScope]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {transaction.memo && <section className={styles.notes}><h3>Notes</h3><p>{transaction.memo}</p></section>}
        <WorkspaceButton intent="primary" icon="edit" className={styles.open} onClick={()=>onOpenTransaction(transaction.id)}>Open transaction</WorkspaceButton>
      </> : <>
        <div className={styles.totals}>{[["Income",income,"banknote"],["Spending",spending,"credit-card"],["Net flow",income-spending,"trending"]].map(([label,value,icon])=><div key={label}><span><UnigentamosIcon role={String(icon)} size={16}/>{label}</span><strong>{money(Number(value),{cents:true})}</strong></div>)}</div>
        <div className={styles.transactions}>{rows.slice(0,limit).map(t=><button type="button" key={t.id} onClick={()=>onSelect({kind:"transaction",id:t.id})}><FinanceMerchantAvatar kind="transaction" id={t.id} label={t.merchant}/><span><strong>{t.merchant}</strong><small>{overviewDate(t.occurredOn)} · {t.category}</small><small>{model.accountNames.get(t.accountId)}{t.status==="pending"?" · Pending":""}</small></span><b>{money(t.direction==="income"?t.amount:-t.amount,{sign:true,cents:true})}</b><UnigentamosIcon role="chevron-right" size={16}/></button>)}</div>
        {rows.length>limit && <WorkspaceButton icon="chevron-down" className={styles.more} onClick={()=>setLimit(n=>n+40)}>Show more ({rows.length-limit})</WorkspaceButton>}
        {!rows.length && <p className={styles.empty}>No transactions match this range and its filters.</p>}
      </>}
    </div>
  </InspectorRail>;
}
