"use client";
import type {FinanceFilter,FinanceSort} from "../../lib/native-objects/url-state";
import type {FinanceTransactionsViewModel} from "../../lib/modules/finance/transactions-view-model";
import {money} from "./FinancePrimitives";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SystemState from "../operational/SystemState";
import {DirectoryLayout,MorphingArticle,MorphingDiv} from "../ui/DirectoryLayout";
import FinanceCollectionControls,{useFinanceCollectionView} from "./FinanceCollectionControls";
import FinanceMerchantAvatar from "./FinanceMerchants";
import { TransactionAccount } from "./FinanceTransactionAccount";
import styles from "./FinanceCollections.module.css";
export type FinanceTransactionsViewProps = {
  onAddTransaction: () => void;
  model: FinanceTransactionsViewModel;
  filter: FinanceFilter;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: FinanceFilter) => void;
  onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void;
  onReview: (id: string, approve: boolean) => void;
  reviewBusy: boolean;
  onOpenFilterPreview: () => void;
  onOpenColumnsPreview: () => void;
};


export default function FinanceTransactionsView({model,filter,onQueryChange,onFilterChange,onSortChange,onSelect,onReview,reviewBusy,onAddTransaction}:FinanceTransactionsViewProps){
 const [view,setView]=useFinanceCollectionView("transactions");
 return <div className={styles.collection}>
  <FinanceCollectionControls label="transactions" view={view} onView={setView} sort={model.sort} onSort={onSortChange} sortOptions={[{value:"date-desc",label:"Newest first"},{value:"date-asc",label:"Oldest first"},{value:"amount-desc",label:"Amount high to low"},{value:"amount-asc",label:"Amount low to high"},{value:"merchant-asc",label:"Merchant A–Z"}]} filter={filter} onFilter={onFilterChange} filterOptions={[{value:"",label:"All transactions"},{value:"unreviewed",label:"To review"},{value:"denied",label:"Denied"},{value:"pending",label:"Pending at bank"},{value:"transfer",label:"Transfers"}]}/>
  <div className={styles.metrics}><article><span>Transactions</span><strong>{model.visibleCount}</strong></article><article><span>Income</span><strong>{money(model.totals.income,{cents:true})}</strong></article><article><span>Spending</span><strong>{money(model.totals.spending,{cents:true})}</strong></article></div>
  <DirectoryLayout view={view} className={styles.list} role="list" aria-label="Finance transactions">{model.rows.map(transaction=>{
   const description=transaction.merchant+", "+transaction.date+", "+money(transaction.amount,{sign:true,cents:true})+", transaction "+transaction.id+", account "+transaction.account;
   return <MorphingArticle role="listitem" className={styles.card+" "+styles.transaction} data-selected={model.selectedId===transaction.id||undefined} data-finance-transaction-id={transaction.id} key={transaction.id}>
    <div className={styles.open}>
     <div className={styles.top}>
       <FinanceMerchantAvatar kind="transaction" id={transaction.id} label={transaction.merchant}/>
       <div className={styles.identity}>
         <button type="button" className={styles.inspectName} aria-pressed={model.selectedId===transaction.id} aria-controls="finance-inspector" aria-label={"Inspect "+description} onClick={()=>onSelect(transaction.id)}>{transaction.merchant}</button>
         <TransactionAccount id={transaction.accountId} label={transaction.account}/>
       </div>
       <div className={styles.amount}><strong className={transaction.amount>0?styles.positive:undefined}>{money(transaction.amount,{sign:true,cents:true})}</strong><small>{transaction.date}</small></div>
     </div>
     <MorphingDiv className={styles.transactionFoot}>
       <div className={styles.meta}><span className={styles.pill}>{transaction.category}</span><span>{transaction.status==="pending"?"Pending":"Posted"} · {transaction.entity}</span></div>
       {!transaction.reviewLocked && <div className={styles.reviewActions} role="group" aria-label={"Review "+transaction.merchant}>
         <button type="button" data-decision="approve" aria-pressed={transaction.ufInit} disabled={reviewBusy || transaction.ufInit} onClick={()=>onReview(transaction.id,true)}><UnigentamosIcon role="check" size={15}/>{transaction.ufInit?"Approved":"Approve"}</button>
         <button type="button" data-decision="deny" aria-pressed={!!transaction.reviewDenied} disabled={reviewBusy || transaction.reviewDenied} onClick={()=>onReview(transaction.id,false)}><UnigentamosIcon role="close" size={15}/>{transaction.reviewDenied?"Denied":"Deny"}</button>
       </div>}
     </MorphingDiv>
    </div>
   </MorphingArticle>;
  })}</DirectoryLayout>
  {!model.rows.length&&<SystemState variant="empty" icon="banknote" title={model.sourceCount?"No matching transactions":"No transactions yet"} description={model.sourceCount?"Try another search or clear your filters.":"Add a transaction or import a statement."} action={{label:model.sourceCount?"Clear filters":"Add transaction",icon:model.sourceCount?"filter":"plus",onSelect:model.sourceCount?()=>{onQueryChange("");onFilterChange("");}:onAddTransaction}}/>}
 </div>;
}
