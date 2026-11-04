"use client";
import { useEffect, useRef, useState } from "react";
import InspectorRail from "../admin-shell/InspectorRail";
import { WorkspaceButton } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { overviewDate, type FinanceOverviewModel, type OverviewSelection } from "../../lib/modules/finance/overview-model";
import { money } from "./FinancePrimitives";
import FinanceMerchantAvatar from "./FinanceMerchants";
import { TransactionAccount } from "./FinanceTransactionAccount";
import FinanceDirectionDot from "./FinanceDirectionDot";
import styles from "./FinanceOverviewInspector.module.css";

export default function FinanceOverviewInspector({ model, selection, mobileOpen, mobile, onClose, onSelect, onOpenTransaction, emptyView }: {
  model: FinanceOverviewModel; selection: OverviewSelection; mobileOpen: boolean; mobile: boolean; onClose: () => void;
  onSelect: (selection: OverviewSelection) => void; onOpenTransaction: (id: string) => void; emptyView?: string;
}) {
  const [limit, setLimit] = useState(40);
  useEffect(() => setLimit(40), [selection.kind, selection.id, selection.flow, model]);
  const previousList = useRef<{transactionId: string; selection: OverviewSelection} | null>(null);
  const period = selection.kind === "period" ? model.periods.find(p => p.id === selection.id) : null;
  const transaction = selection.kind === "transaction" ? model.transactions.find(t => t.id === selection.id) : null;
  const category = selection.kind === "category" && model.spendingGroups.some(g => g.category === selection.id) ? selection.id : "";
  const rows = emptyView ? [] : transaction ? [transaction] : period ? model.transactions.filter(t => t.occurredOn >= period.id && t.occurredOn <= period.to) : category ? model.transactions.filter(t => t.direction === "expense" && t.category === category) : model.transactions;
  const income = rows.filter(t => t.direction === "income").reduce((s,t) => s + Math.round(t.amount*100),0)/100;
  const spending = rows.filter(t => t.direction === "expense").reduce((s,t) => s + Math.round(t.amount*100),0)/100;
  const flow = selection.kind === "income" || selection.kind === "spending" ? selection.kind : selection.flow;
  const visibleRows = !flow ? rows : rows.filter(t => t.direction === (flow === "income" ? "income" : "expense"));
  const toggleFlow = (next: "income" | "spending") => {
    const resolved = flow === next ? undefined : next;
    onSelect(period || category ? { ...selection, flow: resolved } : { kind: resolved || "summary", id: "" });
  };
  const returnToList = () => onSelect(transaction && previousList.current?.transactionId === transaction.id ? previousList.current.selection : { kind: "summary", id: "" });
  const title = emptyView ? `${emptyView} details` : transaction?.merchant || category || "Transactions in range";
  return <InspectorRail id="finance-inspector" className={`finance-right-rail ${styles.inspector} ${mobileOpen ? "is-mobile-open" : ""}`} ariaLabel="Finance overview details" overlay={mobile} overlayOpen={mobileOpen} onRequestClose={onClose}
    title={<div className={styles.title}>{transaction ? <FinanceMerchantAvatar kind="transaction" id={transaction.id} label={transaction.merchant}/> : <span><UnigentamosIcon role={category?"pie-chart":"list"} size={22}/></span>}<h2>{title}</h2></div>}
    actions={<WorkspaceButton icon="close" aria-label="Return to Finance list" title="Return to Finance list" onClick={onClose}/> }>
    <div className={styles.body} key={selection.kind==="transaction"?selection.id:"list"}>
      {selection.kind !== "summary" && <WorkspaceButton icon="chevron-left" className={styles.back} onClick={returnToList}>{transaction ? "Back to transactions" : "Range summary"}</WorkspaceButton>}
      <div className={styles.period}><UnigentamosIcon role="calendar" size={16}/><span>{overviewDate(period?.id || model.from)} – {overviewDate(period?.to || model.to)}</span><span aria-live="polite">{visibleRows.length} {flow ? flow+" " : ""}transaction{visibleRows.length===1?"":"s"}</span></div>
      {transaction ? <>
        <div className={styles.amount}><span>{transaction.direction === "income" ? "Income" : "Spending"}</span><strong>{money(transaction.amount,{cents:true})}</strong><small>{transaction.status === "cleared" ? "Posted" : "Pending"} · {transaction.reviewed ? "Reviewed" : "Needs review"}</small></div>
        <dl className={styles.facts}>{[["Account",model.accountNames.get(transaction.accountId)||"Archived account"],["Category",transaction.category],["Date",overviewDate(transaction.occurredOn)],["Scope",transaction.entityScope]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{label==="Account" ? <TransactionAccount id={transaction.accountId} label={value}/> : value}</dd></div>)}</dl>
        {transaction.memo && <section className={styles.notes}><h3>Notes</h3><p>{transaction.memo}</p></section>}
        <WorkspaceButton intent="primary" icon="edit" className={styles.open} onClick={()=>onOpenTransaction(transaction.id)}>Open transaction</WorkspaceButton>
      </> : <>
        <div className={styles.totals}>
          {([["income","Income",income,"banknote"],["spending","Spending",spending,"credit-card"]] as const).map(([key,label,value,icon])=><button type="button" key={key} aria-label={`Filter to ${key}`} aria-pressed={flow===key} onClick={()=>toggleFlow(key)}><span><UnigentamosIcon role={icon} size={16}/>{label}</span><strong>{money(value,{cents:true})}</strong></button>)}
          <div><span><UnigentamosIcon role="trending" size={16}/>Net flow</span><strong>{money(income-spending,{cents:true})}</strong></div>
        </div>
        <div className={styles.transactions} key={flow || "all"}>{visibleRows.slice(0,limit).map(t=><article className={styles.rangeRow} key={t.id}><button type="button" onClick={()=>{previousList.current={transactionId:t.id,selection};onSelect({kind:"transaction",id:t.id});}}><FinanceMerchantAvatar kind="transaction" id={t.id} label={t.merchant}/><span><strong>{t.merchant}</strong><small>{overviewDate(t.occurredOn)} · {t.category}</small>{t.status==="pending"&&<small>Pending</small>}</span><b>{money(t.direction==="income"?t.amount:-t.amount,{sign:true,cents:true})}<FinanceDirectionDot direction={t.direction}/></b><UnigentamosIcon role="chevron-right" size={16}/></button><TransactionAccount id={t.accountId} label={model.accountNames.get(t.accountId)}/></article>)}</div>
        {visibleRows.length>limit && <WorkspaceButton icon="chevron-down" className={styles.more} onClick={()=>setLimit(n=>n+40)}>Show more ({visibleRows.length-limit})</WorkspaceButton>}
        {!visibleRows.length && <p className={styles.empty}>No {flow ? flow+" " : ""}transactions match this range and its filters.</p>}
      </>}
    </div>
  </InspectorRail>;
}
