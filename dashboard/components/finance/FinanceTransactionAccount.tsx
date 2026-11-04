"use client";

import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import type { FinanceAccountRecord, FinanceState } from "../../lib/modules/finance/native-types";
import { accountBalanceSource, accountDate, signedAccountTransaction } from "../../lib/modules/finance/account-details";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import FinanceMerchantAvatar from "./FinanceMerchants";
import { money } from "./FinancePrimitives";
import styles from "./FinanceTransactionAccount.module.css";

type Preview = { accounts: ReadonlyMap<string, FinanceAccountRecord>; show: (id:string, trigger:HTMLButtonElement)=>void };
const PreviewContext = createContext<Preview | null>(null);

// Keep one popover for the workspace. Rows only render a button; opening one
// reads the loaded ledger, independent of the current transaction filters.
export function TransactionAccountProvider({state, children}:{state:FinanceState; children:ReactNode}) {
  const accounts = useMemo(()=>new Map(state.accounts.filter(a=>!a.archivedAt).map(a=>[a.id,a])),[state.accounts]);
  const [id,setId] = useState("");
  const anchor = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const show = useCallback((id:string, trigger:HTMLButtonElement)=>{anchor.current=trigger;setId(id);},[]);
  const context = useMemo(()=>({accounts,show}),[accounts,show]);
  const account = accounts.get(id);
  const recent = useMemo(()=>id ? state.transactions.filter(t=>!t.archivedAt && t.accountId===id)
    .sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id)).slice(0,3) : [],[id,state.transactions]);
  const synced = account && (account.balanceSource==="plaid" || account.balanceSource==="coinbase") ? account.balanceRetrievedAt : undefined;
  return <PreviewContext.Provider value={context}>{children}
    <Popover.Root modal open={!!account} onOpenChange={open=>{if(!open)setId("");}}>
      <Popover.Anchor virtualRef={anchor}/>
      <Popover.Portal><Popover.Content className={styles.panel} data-module="finance" aria-modal="true" aria-labelledby={titleId}
        collisionPadding={12} sideOffset={6} align="start"
        onEscapeKeyDown={e=>e.stopPropagation()}
        onCloseAutoFocus={e=>{e.preventDefault();if(anchor.current?.isConnected)anchor.current.focus({preventScroll:true});}}>
        {account && <><header><div><small>Account preview</small><h3 id={titleId}>{account.name}</h3></div>
          <Popover.Close className={styles.close} aria-label="Close account preview"><UnigentamosIcon role="close" size={18}/></Popover.Close></header>
          <section className={styles.balance}><small>Current balance</small><strong>{money(account.currentBalance,{cents:true})}</strong>
            <small>{accountBalanceSource(account)} · {synced ? "Last synced" : "Balance dated"} {accountDate(synced || account.balanceAsOf)}</small></section>
          <h4>Recent activity</h4>
          {recent.length ? <ul>{recent.map(t=><li key={t.id}><FinanceMerchantAvatar kind="transaction" id={t.id} label={t.merchant}/>
            <span><b>{t.merchant}</b><small>{accountDate(t.occurredOn)}{t.status==="pending"?" · Pending":""}</small></span>
            <b>{money(signedAccountTransaction(t),{sign:true,cents:true})}</b></li>)}</ul> : <p>No transactions recorded yet.</p>}
          <Link prefetch={false} href={`/admin/finance/accounts?selected=${encodeURIComponent(account.id)}`} className={styles.full} onNavigate={()=>setId("")}>
            <UnigentamosIcon role="wallet" size={17}/>View full account<UnigentamosIcon role="chevron-right" size={16}/>
          </Link></>}
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
