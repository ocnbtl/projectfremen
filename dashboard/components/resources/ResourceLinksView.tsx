"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { createResourcesRepository } from "../../lib/modules/resources/repository";
import type { ResourceRecord } from "../../lib/modules/resources/types";
import { isUsableObjectLink, type ObjectLink } from "../../lib/native-objects/links";
import type { ModuleId, NativeObjectRef } from "../../lib/native-objects/types";
import PersonalOpsIcon from "../personal-ops/PersonalOpsIcon";
import { ResourceIconButton } from "./ResourceVisual";
import styles from "./ResourceExperience.module.css";

const GROUPS: ReadonlyArray<{ module: ModuleId | "other"; label: string }> = [
  { module: "projects", label: "Projects" },
  { module: "people", label: "People & Organizations" },
  { module: "notes", label: "Notes" },
  { module: "reviews", label: "Reviews" },
  { module: "media", label: "Files" },
  { module: "other", label: "Other" }
];

function refKey(ref: NativeObjectRef) { return `${ref.module}:${ref.objectType}:${ref.objectId}`; }
function matchesResource(ref: NativeObjectRef, resource: ResourceRecord) { return ref.module === "resources" && ref.objectType === "resource" && ref.objectId === resource.id; }
function isCanonicalEvidenceTarget(ref: NativeObjectRef) {
  if (ref.module === "projects") return ref.objectType === "project";
  if (ref.module === "people") return ["person", "organization"].includes(ref.objectType);
  if (ref.module === "notes") return ref.objectType === "note";
  if (ref.module === "reviews") return ref.objectType === "review_run";
  if (ref.module === "media") return ref.objectType === "media_asset";
  return true;
}

