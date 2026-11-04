"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { FinanceAccountRowViewModel } from "../../lib/modules/finance/accounts-view-model";
import type { FinanceState, FinanceTransactionRecord } from "../../lib/modules/finance/native-types";
import { accountBalanceSource, accountBalanceExplanation, accountDate, signedAccountTransaction, findAccountTransferCandidates } from "../../lib/modules/finance/account-details";
import { DetailTabPanel } from "../operational/DetailTabs";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import FinanceMerchantAvatar from "./FinanceMerchants";
import type { FinanceOperation } from "./FinanceMutationDialog";
import { money } from "./FinancePrimitives";
import styles from "./FinanceAccounts.module.css";

function amountLabel(value: number) {
  return money(value, {sign:value !== 0, cents:true});
}
function transactionHref(id: string) {
  return "/admin/finance/transactions?selected=" + encodeURIComponent(id);
}
function Activity({items,onReview}:{items:FinanceTransactionRecord[];onReview?:(id:string)=>void}) {
  return <div className={styles.ledger}>{items.map(item => {
    const amount = signedAccountTransaction(item);
    return <article className={styles.entry} key={item.id}>
      <Link href={transactionHref(item.id)} prefetch={false} className={styles.entryLink}>
        <FinanceMerchantAvatar kind="transaction" id={item.id} label={item.merchant}/>
        <span className={styles.entryText}><strong>{item.merchant}</strong>
          <small><time dateTime={item.occurredOn}>{accountDate(item.occurredOn)}</time> · {item.category || "Uncategorized"}</small>
          {item.memo && <small>{item.memo}</small>}
        </span>
        <span className={styles.entryAmount}>
          <b className={amount > 0 ? "is-positive" : amount < 0 ? "is-negative" : undefined}>{amountLabel(amount)}</b>
          {item.status === "pending" && <small className={styles.pending}>Pending</small>}
        </span>
      </Link>
      {onReview && <button type="button" className={styles.reconcile} onClick={() => onReview(item.id)} aria-label={"Reconcile " + item.merchant}>
        <UnigentamosIcon role="check" size={15}/>Reconcile
      </button>}
    </article>;
  })}</div>;
}
function SectionTitle({title,children}:{title:string;children?:ReactNode}) {
  return <header className={styles.sectionTitle}><h3>{title}</h3>{children && <p>{children}</p>}</header>;
}
function Empty({icon,title,children}:{icon:string;title:string;children:ReactNode}) {
  return <div className={styles.empty}><UnigentamosIcon role={icon} size={23}/><div><h3>{title}</h3><p>{children}</p></div></div>;
}
interface Props {
  row: FinanceAccountRowViewModel;
  state: FinanceState;
  tab: string;
  onOperation: (op:FinanceOperation,selection:{kind:"account"|"transaction";id:string}) => void;
}

