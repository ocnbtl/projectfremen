"use client";

import MetricStrip from "../operational/MetricStrip";
import QuickActionBar from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import type { ResourceRecord } from "../../lib/modules/resources/types";
import styles from "../content-graph/ContentGraphWorkspace.module.css";

type ResourcePropertyRule = {
  id: string;
  label: string;
  summary: string;
  appliesWhen: string;
  preserves: readonly string[];
  consequence: string;
};

const PROPERTY_RULES: readonly ResourcePropertyRule[] = [
  {
    id: "archive-preserves-history",
    label: "Archive preserves citations and linked history",
    summary: "Archive changes source lifecycle while retaining source cards, citations, link evidence, provenance, and audit history.",
    appliesWhen: "A Resource is cited, linked, or used as active evidence.",
    preserves: ["Resource identity", "Citation references", "Owner-module links", "Last-known source metadata"],
    consequence: "The source becomes read-only until restored; no linked object is deleted."
  },
  {
    id: "replace-canonical-with-diff",
    label: "Canonical replacement requires a diff",
    summary: "A canonical URL change must preview identity, metadata, citation, and source-card consequences.",
    appliesWhen: "A replacement URL is proposed for an existing Resource.",
    preserves: ["Original URL provenance", "Resource ID", "Prior source metadata", "Existing Note wording"],
    consequence: "Citation patches remain proposed until explicitly confirmed."
  },
  {
    id: "merge-keeps-survivor",
    label: "Duplicate merge keeps a canonical survivor",
    summary: "A future merge must combine references and history without losing either source identity.",
    appliesWhen: "A reviewed duplicate decision identifies one canonical surviving Resource.",
    preserves: ["Both legacy IDs", "All provenance", "Relationship history", "Redirect mapping"],
    consequence: "No exact URL match is auto-merged; ambiguous candidates remain separate."
  },
  {
    id: "broken-source-retains-evidence",
    label: "Broken source retains last-known evidence",
    summary: "An unavailable source remains visible with last-known metadata, citations, and repair routing.",
    appliesWhen: "A persisted URL-health result establishes an unreachable or broken source.",
    preserves: ["Last-known metadata", "Citations", "Review evidence", "Fallback references"],
    consequence: "A broken source does not invalidate authored Notes or silently archive the Resource."
  }
];

function displayLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function currentPropertyRule(selectedId: string): ResourcePropertyRule {
  return PROPERTY_RULES.find((rule) => rule.id === selectedId) || PROPERTY_RULES[0];
}

