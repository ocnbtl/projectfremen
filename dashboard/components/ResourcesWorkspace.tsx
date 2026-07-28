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
import ResourceEditorSheet from "./resources/ResourceEditorSheet";
import ResourceNotePromotionSheet from "./resources/ResourceNotePromotionSheet";
import ResourcePropertiesView from "./resources/ResourcePropertiesView";
import {
  contentTargetGroupsForObject,
  unresolvedReferencesForObject,
  type LegacyContentGraph
} from "../lib/modules/content-graph/types";
import type {
  ResourceRecord,
  ResourceSourceEvidenceState,
  ResourceType
} from "../lib/modules/resources/types";
import { buildResourceDuplicateEvidenceIndex } from "../lib/modules/resources/duplicate-evidence";
import {
  RESOURCE_LINKED_CONTEXT_MODULE_BY_VIEW,
  type ResourceLinkedContextEvidenceIndex,
  type ResourceLinkedContextModule,
  type ResourceLinkedContextView
} from "../lib/modules/resources/linked-context-evidence";
import { buildResourceReviewEvidence } from "../lib/modules/resources/review-evidence";
import { buildResourceReviewQueue } from "../lib/modules/resources/review-queue";
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
  linkedContextEvidence: ResourceLinkedContextEvidenceIndex;
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

const VIEW_LABELS: Readonly<Record<ResourcesView, string>> = {
  all: "All Resources",
  pinned: "Pinned",
  recent: "Recent",
  "needs-review": "Needs Review",
  cited: "Cited / Used",
  archived: "Archived",
  "linked-people": "Linked to People",
  "linked-projects": "Linked to Projects",
  "linked-notes": "Linked to Notes",
  "linked-finance": "Linked to Finance",
  "linked-reviews": "Linked to Reviews",
  "linked-personal-ops": "Linked to Personal Ops",
  "duplicate-urls": "Duplicate URLs"
};

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

const CONTEXT_ROWS: ReadonlyArray<
  [ResourceLinkedContextModule, ResourceLinkedContextView, string]
> = [
  ["people", "linked-people", "Linked to People"],
  ["projects", "linked-projects", "Linked to Projects"],
  ["notes", "linked-notes", "Linked to Notes"],
  ["finance", "linked-finance", "Linked to Finance"],
  ["reviews", "linked-reviews", "Linked to Reviews"],
  ["personal_ops", "linked-personal-ops", "Linked to Personal Ops"]
] as const;

