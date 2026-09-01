"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createResourcesRepository } from "../../lib/modules/resources/repository";
import type { ResourceRecord } from "../../lib/modules/resources/types";
import PersonalOpsIcon from "../personal-ops/PersonalOpsIcon";
import { ResourceIconButton } from "./ResourceVisual";
import styles from "./ResourceExperience.module.css";

function formatDate(value?: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function cadenceLabel(value?: string) {
  const normalized = value?.toUpperCase();
  if (normalized === "P1W") return "Weekly";
  if (normalized === "P1M") return "Monthly";
  if (normalized === "P3M") return "Quarterly";
  if (normalized === "P6M") return "Every six months";
  if (normalized === "P1Y") return "Yearly";
  return "No cadence";
}

export default function ResourceOverviewView({ resource, followUpPanel, onSaved }: { resource: ResourceRecord; followUpPanel?: ReactNode; onSaved: (resource: ResourceRecord) => void }) {
  const [notes, setNotes] = useState(resource.notes);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => { setNotes(resource.notes); setDraft(""); setAdding(false); setFeedback(""); }, [resource.id, resource.notes]);

  async function persistNotes(next: string[]) {
    if (busy) return;
    setBusy(true);
    const result = await createResourcesRepository().update(resource.id, { notes: next, expectedUpdatedAt: resource.updatedAt });
    setBusy(false);
    if (!result.ok) return setFeedback(result.error.message);
    setNotes(result.data.notes);
    setDraft("");
    setAdding(false);
    setFeedback("");
    onSaved(result.data);
  }

  async function markReviewed() {
    if (busy) return;
    setBusy(true);
    const result = await createResourcesRepository().update(resource.id, { action: "review", expectedUpdatedAt: resource.updatedAt });
    setBusy(false);
    if (!result.ok) return setFeedback(result.error.message);
    onSaved(result.data);
  }

  return (
    <div className={styles.overview}>
      {feedback ? <p className={styles.feedback} data-error="true" role="status">{feedback}</p> : null}
      <div className={styles.overviewHero}>
        <section className={styles.summaryCard}>
          <h2>{resource.title}</h2>
          <p>{resource.body || resource.metadata.description || "No description yet."}</p>
          {resource.source.canonicalUrl ? <a className={styles.urlLink} href={resource.source.canonicalUrl} target="_blank" rel="noreferrer"><PersonalOpsIcon name="open" /><span>{resource.source.canonicalUrl}</span></a> : null}
          <div className={styles.scoreRow}>
            <div className={styles.score}><span>Usefulness</span><strong>{resource.usefulness}<small>/10</small></strong><div className={styles.scoreTrack}><i style={{ width: `${resource.usefulness * 10}%` }} /></div></div>
            <div className={styles.score}><span>Trust</span><strong>{resource.trust}<small>/10</small></strong><div className={styles.scoreTrack}><i style={{ width: `${resource.trust * 10}%` }} /></div></div>
          </div>
        </section>

        <section className={styles.reviewCard}>
          <header><h3>Review</h3><ResourceIconButton icon="review" label="Mark reviewed" disabled={busy} onClick={() => void markReviewed()} /></header>
          <dl>
            <div><dt>Last</dt><dd>{formatDate(resource.review.lastReviewedAt)}</dd></div>
            <div><dt>Cadence</dt><dd>{cadenceLabel(resource.provenance.time.reviewCadence)}</dd></div>
            <div><dt>Next</dt><dd>{formatDate(resource.review.nextReviewAt)}</dd></div>
          </dl>
        </section>
      </div>

      <section className={styles.notesCard}>
        <header><h3>Notes <span>{notes.length}</span></h3><ResourceIconButton icon="plus" label="Add note" onClick={() => setAdding(true)} /></header>
        {notes.length ? <ul className={styles.notesList}>{notes.map((note, index) => <li className={styles.noteRow} key={`${note}-${index}`}><i className={styles.noteDot} /><span>{note}</span><ResourceIconButton icon="delete" label="Delete note" destructive disabled={busy} onClick={() => void persistNotes(notes.filter((_, itemIndex) => itemIndex !== index))} /></li>)}</ul> : <p className={styles.empty}>No notes</p>}
        {adding ? <div className={styles.editBar}><label className={`${styles.field} ${styles.wide}`}><span className="sr-only">New note</span><input autoFocus value={draft} placeholder="Add a note" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && draft.trim()) void persistNotes([...notes, draft.trim()]); if (event.key === "Escape") setAdding(false); }} /></label><div className={styles.editActions}><button type="button" className={styles.secondaryButton} onClick={() => { setDraft(""); setAdding(false); }}>Cancel</button><button type="button" className={styles.primaryButton} disabled={!draft.trim() || busy} onClick={() => void persistNotes([...notes, draft.trim()])}>Add</button></div></div> : null}
      </section>
      {followUpPanel}
    </div>
  );
}
