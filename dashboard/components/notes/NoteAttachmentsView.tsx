"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  NoteAttachmentEvidence,
  NoteAttachmentEvidenceItem,
  NoteAttachmentEvidenceKind
} from "../../lib/modules/notes/attachment-evidence";
import { getModuleRoute } from "../../lib/native-objects/routes";
import MetricStrip from "../operational/MetricStrip";
import QuickActionBar from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import styles from "./NoteAttachmentsView.module.css";

type EvidenceFilter = "all" | "media" | "resources" | "other" | "unresolved";

const FILTERS: ReadonlyArray<{ id: EvidenceFilter; label: string }> = [
  { id: "all", label: "All evidence" },
  { id: "media", label: "Media" },
  { id: "resources", label: "Resources" },
  { id: "other", label: "Other owners" },
  { id: "unresolved", label: "Unresolved" }
];

const KIND_LABELS: Record<NoteAttachmentEvidenceKind, string> = {
  media_candidate: "Media candidates",
  resource_reference: "Resource references",
  other_reference: "Other owner references",
  unresolved_reference: "Missing or weak context"
};

function displayLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "No dated evidence";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatBytes(value: number | null) {
  if (value === null) return "Unavailable";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function matchesFilter(item: NoteAttachmentEvidenceItem, filter: EvidenceFilter) {
  if (filter === "all") return true;
  if (filter === "media") return item.kind === "media_candidate";
  if (filter === "resources") return item.kind === "resource_reference";
  if (filter === "other") return item.kind === "other_reference";
  return item.kind === "unresolved_reference";
}

function matchesQuery(item: NoteAttachmentEvidenceItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    item.title,
    item.subtitle,
    item.ownerModuleLabel,
    ...item.relationships,
    ...item.matchBasis,
    ...item.evidenceFields
  ].join(" ").toLowerCase().includes(normalized);
}

function resourceSearchRoute(item: NoteAttachmentEvidenceItem) {
  const params = new URLSearchParams({ query: item.unresolved?.value || item.title });
  return `${getModuleRoute("resources")}?${params.toString()}`;
}

