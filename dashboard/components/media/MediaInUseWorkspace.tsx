"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MediaReferencePlacement,
  MediaUsageEvidenceRecord
} from "../../lib/modules/media/types";
import type { MediaUsageEvidenceIndex } from "../../lib/modules/media/types";
import {
  parseMediaInUseUrlState,
  serializeMediaInUseUrlState,
  type MediaInUseFilter,
  type MediaInUseSort,
  type MediaInUseTab
} from "../../lib/native-objects/url-state";
import { getModuleRoute, getModuleViewRoute } from "../../lib/native-objects/routes";
import DirectoryPane from "../admin-shell/DirectoryPane";
import InspectorRail from "../admin-shell/InspectorRail";
import ModuleShell from "../admin-shell/ModuleShell";
import ModuleSidebar, { type ModuleSidebarSection } from "../admin-shell/ModuleSidebar";
import SharedAIDock from "../admin-shell/SharedAIDock";
import DenseObjectRow from "../operational/DenseObjectRow";
import DetailTabs, { DetailTabPanel, type DetailTab } from "../operational/DetailTabs";
import MetricStrip from "../operational/MetricStrip";
import ObjectHeader from "../operational/ObjectHeader";
import QuickActionBar from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import baseStyles from "../content-graph/ContentGraphWorkspace.module.css";
import styles from "./MediaInUseWorkspace.module.css";

type MediaInUseWorkspaceProps = {
  evidence: MediaUsageEvidenceIndex;
  initialLoadError?: string;
};

const IN_USE_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "usage", label: "Usage" },
  { id: "rights", label: "Rights" },
  { id: "versions", label: "Versions" },
  { id: "links", label: "Links" },
  { id: "audit", label: "Audit" },
  { id: "properties", label: "Properties" }
];

const FILTERS: ReadonlyArray<{
  id: MediaInUseFilter;
  label: string;
  tone: "blue" | "green" | "amber" | "pink" | "purple";
}> = [
  { id: "all", label: "All evidence", tone: "blue" },
  { id: "projects", label: "Projects", tone: "blue" },
  { id: "reviews", label: "Reviews", tone: "purple" },
  { id: "personal-ops", label: "Personal Ops", tone: "green" },
  { id: "attention", label: "Attention", tone: "pink" },
  { id: "legacy", label: "Legacy candidates", tone: "amber" },
  { id: "unreferenced", label: "No reference evidence", tone: "amber" }
];

const SORT_LABELS: Readonly<Record<MediaInUseSort, string>> = {
  "attention-desc": "Attention + locations",
  "locations-desc": "Reference locations",
  "updated-desc": "Updated — newest",
  title: "Title — A–Z"
};

const REPLACEMENT_REASON =
  "Replacement requires verified binary identity, version history, per-owner mutation adapters, a consequence preview, rollback, and an audit writer.";
const REMOVE_REASON =
  "Removing a reference requires the target owner's writer and confirmation. It must never delete the Media asset.";