const VIEW_LIMITATIONS: Readonly<Partial<Record<ResourcesView, string>>> = {
  pinned: "Pinned state is not stored by the legacy Resources adapter.",
  recent: "The recency window is an open product decision, so this view is not inferred from timestamps.",
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

function linkedContextModuleForView(
  view: ResourcesView
): ResourceLinkedContextModule | null {
  return (
    RESOURCE_LINKED_CONTEXT_MODULE_BY_VIEW[
      view as ResourceLinkedContextView
    ] || null
  );
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

function sortResources(
  resources: ResourceRecord[],
  sort: ResourcesSort,
  reviewPriorityById: ReadonlyMap<string, number>
) {
  return [...resources].sort((left, right) => {
    if (sort === "title") {
      return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    }
    if (sort === "updated-asc") return left.updatedAt.localeCompare(right.updatedAt);
    if (sort === "review") {
      const byEvidencePriority =
        (reviewPriorityById.get(right.id) || 0) - (reviewPriorityById.get(left.id) || 0);
      if (byEvidencePriority !== 0) return byEvidencePriority;
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
  linkedContextEvidence,
  initialMode = "index",
  initialSelectedId,
  initialLoadError = ""
}: ResourcesWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [resources, setResources] = useState(initialResources);
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
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [notePromotionMode, setNotePromotionMode] = useState<"create" | "existing" | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{
    resourceId: string;
    evidenceId: string;
    state: "copied" | "failed";
  } | null>(null);
  const isInspectorOverlay = useMediaQuery("(max-width: 1240px)");
  const isMobile = useMediaQuery("(max-width: 760px)");
  const searchParamKey = searchParams.toString();

  const selectedResource = useMemo(
    () => resources.find((resource) => resource.id === selectedId) || null,
    [resources, selectedId]
  );
  const selectedSourceEvidence = useMemo(
    () => selectedResource
      ? buildResourceSourceEvidenceReport(selectedResource, resources)
      : null,
    [resources, selectedResource]
  );
  const reviewQueue = useMemo(
    () => buildResourceReviewQueue(resources, contentGraph),
    [contentGraph, resources]
  );
  const reviewPriorityById = useMemo(
    () => new Map(reviewQueue.items.map((item) => [item.resourceId, item.priorityScore])),
    [reviewQueue]
  );
  const duplicateEvidence = useMemo(
    () => buildResourceDuplicateEvidenceIndex(resources),
    [resources]
  );
  const linkedContextModule = linkedContextModuleForView(view);
  const linkedContextSummary = linkedContextModule
    ? linkedContextEvidence.summary[linkedContextModule]
    : null;
  const linkedContextCoverage = linkedContextModule
    ? linkedContextEvidence.coverage[linkedContextModule]
    : null;
  const linkedContextByResourceId = useMemo(
    () =>
      new Map(
        linkedContextEvidence.records.map((record) => [
          record.resourceId,
          record
        ])
      ),
    [linkedContextEvidence.records]
  );
  const unavailableViewReason = VIEW_LIMITATIONS[view] || "";
  const visibleResources = useMemo(
    () => unavailableViewReason
      ? []
      : sortResources(
          resources.filter(
            (resource) =>
              matchesQuery(resource, query) &&
              (view !== "needs-review" || reviewQueue.byResourceId.has(resource.id)) &&
              (view !== "duplicate-urls" || duplicateEvidence.byResourceId.has(resource.id)) &&
              (!linkedContextModule ||
                linkedContextByResourceId
                  .get(resource.id)
                  ?.placements.some(
                    (placement) =>
                      placement.ownerModule === linkedContextModule
                  ))
          ),
          sort,
          reviewPriorityById
        ),
    [duplicateEvidence, linkedContextByResourceId, linkedContextModule, query, resources, reviewPriorityById, reviewQueue, sort, unavailableViewReason, view]
  );

  useEffect(() => {
    setResources(initialResources);
  }, [initialResources]);

  useEffect(() => {
    const next = parseResourcesUrlState(searchParams);
    setQuery(next.query);
    setView(next.view);
    setSort(next.sort);
    setActiveTab(next.tab);
    setSelectedEvidenceId(next.item);
    setAiOpen(next.ai);
    if (!initialSelectedId) setSelectedId(next.selected || resources[0]?.id || "");
  }, [initialSelectedId, resources, searchParamKey]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>("#resource-inspector .inspector-rail__content")
        ?.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, selectedId]);

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
    const nextTab: ResourcesTab =
      view === "needs-review"
        ? "review"
        : view === "duplicate-urls"
          ? "source"
          : linkedContextModule
            ? "links"
            : "overview";
    setSelectedId(resource.id);
    setActiveTab(nextTab);
    setSelectedEvidenceId("");
    setInspectorOpen(true);
    if (isMobile || initialMode === "detail") {
      updateUrl(
        { selected: "", tab: nextTab, item: "" },
        { path: getNativeObjectRoute(resource.nativeRef), history: "push" }
      );
      return;
    }
    updateUrl({ selected: resource.id, tab: nextTab, item: "" }, { history: "push" });
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
    const nextLinkedContextModule = linkedContextModuleForView(nextView);
    const nextTab: ResourcesTab =
      nextView === "needs-review"
        ? "review"
        : nextView === "duplicate-urls"
          ? "source"
          : nextLinkedContextModule
            ? "links"
          : initialMode === "detail"
            ? "overview"
            : activeTab;
    const nextSort: ResourcesSort =
      nextView === "needs-review"
        ? "review"
        : nextView === "duplicate-urls" || nextLinkedContextModule
          ? "title"
          : sort;
    setView(nextView);
    setSort(nextSort);
    setActiveTab(nextTab);
    if (
      initialMode === "detail" ||
      nextView === "needs-review" ||
      nextView === "duplicate-urls" ||
      nextLinkedContextModule
    ) {
      setSelectedEvidenceId("");
    }
    updateUrl(
      {
        view: nextView,
        sort: nextSort,
        tab: nextTab,
        item:
          initialMode === "detail" ||
          nextView === "needs-review" ||
          nextView === "duplicate-urls" ||
          nextLinkedContextModule
            ? ""
            : selectedEvidenceId
      },
      {
        path: initialMode === "detail" ? getModuleRoute("resources") : pathname,
        history: "push"
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
        count:
          id === "all"
            ? resources.length
            : id === "needs-review"
              ? reviewQueue.summary.queuedResources
              : undefined,
        tone: id === "needs-review" && reviewQueue.summary.queuedResources ? "attention" : undefined,
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
      items: CONTEXT_ROWS.map(([module, contextView, label]) => ({
        id: `context-${module}`,
        label,
        count: linkedContextEvidence.summary[module].affectedResources,
        tone:
          linkedContextEvidence.coverage[module].state === "read_failed"
            ? "attention"
            : undefined,
        active: view === contextView,
        onSelect: () => selectLibraryView(contextView)
      }))
    },
    {
      id: "data",
      label: "Data",
      items: [
        { id: "imports", label: "Imports", disabled: true, disabledReason: "Resource import persistence is not connected." },
        {
          id: "duplicate-urls",
          label: "Duplicate URLs",
          count: duplicateEvidence.summary.affectedResources,
          tone: duplicateEvidence.summary.affectedResources ? "attention" : undefined,
          active: view === "duplicate-urls",
          onSelect: () => selectLibraryView("duplicate-urls")
        },
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
          Legacy Personal Records adapter · title, URL, and context writes are audited · linked-context views are exact owner-reference evidence, not ResourceLinks · source health remains disconnected
        </p>
      }
    />
  );

  function openResourceEditor(mode: "create" | "edit") {
    if (mode === "edit" && !selectedResource) return;
    setAiOpen(false);
    setMobileSidebarOpen(false);
    setEditorMode(mode);
    updateUrl({ ai: false });
  }

  function openNotePromotion(mode: "create" | "existing") {
    if (!selectedResource?.source.canonicalUrl) return;
    setAiOpen(false);
    setMobileSidebarOpen(false);
    setInspectorOpen(false);
    setNotePromotionMode(mode);
    updateUrl({ ai: false });
  }

  function handleResourceSaved(saved: ResourceRecord, mode: "create" | "edit") {
    setResources((current) => [
      saved,
      ...current.filter((resource) => resource.id !== saved.id)
    ]);
    setSelectedId(saved.id);
    setEditorMode(null);

    if (mode === "create") {
      setView("all");
      setSort("updated-desc");
      setQuery("");
      setActiveTab("overview");
      setSelectedEvidenceId("");
      setInspectorOpen(true);
      const routeState = {
        view: "all" as const,
        sort: "updated-desc" as const,
        query: "",
        tab: "overview" as const,
        item: "",
        ai: false
      };
      if (isMobile || initialMode === "detail") {
        updateUrl(
          { ...routeState, selected: "" },
          { path: getNativeObjectRoute(saved.nativeRef), history: "push" }
        );
      } else {
        updateUrl(
          { ...routeState, selected: saved.id },
          { path: getModuleRoute("resources"), history: "push" }
        );
      }
    }

    router.refresh();
  }

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
          <button
            type="button"
            className={styles.button}
            onClick={() => openResourceEditor("edit")}
          >
            Edit
          </button>
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
    const targetGroups = contentTargetGroupsForObject(contentGraph, selectedResource.nativeRef);
    const unresolvedReferences = unresolvedReferencesForObject(
      contentGraph,
      selectedResource.nativeRef
    );
    const linkedContextRecord =
      linkedContextByResourceId.get(selectedResource.id) || null;

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
      const allOwnerPlacements = linkedContextRecord?.placements || [];
      const ownerPlacements = linkedContextModule
        ? allOwnerPlacements.filter(
            (placement) => placement.ownerModule === linkedContextModule
          )
        : allOwnerPlacements;
      const noteSourceTargets = allOwnerPlacements.filter(
        (placement) => placement.ownerModule === "notes"
      );
      const mediaSourceTargets = targetGroups.filter(
        (group) => group.candidates.some((candidate) => candidate.relationship === "media_source_reference_candidate")
      );
      const activeCoverage = linkedContextModule
        ? linkedContextEvidence.coverage[linkedContextModule]
        : null;
      const evidenceSignalCount =
        ownerPlacements.reduce(
          (total, placement) => total + placement.evidenceSignalCount,
          0
        ) + (linkedContextModule ? 0 : mediaSourceTargets.reduce(
          (total, group) => total + group.candidates.length,
          0
        ));

      return (
        <DetailTabPanel tabsId={tabsId} tabId="links" active>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <MetricStrip
                ariaLabel="Resource reuse evidence"
                items={[
                  { id: "candidates", label: "Evidence signals", value: evidenceSignalCount },
                  { id: "targets", label: "Owner targets", value: ownerPlacements.length + (linkedContextModule ? 0 : mediaSourceTargets.length) },
                  { id: "notes", label: "Note source matches", value: noteSourceTargets.length },
                  { id: "media", label: "Media URL references", value: mediaSourceTargets.length },
                  { id: "unresolved", label: "Unresolved legacy IDs", value: unresolvedReferences.length, tone: unresolvedReferences.length ? "attention" : "positive" },
                  { id: "snapshot", label: "Verified snapshot", value: "None", tone: "attention" }
                ]}
              />
              <div className={styles.readOnlyNotice}>
                <strong>
                  {linkedContextModule
                    ? `${displayLabel(linkedContextModule)} owner-route evidence · not persisted ObjectLinks`
                    : "Owner-route evidence · not persisted ObjectLinks"}
                </strong>
                <span>
                  Exact retained references can open the owning object. This view does not attach, unlink, change ownership,
                  create a ResourceLink, prove active usage, or append an audit event.
                </span>
              </div>
            </section>

            {activeCoverage && activeCoverage.state !== "indexed" && (
              <SystemState
                variant="read_only"
                compact
                title={
                  activeCoverage.state === "read_failed"
                    ? `${displayLabel(activeCoverage.ownerModule)} reference coverage could not be loaded`
                    : `${displayLabel(activeCoverage.ownerModule)} Resource references are not indexed`
                }
                description={
                  activeCoverage.error ||
                  "The current owner module does not expose stable Resource IDs in its connected read model. An empty result is not proof that no relationship exists."
                }
                className={styles.panel}
              />
            )}

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <div>
                  <h2>
                    {linkedContextModule
                      ? `${displayLabel(linkedContextModule)} owner routes`
                      : "Resolved owner routes"}
                  </h2>
                  <p>Grouped by target object while retaining every exact evidence signal.</p>
                </div>
                <strong>{ownerPlacements.length + (linkedContextModule ? 0 : mediaSourceTargets.length)}</strong>
              </div>
              {ownerPlacements.length || (!linkedContextModule && mediaSourceTargets.length) ? (
                <ul className={styles.objectList} aria-label="Read-only Resource link candidates">
                  {ownerPlacements.map((placement) => (
                    <li
                      key={placement.id}
                      data-content-target={`${placement.ownerModule}:${placement.ownerRef.objectId}`}
                      data-resource-linked-context={placement.ownerModule}
                    >
                      <span>
                        <strong>{placement.ownerRef.label}</strong>
                        <small>
                          {displayLabel(placement.ownerModule)} ·{" "}
                          {placement.relationships.map(displayLabel).join(" / ")} ·{" "}
                          {displayLabel(placement.state)}
                        </small>
                      </span>
                      <span className={styles.inlineActions}>
                        <span
                          className={styles.stateChip}
                          data-tone={
                            placement.ambiguity === "multiple_targets" ||
                            ["pending", "stale", "broken", "missing"].includes(placement.state)
                              ? "amber"
                              : "blue"
                          }
                        >
                          {placement.evidenceSignalCount} exact{" "}
                          {placement.evidenceSignalCount === 1 ? "signal" : "signals"}
                          {placement.ambiguity === "multiple_targets" ? " · ambiguous" : ""}
                        </span>
                        <Link className={styles.linkButton} href={placement.ownerRef.route}>
                          Open owner
                        </Link>
                      </span>
                    </li>
                  ))}
                  {!linkedContextModule && mediaSourceTargets.map((group) => {
                    const ambiguous = group.candidates.some(
                      (candidate) => candidate.ambiguity === "multiple_targets"
                    );
                    return (
                      <li
                        key={`media-${group.target.objectType}-${group.target.objectId}`}
                        data-content-target={`${group.target.module}:${group.target.objectId}`}
                      >
                        <span>
                          <strong>{group.target.label}</strong>
                          <small>Media · source URL reference candidate · not a snapshot</small>
                        </span>
                        <span className={styles.inlineActions}>
                          <span className={styles.stateChip} data-tone="amber">
                            {group.candidates.length} exact{" "}
                            {group.candidates.length === 1 ? "signal" : "signals"}
                            {ambiguous ? " · ambiguous" : ""}
                          </span>
                          <Link className={styles.linkButton} href={group.target.route}>
                            Open owner
                          </Link>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <SystemState
                  variant="empty"
                  compact
                  title={
                    linkedContextModule
                      ? `No exact ${displayLabel(linkedContextModule)} owner-route evidence`
                      : "No cross-module candidates resolve yet"
                  }
                  description={
                    activeCoverage?.state === "indexed"
                      ? "The connected read model contains no exact reference from this Resource to an object in the selected owner module. This is not proof that no relationship exists."
                      : "Coverage is incomplete or disconnected, so absence cannot establish that no relationship exists."
                  }
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
                Create a clean authored draft or attach this source URL to one existing Note.
                The Resource remains canonical for source identity and is never replaced.
              </p>
              <QuickActionBar
                actions={[
                  { id: "search", label: "Search Notes", href: notesSearchRoute(selectedResource) },
                  {
                    id: "promote",
                    label: "Create Note draft",
                    onSelect: selectedResource.source.canonicalUrl
                      ? () => openNotePromotion("create")
                      : undefined,
                    disabled: !selectedResource.source.canonicalUrl,
                    disabledReason: "A safe HTTP(S) Resource URL is required."
                  },
                  {
                    id: "existing",
                    label: "Attach to existing Note",
                    onSelect: selectedResource.source.canonicalUrl
                      ? () => openNotePromotion("existing")
                      : undefined,
                    disabled: !selectedResource.source.canonicalUrl,
                    disabledReason: "A safe HTTP(S) Resource URL is required."
                  }
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

    if (activeTab === "properties") {
      return (
        <DetailTabPanel tabsId={tabsId} tabId="properties" active>
          <ResourcePropertiesView
            resource={selectedResource}
            selectedRuleId={selectedEvidenceId}
            onSelectRule={(ruleId) => {
              setSelectedEvidenceId(ruleId);
              updateUrl({ tab: "properties", item: ruleId }, { history: "push" });
            }}
            onOpenTab={(tab) => {
              setActiveTab(tab);
              setSelectedEvidenceId("");
              updateUrl({ tab, item: "" }, { history: "push" });
            }}
          />
        </DetailTabPanel>
      );
    }

    if (activeTab !== "overview" && activeTab !== "source") return stagedTab(activeTab);

    if (activeTab === "source") {
      const sourceEvidence = selectedSourceEvidence || buildResourceSourceEvidenceReport(
        selectedResource,
        resources
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
                  { id: "notes", label: "Search Notes", href: notesSearchRoute(selectedResource) },
                  {
                    id: "note-draft",
                    label: "Create Note draft",
                    onSelect: selectedResource.source.canonicalUrl
                      ? () => openNotePromotion("create")
                      : undefined,
                    disabled: !selectedResource.source.canonicalUrl,
                    disabledReason: "A safe HTTP(S) Resource URL is required before creating source evidence."
                  }
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
                {
                  id: "promote",
                  label: "Create Note draft",
                  onSelect: selectedResource.source.canonicalUrl
                    ? () => openNotePromotion("create")
                    : undefined,
                  disabled: !selectedResource.source.canonicalUrl,
                  disabledReason: "A safe HTTP(S) Resource URL is required."
                },
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
    >
      {selectedResource && (
        <DetailTabs
          id={`resource-${selectedResource.id}`}
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={(tab) => {
            const nextTab = tab as ResourcesTab;
            setActiveTab(nextTab);
            if (nextTab !== "source" && nextTab !== "properties") setSelectedEvidenceId("");
            updateUrl({
              tab: nextTab,
              item: nextTab === "source" || nextTab === "properties" ? selectedEvidenceId : ""
            });
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
      aiDock={editorMode || notePromotionMode || mobileSidebarOpen || (isInspectorOverlay && inspectorOpen) ? undefined : aiDock}
      mode={initialMode === "detail" ? "detail" : "directory"}
      ariaLabel="Resources directory"
      className={`${styles.shell} ${initialMode === "detail" ? styles.detailShell : ""}`}
    >
      {editorMode && (
        <ResourceEditorSheet
          key={`${editorMode}:${editorMode === "edit" ? selectedResource?.id || "missing" : "new"}`}
          open
          resource={editorMode === "edit" ? selectedResource : null}
          resources={resources}
          onClose={() => setEditorMode(null)}
          onSaved={handleResourceSaved}
        />
      )}
      {notePromotionMode && selectedResource && (
        <ResourceNotePromotionSheet
          key={`${notePromotionMode}:${selectedResource.id}`}
          open
          resource={selectedResource}
          initialMode={notePromotionMode}
          onClose={() => setNotePromotionMode(null)}
          onSaved={() => router.refresh()}
        />
      )}
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
              <h1>{VIEW_LABELS[view]}</h1>
              <p>
                {unavailableViewReason ? "View unavailable" : `${visibleResources.length} shown`} ·{" "}
                {resources.length} total external {resources.length === 1 ? "reference" : "references"}
                {view === "needs-review" ? " · evidence-derived queue" : ""}
                {view === "duplicate-urls" ? " · exact collision evidence only" : ""}
                {linkedContextModule ? " · exact owner-reference evidence" : ""}
              </p>
            </div>
            <div className={styles.headerActions}>
              <button type="button" className={styles.button} disabled title="The complete native filter model is not connected yet.">Filter</button>
              <button type="button" className={styles.button} disabled title="The directory is already using the only implemented compact density.">Compact</button>
              <button
                type="button"
                className={styles.button}
                data-primary="true"
                onClick={() => openResourceEditor("create")}
              >
                + Add Resource
              </button>
            </div>
          </header>

          {view === "needs-review" && !unavailableViewReason && (
            <section className={styles.reviewQueueSummary} aria-label="Resource review queue summary">
              <MetricStrip
                ariaLabel="Resource review queue evidence"
                items={[
                  { id: "queued", label: "Queued Resources", value: reviewQueue.summary.queuedResources },
                  { id: "contracts", label: "Evidence contracts", value: reviewQueue.summary.queuedResources * 9, detail: "nine per Resource" },
                  { id: "gaps", label: "Unavailable checks", value: reviewQueue.summary.evidenceGaps, tone: reviewQueue.summary.evidenceGaps ? "attention" : "positive" },
                  { id: "no-source", label: "No safe source", value: reviewQueue.summary.withoutSafeSource, tone: reviewQueue.summary.withoutSafeSource ? "attention" : "positive" },
                  { id: "withheld", label: "Withheld values", value: reviewQueue.summary.withheldSourceValues, tone: reviewQueue.summary.withheldSourceValues ? "attention" : "positive" },
                  { id: "duplicates", label: "Exact URL candidates", value: reviewQueue.summary.exactUrlCandidates, tone: reviewQueue.summary.exactUrlCandidates ? "attention" : "positive" },
                  { id: "unresolved", label: "Unresolved refs", value: reviewQueue.summary.unresolvedReferences, tone: reviewQueue.summary.unresolvedReferences ? "attention" : "positive" },
                  { id: "snapshots", label: "Snapshot unverified", value: reviewQueue.summary.snapshotsUnverified, tone: reviewQueue.summary.snapshotsUnverified ? "attention" : "positive" }
                ]}
              />
              <div className={styles.reviewQueueBoundary}>
                <strong>Derived Resource evidence queue · not a ReviewRun</strong>
                <span>
                  Priority reflects unavailable evidence, safe source candidates, exact URL candidates, unresolved references,
                  and snapshot evidence already present in the current read model. It does not mark work complete, assign a
                  reviewer, fetch a URL, create a Reviews-owned run, or write Resource state.
                </span>
              </div>
            </section>
          )}

          {view === "duplicate-urls" && !unavailableViewReason && (
            <section className={styles.reviewQueueSummary} aria-label="Resource duplicate URL evidence summary">
              <MetricStrip
                ariaLabel="Resource exact URL collision evidence"
                items={[
                  { id: "affected", label: "Affected Resources", value: duplicateEvidence.summary.affectedResources, tone: duplicateEvidence.summary.affectedResources ? "attention" : "positive" },
                  { id: "groups", label: "Exact URL groups", value: duplicateEvidence.summary.collisionGroups, tone: duplicateEvidence.summary.collisionGroups ? "attention" : "positive" },
                  { id: "indexed", label: "Safe URLs indexed", value: duplicateEvidence.summary.acceptedCandidatesIndexed, detail: "syntax accepted" },
                  { id: "excluded", label: "Withheld excluded", value: duplicateEvidence.summary.withheldEvidenceExcluded, detail: "never matched", tone: duplicateEvidence.summary.withheldEvidenceExcluded ? "attention" : "default" }
                ]}
              />
              <div className={styles.reviewQueueBoundary}>
                <strong>Exact accepted URL evidence · not a duplicate scan</strong>
                <span>
                  This queue groups Resources only when their safe, fragment-free normalized URL keys are identical.
                  It does not fetch a source, detect fuzzy similarity, confirm a duplicate, choose a canonical record,
                  merge, replace, unlink, or write Resource state. Credential-bearing, malformed, and unsupported
                  values are excluded.
                </span>
              </div>
            </section>
          )}

          {linkedContextModule && linkedContextSummary && linkedContextCoverage && (
            <section
              className={styles.reviewQueueSummary}
              aria-label={`${displayLabel(linkedContextModule)} linked-context evidence summary`}
              data-resource-linked-context-summary={linkedContextModule}
            >
              <MetricStrip
                ariaLabel={`${displayLabel(linkedContextModule)} Resource reference evidence`}
                items={[
                  {
                    id: "affected",
                    label: "Affected Resources",
                    value: linkedContextSummary.affectedResources
                  },
                  {
                    id: "targets",
                    label: "Owner targets",
                    value: linkedContextSummary.ownerTargets
                  },
                  {
                    id: "signals",
                    label: "Evidence signals",
                    value: linkedContextSummary.evidenceSignals
                  },
                  {
                    id: "attention",
                    label: "Attention targets",
                    value: linkedContextSummary.attentionTargets,
                    tone: linkedContextSummary.attentionTargets
                      ? "attention"
                      : "positive"
                  },
                  {
                    id: "ambiguous",
                    label: "Ambiguous targets",
                    value: linkedContextSummary.ambiguousTargets,
                    tone: linkedContextSummary.ambiguousTargets
                      ? "attention"
                      : "positive"
                  },
                  {
                    id: "coverage",
                    label: "Owner coverage",
                    value:
                      linkedContextCoverage.state === "indexed"
                        ? "Indexed"
                        : linkedContextCoverage.state === "read_failed"
                          ? "Read failed"
                          : "Disconnected",
                    tone:
                      linkedContextCoverage.state === "indexed"
                        ? "positive"
                        : "attention"
                  }
                ]}
              />
              <div className={styles.reviewQueueBoundary}>
                <strong>
                  Exact {displayLabel(linkedContextModule)} owner-route evidence · not persisted ObjectLinks
                </strong>
                <span>
                  Counts come from retained exact legacy candidates and connected owner-module references.
                  This view does not attach, unlink, change ownership, create a ResourceLink, prove active
                  usage, or append an audit event. Unresolved IDs are excluded because their owner module
                  is unknown.
                  {linkedContextCoverage.error
                    ? ` ${linkedContextCoverage.error}`
                    : linkedContextCoverage.state === "disconnected"
                      ? " This owner module does not currently expose stable Resource IDs, so an empty result is not proof of no relationship."
                      : ""}
                </span>
              </div>
            </section>
          )}

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
                <option value="review">Evidence gaps first</option>
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
              {visibleResources.map((resource) => {
                const queueItem = reviewQueue.byResourceId.get(resource.id);
                const duplicateItem = duplicateEvidence.byResourceId.get(resource.id);
                const linkedContextPlacements = linkedContextModule
                  ? linkedContextByResourceId
                      .get(resource.id)
                      ?.placements.filter(
                        (placement) =>
                          placement.ownerModule === linkedContextModule
                      ) || []
                  : [];
                return (
                  <DenseObjectRow
                    id={resource.id}
                    title={resource.title}
                    description={`${resource.source.displayDomain || "Source not identified"} · ${TYPE_LABELS[resource.type]}`}
                    metadata={`saved ${formatDate(resource.source.savedAt)} · ${resource.id}`}
                    trailing={
                      view === "needs-review" && queueItem ? (
                        <>
                          <strong>{queueItem.evidenceGapCount} of 9 unavailable</strong>
                          <span>{queueItem.primaryReason}</span>
                        </>
                      ) : view === "duplicate-urls" && duplicateItem ? (
                        <>
                          <strong>
                            {duplicateItem.matchingResourceCount} matching{" "}
                            {duplicateItem.matchingResourceCount === 1 ? "Resource" : "Resources"}
                          </strong>
                          <span>
                            {duplicateItem.collisionGroupCount} exact URL{" "}
                            {duplicateItem.collisionGroupCount === 1 ? "group" : "groups"}
                          </span>
                        </>
                      ) : linkedContextModule ? (
                        <>
                          <strong>
                            {linkedContextPlacements.length} owner{" "}
                            {linkedContextPlacements.length === 1 ? "target" : "targets"}
                          </strong>
                          <span>
                            {linkedContextPlacements.reduce(
                              (total, placement) =>
                                total + placement.evidenceSignalCount,
                              0
                            )}{" "}
                            exact{" "}
                            {linkedContextPlacements.reduce(
                              (total, placement) =>
                                total + placement.evidenceSignalCount,
                              0
                            ) === 1
                              ? "signal"
                              : "signals"}
                          </span>
                        </>
                      ) : (
                        <>
                          <strong>{displayLabel(resource.review.state)}</strong>
                          <span>{resource.source.canonicalUrl ? "URL unverified" : "URL missing"}</span>
                        </>
                      )
                    }
                    selected={selectedResource?.id === resource.id}
                    onSelect={() => selectResource(resource)}
                    checkbox={{
                      checked: batchSelection.has(resource.id),
                      onCheckedChange: (checked) => setBatch(resource.id, checked),
                      label: `Select ${resource.title} for batch actions`
                    }}
                    className={
                      view === "needs-review" ||
                      view === "duplicate-urls" ||
                      linkedContextModule
                        ? styles.reviewQueueRow
                        : undefined
                    }
                    key={resource.id}
                  />
                );
              })}
            </div>
          ) : (
            <SystemState
              variant="empty"
              title={
                view === "needs-review" && !query
                  ? "No Resource evidence needs review"
                  : view === "duplicate-urls" && !query
                    ? "No exact URL collision evidence"
                  : linkedContextModule && !query
                    ? `No exact ${displayLabel(linkedContextModule)} owner-route evidence`
                  : resources.length
                    ? "No Resources match this search"
                    : "No Resources yet"
              }
              description={
                view === "needs-review" && !query
                  ? "The current read model exposes no unavailable review evidence or source signals. This is not a completed ReviewRun."
                  : view === "duplicate-urls" && !query
                    ? "No two Resources share an identical accepted, fragment-free URL key in the current read model. This is not proof that no duplicates exist."
                  : linkedContextModule && !query
                    ? linkedContextCoverage?.state === "indexed"
                      ? `The connected ${displayLabel(linkedContextModule)} read model contains no exact Resource references. This is not proof that no relationship exists.`
                      : `The ${displayLabel(linkedContextModule)} reference source is unavailable or disconnected. Absence cannot establish that no relationship exists.`
                  : resources.length
                  ? "Adjust the query without losing the selected Resource or active detail tab."
                  : "No legacy Resource records were returned. Add the first external source through the audited adapter."
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
