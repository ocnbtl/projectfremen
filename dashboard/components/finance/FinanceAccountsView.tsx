"use client";
import type { FinanceSort } from "../../lib/native-objects/url-state";
import type { FinanceAccountsViewModel } from "../../lib/modules/finance/accounts-view-model";
import type { FinanceCashflowSeries } from "../../lib/modules/finance/types";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import { money } from "./FinancePrimitives";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SystemState from "../operational/SystemState";
import { DirectoryLayout } from "../ui/DirectoryLayout";
import FinanceCollectionControls, {useFinanceCollectionView} from "./FinanceCollectionControls";
import FinanceAccountCard from "./FinanceAccountCard";
import accountStyles from "./FinanceAccounts.module.css";
import styles from "./FinanceCollections.module.css";

export type FinanceAccountsViewProps = {
  model: FinanceAccountsViewModel; state: FinanceState; onAddAccount: () => void;
  cashflow: FinanceCashflowSeries; cashflowSummary: string; actualSavingsMovement: number;
  onQueryChange: (query: string) => void; onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void; onOpenFilterPreview: () => void; onOpenGroupingPreview: () => void;
};

const groups = [
  {id:"cash-and-deposits", label:"Cash & deposits", icon:"wallet"},
  {id:"credit-and-liabilities", label:"Credit & liabilities", icon:"credit-card"},
  {id:"investments-and-business", label:"Investments & business", icon:"line-chart"},
];
const sortOptions = [
  {value:"default",label:"Account type"}, {value:"name-asc",label:"Name A–Z"},
  {value:"balance-desc",label:"Balance high to low"}, {value:"balance-asc",label:"Balance low to high"},
] satisfies {value:FinanceSort; label:string}[];

export default function FinanceAccountsView({model,state,onAddAccount,onQueryChange,onSortChange,onSelect}:FinanceAccountsViewProps) {
  const [view,setView] = useFinanceCollectionView("accounts");
  const metrics = [
    {label:"Available cash",value:model.totals.liquid,icon:"wallet"},
    {label:"Debt",value:model.totals.debtOwed,icon:"credit-card"},
    {label:"Net worth",value:model.totals.net,icon:"line-chart"},
  ];
  return <div className={styles.collection} data-account-view={view}>
    <FinanceCollectionControls label="accounts" view={view} onView={setView}
      sort={model.sort === "role" ? "default" : model.sort} onSort={onSortChange} sortOptions={sortOptions}/>
    <div className={styles.metrics}>{metrics.map(metric => <article key={metric.label}>
      <span><UnigentamosIcon role={metric.icon} size={16}/>{metric.label}</span>
      <strong>{model.sourceCount ? money(metric.value, {cents:true}) : "—"}</strong>
    </article>)}</div>
    {groups.map(group => {
      const rows = model.rows.filter(row => row.group === group.id);
      if (!rows.length) return null;
      return <section key={group.id} className={styles.section} data-account-group={group.id} aria-label={group.label}>
        <div className={styles.heading}>
          <h2><UnigentamosIcon role={group.icon} size={18}/>{group.label}</h2>
          <p className={accountStyles.count}><b>{rows.length}</b> {rows.length === 1 ? "account" : "accounts"}</p>
        </div>
        <DirectoryLayout view={view} className={styles.list} role="list" aria-label={group.label + " accounts"}>
          {rows.map(row => <FinanceAccountCard key={row.account.id} row={row}
            record={state.accounts.find(item => item.id === row.account.id)}
            selected={model.selectedId === row.account.id} onSelect={onSelect}/>)}
        </DirectoryLayout>
      </section>;
    })}
    {!model.rows.length && <SystemState variant="empty" icon="wallet" title={model.sourceCount ? "No matching accounts" : "No accounts yet"}
      description={model.sourceCount ? "Try another search." : "Add an account to get started."}
      action={{label:model.sourceCount ? "Clear search" : "Add account",icon:model.sourceCount ? "search" : "plus",
        onSelect:model.sourceCount ? () => onQueryChange("") : onAddAccount}}/>}
  </div>;
}
