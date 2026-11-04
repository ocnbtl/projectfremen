"use client";

import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import type { FinanceAccountRecord, FinanceState, FinanceTransactionRecord } from "../../lib/modules/finance/native-types";
import { accountBalanceSource, accountDate, signedAccountTransaction } from "../../lib/modules/finance/account-details";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import FinanceMerchantAvatar from "./FinanceMerchants";
import { money } from "./FinancePrimitives";
import styles from "./FinanceTransactionAccount.module.css";

type Preview = { accounts: ReadonlyMap<string, FinanceAccountRecord>; show: (id:string, trigger:HTMLButtonElement)=>void };
const PreviewContext = createContext<Preview | null>(null);

const directionLabel = { income: "Income", expense: "Spending", transfer: "Transfer", savings: "Savings" };
const sourceLabel = { manual: "Manual entry", plaid: "Plaid", transfer: "Transfer", csv_import: "CSV import" };

function ActivityDetails({ transaction, account }: { transaction: FinanceTransactionRecord; account: FinanceAccountRecord }) {
  const facts = [
    ["Account", account.name],
    ["Date", accountDate(transaction.occurredOn)],
    ["Category", transaction.category || "Uncategorized"],
    ["Scope", transaction.entityScope === "business" ? "Business" : "Personal"],
    ["Source", sourceLabel[transaction.source.kind]]
  ];
  return <div className={styles.detail}>
    <section className={styles.balance}>
      <small>{directionLabel[transaction.direction]}</small>
      <strong>{money(signedAccountTransaction(transaction), { sign: true, cents: true })}</strong>
      <small>{transaction.status === "pending" ? "Pending" : "Posted"} · {transaction.reviewed ? "Reviewed" : "Needs review"}</small>
    </section>
    <dl className={styles.facts}>{facts.map(([label, value]) =>
      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
    )}</dl>
    {transaction.memo && <section className={styles.memo}><h4>Notes</h4><p>{transaction.memo}</p></section>}
  </div>;
}

// Keep one popover for the workspace. Rows only render a button; opening one
// reads the loaded ledger, independent of the current transaction filters.
export function TransactionAccountProvider({state, children}:{state:FinanceState; children:ReactNode}) {
  const accounts = useMemo(()=>new Map(state.accounts.filter(a=>!a.archivedAt).map(a=>[a.id,a])),[state.accounts]);
  const [id,setId] = useState("");
  const [activityId, setActivityId] = useState("");
  const anchor = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const back = useRef<HTMLButtonElement | null>(null);
  const activityOrigin = useRef<{ button: HTMLButtonElement; scrollTop: number } | null>(null);
  const titleId = useId();
  const show = useCallback((id:string, trigger:HTMLButtonElement)=>{
    anchor.current=trigger;
    activityOrigin.current=null;
    setActivityId("");
    setId(id);
  },[]);
  const context = useMemo(()=>({accounts,show}),[accounts,show]);
  const account = accounts.get(id);
  const recent = useMemo(()=>id ? state.transactions.filter(t=>!t.archivedAt && t.accountId===id)
    .sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id)).slice(0,3) : [],[id,state.transactions]);
  const synced = account && (account.balanceSource==="plaid" || account.balanceSource==="coinbase") ? account.balanceRetrievedAt : undefined;
  const activity = recent.find(t => t.id === activityId);
  useLayoutEffect(() => {
    if (!account || !panel.current || !activityOrigin.current) return;
    if (activity) {
      panel.current.scrollTop = 0;
      back.current?.focus({ preventScroll: true });
    } else {
      const { button, scrollTop } = activityOrigin.current;
      panel.current.scrollTop = scrollTop;
      if (button.isConnected) button.focus({ preventScroll: true });
      activityOrigin.current = null;
    }
  }, [activity, account]);
  return <PreviewContext.Provider value={context}>{children}
    <Popover.Root modal open={!!account} onOpenChange={open=>{if(!open)setId("");}}>
      <Popover.Anchor virtualRef={anchor}/>
      <Popover.Portal><Popover.Content ref={panel} className={styles.panel} data-module="finance" aria-modal="true" aria-labelledby={titleId}
        collisionPadding={12} sideOffset={6} align="start"
        onEscapeKeyDown={e=>{
          e.stopPropagation();
          if (activity) {
            e.preventDefault();
            setActivityId("");
          }
        }}
        onCloseAutoFocus={e=>{e.preventDefault();if(anchor.current?.isConnected)anchor.current.focus({preventScroll:true});}}>
        {account && <>
          {activity && <button ref={back} type="button" className={styles.back} onClick={()=>setActivityId("")}>
            <UnigentamosIcon role="back" size={16}/>Back to account
          </button>}
          <header><div><small>{activity ? "Transaction details" : "Account preview"}</small><h3 id={titleId}>{activity ? activity.merchant : account.name}</h3></div>
            <Popover.Close className={styles.close} aria-label="Close account preview"><UnigentamosIcon role="close" size={18}/></Popover.Close></header>
          {activity && <ActivityDetails transaction={activity} account={account}/>}
          <div hidden={!!activity}>
          <section className={styles.balance}><small>Current balance</small><strong>{money(account.currentBalance,{cents:true})}</strong>
            <small>{accountBalanceSource(account)} · {synced ? "Last synced" : "Balance dated"} {accountDate(synced || account.balanceAsOf)}</small></section>
          <h4>Recent activity</h4>
          {recent.length ? <ul>{recent.map(t=><li key={t.id}><button type="button" className={styles.activity}
            onClick={e=>{
              activityOrigin.current = { button: e.currentTarget, scrollTop: panel.current?.scrollTop ?? 0 };
              setActivityId(t.id);
            }}><FinanceMerchantAvatar kind="transaction" id={t.id} label={t.merchant}/>
            <span><b>{t.merchant}</b><small>{accountDate(t.occurredOn)}{t.status==="pending"?" · Pending":""}</small></span>
            <b>{money(signedAccountTransaction(t),{sign:true,cents:true})}</b>
            <UnigentamosIcon role="chevron-right" size={15}/></button></li>)}</ul> : <p>No transactions recorded yet.</p>}
          <Link prefetch={false} href={`/admin/finance/accounts?selected=${encodeURIComponent(account.id)}`} className={styles.full} onNavigate={()=>setId("")}>
            <UnigentamosIcon role="wallet" size={17}/>View full account<UnigentamosIcon role="chevron-right" size={16}/>
          </Link></div></>}
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </PreviewContext.Provider>;
}

export function TransactionAccount({id,label}:{id?:string;label?:string}) {
  const context = useContext(PreviewContext);
  const account = id ? context?.accounts.get(id) : undefined;
  if (!account || !context) return <span>{label || "Account unavailable"}</span>;
  return <button type="button" className={styles.trigger} aria-label={`Preview account: ${account.name}`} aria-haspopup="dialog"
    onClick={event=>context.show(account.id,event.currentTarget)}>
    <UnigentamosIcon role="wallet" size={14}/><span>{account.name}</span>
  </button>;
}
