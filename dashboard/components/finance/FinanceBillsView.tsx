"use client";
import type { FinanceBillsViewModel } from "../../lib/modules/finance/bills-view-model";
import type { FinanceBillStatus } from "../../lib/modules/finance/types";
import type { FinanceFilter, FinanceSort } from "../../lib/native-objects/url-state";
import {Icon, money} from "./FinancePrimitives";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SystemState from "../operational/SystemState";
import {DirectoryLayout,MorphingArticle,MorphingButton,MorphingDiv} from "../ui/DirectoryLayout";
import FinanceCollectionControls,{useFinanceCollectionView} from "./FinanceCollectionControls";
import styles from "./FinanceCollections.module.css";
export type FinanceBillsViewProps = {
  onAddBill: () => void;
  model: FinanceBillsViewModel;
  filter: FinanceFilter;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: FinanceFilter) => void;
  onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void;
  onOpenFilterPreview: () => void;
  onOpenPaymentPreview: () => void;
};

const BILL_GROUPS: readonly FinanceBillStatus[] = ["overdue", "due", "soon", "scheduled", "paid"];

const BILL_STATUS_LABELS: Readonly<Record<FinanceBillStatus, string>> = {
  overdue: "Overdue",
  due: "Due now",
  soon: "Due soon",
  scheduled: "Scheduled",
  paid: "Paid"
};

function dueDetail(status: FinanceBillStatus, dueIn: number): string {
  if (status === "overdue") return dueIn < 0 ? `${Math.abs(dueIn)}d overdue` : "marked overdue";
  if (status === "paid") return "paid";
  if (dueIn === 0) return "due today";
  if (dueIn === 1) return "due tomorrow";
  return `due in ${dueIn}d`;
}


export default function FinanceBillsView({model,filter,onQueryChange,onFilterChange,onSortChange,onSelect,onAddBill}:FinanceBillsViewProps){
 const [view,setView]=useFinanceCollectionView("bills");
 return <div className={styles.collection}>
  <FinanceCollectionControls label="bills" view={view} onView={setView} sort={model.sort} onSort={onSortChange} sortOptions={[{value:"urgency",label:"Urgency"},{value:"due-soon",label:"Due date"},{value:"amount-desc",label:"Amount high to low"},{value:"amount-asc",label:"Amount low to high"},{value:"name-asc",label:"Name A–Z"}]} filter={filter} onFilter={onFilterChange} filterOptions={[{value:"",label:"All bills"},{value:"due-week",label:"Due this week"},{value:"recurring",label:"Recurring"}]}/>
  <div className={styles.metrics}><article><span>Due / overdue</span><strong>{model.counts.due+model.counts.overdue}</strong>{model.counts.overdue>0&&<small>{model.counts.overdue} overdue</small>}</article><article><span>Due this week</span><strong>{model.counts.dueThisWeek}</strong></article><article><span>Monthly recurring</span><strong>{money(model.totals.monthlyRecurring)}</strong></article></div>
  {BILL_GROUPS.map(status=>{const rows=model.rows.filter(({bill})=>bill.status===status);if(!rows.length)return null;return <section key={status} className={styles.section} aria-label={BILL_STATUS_LABELS[status]+" bills"}>
   <div className={styles.heading}><h2>{BILL_STATUS_LABELS[status]}<span>{rows.length}</span></h2></div>
   <DirectoryLayout view={view} className={styles.list} role="list">{rows.map(({bill,monthlyEquivalent})=><MorphingArticle role="listitem" key={bill.id} className={styles.card} data-selected={model.selectedId===bill.id||undefined}>
    <MorphingButton type="button" className={styles.open} data-finance-bill-id={bill.id} aria-pressed={model.selectedId===bill.id} aria-controls="finance-inspector" onClick={()=>onSelect(bill.id)}>
     <MorphingDiv className={styles.top}><span className={styles.symbol}><Icon name={bill.icon}/></span><span className={styles.identity}><strong>{bill.name}</strong><small>{bill.account}</small></span><span className={styles.amount}><strong>{money(bill.amount,{cents:true})}</strong>{bill.recurring&&<small>{money(monthlyEquivalent,{cents:true})}/mo equivalent</small>}</span></MorphingDiv>
     <MorphingDiv className={styles.meta}><span><UnigentamosIcon role="calendar" size={14}/>{bill.due}{bill.evidence?" · estimated":" · "+dueDetail(bill.status,bill.dueIn)}</span></MorphingDiv>
     <MorphingDiv className={styles.footer}><span className={styles.pill} data-tone={status==="overdue"?"danger":status==="due"?"attention":undefined}>{bill.evidence?"Estimated":BILL_STATUS_LABELS[status]}</span><span>{bill.category}</span></MorphingDiv>
     <MorphingDiv className={styles.meta}><span><UnigentamosIcon role="routine" size={14}/>{bill.recurring||"One-time"}</span><span>{bill.evidence&&!bill.autopayConfirmed?"Autopay unconfirmed":bill.autopay?"Autopay on":"Manual payment"}</span></MorphingDiv>
    </MorphingButton>
   </MorphingArticle>)}</DirectoryLayout>
  </section>;})}
  {!model.rows.length&&<SystemState variant="empty" icon="calendar" title={model.sourceCount?"No matching bills":"No bills yet"} description={model.sourceCount?"Try another search or clear your filters.":"Track your bills and subscriptions here."} action={{label:model.sourceCount?"Clear filters":"Add bill",icon:model.sourceCount?"filter":"plus",onSelect:model.sourceCount?()=>{onQueryChange("");onFilterChange("");}:onAddBill}}/>}
 </div>;
}
