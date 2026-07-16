"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DirectoryPane from "./admin-shell/DirectoryPane";
import InspectorRail from "./admin-shell/InspectorRail";
import ModuleShell from "./admin-shell/ModuleShell";
import ModuleSidebar, { type ModuleSidebarSection } from "./admin-shell/ModuleSidebar";
import SharedAIDock from "./admin-shell/SharedAIDock";
import DenseObjectRow from "./operational/DenseObjectRow";
import DetailTabs, { DetailTabPanel, type DetailTab } from "./operational/DetailTabs";
import EvidenceChecklist from "./operational/EvidenceChecklist";
import MetricStrip from "./operational/MetricStrip";
import ObjectHeader from "./operational/ObjectHeader";
import QuickActionBar from "./operational/QuickActionBar";
import SystemState from "./operational/SystemState";
import {
  contentLinksForObject,
  contentTargetGroupsForObject,
  unresolvedReferencesForObject,
  type LegacyContentGraph
} from "../lib/modules/content-graph/types";
import type {
  ResourceRecord,
  ResourceSourceEvidenceState,
  ResourceType
} from "../lib/modules/resources/types";
import { buildResourceReviewEvidence } from "../lib/modules/resources/review-evidence";
import { buildResourceSourceEvidenceReport } from "../lib/modules/resources/source-evidence";
import {
  parseResourcesUrlState,
  serializeResourcesUrlState,
  type ResourcesUrlState
} from "../lib/native-objects/url-state";
import { getModuleRoute, getNativeObjectRoute } from "../lib/native-objects/routes";
import styles from "./content-graph/ContentGraphWorkspace.module.css";

type ResourcesWorkspaceProps = {
  initialResources: ResourceRecord[];
  contentGraph: LegacyContentGraph;
  initialMode?: "index" | "detail";
  initialSelectedId?: string;
  initialLoadError?: string;
};

type ResourcesView = ResourcesUrlState["view"];
type ResourcesSort = ResourcesUrlState["sort"];
type ResourcesTab = ResourcesUrlState["tab"];

const TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "source", label: "Source" },
  { id: "links", label: "Links" },
  { id: "notes", label: "Notes" },
  { id: "review", label: "Review" },
  { id: "properties", label: "Properties" }
];

const TYPE_LABELS: Readonly<Record<ResourceType, string>> = {
  article: "Article",
  website: "Website",
  tool: "Tool",
  vendor: "Vendor",
  document: "Document",
  dataset: "Dataset",
  video_media: "Video / Media",
  book: "Book",
  contract_invoice: "Contract / Invoice",
  external_account: "External account",
  unknown: "Type unverified"
};

const LIBRARY_VIEWS: ReadonlyArray<[ResourcesView, string]> = [
  ["all", "All Resources"],
  ["pinned", "Pinned"],
  ["recent", "Recent"],
  ["needs-review", "Needs Review"],
  ["cited", "Cited / Used"],
  ["archived", "Archived"]
];

const TYPE_ROWS = [
  "Articles",
  "Websites",
  "Tools",
  "Vendors",
  "Documents",
  "Datasets",
  "Video / Media",
  "Books",
  "Contracts / Invoices"
] as const;

const CONTEXT_ROWS = [
  "Linked to People",
  "Linked to Projects",
  "Linked to Notes",
  "Linked to Finance",
  "Linked to Reviews",
  "Linked to Personal Ops"
] as const;

const VIEW_LIMITATIONS: Readonly<Partial<Record<ResourcesView, string>>> = {
  pinned: "Pinned state is not stored by the legacy Resources adapter.",
  recent: "The recency window is an open product decision, so this view is not inferred from timestamps.",
  "needs-review": "Native Resource review state is not available in the legacy Personal Records model.",
  cited: "Citation and active-use records are not connected yet.",
  archived: "Legacy statuses cannot be safely inferred as native Resource archive state."
};

const QUICK_FILTERS = [
  ["all", "All", ""],
  ["type", "Type", "Native Resource type is not available in the legacy adapter."],
  ["source", "Source", "Source taxonomy is not available in the legacy adapter."],
  ["status", "Status", "Native lifecycle state cannot be safely inferred from most legacy statuses."],
  ["linked-module", "Linked module", "Legacy relation IDs are not typed native ObjectLinks."],
  ["owner", "Owner", "Resource owner is not stored by the legacy adapter."],
  ["recency", "Recency", "The recency window is an open product decision."],
  ["usefulness", "Usefulness", "Usefulness is not stored by the legacy adapter."],
  ["review-state", "Review state", "Native Resource review state is not connected yet."]
] as const;

function displayLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function sourceEvidenceLabel(state: ResourceSourceEvidenceState) {
  if (state === "syntax_accepted") return "Syntax accepted · not checked";
  if (state === "credentials_withheld") return "Embedded credentials withheld";
  if (state === "unsupported_protocol") return "Unsupported protocol withheld";
  return "Invalid URL withheld";
}

function sourceEvidenceTone(state: ResourceSourceEvidenceState) {
  return state === "syntax_accepted" ? "blue" : "amber";
}

function formatDate(value?: string | null, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  }).format(date);
}

function initials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") : "R";
}

function relationCount(resource: ResourceRecord) {
  return Object.values(resource.relations).reduce((total, values) => total + values.length, 0);
}

function notesSearchRoute(resource: ResourceRecord) {
  const query = resource.source.canonicalUrl || resource.title;
  const params = new URLSearchParams({ query });
  return `${getModuleRoute("notes")}?${params.toString()}`;
}