export default function FinanceAccountDetails({row,state,tab,onOperation}:Props) {
  const id = row.account.id;
  const account = state.accounts.find(a => a.id === id);
  const selection = {kind:"account" as const,id};
  const transactions = state.transactions.filter(t => !t.archivedAt && t.accountId === id)
    .sort((a,b) => b.occurredOn.localeCompare(a.occurredOn) || a.merchant.localeCompare(b.merchant));
  const incoming = transactions.filter(t => signedAccountTransaction(t) > 0);
  const outgoing = transactions.filter(t => signedAccountTransaction(t) < 0);
  const unreviewed = transactions.filter(t => !t.reviewed || t.status === "pending");
  const transfers = state.transfers.filter(t => !t.archivedAt && (t.fromAccountId === id || t.toAccountId === id))
    .sort((a,b) => b.occurredOn.localeCompare(a.occurredOn));
  const candidates = tab === "transfers" ? findAccountTransferCandidates(state,id) : [];
  const imports = state.importBatches.filter(b => b.accountId === id).slice().reverse();
  const source = accountBalanceSource(account);
  const connected = Boolean(account?.bankLink || account?.coinbaseLink);
  const retrieved = account?.balanceSource === "plaid" || account?.balanceSource === "coinbase"
    ? account.balanceRetrievedAt : undefined;
  const balanceDate = retrieved || account?.balanceAsOf;
  const properties = [
    { title:"Account details", icon:"wallet", facts:[["Name",row.account.name],["Institution",account?.institution || "Not recorded"],["Account type",row.account.kind],["Ending in",account?.mask ? "••" + account.mask.replace(/^[•*]+/,"") : "Not recorded"]] },
    { title:"Balance & connection", icon:"link", facts:[["Balance source",source],["Current balance",money(row.account.balance,{cents:true})],["Balance dated",accountDate(account?.balanceAsOf)],["Last retrieved",accountDate(account?.balanceRetrievedAt,true)]] },
    { title:"Organization", icon:"briefcase", facts:[["Used for",account?.entityScope === "business" ? "Business" : "Personal"],["Currency",account?.currency || "USD"]] },
  ];

  function panel(name:string, children:ReactNode) {
    return <DetailTabPanel tabsId="finance-object-tabs" tabId={name} active={tab === name}
      className={"finance-account-detail-panel " + styles.panel}>{tab === name && children}</DetailTabPanel>;
  }

  return <div className="finance-account-details">
    {panel("overview", <>
      <section className={styles.balance}>
        <span>Current balance</span><strong>{money(row.account.balance,{cents:true})}</strong>
        <div className={styles.balanceMeta}><span><UnigentamosIcon role={connected ? "link" : "edit"} size={15}/>{source}</span>
          <span><UnigentamosIcon role="routine" candidate="refresh" size={15}/>{retrieved ? "Last retrieved" : "Balance dated"} {accountDate(balanceDate,true)}</span></div>
        <p>{accountBalanceExplanation(account)}</p>
        {!connected && <button className="finance-action" onClick={() => onOperation("balance",selection)}>Update balance</button>}
      </section>
      <section className={styles.section}>
        <SectionTitle title="Money in and out">Totals include all saved activity for this account, including pending transactions.</SectionTitle>
        <div className={styles.flow}>{[{label:"Money in",items:incoming},{label:"Money out",items:outgoing}].map(({label,items}) =>
          <div key={label}><span>{label}</span>
            <strong className={items.length ? label === "Money in" ? "is-positive" : "is-negative" : undefined}>{amountLabel(items.reduce((sum,t) => sum + signedAccountTransaction(t),0))}</strong>
            <small>{items.length} {items.length === 1 ? "transaction" : "transactions"}</small>
          </div>)}</div>
      </section>
      {transactions.length > 0 && <section className={styles.section}><SectionTitle title="Latest activity"/><Activity items={transactions.slice(0,3)}/></section>}
    </>)}

    {panel("transactions", transactions.length ? <section className={styles.section}>
      <SectionTitle title="Account activity">{transactions.length} {transactions.length === 1 ? "transaction" : "transactions"} · Newest first</SectionTitle>
      <Activity items={transactions}/>
    </section> : <Empty icon="banknote" title="No transactions yet">Add a transaction, import a statement, or sync your connected account to see activity here.</Empty>)}

    {panel("reconcile", unreviewed.length ? <section className={styles.section}>
      <SectionTitle title={unreviewed.length + (unreviewed.length === 1 ? " transaction to review" : " transactions to review")}>
        Compare each entry with your statement. Pending transactions stay here until they clear.
      </SectionTitle>
      <Activity items={unreviewed} onReview={entryId => onOperation("transaction_review",{kind:"transaction",id:entryId})}/>
    </section> : <Empty icon="check" title={transactions.length ? "You're all caught up" : "Nothing to reconcile yet"}>
      {transactions.length ? "You've reviewed every transaction currently saved for this account." : "Once you add transactions, you can check them against your statement here."}
    </Empty>)}

    {panel("transfers", <>
      <div className="finance-account-inline-actions">
        <button className="finance-action" onClick={() => onOperation("transfer",selection)}><UnigentamosIcon role="plus" size={16}/>Record transfer</button>
        <button className="finance-action" onClick={() => onOperation("savings",selection)}><UnigentamosIcon role="piggy-bank" size={16}/>Savings movement</button>
      </div>
      {transfers.length > 0 && <section className={styles.section}><SectionTitle title="Recorded transfers"/>
        <div className={styles.ledger}>{transfers.map(transfer => {
          const sent = transfer.fromAccountId === id;
          const peer = state.accounts.find(a => a.id === (sent ? transfer.toAccountId : transfer.fromAccountId));
          return <article className={styles.transfer} key={transfer.id}><span className={styles.transferIcon}><UnigentamosIcon role="routine" candidate="arrows-exchange" size={20}/></span>
            <div className={styles.entryText}><strong>{sent ? "To" : "From"} {peer?.name || "Archived account"}</strong>
              <small><time dateTime={transfer.occurredOn}>{accountDate(transfer.occurredOn)}</time></small>{transfer.memo && <small>{transfer.memo}</small>}</div>
            <b className={sent ? "is-negative" : "is-positive"}>{amountLabel(sent ? -transfer.amount : transfer.amount)}</b>
          </article>;
        })}</div></section>}
      {candidates.length > 0 && <section className={styles.section}>
        <SectionTitle title="Possible transfers">These entries share a date and amount. Open both to check whether the money moved between your accounts.</SectionTitle>
        {candidates.map(pair => <article key={pair.outgoing.id} className={styles.match}>
          <header><strong>{money(Math.abs(signedAccountTransaction(pair.outgoing)),{cents:true})}</strong>
            <time dateTime={pair.outgoing.occurredOn}>{accountDate(pair.outgoing.occurredOn)}</time></header>
          {[pair.outgoing,pair.incoming].map((entry,i) => <Link key={entry.id} href={transactionHref(entry.id)} prefetch={false}>
            <FinanceMerchantAvatar kind="transaction" id={entry.id} label={entry.merchant}/>
            <span><strong>{i ? "To" : "From"} {state.accounts.find(a => a.id === entry.accountId)?.name}</strong><small>{entry.merchant}</small></span>
            <UnigentamosIcon role="chevron-right" size={15}/>
          </Link>)}
        </article>)}
      </section>}
      {!transfers.length && !candidates.length && <Empty icon="wallet" title="No transfers yet">
        Record a move between accounts here. When a withdrawal and a deposit match across accounts, you can review them here too.
      </Empty>}
    </>)}

    {panel("imports", imports.length ? <div className="finance-account-ledger">{imports.map(batch => <article className="finance-account-import" key={batch.id}>
      <UnigentamosIcon role="import" size={20}/><div><strong>{batch.sourceFilename}</strong><small>{accountDate(batch.confirmedAt,true)}</small>
        <p>{batch.rows.length} rows · {batch.counts.unreconciled} to review · {batch.counts.rejected} skipped</p></div>
    </article>)}</div> : <Empty icon="import" title="No imported statements">Use Import CSV in the Accounts toolbar to bring in a statement.</Empty>)}

    {panel("properties", properties.map(section => <section className="finance-account-property-section" key={section.title}>
      <h3><UnigentamosIcon role={section.icon} size={18}/>{section.title}</h3>
      <dl>{section.facts.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>))}
  </div>;
}
