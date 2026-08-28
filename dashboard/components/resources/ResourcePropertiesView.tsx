"use client";

import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { createResourcesRepository } from "../../lib/modules/resources/repository";
import type { ResourceAutomationKind, ResourceGradient, ResourceLifecycleState, ResourceRecord, ResourceType } from "../../lib/modules/resources/types";
import PersonalOpsIcon from "../personal-ops/PersonalOpsIcon";
import { resourceGradientStyle } from "./ResourceVisual";
import styles from "./ResourceExperience.module.css";

const RESOURCE_TYPES: ReadonlyArray<[ResourceType, string]> = [
  ["article", "Article"], ["book", "Book"], ["contract_invoice", "Contract / Invoice"], ["dataset", "Dataset"],
  ["document", "Document"], ["external_account", "External account"], ["tool", "Tool"], ["vendor", "Vendor"],
  ["video_media", "Video / Media"], ["website", "Website"], ["unknown", "Unspecified"]
];
const LIFECYCLES: ReadonlyArray<[ResourceLifecycleState, string]> = [
  ["active", "Active"], ["unavailable", "Unavailable"], ["replaced", "Replaced"], ["merged", "Merged"],
  ["archived", "Archived"], ["unknown", "Unspecified"]
];
const CADENCES = [["NONE", "No cadence"], ["P1W", "Weekly"], ["P1M", "Monthly"], ["P3M", "Quarterly"], ["P6M", "Every six months"], ["P1Y", "Yearly"]] as const;
const PATTERNS: ResourceGradient["pattern"][] = ["aurora", "linear", "radial", "conic"];

type FormState = {
  title: string;
  url: string;
  type: ResourceType;
  lifecycle: ResourceLifecycleState;
  sourceDomain: string;
  cadence: string;
  nextReviewAt: string;
  usefulness: number;
  trust: number;
  gradient: ResourceGradient;
};

function formFor(resource: ResourceRecord): FormState {
  return {
    title: resource.title,
    url: resource.source.canonicalUrl || "",
    type: resource.type,
    lifecycle: resource.lifecycleState,
    sourceDomain: resource.source.displayDomain || "",
    cadence: resource.provenance.time.reviewCadence || "NONE",
    nextReviewAt: resource.review.nextReviewAt?.slice(0, 10) || "",
    usefulness: resource.usefulness,
    trust: resource.trust,
    gradient: resource.gradient
  };
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", withTime ? { dateStyle: "medium", timeStyle: "short" } : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function stateForCheck(value: string) {
  if (["ok", "redirected", "none", "success"].includes(value)) return "pass";
  if (["broken", "unreachable", "possible", "confirmed", "failed"].includes(value)) return "fail";
  return "idle";
}

function checkLabel(value: string, fallback: string) {
  if (["ok", "redirected", "none", "success"].includes(value)) return value === "none" ? "Clear" : "Passed";
  if (["broken", "unreachable", "possible", "confirmed", "failed"].includes(value)) return value === "possible" ? "Possible match" : "Needs attention";
  return fallback;
}

