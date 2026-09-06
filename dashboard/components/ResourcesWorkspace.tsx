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
import LinkedFollowUpsPanel from "./operational/LinkedFollowUpsPanel";
import LinkedNotesPanel from "./operational/LinkedNotesPanel";
import MetricStrip from "./operational/MetricStrip";
import ObjectHeader from "./operational/ObjectHeader";
import LinkedProjectsPanel from "./operational/LinkedProjectsPanel";
import LinkedReviewsPanel from "./operational/LinkedReviewsPanel";
import ProjectAssociationSheet from "./operational/ProjectAssociationSheet";
import SystemState from "./operational/SystemState";
import { usePersonalOpsFollowUps } from "./operational/usePersonalOpsFollowUps";
import { useProjectsState } from "./operational/useProjectsState";
import { useNoteLinksState } from "./operational/useNoteLinksState";
import ResourceEditorSheet from "./resources/ResourceEditorSheet";
import ResourcePropertiesView from "./resources/ResourcePropertiesView";
import ResourceOverviewView from "./resources/ResourceOverviewView";
import ResourceTimelineView from "./resources/ResourceTimelineView";
import ResourceLinksView from "./resources/ResourceLinksView";
import { ResourceIconButton, ResourceMark } from "./resources/ResourceVisual";
import resourceStyles from "./resources/ResourceExperience.module.css";
import PersonalOpsIcon from "./personal-ops/PersonalOpsIcon";
import {
  contentTargetGroupsForObject,
  type LegacyContentGraph
} from "../lib/modules/content-graph/types";
import type { ResourceRecord, ResourceType } from "../lib/modules/resources/types";
import type { NoteLinksState } from "../lib/modules/notes/links-types";
import type { ObjectLink } from "../lib/native-objects/links";
import type { NativeObjectRef } from "../lib/native-objects/types";
import { buildResourceDuplicateEvidenceIndex } from "../lib/modules/resources/duplicate-evidence";
import {
  RESOURCE_LINKED_CONTEXT_MODULE_BY_VIEW,
  type ResourceLinkedContextEvidenceIndex,
  type ResourceLinkedContextModule,
  type ResourceLinkedContextView
} from "../lib/modules/resources/linked-context-evidence";
import { buildResourceReviewQueue } from "../lib/modules/resources/review-queue";
import { getLinkedReviewContexts } from "../lib/modules/reviews/source-context";
import type { ReviewRunView } from "../lib/modules/reviews/types";
import { createResourcesRepository } from "../lib/modules/resources/repository";
import { isStyleGuideComponent } from "../lib/modules/style-guide/component-resource";
import {
  buildFollowUpCreationRoute,
  type FollowUpSourceRef
} from "../lib/modules/personal-ops/follow-up-links";
import type { PersonalOpsFollowUp } from "../lib/modules/personal-ops/types";
import type { ProjectsState } from "../lib/modules/projects/types";
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
  initialProjectsState: ProjectsState;
  initialProjectsError?: string;
  initialNoteLinksState: NoteLinksState;
  initialNoteLinksError?: string;
  initialPersonalOpsFollowUps: PersonalOpsFollowUp[];
  initialPersonalOpsFollowUpsError?: string;
  initialMode?: "index" | "detail";
  initialSelectedId?: string;
  initialLoadError?: string;
  initialReviewViews: ReviewRunView[];
  initialReviewsError?: string;
  initialObjectLinks: ObjectLink[];
  initialObjectTargets: NativeObjectRef[];
};

type ResourcesView = ResourcesUrlState["view"];
type ResourcesSort = ResourcesUrlState["sort"];
type ResourcesTab = ResourcesUrlState["tab"];
type ResourceCollection = "all" | "components";

const TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "links", label: "Links" },
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
  unknown: "Unspecified"
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
  "linked-personal-ops": "Linked to Personal",
  "duplicate-urls": "Duplicate URLs"
};

const TYPE_ROWS = [
  "Articles",
  "Books",
  "Components",
  "Contracts / Invoices",
  "Datasets",
  "Documents",
  "Tools",
  "Vendors",
  "Video / Media",
  "Websites"
] as const;

const CONTEXT_ROWS: ReadonlyArray<
  [ResourceLinkedContextModule, ResourceLinkedContextView, string]
> = [
  ["people", "linked-people", "Linked to People"],
  ["projects", "linked-projects", "Linked to Projects"],
  ["notes", "linked-notes", "Linked to Notes"],
  ["finance", "linked-finance", "Linked to Finance"],
  ["reviews", "linked-reviews", "Linked to Reviews"],
  ["personal_ops", "linked-personal-ops", "Linked to Personal"]
] as const;

