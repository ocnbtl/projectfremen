"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPersonalOpsRepository } from "../../lib/modules/personal-ops/repository";
import type {
  DecisionReversibility,
  DecisionRisk,
  PersonalOpsDecision,
  PersonalOpsLegacyMapping
} from "../../lib/modules/personal-ops/types";
import type { NoteRecord } from "../../lib/modules/notes/types";
import { getModuleViewRoute, getNativeObjectRoute } from "../../lib/native-objects/routes";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import MetricStrip from "../operational/MetricStrip";
import QuickActionBar from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import styles from "./NoteDecisionsView.module.css";

type NoteDecisionsViewProps = {
  note: NoteRecord;
  decisions: PersonalOpsDecision[];
  mappings: PersonalOpsLegacyMapping[];
  loadError?: string;
  onConverted: (decision: PersonalOpsDecision, mapping?: PersonalOpsLegacyMapping) => void;
};

type DecisionDraft = {
  title: string;
  question: string;
  outcome: string;
  rationale: string;
  reviewDate: string;
  reversibility: DecisionReversibility;
  risk: DecisionRisk;
};

type ReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  complete: boolean;
};

const CONVERSION_KEY = "decisions-native-v1";

function cleanLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  }).format(date);
}

function dateInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function reviewDateIso(value: string) {
  return value ? new Date(`${value}T12:00:00.000Z`).toISOString() : undefined;
}

function sourceExcerpt(note: NoteRecord) {
  const body = note.body.replace(/\s+/g, " ").trim();
  if (!body) return "";
  return body.length > 360 ? `${body.slice(0, 357)}…` : body;
}

function draftFor(note: NoteRecord): DecisionDraft {
  return {
    title: note.title,
    question: `What should be decided from ${note.title}?`,
    outcome: "",
    rationale: "",
    reviewDate: dateInputValue(note.nextReviewAt),
    reversibility: "unknown",
    risk: "unknown"
  };
}

function referencesNote(decision: PersonalOpsDecision, note: NoteRecord) {
  return decision.sourceRefs.some(
    (reference) =>
      reference.module === "notes" &&
      reference.objectId === note.id &&
      (reference.objectType === "note" || reference.objectType === "decision_candidate")
  );
}