export function NoteAttachmentInspector({
  evidence,
  selectedItem
}: {
  evidence: NoteAttachmentEvidence;
  selectedItem: NoteAttachmentEvidenceItem | null;
}) {
  if (!selectedItem) {
    return (
      <div className={styles.inspectorStack} data-note-attachment-inspector="empty">
        <section className={styles.inspectorPanel}>
          <span className={styles.eyebrow}>Attachment evidence</span>
          <h2>Select an evidence row</h2>
          <p>
            Inspect inherited Media rights, Resource identity, match provenance, and the native owner route.
          </p>
        </section>
        <section className={styles.inspectorPanel}>
          <h3>Current boundary</h3>
          <dl className={styles.facts}>
            <div><dt>Persisted NoteAttachments</dt><dd>Unavailable</dd></div>
            <div><dt>Review evidence index</dt><dd>Not connected</dd></div>
            <div><dt>Visible candidates</dt><dd>{evidence.items.length}</dd></div>
          </dl>
          <p className={styles.boundary}>
            Exact candidates are read evidence, not saved relationships. Nothing is uploaded, linked, removed, or deleted from this view.
          </p>
        </section>
      </div>
    );
  }

  const media = selectedItem.media;
  const resource = selectedItem.resource;
  const unresolvedSearchHref = selectedItem.unresolved?.kind === "external_url_candidate"
    ? resourceSearchRoute(selectedItem)
    : null;

  return (
    <div className={styles.inspectorStack} data-note-attachment-inspector={selectedItem.id}>
      <section className={styles.inspectorPanel}>
        <span className={styles.eyebrow}>{selectedItem.ownerModuleLabel} evidence</span>
        <h2>{selectedItem.title}</h2>
        <div className={styles.stateLine}>
          <span data-tone={selectedItem.state === "candidate" ? "blue" : "amber"}>
            {displayLabel(selectedItem.state)}
          </span>
          <span>{displayLabel(selectedItem.kind)}</span>
        </div>
        <p>{selectedItem.subtitle}</p>
        {selectedItem.ownerRef ? (
          <Link className={styles.primaryLink} href={selectedItem.ownerRef.route}>
            Open {selectedItem.ownerModuleLabel} owner
          </Link>
        ) : unresolvedSearchHref ? (
          <Link className={styles.primaryLink} href={unresolvedSearchHref}>
            Search Resources
          </Link>
        ) : (
          <button type="button" className={styles.disabledButton} aria-disabled="true" title="No exact native owner route is available.">
            Owner unresolved
          </button>
        )}
      </section>

      {media && (
        <section className={styles.inspectorPanel}>
          <div className={styles.panelHeading}>
            <h3>Inherited Media facts</h3>
            <span>Media-owned</span>
          </div>
          <dl className={styles.facts}>
            <div><dt>Rights</dt><dd>{displayLabel(media.rights.state)}</dd></div>
            <div><dt>Rights scope</dt><dd>{displayLabel(media.rights.scopeState)}</dd></div>
            <div><dt>Duplicate</dt><dd>{displayLabel(media.duplicateState)}</dd></div>
            <div><dt>Accessibility</dt><dd>{displayLabel(media.accessibility.altTextState)}</dd></div>
            <div><dt>Filename</dt><dd>{media.technical.filename || "Unavailable"}</dd></div>
            <div><dt>File size</dt><dd>{formatBytes(media.technical.fileSizeBytes)}</dd></div>
            <div>
              <dt>Dimensions</dt>
              <dd>{media.technical.dimensions ? `${media.technical.dimensions.width} × ${media.technical.dimensions.height}` : "Unavailable"}</dd>
            </div>
            <div><dt>Updated</dt><dd>{formatDate(media.updatedAt)}</dd></div>
          </dl>
          <p className={styles.boundary}>
            Notes does not copy or override binary, preview, version, duplicate, accessibility, or rights metadata.
          </p>
        </section>
      )}

      {resource && (
        <section className={styles.inspectorPanel}>
          <div className={styles.panelHeading}>
            <h3>Inherited Resource facts</h3>
            <span>Resource-owned</span>
          </div>
          <dl className={styles.facts}>
            <div><dt>User title</dt><dd>{resource.title}</dd></div>
            <div><dt>Fetched source title</dt><dd>{resource.source.sourceTitle || "Unavailable"}</dd></div>
            <div><dt>Canonical identity</dt><dd>{displayLabel(resource.source.canonicalState)}</dd></div>
            <div><dt>URL health</dt><dd>{displayLabel(resource.health.state)}</dd></div>
            <div><dt>Freshness</dt><dd>{displayLabel(resource.review.freshness)}</dd></div>
            <div><dt>Snapshot</dt><dd>{displayLabel(resource.health.snapshotState)}</dd></div>
          </dl>
          <p className={styles.boundary}>
            Resource stays Resource. A URL, source page, or citation is not converted into a Notes-owned file.
          </p>
        </section>
      )}

      <section className={styles.inspectorPanel}>
        <h3>Relationship evidence</h3>
        <dl className={styles.facts}>
          <div><dt>Persisted relationship</dt><dd>No</dd></div>
          <div><dt>Match basis</dt><dd>{selectedItem.matchBasis.join(" · ") || "Unresolved"}</dd></div>
          <div><dt>Relationship signal</dt><dd>{selectedItem.relationships.join(" · ") || "Not classified"}</dd></div>
          <div><dt>Evidence field</dt><dd>{selectedItem.evidenceFields.join(" · ") || "Not recorded"}</dd></div>
          <div><dt>Caption</dt><dd>Not stored</dd></div>
          <div><dt>Source range</dt><dd>Not stored</dd></div>
        </dl>
        {selectedItem.caveats.map((caveat) => <p className={styles.caveat} key={caveat}>{caveat}</p>)}
      </section>

      <section className={styles.inspectorPanel}>
        <h3>Relationship actions</h3>
        <QuickActionBar
          actions={[
            {
              id: "caption",
              label: "Edit caption",
              disabled: true,
              disabledReason: "Caption and source-range metadata require the native NoteAttachment repository."
            },
            {
              id: "review",
              label: "Use as Review evidence",
              disabled: true,
              disabledReason: "Review evidence is Review-owned and its evidence index is not connected here."
            },
            {
              id: "remove",
              label: "Remove relationship",
              intent: "destructive",
              disabled: true,
              disabledReason: "No persisted relationship exists to remove. The native asset would never be deleted by unlinking."
            }
          ]}
          ariaLabel="Attachment relationship actions"
        />
      </section>
    </div>
  );
}

