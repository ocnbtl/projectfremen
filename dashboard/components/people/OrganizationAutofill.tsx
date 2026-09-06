"use client";

import { useEffect, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { ORGANIZATION_AUTOFILL_LABELS, organizationSuggestionError, type OrganizationAutofillField, type OrganizationAutofillResult, type OrganizationSuggestion } from "../../lib/modules/people/organization-autofill";
import UnigentamosIcon from "../icons/UnigentamosIcon";

export default function OrganizationAutofill({ name, values, onApply }: {
  name: string;
  values: Partial<Record<OrganizationAutofillField, string>>;
  onApply: (suggestions: OrganizationSuggestion[], fetchedAt: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<OrganizationAutofillResult | null>(null);
  const [selected, setSelected] = useState<OrganizationAutofillField[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setResult(null);
    setNotice("");
    return () => controller.current?.abort();
  }, [name, url]);

  async function findSuggestions() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setResult(null);
    setNotice("");
    try {
      const response = await fetch("/api/people/organizations/autofill", {
        method: "POST", headers: buildJsonHeadersWithCsrf(), signal: request.signal,
        body: JSON.stringify({ name, url })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.result) throw new Error(payload.error || "Suggestions could not be loaded. Your draft is still here.");
      if (request.signal.aborted) return;
      const next = payload.result as OrganizationAutofillResult;
      setResult(next);
      setSelected(next.suggestions.filter((item) => !values[item.field]?.trim()).map((item) => item.field));
    } catch (error) {
      if (!request.signal.aborted) setNotice(error instanceof Error ? error.message : "Suggestions could not be loaded. Your draft is still here.");
    } finally { if (!request.signal.aborted) setBusy(false); }
  }
  const chosen = result?.suggestions.filter((item) => selected.includes(item.field) && !values[item.field]?.trim()) || [];
  const invalidChoice = chosen.some((item) => organizationSuggestionError(item.field, item.value));
  return (
    <section className="people-organization-autofill" aria-labelledby="organization-autofill-title">
      <header><UnigentamosIcon role="organization" /><h4 id="organization-autofill-title">Autofill from a public link</h4></header>
      <p>Add the organization’s name above, then its website or social profile. Review suggestions before adding them to your draft.</p>
      <div className="people-autofill-source">
        <label>Public link<input value={url} onChange={(event) => setUrl(event.target.value)} inputMode="url" autoComplete="url" placeholder="Website, LinkedIn, or another public profile" /></label>
        <button type="button" disabled={busy || !name.trim() || !url.trim()} onClick={() => void findSuggestions()}>{busy ? "Reading page…" : "Find suggestions"}</button>
      </div>
      <div role="status" aria-live="polite">{busy ? "Reading the public page. Your draft stays editable." : notice || result?.message}</div>
      {result && result.suggestions.length > 0 && <>
        <div className="people-autofill-review">
          {result.suggestions.map((item) => {
            const occupied = Boolean(values[item.field]?.trim());
            return <div className="people-autofill-suggestion" key={item.field}>
              <label className="people-autofill-choice"><input type="checkbox" checked={!occupied && selected.includes(item.field)} disabled={occupied} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.field] : current.filter((field) => field !== item.field))} /><span>{ORGANIZATION_AUTOFILL_LABELS[item.field]}</span></label>
              {item.field === "context" ? <textarea aria-label={`Suggested ${ORGANIZATION_AUTOFILL_LABELS[item.field]}`} value={item.value} rows={3} maxLength={800} onChange={(event) => setResult({ ...result, suggestions: result.suggestions.map((suggestion) => suggestion.field === item.field ? { ...suggestion, value: event.target.value } : suggestion) })} />
                : <input aria-label={`Suggested ${ORGANIZATION_AUTOFILL_LABELS[item.field]}`} value={item.value} maxLength={240} onChange={(event) => setResult({ ...result, suggestions: result.suggestions.map((suggestion) => suggestion.field === item.field ? { ...suggestion, value: event.target.value } : suggestion) })} />}
              {!occupied && selected.includes(item.field) && organizationSuggestionError(item.field, item.value) && <small role="alert">{organizationSuggestionError(item.field, item.value)}</small>}
              <small>{occupied ? "Your draft already has a value; it will be kept. " : ""}{item.evidence}. <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a></small>
            </div>;
          })}
        </div>
        <div className="people-autofill-footer"><span>Reviewed sources will be kept in Notes when you save.</span><button type="button" disabled={!chosen.length || invalidChoice} onClick={() => {
          onApply(chosen, result.fetchedAt);
          setResult(null);
          setNotice("Selected suggestions added to your draft. Review the details, then Save when ready.");
        }}>Use selected suggestions</button></div>
      </>}
    </section>
  );
}
