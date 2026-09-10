"use client";

import type { FinanceState } from "../../lib/modules/finance/native-types";
import type { FinanceView } from "../../lib/native-objects/url-state";
import InspectorRail from "../admin-shell/InspectorRail";
import { Icon, money } from "./FinancePrimitives";

export type FinanceUtility = "activity" | "data" | "categories" | "settings";
const titles = { activity: "Recent activity", data: "Accounts data", categories: "Categories", settings: "Finance settings" };
const date = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default function FinanceUtilityRail({ utility, state, onClose, onView, onCategory, onImport }: {
  utility: FinanceUtility; state: FinanceState; onClose: () => void; onView: (view: FinanceView) => void;
  onCategory: (category: string) => void; onImport: () => void;
}) {
  const accounts = state.accounts.filter(item => !item.archivedAt);
  const transactions = state.transactions.filter(item => !item.archivedAt);
  const unreviewed = transactions.filter(item => !item.reviewed || item.status === "pending");
  const events = [...state.auditEvents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 30);
  const categories = [...new Set([...transactions.map(item => item.category), ...state.budgets.filter(item => !item.archivedAt).map(item => item.category), ...state.bills.filter(item => !item.archivedAt).map(item => item.category)])].filter(Boolean).sort();
  const recordLabels = new Map<string, string>([
    ...state.accounts.map(item => [item.id, item.name] as const), ...state.transactions.map(item => [item.id, item.merchant] as const),
    ...state.bills.map(item => [item.id, item.name] as const), ...state.budgets.map(item => [item.id, item.category] as const),
    ...state.rules.map(item => [item.id, item.name] as const), ...state.closePeriods.map(item => [item.id, `${item.period} review`] as const),
    ...state.importBatches.map(item => [item.id, item.sourceFilename] as const)
  ]);
  return <InspectorRail id="finance-inspector" title={titles[utility]} className="finance-utility-rail is-mobile-open" ariaLabel={titles[utility]} overlay overlayOpen onRequestClose={onClose}
    actions={<button className="finance-rail-close" onClick={onClose} aria-label={`Close ${titles[utility]}`}><Icon name="X" /></button>}>
    {utility === "activity" && <>
      <div className="finance-activity-summary"><strong>{unreviewed.length} awaiting review</strong><span>{transactions.length} transactions · {state.importBatches.length} imports</span><button className="finance-text-action" onClick={() => onView("transactions")}>Open transactions ↗</button></div>
      <h3 className="finance-utility-heading">Latest changes</h3>
      {events.length ? <ol className="finance-activity-list">{events.map(event => <li key={event.id}><span className="finance-activity-mark"><Icon name={event.objectType === "import_batch" ? "Link" : "Check"} /></span><div><strong>{recordLabels.get(event.objectId) || event.objectType.replaceAll("_", " ")}</strong><p>{event.action.replaceAll("_", " ")}</p><time dateTime={event.occurredAt}>{date(event.occurredAt)}</time></div></li>)}</ol> : <div className="finance-inline-empty"><Icon name="Calendar" /><strong>No recorded changes yet</strong><p>Account updates, imports, bill payments and review decisions will appear here as you work.</p></div>}
      {!!state.importBatches.length && <><h3 className="finance-utility-heading">Recent imports</h3>{[...state.importBatches].sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt)).slice(0, 3).map(batch => <div className="finance-utility-record" key={batch.id}><strong>{batch.sourceFilename}</strong><p>{batch.counts.accepted} accepted · {batch.counts.unreconciled} unreconciled · {batch.counts.ambiguous} ambiguous · {batch.counts.rejected} rejected</p><small>{date(batch.confirmedAt)}</small></div>)}</>}
    </>}
    {utility === "data" && <><p className="finance-utility-intro">Balance dates and sources for your recorded accounts.</p>{accounts.map(account => <div className="finance-utility-record" key={account.id}><strong>{account.name}</strong><p>{account.institution || "Manual account"}{account.mask ? ` · ${account.mask}` : ""}</p><dl><dt>Balance</dt><dd>{money(account.currentBalance, { cents: true })}</dd><dt>As of</dt><dd>{account.balanceAsOf.slice(0, 10)}</dd><dt>Source</dt><dd>{account.balanceSource}</dd><dt>Scope</dt><dd>{account.entityScope} · {account.currency}</dd></dl></div>)}{!accounts.length && <p className="finance-inline-empty">No accounts recorded yet.</p>}<button className="finance-text-action" onClick={() => onView("accounts")}>Manage accounts ↗</button></>}
    {utility === "categories" && <><p className="finance-utility-intro">Categories used by your transactions, bills and budgets. Choose one to search the ledger.</p><div className="finance-category-list">{categories.map(category => <button key={category} onClick={() => onCategory(category)}><span>{category}</span><small>{transactions.filter(item => item.category === category).length} transactions</small><Icon name="Chevron" /></button>)}</div>{!categories.length && <p className="finance-inline-empty">Choose a category when you record a transaction or create a budget.</p>}<button className="finance-text-action" onClick={() => onView("budgets")}>Manage category budgets ↗</button></>}
    {utility === "settings" && <><p className="finance-utility-intro">Your current Finance setup</p><div className="finance-utility-record"><dl><dt>Currency</dt><dd>US dollar (USD)</dd><dt>Accounts</dt><dd>Manual records</dd><dt>Transaction imports</dt><dd>CSV statements</dd><dt>Bank connections</dt><dd>Not connected</dd><dt>Last saved</dt><dd>{state.updatedAt ? date(state.updatedAt) : "No changes yet"}</dd></dl></div><p className="finance-utility-intro">Balances use the date and source you record. Import a statement to add transactions, then review and categorize them in the ledger.</p><button className="finance-action" onClick={onImport}><Icon name="Link" />Import a statement</button></>}
  </InspectorRail>;
}
