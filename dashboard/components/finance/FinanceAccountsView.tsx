"use client";
import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import type { FinanceSort } from "../../lib/native-objects/url-state";
import type { FinanceAccountsViewModel } from "../../lib/modules/finance/accounts-view-model";
import type { FinanceCashflowSeries } from "../../lib/modules/finance/types";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import { accountBalanceSource, accountDate } from "../../lib/modules/finance/account-details";
import { Icon, IconTile, accountIcon, money } from "./FinancePrimitives";

export type FinanceAccountsViewProps = {
  model: FinanceAccountsViewModel; state: FinanceState; onAddAccount: () => void;
  cashflow: FinanceCashflowSeries; cashflowSummary: string; actualSavingsMovement: number;
  onQueryChange: (query: string) => void; onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void; onOpenFilterPreview: () => void; onOpenGroupingPreview: () => void;
};
const groups = [
  { id: "cash-and-deposits", label: "Cash & deposits", detail: "Everyday accounts and savings" },
  { id: "credit-and-liabilities", label: "Credit & liabilities", detail: "Balances you owe" },
  { id: "investments-and-business", label: "Investments & business", detail: "Investments and business accounts" }
];
const views = [{id:"comfortable",label:"Comfortable",icon:"view-comfortable"},{id:"compact",label:"Compact",icon:"view-compact"},{id:"grid",label:"Grid",icon:"view-grid"}] as const;
function AccountMenu({ label, icon, value, options, onChange }: {label:string;icon:string;value:string;options:readonly {id:string;label:string;icon?:string}[];onChange:(value:string)=>void}) {
  const [open,setOpen]=useState(false);
  return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button className="finance-account-tool" type="button" aria-label={label} title={label}><UnigentamosIcon role={icon} size={18}/></button></Popover.Trigger><Popover.Portal><Popover.Content className="finance-account-menu" sideOffset={7} align="end" collisionPadding={12} aria-label={label}><strong>{label}</strong><div role="group" aria-label={label}>{options.map(option=><button key={option.id} type="button" aria-pressed={value===option.id} onClick={()=>{onChange(option.id);setOpen(false)}}>{option.icon&&<UnigentamosIcon role={option.icon} size={17}/>}<span>{option.label}</span>{value===option.id&&<Icon name="Check"/>}</button>)}</div></Popover.Content></Popover.Portal></Popover.Root>;
}
export default function FinanceAccountsView({ model, state, onAddAccount, onQueryChange, onSortChange, onSelect }: FinanceAccountsViewProps) {
  const [view,setView]=useState<"comfortable"|"compact"|"grid">("comfortable");
  useEffect(()=>{try{const saved=localStorage.getItem("unigentamos.finance.accounts.view");if(saved==="comfortable"||saved==="compact"||saved==="grid")setView(saved)}catch{}},[]);
  function changeView(next:string){if(next!=="comfortable"&&next!=="compact"&&next!=="grid")return;setView(next);try{localStorage.setItem("unigentamos.finance.accounts.view",next)}catch{}}
  return <div className="finance-accounts-directory" data-account-view={view}>
    <div className="finance-summary-grid">{[["Available cash", model.totals.liquid], ["Debt", model.totals.debtOwed], ["Net worth", model.totals.net]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{model.sourceCount ? money(Number(value), { cents: true }) : "—"}</strong><small>{model.query ? "Matching accounts" : "Latest recorded balances"}</small></article>)}</div>
    <div className="finance-account-toolbar"><AccountMenu label="Sort accounts" icon="sort" value={model.sort} options={[{id:"role",label:"Account type"},{id:"name-asc",label:"Name A–Z"},{id:"balance-desc",label:"Balance high to low"},{id:"balance-asc",label:"Balance low to high"}]} onChange={next=>onSortChange(next==="role"?"default":next as FinanceSort)}/><AccountMenu label="Account view" icon="view-comfortable" value={view} options={views} onChange={changeView}/></div>
    {groups.map(group => {
      const rows = model.rows.filter(row => row.group === group.id);
      if (!rows.length) return null;
      return <section className="finance-account-group" key={group.id} aria-label={group.label}>
        <div className="finance-account-group-heading"><div><h2>{group.label}</h2><p>{group.detail}</p></div><strong>{money(rows.reduce((sum, row) => sum + row.account.balance, 0),{cents:true})}</strong></div>
        <ul className="finance-account-items">{rows.map(({ account, activity }) => {
          const native = state.accounts.find(item => item.id === account.id);
          return <li key={account.id}><button type="button" className="finance-account-item" data-finance-account-id={account.id} aria-pressed={model.selectedId === account.id} aria-controls="finance-inspector" onClick={() => onSelect(account.id)}>
            <span className="finance-account-symbol"><Icon name={accountIcon(account.kind)}/></span>
            <span className="finance-account-identity"><strong>{account.name}</strong><small>{account.inst}{account.mask !== "—" ? ` · ••${account.mask.replace(/^[•*]+/,"")}` : ""}</small></span>
            <span className="finance-account-kind">{account.kind}</span>
            <span className="finance-account-amount"><strong>{money(account.balance, { cents: true })}</strong><small>{account.balance<0?"Balance owed":"Current balance"}</small></span>
            <span className="finance-account-freshness"><span>{accountBalanceSource(native)}</span><small>{accountDate(native?.balanceAsOf)}</small></span>
            <span className="finance-account-activity"><span>{activity.transactions.length} {activity.transactions.length === 1 ? "transaction" : "transactions"}</span><span>{activity.transactions.filter(t=>!t.ufInit||t.status==="pending").length} to review</span></span>
          </button></li>;
        })}</ul>
      </section>;
    })}
    {!model.rows.length && <div className="finance-empty-page"><IconTile hue="green" icon="Wallet" /><h2>{model.sourceCount ? "No matching accounts" : "Bring your accounts together"}</h2><p>{model.sourceCount ? "Try another account name, institution or type." : "Add checking, savings, credit and investment accounts with their current balances."}</p><button className="finance-action is-primary" onClick={model.sourceCount ? () => onQueryChange("") : onAddAccount}>{model.sourceCount ? "Clear search" : "Add account"}</button></div>}
  </div>;
}
