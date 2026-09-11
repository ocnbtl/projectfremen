"use client";

import { useState } from "react";
import type { BankConnectionView } from "../../lib/modules/finance/banking-types";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import { money } from "./FinancePrimitives";

export default function FinanceInvestmentSnapshot({ connection, state }: { connection: BankConnectionView; state: FinanceState }) {
  const [holdingLimit, setHoldingLimit] = useState(100), [activityLimit, setActivityLimit] = useState(100);
  const snapshot = connection.investments;
  if (!snapshot) return null;
  const accountName = (id: string) => state.accounts.find(item => item.id === connection.mappings[id])?.name || connection.accounts.find(item => item.id === id)?.name || "Investment account";
  const cancelled = new Set(snapshot.activity.map(item => item.cancelTransactionId).filter(Boolean));
  return <div className="finance-investment-snapshot">
    <p className="finance-bank-footnote">{connection.status === "disconnected" ? "Last saved snapshot. " : ""}Investment values can lag the market. Account balances include their holdings; they are counted once in your totals.</p>
    {connection.accounts.some(item => Object.hasOwn(connection.mappings, item.id) && item.balance === null) && <p className="finance-bank-error">An account balance is unavailable. Its previous dated balance is preserved.</p>}
    <details open><summary>Holdings · {snapshot.holdings.length}</summary>
      <ul className="finance-investment-list">{snapshot.holdings.slice(0, holdingLimit).map(item => <li key={`${item.accountId}:${item.securityId}`}>
        <div><strong>{item.ticker || item.name}</strong><span>{item.ticker ? `${item.name} · ` : ""}{accountName(item.accountId)}</span><span>{item.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })} units{item.priceAsOf ? ` · Price dated ${item.priceAsOf}` : " · Price date unavailable"}</span></div>
        <strong>{money(item.value, { cents: true })}</strong>
      </li>)}</ul>
      {!snapshot.holdings.length && <p>No holdings were returned for these accounts.</p>}
      {snapshot.holdings.length > holdingLimit && <button className="finance-text-action" onClick={() => setHoldingLimit(value => value + 100)}>Show more holdings</button>}
    </details>
    <details><summary>Investment activity · {snapshot.activity.length}</summary>
      {!snapshot.activityReady && <p className="finance-bank-notice">Plaid is preparing investment history. Sync again in a few minutes. Any previously saved activity remains below.</p>}
      <p className="finance-bank-footnote">{snapshot.activityFrom} – {snapshot.activityThrough}. Available activity for the last 90 days, separate from your spending ledger. Amounts retain the institution’s signs and are not spending or income totals.</p>
      {snapshot.activityRetrievedAt && <p className="finance-bank-footnote">Activity retrieved {new Date(snapshot.activityRetrievedAt).toLocaleString("en-US")}</p>}
      <ul className="finance-investment-list">{snapshot.activity.slice(0, activityLimit).map(item => <li key={item.id}>
        <div><strong>{item.name}</strong><span>{item.date} · {item.subtype.replaceAll("_", " ")} · {accountName(item.accountId)}</span>{(cancelled.has(item.id) || item.cancelTransactionId) && <span>{item.cancelTransactionId ? "Cancellation entry" : "Cancelled"}</span>}</div>
        <div><strong>{money(item.amount, { cents: true })}</strong>{item.quantity !== 0 && <span>{item.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })}{item.ticker ? ` ${item.ticker}` : " units"}</span>}</div>
      </li>)}</ul>
      {!snapshot.activity.length && snapshot.activityReady && <p>No investment activity was returned for this period.</p>}
      {snapshot.activity.length > activityLimit && <button className="finance-text-action" onClick={() => setActivityLimit(value => value + 100)}>Show more investment activity</button>}
    </details>
  </div>;
}
