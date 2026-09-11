"use client";

import { useEffect, useRef, useState } from "react";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import type { BankingView, BankConnectionView } from "../../lib/modules/finance/banking-types";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { Icon, money } from "./FinancePrimitives";

type LinkSession = { sessionId: string; linkToken: string; expiresAt: string; update: boolean };
type LinkHandler = { open: () => void; destroy: () => void };
type PlaidWindow = Window & { Plaid?: { create: (options: { token: string; receivedRedirectUri?: string; onSuccess: (token: string) => void; onExit: (error: unknown) => void }) => LinkHandler } };
const sessionKey = "unigentamos.plaid.link-session";
let scriptLoading: Promise<void> | undefined;
async function loadLinkScript() {
  if ((window as PlaidWindow).Plaid) return;
  if (!scriptLoading) scriptLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    const timeout = window.setTimeout(() => { script.remove(); scriptLoading = undefined; reject(new Error("Plaid Link took too long to load. Please try again.")); }, 20_000);
    script.onload = () => { window.clearTimeout(timeout); resolve(); };
    script.onerror = () => { window.clearTimeout(timeout); script.remove(); scriptLoading = undefined; reject(new Error("Plaid Link could not load. Check your connection and try again.")); };
    document.head.appendChild(script);
  });
  await scriptLoading;
}

