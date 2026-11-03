"use client";
import type {FinanceFilter,FinanceSort} from "../../lib/native-objects/url-state";
import type {FinanceTransactionsViewModel} from "../../lib/modules/finance/transactions-view-model";
import {money} from "./FinancePrimitives";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import {WorkspaceButton} from "../admin-shell/WorkspaceKit";
import SystemState from "../operational/SystemState";
import {DirectoryLayout,MorphingArticle,MorphingButton,MorphingDiv} from "../ui/DirectoryLayout";
import FinanceCollectionControls,{useFinanceCollectionView} from "./FinanceCollectionControls";
import FinanceMerchantAvatar from "./FinanceMerchants";
import styles from "./FinanceCollections.module.css";
export type FinanceTransactionsViewProps = {
  onAddTransaction: () => void;
  model: FinanceTransactionsViewModel;
  filter: FinanceFilter;
  checkedIds: ReadonlySet<string>;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: FinanceFilter) => void;
  onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void;
  onCheckedChange: (id: string, checked: boolean) => void;
  onClearChecked: () => void;
  onOpenFilterPreview: () => void;
  onOpenColumnsPreview: () => void;
};


export default function FinanceTransactionsView({model,filter,checkedIds,onQueryChange,onFilterChange,onSortChange,onSelect,onCheckedChange,onClearChecked,onAddTransaction}:FinanceTransactionsViewProps){
 const [view,setView]=useFinanceCollectionView("transactions");
 return <div className={styles.collection}>
  <FinanceCollectionControls label="transactions" view={view} onView={setView} sort={model.sort} onSort={onSortChange} sortOptions={[{value:"date-desc",label:"Newest first"},{value:"date-asc",label:"Oldest first"},{value:"amount-desc",label:"Amount high to low"},{value:"amount-asc",label:"Amount low to high"},{value:"merchant-asc",label:"Merchant A–Z"}]} filter={filter} onFilter={onFilterChange} filterOptions={[{value:"",label:"All transactions"},{value:"unreviewed",label:"To review"},{value:"pending",label:"Pending at bank"},{value:"transfer",label:"Transfers"}]}/>
  <div className={styles.metrics}><article><span>Transactions</span><strong>{model.visibleCount}</strong></article><article><span>Income</span><strong>{money(model.totals.income,{cents:true})}</strong></article><article><span>Spending</span><strong>{money(model.totals.spending,{cents:true})}</strong></article></div>
  {checkedIds.size>0&&<div className={styles.batch} role="status"><strong>{checkedIds.size} selected</strong><WorkspaceButton intent="quiet" onClick={onClearChecked}>Clear selection</WorkspaceButton></div>}
  <DirectoryLayout view={view} className={styles.list} role="list" aria-label="Finance transactions">{model.rows.map(transaction=>{
   const description=transaction.merchant+", "+transaction.date+", "+money(transaction.amount,{sign:true,cents:true})+", transaction "+transaction.id+", account "+transaction.account;
   return <MorphingArticle role="listitem" className={styles.card+" "+styles.transaction} data-selected={model.selectedId===transaction.id||undefined} data-finance-transaction-id={transaction.id} key={transaction.id}>
    <label className={styles.checkbox}><input type="checkbox" checked={checkedIds.has(transaction.id)} onChange={event=>onCheckedChange(transaction.id,event.target.checked)} aria-label={"Select "+description+" for batch actions"}/></label>
    <MorphingButton type="button" className={styles.open} aria-pressed={model.selectedId===transaction.id} aria-controls="finance-inspector" aria-label={"Inspect "+description} onClick={()=>onSelect(transaction.id)}>
     <MorphingDiv className={styles.top}><FinanceMerchantAvatar kind="transaction" id={transaction.id} label={transaction.merchant}/><span className={styles.identity}><strong>{transaction.merchant}</strong><small>{transaction.entity}</small></span><span className={styles.amount}><strong className={transaction.amount>0?styles.positive:undefined}>{money(transaction.amount,{sign:true,cents:true})}</strong></span></MorphingDiv>
     <MorphingDiv className={styles.meta}><span><UnigentamosIcon role="calendar" size={14}/>{transaction.date}</span><span><UnigentamosIcon role="wallet" size={14}/>{transaction.account}</span></MorphingDiv>
     <MorphingDiv className={styles.footer}><span className={styles.pill}>{transaction.category}</span><span className={styles.pill} data-tone={transaction.status==="pending"?"attention":undefined}>{transaction.status==="pending"?"Pending":"Posted"}</span></MorphingDiv>
     {!transaction.ufInit&&<MorphingDiv className={styles.meta}><span><UnigentamosIcon role="review" size={14}/>Needs review</span></MorphingDiv>}
    </MorphingButton>
   </MorphingArticle>;
  })}</DirectoryLayout>
  {!model.rows.length&&<SystemState variant="empty" icon="banknote" title={model.sourceCount?"No matching transactions":"No transactions yet"} description={model.sourceCount?"Try another search or clear your filters.":"Add a transaction or import a statement."} action={{label:model.sourceCount?"Clear filters":"Add transaction",icon:model.sourceCount?"filter":"plus",onSelect:model.sourceCount?()=>{onQueryChange("");onFilterChange("");}:onAddTransaction}}/>}
 </div>;
}
