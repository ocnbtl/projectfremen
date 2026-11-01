"use client";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  NOTE_LINK_RELATIONSHIPS,
  noteLinkTargetKey,
  sameNoteLinkTarget,
  type NoteLink,
  type NoteLinkCreateInput,
  type NoteLinkPatch,
  type NoteLinksState,
  type NoteLinkRelationship
} from "../../lib/modules/notes/links-types";
import type { MutationResult } from "../../lib/native-objects/mutation-result";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import SystemState from "../operational/SystemState";
import styles from "./NoteLinksManager.module.css";

type MutationPayload = { item: NoteLink; state: NoteLinksState; created?: boolean };
type Candidate = { target: NativeObjectRef; reason: string };
type PendingConfirmation = { kind: "remove"; link: NoteLink } | null;

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
  }).format(date);
}

export default function NoteLinksManager({
  noteRef,
  state,
  loading,
  error,
  onRefresh,
  onCreate,
  onPatch,
  availableTargets,
  candidates,
  selectedLinkId,
  onSelectLink
}: {
  noteRef: NativeObjectRef;
  state: NoteLinksState;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onCreate: (input: NoteLinkCreateInput) => Promise<MutationResult<MutationPayload>>;
  onPatch: (
    id: string,
    expectedUpdatedAt: string,
    patch: NoteLinkPatch
  ) => Promise<MutationResult<MutationPayload>>;
  availableTargets: NativeObjectRef[];
  candidates: Candidate[];
  selectedLinkId: string;
  onSelectLink: (id: string) => void;
}) {
  const links = useMemo(
    () => state.links
      .filter((link) => sameNoteLinkTarget(link.noteRef, noteRef))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [noteRef, state.links]
  );
  const linkedTargetKeys = useMemo(
    () => new Set(links.filter((link) => link.state !== "removed").map((link) => noteLinkTargetKey(link.targetRef))),
    [links]
  );
  const promotableCandidates = useMemo(() => {
    const unique = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const key = noteLinkTargetKey(candidate.target);
      if (!linkedTargetKeys.has(key) && !unique.has(key)) unique.set(key, candidate);
    }
    return [...unique.values()];
  }, [candidates, linkedTargetKeys]);
  const selected = links.find((link) => link.id === selectedLinkId) || null;
  const [targetKey, setTargetKey] = useState("");
  const [createRelationship, setCreateRelationship] = useState<NoteLinkRelationship>("reference");
  const [createContextNote, setCreateContextNote] = useState("");
  const [editRelationship, setEditRelationship] = useState<NoteLinkRelationship>("reference");
  const [editContextNote, setEditContextNote] = useState("");
  const [reason, setReason] = useState("");
  const [repairTargetKey, setRepairTargetKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<PendingConfirmation>(null);

  const activeCount = links.filter((link) => link.state === "active").length;
  const attentionCount = links.filter((link) => link.state === "stale" || link.state === "broken").length;
  const removedCount = links.filter((link) => link.state === "removed").length;
  const chosenTarget = availableTargets.find((target) => noteLinkTargetKey(target) === targetKey) || null;
  const repairTarget = availableTargets.find((target) => noteLinkTargetKey(target) === repairTargetKey) || null;

  useEffect(() => {
    if (!selected) return;
    setEditRelationship(selected.relationship);
    setEditContextNote(selected.contextNote);
    setReason("");
    setRepairTargetKey("");
  }, [selected?.id]);

  async function createLink(target: NativeObjectRef, provenance: NoteLinkCreateInput["provenance"]) {
    setBusy(true);
    setMutationError("");
    setNotice("");
    const result = await onCreate({
      noteRef,
      targetRef: target,
      relationship: createRelationship,
      contextNote: createContextNote,
      provenance
    });
    setBusy(false);
    if (!result.ok) {
      setMutationError(`${result.error.message} Your target, relationship, and context were preserved.`);
      return;
    }
    onSelectLink(result.data.item.id);
    setNotice(result.data.created ? "NoteLink created and audited." : "The exact NoteLink already existed; no duplicate was created.");
    if (result.data.created) {
      setTargetKey("");
      setCreateContextNote("");
    }
  }

  async function patchSelected(change: NoteLinkPatch, success: string) {
    if (!selected) return;
    setBusy(true);
    setMutationError("");
    setNotice("");
    const result = await onPatch(selected.id, selected.updatedAt, change);
    setBusy(false);
    if (!result.ok) {
      setMutationError(`${result.error.message} Your explanation and selected target were preserved.`);
      return;
    }
    onSelectLink(result.data.item.id);
    setNotice(success);
    setReason("");
    setRepairTargetKey("");
  }

  return (
    <section className={styles.manager} data-note-links-manager={noteRef.objectId}>
      <header className={styles.managerHeader}>
        <div>

          <h2><UnigentamosIcon role="link" size={18}/>Linked objects <small>{activeCount}</small></h2>
          <p>Keep related people, events, work, and files together.</p>
        </div>
        <button type="button" aria-label="Refresh links" title="Refresh links" className={styles.secondaryButton} onClick={onRefresh} disabled={loading || busy}>
          <UnigentamosIcon role="calendar-group-refresh" size={17}/>
        </button>
      </header>

      <div className={styles.metrics} aria-label="NoteLink lifecycle summary">

        {attentionCount>0&&<span data-tone="attention"><strong>{attentionCount}</strong> Need attention</span>}
        {removedCount>0&&<span><strong>{removedCount}</strong> Removed</span>}

      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {mutationError && <p className={styles.error} role="alert">{mutationError}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      <div className={styles.workspace} data-selected={Boolean(selected)}>
        <div className={styles.directory}>
          {links.length ? (
            <ul className={styles.linkList} aria-label="Persisted NoteLinks">
              {links.map((link) => (
                <li key={link.id}>
                  <button
                    type="button"
                    className={styles.linkRow}
                    data-selected={selected?.id === link.id || undefined}
                    data-note-link-id={link.id}
                    data-note-link-state={link.state}
                    onClick={() => onSelectLink(link.id)}
                  >
                    <span className={styles.linkIdentity}>
                      <strong>{link.targetRef.label}</strong>
                      <small>{label(link.targetRef.module)} - {label(link.relationship)}</small>
                    </span>
                    <span className={styles.state} data-state={link.state}>{label(link.state)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <SystemState
              compact
              variant={error ? "error" : "empty"}
              title={error ? "NoteLinks could not be refreshed" : "No linked objects"}
              description={error || "Promote an exact candidate or choose a current Resource or Media target."}
            />
          )}

          <details className={styles.createDisclosure}><summary><UnigentamosIcon role="plus" size={16}/>Link an object</summary>
          <form
            className={styles.createForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (chosenTarget) void createLink(chosenTarget, "manual");
            }}
          >
            <div className={styles.formHeading}>


            </div>
            <label>Target
              <SelectField searchable value={targetKey} onChange={(event) => setTargetKey(event.target.value)} disabled={busy} required>
                <option value="">Search or choose an object</option>
                {availableTargets.map((target) => (
                  <option key={noteLinkTargetKey(target)} value={noteLinkTargetKey(target)}>
                    {label(target.module)} - {target.label}
                  </option>
                ))}
              </SelectField>
            </label>
            <label>Relationship
              <SelectField value={createRelationship} onChange={(event) => setCreateRelationship(event.target.value as NoteLinkRelationship)} disabled={busy}>
                {NOTE_LINK_RELATIONSHIPS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
              </SelectField>
            </label>
            <label>Context (optional)
              <textarea value={createContextNote} onChange={(event) => setCreateContextNote(event.target.value)} maxLength={4000} disabled={busy} placeholder="Why this source or file matters to the Note." />
              <small>{createContextNote.length}/4000</small>
            </label>
            <button type="submit" className={styles.primaryButton} disabled={busy || !chosenTarget}><UnigentamosIcon role="link" size={16}/>Link object</button>
          </form></details>

          {promotableCandidates.length > 0 && (
            <div className={styles.candidates}>
              <div className={styles.formHeading}><strong>Exact legacy candidates</strong><span>Explicit promotion only</span></div>
              <ul>
                {promotableCandidates.map((candidate) => (
                  <li key={noteLinkTargetKey(candidate.target)}>
                    <span><strong>{candidate.target.label}</strong><small>{candidate.reason}</small></span>
                    <button type="button" disabled={busy} onClick={() => void createLink(candidate.target, "legacy_candidate_promotion")}>Promote</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className={styles.inspector} aria-label="Selected NoteLink inspector">
          {selected ? (
            <>
              <div className={styles.inspectorHeader}>
                <span className={styles.state} data-state={selected.state}>{label(selected.state)}</span>
                <h3>{selected.targetRef.label}</h3>
                <p>{label(selected.targetRef.module)} owns the target. Notes owns this relationship.</p>
              </div>
              <dl className={styles.facts}>
                <div><dt>Relationship</dt><dd>{label(selected.relationship)}</dd></div>
                <div><dt>Provenance</dt><dd>{label(selected.provenance)}</dd></div>
                <div><dt>Updated</dt><dd>{formatTime(selected.updatedAt)}</dd></div>
                <div><dt>Link ID</dt><dd>{selected.id}</dd></div>
              </dl>
              {selected.contextNote && <p className={styles.context}>{selected.contextNote}</p>}
              {selected.healthNote && <p className={styles.health}><strong>{label(selected.state)}:</strong> {selected.healthNote}</p>}
              {selected.lastRepair && (
                <div className={styles.history}>
                  <strong>Last repair</strong>
                  <span>{selected.lastRepair.previousTargetRef.label} - {selected.lastRepair.reason}</span>
                </div>
              )}
              <Link className={styles.ownerButton} href={selected.targetRef.route}>Open profile</Link>

              {selected.state !== "removed" ? (
                <>
                  <form className={styles.actionForm} onSubmit={(event) => {
                    event.preventDefault();
                    void patchSelected({ action: "change_relationship", relationship: editRelationship, contextNote: editContextNote }, "Relationship and context updated.");
                  }}>
                    <strong>Edit relationship</strong>
                    <label>Relationship
                      <SelectField value={editRelationship} onChange={(event) => setEditRelationship(event.target.value as NoteLinkRelationship)} disabled={busy}>
                        {NOTE_LINK_RELATIONSHIPS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
                      </SelectField>
                    </label>
                    <label>Context
                      <textarea value={editContextNote} onChange={(event) => setEditContextNote(event.target.value)} maxLength={4000} disabled={busy} />
                    </label>
                    <button type="submit" disabled={busy}>Save relationship</button>
                  </form>

                  <form className={styles.actionForm} onSubmit={(event) => {
                    event.preventDefault();
                    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                    const nextState = submitter?.value === "broken" ? "broken" : "stale";
                    void patchSelected({ action: "update_health", state: nextState, reason }, `Link reported ${nextState}.`);
                  }}>
                    <strong>Report a health issue</strong>
                    <label>Required explanation
                      <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={4000} required disabled={busy} placeholder="What was checked, and why is the target stale or broken?" />
                    </label>
                    <div className={styles.inlineActions}>
                      <button type="submit" value="stale" disabled={busy || !reason.trim()}>Report stale</button>
                      <button type="submit" value="broken" disabled={busy || !reason.trim()}>Report broken</button>
                    </div>
                  </form>

                  {(selected.state === "stale" || selected.state === "broken") && (
                    <form className={styles.actionForm} onSubmit={(event) => {
                      event.preventDefault();
                      if (repairTarget) void patchSelected({ action: "repair", targetRef: repairTarget, reason }, "NoteLink repaired with previous target retained in audit history.");
                    }}>
                      <strong>Repair or relink</strong>
                      <label>Verified target
                        <SelectField value={repairTargetKey} onChange={(event) => setRepairTargetKey(event.target.value)} required disabled={busy}>
                          <option value="">Choose a verified current target</option>
                          {availableTargets.map((target) => <option key={noteLinkTargetKey(target)} value={noteLinkTargetKey(target)}>{label(target.module)} - {target.label}</option>)}
                        </SelectField>
                      </label>
                      <label>Repair explanation
                        <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={4000} required disabled={busy} />
                      </label>
                      <button type="submit" disabled={busy || !repairTarget || !reason.trim()}>Confirm repair</button>
                    </form>
                  )}

                  <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => setConfirmation({ kind: "remove", link: selected })}>Remove relationship</button>
                </>
              ) : (
                <div className={styles.restoreBlock}>
                  <p>This relationship is soft-removed. Neither object was deleted.</p>
                  {selected.removalReason && <p><strong>Reason:</strong> {selected.removalReason}</p>}
                  <button type="button" disabled={busy} onClick={() => void patchSelected({ action: "restore" }, "NoteLink restored with history intact.")}>Restore NoteLink</button>
                </div>
              )}
            </>
          ) : (
            <SystemState compact variant="empty" title="Select a NoteLink" description="The inspector keeps relationship state, repair history, and owner navigation together." />
          )}
        </aside>
      </div>

      <p className={styles.boundary}>
        Removing a link keeps both records.
      </p>

      <ConfirmationSheet
        open={Boolean(confirmation)}
        onOpenChange={(open) => { if (!open) setConfirmation(null); }}
        onConfirm={async () => {
          if (!confirmation) return;
          await patchSelected({ action: "remove", reason }, "NoteLink removed. Both native objects and the audit history were preserved.");
          setConfirmation(null);
        }}
        title="Remove this NoteLink?"
        description="Only the Notes-owned relationship will be soft-removed. The Note and target remain unchanged."
        consequences={["The row remains visible as removed history.", "You can restore it later without creating a duplicate."]}
        confirmLabel="Remove relationship"
        tone="danger"
        busy={busy}
        confirmDisabled={!reason.trim()}
        confirmDisabledReason={!reason.trim() ? "A removal reason is required." : undefined}
      >
        <label className={styles.confirmReason}>Removal reason
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={4000} required placeholder="Why should this relationship no longer be active?" />
          <small>{reason.length}/4000 - preserved if removal fails</small>
        </label>
      </ConfirmationSheet>
    </section>
  );
}
