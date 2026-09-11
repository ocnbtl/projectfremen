"use client";

import { useEffect, useState } from "react";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import type { CoinbaseView } from "../../lib/modules/finance/coinbase-types";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { Icon, money } from "./FinancePrimitives";

const date = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
async function requestCoinbase(body?: Record<string, unknown>): Promise<CoinbaseView> {
  const response = await fetch("/api/finance/coinbase", { method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin",
    ...(body ? { headers: buildJsonHeadersWithCsrf(), body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Coinbase is unavailable. Try again later.");
  return result.coinbase;
}
export default function FinanceCoinbaseConnection({ state, onChanged }: { state: FinanceState; onChanged: () => Promise<void> }) {
  const [view, setView] = useState<CoinbaseView | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  useEffect(() => { let active = true; void requestCoinbase().then(result => { if (active) setView(result); }).catch(cause => { if (active) setError(cause.message); }); return () => { active = false; }; }, []);
  async function run(body?: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try { setView(await requestCoinbase(body)); if (body) { await onChanged(); setNotice(body.operation === "disconnect" ? "Disconnected. Saved balances and the last snapshot are preserved." : "Coinbase snapshot updated."); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Coinbase could not be updated."); }
    finally { setBusy(false); }
  }
  const snapshot = view?.snapshot;
  const account = state.accounts.find(item => item.id === view?.accountId);
  return <section className="finance-bank-connections finance-coinbase" aria-label="Coinbase connection" aria-busy={busy}>
    <div className="finance-bank-heading"><span className="finance-activity-mark"><Icon name="Link" /></span><div><h3>Coinbase</h3><p>Personal portfolio · View only</p></div></div>
    {(error || view?.error) && <p className="finance-bank-error" role="alert">{error || view?.error}</p>}
    {notice && <p className="finance-bank-notice" role="status">{notice}</p>}
    {!view && !error && <p role="status">Loading Coinbase…</p>}
    {!view && error && <button className="finance-action" disabled={busy} onClick={() => void run()}>Retry Coinbase</button>}
    {view && !view.configured && <p className="finance-utility-intro">Secure server setup is needed before connecting Coinbase. Your manual accounts remain available.</p>}
    {view?.configured && !view.connected && <>
      <p className="finance-utility-intro">Connect your own Coinbase account to see holdings and recent activity. Its estimated USD value can update one Finance brokerage account.</p>
      <details className="finance-coinbase-setup"><summary>Set up a read-only key</summary><ol>
        <li>Open <a href="https://portal.cdp.coinbase.com/access/api" target="_blank" rel="noreferrer">Coinbase API keys ↗</a> and create a Secret API key for your Coinbase portfolio.</li>
        <li>Choose <strong>View</strong> only. Leave Trade, Transfer and Receive off.</li>
        <li>Under Advanced Settings, choose <strong>ECDSA</strong> as the signature algorithm.</li>
        <li>Paste the key name and complete private key below. They are encrypted on the server and never returned to this page.</li>
      </ol><a href="https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication" target="_blank" rel="noreferrer">Coinbase’s setup instructions ↗</a></details>
      <form className="finance-bank-matching finance-coinbase-form" autoComplete="off" onSubmit={event => {
        event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
        const body = { operation: "connect", keyName: data.get("keyName"), privateKey: data.get("privateKey"), accountId: data.get("accountId"), personalUse: data.get("personalUse") === "on" };
        form.reset(); void run(body);
      }}>
        <label>API key name<input name="keyName" autoComplete="off" placeholder="organizations/…/apiKeys/…" maxLength={240} required disabled={busy} spellCheck={false} /></label>
        <label>Private key<textarea className="finance-coinbase-secret" name="privateKey" autoComplete="new-password" placeholder="Paste the complete ECDSA private key" rows={3} maxLength={4000} required disabled={busy} spellCheck={false} /></label>
        <label>Finance account<select name="accountId" aria-label="Finance account" required disabled={busy} defaultValue=""><option value="">Choose where this belongs</option>
          {state.accounts.filter(item => !item.archivedAt && item.entityScope === "personal" && item.kind === "Brokerage" && !item.bankLink).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          <option value="new">Create a Coinbase brokerage account</option>
        </select></label>
        <label className="finance-coinbase-consent"><input type="checkbox" name="personalUse" required disabled={busy} /><span>This is my own Coinbase account.</span></label>
        <button className="finance-action" type="submit" disabled={busy}><Icon name="Link" />{busy ? "Checking Coinbase…" : "Connect Coinbase"}</button>
      </form>
      <p className="finance-bank-footnote">Only read access is accepted. This connection does not use a Plaid Trial slot.</p>
    </>}
    {view?.connected && <>
      <div className="finance-bank-card-heading"><strong>{account?.name || "Personal portfolio"}</strong><span>View only</span></div>
      <p className="finance-bank-footnote">Sync when you want a fresh snapshot. Coinbase activity is shown separately from your spending ledger.</p>
      <div className="finance-bank-actions"><button className="finance-action" disabled={busy} onClick={() => void run({ operation: "sync" })}><Icon name="Refresh" />{busy ? "Syncing…" : "Sync Coinbase"}</button><button className="finance-text-action" disabled={busy} onClick={() => setConfirmDisconnect(true)}>Disconnect Coinbase</button></div>
      {confirmDisconnect && <div className="finance-bank-confirm"><p>Disconnect Coinbase? This deletes the key saved by Unigentamos and stops syncing. Your last snapshot stays available. You can also revoke the key in Coinbase.</p><div className="finance-bank-actions"><button className="finance-action" disabled={busy} onClick={() => { setConfirmDisconnect(false); void run({ operation: "disconnect" }); }}>Delete saved key</button><button className="finance-text-action" disabled={busy} onClick={() => setConfirmDisconnect(false)}>Keep connected</button></div></div>}
    </>}
    {snapshot && <div className="finance-coinbase-snapshot">
      <p className="finance-bank-footnote">{view?.connected ? "Retrieved" : "Last saved snapshot"} {date(snapshot.retrievedAt)}</p>
      <div className="finance-coinbase-total"><span>Estimated portfolio value</span><strong>{snapshot.totalUsd === null ? "Unavailable" : money(snapshot.totalUsd, { cents: true })}</strong></div>
      {snapshot.totalUsd === null && <p className="finance-bank-error">Some holdings have no USD price. The Finance account keeps its previous dated balance.</p>}
      <details open><summary>Holdings · {snapshot.holdings.length}</summary><ul className="finance-coinbase-list">{snapshot.holdings.map(item => <li key={item.id}><div><strong>{item.currency}</strong><span>{item.quantity} {item.currency}</span></div><strong>{item.valueUsd === null ? "Price unavailable" : money(item.valueUsd, { cents: true })}</strong></li>)}</ul>{!snapshot.holdings.length && <p>No funded wallets were returned by this key.</p>}</details>
      <details><summary>Recent Coinbase activity · {snapshot.activity.length}</summary><p className="finance-bank-footnote">Up to 100 recent entries per funded wallet and USD wallet, newest 500 overall. This excludes historical wallets with zero balances and is not a complete accounting or tax history.</p><ul className="finance-coinbase-list">{snapshot.activity.map(item => <li key={`${item.accountId}:${item.id}`}><div><strong>{item.type.replaceAll("_", " ")}</strong><span>{date(item.occurredAt)} · {item.status}</span></div><div><strong>{item.quantity} {item.currency}</strong><span>{item.valueUsd === null ? "USD value unavailable" : money(item.valueUsd, { cents: true })}</span></div></li>)}</ul>{!snapshot.activity.length && <p>No recent activity returned for these wallets.</p>}</details>
    </div>}
  </section>;
}
