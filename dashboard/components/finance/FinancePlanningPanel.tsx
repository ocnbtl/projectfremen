"use client";
import { useEffect, useRef, useState } from "react";
import type { FinancePlan } from "../../lib/modules/finance/planning";
import type { FinanceState } from "../../lib/modules/finance/native-types";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { money } from "./FinancePrimitives";

export default function FinancePlanningPanel({ reviewOnly, onClose, onApplied }: {
  reviewOnly: boolean; onClose: () => void; onApplied: (state: FinanceState, message: string) => void;
}) {
  const [plan, setPlan] = useState<FinancePlan | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [choices, setChoices] = useState({ budgets: !reviewOnly, bills: !reviewOnly, review: reviewOnly });
  const requestKey = useRef<string>("");
  async function load() {
    setBusy(true); setError(""); setPlan(null); requestKey.current = "";
    try {
      const response = await fetch("/api/finance", { method: "POST", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ operation: "preview_plan" }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not prepare the plan.");
      setPlan(data.plan);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not prepare the plan."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function apply() {
    if (!plan || busy) return;
    setBusy(true); setError("");
    requestKey.current ||= crypto.randomUUID();
    try {
      const response = await fetch("/api/finance", { method: "POST", headers: { ...buildJsonHeadersWithCsrf(), "Idempotency-Key": requestKey.current }, body: JSON.stringify({ operation: "apply_plan", input: { fingerprint: plan.fingerprint, ...choices } }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not apply the plan. Retry safely with the same selections.");
      onApplied(data.state, `${data.counts.budgets} budgets created · ${data.counts.bills} recurring bills added · ${data.counts.reviewed} transactions approved.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not apply the plan."); }
    finally { setBusy(false); }
  }
  return <section className="finance-planning" aria-label={reviewOnly ? "Review transaction approvals" : "Plan from transaction history"}>
    <div className="finance-planning-heading"><div><h2>{reviewOnly ? "Approve your review queue" : "A starting plan from your history"}</h2><p>{reviewOnly ? "Review status and bank settlement are separate." : "Editable monthly limits and recurring reminders, with the transactions behind each suggestion."}</p></div><button type="button" className="finance-action" disabled={busy} onClick={onClose}>Close</button></div>
    {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={load}>Refresh preview</button></p>}
    {!plan && busy && <p role="status">Reading your transaction history…</p>}
    {plan && <>
      <div className="finance-plan-choices">
        {!reviewOnly && <><label><input type="checkbox" checked={choices.budgets} disabled={busy} onChange={e => { setChoices({ ...choices, budgets: e.target.checked }); requestKey.current = ""; }} />Create {plan.budgets.length} budgets for {plan.asOf.slice(0, 7)}</label><label><input type="checkbox" checked={choices.bills} disabled={busy} onChange={e => { setChoices({ ...choices, bills: e.target.checked }); requestKey.current = ""; }} />Add {plan.bills.length} recurring bills</label></>}
        <label><input type="checkbox" checked={choices.review} disabled={busy} onChange={e => { setChoices({ ...choices, review: e.target.checked }); requestKey.current = ""; }} />Approve {plan.reviewIds.length} transactions</label>
      </div>
      {choices.review && <p>{plan.pendingCount} pending payment{plan.pendingCount === 1 ? " stays" : "s stay"} pending at the bank. Approval does not resolve duplicate matches, waive monthly checks, or mark bills paid.</p>}
      {!reviewOnly && <><p className="finance-plan-basis">Baseline: {plan.periods.length ? plan.periods.join(" · ") : "Not enough complete observed months yet"}. {plan.notes[0]}</p>
        {choices.budgets && <div className="finance-plan-list"><h3>Monthly limits · {money(plan.budgets.reduce((s, b) => s + b.limit, 0))} total</h3>{plan.budgets.map(b => <details key={`${b.entityScope}:${b.category}`}><summary><span>{b.category} <small>{b.entityScope}</small></span><strong>{money(b.limit)}</strong></summary><p>{b.evidence.basis}</p></details>)}{!plan.budgets.length && <p>No new budgets to add. Existing limits are preserved.</p>}</div>}
        {choices.bills && <div className="finance-plan-list"><h3>Recurring bills · estimated</h3><p>{plan.notes[1]} {plan.notes[2]}</p>{plan.bills.map(b => <details key={b.evidence.sourceKey}><summary><span>{b.name}<small>Next expected {b.dueDate}</small></span><strong>{money(b.amount, { cents: true })}/mo</strong></summary><p>{b.evidence.basis}</p></details>)}{!plan.bills.length && <p>No new monthly patterns found. Existing bills are preserved.</p>}</div>}</>}
      <div className="finance-plan-actions"><button type="button" className="finance-action" disabled={busy} onClick={load}>Refresh preview</button><button type="button" className="finance-action is-primary" disabled={busy || !(choices.budgets || choices.bills || choices.review)} onClick={apply}>{busy ? "Applying…" : reviewOnly ? "Approve transactions" : "Apply selected plan"}</button></div>
    </>}
  </section>;
}
