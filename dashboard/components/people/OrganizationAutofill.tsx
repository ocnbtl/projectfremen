"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { ORGANIZATION_AUTOFILL_LABELS, emptyOrganizationSuggestions, organizationSeedUrls, type OrganizationAutofillResult, type OrganizationAutofillValues, type OrganizationSuggestion } from "../../lib/modules/people/organization-autofill";
import UnigentamosIcon from "../icons/UnigentamosIcon";

/** Placed directly in the Links heading; all changes remain an unsaved form draft. */
export default function OrganizationAutofill({ name, values, onApply, onPhoto, hasPhoto = false, disabled = false }: {
  name: string;
  values: OrganizationAutofillValues;
  onApply: (suggestions: OrganizationSuggestion[], fetchedAt: string) => void;
  disabled?: boolean;
  onPhoto?: (dataUrl: string) => void;
  hasPhoto?: boolean;
}) {
  const [result, setResult] = useState<OrganizationAutofillResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [profileText, setProfileText] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const pasteId = useId();
  const controller = useRef<AbortController | null>(null);
  const latest = useRef({ name, values, onApply, onPhoto, hasPhoto });
  latest.current = { name, values, onApply, onPhoto, hasPhoto };
  const urls = organizationSeedUrls(values);
  const pasteSource = result?.sourceIssues?.find(issue => urls.includes(issue.sourceUrl))?.sourceUrl || urls[0];
  const sourceKey = JSON.stringify(urls);
  useEffect(() => {
    if (controller.current) {
      controller.current.abort();
      controller.current = null;
      setBusy(false);
      setNotice("The name or links changed. Run autofill again when ready.");
    }
  }, [name, sourceKey, disabled]);
  useEffect(() => () => controller.current?.abort(), []);

  async function autofill(fromText = false) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setResult(null);
    setNotice("");
    try {
      const response = await fetch("/api/people/organizations/autofill", {
        method: "POST", headers: buildJsonHeadersWithCsrf(), signal: request.signal,
        body: JSON.stringify({ name, urls: fromText ? [pasteSource] : urls, ...(fromText ? { profileText } : {}) })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !Array.isArray(payload.result?.suggestions)) throw new Error(payload.error || "Autofill could not finish. Your draft is still here.");
      if (request.signal.aborted) return;
      if (latest.current.name !== name || JSON.stringify(organizationSeedUrls(latest.current.values)) !== sourceKey) {
        setNotice("The name or links changed. Run autofill again when ready.");
        return;
      }
      const next = payload.result as OrganizationAutofillResult;
      if (!fromText && next.sourceIssues?.length && !next.suggestions.some(item => ["context", "industry", "organizationType"].includes(item.field))) setPasteOpen(true);
      const chosen = emptyOrganizationSuggestions(next.suggestions, latest.current.values);
      // Clear before applying: the autofilled name/links must not invalidate their own result.
      controller.current = null;
      latest.current.onApply(chosen, next.fetchedAt);
      const pictureAdded = Boolean(next.photo && latest.current.onPhoto && !latest.current.hasPhoto && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(next.photo.dataUrl) && next.photo.dataUrl.length <= 1_000_000);
      if (pictureAdded) latest.current.onPhoto!(next.photo!.dataUrl);
      setResult({ ...next, suggestions: chosen });
      setNotice(chosen.length || pictureAdded ? `${chosen.length} ${chosen.length === 1 ? "field" : "fields"} filled.${pictureAdded ? " Organization picture added." : ""} Review the details, then Save.` : next.suggestions.length ? "No additional fields could be filled. Your existing details were kept." : next.message);
    } catch (error) {
      if (!request.signal.aborted) setNotice(error instanceof Error ? error.message : "Autofill could not finish. Your draft is still here.");
    } finally {
      if (!request.signal.aborted) { controller.current = null; setBusy(false); }
    }
  }
  return <>
    <button type="button" className="people-organization-autofill-button" aria-label="Autofill organization from links" aria-busy={busy}
      title={urls.length ? "Autofill organization from links" : "Enter a website or social link to enable autofill"}
      disabled={disabled || busy || !urls.length} onClick={() => void autofill()}>
      <UnigentamosIcon role="sparkles" size={17} />
    </button>
    {(busy || notice || result) && <div className="people-autofill-feedback">
      <p role="status" aria-live="polite">{busy ? "Finding connected links and organization details…" : notice}</p>
      {result && <details className="people-autofill-sources">
        <summary>Autofill sources</summary>
        <p>{result.message}</p>
        {result.sourceIssues?.map((issue, index) => <p key={`${issue.sourceUrl}-${index}`}><a href={issue.sourceUrl} target="_blank" rel="noopener noreferrer">Open source</a>: {issue.reason}</p>)}
        {result.photo && <p>Picture: <a href={result.photo.sourceUrl} target="_blank" rel="noopener noreferrer">{result.photo.sourceKind === "website" ? "Organization website" : result.photo.sourceKind === "instagram" ? "Instagram profile" : "LinkedIn organization profile"}</a>. Fitted to a square with the full artwork visible.</p>}
        {onPhoto && !hasPhoto && !result.photo && <p>No suitable public logo was available. You can add a picture yourself.</p>}
        {result.suggestions.length > 0 && <ul>{result.suggestions.map((item) => <li key={item.field}>
          <strong>{ORGANIZATION_AUTOFILL_LABELS[item.field]}</strong>: {item.value}
          <small>{item.evidence}. <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a></small>
        </li>)}</ul>}
      </details>}
      {urls.length > 0 && !busy && <div className="people-profile-text-import">
        <button type="button" className="people-profile-text-toggle" aria-expanded={pasteOpen} aria-controls={pasteId} onClick={() => setPasteOpen(current => !current)}>Paste organization text</button>
        {pasteOpen && <div id={pasteId} className="people-profile-text-panel">
          <p>If the site restricts previews, <a href={pasteSource} target="_blank" rel="noopener noreferrer">open the source</a> and copy the organization's name and About or bio.</p>
          <label htmlFor={`${pasteId}-text`}>Profile text for {name || "this organization"}</label>
          <textarea id={`${pasteId}-text`} rows={5} maxLength={12000} value={profileText} onChange={event => setProfileText(event.target.value)} placeholder={`${name}\nAbout\n…`} />
          <p>Used only to suggest missing fields. Your existing details stay in place until Save.</p>
          <button type="button" className="people-profile-text-apply" disabled={disabled || busy || !name.trim() || !profileText.trim()} onClick={() => void autofill(true)}>Fill from pasted text</button>
        </div>}
      </div>}
    </div>}
  </>;
}