export default function ResourceLinksView({ resource, links, targets, evidenceTargets, projectPanel, projectCount = 0, notePanel, noteCount = 0, reviewPanel, reviewCount = 0, onAssociateProject, onLinksChange, onResourceSaved }: {
  resource: ResourceRecord;
  links: ObjectLink[];
  targets: NativeObjectRef[];
  evidenceTargets: NativeObjectRef[];
  projectPanel?: ReactNode;
  projectCount?: number;
  notePanel?: ReactNode;
  noteCount?: number;
  reviewPanel?: ReactNode;
  reviewCount?: number;
  onAssociateProject?: () => void;
  onLinksChange: (links: ObjectLink[]) => void;
  onResourceSaved: (resource: ResourceRecord) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [relationship, setRelationship] = useState("related");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const selectedLinks = links.filter((link) => isUsableObjectLink(link) && (matchesResource(link.source, resource) || matchesResource(link.target, resource)));
  const nativeTargets = selectedLinks.map((link) => ({ link, ref: matchesResource(link.source, resource) ? link.target : link.source }));
  const combined = useMemo(() => {
    const map = new Map<string, { ref: NativeObjectRef; link?: ObjectLink }>();
    for (const item of evidenceTargets.filter(isCanonicalEvidenceTarget)) map.set(refKey(item), { ref: item });
    for (const item of nativeTargets) map.set(refKey(item.ref), item);
    return [...map.values()];
  }, [evidenceTargets, nativeTargets]);
  const available = targets.filter((target) => !matchesResource(target, resource) && !combined.some((item) => refKey(item.ref) === refKey(target)));

  async function saveLink(event: FormEvent) {
    event.preventDefault();
    const target = available.find((candidate) => refKey(candidate) === targetId);
    if (!target || busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch("/api/native-links", {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ source: resource.nativeRef, target, relationship })
      });
      const payload = await response.json().catch(() => ({ ok: false, error: "Invalid response" })) as { ok?: boolean; item?: ObjectLink; error?: string };
      if (!response.ok || !payload.ok || !payload.item) throw new Error(payload.error || "The link could not be saved.");
      onLinksChange(links.some((link) => link.id === payload.item!.id) ? links : [...links, payload.item]);
      const now = new Date().toISOString();
      const updated = await createResourcesRepository().update(resource.id, {
        timeline: [...resource.timeline, { id: `resource-event-${crypto.randomUUID()}`, kind: "linked", title: `${target.label} linked`, detail: `${target.module} · ${relationship}`, occurredAt: now }],
        expectedUpdatedAt: resource.updatedAt
      });
      if (updated.ok) onResourceSaved(updated.data);
      setAdding(false);
      setTargetId("");
      setRelationship("related");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The link could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(link: ObjectLink) {
    if (busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch("/api/native-links", { method: "DELETE", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ id: link.id, reason: "Removed from Resource Links" }) });
      const payload = await response.json().catch(() => ({ ok: false, error: "Invalid response" })) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The link could not be removed.");
      onLinksChange(links.map((item) => item.id === link.id ? { ...item, status: "removed" } : item));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The link could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.linksHub}>
      <div className={styles.linksToolbar}>
        <h2>Links</h2>
        <div><strong>{combined.length}</strong><button type="button" className={styles.primaryButton} onClick={() => setAdding((current) => !current)}>+ Object</button></div>
      </div>
      {feedback ? <p className={styles.feedback} data-error="true" role="alert">{feedback}</p> : null}
      {adding ? <form className={styles.linkComposer} onSubmit={saveLink}>
        <label className={styles.field}><span>Object</span><select required value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Select an object</option>{Array.from(new Set(available.map((target) => target.module))).map((module) => <optgroup label={module.replace("_", " ")} key={module}>{available.filter((target) => target.module === module).map((target) => <option value={refKey(target)} key={refKey(target)}>{target.label}</option>)}</optgroup>)}</select></label>
        <label className={styles.field}><span>Relationship</span><select value={relationship} onChange={(event) => setRelationship(event.target.value)}><option value="related">Related</option><option value="source">Source</option><option value="supports">Supports</option><option value="reference">Reference</option></select></label>
        <div className={styles.editActions}><button type="button" className={styles.secondaryButton} onClick={() => setAdding(false)}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={!targetId || busy}>{busy ? "Linking…" : "Link"}</button></div>
      </form> : null}
      <div className={styles.linksGrid}>
        {GROUPS.map((group) => {
          const items = combined
            .filter((item) => group.module === "other" ? !["projects", "people", "notes", "reviews", "media"].includes(item.ref.module) : item.ref.module === group.module)
            .filter((item) => !(group.module === "projects" && projectPanel && !item.link));
          return <section className={styles.linkCard} key={group.label}>
            <header>
              <h3>{group.label}</h3>
              <div>
                <strong>{items.length + (group.module === "projects" ? projectCount : 0) + (group.module === "notes" ? noteCount : 0) + (group.module === "reviews" ? reviewCount : 0)}</strong>
                {group.module === "projects" && onAssociateProject ? (
                  <button type="button" className={styles.inlineLinkButton} onClick={onAssociateProject}>Associate Project</button>
                ) : null}
              </div>
            </header>
            {items.length ? <div className={styles.linkList}>{items.map((item) => <div className={styles.linkRow} key={refKey(item.ref)}>
              <Link href={item.ref.route}><span className={styles.linkGlyph}><PersonalOpsIcon name={item.ref.module === "people" ? "person" : item.ref.module === "projects" ? "goal" : item.ref.module === "notes" ? "list" : item.ref.module === "reviews" ? "review" : "object"} /></span><span><strong>{item.ref.label}</strong><small>{item.ref.objectType.replace(/_/g, " ")}{item.link ? ` · ${item.link.relationship}` : ""}</small></span></Link>
              {item.link ? <ResourceIconButton icon="close" label={`Remove link to ${item.ref.label}`} destructive disabled={busy} onClick={() => void removeLink(item.link!)} /> : null}
            </div>)}</div> : (group.module === "projects" && projectPanel) || (group.module === "notes" && notePanel) || (group.module === "reviews" && reviewPanel) ? null : <p className={styles.empty}>None yet</p>}
            {group.module === "projects" ? projectPanel : null}
            {group.module === "notes" ? notePanel : null}
            {group.module === "reviews" ? reviewPanel : null}
          </section>;
        })}
      </div>
    </div>
  );
}
