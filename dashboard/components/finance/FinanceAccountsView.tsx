"use client";
import type { FinanceSort } from "../../lib/native-objects/url-state";
import type { FinanceAccountsViewModel } from "../../lib/modules/finance/accounts-view-model";
import type { FinanceCashflowSeries } from "../../lib/modules/finance/types";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import { accountBalanceSource, accountDate } from "../../lib/modules/finance/account-details";
import { Icon, accountIcon, money } from "./FinancePrimitives";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SystemState from "../operational/SystemState";
import { DirectoryLayout, MorphingArticle, MorphingButton, MorphingDiv, MorphingSpan } from "../ui/DirectoryLayout";
import FinanceCollectionControls, {useFinanceCollectionView} from "./FinanceCollectionControls";
import styles from "./FinanceCollections.module.css";
export type FinanceAccountsViewProps = {
  model: FinanceAccountsViewModel; state: FinanceState; onAddAccount: () => void;
  cashflow: FinanceCashflowSeries; cashflowSummary: string; actualSavingsMovement: number;
  onQueryChange: (query: string) => void; onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void; onOpenFilterPreview: () => void; onOpenGroupingPreview: () => void;
};

const groups=[{id:"cash-and-deposits",label:"Cash & deposits"},{id:"credit-and-liabilities",label:"Credit & liabilities"},{id:"investments-and-business",label:"Investments & business"}];
export default function FinanceAccountsView({model,state,onAddAccount,onQueryChange,onSortChange,onSelect}:FinanceAccountsViewProps){
 const [view,setView]=useFinanceCollectionView("accounts");
 return <div className={styles.collection} data-account-view={view}>
  <FinanceCollectionControls label="accounts" view={view} onView={setView} sort={model.sort === "role" ? "default" : model.sort} onSort={onSortChange} sortOptions={[{value:"default",label:"Account type"},{value:"name-asc",label:"Name A–Z"},{value:"balance-desc",label:"Balance high to low"},{value:"balance-asc",label:"Balance low to high"}]}/>
  <div className={styles.metrics}>{[["Available cash",model.totals.liquid,"wallet"],["Debt",model.totals.debtOwed,"credit-card"],["Net worth",model.totals.net,"line-chart"]].map(([label,value,icon])=><article key={String(label)}><span><UnigentamosIcon role={String(icon)} size={16}/>{label}</span><strong>{model.sourceCount?money(Number(value),{cents:true}):"—"}</strong></article>)}</div>
  {groups.map(group=>{const rows=model.rows.filter(row=>row.group===group.id);if(!rows.length)return null;return <section key={group.id} className={styles.section} data-account-group={group.id} aria-label={group.label}>
   <div className={styles.heading}><h2><UnigentamosIcon role={group.id==="cash-and-deposits"?"wallet":group.id==="credit-and-liabilities"?"credit-card":"line-chart"} size={18}/>{group.label}<span>{rows.length}</span></h2><strong>{money(rows.reduce((sum,row)=>sum+row.account.balance,0),{cents:true})}</strong></div>
   <DirectoryLayout view={view} className={styles.list} role="list" aria-label={group.label+" accounts"}>{rows.map(({account,activity})=>{const native=state.accounts.find(item=>item.id===account.id);const review=activity.transactions.filter(t=>!t.ufInit||t.status==="pending").length;return <MorphingArticle className={styles.card} data-selected={model.selectedId===account.id||undefined} role="listitem" key={account.id}>
    <MorphingButton className={styles.open} type="button" data-finance-account-id={account.id} aria-pressed={model.selectedId===account.id} aria-controls="finance-inspector" onClick={()=>onSelect(account.id)}>
     <MorphingDiv className={styles.top}><span className={styles.symbol}><Icon name={accountIcon(account.kind)}/></span><span className={styles.identity}><strong>{account.name}</strong><small>{account.inst}{account.mask!=="—" ? " · ••"+account.mask.replace(/^[•*]+/,""):""}</small></span><span className={styles.amount}><strong>{money(account.balance,{cents:true})}</strong>{account.balance<0&&<small>Balance owed</small>}</span></MorphingDiv>
     <MorphingDiv className={styles.footer}><span className={styles.pill}>{account.kind}</span><span title={accountBalanceSource(native)}><UnigentamosIcon role="calendar" size={14}/>{accountDate(native?.balanceAsOf)}</span></MorphingDiv>
     <MorphingDiv className={styles.footer}><span>{activity.transactions.length} transactions</span>{review>0&&<MorphingSpan className={styles.pill} data-tone="attention">{review} to review</MorphingSpan>}</MorphingDiv>
    </MorphingButton></MorphingArticle>;})}</DirectoryLayout>
  </section>;})}
  {!model.rows.length&&<SystemState variant="empty" icon="wallet" title={model.sourceCount?"No matching accounts":"No accounts yet"} description={model.sourceCount?"Try another search.":"Add an account to get started."} action={{label:model.sourceCount?"Clear search":"Add account",icon:model.sourceCount?"search":"plus",onSelect:model.sourceCount?()=>onQueryChange(""):onAddAccount}}/>}
 </div>;
}
