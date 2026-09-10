"use client";
import type { FinanceSort } from "../../lib/native-objects/url-state";
import type { FinanceAccountsViewModel } from "../../lib/modules/finance/accounts-view-model";
import type { FinanceCashflowSeries } from "../../lib/modules/finance/types";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import { Icon, IconTile, accountIcon, money } from "./FinancePrimitives";

export type FinanceAccountsViewProps = {
  model: FinanceAccountsViewModel; state: FinanceState; onAddAccount: () => void;
  cashflow: FinanceCashflowSeries; cashflowSummary: string; actualSavingsMovement: number;
  onQueryChange: (query: string) => void; onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void; onOpenFilterPreview: () => void; onOpenGroupingPreview: () => void;
};
const groups = [
  { id: "cash-and-deposits", label: "Cash & deposits", detail: "Your everyday accounts and savings" },
  { id: "credit-and-liabilities", label: "Credit & liabilities", detail: "Balances you owe" },
  { id: "investments-and-business", label: "Investments & business", detail: "Your other recorded balances" }
];
export default function FinanceAccountsView({ model, state, onAddAccount, onQueryChange, onSortChange, onSelect }: FinanceAccountsViewProps) {
  return <>
    <div className="finance-summary-grid">{[["Available cash", model.totals.liquid], ["Debt", model.totals.debtOwed], ["Net worth", model.totals.net]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{model.sourceCount ? money(Number(value), { cents: true }) : "—"}</strong><small>{model.query ? "Matching accounts" : "Recorded account balances"}</small></article>)}</div>
    <div className="finance-account-toolbar"><span>{model.visibleCount} account{model.visibleCount === 1 ? "" : "s"} · grouped by type</span><label>Sort <select aria-label="Sort accounts" value={model.sort} onChange={event => onSortChange(event.target.value === "role" ? "default" : event.target.value as FinanceSort)}><option value="role">Account type</option><option value="name-asc">Name A–Z</option><option value="balance-desc">Balance high to low</option><option value="balance-asc">Balance low to high</option></select></label></div>
    {groups.map(group => {
      const rows = model.rows.filter(row => row.group === group.id);
      if (!rows.length) return null;
      return <section className="finance-account-group" key={group.id} aria-label={group.label}>
        <div className="finance-account-group-heading"><div><h2>{group.label}</h2><p>{group.detail}</p></div><strong>{money(rows.reduce((sum, row) => sum + row.account.balance, 0))}</strong></div>
        <ul className="finance-account-cards">{rows.map(({ account, activity }) => {
          const native = state.accounts.find(item => item.id === account.id);
          return <li key={account.id}><button type="button" className="finance-account-card" data-finance-account-id={account.id} aria-pressed={model.selectedId === account.id} aria-controls="finance-inspector" onClick={() => onSelect(account.id)}>
            <span className="finance-account-card-top"><IconTile hue={account.kind === "Credit" ? "brown" : "green"} icon={accountIcon(account.kind)} /><span>{account.kind}</span><Icon name="Chevron" /></span>
            <strong className="finance-account-card-name">{account.name}</strong><span className="finance-account-institution">{account.inst}{account.mask !== "—" ? ` · ${account.mask}` : ""}</span>
            <strong className="finance-account-balance">{money(account.balance, { cents: true })}</strong><span className="finance-account-asof">{native?.balanceSource === "imported" ? "Imported" : "Recorded"} balance · {native?.balanceAsOf.slice(0, 10) || "Date unavailable"}</span>
            <span className="finance-account-card-foot"><span>{activity.transactions.length} transactions</span><span>{activity.bills.length} bills</span></span>
          </button></li>;
        })}</ul>
      </section>;
    })}
    {!model.rows.length && <div className="finance-empty-page"><IconTile hue="green" icon="Wallet" /><h2>{model.sourceCount ? "No matching accounts" : "Bring your accounts together"}</h2><p>{model.sourceCount ? "Try another account name, institution or type." : "Add checking, savings, credit and investment accounts with their current balances."}</p><button className="finance-action is-primary" onClick={model.sourceCount ? () => onQueryChange("") : onAddAccount}>{model.sourceCount ? "Clear search" : "Add account"}</button></div>}
  </>;
}