export default function NoteDecisionsView({
  note,
  decisions,
  mappings,
  loadError = "",
  onConverted
}: NoteDecisionsViewProps) {
  const repository = useMemo(() => createPersonalOpsRepository(), []);
  const [draft, setDraft] = useState<DecisionDraft>(() => draftFor(note));
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setDraft(draftFor(note));
    setConfirmationOpen(false);
    setBusy(false);
    setError("");
    setNotice("");
  }, [note.id]);

  const decisionMappings = useMemo(
    () => mappings.filter(
      (mapping) =>
        mapping.family === "decisions" &&
        mapping.legacyPersonalRecordId === note.provenance.recordId
    ),
    [mappings, note.provenance.recordId]
  );
  const mappedIds = useMemo(
    () => new Set(decisionMappings.map((mapping) => mapping.nativeRef.objectId)),
    [decisionMappings]
  );
  const linkedDecisions = useMemo(
    () => decisions.filter(
      (decision) => mappedIds.has(decision.id) || referencesNote(decision, note)
    ),
    [decisions, mappedIds, note]
  );
  const primaryMapping = decisionMappings[0];
  const primaryDecision =
    linkedDecisions.find((decision) => decision.id === primaryMapping?.nativeRef.objectId) ||
    linkedDecisions[0];
  const brokenMapping = Boolean(primaryMapping && !primaryDecision);
  const excerpt = sourceExcerpt(note);
  const provenanceReady = Boolean(
    note.provenance.recordId &&
    note.createdAt &&
    note.updatedAt &&
    excerpt
  );
  const candidateOpen = note.type === "decision" && !primaryDecision && !brokenMapping;

  const readiness = useMemo<ReadinessCheck[]>(
    () => [
      {
        id: "title",
        label: "Decision title",
        detail: draft.title.trim() ? "A durable title is ready." : "Add a title.",
        complete: Boolean(draft.title.trim())
      },
      {
        id: "question",
        label: "Decision question",
        detail: draft.question.trim() ? "The question to resolve is explicit." : "State the question this Decision should resolve.",
        complete: Boolean(draft.question.trim())
      },
      {
        id: "outcome",
        label: "Proposed outcome",
        detail: draft.outcome.trim() ? "The proposed outcome will remain open for review in Personal Ops." : "Add the current recommendation or outcome.",
        complete: Boolean(draft.outcome.trim())
      },
      {
        id: "rationale",
        label: "Rationale",
        detail: draft.rationale.trim() ? "The reason for the proposal is recorded." : "Explain why this outcome is appropriate.",
        complete: Boolean(draft.rationale.trim())
      },
      {
        id: "reversibility",
        label: "Reversibility",
        detail: draft.reversibility === "unknown" ? "Choose how difficult this Decision is to reverse." : cleanLabel(draft.reversibility),
        complete: draft.reversibility !== "unknown"
      },
      {
        id: "risk",
        label: "Risk",
        detail: draft.risk === "unknown" ? "Choose a risk level supported by the native Decision model." : cleanLabel(draft.risk),
        complete: draft.risk !== "unknown"
      },
      {
        id: "provenance",
        label: "Source provenance",
        detail: provenanceReady
          ? `Source Note ${note.provenance.recordId} and excerpt fallback are preserved.`
          : "The source Note needs an ID, timestamps, and body excerpt before filing.",
        complete: provenanceReady
      }
    ],
    [draft, note.provenance.recordId, provenanceReady]
  );
  const blockers = readiness.filter((check) => !check.complete);
  const canFile =
    candidateOpen &&
    !loadError &&
    !busy &&
    blockers.length === 0;
  const personalOpsDecisionsRoute = getModuleViewRoute("personal_ops", "decisions");
  const primaryDecisionRoute = primaryDecision
    ? getNativeObjectRoute({
        module: "personal_ops",
        objectType: "decision",
        objectId: primaryDecision.id
      })
    : personalOpsDecisionsRoute;

  function explainUnavailable(message: string) {
    setError("");
    setNotice(message);
  }

  function requestConversion() {
    setError("");
    setNotice("");
    if (!candidateOpen) return;
    if (loadError) {
      setError("Personal Ops ownership could not be checked. Filing is blocked to prevent a duplicate Decision.");
      return;
    }
    if (blockers.length) {
      setError(`Resolve ${blockers.length} readiness ${blockers.length === 1 ? "item" : "items"} before filing.`);
      return;
    }
    setConfirmationOpen(true);
  }

  async function confirmConversion() {
    if (!canFile) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await repository.create("decisions", {
      title: draft.title.trim(),
      question: draft.question.trim(),
      description: excerpt,
      domain: note.provenance.domain || "Personal Admin",
      lifecycle: "active",
      health: "unknown",
      review: "not_reviewed",
      priority: "medium",
      owner: "You",
      dueAt: reviewDateIso(draft.reviewDate),
      decisionState: "open",
      finalDecision: draft.outcome.trim(),
      rationale: draft.rationale.trim(),
      reversibility: draft.reversibility,
      risk: draft.risk,
      legacySource: {
        record: {
          id: note.provenance.recordId,
          domain: note.provenance.domain,
          className: note.provenance.className,
          status: note.provenance.status,
          title: note.title,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt
        },
        conversionConfirmed: true,
        conversionKey: CONVERSION_KEY
      }
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onConverted(result.data.item, result.data.mapping);
    setConfirmationOpen(false);
    setNotice(
      result.data.created
        ? "Decision filed in Personal Ops. The source Note body was not changed."
        : "The existing Personal Ops conversion was reopened; no duplicate was created."
    );
  }

  if (note.type !== "decision") {
    return (
      <div className={styles.surface}>
        <SystemState
          variant="read_only"
          title="No Note-owned decision candidate"
          description="This Note is not classified as a legacy decision candidate. You can open a new Personal Ops Decision with this Note as source context, but Notes will not relabel the Note or invent a candidate."
        />
        <section className={styles.boundary}>
          <strong>Object boundary</strong>
          <span>Notes keeps the authored source. Personal Ops owns any durable Decision created from it.</span>
          <Link href={personalOpsDecisionsRoute}>Open Personal Ops Decisions</Link>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.surface}>
      <section className={styles.summary} aria-labelledby={`note-decision-summary-${note.id}`}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Decision summary</span>
            <h2 id={`note-decision-summary-${note.id}`}>Candidate and output state</h2>
          </div>
          <QuickActionBar
            actions={[
              {
                id: "file",
                label: primaryDecision ? "Open Decision" : "File Decision",
                ...(primaryDecision
                  ? { href: primaryDecisionRoute }
                  : {
                      onClick: requestConversion,
                      intent: "primary" as const,
                      disabled: Boolean(loadError || brokenMapping),
                      disabledReason: loadError
                        ? "Personal Ops ownership could not be checked, so filing is blocked to prevent duplicates."
                        : brokenMapping
                          ? "The existing mapping must be repaired before another Decision can be filed."
                          : undefined
                    })
              },
              {
                id: "selection",
                label: "Convert selection",
                disabled: true,
                disabledReason: "The legacy Note body has no versioned nodes or stable selection anchors."
              },
              {
                id: "follow-up",
                label: "Create Follow-up",
                disabled: true,
                disabledReason: "Follow-up creation from a Note candidate needs a separate explicit Personal Ops preview."
              },
              {
                id: "review",
                label: "Attach to Review",
                disabled: true,
                disabledReason: "Native Review context-link persistence is not connected."
              }
            ]}
          />
        </div>
        <MetricStrip
          ariaLabel="Decision candidate summary"
          items={[
            { id: "candidates", label: "Open candidates", value: candidateOpen ? 1 : 0, tone: candidateOpen ? "attention" : "positive" },
            { id: "decisions", label: "Durable Decisions", value: linkedDecisions.length, tone: linkedDecisions.length ? "positive" : "default" },
            { id: "follow-ups", label: "Follow-ups", value: "—", detail: "Not connected" },
            { id: "projects", label: "Project items", value: "—", detail: "Not connected" },
            { id: "reviews", label: "Review items", value: "—", detail: "Not connected" },
            { id: "provenance", label: "Provenance", value: provenanceReady ? "Ready" : "Open", tone: provenanceReady ? "positive" : "danger" },
            { id: "blockers", label: "Filing blockers", value: primaryDecision ? 0 : blockers.length, tone: blockers.length && !primaryDecision ? "danger" : "positive" }
          ]}
        />
      </section>

      {loadError && (
        <SystemState
          variant="error"
          title="Personal Ops ownership check unavailable"
          description={`${loadError} The candidate remains readable, but filing is blocked so a duplicate native Decision cannot be created.`}
        />
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      <div className={styles.twoColumn}>
        <section className={styles.panel} aria-labelledby={`candidate-queue-${note.id}`}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 id={`candidate-queue-${note.id}`}>Decision candidate queue</h2>
              <p>Grouped by output type</p>
            </div>
            <span className={styles.count}>{candidateOpen ? 1 : 0}</span>
          </div>
          {candidateOpen ? (
            <div className={styles.candidateRow} data-selected="true">
              <span className={styles.initial} aria-hidden="true">D</span>
              <span>
                <strong>{note.title}</strong>
                <small>Personal Ops / Decisions · source Note preserved</small>
              </span>
              <span className={styles.state} data-tone={blockers.length ? "attention" : "ready"}>
                {blockers.length ? `${blockers.length} open` : "Ready"}
              </span>
              <button type="button" onClick={requestConversion}>File</button>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <strong>{brokenMapping ? "Mapped Decision is missing" : "Candidate resolved"}</strong>
              <span>
                {brokenMapping
                  ? "The audit mapping remains visible, but its target Decision could not be found."
                  : "A durable Personal Ops Decision now represents this candidate."}
              </span>
            </div>
          )}
          {brokenMapping && (
            <div className={styles.brokenLink} role="status">
              <strong>Broken native link</strong>
              <span>Mapping {primaryMapping?.id} points to {primaryMapping?.nativeRef.objectId}.</span>
              <div>
                <Link href={personalOpsDecisionsRoute}>Open Decisions</Link>
                <button
                  type="button"
                  aria-disabled="true"
                  onClick={() => explainUnavailable("Relinking is unavailable until Personal Ops can validate and audit a replacement target.")}
                >
                  Repair unavailable
                </button>
              </div>
            </div>
          )}
        </section>

        <section className={styles.panel} aria-labelledby={`candidate-source-${note.id}`}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 id={`candidate-source-${note.id}`}>Source / provenance</h2>
              <p>Selected candidate</p>
            </div>
            <span className={styles.state} data-tone={provenanceReady ? "ready" : "attention"}>
              {provenanceReady ? "Ready" : "Needs context"}
            </span>
          </div>
          <dl className={styles.facts}>
            <div><dt>Source Note</dt><dd>{note.title}</dd></div>
            <div><dt>Legacy record</dt><dd>{note.provenance.recordId}</dd></div>
            <div><dt>Source revision</dt><dd>{formatDate(note.updatedAt)}</dd></div>
            <div><dt>Stable node</dt><dd>Unavailable</dd></div>
          </dl>
          <div className={styles.excerpt}>
            <span>Source excerpt fallback</span>
            <p>{excerpt || "No source excerpt is available."}</p>
          </div>
          <div className={styles.boundary}>
            <strong>Original Note preserved: yes</strong>
            <span>The conversion stores a source reference and mapping. It does not rewrite, archive, or delete the Note.</span>
          </div>
        </section>
      </div>

      {primaryDecision ? (
        <section className={styles.panel} aria-labelledby={`filed-decision-${note.id}`}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Existing structured Decision</span>
              <h2 id={`filed-decision-${note.id}`}>Filed in Personal Ops</h2>
            </div>
            <span className={styles.state} data-tone="ready">{cleanLabel(primaryDecision.decisionState)}</span>
          </div>
          <div className={styles.decisionCard}>
            <div>
              <strong>{primaryDecision.title}</strong>
              <p>{primaryDecision.question}</p>
            </div>
            <dl className={styles.facts}>
              <div><dt>Decision state</dt><dd>{cleanLabel(primaryDecision.decisionState)}</dd></div>
              <div><dt>Lifecycle</dt><dd>{cleanLabel(primaryDecision.lifecycle)}</dd></div>
              <div><dt>Owner</dt><dd>{primaryDecision.owner}</dd></div>
              <div><dt>Filed</dt><dd>{formatDate(primaryDecision.createdAt)}</dd></div>
            </dl>
            {primaryDecision.finalDecision && (
              <div className={styles.excerpt}>
                <span>Outcome / recommendation</span>
                <p>{primaryDecision.finalDecision}</p>
              </div>
            )}
            <Link className={styles.primaryLink} href={primaryDecisionRoute}>
              Open durable Decision
            </Link>
          </div>
        </section>
      ) : (
        <section className={styles.panel} aria-labelledby={`decision-builder-${note.id}`}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Structured decision builder</span>
              <h2 id={`decision-builder-${note.id}`}>Prepare the durable Decision</h2>
            </div>
            <span className={styles.state} data-tone={blockers.length ? "attention" : "ready"}>
              {blockers.length ? "Draft" : "Ready to file"}
            </span>
          </div>
          <form
            className={styles.builder}
            onSubmit={(event) => {
              event.preventDefault();
              requestConversion();
            }}
          >
            <label>
              Decision title
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                required
              />
            </label>
            <label>
              Decision question
              <textarea
                value={draft.question}
                onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
                required
              />
            </label>
            <label className={styles.wideField}>
              Proposed outcome / recommendation
              <textarea
                value={draft.outcome}
                onChange={(event) => setDraft((current) => ({ ...current, outcome: event.target.value }))}
                placeholder="What is the current recommended outcome?"
                required
              />
            </label>
            <label className={styles.wideField}>
              Rationale
              <textarea
                value={draft.rationale}
                onChange={(event) => setDraft((current) => ({ ...current, rationale: event.target.value }))}
                placeholder="Why does this outcome make sense?"
                required
              />
            </label>
            <label>
              Reversibility
              <select
                value={draft.reversibility}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  reversibility: event.target.value as DecisionReversibility
                }))}
                required
              >
                <option value="unknown">Choose…</option>
                <option value="reversible">Reversible</option>
                <option value="reversible_costly">Reversible, with cost</option>
                <option value="irreversible">Irreversible</option>
              </select>
            </label>
            <label>
              Risk
              <select
                value={draft.risk}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  risk: event.target.value as DecisionRisk
                }))}
                required
              >
                <option value="unknown">Choose…</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label>
              Owner
              <input value="You" readOnly />
            </label>
            <label>
              Review / due date
              <input
                type="date"
                value={draft.reviewDate}
                onChange={(event) => setDraft((current) => ({ ...current, reviewDate: event.target.value }))}
              />
            </label>
            <div className={styles.schemaBoundary}>
              <strong>Supported native fields</strong>
              <span>Confidence, impact, alternatives, and Review attachment are not stored by the current Decision schema, so this form does not pretend to save them.</span>
            </div>
            <div className={styles.formActions}>
              <button type="submit" className={styles.primaryButton} disabled={Boolean(loadError || brokenMapping || busy)}>
                {busy ? "Filing…" : "File Decision"}
              </button>
              <button
                type="button"
                aria-disabled="true"
                onClick={() => explainUnavailable("Candidate draft persistence is not available. Keep this tab open or file the ready Decision.")}
              >
                Save Draft unavailable
              </button>
            </div>
          </form>
        </section>
      )}

      {!primaryDecision && (
        <section className={styles.panel} aria-labelledby={`decision-readiness-${note.id}`}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 id={`decision-readiness-${note.id}`}>Filing readiness</h2>
              <p>Every check is explicit; no weighted readiness percentage is used.</p>
            </div>
            <strong>{readiness.length - blockers.length}/{readiness.length} ready</strong>
          </div>
          <ul className={styles.checklist}>
            {readiness.map((check) => (
              <li key={check.id} data-complete={check.complete || undefined}>
                <span aria-hidden="true">{check.complete ? "✓" : "!"}</span>
                <span>
                  <strong>{check.label}</strong>
                  <small>{check.detail}</small>
                </span>
                <span>{check.complete ? "Ready" : "Open"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.panel} aria-labelledby={`decision-outputs-${note.id}`}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 id={`decision-outputs-${note.id}`}>Outputs created from this Note</h2>
            <p>Only native outputs that reference this Note or its explicit conversion mapping appear here.</p>
          </div>
          <strong>{linkedDecisions.length}</strong>
        </div>
        {linkedDecisions.length ? (
          <ul className={styles.outputs}>
            {linkedDecisions.map((decision) => (
              <li key={decision.id}>
                <span>
                  <strong>{decision.title}</strong>
                  <small>Personal Ops Decision · {cleanLabel(decision.decisionState)}</small>
                </span>
                <Link href={getNativeObjectRoute({ module: "personal_ops", objectType: "decision", objectId: decision.id })}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyCopy}>No durable output has been filed from this candidate.</p>
        )}
      </section>

      <section className={styles.boundary}>
        <strong>Object boundary</strong>
        <span>Decision stores the structured question, proposed outcome, and rationale. The Note body remains intact; the conversion mapping preserves source provenance.</span>
      </section>

      <div className={styles.stickyActions} role="toolbar" aria-label="Decision conversion actions">
        {primaryDecision ? (
          <Link className={styles.primaryLink} href={primaryDecisionRoute}>Open Decision</Link>
        ) : (
          <button type="button" className={styles.primaryButton} onClick={requestConversion} disabled={Boolean(loadError || brokenMapping || busy)}>
            File Decision
          </button>
        )}
        <button
          type="button"
          aria-disabled="true"
          onClick={() => explainUnavailable("Follow-up creation requires a separate Personal Ops preview and confirmation.")}
        >
          Follow-up unavailable
        </button>
        <button
          type="button"
          aria-disabled="true"
          onClick={() => explainUnavailable("Review attachment requires native Review context-link persistence.")}
        >
          Review link unavailable
        </button>
      </div>

      <ConfirmationSheet
        open={confirmationOpen}
        onOpenChange={setConfirmationOpen}
        onConfirm={confirmConversion}
        title="File this durable Decision?"
        description="Personal Ops will become the owner of one structured Decision while Notes remains the owner of the source candidate."
        consequences={[
          "The source Note title, body, lifecycle, and review state remain unchanged.",
          "One Personal Ops Decision, one source mapping, and one audit event are created.",
          "Repeating this confirmed conversion key reopens the existing Decision instead of creating a duplicate.",
          "No Follow-up, Project item, or Review attachment is created automatically."
        ]}
        confirmLabel="File Decision"
        busy={busy}
        confirmDisabled={!canFile}
        confirmDisabledReason={!canFile ? "Resolve every filing blocker before confirming." : undefined}
        dismissible={!busy}
      >
        <dl className={styles.confirmationFacts}>
          <div><dt>Decision</dt><dd>{draft.title}</dd></div>
          <div><dt>Owner</dt><dd>Personal Ops</dd></div>
          <div><dt>Source</dt><dd>Note · {note.title}</dd></div>
          <div><dt>State</dt><dd>Open</dd></div>
        </dl>
      </ConfirmationSheet>
    </div>
  );
}