export default function ResourcePropertiesView({ resource, editRequest = 0, onSaved, onArchived }: {
  resource: ResourceRecord;
  editRequest?: number;
  onSaved: (resource: ResourceRecord) => void;
  onArchived: (resource: ResourceRecord) => void;
}) {
  const [form, setForm] = useState<FormState>(() => formFor(resource));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<ResourceAutomationKind | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const changed = useMemo(() => JSON.stringify(form) !== JSON.stringify(formFor(resource)), [form, resource]);

  useEffect(() => { setForm(formFor(resource)); setEditing(false); setFeedback(null); }, [resource.id]);
  useEffect(() => { if (editRequest > 0) setEditing(true); }, [editRequest]);

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  async function save() {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    setFeedback(null);
    const result = await createResourcesRepository().update(resource.id, {
      title: form.title, url: form.url, type: form.type, lifecycle: form.lifecycle, sourceDomain: form.sourceDomain,
      reviewCadence: form.cadence, nextReviewAt: form.nextReviewAt, usefulness: form.usefulness, trust: form.trust,
      gradient: form.gradient, expectedUpdatedAt: resource.updatedAt
    });
    setBusy(false);
    if (!result.ok) return setFeedback({ text: result.error.message, error: true });
    setForm(formFor(result.data));
    setEditing(false);
    setFeedback({ text: "Resource saved." });
    onSaved(result.data);
  }

  async function runAutomation(kind: ResourceAutomationKind) {
    if (running) return;
    setRunning(kind);
    setFeedback(null);
    const result = await createResourcesRepository().runAutomation(resource.id, kind);
    setRunning(null);
    if (!result.ok) return setFeedback({ text: result.error.message, error: true });
    onSaved(result.data.resource);
    setForm(formFor(result.data.resource));
    setFeedback({ text: result.data.run.message || "Automation finished.", error: result.data.run.status === "failed" });
  }

  async function archive() {
    if (busy || !window.confirm("Archive this resource? Its links and history will stay intact.")) return;
    setBusy(true);
    const result = await createResourcesRepository().update(resource.id, { action: "archive", archiveReason: "Archived from Resources", expectedUpdatedAt: resource.updatedAt });
    setBusy(false);
    if (!result.ok) return setFeedback({ text: result.error.message, error: true });
    onArchived(result.data);
  }

  function moveFocal(event: PointerEvent<HTMLDivElement>) {
    if (!editing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const focalX = Math.round(Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)));
    const focalY = Math.round(Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100)));
    update("gradient", { ...form.gradient, focalX, focalY });
  }

  function updateColor(index: number, color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    update("gradient", { ...form.gradient, colors: form.gradient.colors.map((current, itemIndex) => itemIndex === index ? color.toUpperCase() : current) });
  }

  const automationRows = [
    { kind: "url_health" as const, name: "URL health", run: resource.automations.urlHealth },
    { kind: "duplicate_scan" as const, name: "Duplicate scan", run: resource.automations.duplicateScan },
    { kind: "metadata_refresh" as const, name: "Metadata", run: resource.automations.metadataRefresh }
  ];

  return (
    <div className={styles.properties}>
      <div className={styles.editBar}>
        <h2>Resource properties</h2>
        <div className={styles.editActions}>
          {editing ? <>
            <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => { setForm(formFor(resource)); setEditing(false); setFeedback(null); }}>Cancel</button>
            <button type="button" className={styles.primaryButton} disabled={busy || !changed || !form.title.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
          </> : <button type="button" className={styles.secondaryButton} onClick={() => setEditing(true)}>Edit Resource</button>}
        </div>
      </div>

      {feedback ? <p className={styles.feedback} data-error={feedback.error || undefined} role="status">{feedback.text}</p> : null}

      <section className={styles.section}>
        <header className={styles.sectionHeading}><div><PersonalOpsIcon name="resource" /><h3>Details</h3></div></header>
        <div className={styles.fieldGrid}>
          <label className={`${styles.field} ${styles.wide}`}><span>Title</span><input value={form.title} disabled={!editing} onChange={(event) => update("title", event.target.value)} /></label>
          <label className={styles.field}><span>Type</span><select value={form.type} disabled={!editing} onChange={(event) => update("type", event.target.value as ResourceType)}>{RESOURCE_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className={styles.field}><span>Lifecycle</span><select value={form.lifecycle} disabled={!editing} onChange={(event) => update("lifecycle", event.target.value as ResourceLifecycleState)}>{LIFECYCLES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className={`${styles.field} ${styles.wide}`}><span>URL</span><input type="url" value={form.url} disabled={!editing} placeholder="https://" onChange={(event) => update("url", event.target.value)} /></label>
          <label className={`${styles.field} ${styles.wide}`}><span>Source domain <small>(optional)</small></span><input value={form.sourceDomain} disabled={!editing} placeholder="example.com" onChange={(event) => update("sourceDomain", event.target.value)} /></label>
        </div>
      </section>

      <section className={styles.section} data-tone="plum">
        <header className={styles.sectionHeading}><div><PersonalOpsIcon name="palette" /><h3>Resource mark</h3></div><span>{form.gradient.colors.length} colors</span></header>
        <div className={styles.gradientLayout}>
          <div className={styles.gradientStage} style={resourceGradientStyle(form.gradient)} onPointerDown={moveFocal} onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && moveFocal(event)} aria-label="Gradient focal point">
            <span className={styles.gradientFocal} style={{ left: `${form.gradient.focalX}%`, top: `${form.gradient.focalY}%` }} />
          </div>
          <div className={styles.gradientControls}>
            <div className={styles.patternRow} aria-label="Gradient pattern">
              {PATTERNS.map((pattern) => <button type="button" key={pattern} disabled={!editing} data-active={form.gradient.pattern === pattern || undefined} onClick={() => update("gradient", { ...form.gradient, pattern })}>{pattern[0].toUpperCase() + pattern.slice(1)}</button>)}
            </div>
            <div className={styles.colorList}>
              {form.gradient.colors.map((color, index) => <div className={styles.colorRow} key={`${index}-${color}`}>
                <input aria-label={`Color ${index + 1}`} type="color" value={color} disabled={!editing} onChange={(event) => updateColor(index, event.target.value)} />
                <input aria-label={`Color ${index + 1} hex`} type="text" defaultValue={color} disabled={!editing} onBlur={(event) => updateColor(index, event.target.value)} />
                <button type="button" aria-label={`Remove color ${index + 1}`} disabled={!editing || form.gradient.colors.length <= 2} onClick={() => update("gradient", { ...form.gradient, colors: form.gradient.colors.filter((_, itemIndex) => itemIndex !== index) })}><PersonalOpsIcon name="delete" /></button>
              </div>)}
            </div>
            <button type="button" className={styles.addColor} disabled={!editing || form.gradient.colors.length >= 7} onClick={() => update("gradient", { ...form.gradient, colors: [...form.gradient.colors, "#D9CABD"] })}>+ Color</button>
          </div>
        </div>
      </section>

      <section className={styles.section} data-tone="sand">
        <header className={styles.sectionHeading}><div><PersonalOpsIcon name="review" /><h3>Freshness</h3></div></header>
        <div className={styles.sliderGrid}>
          <div className={styles.slider}><label>Usefulness<input type="range" min="1" max="10" value={form.usefulness} disabled={!editing} onChange={(event) => update("usefulness", Number(event.target.value))} /></label><output>{form.usefulness}</output></div>
          <div className={styles.slider}><label>Trust<input type="range" min="1" max="10" value={form.trust} disabled={!editing} onChange={(event) => update("trust", Number(event.target.value))} /></label><output>{form.trust}</output></div>
        </div>
        <div className={styles.fieldGrid}>
          <label className={styles.field}><span>Cadence</span><select value={form.cadence} disabled={!editing} onChange={(event) => update("cadence", event.target.value)}>{CADENCES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className={styles.field}><span>Next review</span><input type="date" value={form.nextReviewAt} disabled={!editing} onChange={(event) => update("nextReviewAt", event.target.value)} /></label>
        </div>
        <div className={styles.freshnessFacts}>
          <div className={styles.fact}><span>Last review</span><strong>{formatDate(resource.review.lastReviewedAt)}</strong></div>
          <div className={styles.fact}><span>Review state</span><strong>{resource.review.lastReviewedAt ? "Reviewed" : "Not reviewed"}</strong></div>
          <div className={styles.fact}><span>Source health</span><strong className={styles.state} data-state={stateForCheck(resource.health.state)}><PersonalOpsIcon name={stateForCheck(resource.health.state) === "fail" ? "close" : "check"} />{checkLabel(resource.health.state, "Not checked")}</strong></div>
          <div className={styles.fact}><span>Duplicates</span><strong className={styles.state} data-state={stateForCheck(resource.health.duplicateState)}><PersonalOpsIcon name={stateForCheck(resource.health.duplicateState) === "fail" ? "close" : "check"} />{checkLabel(resource.health.duplicateState, "Not checked")}</strong></div>
        </div>
      </section>

      <section className={styles.section} data-tone="slate">
        <header className={styles.sectionHeading}><div><PersonalOpsIcon name="run" /><h3>Automation</h3></div></header>
        <div className={styles.automationList}>
          {automationRows.map((item) => {
            const isRunning = running === item.kind;
            const complete = !isRunning && item.run.status === "success";
            return <div className={styles.automationRow} data-complete={complete || undefined} key={item.kind}>
              <div className={styles.automationCopy}><strong>{item.name}</strong><span>{isRunning ? "Running…" : item.run.lastRunAt ? `${formatDate(item.run.lastRunAt, true)} · ${item.run.message || item.run.status}` : "Not run yet"}</span></div>
              <button type="button" className={styles.runButton} disabled={Boolean(running)} onClick={() => void runAutomation(item.kind)}>{complete ? <PersonalOpsIcon name="check" /> : <PersonalOpsIcon name="run" />}{isRunning ? "Running" : "Run"}</button>
              {(isRunning || item.run.lastRunAt) ? <div className={styles.progressTrack} aria-hidden="true"><div className={styles.progressBar} /></div> : null}
            </div>;
          })}
        </div>
      </section>

      <details className={`${styles.section} ${styles.metadataDetails}`}>
        <summary>Properties</summary>
        <div className={styles.metadataGrid}>
          <div className={`${styles.fact} ${styles.wide}`}><span>Resource ID</span><strong>{resource.id}</strong></div>
          <div className={styles.fact}><span>Created</span><strong>{formatDate(resource.createdAt, true)}</strong></div>
          <div className={styles.fact}><span>Updated</span><strong>{formatDate(resource.updatedAt, true)}</strong></div>
          <div className={styles.fact}><span>Last reviewed</span><strong>{formatDate(resource.review.lastReviewedAt, true)}</strong></div>
          <div className={styles.fact}><span>Metadata fetched</span><strong>{formatDate(resource.metadata.fetchedAt, true)}</strong></div>
          {Object.entries(resource.metadata).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => <div className={styles.fact} key={key}><span>{key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())}</span><strong>{String(value)}</strong></div>)}
        </div>
      </details>

      <section className={styles.section} data-tone="danger">
        <header className={styles.sectionHeading}><div><PersonalOpsIcon name="archive" /><h3>Archive</h3></div></header>
        <p className={styles.archiveCopy}>Archiving removes this resource from active views while preserving its links, notes, metadata, and timeline.</p>
        <button type="button" className={styles.archiveButton} disabled={busy || resource.lifecycleState === "archived"} onClick={() => void archive()}>{resource.lifecycleState === "archived" ? "Archived" : "Archive Resource"}</button>
      </section>
    </div>
  );
}