export default function ResourcePropertiesView({
  resource,
  selectedRuleId,
  onSelectRule,
  onOpenTab
}: {
  resource: ResourceRecord;
  selectedRuleId: string;
  onSelectRule: (ruleId: string) => void;
  onOpenTab: (tab: "source" | "links" | "review") => void;
}) {
  const selectedRule = currentPropertyRule(selectedRuleId);
  const sourceOpenable = Boolean(resource.source.canonicalUrl);
  const snapshotVerified = resource.health.snapshotState === "attached";
  const currentLifecycle = displayLabel(resource.lifecycleState);
  const propertyMetrics = [
    { id: "id", label: "Resource ID", value: resource.id, detail: "stable legacy mapping" },
    { id: "owner", label: "Owner", value: "Not stored", detail: "no owner identity inferred", tone: "attention" as const },
    { id: "lifecycle", label: "Lifecycle", value: currentLifecycle, detail: "adapter-derived only" },
    { id: "cadence", label: "Review cadence", value: displayLabel(resource.review.cadence), detail: "legacy field when present" },
    { id: "citation", label: "Citation", value: resource.citationCount ?? "Not connected", detail: "no citation registry", tone: "attention" as const },
    { id: "privacy", label: "Privacy", value: displayLabel(resource.provenance.privacy), detail: "legacy record privacy" },
    { id: "automation", label: "Automation", value: "Not connected", detail: "no run or audit", tone: "attention" as const },
    { id: "archive", label: "Archive rule", value: "Preserve", detail: "approved policy preview" }
  ];

  return (
    <div className={styles.propertiesSurface}>
      <MetricStrip ariaLabel="Resource property summary" items={propertyMetrics} />

      <div className={styles.propertiesBoundary}>
        <strong>Properties control plane · read-only policy preview</strong>
        <span>
          Current legacy evidence and approved ownership rules are shown separately. No native ResourceProperties record,
          owner assignment, policy configuration, automation, lifecycle event, or audit entry exists in this checkpoint.
        </span>
      </div>

      <div className={styles.propertiesGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>External identity</span>
              <h2>Resource identity</h2>
            </div>
            <span className={styles.stateChip} data-tone="amber">Legacy mapped</span>
          </div>
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>User title</span><strong>{resource.title}</strong></div>
            <div className={styles.fact}><span>Fetched source title</span><strong>{resource.source.sourceTitle || "Not fetched"}</strong></div>
            <div className={styles.fact}><span>Resource type</span><strong>{displayLabel(resource.type)}</strong></div>
            <div className={styles.fact}><span>Source domain</span><strong>{resource.source.displayDomain || "Not available"}</strong></div>
            <div className={styles.fact}><span>Publisher</span><strong>{resource.source.publisher || "Not available"}</strong></div>
            <div className={styles.fact}><span>Author</span><strong>{resource.source.author || "Not available"}</strong></div>
            <div className={styles.fact}><span>Saved</span><strong>{formatDate(resource.source.savedAt)}</strong></div>
            <div className={styles.fact}><span>Last fetched</span><strong>{formatDate(resource.source.lastFetchedAt)}</strong></div>
            <div className={styles.fact} data-mono="true"><span>Resource ID</span><strong>{resource.id}</strong></div>
            <div className={styles.fact}><span>Source / import ID</span><strong>{resource.source.sourceImportId || "Not available"}</strong></div>
            <div className={styles.fact}><span>Capture method</span><strong>{displayLabel(resource.source.captureMethod)}</strong></div>
            <div className={styles.fact}><span>Canonical state</span><strong>{displayLabel(resource.source.canonicalState)}</strong></div>
          </div>
          <QuickActionBar
            ariaLabel="Resource identity navigation"
            actions={[
              { id: "inspect-source", label: "Inspect source", onSelect: () => onOpenTab("source"), intent: "primary" },
              { id: "edit-identity", label: "Edit identity", disabled: true, disabledReason: "Identity changes require a native Resource writer, explicit save, diff preview, actor, version, and audit event." },
              { id: "refresh-metadata", label: "Refresh metadata", disabled: true, disabledReason: "No isolated fetch policy, metadata diff, persistence path, or audit writer is connected." }
            ]}
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Lifecycle</span>
              <h2>Lifecycle state</h2>
            </div>
            <span className={styles.stateChip}>{currentLifecycle}</span>
          </div>
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>Active mapping</span><strong>{resource.lifecycleState === "active" ? "Yes · legacy active" : "Not established"}</strong></div>
            <div className={styles.fact}><span>Pinned</span><strong>{resource.pinned === null ? "Not stored" : resource.pinned ? "Yes" : "No"}</strong></div>
            <div className={styles.fact}><span>Archived</span><strong>{resource.lifecycleState === "archived" ? "Yes" : resource.lifecycleState === "active" ? "No" : "Unknown"}</strong></div>
            <div className={styles.fact}><span>Review state</span><strong>{displayLabel(resource.review.state)}</strong></div>
            <div className={styles.fact}><span>Usefulness</span><strong>{displayLabel(resource.review.usefulness)}</strong></div>
            <div className={styles.fact}><span>Trust</span><strong>{displayLabel(resource.review.trustLevel)}</strong></div>
            <div className={styles.fact}><span>Freshness</span><strong>{displayLabel(resource.review.freshness)}</strong></div>
            <div className={styles.fact}><span>Confidence</span><strong>{displayLabel(resource.review.confidence)}</strong></div>
            <div className={styles.fact}><span>Source health</span><strong>{resource.health.lastCheckedAt ? displayLabel(resource.health.state) : "Not checked"}</strong></div>
            <div className={styles.fact}><span>Duplicate state</span><strong>{resource.health.duplicateState === "unknown" ? "Not scanned" : displayLabel(resource.health.duplicateState)}</strong></div>
          </div>
          <QuickActionBar
            ariaLabel="Resource lifecycle actions"
            actions={[
              { id: "review-evidence", label: "Review evidence", onSelect: () => onOpenTab("review"), intent: "primary" },
              { id: "preview-lifecycle", label: "Preview lifecycle", disabled: true, disabledReason: "Lifecycle previews require persisted citations, links, active-use evidence, retention rules, and a reversible archive contract." },
              { id: "archive", label: "Archive", intent: "destructive", disabled: true, disabledReason: "Archive is unavailable until consequence preview, restore, actor, version, and append-only audit semantics are connected." }
            ]}
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Operating cadence</span>
              <h2>Review and cadence</h2>
            </div>
            <span className={styles.stateChip} data-tone="amber">Not configured</span>
          </div>
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>Cadence</span><strong>{displayLabel(resource.review.cadence)}</strong></div>
            <div className={styles.fact}><span>Next review</span><strong>{formatDate(resource.review.nextReviewAt)}</strong></div>
            <div className={styles.fact}><span>Last reviewed</span><strong>{formatDate(resource.review.lastReviewedAt)}</strong></div>
            <div className={styles.fact}><span>Review owner</span><strong>Not stored</strong></div>
          </div>
          <ul className={styles.propertyRows}>
            <li><span><strong>Review triggers</strong><small>Active evidence and recurring queue</small></span><span className={styles.stateChip}>Not connected</span></li>
            <li><span><strong>Stale-source conditions</strong><small>Canonical change, title drift, broken URL</small></span><span className={styles.stateChip}>Policy preview</span></li>
            <li><span><strong>Metadata changes</strong><small>Create review issue and citation diff</small></span><span className={styles.stateChip}>No writer</span></li>
            <li><span><strong>Escalation target</strong><small>Resource review evidence; Broken Links only after a health result</small></span><span className={styles.stateChip}>Route only</span></li>
          </ul>
          <QuickActionBar
            actions={[
              { id: "set-cadence", label: "Set cadence", disabled: true, disabledReason: "Cadence requires a Resource policy record, owner identity, next-date semantics, explicit save, and audit." },
              { id: "create-review-note", label: "Create review note", disabled: true, disabledReason: "No reviewed Note draft, citation insertion, or source-link persistence path is connected." }
            ]}
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Note boundary</span>
              <h2>Citation and extraction defaults</h2>
            </div>
            <span className={styles.stateChip} data-tone="purple">Approved behavior</span>
          </div>
          <ul className={styles.propertyRows}>
            <li><span><strong>Citation storage</strong><small>Format remains an open product decision</small></span><span className={styles.stateChip}>Unresolved</span></li>
            <li><span><strong>Quote / snippet policy</strong><small>Short source-derived excerpts only</small></span><span className={styles.stateChip}>Boundary</span></li>
            <li><span><strong>Promotion</strong><small>Create or update a Note and retain this Resource as source</small></span><span className={styles.stateChip}>No writer</span></li>
            <li><span><strong>Citation updates</strong><small>Preview per-Note patches and require confirmation</small></span><span className={styles.stateChip}>Explicit</span></li>
          </ul>
          <p>Resource source context never becomes authored Note wording silently.</p>
          <QuickActionBar
            actions={[
              { id: "configure-citations", label: "Configure defaults", disabled: true, disabledReason: "Citation format, anchor storage, extraction policy, and Note insertion contracts are unresolved." },
              { id: "search-notes", label: "Inspect Note evidence", onSelect: () => onOpenTab("links") }
            ]}
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Module ownership</span>
              <h2>Link and relationship policies</h2>
            </div>
            <span className={styles.stateChip} data-tone="blue">Read-only contract</span>
          </div>
          <ul className={styles.propertyRows}>
            <li><span><strong>Projects</strong><small>Source / evidence; Projects owns project state</small></span><span>reference</span></li>
            <li><span><strong>Notes</strong><small>Citation / source; Notes owns authored body</small></span><span>reference</span></li>
            <li><span><strong>Reviews</strong><small>Evidence input; Reviews owns ReviewRun state</small></span><span>reference</span></li>
            <li><span><strong>Media</strong><small>Snapshot relation; Media owns the binary</small></span><span>reference</span></li>
            <li><span><strong>Finance</strong><small>Vendor, pricing, or contract context only</small></span><span>reference</span></li>
            <li><span><strong>People</strong><small>Author, owner, stakeholder, or expert context</small></span><span>reference</span></li>
            <li><span><strong>Personal Ops</strong><small>Supporting context; Personal Ops owns action loops</small></span><span>reference</span></li>
          </ul>
          <QuickActionBar
            actions={[
              { id: "inspect-links", label: "Inspect link evidence", onSelect: () => onOpenTab("links"), intent: "primary" },
              { id: "configure-links", label: "Configure policy", disabled: true, disabledReason: "Per-module ResourceLink policies and native ObjectLink persistence are not connected." }
            ]}
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Lifecycle impact</span>
              <h2>Archive, replace, and merge</h2>
            </div>
            <span className={styles.stateChip} data-tone="amber">Preview only</span>
          </div>
          <div className={styles.propertyRuleList} role="list" aria-label="Resource lifecycle policy previews">
            {PROPERTY_RULES.map((rule) => (
              <button
                type="button"
                role="listitem"
                className={styles.propertyRuleButton}
                data-resource-property-rule={rule.id}
                data-selected={selectedRule.id === rule.id || undefined}
                aria-pressed={selectedRule.id === rule.id}
                onClick={() => onSelectRule(rule.id)}
                key={rule.id}
              >
                <strong>{rule.label}</strong>
                <span>{rule.summary}</span>
              </button>
            ))}
          </div>
          <QuickActionBar
            actions={[
              { id: "duplicate-check", label: "Run duplicate check", disabled: true, disabledReason: "No duplicate job, reviewed decision, survivor mapping, or merge audit is connected." },
              { id: "replace-canonical", label: "Replace canonical", disabled: true, disabledReason: "Canonical replacement requires a source diff and explicit citation-patch confirmation." }
            ]}
          />
        </section>

        <section className={`${styles.panel} ${styles.propertyRuleInspector}`} data-wide="true">
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Selected policy preview</span>
              <h2>{selectedRule.label}</h2>
            </div>
            <span className={styles.stateChip} data-tone="amber">Not persisted</span>
          </div>
          <p>{selectedRule.summary}</p>
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>Applies when</span><strong>{selectedRule.appliesWhen}</strong></div>
            <div className={styles.fact}><span>Consequence</span><strong>{selectedRule.consequence}</strong></div>
          </div>
          <div>
            <span className={styles.eyebrow}>Preserves</span>
            <div className={styles.stateChips}>
              {selectedRule.preserves.map((item) => <span className={styles.stateChip} data-tone="green" key={item}>{item}</span>)}
            </div>
          </div>
          <SystemState
            variant="read_only"
            compact
            title="Consequence policy is not executable"
            description="This preview communicates the approved ownership boundary. It does not prove current citations, links, active use, retention, actor permission, rollback readiness, or an archive audit writer."
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>External behavior</span>
              <h2>Access and opening</h2>
            </div>
            <span className={styles.stateChip}>{sourceOpenable ? "Candidate available" : "No safe URL"}</span>
          </div>
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>Open behavior</span><strong>{sourceOpenable ? "New tab · user initiated" : "Unavailable"}</strong></div>
            <div className={styles.fact}><span>Access state</span><strong>Not checked</strong></div>
            <div className={styles.fact}><span>Paywall / login</span><strong>Unknown</strong></div>
            <div className={styles.fact}><span>Privacy</span><strong>{displayLabel(resource.provenance.privacy)}</strong></div>
            <div className={styles.fact}><span>Snapshot fallback</span><strong>{snapshotVerified ? "Verified relation" : "None verified"}</strong></div>
            <div className={styles.fact}><span>If source breaks</span><strong>Preserve last-known metadata</strong></div>
          </div>
          {resource.source.canonicalUrl ? (
            <a className={`${styles.button} ${styles.linkButton}`} data-primary="true" href={resource.source.canonicalUrl} target="_blank" rel="noreferrer">
              Open source ↗
            </a>
          ) : null}
          <QuickActionBar
            actions={[
              { id: "attach-snapshot", label: "Attach snapshot", disabled: true, disabledReason: "No approved Media snapshot write path, rights state, version, or native Resource-to-Media link persistence exists." }
            ]}
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Automation</span>
              <h2>Health and cleanup rules</h2>
            </div>
            <span className={styles.stateChip} data-tone="amber">Disconnected</span>
          </div>
          <ul className={styles.propertyRows}>
            <li><span><strong>URL health checks</strong><small>Manual and scheduled reachability evidence</small></span><span className={styles.stateChip}>No job</span></li>
            <li><span><strong>Duplicate scans</strong><small>On canonical change and import</small></span><span className={styles.stateChip}>No job</span></li>
            <li><span><strong>Metadata refresh</strong><small>Diff before any identity patch</small></span><span className={styles.stateChip}>No job</span></li>
            <li><span><strong>Review queue triggers</strong><small>Evidence gaps are derived locally in Needs Review</small></span><span className={styles.stateChip}>Read only</span></li>
            <li><span><strong>Citation drift checks</strong><small>Would compare Note citations with confirmed source identity</small></span><span className={styles.stateChip}>No job</span></li>
            <li><span><strong>Snapshot reminders</strong><small>Would route time-sensitive sources without a fallback</small></span><span className={styles.stateChip}>No job</span></li>
            <li><span><strong>Broken-link handling</strong><small>Requires persisted health evidence before routing</small></span><span className={styles.stateChip}>No job</span></li>
          </ul>
          <QuickActionBar
            actions={[
              { id: "run-cleanup", label: "Run cleanup", disabled: true, disabledReason: "No automation definition, actor permission, source access policy, operation receipt, or audit path exists." },
              { id: "edit-automation", label: "Configure automation", disabled: true, disabledReason: "Automation persistence and risk policy remain unresolved." }
            ]}
          />
        </section>
      </div>
    </div>
  );
}