const ARCHIVE_REASON =
  "Archive safety cannot be evaluated until every owner module is indexed and Media lifecycle, retention, and audit are connected.";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function ownerLabel(value: string) {
  return value === "personal_ops" ? "Personal Ops" : labelize(value);
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

function recordTitle(record: MediaUsageEvidenceRecord) {
  return record.asset?.title || record.assetRef.label || `Missing Media asset ${record.assetRef.objectId}`;
}

function recordUpdatedAt(record: MediaUsageEvidenceRecord) {
  return record.placements.reduce(
    (latest, placement) => placement.updatedAt.localeCompare(latest) > 0 ? placement.updatedAt : latest,
    record.asset?.updatedAt || ""
  );
}

function recordSearchText(record: MediaUsageEvidenceRecord) {
  return [
    record.id,
    record.assetRef.objectId,
    recordTitle(record),
    record.asset?.body || "",
    ...record.placements.flatMap((placement) => [
      placement.targetRef.label,
      placement.targetRef.objectId,
      placement.ownerModule,
      placement.sourceKind,
      placement.state,
      ...placement.relationships
    ]),
    ...record.legacyCandidates.flatMap((candidate) => [
      candidate.targetRef.label,
      candidate.targetRef.objectId,
      candidate.targetRef.module,
      ...candidate.legacyDirections,
      ...candidate.evidenceFields
    ]),
    ...record.unresolvedLegacyReferences.flatMap((reference) => [
      reference.value,
      reference.evidenceField,
      reference.legacyDirection || ""
    ])
  ].join(" ").toLocaleLowerCase();
}

function matchesQuery(record: MediaUsageEvidenceRecord, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return !normalized || recordSearchText(record).includes(normalized);
}

function matchesFilter(record: MediaUsageEvidenceRecord, filter: MediaInUseFilter) {
  if (filter === "projects") return record.placements.some((placement) => placement.ownerModule === "projects");
  if (filter === "reviews") return record.placements.some((placement) => placement.ownerModule === "reviews");
  if (filter === "personal-ops") return record.placements.some((placement) => placement.ownerModule === "personal_ops");
  if (filter === "attention") return record.state === "attention" || record.state === "missing_asset";
  if (filter === "legacy") return record.legacyCandidates.length > 0 || record.unresolvedLegacyReferences.length > 0;
  if (filter === "unreferenced") return record.state === "unreferenced";
  return true;
}

function attentionWeight(record: MediaUsageEvidenceRecord) {
  if (record.state === "missing_asset") return 4;
  if (record.placements.some((placement) => placement.state === "broken" || placement.state === "missing")) return 3;
  if (record.state === "attention") return 2;
  if (record.state === "legacy_only" || record.state === "coverage_incomplete") return 1;
  return 0;
}

function sortRecords(records: readonly MediaUsageEvidenceRecord[], sort: MediaInUseSort) {
  return [...records].sort((left, right) => {
    if (sort === "title") {
      return recordTitle(left).localeCompare(recordTitle(right), undefined, { sensitivity: "base" });
    }
    if (sort === "updated-desc") {
      return recordUpdatedAt(right).localeCompare(recordUpdatedAt(left)) || recordTitle(left).localeCompare(recordTitle(right));
    }
    if (sort === "locations-desc") {
      return right.placements.length - left.placements.length || recordTitle(left).localeCompare(recordTitle(right));
    }
    return attentionWeight(right) - attentionWeight(left) ||
      right.placements.length - left.placements.length ||
      recordTitle(left).localeCompare(recordTitle(right));
  });
}

function stateLabel(record: MediaUsageEvidenceRecord) {
  if (record.state === "referenced") return "Native reference evidence";
  if (record.state === "attention") return "Reference attention";
  if (record.state === "legacy_only") return "Legacy candidate only";
  if (record.state === "coverage_incomplete") return "Coverage incomplete";
  if (record.state === "missing_asset") return "Missing Media target";
  return "No reference evidence";
}

function stateTone(record: MediaUsageEvidenceRecord) {
  if (record.state === "referenced") return "green";
  if (record.state === "attention" || record.state === "missing_asset") return "pink";
  if (record.state === "legacy_only" || record.state === "coverage_incomplete") return "amber";
  return "blue";
}

export default function MediaInUseWorkspace({
  evidence,
  initialLoadError = ""
}: MediaInUseWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamKey = searchParams.toString();
  const urlState = useMemo(
    () => parseMediaInUseUrlState(searchParams),
    [searchParamKey, searchParams]
  );
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const inspectorTriggerRef = useRef<HTMLButtonElement>(null);
  const isInspectorOverlay = useMediaQuery("(max-width: 1240px)");

  const selectedRecord = useMemo(
    () => evidence.records.find((record) => record.assetRef.objectId === urlState.selected) || null,
    [evidence.records, urlState.selected]
  );
  const visibleRecords = useMemo(
    () => sortRecords(
      evidence.records.filter(
        (record) => matchesQuery(record, urlState.query) && matchesFilter(record, urlState.filter)
      ),
      urlState.sort
    ),
    [evidence.records, urlState.filter, urlState.query, urlState.sort]
  );

  useEffect(() => {
    const selected = urlState.selected && !selectedRecord ? "" : urlState.selected;
    const canonical = serializeMediaInUseUrlState({ ...urlState, selected }, searchParams).toString();
    if (canonical !== searchParamKey) {
      router.replace(`${pathname}${canonical ? `?${canonical}` : ""}`, { scroll: false });
    }
  }, [pathname, router, searchParamKey, searchParams, selectedRecord, urlState]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (isInspectorOverlay) setInspectorOpen(Boolean(urlState.selected));
  }, [isInspectorOverlay, urlState.selected]);

  function updateUrl(
    next: Partial<typeof urlState>,
    mode: "push" | "replace" = "replace"
  ) {
    const params = serializeMediaInUseUrlState({ ...urlState, ...next }, searchParams);
    const href = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    router[mode](href, { scroll: false });
  }

  function updateScope(next: { query?: string; filter?: MediaInUseFilter }) {
    const query = next.query ?? urlState.query;
    const filter = next.filter ?? urlState.filter;
    const nextVisible = sortRecords(
      evidence.records.filter((record) => matchesQuery(record, query) && matchesFilter(record, filter)),
      urlState.sort
    );
    updateUrl({
      ...next,
      selected: nextVisible.some((record) => record.assetRef.objectId === urlState.selected)
        ? urlState.selected
        : ""
    });
  }

  function selectRecord(record: MediaUsageEvidenceRecord) {
    setMobileSidebarOpen(false);
    if (isInspectorOverlay) setInspectorOpen(true);
    updateUrl({ selected: record.assetRef.objectId, ai: false }, "push");
  }

  function setChecked(id: string, checked: boolean) {
    setBatchSelection((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const visiblePlacements = visibleRecords.flatMap((record) => record.placements);
  const visibleLegacyCandidates = visibleRecords.reduce(
    (total, record) => total + record.legacyCandidates.length + record.unresolvedLegacyReferences.length,
    0
  );
  const hiddenSelectedCount = batchSelection.size - visibleRecords.filter((record) => batchSelection.has(record.id)).length;
  const readFailedCoverage = Object.values(evidence.coverage).filter((entry) => entry.indexState === "read_failed");

  const sidebarSections: readonly ModuleSidebarSection[] = [
    {
      id: "media",
      label: "Media",
      items: [
        { id: "all", label: "All Media", count: evidence.summary.assetCount, href: getModuleRoute("media") },
        { id: "recent", label: "Recent Uploads", disabled: true, disabledReason: "Durable upload history is not connected." },
        { id: "pinned", label: "Pinned", disabled: true, disabledReason: "Pinned state is not stored by the legacy Media adapter." },
        { id: "needs-review", label: "Needs Review", href: getModuleViewRoute("media", "needs-review") },
        { id: "in-use", label: "In Use", count: evidence.records.filter((record) => record.placements.length > 0).length, active: true, href: getModuleViewRoute("media", "in-use") },
        { id: "archived", label: "Archived", disabled: true, disabledReason: "Native Media lifecycle state is not connected." }
      ]
    },
    {
      id: "types",
      label: "Types",
      items: ["Images", "Video", "Audio", "Screenshots", "Design Files", "Documents / PDFs", "Source Files"].map((label) => ({
        id: `type-${label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        label,
        disabled: true,
        disabledReason: "Verified Media type is not stored by the legacy file adapter."
      }))
    },
    {
      id: "context",
      label: "Reference owners",
      items: [
        { id: "projects", label: "Projects", count: evidence.records.filter((record) => matchesFilter(record, "projects")).length, onSelect: () => updateScope({ filter: "projects" }) },
        { id: "reviews", label: "Reviews", count: evidence.records.filter((record) => matchesFilter(record, "reviews")).length, onSelect: () => updateScope({ filter: "reviews" }) },
        { id: "personal-ops", label: "Personal Ops", count: evidence.records.filter((record) => matchesFilter(record, "personal-ops")).length, onSelect: () => updateScope({ filter: "personal-ops" }) }
      ]
    },
    {
      id: "data",
      label: "Data",
      items: [
        { id: "upload-queue", label: "Upload Queue", href: getModuleViewRoute("media", "upload-queue") },
        { id: "missing-metadata", label: "Missing Metadata", href: getModuleViewRoute("media", "missing-metadata") },
        { id: "duplicates", label: "Duplicates", href: getModuleViewRoute("media", "duplicates") },
        { id: "rights", label: "Rights / Usage", href: getModuleViewRoute("media", "rights-usage") },
        { id: "settings", label: "Settings", disabled: true, disabledReason: "Native Media settings remain an open product decision." }
      ]
    }
  ];

  const sidebar = (
    <ModuleSidebar
      id="media-in-use-sidebar"
      title="Media"
      description="Binary assets, provenance, rights, versions, references, and replacement."
      sections={sidebarSections}
      mobileOpen={mobileSidebarOpen}
      onClose={() => setMobileSidebarOpen(false)}
      className={baseStyles.sidebar}
      footer={
        <p className={baseStyles.sidebarFootnote}>
          Target-owned references are indexed here. Native AssetUsage synchronization is not connected.
        </p>
      }
    />
  );

  function placementList(record: MediaUsageEvidenceRecord) {
    if (!record.placements.length) {
      return (
        <SystemState
          compact
          variant="read_only"
          title="No native reference location"
          description="No indexed Projects, Reviews, or Personal Ops object currently supplies a native reference for this asset. This does not prove it is unused."
        />
      );
    }
    return (
      <ul className={styles.locationList} aria-label="Native reference locations">
        {record.placements.map((placement) => (
          <li key={placement.id} data-reference-state={placement.state}>
            <div>
              <span>{ownerLabel(placement.ownerModule)} · {labelize(placement.sourceKind)}</span>
              <strong>{placement.targetRef.label}</strong>
              <small>
                {placement.relationships.map(labelize).join(" · ")} · {placement.sourceRecordIds.length} stored reference signal{placement.sourceRecordIds.length === 1 ? "" : "s"}
                {placement.referenceIdentity.kind !== "asset" ? ` · ${labelize(placement.referenceIdentity.kind)} ${placement.referenceIdentity.objectId}` : ""}
                {` · Updated ${formatDate(placement.updatedAt)}`}
              </small>
            </div>
            <div className={styles.locationActions}>
              <span className={baseStyles.stateChip} data-tone={placement.state === "current" ? "green" : placement.state === "archived" ? "blue" : "amber"}>
                {labelize(placement.state)} reference
              </span>
              <Link className={baseStyles.linkButton} href={placement.targetRef.route}>Open owner</Link>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  function renderPanel(tab: MediaInUseTab) {
    if (urlState.selected && !selectedRecord) {
      return (
        <SystemState
          variant="stale"
          title="This evidence record is no longer available"
          description="The selected Media identifier is absent from the current owner-reference index. No reference or Media object was changed."
          action={{ label: "Return to index", onSelect: () => updateUrl({ selected: "" }, "push") }}
        />
      );
    }
    if (!selectedRecord) {
      return (
        <SystemState
          variant="read_only"
          title="Select an asset evidence row"
          description="Choose a row body to inspect reference locations. Checkboxes only control local batch selection."
        />
      );
    }

    if (tab === "usage") {
      const currentCount = selectedRecord.placements.filter((placement) => placement.state === "current").length;
      const attentionCount = selectedRecord.placements.filter((placement) => ["pending", "stale", "broken", "missing"].includes(placement.state)).length;
      return (
        <div className={styles.inspectorStack}>
          <section className={styles.usageStrip} aria-label="Reference evidence summary">
            <div><span>Native locations</span><strong>{selectedRecord.placements.length}</strong></div>
            <div><span>Current references</span><strong>{currentCount}</strong></div>
            <div><span>Needs classification</span><strong>{attentionCount}</strong></div>
            <div><span>AssetUsage records</span><strong>—</strong><small>Repository not connected</small></div>
          </section>
          <section className={baseStyles.panel}>
            <div className={styles.panelHeading}>
              <div><h2>Native reference locations</h2><p>Target-owned placements, not a complete usage registry.</p></div>
              <strong>{selectedRecord.placements.length}</strong>
            </div>
            {placementList(selectedRecord)}
          </section>
          <div className={styles.twoColumn}>
            <section className={baseStyles.panel}>
              <h2>Visibility + surface area</h2>
              <dl className={baseStyles.factGrid}>
                <div className={baseStyles.fact}><span>Public</span><strong>Unknown</strong></div>
                <div className={baseStyles.fact}><span>Internal</span><strong>Unknown</strong></div>
                <div className={baseStyles.fact}><span>Shared externally</span><strong>Unknown</strong></div>
                <div className={baseStyles.fact}><span>Version deployed</span><strong>Unknown</strong></div>
              </dl>
            </section>
            <section className={baseStyles.panel}>
              <h2>Replacement boundary</h2>
              <p>{REPLACEMENT_REASON}</p>
              <QuickActionBar
                ariaLabel="Unavailable replacement actions"
                actions={[
                  { id: "replace-selected", label: "Replace selected", disabled: true, disabledReason: REPLACEMENT_REASON },
                  { id: "replace-everywhere", label: "Replace everywhere", disabled: true, disabledReason: REPLACEMENT_REASON },
                  { id: "remove-usage", label: "Remove reference", disabled: true, disabledReason: REMOVE_REASON }
                ]}
              />
            </section>
          </div>
        </div>
      );
    }

    if (tab === "overview") {
      return (
        <div className={`${baseStyles.overviewGrid} ${styles.overviewGrid}`}>
          <section className={baseStyles.panel}>
            <h2>Evidence scope</h2>
            <dl className={baseStyles.factGrid}>
              <div className={baseStyles.fact}><span>Native locations</span><strong>{selectedRecord.placements.length}</strong></div>
              <div className={baseStyles.fact}><span>Legacy candidates</span><strong>{selectedRecord.legacyCandidates.length}</strong></div>
              <div className={baseStyles.fact}><span>Unresolved legacy IDs</span><strong>{selectedRecord.unresolvedLegacyReferences.length}</strong></div>
              <div className={baseStyles.fact}><span>Usage completeness</span><strong>Not established</strong></div>
            </dl>
          </section>
          <section className={baseStyles.panel}>
            <h2>Selected asset</h2>
            <p>{selectedRecord.asset?.body?.trim() || "No legacy description is stored for this Media identifier."}</p>
          </section>
          <section className={baseStyles.panel} data-wide="true">
            <h2>Why this is useful now</h2>
            <p>Native target modules can expose where they retain a Media reference today. Media can index those locations without duplicating their objects or pretending a synchronized AssetUsage writer exists.</p>
          </section>
        </div>
      );
    }

    if (tab === "rights") {
      return (
        <div className={styles.inspectorStack}>
          <section className={baseStyles.panel}>
            <h2>Rights dependency</h2>
            <dl className={baseStyles.factGrid}>
              <div className={baseStyles.fact}><span>Canonical rights state</span><strong>{selectedRecord.asset ? "Needs confirmation" : "Asset unavailable"}</strong></div>
              <div className={baseStyles.fact}><span>Provisional scope</span><strong>{selectedRecord.asset ? "Internal / review" : "Unknown"}</strong></div>
              <div className={baseStyles.fact}><span>Confirmed actor</span><strong>Not recorded</strong></div>
              <div className={baseStyles.fact}><span>Usage-risk propagation</span><strong>Not connected</strong></div>
            </dl>
          </section>
          <SystemState compact variant="read_only" title="Rights changes cannot be propagated" description="A future rights decision must flag affected references; it must never silently delete them." />
        </div>
      );
    }

    if (tab === "versions") {
      return (
        <div className={styles.inspectorStack}>
          <section className={baseStyles.panel}>
            <h2>Version + derivative dependency</h2>
            <dl className={baseStyles.factGrid}>
              <div className={baseStyles.fact}><span>Current Media version</span><strong>{selectedRecord.asset?.currentVersionId || "Not connected"}</strong></div>
              <div className={baseStyles.fact}><span>Version-specific references</span><strong>{selectedRecord.placements.filter((placement) => placement.assetRef.versionId).length}</strong></div>
              <div className={baseStyles.fact}><span>Derivative chain</span><strong>Not connected</strong></div>
              <div className={baseStyles.fact}><span>Rollback</span><strong>Open decision</strong></div>
            </dl>
          </section>
          <SystemState compact variant="read_only" title="No version chain can be inferred" description="A target reference without a version ID points only to asset identity. It cannot establish which binary or derivative is in use." />
        </div>
      );
    }

    if (tab === "links") {
      return (
        <div className={styles.inspectorStack}>
          <section className={baseStyles.panel}>
            <h2>Native owner references</h2>
            {placementList(selectedRecord)}
          </section>
          <section className={baseStyles.panel}>
            <h2>Legacy relation candidates</h2>
            {selectedRecord.legacyCandidates.length ? (
              <ul className={styles.legacyList}>
                {selectedRecord.legacyCandidates.map((candidate) => (
                  <li key={candidate.id}>
                    <span><strong>{candidate.targetRef.label}</strong><small>{candidate.legacyDirections.map(labelize).join(" · ")} · untyped candidate</small></span>
                    <Link className={baseStyles.linkButton} href={candidate.targetRef.route}>Open owner</Link>
                  </li>
                ))}
              </ul>
            ) : <p>No exact legacy relation-ID candidate resolves in the current Notes, Resources, and Media read model.</p>}
          </section>
          {selectedRecord.unresolvedLegacyReferences.length > 0 && (
            <section className={baseStyles.panel}>
              <h2>Unresolved legacy relation IDs</h2>
              <ul className={styles.legacyList}>
                {selectedRecord.unresolvedLegacyReferences.map((reference) => (
                  <li key={reference.id}><span><strong>{reference.value}</strong><small>{reference.evidenceField} · not classified as broken</small></span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      );
    }

    if (tab === "audit") {
      return (
        <div className={styles.inspectorStack}>
          <section className={baseStyles.panel}>
            <h2>Target-owned reference evidence</h2>
            {selectedRecord.placements.length ? (
              <ol className={styles.auditList}>
                {selectedRecord.placements.map((placement) => (
                  <li key={placement.id}><time>{formatDate(placement.updatedAt)}</time><span><strong>{placement.targetRef.label}</strong><small>{ownerLabel(placement.ownerModule)} · {labelize(placement.state)} reference</small></span></li>
                ))}
              </ol>
            ) : <p>No native target reference timestamps are available.</p>}
          </section>
          <SystemState compact variant="read_only" title="No Media usage audit exists" description="These timestamps belong to target-owned reference records. The index does not synthesize usage, replacement, removal, archive, or rights events." />
        </div>
      );
    }

    return (
      <div className={styles.inspectorStack}>
        <section className={baseStyles.panel}>
          <h2>Read-model properties</h2>
          <dl className={baseStyles.factGrid}>
            <div className={baseStyles.fact}><span>Media ID</span><strong>{selectedRecord.assetRef.objectId}</strong></div>
            <div className={baseStyles.fact}><span>Owner module</span><strong>Media</strong></div>
            <div className={baseStyles.fact}><span>Migration state</span><strong>{selectedRecord.asset?.migrationState ? labelize(selectedRecord.asset.migrationState) : "Missing target"}</strong></div>
            <div className={baseStyles.fact}><span>Readable owner indexes</span><strong>{evidence.summary.availableOwnerCount}/{evidence.summary.knownOwnerModuleCount}</strong></div>
            <div className={baseStyles.fact}><span>Created</span><strong>{formatDate(selectedRecord.asset?.createdAt)}</strong></div>
            <div className={baseStyles.fact}><span>Updated</span><strong>{formatDate(selectedRecord.asset?.updatedAt)}</strong></div>
          </dl>
        </section>
        <SystemState compact variant="read_only" title="Technical properties remain unavailable" description="Filename, MIME type, size, checksum, dimensions, storage identity, and binary validation are not present in the legacy Media adapter." />
      </div>
    );
  }

  const inspectorTitle = (
    <div className={baseStyles.inspectorHeader}>
      <ObjectHeader
        objectType="Media reference evidence"
        title={selectedRecord ? recordTitle(selectedRecord) : "In Use inspector"}
        subtitle={selectedRecord ? `Media ID ${selectedRecord.assetRef.objectId} · target-owned reference index` : "Select a row to inspect owner locations"}
        identity={selectedRecord ? recordTitle(selectedRecord).slice(0, 2).toUpperCase() : "IU"}
        headingLevel="h2"
        states={selectedRecord ? (
          <>
            <span className={baseStyles.stateChip} data-tone={stateTone(selectedRecord)}>{stateLabel(selectedRecord)}</span>
            <span className={baseStyles.stateChip} data-tone="amber">Read-only index</span>
          </>
        ) : <span className={baseStyles.stateChip}>AssetUsage disconnected</span>}
      />
    </div>
  );

  const inspectorFooter = selectedRecord ? (
    <div className={styles.inspectorFooter}>
      <p><strong>Reference writes remain with their owner modules.</strong> This page performs no replacement, removal, archive, or rights mutation.</p>
      <QuickActionBar
        sticky
        ariaLabel="Media usage evidence actions"
        actions={[
          ...(selectedRecord.asset ? [{ id: "open-media", label: "Open Media record", href: selectedRecord.assetRef.route, intent: "primary" as const }] : []),
          ...(selectedRecord.placements[0] ? [{ id: "open-owner", label: "Open first owner", href: selectedRecord.placements[0].targetRef.route }] : []),
          { id: "replace", label: "Replace", disabled: true, disabledReason: REPLACEMENT_REASON },
          { id: "remove", label: "Remove reference", disabled: true, disabledReason: REMOVE_REASON },
          { id: "archive", label: "Archive", disabled: true, disabledReason: ARCHIVE_REASON }
        ]}
      />
    </div>
  ) : undefined;

  const inspector = (
    <InspectorRail
      id="media-in-use-inspector"
      readOnly
      overlay={isInspectorOverlay}
      overlayOpen={!isInspectorOverlay || inspectorOpen}
      onRequestClose={() => setInspectorOpen(false)}
      resolveReturnFocus={() => (
        document.querySelector<HTMLElement>("[data-media-usage-record] .dense-object-row__body.is-selected")
        || inspectorTriggerRef.current
      )}
      ariaLabel="Media usage evidence inspector"
      className={styles.inspector}
      title={inspectorTitle}
      actions={isInspectorOverlay ? <button className={baseStyles.button} type="button" onClick={() => setInspectorOpen(false)}>Close</button> : undefined}
      footer={inspectorFooter}
    >
      <DetailTabs
        id="media-in-use-tabs"
        tabs={IN_USE_TABS}
        activeTab={urlState.tab}
        onTabChange={(tab) => updateUrl({ tab: tab as MediaInUseTab })}
        ariaLabel="Media usage evidence details"
        className={baseStyles.tabs}
      />
      {IN_USE_TABS.map((tab) => (
        <DetailTabPanel
          tabsId="media-in-use-tabs"
          tabId={tab.id}
          active={urlState.tab === tab.id}
          key={tab.id}
          className={styles.tabPanel}
        >
          {renderPanel(tab.id as MediaInUseTab)}
        </DetailTabPanel>
      ))}
    </InspectorRail>
  );

  const aiDock = mobileSidebarOpen || (isInspectorOverlay && inspectorOpen) ? null : (
    <SharedAIDock
      open={urlState.ai}
      onOpenChange={(open) => updateUrl({ ai: open })}
      className={selectedRecord ? styles.aiDockRaised : undefined}
      context={{
        module: "media",
        activeTab: urlState.tab,
        visibleScope: selectedRecord ? `${recordTitle(selectedRecord)} · reference evidence only` : "In Use · reference evidence index"
      }}
    />
  );

  const selectionBar = batchSelection.size > 0 ? (
    <div className={baseStyles.batchBar} aria-label="Media reference evidence batch selection">
      <strong>{batchSelection.size} selected{hiddenSelectedCount > 0 ? ` · ${hiddenSelectedCount} outside this view` : ""}</strong>
      <button className={baseStyles.button} type="button" onClick={() => setBatchSelection(new Set())}>Clear</button>
      <QuickActionBar
        ariaLabel="Unavailable Media reference batch actions"
        actions={[
          { id: "batch-replace", label: "Replace all", disabled: true, disabledReason: REPLACEMENT_REASON },
          { id: "batch-review", label: "Review references", disabled: true, disabledReason: "Native AssetUsage review state and its audit writer are not connected." },
          { id: "batch-export", label: "Export map", disabled: true, disabledReason: "No stable AssetUsage export contract is connected." }
        ]}
      />
    </div>
  ) : undefined;

  return (
    <ModuleShell
      module="media"
      sidebar={sidebar}
      inspector={inspector}
      aiDock={aiDock}
      mode="review"
      ariaLabel="Media In Use evidence workspace"
      className={`${baseStyles.shell} ${styles.shell}`}
    >
      <button
        className={`${baseStyles.button} ${baseStyles.mobileMenuButton}`}
        type="button"
        onClick={() => { setInspectorOpen(false); setMobileSidebarOpen(true); updateUrl({ ai: false }); }}
        aria-label="Open Media navigation"
        aria-expanded={mobileSidebarOpen}
        aria-controls="media-in-use-sidebar"
      >
        Menu
      </button>
      <button
        ref={inspectorTriggerRef}
        className={`${baseStyles.button} ${baseStyles.mobileInspectorButton}`}
        type="button"
        onClick={() => { setMobileSidebarOpen(false); setInspectorOpen(true); updateUrl({ ai: false }); }}
        aria-label="Open Media usage evidence details"
        aria-expanded={inspectorOpen}
        aria-controls="media-in-use-inspector"
        disabled={!selectedRecord}
      >
        Details
      </button>
      {(mobileSidebarOpen || (isInspectorOverlay && inspectorOpen)) && (
        <button type="button" className={baseStyles.scrim} aria-label="Close open panel" onClick={() => { setMobileSidebarOpen(false); setInspectorOpen(false); }} />
      )}

      <DirectoryPane
        ariaLabel="Media reference evidence directory"
        className={`${baseStyles.directory} ${styles.directory}`}
        selectionBar={selectionBar}
      >
        <div className={baseStyles.mainScroll} data-media-in-use-state={initialLoadError || readFailedCoverage.length ? "partial" : evidence.records.length ? "ready" : "empty"}>
          <div className={baseStyles.directoryHeader}>
            <div>
              <span className={baseStyles.eyebrow}>Media · Reference index</span>
              <h1>In Use</h1>
              <p>Inspect target-owned Media references without inventing usage synchronization.</p>
            </div>
            <QuickActionBar
              ariaLabel="Media In Use actions"
              actions={[
                { id: "filter", label: "Filter", onSelect: () => searchInputRef.current?.focus() },
                { id: "batch", label: "Batch review", disabled: true, disabledReason: "Native AssetUsage review and audit are not connected." },
                { id: "replace", label: "Replace", disabled: true, disabledReason: REPLACEMENT_REASON },
                { id: "export", label: "Export", disabled: true, disabledReason: "No stable AssetUsage export contract is connected." },
                { id: "upload", label: "Choose files", href: getModuleViewRoute("media", "upload-queue"), intent: "primary" }
              ]}
            />
          </div>

          <div className={styles.capabilityBoundary} role="note">
            <strong>Reference evidence, not AssetUsage</strong>
            <span>Projects, Reviews, and Personal Ops retain their own references. Media indexes those current snapshots read-only; visibility, deployed versions, usage counts, replacement safety, and complete cross-module coverage are not claimed.</span>
          </div>

          {(initialLoadError || readFailedCoverage.length > 0) && (
            <div className={styles.coverageBoundary} role="status">
              <strong>Partial index coverage</strong>
              <span>{initialLoadError ? "Legacy Media records could not be loaded. " : ""}{readFailedCoverage.length ? `${readFailedCoverage.map((entry) => ownerLabel(entry.ownerModule)).join(", ")} reference snapshots could not be read. ` : ""}Visible records remain read-only and no absence is treated as proof of no usage.</span>
            </div>
          )}

          <MetricStrip
            className={styles.metricStrip}
            ariaLabel="Media reference index summary"
            items={[
              { id: "assets", label: "Indexed Media IDs", value: visibleRecords.length, detail: "Current query scope" },
              { id: "locations", label: "Native owner locations", value: visiblePlacements.length, detail: "Not AssetUsage" },
              { id: "projects", label: "Project references", value: visiblePlacements.filter((placement) => placement.ownerModule === "projects").length, detail: "Target-owned" },
              { id: "reviews", label: "Review references", value: visiblePlacements.filter((placement) => placement.ownerModule === "reviews").length, detail: "Target-owned" },
              { id: "ops", label: "Personal Ops references", value: visiblePlacements.filter((placement) => placement.ownerModule === "personal_ops").length, detail: "Needs classification" },
              { id: "attention", label: "Attention records", value: visibleRecords.filter((record) => record.state === "attention" || record.state === "missing_asset").length, detail: "Literal state only", tone: "attention" },
              { id: "legacy", label: "Legacy relation evidence", value: visibleLegacyCandidates, detail: "Untyped candidates" },
              { id: "usage", label: "AssetUsage records", value: "—", detail: "Repository not connected" }
            ]}
          />

          <label className={baseStyles.search}>
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchInputRef}
              type="search"
              value={urlState.query}
              onChange={(event) => updateScope({ query: event.target.value })}
              placeholder="Search asset, owner location, project, review, or retained relation ID"
              aria-label="Search Media reference evidence"
            />
            <kbd>/</kbd>
          </label>

          <div className={baseStyles.chipRow} aria-label="Media reference evidence filters">
            {FILTERS.map((filter) => (
              <button
                className={baseStyles.chip}
                type="button"
                data-active={urlState.filter === filter.id}
                data-tone={filter.tone}
                aria-pressed={urlState.filter === filter.id}
                onClick={() => updateScope({ filter: filter.id })}
                key={filter.id}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className={baseStyles.sortRow}>
            <span><strong>{visibleRecords.length}</strong> Media evidence record{visibleRecords.length === 1 ? "" : "s"}</span>
            <label className={styles.sortControl}>
              <span>Sort</span>
              <select value={urlState.sort} onChange={(event) => updateUrl({ sort: event.target.value as MediaInUseSort })}>
                {(Object.keys(SORT_LABELS) as MediaInUseSort[]).map((sort) => <option value={sort} key={sort}>{SORT_LABELS[sort]}</option>)}
              </select>
            </label>
          </div>

          {!evidence.records.length ? (
            <SystemState
              variant={initialLoadError ? "error" : "read_only"}
              title={initialLoadError ? "Media reference evidence could not be loaded" : "No Media identifiers or owner references are available"}
              description={initialLoadError ? "The owner-reference reads performed no mutation. Retry after the legacy Media read path is available." : "The current stores contain no legacy Media assets and no Projects, Reviews, or Personal Ops reference to a Media identifier. This is not proof that no external usage exists."}
              action={initialLoadError ? { label: "Retry", onSelect: () => router.refresh() } : undefined}
            />
          ) : !visibleRecords.length ? (
            <SystemState variant="empty" title="No reference evidence matches this view" description="Change the query or filter. No Media or owner reference was changed." action={{ label: "Reset view", onSelect: () => updateScope({ query: "", filter: "all" }) }} />
          ) : (
            <div className={styles.recordGroups}>
              {[
                { id: "attention", label: "Attention", description: "Literal stale, broken, missing, pending-classification, orphan, or unresolved-reference evidence.", records: visibleRecords.filter((record) => record.state === "attention" || record.state === "missing_asset") },
                { id: "native", label: "Native reference locations", description: "Target-owned native references that do not currently carry an attention state.", records: visibleRecords.filter((record) => record.placements.length > 0 && record.state === "referenced") },
                { id: "legacy", label: "Legacy relation candidates", description: "Exact retained relation-ID evidence that is not a native link or usage placement.", records: visibleRecords.filter((record) => record.state === "legacy_only") },
                { id: "coverage", label: "Coverage incomplete", description: "No indexed reference was found, but one or more connected owner snapshots failed; no absence conclusion is shown.", records: visibleRecords.filter((record) => record.state === "coverage_incomplete") },
                { id: "unreferenced", label: "No indexed reference evidence", description: "No indexed owner or resolvable legacy relation currently references these Media IDs; usage remains unknown.", records: visibleRecords.filter((record) => record.state === "unreferenced") }
              ].filter((group) => group.records.length > 0).map((group) => (
                <section className={styles.recordGroup} aria-labelledby={`media-in-use-${group.id}`} key={group.id}>
                  <header className={baseStyles.queueGroupHeader}>
                    <div><h2 id={`media-in-use-${group.id}`}>{group.label}</h2><p>{group.description}</p></div>
                    <strong>{group.records.length}</strong>
                  </header>
                  <div className={baseStyles.list} data-density="compact" role="list">
                    {group.records.map((record) => (
                      <div data-media-usage-record={record.id} key={record.id}>
                        <DenseObjectRow
                          id={record.id}
                          title={recordTitle(record)}
                          description={`${stateLabel(record)} · ${record.placements.length} native location${record.placements.length === 1 ? "" : "s"}`}
                          metadata={`Media ID ${record.assetRef.objectId} · updated ${formatDate(recordUpdatedAt(record))}`}
                          trailing={<><strong>{Array.from(new Set(record.placements.map((placement) => ownerLabel(placement.ownerModule)))).join(" · ") || "No indexed owner"}</strong><span>{record.legacyCandidates.length + record.unresolvedLegacyReferences.length} legacy signal{record.legacyCandidates.length + record.unresolvedLegacyReferences.length === 1 ? "" : "s"}</span></>}
                          selected={record.assetRef.objectId === urlState.selected}
                          onSelect={() => selectRecord(record)}
                          checkbox={{
                            checked: batchSelection.has(record.id),
                            onCheckedChange: (checked) => setChecked(record.id, checked),
                            label: `Select ${recordTitle(record)} for local batch actions`
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div className={styles.scopeFootnote}>
            <span>{evidence.summary.availableOwnerCount}/{evidence.summary.knownOwnerModuleCount} owner modules currently provide a readable native reference index; {evidence.summary.disconnectedOwnerModuleCount} remain disconnected by design.</span>
            <span>{evidence.summary.missingAssetCount} retained owner reference{evidence.summary.missingAssetCount === 1 ? "" : "s"} point to a Media ID absent from the legacy asset read.</span>
            <span>Notes, Resources, People, and Finance usage adapters are not connected; absence never means unused.</span>
          </div>
        </div>
      </DirectoryPane>
    </ModuleShell>
  );
}
