"use client";

import { useEffect, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { PERSON_AUTOFILL_LABELS, personSeedUrls, type PersonAutofillResult, type PersonAutofillValues } from "../../lib/modules/people/person-autofill";
import UnigentamosIcon from "../icons/UnigentamosIcon";

export default function PersonAutofill({ name, values, onApply, disabled = false }: {
  name: string; values: PersonAutofillValues; onApply: (result: PersonAutofillResult) => void; disabled?: boolean;
}) {
  const [result, setResult] = useState<PersonAutofillResult | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const latest = useRef({ name, values, onApply }); latest.current = { name, values, onApply };
  const urls = personSeedUrls(values), sourceKey = JSON.stringify(urls);
  useEffect(() => {
    if (controller.current) {
      controller.current.abort(); controller.current = null; setBusy(false);
      setNotice("The name or links changed. Run autofill again when ready.");
    }
  }, [name, sourceKey, disabled]);
  useEffect(() => () => controller.current?.abort(), []);
  async function autofill() {
    const request = new AbortController(); controller.current?.abort(); controller.current = request;
    setBusy(true); setResult(null); setNotice("");
    try {
      const response = await fetch("/api/people/persons/autofill", { method: "POST", headers: buildJsonHeadersWithCsrf(), signal: request.signal, body: JSON.stringify({ name, urls }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !Array.isArray(payload.result?.suggestions) || !Array.isArray(payload.result?.occupations) || !Array.isArray(payload.result?.education)) throw new Error(payload.error || "Autofill could not finish. Your draft is still here.");
      if (request.signal.aborted) return;
      if (latest.current.name !== name || JSON.stringify(personSeedUrls(latest.current.values)) !== sourceKey) {
        setNotice("The name or links changed. Run autofill again when ready."); return;
      }
      const next = payload.result as PersonAutofillResult;
      controller.current = null;
      latest.current.onApply(next); setResult(next);
      setNotice(next.suggestions.length || next.occupations.length || next.education.length
        ? "Available details filled. Review, then Save to create or link employers and schools. Existing details were kept."
        : next.message);
    } catch (error) { if (!request.signal.aborted) setNotice(error instanceof Error ? error.message : "Autofill could not finish. Your draft is still here."); }
    finally { if (!request.signal.aborted) { controller.current = null; setBusy(false); } }
  }
  return <>
    <button type="button" className="people-organization-autofill-button" aria-label="Autofill person from links" aria-busy={busy}
      title={name.trim() && urls.length ? "Autofill person from links" : "Enter a name and a public profile link to enable autofill"}
      disabled={disabled || busy || !name.trim() || !urls.length} onClick={() => void autofill()}><UnigentamosIcon role="sparkles" size={17} /></button>
    {(busy || notice || result) && <div className="people-autofill-feedback">
      <p role="status" aria-live="polite">{busy ? "Finding public profile details, employers, and schools…" : notice}</p>
      {result && <details className="people-autofill-sources"><summary>Autofill sources</summary><p>{result.message}</p>
        <ul>{result.suggestions.map((item) => <li key={item.field}><strong>{PERSON_AUTOFILL_LABELS[item.field]}</strong>: {item.value}<small>{item.evidence}. <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a></small></li>)}
          {result.occupations.map((job, index) => <li key={`job-${index}`}><strong>{job.status === "past" ? "Past occupation" : "Occupation"}</strong>: {[job.title, job.employer].filter(Boolean).join(" · ")}<small>{job.evidence}. <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a></small></li>)}
          {result.education.map((school, index) => <li key={`school-${index}`}><strong>Education</strong>: {[school.institution, school.degree, school.fieldOfStudy].filter(Boolean).join(" · ")}<small>{school.evidence}. <a href={school.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a></small></li>)}
        </ul>
      </details>}
    </div>}
  </>;
}