const VIEW_LIMITATIONS: Readonly<Partial<Record<ResourcesView, string>>> = {
  cited: "Citation and active-use records are not connected yet."
};

function displayLabel(value?: string | null) {
  return (value || "Unknown").replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function matchesCollection(resource: ResourceRecord, collection: ResourceCollection) {
  if (collection === "components") return isStyleGuideComponent(resource);
  return true;
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

function formatDate(value?: string | null, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric",
    timeZone: "UTC"
  }).format(date);
}

function initials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") : "R";
}

function resourceFollowUpSource(resource: ResourceRecord): FollowUpSourceRef {
  return {
    ...resource.nativeRef,
    module: "resources",
    objectType: "resource"
  };
}

function resourceFollowUpCreationRoute(resource: ResourceRecord) {
  return buildFollowUpCreationRoute(resourceFollowUpSource(resource), {
    dueAt: resource.review.nextReviewAt || undefined
  });
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
  initialProjectsState,
  initialProjectsError = "",
  initialNoteLinksState,
  initialNoteLinksError = "",
  initialPersonalOpsFollowUps,
  initialPersonalOpsFollowUpsError = "",
  initialReviewViews,
  initialReviewsError = "",
  initialObjectLinks,
  initialObjectTargets,
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
  const [collection, setCollection] = useState<ResourceCollection>("all");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(firstUrlState.ai);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [projectAssociationOpen, setProjectAssociationOpen] = useState(false);
  const [propertiesEditRequest, setPropertiesEditRequest] = useState(0);
  const [headerBusy, setHeaderBusy] = useState(false);
  const [objectLinks, setObjectLinks] = useState(initialObjectLinks);
  const isInspectorOverlay = useMediaQuery("(max-width: 1240px)");
  const isMobile = useMediaQuery("(max-width: 760px)");
  const searchParamKey = searchParams.toString();
  const {
    state: projectsState,
    error: projectsError,
    loading: projectsLoading,
    refresh: refreshProjects
  } = useProjectsState(initialProjectsState, initialProjectsError);
  const {
    followUps: personalOpsFollowUps,
    error: personalOpsFollowUpsError,
    loading: personalOpsFollowUpsLoading,
    refresh: refreshPersonalOpsFollowUps
  } = usePersonalOpsFollowUps(
    initialPersonalOpsFollowUps,
    initialPersonalOpsFollowUpsError
  );
  const {
    state: noteLinksState,
    error: noteLinksError,
    loading: noteLinksLoading,
    refresh: refreshNoteLinks
  } = useNoteLinksState(initialNoteLinksState, initialNoteLinksError);

  const selectedResource = useMemo<ResourceRecord>(
    () => resources.find((resource) => resource.id === selectedId) || null as unknown as ResourceRecord,
    [resources, selectedId]
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
              !resource.deletedAt &&
              matchesQuery(resource, query) &&
              matchesCollection(resource, collection) &&
              (view === "archived" ? resource.lifecycleState === "archived" : resource.lifecycleState !== "archived") &&
              (view !== "pinned" || resource.pinned === true) &&
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
    [collection, duplicateEvidence, linkedContextByResourceId, linkedContextModule, query, resources, reviewPriorityById, reviewQueue, sort, unavailableViewReason, view]
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
        item: "",
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
      linkedContextModule ? "links" : view === "duplicate-urls" ? "properties" : "overview";
    setSelectedId(resource.id);
    setActiveTab(nextTab);
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

  function selectLibraryView(nextView: ResourcesView) {
    const nextLinkedContextModule = linkedContextModuleForView(nextView);
    const nextTab: ResourcesTab = nextLinkedContextModule
      ? "links"
      : nextView === "duplicate-urls"
        ? "properties"
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
    setCollection("all");
    setSort(nextSort);
    setActiveTab(nextTab);
    updateUrl(
      {
        view: nextView,
        sort: nextSort,
        tab: nextTab,
        item: ""
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
        active: view === id && collection === "all",
        onSelect: () => selectLibraryView(id)
      }))
    },
    {
      id: "types",
      label: "Types",
      items: TYPE_ROWS.map((label) => ({
        id: `type-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        label,
        count: label === "Components" ? resources.filter(isStyleGuideComponent).length : undefined,
        active: label === "Components" && collection === "components",
        onSelect: label === "Components" ? () => {
          setCollection("components");
          setMobileSidebarOpen(false);
          setInspectorOpen(false);
        } : undefined,
        disabled: label !== "Components",
        disabledReason: label === "Components" ? undefined : "Native Resource type is not available in the legacy adapter; records are not guessed from titles."
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
      description="Saved references and useful source material."
      sections={sidebarSections}
      mobileOpen={mobileSidebarOpen}
      onClose={() => setMobileSidebarOpen(false)}
      className={styles.sidebar}
    />
  );

  function openResourceEditor(mode: "create" | "edit") {
    if (mode === "edit" && !selectedResource) return;
    setAiOpen(false);
    setMobileSidebarOpen(false);
    setEditorMode(mode);
    updateUrl({ ai: false });
  }

  function openProjectAssociation() {
    if (!selectedResource) return;
    setAiOpen(false);
    setMobileSidebarOpen(false);
    setInspectorOpen(false);
    setProjectAssociationOpen(true);
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
      if (saved.source.canonicalUrl) {
        void createResourcesRepository().runAutomation(saved.id, "metadata_refresh").then((result) => {
          if (result.ok) {
            setResources((current) => current.map((resource) => resource.id === result.data.resource.id ? result.data.resource : resource));
          }
        });
      }
    }

    router.refresh();
  }

  function handleInlineSaved(saved: ResourceRecord) {
    setResources((current) => current.map((resource) => resource.id === saved.id ? saved : resource));
    setSelectedId(saved.id);
    router.refresh();
  }

  function handleArchived(saved: ResourceRecord, removed = false) {
    setResources((current) => removed
      ? current.filter((resource) => resource.id !== saved.id)
      : current.map((resource) => resource.id === saved.id ? saved : resource));
    if (view !== "archived" || removed) {
      const next = resources.find((resource) => resource.id !== saved.id && resource.lifecycleState !== "archived");
      setSelectedId(next?.id || "");
      setInspectorOpen(Boolean(next));
      updateUrl({ selected: next?.id || "", tab: "overview" }, { history: "replace" });
    }
    router.refresh();
  }

  function openInlineEditor() {
    setActiveTab("properties");
    setPropertiesEditRequest((current) => current + 1);
    updateUrl({ tab: "properties", item: "" }, { history: "push" });
  }

  async function updateHeaderResource(input: Parameters<ReturnType<typeof createResourcesRepository>["update"]>[1], removed = false) {
    if (!selectedResource || headerBusy) return;
    setHeaderBusy(true);
    const result = await createResourcesRepository().update(selectedResource.id, {
      ...input,
      expectedUpdatedAt: selectedResource.updatedAt
    });
    setHeaderBusy(false);
    if (!result.ok) return;
    if (input.action === "archive") handleArchived(result.data, removed);
    else handleInlineSaved(result.data);
  }

  const aiDock = (
    <SharedAIDock
      hidden={Boolean(editorMode || projectAssociationOpen || mobileSidebarOpen || (isInspectorOverlay && inspectorOpen))}
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
      objectType=""
      title={selectedResource.title}
      identity={<ResourceMark gradient={selectedResource.gradient} className={resourceStyles.headerMark} />}
      actions={
        <div className={resourceStyles.headerActions}>
          {isInspectorOverlay && (
            <ResourceIconButton icon="close" label="Close" onClick={() => setInspectorOpen(false)} />
          )}
          {selectedResource.source.canonicalUrl ? (
            <a
              className={resourceStyles.iconButton}
              href={selectedResource.source.canonicalUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open source"
              title="Open source"
            >
              <PersonalOpsIcon name="open" />
            </a>
          ) : null}
          <ResourceIconButton icon="review" label="Mark reviewed" disabled={headerBusy} onClick={() => void updateHeaderResource({ action: "review" })} />
          <ResourceIconButton icon="star" label={selectedResource.pinned ? "Unpin resource" : "Pin resource"} active={selectedResource.pinned === true} disabled={headerBusy} onClick={() => void updateHeaderResource({ starred: !selectedResource.pinned })} />
          <details className={resourceStyles.menu}>
            <summary className={resourceStyles.iconButton} aria-label="More resource actions" title="More resource actions"><PersonalOpsIcon name="more" /></summary>
            <div className={resourceStyles.menuPanel}>
              <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openInlineEditor(); }}><PersonalOpsIcon name="edit" />Edit</button>
              <button type="button" disabled={headerBusy} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); if (window.confirm("Archive this resource? Its links and history will stay intact.")) void updateHeaderResource({ action: "archive", archiveReason: "Archived from Resources" }); }}><PersonalOpsIcon name="archive" />Archive</button>
              <button type="button" data-destructive="true" disabled={headerBusy} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); if (window.confirm("Delete this resource from active and archived views? Its underlying record will remain recoverable.")) void updateHeaderResource({ action: "archive", archiveReason: "Deleted from Resources", deletedAt: new Date().toISOString() }, true); }}><PersonalOpsIcon name="delete" />Delete</button>
            </div>
          </details>
        </div>
      }
    />
  ) : undefined;

  function renderInspectorPanel() {
    if (!selectedResource) {
      return (
        <div className={styles.emptyInspector}>
          <h2>No Resource selected</h2>
          <p>Select a resource to see its notes, source details, and related work.</p>
        </div>
      );
    }

    const tabsId = `resource-${selectedResource.id}`;
    const targetGroups = contentTargetGroupsForObject(contentGraph, selectedResource.nativeRef);
    const linkedContextRecord =
      linkedContextByResourceId.get(selectedResource.id) || null;

    if (activeTab === "overview") {
      return (
        <DetailTabPanel tabsId={tabsId} tabId="overview" active>
          <ResourceOverviewView
            resource={selectedResource}
            onSaved={handleInlineSaved}
            followUpPanel={
              <LinkedFollowUpsPanel
                source={resourceFollowUpSource(selectedResource)}
                followUps={personalOpsFollowUps}
                loading={personalOpsFollowUpsLoading}
                error={personalOpsFollowUpsError}
                onRefresh={() => void refreshPersonalOpsFollowUps()}
                createHref={resourceFollowUpCreationRoute(selectedResource)}
                limit={3}
                compact
                showHeader={false}
                showBoundary={false}
                hideWhenEmpty
                title="Follow-ups"
              />
            }
          />
        </DetailTabPanel>
      );
    }

    if (activeTab === "timeline") {
      return (
        <DetailTabPanel tabsId={tabsId} tabId="timeline" active>
          <ResourceTimelineView resource={selectedResource} />
        </DetailTabPanel>
      );
    }

    if (activeTab === "links") {
      return (
        <DetailTabPanel tabsId={tabsId} tabId="links" active>
          <ResourceLinksView
            resource={selectedResource}
            links={objectLinks}
            targets={initialObjectTargets}
            evidenceTargets={[
              ...(linkedContextRecord?.placements || []).map((placement) => placement.ownerRef),
              ...targetGroups.map((group) => group.target)
            ]}
            projectPanel={
              <LinkedProjectsPanel
                source={selectedResource.nativeRef}
                sourceLabel={selectedResource.title}
                state={projectsState}
                loading={projectsLoading}
                error={projectsError}
                onRefresh={refreshProjects}
                manageLifecycle
                manageHealth
                legacyProjectLabels={selectedResource.provenance.projects}
                title="Projects"
                ownerTab="files-links"
                limit={6}
                compact
                embedded
                showHeader={false}
                showConnections={false}
                showLifecycleHeader={false}
                showSummary={false}
                showBoundary={false}
              />
            }
            projectCount={projectsState.links.filter((link) =>
              link.source.module === selectedResource.nativeRef.module &&
              link.source.objectType === selectedResource.nativeRef.objectType &&
              link.source.objectId === selectedResource.nativeRef.objectId &&
              link.linkState !== "removed"
            ).length}
            notePanel={
              <LinkedNotesPanel
                source={selectedResource.nativeRef}
                state={noteLinksState}
                loading={noteLinksLoading}
                error={noteLinksError}
                onRefresh={refreshNoteLinks}
                title="Notes"
                limit={6}
                compact
              />
            }
            noteCount={noteLinksState.links.filter((link) =>
              link.targetRef.module === selectedResource.nativeRef.module &&
              link.targetRef.objectType === selectedResource.nativeRef.objectType &&
              link.targetRef.objectId === selectedResource.nativeRef.objectId &&
              link.state !== "removed"
            ).length}
            reviewPanel={
              <LinkedReviewsPanel
                source={selectedResource.nativeRef}
                initialReviewViews={initialReviewViews}
                initialError={initialReviewsError}
                title="Reviews"
                wide={false}
                compact
              />
            }
            reviewCount={getLinkedReviewContexts(initialReviewViews, selectedResource.nativeRef).length}
            onAssociateProject={openProjectAssociation}
            onLinksChange={setObjectLinks}
            onResourceSaved={handleInlineSaved}
          />
        </DetailTabPanel>
      );
    }

    if (activeTab === "properties") {
      return (
        <DetailTabPanel tabsId={tabsId} tabId="properties" active>
          <ResourcePropertiesView
            resource={selectedResource}
            editRequest={propertiesEditRequest}
            onSaved={handleInlineSaved}
            onArchived={handleArchived}
          />
        </DetailTabPanel>
      );
    }

    return null;
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
            updateUrl({ tab: nextTab, item: "" });
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
      aiDock={aiDock}
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
      {projectAssociationOpen && selectedResource && (
        <ProjectAssociationSheet
          key={`resource-project-association:${selectedResource.id}`}
          open
          source={selectedResource.nativeRef}
          sourceKind="Resource"
          state={projectsState}
          loading={projectsLoading}
          error={projectsError}
          defaultRelationship="source_material"
          onRefresh={refreshProjects}
          onClose={() => setProjectAssociationOpen(false)}
          onLinked={() => router.refresh()}
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
              <div className={styles.resourceTitleLine}>
                <h1>{collection === "components" ? "Components" : VIEW_LABELS[view]}</h1>
                <span>{unavailableViewReason ? "–" : visibleResources.length}</span>
              </div>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.button}
                data-primary="true"
                aria-label="Add Resource"
                onClick={() => openResourceEditor("create")}
              >
                <PersonalOpsIcon name="plus" /> Resource
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

          <div className={styles.resourceToolbar}>
            <div className={styles.resourceSearch} role="search">
              <PersonalOpsIcon name="search" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  updateUrl({ query: event.target.value });
                }}
                placeholder="Search…"
                aria-label="Search Resources"
              />
              <details className={styles.resourceToolbarMenu}>
                <summary><PersonalOpsIcon name="filter" /><span>Filter</span></summary>
                <div role="menu" aria-label="Filter Resources">
                  <button type="button" aria-pressed={collection === "all" && view === "all"} onClick={(event) => { setCollection("all"); selectLibraryView("all"); event.currentTarget.closest("details")?.removeAttribute("open"); }}>All Resources</button>
                  <button type="button" aria-pressed={collection === "components"} onClick={(event) => { setCollection("components"); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Components</button>
                  <button type="button" aria-pressed={collection === "all" && view === "needs-review"} onClick={(event) => { setCollection("all"); selectLibraryView("needs-review"); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Needs Review</button>
                  <button type="button" aria-pressed={collection === "all" && view === "duplicate-urls"} onClick={(event) => { setCollection("all"); selectLibraryView("duplicate-urls"); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Duplicate URLs</button>
                </div>
              </details>
              <details className={styles.resourceToolbarMenu}>
                <summary><PersonalOpsIcon name="sort" /><span>Sort</span></summary>
                <div role="menu" aria-label="Sort Resources">
                  {([
                    ["updated-desc", "Recently Updated"],
                    ["updated-asc", "Oldest Update"],
                    ["title", "Title"],
                    ["review", "Evidence Gaps First"]
                  ] as const).map(([id, label]) => (
                    <button type="button" aria-pressed={sort === id} onClick={(event) => {
                      setSort(id);
                      updateUrl({ sort: id });
                      event.currentTarget.closest("details")?.removeAttribute("open");
                    }} key={id}>{label}</button>
                  ))}
                </div>
              </details>
            </div>
          </div>

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
                    leading={<ResourceMark gradient={resource.gradient} className={resourceStyles.directoryMark} />}
                    description={resource.body || resource.metadata.description || (resource.source.canonicalUrl ? resource.source.canonicalUrl : "No description")}
                    metadata={<span className={resourceStyles.directoryMeta}>
                      {resource.source.canonicalUrl ? <span>{resource.source.displayDomain || resource.source.canonicalUrl}</span> : null}
                      <span>Added {formatDate(resource.createdAt)}</span>
                      <span>Last review {formatDate(resource.review.lastReviewedAt, "Not yet")}</span>
                      <span>Next {formatDate(resource.review.nextReviewAt, "Not set")}</span>
                    </span>}
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
                        <span className={resourceStyles.typePill}>{TYPE_LABELS[resource.type]}</span>
                      )
                    }
                    actions={<ResourceIconButton icon="star" label={resource.pinned ? "Unpin resource" : "Pin resource"} active={resource.pinned === true} onClick={() => {
                      void createResourcesRepository().update(resource.id, { starred: !resource.pinned, expectedUpdatedAt: resource.updatedAt }).then((result) => {
                        if (result.ok) handleInlineSaved(result.data);
                      });
                    }} />}
                    selected={selectedResource?.id === resource.id}
                    onSelect={() => selectResource(resource)}
                    className={
                      view === "needs-review" ||
                      view === "duplicate-urls" ||
                      linkedContextModule
                        ? `${styles.reviewQueueRow} ${resourceStyles.resourceRow}`
                        : resourceStyles.resourceRow
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
                    ? "No matching Resources"
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
                  ? "Try another search or filter."
                  : "Add your first source, component, or design library."
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