async function requestBank(body?: Record<string, unknown>) {
  const response = await fetch("/api/finance/banking", { method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin",
    ...(body ? { headers: buildJsonHeadersWithCsrf(), body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Bank connections are unavailable. Try again later.");
  return result as { banking?: BankingView; link?: LinkSession; connectionId?: string };
}
const date = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function AccountMatching({ connection, state, busy, onSave }: { connection: BankConnectionView; state: FinanceState; busy: boolean; onSave: (choices: Record<string, string>) => void }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  return <form className="finance-bank-matching" onSubmit={event => { event.preventDefault(); onSave(choices); }}>
    <p>Match each account to a record you already keep, create a new one, or skip it. Connecting updates its balance and imports up to 90 days of available transactions.</p>
    {connection.accounts.map(account => <label key={account.id}><span><strong>{account.name}</strong>{account.mask ? ` · ••${account.mask}` : ""}</span>
      <small>{account.kind} · {account.currency}{account.balance !== null ? ` · ${money(account.balance, { cents: true })}` : " · Balance unavailable"}</small>
      {account.supported ? <select aria-label={`Match ${account.name}`} required disabled={busy} value={choices[account.id] || ""} onChange={event => setChoices({ ...choices, [account.id]: event.target.value })}>
        <option value="">Choose where this belongs</option><option value="skip">Skip this account</option><option value="new">Create a new Finance account</option>
        {state.accounts.filter(item => !item.archivedAt && (!item.bankLink || (item.bankLink.connectionId === connection.id && item.bankLink.accountId === account.id)) && item.entityScope === "personal" && item.kind === account.kind).map(item => <option key={item.id} value={item.id}>{item.name}{item.mask ? ` · ••${item.mask}` : ""}</option>)}
      </select> : <small>USD checking, savings and credit-card accounts are supported in this first release.</small>}
    </label>)}
    <button type="submit" className="finance-action" disabled={busy || !connection.accounts.some(item => item.supported)}>Save matches & sync</button>
  </form>;
}

export default function FinanceBankConnections({ state, onChanged }: { state: FinanceState; onChanged: () => Promise<void> }) {
  const [banking, setBanking] = useState<BankingView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [disconnectId, setDisconnectId] = useState("");
  const handler = useRef<LinkHandler | null>(null);
  const resumed = useRef(false);
  const refresh = async () => { const result = await requestBank(); if (result.banking) setBanking(result.banking); };
  const run = async (body: Record<string, unknown>, message: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await requestBank(body);
      if (body.operation === "map") await requestBank({ operation: "sync", connectionId: body.connectionId });
      setNotice(message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The connection could not be updated."); }
    finally {
      try { await refresh(); await onChanged(); } catch { setError(current => current || "Could not reload Finance. Refresh the page to see the latest saved data."); }
      setBusy(false);
    }
  };

  const openLink = async (session: LinkSession, redirect?: string) => {
    await loadLinkScript();
    const plaid = (window as PlaidWindow).Plaid;
    if (!plaid) throw new Error("Plaid Link is unavailable.");
    // Only a short-lived Link token is stored here for the OAuth round trip. Access tokens stay on the server.
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
    handler.current?.destroy();
    handler.current = plaid.create({ token: session.linkToken, ...(redirect ? { receivedRedirectUri: redirect } : {}),
      onSuccess: publicToken => {
        void (async () => {
          setBusy(true); setError("");
          try {
            const result = await requestBank({ operation: "exchange", sessionId: session.sessionId, publicToken: publicToken || "update-mode" });
            sessionStorage.removeItem(sessionKey);
            if (redirect) window.history.replaceState(window.history.state, "", "/admin/finance/accounts");
            if (session.update && result.connectionId) await requestBank({ operation: "sync", connectionId: result.connectionId });
            setNotice(session.update ? "Connection updated." : "Connected. Match your accounts below to start importing.");
          } catch (cause) { setError(cause instanceof Error ? cause.message : "The connection could not be saved. Reload to check its status."); }
          finally { try { await refresh(); await onChanged(); } catch { /* Keep the actionable save error. */ } setBusy(false); }
        })();
      },
      onExit: cause => {
        sessionStorage.removeItem(sessionKey);
        void requestBank({ operation: "cancel", sessionId: session.sessionId }).catch(() => undefined);
        if (redirect) window.history.replaceState(window.history.state, "", "/admin/finance/accounts");
        setBusy(false);
        if (cause) setError("Plaid Link did not finish. You can try again when ready.");
      }
    });
    handler.current.open();
  };

  useEffect(() => {
    void refresh().catch(cause => setError(cause instanceof Error ? cause.message : "Bank connections could not load."));
    if (new URLSearchParams(window.location.search).has("oauth_state_id") && !resumed.current) {
      resumed.current = true;
      try {
        const session: LinkSession = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
        if (!session || typeof session.linkToken !== "string" || typeof session.sessionId !== "string" || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) throw new Error("This bank sign-in session expired. Start a new connection.");
        setBusy(true);
        void openLink(session, window.location.href).catch(cause => { setError(cause.message); setBusy(false); });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "The bank sign-in session is unavailable."); }
    }
    return () => { handler.current?.destroy(); };
    // Initialization happens once per opened panel; callbacks refresh the owner state after each operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (connectionId?: string) => {
    if (banking?.origin && window.location.origin !== banking.origin) {
      window.location.assign(`${banking.origin}/admin/finance/accounts`);
      return;
    }
    setBusy(true); setError(""); setNotice("");
    let session: LinkSession | undefined;
    try {
      const result = await requestBank({ operation: "link", connectionId });
      session = result.link;
      if (!session) throw new Error("A bank sign-in session could not be created.");
      await openLink(session);
    } catch (cause) {
      if (session) void requestBank({ operation: "cancel", sessionId: session.sessionId }).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Plaid Link could not open."); setBusy(false);
    }
  };
  const reviews = (state.bankReviews || []).filter(item => !item.resolved);
  return <section className="finance-bank-connections" aria-label="Bank connections" aria-busy={busy}>
    <div className="finance-bank-heading"><span className="finance-activity-mark"><Icon name="Link" /></span><div><h3>Bank connections</h3><p>Personal accounts · powered by Plaid</p></div></div>
    {error && <p className="finance-bank-error" role="alert">{error}</p>}
    {notice && <p className="finance-bank-notice" role="status">{notice}</p>}
    {!banking && !error && <p role="status">Loading connections…</p>}
    {!banking && error && <button className="finance-action" onClick={() => void run({ operation: "cancel", sessionId: "" }, "Connections reloaded.")}>Retry</button>}
    {banking && !banking.configured && <div className="finance-inline-empty"><strong>Secure setup is still needed</strong><p>Plaid Trial is ready. The site needs its server credentials, encryption key and registered return address before your first connection.</p><p>Keep using manual accounts and CSV imports while setup is completed.</p></div>}
    {banking?.configured && <>
      <p className="finance-bank-plan">{banking.environment === "sandbox" ? "Sandbox · test data only" : "Free personal Trial"} · {banking.connectionsUsed}/10 connection slots used or reserved</p>
      <p className="finance-utility-intro">Connect USD checking, savings, credit cards and supported PayPal accounts. Your sign-in stays inside Plaid. Updates arrive when your institution makes them available.</p>
      <button className="finance-action" disabled={busy || banking.connectionsUsed >= 10} onClick={() => void connect()}><Icon name="Link" />Connect an institution</button>
      <p className="finance-bank-footnote">One institution login can contain several accounts. Removing a connection does not restore its Trial slot. Vanguard and other investment accounts need a separate Investments connection. Use the Coinbase section for your personal crypto portfolio.</p>
      {banking.connections.map(connection => <article className="finance-bank-card" key={connection.id}>
        <div className="finance-bank-card-heading"><strong>{connection.name}</strong><span>{connection.status === "mapping" ? "Match accounts" : connection.status === "reconnect" ? "Needs attention" : connection.status === "disconnected" ? "Disconnected" : "Connected"}</span></div>
        {connection.error && <p className="finance-bank-error">{connection.error}</p>}
        {connection.lastSyncedAt && <p className="finance-bank-footnote">Last retrieved {date(connection.lastSyncedAt)}. Bank data may be older.</p>}
        {connection.status === "connected" && !connection.initialComplete && <p className="finance-bank-footnote">Initial history may still be arriving. Plaid will notify the site when more is ready.</p>}
        {!!Object.keys(connection.mappings).length && connection.status !== "disconnected" && <ul className="finance-bank-account-list">{Object.entries(connection.mappings).map(([bankId, nativeId]) => <li key={bankId}>{state.accounts.find(item => item.id === nativeId)?.name || "Connected account"}</li>)}</ul>}
        {connection.status === "mapping" && connection.accounts.length > 0 && <AccountMatching connection={connection} state={state} busy={busy} onSave={choices => void run({ operation: "map", connectionId: connection.id, choices }, "Accounts matched and available transactions synced.")} />}
        {connection.status !== "disconnected" && <div className="finance-bank-actions">
          {connection.status === "mapping" && !connection.accounts.length && <button className="finance-action" disabled={busy} onClick={() => void run({ operation: "accounts", connectionId: connection.id }, "Accounts loaded.")}>Load accounts</button>}
          {connection.status === "connected" && <button className="finance-action" disabled={busy} onClick={() => void run({ operation: "sync", connectionId: connection.id }, "Available bank data synced.")}>Sync now</button>}
          {connection.status === "reconnect" && <button className="finance-action" disabled={busy} onClick={() => void connect(connection.id)}>Reconnect</button>}
          <button className="finance-text-action" disabled={busy} onClick={() => setDisconnectId(connection.id)}>Disconnect</button>
        </div>}
        {disconnectId === connection.id && connection.status !== "disconnected" && <div className="finance-bank-confirm"><p>Disconnect {connection.name}? This revokes the connection and removes its saved access token. Your Finance records stay available.</p><div className="finance-bank-actions"><button className="finance-action" disabled={busy} onClick={() => { setDisconnectId(""); void run({ operation: "disconnect", connectionId: connection.id }, "Institution disconnected. Saved Finance history is preserved."); }}>Disconnect institution</button><button className="finance-text-action" disabled={busy} onClick={() => setDisconnectId("")}>Keep connected</button></div></div>}
      </article>)}
    </>}
    {reviews.length > 0 && <div className="finance-bank-review"><h3>Possible duplicate entries · {reviews.length}</h3><p>These bank entries are held outside your totals until you decide how they belong.</p>{reviews.map(review => <article className="finance-bank-card" key={review.id}><strong>{review.transaction.merchant} · {money(review.transaction.amount, { cents: true })}</strong><p>{review.transaction.date} · {state.accounts.find(item => item.id === review.accountId)?.name}</p>
      {review.candidates.map(id => { const item = state.transactions.find(tx => tx.id === id); return item && <button className="finance-action" key={id} disabled={busy} onClick={() => void run({ operation: "review", reviewId: review.id, decision: "match", targetId: id }, "Existing entry matched; your notes and category were kept.")}>Match {item.merchant} · {item.occurredOn}</button>; })}
      <div className="finance-bank-actions"><button className="finance-text-action" disabled={busy} onClick={() => void run({ operation: "review", reviewId: review.id, decision: "import" }, "Bank entry imported separately.")}>Import separately</button><button className="finance-text-action" disabled={busy} onClick={() => void run({ operation: "review", reviewId: review.id, decision: "ignore" }, "Bank entry ignored.")}>Ignore bank entry</button></div>
    </article>)}</div>}
  </section>;
}