export default function NoteAttachmentsView({
  evidence,
  selectedItemId,
  onSelectItem
}: {
  evidence: NoteAttachmentEvidence;
  selectedItemId: string;
  onSelectItem: (itemId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EvidenceFilter>("all");
  const visibleItems = useMemo(
    () => evidence.items.filter((item) => matchesFilter(item, filter) && matchesQuery(item, query)),
    [evidence.items, filter, query]
  );
  const groups = useMemo(
    () => (Object.keys(KIND_LABELS) as NoteAttachmentEvidenceKind[])
      .map((kind) => ({
        kind,
        label: KIND_LABELS[kind],
        items: visibleItems.filter((item) => item.kind === kind)
      }))
      .filter((group) => group.items.length),
    [visibleItems]
  );

  return (
    <div className={styles.workspace} data-note-attachments-workspace="true">
      <section className={styles.summary}>
        <div className={styles.summaryHeading}>
          <div>
            <span className={styles.eyebrow}>Cross-module evidence</span>
            <h2>Attachment evidence</h2>
            <p>Inspect supporting Media, external Resources, and unresolved legacy context without changing ownership.</p>
          </div>
          <span className={styles.readOnlyBadge}>Read-only evidence</span>
        </div>
        <MetricStrip
          ariaLabel="Note attachment evidence summary"
          items={[
            { id: "media", label: "Media candidates", value: evidence.summary.mediaCandidates },
            { id: "resources", label: "Resource references", value: evidence.summary.resourceReferences },
            { id: "persisted", label: "Persisted links", value: "—", detail: "Repository disconnected", tone: "attention" },
            { id: "review", label: "Review evidence", value: "—", detail: "Not indexed", tone: "attention" },
            {
              id: "attention",
              label: "Needs attention",
              value: evidence.summary.attentionItems,
              tone: evidence.summary.attentionItems ? "attention" : "positive"
            },
            {
              id: "rights",
              label: "Rights checks",
              value: evidence.summary.rightsChecks,
              tone: evidence.summary.rightsChecks ? "attention" : "positive"
            }
          ]}
        />
        <div className={styles.boundaryGrid}>
          <p><strong>No persisted NoteAttachment</strong><span>Exact candidates are inspectable evidence, not saved links.</span></p>
          <p><strong>Resource stays Resource</strong><span>URLs and citations remain external-source objects.</span></p>
          <p><strong>Media owns files</strong><span>Rights, versions, duplicates, and binary metadata are inherited.</span></p>
          <p><strong>Latest owner update</strong><span>{formatDate(evidence.summary.latestOwnerUpdateAt)}</span></p>
        </div>
      </section>

      <section className={styles.actions}>
        <QuickActionBar
          actions={[
            {
              id: "upload",
              label: "Upload file",
              intent: "primary",
              disabled: true,
              disabledReason: "Upload must first create a native Media object; Media intake persistence is not connected."
            },
            {
              id: "link-media",
              label: "Link Media / File",
              disabled: true,
              disabledReason: "The native NoteAttachment repository and audit actor are unresolved."
            },
            {
              id: "attach-resource",
              label: "Attach Resource",
              disabled: true,
              disabledReason: "Resource selection can begin after native NoteAttachment relationship persistence is approved."
            },
            {
              id: "attach-review",
              label: "Attach Review evidence",
              disabled: true,
              disabledReason: "Review evidence is Review-owned and cannot be created from Notes."
            }
          ]}
          ariaLabel="Attachment workspace actions"
        />
      </section>

      <section className={styles.browser} aria-label="Attachment evidence browser">
        <div className={styles.tools}>
          <label className={styles.search}>
            <span>Search evidence</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, owner, relationship, or source field"
            />
          </label>
          <div className={styles.filters} role="group" aria-label="Evidence owner filter">
            {FILTERS.map((item) => (
              <button
                type="button"
                key={item.id}
                data-active={filter === item.id || undefined}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {groups.length ? groups.map((group) => (
          <section className={styles.group} key={group.kind} aria-labelledby={`attachment-group-${group.kind}`}>
            <div className={styles.groupHeading}>
              <h3 id={`attachment-group-${group.kind}`}>{group.label}</h3>
              <span>{group.items.length}</span>
            </div>
            <ul>
              {group.items.map((item) => {
                const selected = item.id === selectedItemId;
                const attention = item.state !== "candidate";
                return (
                  <li
                    key={item.id}
                    data-selected={selected || undefined}
                    data-attachment-evidence-id={item.id}
                  >
                    <button
                      type="button"
                      className={styles.rowSelect}
                      onClick={() => onSelectItem(item.id)}
                      aria-pressed={selected}
                      aria-label={`Inspect ${item.title}`}
                    >
                      <span className={styles.kindIcon} data-kind={item.kind} aria-hidden="true">
                        {item.kind === "media_candidate" ? "M" : item.kind === "resource_reference" ? "R" : "↗"}
                      </span>
                      <span className={styles.rowText}>
                        <strong>{item.title}</strong>
                        <small>{item.subtitle}</small>
                        <span>{item.matchBasis.join(" · ")}{item.relationships.length ? ` · ${item.relationships.join(" · ")}` : ""}</span>
                      </span>
                      <span className={styles.rowState} data-tone={attention ? "amber" : "blue"}>
                        {displayLabel(item.state)}
                      </span>
                    </button>
                    {item.ownerRef ? (
                      <Link href={item.ownerRef.route} aria-label={`Open ${item.title} in ${item.ownerModuleLabel}`}>
                        Open owner
                      </Link>
                    ) : item.unresolved?.kind === "external_url_candidate" ? (
                      <Link href={resourceSearchRoute(item)} aria-label={`Search Resources for ${item.title}`}>
                        Search Resources
                      </Link>
                    ) : (
                      <span className={styles.noOwner}>Owner unresolved</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )) : (
          <SystemState
            variant={evidence.items.length ? "empty" : "read_only"}
            title={evidence.items.length ? "No evidence matches this view" : "No attachment evidence is available"}
            description={evidence.items.length
              ? "Clear the search or choose another owner filter."
              : "This Note has no exact Media or Resource candidates and no unresolved retained references. Upload and native linking remain intentionally unavailable."
            }
          />
        )}
      </section>

      <section className={styles.cleanup}>
        <div>
          <span className={styles.eyebrow}>Evidence readiness</span>
          <h2>Safe next steps</h2>
          <p>
            Resolve {evidence.summary.unresolvedReferences} retained reference{evidence.summary.unresolvedReferences === 1 ? "" : "s"} and confirm rights on {evidence.summary.rightsChecks} Media candidate{evidence.summary.rightsChecks === 1 ? "" : "s"} before promotion.
          </p>
        </div>
        <div className={styles.cleanupFacts}>
          <span><strong>{evidence.summary.otherReferences}</strong> other owner references</span>
          <span><strong>0</strong> relationships promoted</span>
          <span><strong>0</strong> assets mutated</span>
        </div>
      </section>
    </div>
  );
}