function matchesQuery(resource: ResourceRecord, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    resource.id,
    resource.title,
    resource.body,
    resource.source.sourceTitle,
    resource.source.canonicalUrl,
    resource.source.displayDomain,
    resource.source.publisher,
    resource.source.author,
    resource.source.sourceImportId,
    ...resource.source.candidates.map((candidate) => candidate.value),
    ...resource.provenance.areas,
    ...resource.provenance.subjects,
    ...resource.provenance.projects,
    ...resource.provenance.intents,
    ...Object.values(resource.relations).flat()
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function sortResources(resources: ResourceRecord[], sort: ResourcesSort) {
  return [...resources].sort((left, right) => {
    if (sort === "title") {
      return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    }
    if (sort === "updated-asc") return left.updatedAt.localeCompare(right.updatedAt);
    if (sort === "review") {
      const byReview = (left.review.nextReviewAt || "9999-12-31").localeCompare(
        right.review.nextReviewAt || "9999-12-31"
      );
      if (byReview !== 0) return byReview;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

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

export default function ResourcesWorkspace({
  initialResources,
  contentGraph,
  initialMode = "index",
  initialSelectedId,
  initialLoadError = ""
}: ResourcesWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [firstUrlState] = useState(() => parseResourcesUrlState(searchParams));
  const [query, setQuery] = useState(firstUrlState.query);
  const [view, setView] = useState<ResourcesView>(firstUrlState.view);
  const [sort, setSort] = useState<ResourcesSort>(firstUrlState.sort);
  const [selectedId, setSelectedId] = useState(
    initialSelectedId || firstUrlState.selected || initialResources[0]?.id || ""
  );
  const [activeTab, setActiveTab] = useState<ResourcesTab>(firstUrlState.tab);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(firstUrlState.item);
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(firstUrlState.ai);
  const [copyFeedback, setCopyFeedback] = useState<{
    resourceId: string;
    evidenceId: string;
    state: "copied" | "failed";
  } | null>(null);
  const isInspectorOverlay = useMediaQuery("(max-width: 1240px)");
  const isMobile = useMediaQuery("(max-width: 760px)");
  const searchParamKey = searchParams.toString();

  const selectedResource = useMemo(
    () => initialResources.find((resource) => resource.id === selectedId) || null,
    [initialResources, selectedId]
  );
  const selectedSourceEvidence = useMemo(
    () => selectedResource
      ? buildResourceSourceEvidenceReport(selectedResource, initialResources)
      : null,
    [initialResources, selectedResource]
  );
  const unavailableViewReason = VIEW_LIMITATIONS[view] || "";
  const visibleResources = useMemo(
    () => unavailableViewReason
      ? []
      : sortResources(initialResources.filter((resource) => matchesQuery(resource, query)), sort),
    [initialResources, query, sort, unavailableViewReason]
  );

  useEffect(() => {
    const next = parseResourcesUrlState(searchParams);
    setQuery(next.query);
    setView(next.view);
    setSort(next.sort);
    setActiveTab(next.tab);
    setSelectedEvidenceId(next.item);
    setAiOpen(next.ai);
    if (!initialSelectedId) setSelectedId(next.selected || initialResources[0]?.id || "");
  }, [initialResources, initialSelectedId, searchParamKey]);

  useEffect(() => {
    if (initialMode !== "index" || unavailableViewReason || !visibleResources.length) return;
    if (visibleResources.some((resource) => resource.id === selectedId)) {
      if (!parseResourcesUrlState(searchParams).selected) {
        updateUrl({ selected: selectedId }, { history: "replace" });
      }
      return;
    }
    const nextId = visibleResources[0].id;
    setSelectedId(nextId);
    updateUrl({ selected: nextId }, { history: "replace" });
  }, [initialMode, query, searchParamKey, selectedId, sort, unavailableViewReason, view, visibleResources.length]);

  function destinationFor(
    partial: Partial<ResourcesUrlState>,
    options: { path?: string } = {}
  ) {
    const path = options.path || pathname;
    const isRoot = path === getModuleRoute("resources");
    const params = serializeResourcesUrlState(
      {
        view,
        sort,
        query,
        selected: isRoot ? selectedId : "",
        tab: activeTab,
        item: selectedEvidenceId,
        ai: aiOpen,
        ...partial
      },
      searchParams
    );
    return `${path}${params.size ? `?${params.toString()}` : ""}`;
  }

  function updateUrl(
    partial: Partial<ResourcesUrlState>,
    options: { path?: string; history?: "push" | "replace" } = {}
  ) {
    const destination = destinationFor(partial, options);
    if (options.history === "push") router.push(destination, { scroll: false });
    else router.replace(destination, { scroll: false });
  }

  function selectResource(resource: ResourceRecord) {
    setSelectedId(resource.id);
    setActiveTab("overview");
    setSelectedEvidenceId("");
    setInspectorOpen(true);
    if (isMobile || initialMode === "detail") {
      updateUrl(
        { selected: "", tab: "overview", item: "" },
        { path: getNativeObjectRoute(resource.nativeRef), history: "push" }
      );
      return;
    }
    updateUrl({ selected: resource.id, tab: "overview", item: "" }, { history: "push" });
  }

  function setBatch(id: string, checked: boolean) {
    setBatchSelection((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function copySourceUrl(value: string, evidenceId: string) {
    if (!selectedResource) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback({ resourceId: selectedResource.id, evidenceId, state: "copied" });
    } catch {
      setCopyFeedback({ resourceId: selectedResource.id, evidenceId, state: "failed" });
    }
  }

  function selectSourceEvidence(itemId: string) {
    setSelectedEvidenceId(itemId);
    updateUrl({ tab: "source", item: itemId }, { history: "push" });
  }

  function selectLibraryView(nextView: ResourcesView) {
    setView(nextView);
    if (initialMode === "detail") setSelectedEvidenceId("");
    updateUrl(
      {
        view: nextView,
        tab: initialMode === "detail" ? "overview" : activeTab,
        item: initialMode === "detail" ? "" : selectedEvidenceId
      },
      {
        path: initialMode === "detail" ? getModuleRoute("resources") : pathname,
        history: initialMode === "detail" ? "push" : "replace"
      }
    );
    setMobileSidebarOpen(false);
    setInspectorOpen(false);
  }

  const sidebarSections: ModuleSidebarSection[] = [
    {
      id: "library",
      label: "Library",
      items: LIBRARY_VIEWS.map(([id, label]) => ({
        id,
        label,
        count: id === "all" ? initialResources.length : undefined,
        active: view === id,
        onSelect: () => selectLibraryView(id)
      }))
    },
    {
      id: "types",
      label: "Types",
      items: TYPE_ROWS.map((label) => ({
        id: `type-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        label,
        disabled: true,
        disabledReason: "Native Resource type is not available in the legacy adapter; records are not guessed from titles."
      }))
    },
    {
      id: "linked-context",
      label: "Linked Context",
      items: CONTEXT_ROWS.map((label) => ({
        id: `context-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        label,
        disabled: true,
        disabledReason: "Legacy relation IDs are preserved, but they are not typed native ObjectLinks yet."
      }))
    },
    {
      id: "data",
      label: "Data",
      items: [
        { id: "imports", label: "Imports", disabled: true, disabledReason: "Resource import persistence is not connected." },
        { id: "duplicate-urls", label: "Duplicate URLs", disabled: true, disabledReason: "Duplicate detection has not run; Resources are never auto-merged." },
        { id: "broken-links", label: "Broken Links", disabled: true, disabledReason: "URL health checks are not connected." },
        { id: "resource-settings", label: "Resource Settings", disabled: true, disabledReason: "Resource settings are not implemented." }
      ]
    }
  ];

  const sidebar = (
    <ModuleSidebar
      id="resources-module-sidebar"
      title="Resources"
      description="Canonical external sources, citations, freshness, trust, and source lifecycle."
      sections={sidebarSections}
      mobileOpen={mobileSidebarOpen}
      onClose={() => setMobileSidebarOpen(false)}
      className={styles.sidebar}
      footer={
        <p className={styles.sidebarFootnote}>
          Legacy Personal Records adapter · read-only · source health, native links, and mutations pending
        </p>
      }
    />
  );

  const aiDock = (
    <SharedAIDock
      open={aiOpen}
      onOpenChange={(open) => {
        setAiOpen(open);
        updateUrl({ ai: open });
      }}
      context={{
        module: "resources",
        object: selectedResource?.nativeRef || null,
        activeTab,
        visibleScope: view,
        allowedActions: ["Draft an extraction", "Suggest native links", "Propose a Note"]
      }}
    />
  );

  const inspectorTitle = selectedResource ? (
    <ObjectHeader
      objectType="External resource"
      title={selectedResource.title}
      subtitle={selectedResource.source.displayDomain || "Source identity not fetched"}
      identity={initials(selectedResource.title)}
      states={
        <>
          <span className={styles.stateChip} data-tone="amber">Legacy URL unverified</span>
          <span className={styles.stateChip}>{TYPE_LABELS[selectedResource.type]}</span>
          <span className={styles.stateChip}>{displayLabel(selectedResource.review.state)}</span>
        </>
      }
      actions={
        <>
          {isInspectorOverlay && (
            <button
              type="button"
              className={`${styles.button} ${styles.closeButton}`}
              onClick={() => setInspectorOpen(false)}
            >
              Close
            </button>
          )}
          {selectedResource.source.canonicalUrl ? (
            <a
              className={`${styles.button} ${styles.linkButton}`}
              data-primary="true"
              href={selectedResource.source.canonicalUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open source ↗
            </a>
          ) : (
            <button type="button" className={styles.button} data-primary="true" disabled title="No validated HTTP or HTTPS URL is stored.">
              Open source ↗
            </button>
          )}
          <button type="button" className={styles.button} disabled title="Native Resource editing is not connected.">Edit</button>
          <button type="button" className={styles.button} disabled title="Pinned state is not stored by the legacy adapter.">Pin</button>
        </>
      }
    />
  ) : undefined;

  function stagedTab(tab: ResourcesTab) {
    const label = TABS.find((item) => item.id === tab)?.label || "This tab";
    return (
      <DetailTabPanel tabsId={`resource-${selectedResource?.id || "empty"}`} tabId={tab} active>
        <SystemState
          variant="read_only"
          title={`${label} is staged`}
          description="The route and tab state are available, but its native ObjectLinks, authored Note associations, Review workflow, or lifecycle policies are not connected. No fixture data is shown."
          compact
        />
      </DetailTabPanel>
    );
  }

  function renderInspectorPanel() {
    if (!selectedResource) {
      return (
        <div className={styles.emptyInspector}>
          <h2>No Resource selected</h2>
          <p>Select a row to inspect its preserved external-source identity.</p>
        </div>
      );
    }

    const tabsId = `resource-${selectedResource.id}`;
    const graphLinks = contentLinksForObject(contentGraph, selectedResource.nativeRef);
    const targetGroups = contentTargetGroupsForObject(contentGraph, selectedResource.nativeRef);
    const unresolvedReferences = unresolvedReferencesForObject(
      contentGraph,
      selectedResource.nativeRef
    );

    if (activeTab === "review") {
      const noteSourceTargets = targetGroups.filter(
        (group) => group.candidates.some((candidate) => candidate.relationship === "note_source_candidate")
      );
      const reviewEvidence = buildResourceReviewEvidence(selectedResource, {
        noteSourceMatches: noteSourceTargets.length,
        ownerTargetCount: targetGroups.length,
        unresolvedReferenceCount: unresolvedReferences.length
      });
      const openTab = (tab: ResourcesTab) => {
        setActiveTab(tab);
        updateUrl({ tab });
      };

      return (
        <DetailTabPanel tabsId={tabsId} tabId="review" active>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <MetricStrip
                ariaLabel="Resource review evidence"
                items={[
                  { id: "contracts", label: "Review contracts", value: reviewEvidence.checks.length },
                  { id: "supported", label: "Evidence available", value: reviewEvidence.supportedCount, tone: reviewEvidence.supportedCount ? "positive" : "attention" },
                  { id: "url", label: "URL candidates", value: selectedResource.source.candidates.length },
                  { id: "targets", label: "Owner targets", value: reviewEvidence.ownerTargetCount },
                  { id: "notes", label: "Exact Note matches", value: reviewEvidence.noteSourceMatches },
                  { id: "unresolved", label: "Unresolved references", value: reviewEvidence.unresolvedReferenceCount, tone: reviewEvidence.unresolvedReferenceCount ? "attention" : "positive" },
                  { id: "snapshot", label: "Verified snapshot", value: selectedResource.health.snapshotState === "attached" ? "Attached" : "None verified", tone: selectedResource.health.snapshotState === "attached" ? "positive" : "attention" },
                  { id: "review-record", label: "Native review record", value: "Unavailable", tone: "attention" }
                ]}
              />
              <div className={styles.readOnlyNotice}>
                <strong>Resource-local evidence review · not a Reviews run</strong>
                <span>
                  This cockpit exposes what the legacy adapter can and cannot prove. It does not create a Resource review record, a Reviews-owned ReviewRun, a health result, citation, extraction, snapshot, or audit event.
                </span>
              </div>
            </section>

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <div>
                  <h2>Nine review contracts</h2>
                  <p>Statuses describe evidence coverage, never completed review work.</p>
                </div>
                <strong className={styles.mono}>{reviewEvidence.supportedCount} available · {reviewEvidence.unavailableCount} not connected</strong>
              </div>
              <EvidenceChecklist
                ariaLabel={`${selectedResource.title} Resource review evidence`}
                items={reviewEvidence.checks}
              />
            </section>

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <div>
                  <h2>Owner targets and usage candidates</h2>
                  <p>Exact evidence may open an owner route; it is not a persisted ResourceLink or reviewed use.</p>
                </div>
                <strong>{targetGroups.length}</strong>
              </div>
              {targetGroups.length ? (
                <ul className={styles.objectList} aria-label="Resource review owner targets">
                  {targetGroups.map((group) => {
                    const relationships = Array.from(
                      new Set(group.candidates.map((candidate) => displayLabel(candidate.relationship)))
                    );
                    const ambiguous = group.candidates.some((candidate) => candidate.ambiguity === "multiple_targets");
                    return (
                      <li
                        data-content-target={`${group.target.module}:${group.target.objectId}`}
                        key={`${group.target.module}-${group.target.objectType}-${group.target.objectId}`}
                      >
                        <span>
                          <strong>{group.target.label}</strong>
                          <small>{displayLabel(group.target.module)} · {relationships.join(" / ")} · candidate only</small>
                        </span>
                        <span className={styles.inlineActions}>
                          <span className={styles.stateChip} data-tone={ambiguous ? "amber" : "blue"}>
                            {group.candidates.length} exact {group.candidates.length === 1 ? "signal" : "signals"}{ambiguous ? " · ambiguous" : ""}
                          </span>
                          <Link className={styles.linkButton} href={group.target.route}>Open owner</Link>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <SystemState
                  variant="empty"
                  compact
                  title="No exact owner target is available"
                  description="Use the Source and Links tabs to inspect retained URL and legacy-ID evidence. No relationship is inferred from absence."
                />
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Freshness and trust evidence</h2>
                <span className={styles.stateChip} data-tone="amber">Unverified</span>
              </div>
              <div className={styles.factGrid}>
                <div className={styles.fact}><span>Display domain</span><strong>{selectedResource.source.displayDomain || "Not available"}</strong></div>
                <div className={styles.fact}><span>Fetched title</span><strong>{selectedResource.source.sourceTitle || "Not fetched"}</strong></div>
                <div className={styles.fact}><span>URL health</span><strong>{selectedResource.health.lastCheckedAt ? displayLabel(selectedResource.health.state) : "Not checked"}</strong></div>
                <div className={styles.fact}><span>Duplicate scan</span><strong>{selectedResource.health.duplicateState === "unknown" ? "Not run" : displayLabel(selectedResource.health.duplicateState)}</strong></div>
                <div className={styles.fact}><span>Trust</span><strong>{displayLabel(selectedResource.review.trustLevel)}</strong></div>
                <div className={styles.fact}><span>Freshness</span><strong>{displayLabel(selectedResource.review.freshness)}</strong></div>
              </div>
            </section>

            <section className={styles.panel}>
              <h2>Safe review actions</h2>
              {selectedResource.source.canonicalUrl && (
                <a
                  className={`${styles.button} ${styles.linkButton}`}
                  data-primary="true"
                  href={selectedResource.source.canonicalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open external source ↗
                </a>
              )}
              <QuickActionBar
                ariaLabel="Resource evidence navigation"
                actions={[
                  { id: "source", label: "Inspect source", onSelect: () => openTab("source") },
                  { id: "links", label: "Inspect link evidence", onSelect: () => openTab("links") },
                  { id: "notes", label: "Inspect Note evidence", onSelect: () => openTab("notes") }
                ]}
              />
              <QuickActionBar
                ariaLabel="Unavailable Resource review mutations"
                actions={[
                  { id: "mark-reviewed", label: "Mark reviewed", intent: "primary", disabled: true, disabledReason: "Native Resource review checks, reviewer identity, timestamps, acknowledgement, outcome, and audit persistence are not connected." },
                  { id: "check-url", label: "Check URL", disabled: true, disabledReason: "No URL-health job or result persistence is connected." },
                  { id: "update-citations", label: "Update citations", disabled: true, disabledReason: "Persisted citations and per-Note diff confirmation are not connected." },
                  { id: "attach-snapshot", label: "Attach snapshot", disabled: true, disabledReason: "No approved Media snapshot write path or native link persistence exists." },
                  { id: "set-cadence", label: "Set cadence", disabled: true, disabledReason: "Resource review policy persistence and reviewer assignment are not connected." },
                  { id: "archive", label: "Archive", intent: "destructive", disabled: true, disabledReason: "Archive consequences, retention, restore, and audit semantics remain unresolved." }
                ]}
              />
            </section>

            <section className={styles.panel}>
              <h2>Review outcome</h2>
              <SystemState
                variant="read_only"
                compact
                title="No persisted draft outcome"
                description="The mockup's sample recommendation, reviewer, next date, and projected state are not shown as current data."
              />
            </section>

            <section className={styles.panel}>
              <h2>Object boundary</h2>
              <ul className={styles.objectList}>
                <li><strong>Resources</strong><span>owns external-source identity and future source-governance state</span></li>
                <li><strong>Notes</strong><span>owns authored knowledge and body wording</span></li>
                <li><strong>Media</strong><span>owns any binary snapshot and its rights or versions</span></li>
                <li><strong>Reviews</strong><span>owns ReviewRun state; none is created here</span></li>
              </ul>
            </section>

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <h2>Provenance, not review activity</h2>
                <span className={styles.stateChip}>Legacy record</span>
              </div>
              <div className={styles.factGrid}>
                <div className={styles.fact} data-mono="true"><span>Created</span><strong>{formatDate(selectedResource.createdAt)}</strong></div>
                <div className={styles.fact} data-mono="true"><span>Updated</span><strong>{formatDate(selectedResource.updatedAt)}</strong></div>
                <div className={styles.fact} data-mono="true"><span>Legacy ID</span><strong>{selectedResource.id}</strong></div>
                <div className={styles.fact}><span>Review events</span><strong>Not connected</strong></div>
              </div>
            </section>
          </div>
        </DetailTabPanel>
      );
    }

    if (activeTab === "links") {
      const noteSourceTargets = targetGroups.filter(
        (group) => group.candidates.some((candidate) => candidate.relationship === "note_source_candidate")
      );
      const mediaSourceTargets = targetGroups.filter(
        (group) => group.candidates.some((candidate) => candidate.relationship === "media_source_reference_candidate")
      );

      return (
        <DetailTabPanel tabsId={tabsId} tabId="links" active>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <MetricStrip
                ariaLabel="Resource reuse evidence"
                items={[
                  { id: "candidates", label: "Evidence signals", value: graphLinks.length },
                  { id: "targets", label: "Owner targets", value: targetGroups.length },
                  { id: "notes", label: "Note source matches", value: noteSourceTargets.length },
                  { id: "media", label: "Media URL references", value: mediaSourceTargets.length },
                  { id: "unresolved", label: "Unresolved legacy IDs", value: unresolvedReferences.length, tone: unresolvedReferences.length ? "attention" : "positive" },
                  { id: "snapshot", label: "Verified snapshot", value: "None", tone: "attention" }
                ]}
              />
              <div className={styles.readOnlyNotice}>
                <strong>Candidate graph · not persisted links</strong>
                <span>
                  Exact normalized URL and record-ID evidence can open the owning object. It does not create a ResourceLink, citation, snapshot, usage event, or audit event.
                </span>
              </div>
            </section>

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <h2>Resolved owner routes</h2>
                <strong>{targetGroups.length}</strong>
              </div>
              {targetGroups.length ? (
                <ul className={styles.objectList} aria-label="Read-only Resource link candidates">
                  {targetGroups.map((group) => {
                    const relationships = Array.from(new Set(group.candidates.map((candidate) => displayLabel(candidate.relationship))));
                    const ambiguous = group.candidates.some((candidate) => candidate.ambiguity === "multiple_targets");
                    return (
                      <li
                        key={`${group.target.module}-${group.target.objectType}-${group.target.objectId}`}
                        data-content-target={`${group.target.module}:${group.target.objectId}`}
                      >
                        <span>
                          <strong>{group.target.label}</strong>
                          <small>{displayLabel(group.target.module)} · {relationships.join(" / ")}</small>
                        </span>
                        <span className={styles.inlineActions}>
                          <span className={styles.stateChip} data-tone={ambiguous ? "amber" : "blue"}>
                            {group.candidates.length} exact {group.candidates.length === 1 ? "signal" : "signals"}{ambiguous ? " · ambiguous" : ""}
                          </span>
                          <Link className={styles.linkButton} href={group.target.route}>Open owner</Link>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <SystemState
                  variant="empty"
                  compact
                  title="No cross-module candidates resolve yet"
                  description="No Note URL, Media URL reference, or retained relation ID resolves exactly to another content object."
                />
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Legacy untyped references</h2>
                <strong>{unresolvedReferences.length}</strong>
              </div>
              {unresolvedReferences.length ? (
                <ul className={styles.sourceList}>
                  {unresolvedReferences.map((reference) => (
                    <li key={reference.id}>
                      <span className={styles.mono}>{reference.value}</span>
                      <strong>{displayLabel(reference.legacyDirection || reference.kind)} · unresolved</strong>
                    </li>
                  ))}
                </ul>
              ) : <p>No unresolved Resource-owned legacy reference IDs.</p>}
            </section>

            <section className={styles.panel}>
              <h2>Snapshot boundary</h2>
              <div className={styles.sourceBoundary}>
                <strong>No verified Media snapshot is attached.</strong>
                <span>
                  A Media record that mentions the same URL is only a source-reference candidate. Snapshot attachment needs a real binary and an explicit native link.
                </span>
              </div>
              <QuickActionBar
                actions={[
                  { id: "attach", label: "Attach Resource", disabled: true, disabledReason: "Native ResourceLink persistence is not connected." },
                  { id: "snapshot", label: "Attach snapshot", disabled: true, disabledReason: "No approved Media snapshot write path exists." },
                  { id: "unlink", label: "Unlink selected", disabled: true, disabledReason: "There is no persisted ResourceLink to remove.", intent: "destructive" }
                ]}
              />
            </section>
          </div>
        </DetailTabPanel>
      );
    }

    if (activeTab === "notes") {
      const noteTargets = targetGroups.filter(
        (group) => group.candidates.some((candidate) => candidate.relationship === "note_source_candidate")
      );
      return (
        <DetailTabPanel tabsId={tabsId} tabId="notes" active>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <MetricStrip
                ariaLabel="Resource Notes evidence"
                items={[
                  { id: "matches", label: "Matching Notes", value: noteTargets.length },
                  { id: "context", label: "Source context", value: selectedResource.body ? "Present" : "Empty" },
                  { id: "extractions", label: "Native extractions", value: "Unavailable", tone: "attention" },
                  { id: "citations", label: "Persisted citations", value: "Unavailable", tone: "attention" }
                ]}
              />
              <div className={styles.sourceBoundary}>
                <strong>Source material is not authored knowledge.</strong>
                <span>
                  Resources keeps external identity and preserved source context. Notes owns any authored interpretation, synthesis, or decision candidate.
                </span>
              </div>
            </section>

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <h2>Authored Notes with exact source evidence</h2>
                <strong>{noteTargets.length}</strong>
              </div>
              {noteTargets.length ? (
                <ul className={styles.objectList} aria-label="Notes matching this Resource URL">
                  {noteTargets.map((group) => {
                    const urlSignalCount = group.candidates.filter((candidate) => candidate.matchBasis === "exact_normalized_url").length;
                    return (
                      <li
                        key={`${group.target.module}-${group.target.objectId}`}
                        data-content-target={`${group.target.module}:${group.target.objectId}`}
                      >
                        <span>
                          <strong>{group.target.label}</strong>
                          <small>Exact normalized URL candidate · not a persisted citation · {urlSignalCount} {urlSignalCount === 1 ? "signal" : "signals"}</small>
                        </span>
                        <Link className={styles.linkButton} href={group.target.route}>Open Note</Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <SystemState
                  variant="empty"
                  compact
                  title="No exact Note source match"
                  description="The legacy adapter found no Note carrying this Resource URL. Search Notes before creating anything new."
                  action={{ label: "Search Notes", onSelect: () => router.push(notesSearchRoute(selectedResource)) }}
                />
              )}
            </section>

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <h2>Preserved source context</h2>
                <span className={styles.stateChip}>Resource-owned</span>
              </div>
              <p>{selectedResource.body || "No source context is stored on the legacy Resource."}</p>
            </section>

            <section className={styles.panel}>
              <h2>Promotion boundary</h2>
              <p>
                A future promotion flow must preview selected source material, create or update one native Note, preserve this Resource, and add citation provenance.
              </p>
              <QuickActionBar
                actions={[
                  { id: "search", label: "Search Notes", href: notesSearchRoute(selectedResource) },
                  { id: "promote", label: "Promote to Note", disabled: true, disabledReason: "Native extraction, citation, and Note insertion persistence are not connected." },
                  { id: "existing", label: "Add to existing", disabled: true, disabledReason: "No reviewed insertion-preview workflow exists yet." }
                ]}
              />
            </section>

            <SystemState
              variant="read_only"
              compact
              title="Extraction workspace intentionally unavailable"
              description="No claims, quotes, anchors, confidence scores, or extraction counts are inferred from the legacy body."
              className={styles.panel}
            />
          </div>
        </DetailTabPanel>
      );
    }

    if (activeTab !== "overview" && activeTab !== "source") return stagedTab(activeTab);

    if (activeTab === "source") {
      const sourceEvidence = selectedSourceEvidence || buildResourceSourceEvidenceReport(
        selectedResource,
        initialResources
      );
      const selectedSourceEvidenceItem = sourceEvidence.entries.find(
        (item) => item.id === selectedEvidenceId
      ) || null;
      const noteSourceTargets = targetGroups.filter(
        (group) => group.candidates.some((candidate) => candidate.relationship === "note_source_candidate")
      );
      const mediaSourceTargets = targetGroups.filter(
        (group) => group.candidates.some((candidate) => candidate.relationship === "media_source_reference_candidate")
      );
      const currentCopyFeedback = copyFeedback?.resourceId === selectedResource.id
        && copyFeedback.evidenceId === selectedSourceEvidenceItem?.id
        ? copyFeedback.state
        : null;

      return (
        <DetailTabPanel tabsId={tabsId} tabId="source" active>
          <div className={styles.overviewGrid}>
            <div className={styles.sourceBoundary} data-wide="true">
              <strong>Stored evidence, not a live source check</strong>
              <span>
                Resources owns URL identity. This inspector classifies retained legacy fields and exact normalized matches without contacting the source, confirming a canonical URL, or creating health, citation, extraction, duplicate, or audit records.
              </span>
            </div>

            <MetricStrip
              ariaLabel="Resource source evidence summary"
              className={styles.sourceMetricStrip}
              items={[
                { id: "stored", label: "Stored URL fields", value: sourceEvidence.entries.length, detail: "literal legacy evidence" },
                { id: "accepted", label: "Openable fields", value: sourceEvidence.acceptedCount, detail: "syntax-accepted evidence" },
                { id: "withheld", label: "Withheld values", value: sourceEvidence.withheldCount, detail: "not opened or matched", tone: sourceEvidence.withheldCount ? "attention" : "default" },
                { id: "observations", label: "Health observations", value: 0, detail: "no job connected", tone: "attention" }
              ]}
            />

            <section className={styles.panel} data-wide="true">
              <h2>Source identity</h2>
              <div className={styles.factGrid}>
                <div className={styles.fact}><span>User title</span><strong>{selectedResource.title}</strong></div>
                <div className={styles.fact}><span>Fetched source title</span><strong>{selectedResource.source.sourceTitle || "Not fetched"}</strong></div>
                <div className={styles.fact}><span>Display domain</span><strong>{selectedResource.source.displayDomain || "Not available"}</strong></div>
                <div className={styles.fact}><span>Canonical state</span><strong>{displayLabel(selectedResource.source.canonicalState)}</strong></div>
                <div className={styles.fact}><span>Publisher</span><strong>{selectedResource.source.publisher || "Not available"}</strong></div>
                <div className={styles.fact}><span>Last fetched</span><strong>{formatDate(selectedResource.source.lastFetchedAt)}</strong></div>
              </div>
            </section>

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}><h2>Stored URL evidence</h2><strong>{sourceEvidence.entries.length}</strong></div>
              {sourceEvidence.entries.length ? (
                <ul className={`${styles.sourceList} ${styles.sourceEvidenceList}`} aria-label="Stored Resource URL evidence">
                  {sourceEvidence.entries.map((item) => (
                    <li
                      data-selected={selectedSourceEvidenceItem?.id === item.id || undefined}
                      data-state={item.state}
                      key={item.id}
                    >
                      <button
                        type="button"
                        className={styles.sourceEvidenceButton}
                        onClick={() => selectSourceEvidence(item.id)}
                        aria-pressed={selectedSourceEvidenceItem?.id === item.id}
                      >
                        <span className={styles.mono}>{item.displayValue}</span>
                        <small>{displayLabel(item.provenance)} · {item.evidenceField}</small>
                      </button>
                      <span className={styles.stateChip} data-tone={sourceEvidenceTone(item.state)}>
                        {sourceEvidenceLabel(item.state)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <SystemState
                  variant="empty"
                  compact
                  title="No stored URL evidence"
                  description="The legacy Resource contains no primary URL or external-source value. This is distinct from a repository or network failure."
                />
              )}
            </section>

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <h2>Selected evidence</h2>
                {selectedSourceEvidenceItem && (
                  <span className={styles.stateChip} data-tone={sourceEvidenceTone(selectedSourceEvidenceItem.state)}>
                    {sourceEvidenceLabel(selectedSourceEvidenceItem.state)}
                  </span>
                )}
              </div>
              {selectedSourceEvidenceItem ? (
                <>
                  <div className={styles.factGrid}>
                    <div className={styles.fact} data-mono="true"><span>Stored field</span><strong>{selectedSourceEvidenceItem.evidenceField}</strong></div>
                    <div className={styles.fact}><span>Protocol</span><strong>{selectedSourceEvidenceItem.protocol || "Not parsed"}</strong></div>
                    <div className={styles.fact}><span>Host</span><strong>{selectedSourceEvidenceItem.displayDomain || "Not available"}</strong></div>
                    <div className={styles.fact}><span>Fragment</span><strong>{selectedSourceEvidenceItem.hadFragment ? "Retained for opening; omitted from match key" : "None retained"}</strong></div>
                    <div className={styles.fact} data-mono="true"><span>Normalized match key</span><strong>{selectedSourceEvidenceItem.matchKey || "Not eligible for matching"}</strong></div>
                    <div className={styles.fact} data-mono="true"><span>Normalization</span><strong>{selectedSourceEvidenceItem.normalizationVersion}</strong></div>
                  </div>
                  {selectedSourceEvidenceItem.navigationUrl ? (
                    <div className={styles.inlineActions} aria-label="Selected source evidence actions">
                      <a
                        className={`${styles.button} ${styles.linkButton}`}
                        data-primary="true"
                        href={selectedSourceEvidenceItem.navigationUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open candidate in new tab ↗
                      </a>
                      <button
                        type="button"
                        className={styles.button}
                        onClick={() => copySourceUrl(selectedSourceEvidenceItem.navigationUrl || "", selectedSourceEvidenceItem.id)}
                      >
                        Copy candidate URL
                      </button>
                    </div>
                  ) : (
                    <p>This value is retained for provenance only. It is not used as a link, canonical candidate, graph match, or AI context.</p>
                  )}
                </>
              ) : (
                <SystemState
                  variant="read_only"
                  compact
                  title="Select stored evidence"
                  description="Selection is URL-restorable and changes only this inspector. It never starts a request or mutation."
                />
              )}
              <p className="sr-only" role="status" aria-live="polite">
                {currentCopyFeedback === "copied"
                  ? "Candidate URL copied."
                  : currentCopyFeedback === "failed"
                    ? "Candidate URL could not be copied; the input remains available."
                    : ""}
              </p>
              {currentCopyFeedback && (
                <p className={currentCopyFeedback === "copied" ? styles.successBanner : styles.errorBanner}>
                  {currentCopyFeedback === "copied"
                    ? "Candidate URL copied."
                    : "Candidate URL could not be copied. The visible value and current selection were preserved."}
                </p>
              )}
            </section>

            <section className={styles.panel}>
              <h2>Health result unavailable</h2>
              <div className={styles.sourceBoundary}>
                <strong>No live URL check has run.</strong>
                <span>Syntax acceptance does not establish reachability, safety, HTTP status, redirects, canonical identity, access state, or freshness.</span>
              </div>
              <div className={styles.factGrid}>
                <div className={styles.fact}><span>Observed state</span><strong>Unknown</strong></div>
                <div className={styles.fact}><span>Last checked</span><strong>Never recorded</strong></div>
                <div className={styles.fact}><span>HTTP / redirect</span><strong>Not observed</strong></div>
                <div className={styles.fact}><span>Canonical comparison</span><strong>Not run</strong></div>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}><h2>Exact Resource candidates</h2><strong>{sourceEvidence.exactResourceMatches.length}</strong></div>
              {sourceEvidence.exactResourceMatches.length ? (
                <ul className={styles.objectList} aria-label="Exact normalized Resource URL candidates">
                  {sourceEvidence.exactResourceMatches.map((match) => (
                    <li key={`${match.target.module}:${match.target.objectId}`} data-content-target={`${match.target.module}:${match.target.objectId}`}>
                      <span>
                        <Link href={getNativeObjectRoute(match.target)}>{match.target.label || match.target.objectId}</Link>
                        <small>{match.normalizedUrls.join(" · ")}</small>
                      </span>
                      <span className={styles.stateChip} data-tone="amber">Candidate only</span>
                    </li>
                  ))}
                </ul>
              ) : <p>No other Resource shares an exact normalized URL key. No uniqueness or duplicate claim is made.</p>}
            </section>

            <section className={styles.panel}>
              <h2>Owner handoff evidence</h2>
              <div className={styles.factGrid}>
                <div className={styles.fact}><span>Exact Note owner targets</span><strong>{noteSourceTargets.length}</strong></div>
                <div className={styles.fact}><span>Media source references</span><strong>{mediaSourceTargets.length}</strong></div>
                <div className={styles.fact}><span>Unresolved legacy refs</span><strong>{unresolvedReferences.length}</strong></div>
                <div className={styles.fact}><span>Persisted ObjectLinks</span><strong>None inferred</strong></div>
              </div>
              <QuickActionBar
                actions={[
                  { id: "links", label: "Inspect link evidence", onSelect: () => { setActiveTab("links"); setSelectedEvidenceId(""); updateUrl({ tab: "links", item: "" }); } },
                  { id: "notes", label: "Search Notes", href: notesSearchRoute(selectedResource) }
                ]}
              />
            </section>

            <section className={styles.panel}>
              <h2>Preserved source context</h2>
              <div className={styles.factGrid}>
                <div className={styles.fact}><span>Legacy body</span><strong>{selectedResource.body ? "Present" : "Empty"}</strong></div>
                <div className={styles.fact}><span>Native extractions</span><strong>None connected</strong></div>
              </div>
              <p>
                The legacy body remains Resource-owned source context. It is not fetched content, an authored Note, a summary, a claim, a quote, an anchor, or a confidence result.
              </p>
            </section>

            <section className={styles.panel}>
              <h2>Unavailable source operations</h2>
              <QuickActionBar
                actions={[
                  { id: "snapshot", label: "Create snapshot", disabled: true, disabledReason: "Media snapshot persistence is not connected." },
                  { id: "health", label: "Check URL health", disabled: true, disabledReason: "No isolated outbound health job, SSRF policy, result persistence, or audit event is connected." },
                  { id: "extract", label: "Create extraction", disabled: true, disabledReason: "Native extraction content, anchors, reviewer state, and provenance persistence are not connected." },
                  { id: "duplicate", label: "Resolve duplicate", disabled: true, disabledReason: "Exact normalized matches are candidates only; no duplicate scan or merge audit has run." }
                ]}
              />
            </section>
          </div>
        </DetailTabPanel>
      );
    }

    const relationValues = Object.entries(selectedResource.relations).flatMap(([direction, values]) =>
      values.map((value) => ({ direction, value }))
    );

    return (
      <DetailTabPanel tabsId={tabsId} tabId="overview" active>
        <div className={styles.overviewGrid}>
          <section className={styles.panel} data-wide="true">
            <h2>Resource summary</h2>
            <p>{selectedResource.body || "No legacy summary was recorded for this external source."}</p>
            <div className={styles.sourceBoundary}>
              This object is an outside source. Authored knowledge belongs in Notes; binaries and snapshots belong in Media.
            </div>
          </section>
          <section className={styles.panel}>
            <h2>Source details</h2>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>User title</span><strong>{selectedResource.title}</strong></div>
              <div className={styles.fact}><span>Fetched title</span><strong>{selectedResource.source.sourceTitle || "Not fetched"}</strong></div>
              <div className={styles.fact}><span>Domain</span><strong>{selectedResource.source.displayDomain || "Not available"}</strong></div>
              <div className={styles.fact} data-mono="true"><span>Resource ID</span><strong>{selectedResource.id}</strong></div>
              <div className={styles.fact}><span>Saved</span><strong>{formatDate(selectedResource.source.savedAt)}</strong></div>
              <div className={styles.fact}><span>URL condition</span><strong>Not checked</strong></div>
            </div>
          </section>
          <section className={styles.panel}>
            <h2>Quick actions</h2>
            {selectedResource.source.canonicalUrl ? (
              <a
                className={`${styles.button} ${styles.linkButton}`}
                data-primary="true"
                href={selectedResource.source.canonicalUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open external source ↗
              </a>
            ) : (
              <button type="button" className={styles.button} data-primary="true" disabled title="No validated HTTP or HTTPS URL is stored.">
                Open external source ↗
              </button>
            )}
            <QuickActionBar
              actions={[
                { id: "link", label: "Link to object", disabled: true, disabledReason: "Native ObjectLink persistence is not connected." },
                { id: "review", label: "Mark reviewed", disabled: true, disabledReason: "The Resource review workflow is not connected." },
                { id: "promote", label: "Promote to Note", disabled: true, disabledReason: "Notes promotion requires a reviewed draft workflow." },
                { id: "archive", label: "Archive", disabled: true, disabledReason: "Archive consequences, retention, and audit are unresolved.", intent: "destructive" }
              ]}
            />
            <p>Opening the legacy URL does not yet create a Resource activity event.</p>
          </section>
          <section className={styles.panel}>
            <h2>Review state</h2>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>State</span><strong>{displayLabel(selectedResource.review.state)}</strong></div>
              <div className={styles.fact}><span>Cadence</span><strong>{displayLabel(selectedResource.review.cadence)}</strong></div>
              <div className={styles.fact}><span>Usefulness</span><strong>{displayLabel(selectedResource.review.usefulness)}</strong></div>
              <div className={styles.fact}><span>Last reviewed</span><strong>{formatDate(selectedResource.review.lastReviewedAt)}</strong></div>
              <div className={styles.fact}><span>Pinned</span><strong>Not stored</strong></div>
              <div className={styles.fact}><span>Citations</span><strong>{selectedResource.citationCount ?? "Not connected"}</strong></div>
            </div>
          </section>
          <section className={styles.panel} data-wide="true">
            <div className={styles.panelHeader}><h2>Legacy relationship context</h2><strong>{relationCount(selectedResource)}</strong></div>
            {relationValues.length ? (
              <ul className={styles.objectList}>
                {relationValues.slice(0, 10).map((relation) => (
                  <li key={`${relation.direction}-${relation.value}`}>
                    <span>{relation.value}</span>
                    <strong>{displayLabel(relation.direction)} · untyped</strong>
                  </li>
                ))}
              </ul>
            ) : <p>No legacy relation IDs are attached. Native cross-module links are not inferred.</p>}
          </section>
          <section className={styles.panel} data-wide="true">
            <h2>Read boundary</h2>
            <div className={styles.readOnlyNotice}>
              <strong>Legacy Resource adapter</strong>
              <span>Original IDs, body, timestamps, URL candidates, relations, and provenance are preserved. Native mutation topology remains an explicit open product decision.</span>
            </div>
          </section>
        </div>
      </DetailTabPanel>
    );
  }

  const inspector = (
    <InspectorRail
      id="resource-inspector"
      title={inspectorTitle}
      overlay={isInspectorOverlay}
      overlayOpen={isInspectorOverlay ? inspectorOpen : true}
      onRequestClose={() => setInspectorOpen(false)}
      className={inspectorOpen ? "is-open" : undefined}
      ariaLabel={selectedResource ? `${selectedResource.title} Resource inspector` : "Resource inspector"}
      readOnly
    >
      {selectedResource && (
        <DetailTabs
          id={`resource-${selectedResource.id}`}
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={(tab) => {
            const nextTab = tab as ResourcesTab;
            setActiveTab(nextTab);
            if (nextTab !== "source") setSelectedEvidenceId("");
            updateUrl({ tab: nextTab, item: nextTab === "source" ? selectedEvidenceId : "" });
          }}
          className={styles.tabs}
          ariaLabel="Selected Resource details"
        />
      )}
      {renderInspectorPanel()}
    </InspectorRail>
  );

  return (
    <ModuleShell
      module="resources"
      sidebar={sidebar}
      inspector={inspector}
      aiDock={mobileSidebarOpen || (isInspectorOverlay && inspectorOpen) ? undefined : aiDock}
      mode={initialMode === "detail" ? "detail" : "directory"}
      ariaLabel="Resources directory"
      className={`${styles.shell} ${initialMode === "detail" ? styles.detailShell : ""}`}
    >
      <button
        type="button"
        className={`${styles.button} ${styles.mobileMenuButton}`}
        onClick={() => { setInspectorOpen(false); setMobileSidebarOpen(true); }}
        aria-label="Open Resources navigation"
        aria-expanded={mobileSidebarOpen}
        aria-controls="resources-module-sidebar"
      >
        Menu
      </button>
      <button
        type="button"
        className={`${styles.button} ${styles.mobileInspectorButton}`}
        onClick={() => { setMobileSidebarOpen(false); setInspectorOpen(true); }}
        disabled={!selectedResource}
        aria-label="Open Resource details"
        aria-expanded={isInspectorOverlay ? inspectorOpen : true}
        aria-controls="resource-inspector"
      >
        Details
      </button>
      {(mobileSidebarOpen || (isInspectorOverlay && inspectorOpen)) && (
        <button
          type="button"
          className={styles.scrim}
          onClick={() => {
            setMobileSidebarOpen(false);
            setInspectorOpen(false);
          }}
          aria-label="Close overlay"
        />
      )}
      <DirectoryPane className={styles.directory} ariaLabel="Resources directory">
        <div className={styles.mainScroll}>
          <header className={styles.directoryHeader}>
            <div>
              <h1>{LIBRARY_VIEWS.find(([id]) => id === view)?.[1] || "Resources"}</h1>
              <p>{unavailableViewReason ? "View unavailable" : `${visibleResources.length} shown`} · {initialResources.length} total external {initialResources.length === 1 ? "reference" : "references"}</p>
            </div>
            <div className={styles.headerActions}>
              <button type="button" className={styles.button} disabled title="The complete native filter model is not connected yet.">Filter</button>
              <button type="button" className={styles.button} disabled title="The directory is already using the only implemented compact density.">Compact</button>
              <button type="button" className={styles.button} data-primary="true" disabled title="Native Resource persistence topology is unresolved.">+ Add Resource</button>
            </div>
          </header>

          <label className={styles.search}>
            <span aria-hidden="true">/</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                updateUrl({ query: event.target.value });
              }}
              placeholder="Search resources, source, context..."
              aria-label="Search Resources"
            />
            <kbd>url · id · refs</kbd>
          </label>

          <div className={styles.chipRow} aria-label="Resource filters">
            {QUICK_FILTERS.map(([id, label, reason], index) => (
              <button
                type="button"
                className={styles.chip}
                data-tone={index % 3 === 0 ? "blue" : index % 3 === 1 ? "green" : "amber"}
                data-active={id === "all" || undefined}
                disabled={Boolean(reason)}
                title={reason || undefined}
                key={id}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={styles.sortRow}>
            <span>Sort</span>
            <label className={styles.field}>
              <span className="sr-only">Sort Resources</span>
              <select
                value={sort}
                onChange={(event) => {
                  const next = event.target.value as ResourcesSort;
                  setSort(next);
                  updateUrl({ sort: next });
                }}
              >
                <option value="updated-desc">Recently updated</option>
                <option value="updated-asc">Oldest update</option>
                <option value="title">Title</option>
                <option value="review" disabled>Needs review — unavailable</option>
              </select>
            </label>
            <strong>{unavailableViewReason ? "View unavailable" : `${visibleResources.length} shown`}</strong>
          </div>

          {batchSelection.size > 0 && (
            <div className={styles.batchBar} role="toolbar" aria-label="Selected Resources actions">
              <strong>{batchSelection.size} selected</strong>
              <button type="button" className={styles.button} onClick={() => setBatchSelection(new Set())}>Clear</button>
              <button type="button" className={styles.button} disabled title="Batch review requires native Resource review persistence.">Review unavailable</button>
              <button type="button" className={styles.button} disabled title="Batch archive requires consequence preview, retention, and audit.">Archive unavailable</button>
            </div>
          )}

          {initialLoadError ? (
            <SystemState variant="error" title="Resources could not be loaded" description={initialLoadError} />
          ) : unavailableViewReason ? (
            <SystemState variant="read_only" title="This Resources view is staged" description={unavailableViewReason} />
          ) : visibleResources.length ? (
            <div className={styles.list} data-density="compact" role="list" aria-label="Resources">
              {visibleResources.map((resource) => (
                <DenseObjectRow
                  id={resource.id}
                  title={resource.title}
                  description={`${resource.source.displayDomain || "Source not identified"} · ${TYPE_LABELS[resource.type]}`}
                  metadata={`saved ${formatDate(resource.source.savedAt)} · ${resource.id}`}
                  trailing={
                    <>
                      <strong>{displayLabel(resource.review.state)}</strong>
                      <span>{resource.source.canonicalUrl ? "URL unverified" : "URL missing"}</span>
                    </>
                  }
                  selected={selectedResource?.id === resource.id}
                  onSelect={() => selectResource(resource)}
                  checkbox={{
                    checked: batchSelection.has(resource.id),
                    onCheckedChange: (checked) => setBatch(resource.id, checked),
                    label: `Select ${resource.title} for batch actions`
                  }}
                  key={resource.id}
                />
              ))}
            </div>
          ) : (
            <SystemState
              variant="empty"
              title={initialResources.length ? "No Resources match this search" : "No Resources yet"}
              description={
                initialResources.length
                  ? "Adjust the query without losing the selected Resource or active detail tab."
                  : "No legacy Resource records were returned. Native creation remains intentionally unavailable."
              }
            />
          )}

          {initialMode === "detail" && selectedResource && (
            <div className={styles.readOnlyNotice}>
              <strong>Canonical detail route</strong>
              <span>
                Viewing {selectedResource.title} at its native route. <Link className={styles.detailBackLink} href={getModuleRoute("resources")}>Return to the Resources index</Link>.
              </span>
            </div>
          )}
        </div>
      </DirectoryPane>
    </ModuleShell>
  );
}
