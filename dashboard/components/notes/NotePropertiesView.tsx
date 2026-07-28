"use client";

import type { NotePropertyReadiness } from "../../lib/modules/notes/property-readiness";
import type { NoteRecord } from "../../lib/modules/notes/types";
import EvidenceChecklist from "../operational/EvidenceChecklist";
import MetricStrip from "../operational/MetricStrip";
import QuickActionBar from "../operational/QuickActionBar";
import styles from "../content-graph/ContentGraphWorkspace.module.css";

type NotePropertyContext = {
  retainedRelationCount: number;
  sourceCandidateCount: number;
  resolvedOwnerTargetCount: number;
  unresolvedReferenceCount: number;
};

function displayLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTimestamp(value?: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function reviewMapping(note: NoteRecord): string {
  return note.mappingNotes.find((mapping) => mapping.field === "review")?.message ||
    "No independent Note review state is stored.";
}

function propertyChecklist(readiness: NotePropertyReadiness) {
  return readiness.checks.map((check) => ({
    id: check.id,
    label: check.label,
    detail: `${check.value} · ${check.detail}`,
    outcome: check.outcome,
    outcomeLabel: check.outcomeLabel
  }));
}

export function NotePropertiesSummary({
  note,
  readiness,
  context,
  onEditProperties,
  onOpenProperties,
}: {
  note: NoteRecord;
  readiness: NotePropertyReadiness;
  context: NotePropertyContext;
  onEditProperties: () => void;
  onOpenProperties?: () => void;
}) {
  const visibleChecks = readiness.checks.filter(
    (check) => check.outcome !== "supported" || check.requirement === "required"
  );

  return (
    <div className={styles.propertiesSurface}>
      <MetricStrip
        ariaLabel="Selected Note property health"
        items={[
          {
            id: "required",
            label: "Required ready",
            value: `${readiness.readyRequiredCount}/${readiness.requiredChecks.length}`
          },
          {
            id: "attention",
            label: "Property attention",
            value: readiness.attentionCount,
            tone: readiness.attentionCount ? "attention" : "positive"
          },
          {
            id: "unavailable",
            label: "Native fields unavailable",
            value: readiness.unavailableCount,
            tone: "attention"
          },
          {
            id: "references",
            label: "Retained references",
            value: context.retainedRelationCount + context.sourceCandidateCount
          }
        ]}
      />
      <div className={styles.propertiesBoundary}>
        <strong>Property health · derived, not persisted</strong>
        <span>
          Queue membership is calculated from current Note evidence. Native owner, version, pinned,
          review-owner, schema, and audit fields remain unavailable and do not silently become negative values.
        </span>
      </div>
      <EvidenceChecklist
        ariaLabel={`${note.title} property health`}
        items={propertyChecklist({ ...readiness, checks: visibleChecks })}
      />
      <QuickActionBar
        ariaLabel="Selected Note property actions"
        actions={[
          {
            id: "edit-routing",
            label: "Edit routing fields",
            onSelect: onEditProperties,
            intent: "primary"
          },
          ...(onOpenProperties
            ? [{ id: "open-properties", label: "Open full Properties", onSelect: onOpenProperties }]
            : []),
          {
            id: "fill-missing",
            label: "Fill missing",
            disabled: true,
            disabledReason: "Automatic fill remains unavailable because native ownership, type, review, version, and audit fields cannot be inferred safely."
          }
        ]}
      />
    </div>
  );
}

export default function NotePropertiesView({
  note,
  readiness,
  context,
  onOpenTab,
  onEditProperties
}: {
  note: NoteRecord;
  readiness: NotePropertyReadiness;
  context: NotePropertyContext;
  onOpenTab: (tab: "body" | "links" | "review") => void;
  onEditProperties: () => void;
}) {
  const requiredChecks = readiness.checks.filter((check) => check.requirement === "required");
  const recommendedChecks = readiness.checks.filter((check) => check.requirement === "recommended");
  const unavailableChecks = readiness.checks.filter((check) => check.requirement === "native");
  const sourceCount = Number(Boolean(note.legacySources.sourceUrl)) + note.legacySources.externalSources.length;

  return (
    <div className={styles.propertiesSurface}>
      <MetricStrip
        ariaLabel="Note property readiness"
        items={[
          {
            id: "required",
            label: "Required fields ready",
            value: `${readiness.readyRequiredCount}/${readiness.requiredChecks.length}`,
            tone: readiness.readyRequiredCount === readiness.requiredChecks.length ? "positive" : "attention"
          },
          {
            id: "missing",
            label: "Missing values",
            value: readiness.missingCount,
            tone: readiness.missingCount ? "danger" : "positive"
          },
          {
            id: "invalid",
            label: "Invalid values",
            value: readiness.invalidCount,
            tone: readiness.invalidCount ? "danger" : "positive"
          },
          {
            id: "confirm",
            label: "Mappings to confirm",
            value: readiness.unconfirmedCount,
            tone: readiness.unconfirmedCount ? "attention" : "positive"
          },
          {
            id: "links",
            label: "Retained references",
            value: context.retainedRelationCount + context.sourceCandidateCount,
            detail: "evidence only"
          },
          {
            id: "review",
            label: "Review state",
            value: displayLabel(note.reviewState),
            detail: "separate from lifecycle"
          },
          {
            id: "updated",
            label: "Metadata updated",
            value: formatTimestamp(note.updatedAt)
          },
          {
            id: "provenance",
            label: "Provenance",
            value: note.provenance.kind === "legacy_personal_record" ? "Legacy mapped" : "Unknown"
          }
        ]}
      />

      <div className={styles.propertiesBoundary}>
        <strong>Properties control plane · audited routing fields plus read-only evidence</strong>
        <span>
          This view groups canonical, derived, and unavailable fields without recreating the old raw property dump.
          Areas, Subjects, and legacy project labels use an explicit audited editor. Title, body, and directly writable
          lifecycle values remain on Body; native ownership, review, links, versions, and lifecycle transitions stay disabled.
        </span>
      </div>

      <div className={styles.propertiesGrid}>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Core</span>
              <h2>Core property readiness</h2>
              <p>Required properties are checked independently from review and lifecycle state.</p>
            </div>
            <span className={styles.stateChip} data-tone={readiness.requiresAttention ? "amber" : "green"}>
              {readiness.requiresAttention ? `${readiness.attentionCount} need attention` : "Ready"}
            </span>
          </div>
          <EvidenceChecklist
            ariaLabel={`${note.title} required Note properties`}
            items={propertyChecklist({ ...readiness, checks: requiredChecks })}
          />
          {recommendedChecks.length > 0 && (
            <>
              <span className={styles.eyebrow}>Routing quality</span>
              <EvidenceChecklist
                ariaLabel={`${note.title} recommended Note properties`}
                items={propertyChecklist({ ...readiness, checks: recommendedChecks })}
              />
            </>
          )}
          <QuickActionBar
            ariaLabel="Core Note property actions"
            actions={[
              {
                id: "edit-routing",
                label: "Edit routing fields",
                onSelect: onEditProperties,
                intent: "primary"
              },
              {
                id: "open-body",
                label: "Open authored body",
                onSelect: () => onOpenTab("body")
              },
              {
                id: "clean-properties",
                label: "Clean properties",
                disabled: true,
                disabledReason: "Automatic cleanup requires a field-by-field preview and cannot infer native ownership, type, review, or link state."
              }
            ]}
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Review</span>
              <h2>Review and cadence</h2>
            </div>
            <span className={styles.stateChip} data-tone={note.reviewState === "needs_review" ? "pink" : "blue"}>
              {displayLabel(note.reviewState)}
            </span>
          </div>
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>Lifecycle</span><strong>{displayLabel(note.lifecycleStatus)}</strong></div>
            <div className={styles.fact}><span>Review state</span><strong>{displayLabel(note.reviewState)}</strong></div>
            <div className={styles.fact}><span>Review reason</span><strong>{reviewMapping(note)}</strong></div>
            <div className={styles.fact}><span>Last legacy review</span><strong>{formatTimestamp(note.legacyLastReviewAt)}</strong></div>
            <div className={styles.fact}><span>Next review</span><strong>{formatTimestamp(note.nextReviewAt)}</strong></div>
            <div className={styles.fact}><span>Cadence</span><strong>{note.reviewCadence || "Not recorded"}</strong></div>
            <div className={styles.fact}><span>Review owner</span><strong>Not stored</strong></div>
            <div className={styles.fact}><span>Linked Review ID</span><strong>Not connected</strong></div>
          </div>
          <p>Review state is derived separately and never written into Note lifecycle.</p>
          <QuickActionBar
            actions={[
              { id: "open-review", label: "Open Review", onSelect: () => onOpenTab("review"), intent: "primary" },
              {
                id: "set-cadence",
                label: "Set cadence",
                disabled: true,
                disabledReason: "Cadence editing needs a native NoteReviewState, review owner, date rules, explicit save, and audit."
              }
            ]}
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Derived</span>
              <h2>Links and counts</h2>
            </div>
            <span className={styles.stateChip} data-tone="blue">Read-only</span>
          </div>
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>Retained relation IDs</span><strong>{context.retainedRelationCount}</strong></div>
            <div className={styles.fact}><span>Source candidates</span><strong>{sourceCount}</strong></div>
            <div className={styles.fact}><span>Resolved owner targets</span><strong>{context.resolvedOwnerTargetCount}</strong></div>
            <div className={styles.fact}><span>Unresolved references</span><strong>{context.unresolvedReferenceCount}</strong></div>
            <div className={styles.fact}><span>Persisted NoteLinks</span><strong>Not connected</strong></div>
            <div className={styles.fact}><span>Inferred backlinks</span><strong>Not connected</strong></div>
            <div className={styles.fact}><span>Attachments</span><strong>Not connected</strong></div>
            <div className={styles.fact}><span>Decision candidates</span><strong>{note.type === "decision" ? 1 : 0}</strong></div>
          </div>
          <p>Retained IDs and exact owner-route candidates remain evidence. They are not promoted into native NoteLinks.</p>
          <QuickActionBar
            actions={[
              { id: "inspect-links", label: "Inspect link evidence", onSelect: () => onOpenTab("links"), intent: "primary" },
              {
                id: "recalculate",
                label: "Recalculate",
                disabled: true,
                disabledReason: "Current counts already derive on render; no persisted index or audited recalculation job exists."
              }
            ]}
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Provenance</span>
              <h2>Source and migration</h2>
            </div>
            <span className={styles.stateChip} data-tone="amber">Legacy mapped</span>
          </div>
          <div className={styles.factGrid}>
            <div className={styles.fact} data-mono="true"><span>UID</span><strong>{note.uid}</strong></div>
            <div className={styles.fact} data-mono="true"><span>Legacy record ID</span><strong>{note.provenance.recordId}</strong></div>
            <div className={styles.fact}><span>Source domain</span><strong>{note.provenance.domain}</strong></div>
            <div className={styles.fact}><span>Legacy class</span><strong>{displayLabel(note.provenance.className)}</strong></div>
            <div className={styles.fact}><span>Legacy status</span><strong>{displayLabel(note.provenance.status)}</strong></div>
            <div className={styles.fact}><span>Import origin</span><strong>{displayLabel(note.provenance.kind)}</strong></div>
            <div className={styles.fact} data-mono="true"><span>Created at</span><strong>{formatTimestamp(note.createdAt)}</strong></div>
            <div className={styles.fact} data-mono="true"><span>Updated at</span><strong>{formatTimestamp(note.updatedAt)}</strong></div>
            <div className={styles.fact}><span>Created by</span><strong>Not stored</strong></div>
            <div className={styles.fact}><span>Updated by</span><strong>Not stored</strong></div>
            <div className={styles.fact}><span>Version</span><strong>Legacy current revision</strong></div>
            <div className={styles.fact}><span>Last audit event</span><strong>Not connected</strong></div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Privacy</span>
              <h2>Ownership and privacy</h2>
            </div>
            <span className={styles.stateChip} data-tone="green">{displayLabel(note.privacy)}</span>
          </div>
          <ul className={styles.propertyRows}>
            <li><span><strong>Canonical owner</strong><small>Owner identity is required by the target contract.</small></span><span className={styles.stateChip}>Not stored</span></li>
            <li><span><strong>Privacy</strong><small>Current Personal Records privacy value.</small></span><span className={styles.stateChip} data-tone="green">{displayLabel(note.privacy)}</span></li>
            <li><span><strong>Future sharing</strong><small>No sharing workflow or permission expansion is inferred.</small></span><span className={styles.stateChip}>Unresolved</span></li>
            <li><span><strong>Authorship</strong><small>Authored body stays Notes-owned; downstream objects link back.</small></span><span className={styles.stateChip} data-tone="blue">Notes</span></li>
          </ul>
          <div className={styles.sourceBoundary}>
            Durable Decisions belong to Personal Ops. External-source identity belongs to Resources. Files and snapshots
            belong to Media. ReviewRun state belongs to Reviews.
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Unavailable native fields</span>
              <h2>Connection boundary</h2>
            </div>
            <span className={styles.stateChip} data-tone="amber">{unavailableChecks.length} unavailable</span>
          </div>
          <EvidenceChecklist
            ariaLabel={`${note.title} unavailable native Note properties`}
            items={propertyChecklist({ ...readiness, checks: unavailableChecks })}
          />
        </section>

        <section className={styles.panel} data-wide="true">
          <details className={styles.propertyDisclosure}>
            <summary>System / debug</summary>
            <div className={styles.factGrid}>
              <div className={styles.fact} data-mono="true"><span>Database ID</span><strong>{note.id}</strong></div>
              <div className={styles.fact}><span>Search-index state</span><strong>Not connected</strong></div>
              <div className={styles.fact}><span>Sync state</span><strong>Personal Records read path</strong></div>
              <div className={styles.fact}><span>Content schema version</span><strong>Legacy plain text</strong></div>
              <div className={styles.fact}><span>Migration version</span><strong>Typed adapter only</strong></div>
              <div className={styles.fact}><span>Raw editor document ID</span><strong>Not available</strong></div>
            </div>
          </details>
          <QuickActionBar
            ariaLabel="Note property lifecycle actions"
            actions={[
              {
                id: "audit",
                label: "View audit history",
                disabled: true,
                disabledReason: "A native Note audit stream and scoped read route are not connected."
              },
              {
                id: "archive",
                label: "Archive",
                intent: "destructive",
                disabled: true,
                disabledReason: "Archive remains unavailable until retention, restore, link preservation, actor, version, and audit semantics are settled."
              }
            ]}
          />
        </section>
      </div>
    </div>
  );
}
