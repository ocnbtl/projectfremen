"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import DirectoryPane from "../admin-shell/DirectoryPane";
import InspectorRail from "../admin-shell/InspectorRail";
import ModuleShell from "../admin-shell/ModuleShell";
import ModuleSidebar, { type ModuleSidebarSection } from "../admin-shell/ModuleSidebar";
import SharedAIDock from "../admin-shell/SharedAIDock";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import DenseObjectRow from "../operational/DenseObjectRow";
import DetailTabs, { DetailTabPanel, type DetailTab } from "../operational/DetailTabs";
import MetricStrip from "../operational/MetricStrip";
import ObjectHeader from "../operational/ObjectHeader";
import QuickActionBar, { type QuickAction } from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import { createProjectsRepository } from "../../lib/modules/projects/repository";
import type {
  Project,
  ProjectBlocker,
  ProjectBlockerSeverity,
  ProjectLink,
  ProjectLinkRelationship,
  ProjectMilestone,
  ProjectPriority,
  ProjectsObjectByFamily
} from "../../lib/modules/projects/types";
import type {
  ProjectDirectoryItem,
  ProjectDisplayRecord,
  ProjectsWorkspaceSnapshot
} from "../../lib/modules/projects/view-model";
import { createNativeObjectRef, getModuleRoute, getNativeObjectRoute } from "../../lib/native-objects/routes";
import type { ModuleId } from "../../lib/native-objects/types";
import {
  parseProjectsUrlState,
  serializeProjectsUrlState,
  type ProjectFilter,
  type ProjectSort,
  type ProjectTab,
  type ProjectsUrlState,
  type ProjectView
} from "../../lib/native-objects/url-state";
import styles from "./ProjectsWorkspace.module.css";

type ProjectsWorkspaceProps = {
  initialSnapshot: ProjectsWorkspaceSnapshot;
  initialMode?: "index" | "detail";
  initialProjectId?: string;
  initialLoadError?: string;
};

type EditorKind =
  | "project-create"
  | "project-edit"
  | "legacy-promote"
  | "milestone-create"
  | "blocker-create"
  | "blocker-resolve"
  | "link-create";

type EditorState = {
  kind: EditorKind;
  projectId?: string;
  objectId?: string;
  values: Record<string, string | boolean>;
};

type ConfirmationState =
  | { kind: "project-complete"; projectId: string }
  | { kind: "project-archive"; projectId: string }
  | { kind: "project-restore"; projectId: string }
  | { kind: "milestone-complete"; projectId: string; objectId: string }
  | { kind: "link-remove"; projectId: string; objectId: string }
  | { kind: "link-restore"; projectId: string; objectId: string }
  | null;

const PROJECT_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "notes-decisions", label: "Notes & Decisions" },
  { id: "people", label: "People" },
  { id: "files-links", label: "Files & Links" },
  { id: "properties", label: "Properties" }
];

const VIEW_LABELS: Readonly<Record<ProjectView, string>> = {
  all: "All Projects",
  active: "Active",
  planned: "Planned",
  attention: "Needs Attention",
  due: "Due This Week",
  "needs-review": "Needs Review",
  blocked: "Blocked",
  linked: "Linked Context",
  archived: "Archive"
};

const FILTER_LABELS: Readonly<Record<ProjectFilter, string>> = {
  all: "All",
  active: "Active",
  planned: "Planned",
  due: "Due",
  "needs-review": "Needs review",
  blocked: "Blocked",
  linked: "Linked",
  "missing-owner": "Missing owner",
  stale: "Stale",
  archived: "Archived"
};

const SORT_LABELS: Readonly<Record<ProjectSort, string>> = {
  "attention-updated": "Attention, then updated",
  "updated-desc": "Updated — newest",
  title: "Title — A–Z",
  priority: "Priority",
  due: "Next milestone"
};

const LINK_RELATIONSHIPS: readonly ProjectLinkRelationship[] = [
  "evidence",
  "source_material",
  "review_input",
  "launch_proof",
  "supporting_context",
  "background_reference",
  "decision_support",
  "blocker_evidence",
  "advisor_context",
  "finance_context",
  "follow_up_context",
  "related_project"
];

const LINK_MODULES: readonly ModuleId[] = [
  "notes",
  "people",
  "media",
  "resources",
  "finance",
  "reviews",
  "personal_ops",
  "projects"
];

const PRIORITY_ORDER: Readonly<Record<ProjectPriority, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

function displayLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string, fallback = "Not recorded") {
  if (!value) return fallback;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  }).format(date);
}

function initials(value: string) {
  const cleaned = value.replace(/^Project\s+/i, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") : "PR";
}

function excerpt(value: string, limit = 90) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "No description recorded.";
  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean;
}

function activeMilestones(item: ProjectDirectoryItem) {
  return item.milestones.filter((milestone) => !["complete", "archived"].includes(milestone.state));
}

function openBlockers(item: ProjectDirectoryItem) {
  return item.blockers.filter((blocker) => blocker.state === "open" || blocker.state === "carried_forward");
}

function nextMilestone(item: ProjectDirectoryItem) {
  return [...activeMilestones(item)].sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0];
}

function hasDueMilestone(item: ProjectDirectoryItem) {
  const limit = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return activeMilestones(item).some((milestone) => {
    const time = Date.parse(milestone.dueAt);
    return Number.isFinite(time) && time <= limit;
  });
}

function matchesQuery(item: ProjectDirectoryItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    item.project.id,
    item.project.slug,
    item.project.name,
    item.project.description,
    item.project.area,
    item.project.owner,
    item.project.objective,
    item.project.legacyEntityName,
    ...item.attentionReasons,
    ...item.milestones.flatMap((milestone) => [milestone.id, milestone.title, milestone.description, milestone.owner]),
    ...item.blockers.flatMap((blocker) => [blocker.id, blocker.title, blocker.condition, blocker.owner]),
    ...item.linkedContext.flatMap((context) => [context.ref.label, context.ref.objectId, context.relationship, context.summary])
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function matchesView(item: ProjectDirectoryItem, view: ProjectView) {
  if (view === "all") return item.project.lifecycle !== "archived";
  if (view === "active") return item.project.lifecycle === "active";
  if (view === "planned") return item.project.lifecycle === "planned" || item.project.lifecycle === "draft";
  if (view === "attention") return item.attentionReasons.length > 0 || ["attention", "blocked"].includes(item.project.health);
  if (view === "due") return hasDueMilestone(item);
  if (view === "needs-review") return item.project.review === "needs_review" || item.project.review === "in_review";
  if (view === "blocked") return item.project.health === "blocked" || openBlockers(item).length > 0;
  if (view === "linked") return item.linkedContext.length > 0;
  return item.project.lifecycle === "archived";
}

function matchesFilter(item: ProjectDirectoryItem, filter: ProjectFilter) {
  if (filter === "all") return item.project.lifecycle !== "archived";
  if (filter === "active") return item.project.lifecycle === "active";
  if (filter === "planned") return item.project.lifecycle === "planned" || item.project.lifecycle === "draft";
  if (filter === "due") return hasDueMilestone(item);
  if (filter === "needs-review") return item.project.review === "needs_review" || item.project.review === "in_review";
  if (filter === "blocked") return item.project.health === "blocked" || openBlockers(item).length > 0;
  if (filter === "linked") return item.linkedContext.length > 0;
  if (filter === "missing-owner") return !item.project.owner;
  if (filter === "stale") return item.project.health === "stale" || item.project.cadence === "dormant";
  return item.project.lifecycle === "archived";
}

function dueValue(item: ProjectDirectoryItem) {
  return nextMilestone(item)?.dueAt || "9999-12-31";
}

function sortProjects(items: ProjectDirectoryItem[], sort: ProjectSort) {
  return [...items].sort((left, right) => {
    if (sort === "title") return left.project.name.localeCompare(right.project.name, undefined, { sensitivity: "base" });
    if (sort === "priority") {
      const delta = PRIORITY_ORDER[left.project.priority] - PRIORITY_ORDER[right.project.priority];
      if (delta !== 0) return delta;
    }
    if (sort === "due") {
      const delta = dueValue(left).localeCompare(dueValue(right));
      if (delta !== 0) return delta;
    }
    if (sort === "attention-updated") {
      const leftAttention = itemAttentionScore(left);
      const rightAttention = itemAttentionScore(right);
      if (leftAttention !== rightAttention) return rightAttention - leftAttention;
    }
    return (right.project.updatedAt || "").localeCompare(left.project.updatedAt || "");
  });
}

function itemAttentionScore(item: ProjectDirectoryItem) {
  return item.attentionReasons.length + openBlockers(item).length * 2 + (item.project.health === "blocked" ? 3 : 0);
}

function stateTone(value: string): "green" | "amber" | "red" | "blue" | "purple" | undefined {
  if (["active", "healthy", "reviewed", "current", "complete", "resolved"].includes(value)) return "green";
  if (["blocked", "critical", "broken", "overdue"].includes(value)) return "red";
  if (["attention", "high", "needs_review", "in_review", "due", "due_soon", "stale"].includes(value)) return "amber";
  if (["planned", "draft", "unknown", "unset"].includes(value)) return "blue";
  if (["archived", "paused", "waived", "carried_forward"].includes(value)) return "purple";
  return undefined;
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

function projectDisplayFromNative(project: Project): ProjectDisplayRecord {
  return {
    id: project.id,
    nativeRef: createNativeObjectRef({
      module: "projects",
      objectType: "project",
      objectId: project.id,
      label: project.name
    }),
    slug: project.slug,
    name: project.name,
    description: project.description,
    sourceKind: "native",
    editable: true,
    promotable: false,
    lifecycle: project.lifecycle,
    health: project.health,
    review: project.review,
    cadence: project.cadence,
    priority: project.priority,
    owner: project.owner,
    area: project.area,
    objective: project.objective,
    starred: project.starred,
    legacyKey: project.legacySource?.key,
    legacyRoute: project.legacySource?.legacyRoute,
    legacyEntityName: project.legacySource?.entityName,
    updatedAt: project.updatedAt,
    lastActivityAt: project.lastActivityAt
  };
}

function emptyDirectoryItem(project: Project): ProjectDirectoryItem {
  return {
    project: projectDisplayFromNative(project),
    milestones: [],
    blockers: [],
    links: [],
    timelineEvents: [],
    linkedContext: [],
    legacyKpis: [],
    legacyDocuments: [],
    legacyDocumentTotal: 0,
    attentionReasons: [
      ...(!project.owner ? ["Project owner is not assigned."] : []),
      ...(!project.objective ? ["Project objective is not defined."] : [])
    ]
  };
}

function personalOpsCreateHref(
  collection: "decisions" | "follow-ups",
  project: ProjectDisplayRecord,
  source?: { objectType: string; objectId: string; label: string }
) {
  const isDecision = collection === "decisions";
  const params = new URLSearchParams({
    create: isDecision ? "decision" : "follow-up",
    sourceModule: "projects",
    sourceObjectType: source?.objectType || "project",
    sourceObjectId: source?.objectId || project.id,
    sourceLabel: source?.label || project.name
  });
  if (source) params.set("sourceContainerObjectId", project.id);
  return `/admin/personal/${collection}?${params.toString()}`;
}

function nativeCreateHref(module: "notes" | "people" | "media" | "resources", project: ProjectDisplayRecord) {
  const params = new URLSearchParams({
    sourceModule: "projects",
    sourceObjectType: "project",
    sourceObjectId: project.id,
    sourceLabel: project.name
  });
  return `${getModuleRoute(module)}?${params.toString()}`;
}

const FOCUSABLE = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

function EditorDrawer({
  open,
  title,
  description,
  busy,
  error,
  onRequestClose,
  onSubmit,
  children
}: {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  error: string;
  onRequestClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onRequestClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [onRequestClose, open]);

  if (!open) return null;
  return (
    <div className={styles.formBackdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onRequestClose();
    }}>
      <form
        ref={panelRef}
        className={styles.formPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="projects-editor-title"
        aria-describedby="projects-editor-description"
        aria-busy={busy || undefined}
        onSubmit={onSubmit}
      >
        <header className={styles.formHeader}>
          <div>
            <h2 id="projects-editor-title">{title}</h2>
            <p id="projects-editor-description">{description}</p>
          </div>
          <button ref={closeRef} type="button" className={styles.iconButton} onClick={onRequestClose} disabled={busy} aria-label={`Close ${title}`}>
            ×
          </button>
        </header>
        <div className={styles.formBody}>
          {error && <p className={styles.errorBanner} role="alert">{error}</p>}
          {children}
        </div>
        <footer className={styles.formFooter}>
          <button type="button" className={styles.button} onClick={onRequestClose} disabled={busy}>Cancel</button>
          <button type="submit" className={styles.button} data-primary="true" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function recomputeAttention(item: ProjectDirectoryItem): ProjectDirectoryItem {
  if (item.project.sourceKind === "legacy_projection" || item.project.lifecycle === "archived") return item;
  const reasons: string[] = [];
  if (!item.project.owner) reasons.push("Project owner is not assigned.");
  if (!item.project.objective) reasons.push("Project objective is not defined.");
  const blockers = openBlockers(item);
  if (blockers.length) reasons.push(`${blockers.length} open project blocker${blockers.length === 1 ? "" : "s"}.`);
  const overdue = activeMilestones(item).filter((milestone) => {
    const dueAt = Date.parse(milestone.dueAt);
    return Number.isFinite(dueAt) && dueAt < Date.now();
  });
  if (overdue.length) reasons.push(`${overdue.length} overdue milestone${overdue.length === 1 ? "" : "s"}.`);
  return { ...item, attentionReasons: reasons };
}

function nativeLinkContext(links: ProjectLink[]) {
  return links
    .filter((link) => link.linkState !== "removed")
    .map((link) => ({
      ref: link.source,
      sourceKind: "native_project_link" as const,
      relationship: link.relationship,
      summary: link.projectSpecificNote,
      legacyStatus: link.linkState,
      updatedAt: link.updatedAt
    }));
}

export default function ProjectsWorkspace({
  initialSnapshot,
  initialMode = "index",
  initialProjectId,
  initialLoadError = ""
}: ProjectsWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const repository = useMemo(() => createProjectsRepository(), []);
  const selectedChildRef = useRef<HTMLElement>(null);
  const [initialUrlState] = useState(() => parseProjectsUrlState(searchParams));
  const initialDetail = initialMode === "detail";
  const initialSelectedProject =
    (initialProjectId && initialSnapshot.projects.find((item) =>
      [item.project.id, item.project.slug, item.project.legacyKey].filter(Boolean).includes(initialProjectId)
    )?.project.id) ||
    (!initialDetail && initialSnapshot.projects.some((item) => item.project.id === initialUrlState.item)
      ? initialUrlState.item
      : initialSnapshot.defaultProjectId);

  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [view, setView] = useState<ProjectView>(initialUrlState.view);
  const [filter, setFilter] = useState<ProjectFilter>(initialUrlState.filter);
  const [sort, setSort] = useState<ProjectSort>(initialUrlState.sort);
  const [query, setQuery] = useState(initialUrlState.query);
  const [compact, setCompact] = useState(initialUrlState.compact);
  const [activeTab, setActiveTab] = useState<ProjectTab>(initialUrlState.tab);
  const [selectedProjectId, setSelectedProjectId] = useState(initialSelectedProject || "");
  const [selectedChildId, setSelectedChildId] = useState(initialDetail ? initialUrlState.item : "");
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(initialUrlState.ai);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);
  const [confirmationReason, setConfirmationReason] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mutationError, setMutationError] = useState("");
  const isMobile = useMediaQuery("(max-width: 760px)");
  const isInspectorOverlay = useMediaQuery("(max-width: 1240px)");
  const searchParamKey = searchParams.toString();

  const selectedItem = useMemo(
    () => snapshot.projects.find((item) => item.project.id === selectedProjectId) || null,
    [selectedProjectId, snapshot.projects]
  );

  const visibleProjects = useMemo(
    () => sortProjects(
      snapshot.projects.filter((item) => matchesQuery(item, query) && matchesView(item, view) && matchesFilter(item, filter)),
      sort
    ),
    [filter, query, snapshot.projects, sort, view]
  );

  const queryScopedProjects = useMemo(
    () => snapshot.projects.filter((item) => matchesQuery(item, query)),
    [query, snapshot.projects]
  );

  useEffect(() => {
    const next = parseProjectsUrlState(searchParams);
    setView(next.view);
    setFilter(next.filter);
    setSort(next.sort);
    setQuery(next.query);
    setCompact(next.compact);
    setActiveTab(next.tab);
    setAiOpen(next.ai);
    if (initialDetail) {
      setSelectedChildId(next.item);
    } else if (snapshot.projects.some((item) => item.project.id === next.item)) {
      setSelectedProjectId(next.item);
    }
  }, [initialDetail, searchParamKey, snapshot.projects]);

  useEffect(() => {
    if (initialDetail || !visibleProjects.length) return;
    if (visibleProjects.some((item) => item.project.id === selectedProjectId)) {
      if (!parseProjectsUrlState(searchParams).item) updateUrl({ item: selectedProjectId }, "replace");
      return;
    }
    const nextId = visibleProjects[0].project.id;
    setSelectedProjectId(nextId);
    updateUrl({ item: nextId }, "replace");
  }, [filter, initialDetail, query, selectedProjectId, sort, view, visibleProjects.length]);

  useEffect(() => {
    if (!editor || !editorDirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function guardAnchor(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.closest(`.${styles.formPanel}`)) return;
      if (!window.confirm("Discard the unsaved project changes and leave this page?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardAnchor, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardAnchor, true);
    };
  }, [editor, editorDirty]);

  useEffect(() => {
    if (!selectedChildId) return;
    const frame = window.requestAnimationFrame(() => {
      selectedChildRef.current?.focus({ preventScroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, selectedChildId]);

  function destinationFor(
    partial: Partial<ProjectsUrlState>,
    targetPath = pathname
  ) {
    const params = serializeProjectsUrlState(
      {
        view,
        filter,
        sort,
        query,
        item: initialDetail ? selectedChildId : selectedProjectId,
        tab: activeTab,
        compact,
        ai: aiOpen,
        ...partial
      },
      searchParams
    );
    return `${targetPath}${params.size ? `?${params.toString()}` : ""}`;
  }

  function updateUrl(
    partial: Partial<ProjectsUrlState>,
    history: "push" | "replace" = "replace",
    targetPath = pathname
  ) {
    const destination = destinationFor(partial, targetPath);
    if (history === "push") router.push(destination, { scroll: false });
    else router.replace(destination, { scroll: false });
  }

  function selectView(nextView: ProjectView) {
    setView(nextView);
    setFilter("all");
    const targetPath = initialDetail ? getModuleRoute("projects") : pathname;
    updateUrl({ view: nextView, filter: "all", item: initialDetail ? "" : selectedProjectId, tab: "overview" }, initialDetail ? "push" : "replace", targetPath);
    setMobileSidebarOpen(false);
    setInspectorOpen(false);
  }

  function selectArea(area: string) {
    setView("all");
    setFilter("all");
    setQuery(area);
    const targetPath = initialDetail ? getModuleRoute("projects") : pathname;
    updateUrl({ view: "all", filter: "all", query: area, item: initialDetail ? "" : selectedProjectId }, initialDetail ? "push" : "replace", targetPath);
    setMobileSidebarOpen(false);
  }

  function selectProject(item: ProjectDirectoryItem) {
    setSelectedProjectId(item.project.id);
    setSelectedChildId("");
    setActiveTab("overview");
    setInspectorOpen(true);
    if (isMobile || initialDetail) {
      updateUrl({ item: "", tab: "overview" }, "push", getNativeObjectRoute(item.project.nativeRef));
      return;
    }
    updateUrl({ item: item.project.id, tab: "overview" }, "push");
  }

  function selectTab(tabId: string) {
    const nextTab = tabId as ProjectTab;
    setActiveTab(nextTab);
    setSelectedChildId("");
    updateUrl({ tab: nextTab, item: initialDetail ? "" : selectedProjectId });
  }

  function selectChild(objectId: string, tab: ProjectTab) {
    setSelectedChildId(objectId);
    setActiveTab(tab);
    updateUrl({ item: objectId, tab });
  }

  function setChecked(id: string, checked: boolean) {
    setBatchSelection((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearFeedback() {
    setNotice("");
    setMutationError("");
  }

  function changeEditorValue(name: string, value: string | boolean) {
    setEditor((current) => current ? { ...current, values: { ...current.values, [name]: value } } : current);
    setEditorDirty(true);
    setEditorError("");
  }

  function openEditor(kind: EditorKind, item?: ProjectDirectoryItem, object?: ProjectBlocker) {
    clearFeedback();
    let values: Record<string, string | boolean> = {};
    if (kind === "project-create") {
      values = { name: "", description: "", objective: "", completionTarget: "", area: "", owner: "", lifecycle: "planned", priority: "medium" };
    } else if (kind === "project-edit" && item) {
      const nativeProject = snapshot.nativeState.projects.find((project) => project.id === item.project.id);
      values = {
        name: item.project.name,
        description: item.project.description,
        objective: item.project.objective || "",
        area: item.project.area || "",
        owner: item.project.owner || "",
        lifecycle: item.project.lifecycle,
        priority: item.project.priority,
        review: item.project.review,
        cadence: item.project.cadence,
        completionTarget: nativeProject?.completionTarget || ""
      };
    } else if (kind === "legacy-promote" && item) {
      values = { objective: item.project.objective || "", area: item.project.area || "", owner: item.project.owner || "", priority: item.project.priority };
    } else if (kind === "milestone-create") {
      values = { title: "", description: "", dueAt: "", owner: "", completionCriteria: "" };
    } else if (kind === "blocker-create") {
      values = { title: "", condition: "", severity: "medium", owner: "", dueAt: "" };
    } else if (kind === "blocker-resolve" && object) {
      values = { resolution: object.resolution || "" };
    } else if (kind === "link-create") {
      values = {
        sourceModule: "notes",
        sourceObjectType: "note",
        sourceObjectId: "",
        sourceContainerObjectId: "",
        sourceLabel: "",
        relationship: "supporting_context",
        projectSpecificNote: "",
        isRequiredEvidence: false
      };
    }
    setEditor({ kind, projectId: item?.project.id, objectId: object?.id, values });
    setEditorDirty(false);
    setEditorError("");
  }

  function requestCloseEditor() {
    if (mutationBusy) return;
    if (editorDirty) setDiscardOpen(true);
    else setEditor(null);
  }

  function closeEditor() {
    setEditor(null);
    setEditorDirty(false);
    setEditorError("");
  }

  function updateDirectoryItem(projectId: string, transform: (item: ProjectDirectoryItem) => ProjectDirectoryItem) {
    setSnapshot((current) => ({
      ...current,
      projects: current.projects.map((item) => item.project.id === projectId ? recomputeAttention(transform(item)) : item)
    }));
  }

  function applyProject(project: Project) {
    setSnapshot((current) => {
      const existing = current.projects.find((item) => item.project.id === project.id);
      const nativeProjects = current.nativeState.projects.some((item) => item.id === project.id)
        ? current.nativeState.projects.map((item) => item.id === project.id ? project : item)
        : [...current.nativeState.projects, project];
      if (!existing) return {
        ...current,
        nativeState: { ...current.nativeState, projects: nativeProjects },
        projects: [...current.projects, emptyDirectoryItem(project)]
      };
      return {
        ...current,
        nativeState: { ...current.nativeState, projects: nativeProjects },
        projects: current.projects.map((item) => item.project.id === project.id
          ? recomputeAttention({ ...item, project: projectDisplayFromNative(project) })
          : item)
      };
    });
  }

  function applyMilestone(milestone: ProjectMilestone) {
    updateDirectoryItem(milestone.projectId, (item) => ({
      ...item,
      milestones: item.milestones.some((candidate) => candidate.id === milestone.id)
        ? item.milestones.map((candidate) => candidate.id === milestone.id ? milestone : candidate)
        : [...item.milestones, milestone].sort((left, right) => left.dueAt.localeCompare(right.dueAt))
    }));
  }

  function applyBlocker(blocker: ProjectBlocker) {
    updateDirectoryItem(blocker.projectId, (item) => ({
      ...item,
      blockers: item.blockers.some((candidate) => candidate.id === blocker.id)
        ? item.blockers.map((candidate) => candidate.id === blocker.id ? blocker : candidate)
        : [blocker, ...item.blockers]
    }));
  }

  function applyLink(link: ProjectLink) {
    updateDirectoryItem(link.projectId, (item) => {
      const links = item.links.some((candidate) => candidate.id === link.id)
        ? item.links.map((candidate) => candidate.id === link.id ? link : candidate)
        : [link, ...item.links];
      return {
        ...item,
        links,
        linkedContext: [
          ...item.linkedContext.filter((context) => context.sourceKind !== "native_project_link"),
          ...nativeLinkContext(links)
        ]
      };
    });
  }

  function applyMutationEnvelope(data: {
    item: ProjectsObjectByFamily[keyof ProjectsObjectByFamily];
    project: Project;
    timelineEvent?: ProjectsWorkspaceSnapshot["nativeState"]["timelineEvents"][number];
  }) {
    applyProject(data.project);
    if (data.item.objectType === "milestone") applyMilestone(data.item);
    if (data.item.objectType === "blocker") applyBlocker(data.item);
    if (data.item.objectType === "project_link") applyLink(data.item);
    if (data.timelineEvent) {
      const event = data.timelineEvent;
      updateDirectoryItem(event.projectId, (item) => ({
        ...item,
        timelineEvents: [event, ...item.timelineEvents.filter((candidate) => candidate.id !== event.id)]
      }));
    }
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || mutationBusy) return;
    const value = (name: string) => String(editor.values[name] ?? "").trim();
    const optional = (name: string) => value(name) || undefined;
    setEditorError("");
    setMutationBusy(true);
    try {
      if (editor.kind === "project-create") {
        if (!value("name")) {
          setEditorError("Project name is required.");
          return;
        }
        const result = await repository.create("projects", {
          name: value("name"),
          description: value("description"),
          objective: optional("objective"),
          area: optional("area"),
          owner: optional("owner"),
          completionTarget: optional("completionTarget"),
          lifecycle: value("lifecycle") as "draft" | "planned" | "active",
          priority: value("priority") as ProjectPriority
        });
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setSelectedProjectId(result.data.project.id);
        setNotice(`${result.data.project.name} was created and is now tracked natively.`);
        updateUrl({ item: result.data.project.id, tab: "overview" }, "push");
      } else if (editor.kind === "project-edit") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item || !item.project.editable || !item.project.updatedAt) {
          setEditorError("This project is not available for native editing.");
          return;
        }
        if (!value("name")) {
          setEditorError("Project name is required.");
          return;
        }
        const result = await repository.update("projects", item.project.id, {
          name: value("name"),
          description: value("description"),
          objective: optional("objective"),
          area: optional("area"),
          owner: optional("owner"),
          completionTarget: optional("completionTarget"),
          lifecycle: value("lifecycle") as Project["lifecycle"],
          priority: value("priority") as ProjectPriority,
          review: value("review") as Project["review"],
          cadence: value("cadence") as Project["cadence"]
        }, item.project.updatedAt);
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setNotice(`${result.data.project.name} was saved.`);
      } else if (editor.kind === "legacy-promote") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item?.project.legacyKey || !item.project.promotable) {
          setEditorError("This legacy project cannot be promoted from the current view.");
          return;
        }
        const result = await repository.promoteLegacy({
          legacyKey: item.project.legacyKey,
          promotionConfirmed: true,
          objective: optional("objective"),
          area: optional("area"),
          owner: optional("owner"),
          priority: value("priority") as ProjectPriority
        });
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setNotice(`${result.data.project.name} is now tracked natively. Legacy identity and route provenance were preserved.`);
      } else if (editor.kind === "milestone-create") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item?.project.editable) {
          setEditorError("Start native tracking before adding project-owned milestones.");
          return;
        }
        if (!value("title") || !value("dueAt") || !value("completionCriteria")) {
          setEditorError("Milestone title, due date, and at least one completion criterion are required.");
          return;
        }
        const result = await repository.create("milestones", {
          projectId: item.project.id,
          title: value("title"),
          description: value("description"),
          dueAt: value("dueAt"),
          owner: optional("owner"),
          completionCriteria: value("completionCriteria").split("\n").map((criterion) => criterion.trim()).filter(Boolean)
        });
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setActiveTab("timeline");
        setSelectedChildId(result.data.item.id);
        updateUrl({ tab: "timeline", item: initialDetail ? result.data.item.id : item.project.id });
        setNotice(`Milestone “${result.data.item.title}” was added.`);
      } else if (editor.kind === "blocker-create") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item?.project.editable) {
          setEditorError("Start native tracking before adding project-owned blockers.");
          return;
        }
        if (!value("title") || !value("condition")) {
          setEditorError("Blocker title and blocking condition are required.");
          return;
        }
        const result = await repository.create("blockers", {
          projectId: item.project.id,
          title: value("title"),
          condition: value("condition"),
          severity: value("severity") as ProjectBlockerSeverity,
          owner: optional("owner"),
          dueAt: optional("dueAt")
        });
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setActiveTab("timeline");
        setSelectedChildId(result.data.item.id);
        updateUrl({ tab: "timeline", item: initialDetail ? result.data.item.id : item.project.id });
        setNotice(`Blocker “${result.data.item.title}” is now tracked.`);
      } else if (editor.kind === "blocker-resolve") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        const blocker = item?.blockers.find((candidate) => candidate.id === editor.objectId);
        if (!item || !blocker) {
          setEditorError("The selected blocker is no longer available.");
          return;
        }
        if (!value("resolution")) {
          setEditorError("Record how the blocker was resolved.");
          return;
        }
        const result = await repository.update("blockers", blocker.id, {
          state: "resolved",
          resolution: value("resolution")
        }, blocker.updatedAt);
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setNotice(`Blocker “${result.data.item.title}” was resolved with an audit entry.`);
      } else if (editor.kind === "link-create") {
        const item = snapshot.projects.find((candidate) => candidate.project.id === editor.projectId);
        if (!item?.project.editable) {
          setEditorError("Start native tracking before adding project-owned references.");
          return;
        }
        if (!value("sourceObjectId") || !value("sourceLabel") || !value("sourceObjectType")) {
          setEditorError("Source label, object type, and stable object ID are required.");
          return;
        }
        const sourceModule = value("sourceModule") as ModuleId;
        const sourceObjectType = value("sourceObjectType");
        const nestedOwnerObject =
          (sourceModule === "projects" && sourceObjectType !== "project") ||
          (sourceModule === "reviews" && !["review", "review_run"].includes(sourceObjectType));
        if (nestedOwnerObject && !value("sourceContainerObjectId")) {
          setEditorError("A parent / container ID is required for nested Project and Review objects so the owner route remains repairable.");
          return;
        }
        const source = createNativeObjectRef({
          module: sourceModule,
          objectType: sourceObjectType,
          objectId: value("sourceObjectId"),
          containerObjectId: optional("sourceContainerObjectId"),
          label: value("sourceLabel")
        });
        const result = await repository.create("links", {
          projectId: item.project.id,
          source,
          relationship: value("relationship") as ProjectLinkRelationship,
          projectSpecificNote: optional("projectSpecificNote"),
          isRequiredEvidence: Boolean(editor.values.isRequiredEvidence)
        });
        if (!result.ok) {
          setEditorError(result.error.message);
          return;
        }
        applyMutationEnvelope(result.data);
        setActiveTab("files-links");
        setSelectedChildId(result.data.item.id);
        updateUrl({ tab: "files-links", item: initialDetail ? result.data.item.id : item.project.id });
        setNotice(`Reference to “${result.data.item.source.label}” was linked without copying its native object.`);
      }
      closeEditor();
    } finally {
      setMutationBusy(false);
    }
  }

  async function toggleStar(item: ProjectDirectoryItem) {
    if (!item.project.editable || ["complete", "archived"].includes(item.project.lifecycle) || !item.project.updatedAt || mutationBusy) return;
    clearFeedback();
    const previous = item.project.starred;
    updateDirectoryItem(item.project.id, (current) => ({
      ...current,
      project: { ...current.project, starred: !previous }
    }));
    setMutationBusy(true);
    const result = await repository.update("projects", item.project.id, { starred: !previous }, item.project.updatedAt);
    setMutationBusy(false);
    if (!result.ok) {
      updateDirectoryItem(item.project.id, (current) => ({ ...current, project: { ...current.project, starred: previous } }));
      setMutationError(result.error.message);
      return;
    }
    applyMutationEnvelope(result.data);
    setNotice(!previous ? "Project starred." : "Project removed from starred projects.");
  }

  async function confirmMutation() {
    if (!confirmation || mutationBusy) return;
    const item = snapshot.projects.find((candidate) => candidate.project.id === confirmation.projectId);
    if (!item) return;
    setMutationBusy(true);
    setMutationError("");
    try {
      if (confirmation.kind === "project-complete") {
        if (!item.project.updatedAt) return;
        const result = await repository.update("projects", item.project.id, { lifecycle: "complete" }, item.project.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`${result.data.project.name} was marked complete. The project remains auditable.`);
      } else if (confirmation.kind === "project-archive") {
        if (!item.project.updatedAt || !confirmationReason.trim()) return;
        const result = await repository.update("projects", item.project.id, {
          lifecycle: "archived",
          archiveReason: confirmationReason.trim(),
          archiveConfirmed: true
        }, item.project.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`${result.data.project.name} was archived without deleting history or linked objects.`);
      } else if (confirmation.kind === "project-restore") {
        if (!item.project.updatedAt) return;
        const restoreLifecycle = item.project.lifecycleBeforeArchive || "active";
        const result = await repository.update("projects", item.project.id, { lifecycle: restoreLifecycle }, item.project.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`${result.data.project.name} was restored to ${displayLabel(result.data.project.lifecycle)}.`);
      } else if (confirmation.kind === "milestone-complete") {
        const milestone = item.milestones.find((candidate) => candidate.id === confirmation.objectId);
        if (!milestone) return;
        const result = await repository.update("milestones", milestone.id, {
          state: "complete",
          completionNote: confirmationReason.trim() || "Completion confirmed from the Projects timeline."
        }, milestone.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`Milestone “${result.data.item.title}” was completed.`);
      } else if (confirmation.kind === "link-remove") {
        const link = item.links.find((candidate) => candidate.id === confirmation.objectId);
        if (!link || !confirmationReason.trim()) return;
        const result = await repository.update("links", link.id, {
          linkState: "removed",
          removalReason: confirmationReason.trim()
        }, link.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`The project reference was removed. “${link.source.label}” was not deleted.`);
      } else if (confirmation.kind === "link-restore") {
        const link = item.links.find((candidate) => candidate.id === confirmation.objectId);
        if (!link) return;
        const result = await repository.update("links", link.id, { linkState: "active" }, link.updatedAt);
        if (!result.ok) return setMutationError(result.error.message);
        applyMutationEnvelope(result.data);
        setNotice(`The reference to “${link.source.label}” was restored.`);
      }
      setConfirmation(null);
      setConfirmationReason("");
    } finally {
      setMutationBusy(false);
    }
  }

  const sourceErrors = Object.entries(snapshot.sourceAvailability)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([source, error]) => `${displayLabel(source)}: ${error}`);
  const areas = Array.from(new Set(snapshot.projects.map((item) => item.project.area).filter((area): area is string => Boolean(area)))).sort();
  const countForView = (candidateView: ProjectView) => queryScopedProjects.filter((item) => matchesView(item, candidateView)).length;
  const countForArea = (area: string) => queryScopedProjects.filter((item) => item.project.area === area).length;

  const sidebarSections: readonly ModuleSidebarSection[] = [
    {
      id: "projects",
      label: "Projects",
      items: (["all", "active", "planned", "attention", "blocked"] as const).map((itemView) => ({
        id: itemView,
        label: VIEW_LABELS[itemView],
        count: countForView(itemView),
        active: view === itemView && !areas.includes(query),
        tone: itemView === "attention" ? "attention" as const : itemView === "blocked" ? "danger" as const : undefined,
        onSelect: () => selectView(itemView)
      }))
    },
    {
      id: "areas",
      label: "Areas",
      items: areas.length
        ? areas.map((area) => ({
            id: `area-${area.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            label: area,
            count: countForArea(area),
            active: query === area,
            onSelect: () => selectArea(area)
          }))
        : [{
            id: "areas-unavailable",
            label: "No project areas yet",
            disabled: true,
            disabledReason: "Assign an area while editing a native project."
          }]
    },
    {
      id: "smart-views",
      label: "Smart Views",
      items: (["due", "needs-review", "linked"] as const).map((itemView) => ({
        id: itemView,
        label: VIEW_LABELS[itemView],
        count: countForView(itemView),
        active: view === itemView,
        onSelect: () => selectView(itemView)
      }))
    },
    {
      id: "data",
      label: "Data",
      items: [
        {
          id: "templates",
          label: "Templates",
          disabled: true,
          disabledReason: "Native Project template persistence is an open product decision."
        },
        {
          id: "archive",
          label: "Archive",
          count: countForView("archived"),
          active: view === "archived",
          onSelect: () => selectView("archived")
        },
        {
          id: "missing-context",
          label: "Missing Context",
          count: queryScopedProjects.filter((item) => !item.project.owner || !item.project.objective).length,
          active: filter === "missing-owner",
          onSelect: () => {
            setView("all");
            setFilter("missing-owner");
            updateUrl({ view: "all", filter: "missing-owner" });
          }
        },
        {
          id: "settings",
          label: "Project Settings",
          disabled: true,
          disabledReason: "Module settings are intentionally deferred until permissions and native defaults are resolved."
        }
      ]
    }
  ];

  function projectQuickActions(item: ProjectDirectoryItem): readonly QuickAction[] {
    const native = item.project.editable;
    if (!native) {
      return [
        {
          id: "promote",
          label: "Start tracking",
          intent: "primary",
          onSelect: () => openEditor("legacy-promote", item)
        },
        {
          id: "open-legacy",
          label: "Open legacy command center",
          href: item.project.legacyRoute,
          disabled: !item.project.legacyRoute,
          disabledReason: "No legacy route was recorded for this project."
        }
      ];
    }
    if (item.project.lifecycle === "archived") {
      return [
        {
          id: "restore",
          label: "Restore project",
          intent: "primary",
          onSelect: () => {
            setConfirmationReason("");
            setConfirmation({ kind: "project-restore", projectId: item.project.id });
          }
        },
        { id: "decision", label: "Open decisions", href: personalOpsCreateHref("decisions", item.project) },
        { id: "follow-up", label: "Open follow-ups", href: personalOpsCreateHref("follow-ups", item.project) }
      ];
    }
    if (item.project.lifecycle === "complete") {
      return [
        {
          id: "complete",
          label: "Completed · read only",
          disabled: true,
          disabledReason: "Completed projects are read-only. Reopen behavior is intentionally unfinished."
        },
        { id: "decision", label: "Open decisions", href: personalOpsCreateHref("decisions", item.project) },
        { id: "follow-up", label: "Open follow-ups", href: personalOpsCreateHref("follow-ups", item.project) }
      ];
    }
    return [
      {
        id: "milestone",
        label: "Add milestone",
        intent: "primary",
        onSelect: () => openEditor("milestone-create", item)
      },
      { id: "blocker", label: "Add blocker", onSelect: () => openEditor("blocker-create", item) },
      { id: "link", label: "Link object", onSelect: () => openEditor("link-create", item) },
      {
        id: "decision",
        label: "File decision",
        href: personalOpsCreateHref("decisions", item.project)
      },
      {
        id: "follow-up",
        label: "Create follow-up",
        href: personalOpsCreateHref("follow-ups", item.project)
      },
      {
        id: "complete",
        label: "Mark complete",
        disabled: true,
        disabledReason: "Project completion is intentionally unavailable until native completion-gate semantics are configured."
      },
      {
        id: "archive",
        label: "Archive",
        intent: "destructive",
        onSelect: () => {
          setConfirmationReason("");
          setConfirmation({ kind: "project-archive", projectId: item.project.id });
        }
      }
    ];
  }

  function renderStateChip(value: string, label?: string) {
    return <span className={styles.stateChip} data-tone={stateTone(value)}>{label || displayLabel(value)}</span>;
  }

  function renderProjectHeader(item: ProjectDirectoryItem, headingLevel: "h1" | "h2") {
    const actions = (
      <>
        {item.project.editable && (
          <button type="button" className={styles.button} onClick={() => void toggleStar(item)} disabled={mutationBusy || ["complete", "archived"].includes(item.project.lifecycle)} title={["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined}>
            {item.project.starred ? "Unstar" : "Star"}
          </button>
        )}
        {item.project.editable ? (
          <button type="button" className={styles.button} onClick={() => openEditor("project-edit", item)} disabled={["complete", "archived"].includes(item.project.lifecycle)} title={item.project.lifecycle === "complete" ? "Completed projects are read-only; reopen is intentionally unfinished." : item.project.lifecycle === "archived" ? "Restore this project before editing it." : undefined}>Edit</button>
        ) : (
          <button type="button" className={styles.button} data-primary="true" onClick={() => openEditor("legacy-promote", item)}>Start tracking</button>
        )}
        {initialMode === "index" && (
          <Link className={styles.textLink} href={getNativeObjectRoute(item.project.nativeRef)}>Open full project</Link>
        )}
        {isInspectorOverlay && (
          <button type="button" className={styles.iconButton} onClick={() => setInspectorOpen(false)} aria-label="Close project details">×</button>
        )}
      </>
    );
    return (
      <ObjectHeader
        objectType={item.project.sourceKind === "native" ? "Native project" : "Legacy project projection"}
        title={item.project.name}
        subtitle={item.project.description || "No project description recorded."}
        identity={initials(item.project.name)}
        states={
          <>
            {renderStateChip(item.project.lifecycle)}
            {renderStateChip(item.project.health)}
            {renderStateChip(item.project.priority, `${displayLabel(item.project.priority)} priority`)}
            {renderStateChip(item.project.review)}
          </>
        }
        metadata={<span className={styles.mono}>{item.project.id} · {item.project.sourceKind === "native" ? "Projects store" : "legacy read adapter"}</span>}
        actions={actions}
        headingLevel={headingLevel}
        className={styles.projectHero}
      />
    );
  }

  function renderLinkedRows(item: ProjectDirectoryItem, modules?: readonly ModuleId[]) {
    const rows = modules
      ? item.linkedContext.filter((context) => modules.includes(context.ref.module))
      : item.linkedContext;
    if (!rows.length) {
      return <SystemState variant="empty" compact title="No linked objects in this view" description="Use Link object to store a typed reference. The source object remains in its owner module." />;
    }
    return (
      <ul className={styles.linkList}>
        {rows.map((context, index) => (
          <li key={`${context.ref.module}-${context.ref.objectId}-${context.relationship}-${index}`}>
            <span className={styles.itemBody}>
              <strong>{context.ref.label}</strong>
              <small>{displayLabel(context.ref.module)} · {displayLabel(context.relationship)}{context.summary ? ` · ${excerpt(context.summary, 70)}` : ""}</small>
            </span>
            <Link className={styles.textLink} href={context.ref.route}>Open source</Link>
          </li>
        ))}
      </ul>
    );
  }

  function renderOverview(item: ProjectDirectoryItem) {
    const milestone = nextMilestone(item);
    const blockers = openBlockers(item);
    const moduleCounts = item.linkedContext.reduce<Record<string, number>>((counts, context) => {
      counts[context.ref.module] = (counts[context.ref.module] || 0) + 1;
      return counts;
    }, {});
    return (
      <>
        <MetricStrip
          ariaLabel="Project operating summary"
          items={[
            { id: "milestones", label: "Open milestones", value: activeMilestones(item).length, detail: milestone ? `Next ${formatDate(milestone.dueAt)}` : "None scheduled" },
            { id: "blockers", label: "Open blockers", value: blockers.length, detail: blockers[0]?.title || "None open", tone: blockers.length ? "danger" : "positive" },
            { id: "links", label: "Linked context", value: item.linkedContext.length, detail: "Native references" },
            { id: "attention", label: "Attention checks", value: item.attentionReasons.length, detail: item.attentionReasons.length ? "Needs review" : "No current flags", tone: item.attentionReasons.length ? "attention" : "positive" }
          ]}
        />
        <div className={styles.overviewGrid}>
          <section className={styles.panel} data-wide="true">
            <div className={styles.panelHeader}><h2>Current objective</h2>{item.project.editable && <button type="button" className={styles.button} onClick={() => openEditor("project-edit", item)} disabled={["complete", "archived"].includes(item.project.lifecycle)} title={item.project.lifecycle === "complete" ? "Completed projects are read-only." : item.project.lifecycle === "archived" ? "Restore this project before editing it." : undefined}>Edit context</button>}</div>
            <p>{item.project.objective || "No project objective has been recorded. Add one before treating completion as ready."}</p>
          </section>
          <section className={styles.panel}>
            <h2>Project context</h2>
            <div className={styles.factGrid}>
              <div className={styles.fact} data-mono="true"><span>Project ID</span><strong>{item.project.id}</strong></div>
              <div className={styles.fact}><span>Owner</span><strong>{item.project.owner || "Missing"}</strong></div>
              <div className={styles.fact}><span>Area</span><strong>{item.project.area || "Unassigned"}</strong></div>
              <div className={styles.fact}><span>Cadence</span><strong>{displayLabel(item.project.cadence)}</strong></div>
            </div>
          </section>
          <section className={styles.panel}>
            <h2>Next milestone</h2>
            {milestone ? (
              <ul className={styles.objectList}><li><span className={styles.itemBody}><strong>{milestone.title}</strong><small>{formatDate(milestone.dueAt)} · {displayLabel(milestone.state)}</small></span><button type="button" className={styles.button} onClick={() => selectChild(milestone.id, "timeline")}>Open</button></li></ul>
            ) : <SystemState variant="empty" compact title="No open milestone" description={item.project.editable ? "Add a dated milestone when the next concrete gate is known." : "Start tracking to add project-owned milestones."} />}
          </section>
          <section className={styles.panel}>
            <h2>Open blockers</h2>
            {blockers.length ? (
              <ul className={styles.objectList}>{blockers.slice(0, 4).map((blocker) => <li key={blocker.id}><span className={styles.itemBody}><strong>{blocker.title}</strong><small>{displayLabel(blocker.severity)} · {blocker.owner || "No owner"}</small></span><button type="button" className={styles.button} onClick={() => selectChild(blocker.id, "timeline")}>Open</button></li>)}</ul>
            ) : <SystemState variant="empty" compact title="No open project blockers" description="This does not infer tasks or follow-ups from other modules." />}
          </section>
          <section className={styles.panel}>
            <h2>Linked workspace</h2>
            {Object.keys(moduleCounts).length ? <div className={styles.chipRow}>{Object.entries(moduleCounts).map(([module, count]) => <span className={styles.relationshipChip} data-tone="blue" key={module}>{displayLabel(module)} {count}</span>)}</div> : <p>No typed or legacy-linked context is visible for this project.</p>}
          </section>
          <section className={styles.panel} data-wide="true">
            <h2>Attention and completion context</h2>
            {item.attentionReasons.length ? <ul className={styles.guardList}>{item.attentionReasons.map((reason) => <li key={reason}><span>{reason}</span><span className={styles.rowState} data-tone="amber">Needs attention</span></li>)}</ul> : <p>No current attention reasons were derived from native project state.</p>}
          </section>
          <div className={styles.boundary} data-wide="true">
            <strong>Ownership boundary</strong>
            Projects owns project state, milestones, blockers, roles, timeline, and completion gates. Durable decisions and actionable follow-ups are created in Personal Ops; linked files and sources stay in Media or Resources.
          </div>
        </div>
      </>
    );
  }

  function renderTimeline(item: ProjectDirectoryItem) {
    return (
      <div className={styles.overviewGrid}>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}>
            <div><h2>Milestones</h2><p>Project-owned gates with explicit dates and completion criteria.</p></div>
            <button type="button" className={styles.button} data-primary="true" onClick={() => openEditor("milestone-create", item)} disabled={!item.project.editable || ["complete", "archived"].includes(item.project.lifecycle)} title={!item.project.editable ? "Start tracking this legacy project first." : ["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined}>Add milestone</button>
          </div>
          {item.milestones.length ? (
            <ul className={styles.objectList}>
              {item.milestones.map((milestone) => (
                <li key={milestone.id} aria-current={selectedChildId === milestone.id || undefined}>
                  <span className={styles.itemBody}>
                    <strong>{milestone.title}</strong>
                    <small>{formatDate(milestone.dueAt)} · {displayLabel(milestone.state)} · {milestone.owner || "No owner"}</small>
                  </span>
                  <span className={styles.inlineActions}>
                    <button type="button" className={styles.button} onClick={() => selectChild(milestone.id, "timeline")}>Inspect</button>
                    {!['complete', 'archived'].includes(milestone.state) && (
                      <button type="button" className={styles.button} disabled={!milestone.completionCriteria.length || ["complete", "archived"].includes(item.project.lifecycle)} title={["complete", "archived"].includes(item.project.lifecycle) ? item.project.lifecycle === "complete" ? "Completed projects are read-only; reopen behavior is intentionally unavailable." : "Restore the project before completing milestones." : !milestone.completionCriteria.length ? "Add completion criteria before completing this milestone." : undefined} onClick={() => {
                        setConfirmationReason("");
                        setConfirmation({ kind: "milestone-complete", projectId: item.project.id, objectId: milestone.id });
                      }}>Complete</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : <SystemState variant="empty" compact title="No native milestones" description={item.project.editable ? "Add the next concrete gate; no legacy task counts are converted into milestones." : "Start tracking to add native milestones."} />}
        </section>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}>
            <div><h2>Blockers and open loops</h2><p>Only project conditions live here. Actionable follow-through belongs in Personal Ops.</p></div>
            <button type="button" className={styles.button} onClick={() => openEditor("blocker-create", item)} disabled={!item.project.editable || ["complete", "archived"].includes(item.project.lifecycle)} title={!item.project.editable ? "Start tracking this legacy project first." : ["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined}>Add blocker</button>
          </div>
          {item.blockers.length ? (
            <ul className={styles.objectList}>
              {item.blockers.map((blocker) => (
                <li key={blocker.id} aria-current={selectedChildId === blocker.id || undefined}>
                  <span className={styles.itemBody}>
                    <strong>{blocker.title}</strong>
                    <small>{displayLabel(blocker.state)} · {displayLabel(blocker.severity)} · {blocker.owner || "No owner"}</small>
                  </span>
                  <span className={styles.inlineActions}>
                    <button type="button" className={styles.button} onClick={() => selectChild(blocker.id, "timeline")}>Inspect</button>
                    {blocker.state === "open" && <button type="button" className={styles.button} disabled={["complete", "archived"].includes(item.project.lifecycle)} title={["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined} onClick={() => openEditor("blocker-resolve", item, blocker)}>Resolve</button>}
                    <Link className={styles.textLink} href={personalOpsCreateHref("follow-ups", item.project, { objectType: "blocker", objectId: blocker.id, label: blocker.title })}>Follow-up</Link>
                  </span>
                </li>
              ))}
            </ul>
          ) : <SystemState variant="empty" compact title="No native blockers" description="Legacy action items are deliberately not inferred as Project blockers." />}
        </section>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}>
            <div><h2>Audit-derived timeline</h2><p>Native mutations add immutable timeline and audit events.</p></div>
            <button type="button" className={styles.button} disabled title="Manual timeline event semantics are not resolved; native mutations still add auditable events.">Add manual event</button>
          </div>
          {item.timelineEvents.length ? (
            <ol className={styles.timelineList}>
              {item.timelineEvents.map((timelineEvent) => (
                <li key={timelineEvent.id} aria-current={selectedChildId === timelineEvent.id || undefined}>
                  <span className={styles.timelineDot} aria-hidden="true" />
                  <span className={styles.itemBody}><strong>{timelineEvent.title}</strong><small>{timelineEvent.summary}</small></span>
                  <span className={styles.timelineMeta}>{formatDate(timelineEvent.occurredAt)}</span>
                  <button type="button" className={styles.button} onClick={() => selectChild(timelineEvent.id, "timeline")}>Inspect</button>
                </li>
              ))}
            </ol>
          ) : <SystemState variant="empty" compact title="No native timeline events yet" description={item.project.editable ? "The first native change will appear here." : "Legacy activity is not rewritten as native audit history."} />}
        </section>
      </div>
    );
  }

  function renderNotesDecisions(item: ProjectDirectoryItem) {
    const noteContext = item.linkedContext.filter((context) => context.ref.module === "notes");
    const decisionContext = item.linkedContext.filter((context) => context.ref.module === "personal_ops" && context.ref.objectType === "decision");
    return (
      <div className={styles.overviewGrid}>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}>
            <div><h2>Notes and decision context</h2><p>Authored knowledge remains in Notes; durable decisions remain in Personal Ops.</p></div>
            <span className={styles.inlineActions}>
              <Link className={styles.textLink} href={nativeCreateHref("notes", item.project)}>Open Notes</Link>
              <Link className={styles.textLink} href={personalOpsCreateHref("decisions", item.project)}>File decision</Link>
              <button type="button" className={styles.button} onClick={() => openEditor("link-create", item)} disabled={!item.project.editable || ["complete", "archived"].includes(item.project.lifecycle)} title={["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined}>Link existing</button>
            </span>
          </div>
          {noteContext.length || decisionContext.length ? renderLinkedRows(item, ["notes", "personal_ops"]) : <SystemState variant="empty" compact title="No linked notes or durable decisions" description="Open the owner module to author the object, then link it here by stable ID." />}
        </section>
        <section className={styles.panel}>
          <h2>Legacy KPI context</h2>
          {item.legacyKpis.length ? (
            <ul className={styles.objectList}>{item.legacyKpis.map((kpi) => <li key={kpi.id}><span className={styles.itemBody}><strong>{kpi.name}</strong><small>{kpi.value} · {kpi.sourceLabel}</small></span>{kpi.link ? <Link className={styles.textLink} href={kpi.link}>Open</Link> : <span className={styles.rowState}>Read only</span>}</li>)}</ul>
          ) : <p>No legacy KPI source is associated with this project. KPI records are not converted into milestones or progress.</p>}
        </section>
        <section className={styles.panel}>
          <h2>Decision workflow boundary</h2>
          <p>Projects may hold project-local candidate context, but the canonical durable Decision is filed in Personal Ops and referenced here. No decision is silently promoted.</p>
        </section>
      </div>
    );
  }

  function renderPeople(item: ProjectDirectoryItem) {
    const people = item.linkedContext.filter((context) => context.ref.module === "people");
    return (
      <div className={styles.overviewGrid}>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}>
            <div><h2>Project people and roles</h2><p>People owns identity, contact history, and relationship cadence. Projects stores only project context and typed references.</p></div>
            <span className={styles.inlineActions}>
              <Link className={styles.textLink} href={nativeCreateHref("people", item.project)}>Open People</Link>
              <button type="button" className={styles.button} onClick={() => openEditor("link-create", item)} disabled={!item.project.editable || ["complete", "archived"].includes(item.project.lifecycle)} title={["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined}>Link person</button>
            </span>
          </div>
          {people.length ? renderLinkedRows(item, ["people"]) : <SystemState variant="empty" compact title="No linked people" description="Link an existing People identity; do not recreate the person inside Projects." />}
        </section>
        <section className={styles.panel}>
          <h2>Project owner</h2>
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>Display owner</span><strong>{item.project.owner || "Missing"}</strong></div>
            <div className={styles.fact}><span>Identity link</span><strong>{people.find((context) => context.relationship.toLowerCase().includes("owner"))?.ref.label || "Not linked"}</strong></div>
          </div>
        </section>
        <section className={styles.panel}>
          <h2>Actionable follow-through</h2>
          <p>Contact reminders and follow-ups are owned by Personal Ops, while People retains cadence and next-contact context.</p>
          <Link className={styles.textLink} href={personalOpsCreateHref("follow-ups", item.project)}>Create project follow-up</Link>
        </section>
      </div>
    );
  }

  function renderFilesLinks(item: ProjectDirectoryItem) {
    const fileModules: readonly ModuleId[] = ["media", "resources", "finance", "reviews", "projects"];
    return (
      <div className={styles.overviewGrid}>
        <section className={styles.panel} data-wide="true">
          <div className={styles.panelHeader}>
            <div><h2>Native project references</h2><p>Projects stores relationship semantics, review state, and project-specific notes—not the linked source object.</p></div>
            <button type="button" className={styles.button} data-primary="true" onClick={() => openEditor("link-create", item)} disabled={!item.project.editable || ["complete", "archived"].includes(item.project.lifecycle)} title={!item.project.editable ? "Start tracking this legacy project first." : ["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined}>Link object</button>
          </div>
          {item.links.length ? (
            <ul className={styles.linkList}>
              {item.links.map((link) => (
                <li key={link.id} aria-current={selectedChildId === link.id || undefined}>
                  <span className={styles.itemBody}>
                    <strong>{link.source.label}</strong>
                    <small>{displayLabel(link.source.module)} · {displayLabel(link.relationship)} · {displayLabel(link.linkState)}{link.isRequiredEvidence ? " · required evidence" : ""}</small>
                  </span>
                  <span className={styles.inlineActions}>
                    <button type="button" className={styles.button} onClick={() => selectChild(link.id, "files-links")}>Inspect</button>
                    <Link className={styles.textLink} href={link.source.route}>Open source</Link>
                    {link.linkState === "removed" ? (
                      <button type="button" className={styles.button} disabled={["complete", "archived"].includes(item.project.lifecycle)} title={item.project.lifecycle === "complete" ? "Completed projects are read-only; reopen behavior is intentionally unavailable." : item.project.lifecycle === "archived" ? "Restore the project before restoring its links." : undefined} onClick={() => {
                        setConfirmationReason("");
                        setConfirmation({ kind: "link-restore", projectId: item.project.id, objectId: link.id });
                      }}>Restore</button>
                    ) : (
                      <button type="button" className={styles.button} data-danger="true" disabled={["complete", "archived"].includes(item.project.lifecycle)} title={["complete", "archived"].includes(item.project.lifecycle) ? "Completed and archived projects are read-only." : undefined} onClick={() => {
                        setConfirmationReason("");
                        setConfirmation({ kind: "link-remove", projectId: item.project.id, objectId: link.id });
                      }}>Remove link</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : <SystemState variant="empty" compact title="No native project links" description="Legacy project tags remain visible below but are not silently rewritten into native ObjectLinks." />}
        </section>
        <section className={styles.panel} data-wide="true">
          <h2>Visible source context</h2>
          {renderLinkedRows(item, fileModules)}
        </section>
        <section className={styles.panel} data-wide="true">
          <h2>Legacy document index</h2>
          {item.legacyDocuments.length ? (
            <ul className={styles.objectList}>{item.legacyDocuments.map((document) => <li key={document.id}><span className={styles.itemBody}><strong>{document.title}</strong><small>{document.repo} · {document.path} · read-only index</small></span><Link className={styles.textLink} href={document.url}>Open source</Link></li>)}</ul>
          ) : <p>No indexed legacy documents are available for this project.</p>}
          {item.legacyDocumentTotal > item.legacyDocuments.length && <p>{item.legacyDocuments.length} of {item.legacyDocumentTotal} indexed documents shown. Open the legacy source for the complete read-only set.</p>}
        </section>
        <div className={styles.boundary} data-wide="true">
          <strong>Source boundary</strong>
          URL and external-source identity belongs to Resources. Binary files, versions, rights, and usage belong to Media. Removing a Project link never deletes either source.
        </div>
      </div>
    );
  }

  function renderProperties(item: ProjectDirectoryItem) {
    return (
      <div className={styles.overviewGrid}>
        <section className={styles.panel}>
          <h2>Native state dimensions</h2>
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>Lifecycle</span><strong>{displayLabel(item.project.lifecycle)}</strong></div>
            <div className={styles.fact}><span>Health</span><strong>{displayLabel(item.project.health)}</strong></div>
            <div className={styles.fact}><span>Review</span><strong>{displayLabel(item.project.review)}</strong></div>
            <div className={styles.fact}><span>Cadence</span><strong>{displayLabel(item.project.cadence)}</strong></div>
          </div>
        </section>
        <section className={styles.panel}>
          <h2>Identity and provenance</h2>
          <div className={styles.factGrid}>
            <div className={styles.fact} data-mono="true"><span>Project ID</span><strong>{item.project.id}</strong></div>
            <div className={styles.fact} data-mono="true"><span>Slug</span><strong>{item.project.slug}</strong></div>
            <div className={styles.fact}><span>Source</span><strong>{item.project.sourceKind === "native" ? "Projects store" : "Legacy projection"}</strong></div>
            <div className={styles.fact}><span>Visibility</span><strong>{item.project.sourceKind === "native" ? "Native policy" : "Legacy source"}</strong></div>
          </div>
        </section>
        <section className={styles.panel} data-wide="true">
          <h2>Source availability</h2>
          {sourceErrors.length ? <ul className={styles.guardList}>{sourceErrors.map((error) => <li key={error}><span>{error}</span><span className={styles.rowState} data-tone="amber">Unavailable</span></li>)}</ul> : <p>All optional read sources used by this snapshot loaded successfully. This does not imply native writes exist in those owner modules.</p>}
        </section>
        <section className={styles.panel} data-wide="true">
          <h2>Legacy compatibility</h2>
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>Legacy key</span><strong>{item.project.legacyKey || "None"}</strong></div>
            <div className={styles.fact}><span>Legacy entity</span><strong>{item.project.legacyEntityName || "None"}</strong></div>
            <div className={styles.fact}><span>Legacy route</span><strong>{item.project.legacyRoute || "None"}</strong></div>
            <div className={styles.fact}><span>Last activity</span><strong>{formatDate(item.project.lastActivityAt)}</strong></div>
          </div>
          {item.project.legacyRoute && <Link className={styles.textLink} href={item.project.legacyRoute}>Open compatibility route</Link>}
        </section>
        <div className={styles.boundary} data-wide="true">
          <strong>Migration treatment</strong>
          Legacy projections remain read-only until explicit promotion. Promotion preserves the stable project identity and provenance; it does not import legacy task counts, KPIs, notes, or documents as native Project objects.
        </div>
      </div>
    );
  }

  function tabsFor(item: ProjectDirectoryItem): readonly DetailTab[] {
    const notesDecisions = item.linkedContext.filter((context) => context.ref.module === "notes" || (context.ref.module === "personal_ops" && context.ref.objectType === "decision")).length;
    return PROJECT_TABS.map((tab) => ({
      ...tab,
      count: tab.id === "timeline"
        ? item.milestones.length + item.blockers.length
        : tab.id === "notes-decisions"
          ? notesDecisions
          : tab.id === "people"
            ? item.linkedContext.filter((context) => context.ref.module === "people").length
            : tab.id === "files-links"
              ? item.links.filter((link) => link.linkState !== "removed").length
              : undefined
    }));
  }

  function renderSelectedChildContext(item: ProjectDirectoryItem) {
    if (!selectedChildId) return null;
    const milestone = item.milestones.find((candidate) => candidate.id === selectedChildId);
    const blocker = item.blockers.find((candidate) => candidate.id === selectedChildId);
    const link = item.links.find((candidate) => candidate.id === selectedChildId);
    const timelineEvent = item.timelineEvents.find((candidate) => candidate.id === selectedChildId);
    const headingId = `project-selected-child-${selectedChildId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const parentReadOnly = ["complete", "archived"].includes(item.project.lifecycle);
    const parentReadOnlyReason = item.project.lifecycle === "complete"
      ? "Completed projects are read-only; reopen behavior is intentionally unavailable."
      : item.project.lifecycle === "archived"
        ? "Restore the project before changing its child objects."
        : undefined;

    function clearSelectedChild() {
      setSelectedChildId("");
      updateUrl({ item: initialDetail ? "" : item.project.id });
    }

    return (
      <section
        ref={selectedChildRef}
        className={styles.selectedChildPanel}
        tabIndex={-1}
        aria-labelledby={headingId}
        aria-live="polite"
      >
        <header className={styles.selectedChildHeader}>
          <div>
            <span className={styles.eyebrow}>Selected project object</span>
            <h2 id={headingId}>{milestone?.title || blocker?.title || link?.source.label || timelineEvent?.title || "Unavailable project object"}</h2>
          </div>
          <button type="button" className={styles.button} onClick={clearSelectedChild}>Close inspection</button>
        </header>

        {milestone && (
          <div className={styles.selectedChildBody}>
            <p>{milestone.description || "No milestone description recorded."}</p>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>State</span><strong>{displayLabel(milestone.state)}</strong></div>
              <div className={styles.fact}><span>Due</span><strong>{formatDate(milestone.dueAt)}</strong></div>
              <div className={styles.fact}><span>Owner</span><strong>{milestone.owner || "Missing"}</strong></div>
              <div className={styles.fact} data-mono="true"><span>Milestone ID</span><strong>{milestone.id}</strong></div>
            </div>
            <div>
              <strong>Completion criteria</strong>
              {milestone.completionCriteria.length ? <ul className={styles.criteriaList}>{milestone.completionCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul> : <p className={styles.notice}>No completion criteria are stored. Completion stays disabled until criteria are added.</p>}
            </div>
            {milestone.linkedRefs.length > 0 && <div className={styles.inlineActions}>{milestone.linkedRefs.map((ref) => <Link className={styles.textLink} href={ref.route} key={`${ref.module}-${ref.objectId}`}>{ref.label}</Link>)}</div>}
          </div>
        )}

        {blocker && (
          <div className={styles.selectedChildBody}>
            <p>{blocker.condition}</p>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>State</span><strong>{displayLabel(blocker.state)}</strong></div>
              <div className={styles.fact}><span>Severity</span><strong>{displayLabel(blocker.severity)}</strong></div>
              <div className={styles.fact}><span>Owner</span><strong>{blocker.owner || "Missing"}</strong></div>
              <div className={styles.fact}><span>Due</span><strong>{formatDate(blocker.dueAt)}</strong></div>
            </div>
            {blocker.resolution && <p><strong>Resolution:</strong> {blocker.resolution}</p>}
            <div className={styles.inlineActions}>
              {blocker.state === "open" && <button type="button" className={styles.button} disabled={parentReadOnly} title={parentReadOnlyReason} onClick={() => openEditor("blocker-resolve", item, blocker)}>Resolve blocker</button>}
              <Link className={styles.textLink} href={personalOpsCreateHref("follow-ups", item.project, { objectType: "blocker", objectId: blocker.id, label: blocker.title })}>Create follow-up</Link>
              {blocker.sourceRefs.map((ref) => <Link className={styles.textLink} href={ref.route} key={`${ref.module}-${ref.objectId}`}>Open {ref.label}</Link>)}
            </div>
          </div>
        )}

        {link && (
          <div className={styles.selectedChildBody}>
            <p>{link.projectSpecificNote || "No project-specific relationship note recorded."}</p>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>Owner module</span><strong>{displayLabel(link.source.module)}</strong></div>
              <div className={styles.fact}><span>Relationship</span><strong>{displayLabel(link.relationship)}</strong></div>
              <div className={styles.fact}><span>Link state</span><strong>{displayLabel(link.linkState)}</strong></div>
              <div className={styles.fact}><span>Evidence</span><strong>{link.isRequiredEvidence ? "Required" : "Supporting"}</strong></div>
            </div>
            <div className={styles.inlineActions}>
              <Link className={styles.textLink} href={link.source.route}>Open source object</Link>
              {link.linkState === "removed" ? (
                <button type="button" className={styles.button} disabled={parentReadOnly} title={parentReadOnlyReason} onClick={() => {
                  setConfirmationReason("");
                  setConfirmation({ kind: "link-restore", projectId: item.project.id, objectId: link.id });
                }}>Restore link</button>
              ) : (
                <button type="button" className={styles.button} data-danger="true" disabled={parentReadOnly} title={parentReadOnlyReason} onClick={() => {
                  setConfirmationReason("");
                  setConfirmation({ kind: "link-remove", projectId: item.project.id, objectId: link.id });
                }}>Remove link</button>
              )}
            </div>
          </div>
        )}

        {timelineEvent && (
          <div className={styles.selectedChildBody}>
            <p>{timelineEvent.summary}</p>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>Event type</span><strong>{displayLabel(timelineEvent.eventType)}</strong></div>
              <div className={styles.fact}><span>Occurred</span><strong>{formatDate(timelineEvent.occurredAt)}</strong></div>
              <div className={styles.fact}><span>Health at event</span><strong>{displayLabel(timelineEvent.health)}</strong></div>
              <div className={styles.fact} data-mono="true"><span>Event ID</span><strong>{timelineEvent.id}</strong></div>
            </div>
            <div className={styles.inlineActions}>
              {timelineEvent.sourceRef && <Link className={styles.textLink} href={timelineEvent.sourceRef.route}>Open source</Link>}
              {timelineEvent.relatedObjectRef && <Link className={styles.textLink} href={timelineEvent.relatedObjectRef.route}>Open related object</Link>}
            </div>
          </div>
        )}

        {!milestone && !blocker && !link && !timelineEvent && (
          <SystemState variant="stale" compact title="Selected object is no longer available" description="The deep-linked child ID remains visible in the URL. Close this inspection to return to the project tab." />
        )}
      </section>
    );
  }

  function renderProjectBody(item: ProjectDirectoryItem) {
    const tabsId = `project-${item.project.id}`;
    return (
      <>
        <DetailTabs id={tabsId} tabs={tabsFor(item)} activeTab={activeTab} onTabChange={selectTab} ariaLabel={`${item.project.name} detail sections`} className={styles.tabs} />
        <div className={styles.contextStrip} aria-label="Project context summary">
          <strong>Project context</strong>
          {renderStateChip(item.project.lifecycle)}
          {renderStateChip(item.project.health)}
          {renderStateChip(item.project.review)}
          <span className={styles.relationshipChip} data-tone="blue">Links {item.linkedContext.length}</span>
          <span className={styles.relationshipChip} data-tone="purple">Milestones {activeMilestones(item).length}</span>
          {item.project.sourceKind === "legacy_projection" && <span className={`${styles.relationshipChip} ${styles.legacyBadge}`}>Read-only legacy projection</span>}
        </div>
        {mutationError && <p className={styles.errorBanner} role="alert">{mutationError}</p>}
        {notice && <p className={styles.successBanner} role="status">{notice}</p>}
        {renderSelectedChildContext(item)}
        <DetailTabPanel tabsId={tabsId} tabId="overview" active={activeTab === "overview"}>{renderOverview(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="timeline" active={activeTab === "timeline"}>{renderTimeline(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="notes-decisions" active={activeTab === "notes-decisions"}>{renderNotesDecisions(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="people" active={activeTab === "people"}>{renderPeople(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="files-links" active={activeTab === "files-links"}>{renderFilesLinks(item)}</DetailTabPanel>
        <DetailTabPanel tabsId={tabsId} tabId="properties" active={activeTab === "properties"}>{renderProperties(item)}</DetailTabPanel>
        <QuickActionBar
          actions={projectQuickActions(item)}
          label={<strong>Quick actions</strong>}
          sticky
          ariaLabel={`${item.project.name} quick actions`}
        />
      </>
    );
  }

  function renderCompletionRail(item: ProjectDirectoryItem) {
    const incompleteMilestones = activeMilestones(item);
    const blockers = openBlockers(item);
    return (
      <>
        <section className={styles.panel}>
          <h2>Completion gates</h2>
          <ul className={styles.guardList}>
            <li><span>Objective recorded</span><span className={styles.rowState} data-tone={item.project.objective ? "green" : "amber"}>{item.project.objective ? "Ready" : "Missing"}</span></li>
            <li><span>Milestones complete</span><span className={styles.rowState} data-tone={incompleteMilestones.length ? "amber" : "green"}>{incompleteMilestones.length ? `${incompleteMilestones.length} open` : "Ready"}</span></li>
            <li><span>Blockers resolved or waived</span><span className={styles.rowState} data-tone={blockers.length ? "red" : "green"}>{blockers.length ? `${blockers.length} open` : "Ready"}</span></li>
            <li><span>Project owner assigned</span><span className={styles.rowState} data-tone={item.project.owner ? "green" : "amber"}>{item.project.owner ? "Ready" : "Missing"}</span></li>
          </ul>
        </section>
        <section className={styles.panel}>
          <h2>Attention rail</h2>
          {item.attentionReasons.length ? <ul className={styles.guardList}>{item.attentionReasons.map((reason) => <li key={reason}><span>{reason}</span><span className={styles.rowState} data-tone="amber">Review</span></li>)}</ul> : <p>No current native attention reasons.</p>}
        </section>
        <section className={styles.panel}>
          <h2>Owner-module actions</h2>
          <div className={styles.inlineActions}>
            <Link className={styles.textLink} href={personalOpsCreateHref("decisions", item.project)}>File decision</Link>
            <Link className={styles.textLink} href={personalOpsCreateHref("follow-ups", item.project)}>Create follow-up</Link>
            <Link className={styles.textLink} href={getModuleRoute("reviews")}>Open Reviews</Link>
          </div>
        </section>
        <div className={styles.boundary}>
          <strong>Completion is intentionally unavailable</strong>
          Readiness context is visible, but the repository rejects completion until native completion-gate semantics are configured. No linked follow-up, decision, or source object is closed automatically.
        </div>
      </>
    );
  }

  const editorTitle = editor?.kind === "project-create"
    ? "Create native project"
    : editor?.kind === "project-edit"
      ? "Edit project"
      : editor?.kind === "legacy-promote"
        ? "Start native project tracking"
        : editor?.kind === "milestone-create"
          ? "Add milestone"
          : editor?.kind === "blocker-create"
            ? "Add blocker"
            : editor?.kind === "blocker-resolve"
              ? "Resolve blocker"
              : "Link native object";
  const editorDescription = editor?.kind === "legacy-promote"
    ? "Creates the native Project record while preserving legacy identity and route provenance. No legacy tasks, KPIs, notes, or documents are copied."
    : editor?.kind === "link-create"
      ? "Stores a typed reference and project relationship only. The source object remains in its owner module."
      : "Changes are saved explicitly to the native Projects repository and recorded in audit history.";

  function renderEditorFields() {
    if (!editor) return null;
    const value = (name: string) => String(editor.values[name] ?? "");
    if (editor.kind === "project-create" || editor.kind === "project-edit") {
      return (
        <div className={styles.formGrid}>
          <label className={styles.field} data-wide="true">Project name<input name="name" value={value("name")} onChange={(event) => changeEditorValue("name", event.target.value)} required autoFocus /></label>
          <label className={styles.field} data-wide="true">Description<textarea name="description" value={value("description")} onChange={(event) => changeEditorValue("description", event.target.value)} /></label>
          <label className={styles.field} data-wide="true">Current objective<textarea name="objective" value={value("objective")} onChange={(event) => changeEditorValue("objective", event.target.value)} /></label>
          <label className={styles.field} data-wide="true">Completion target<textarea name="completionTarget" value={value("completionTarget")} onChange={(event) => changeEditorValue("completionTarget", event.target.value)} placeholder="Describe the project-level finish condition. Completion remains disabled until native gate semantics are resolved." /></label>
          <label className={styles.field}>Area<input name="area" value={value("area")} onChange={(event) => changeEditorValue("area", event.target.value)} placeholder="e.g. Unigentamos" /></label>
          <label className={styles.field}>Owner<input name="owner" value={value("owner")} onChange={(event) => changeEditorValue("owner", event.target.value)} placeholder="Display owner" /></label>
          <label className={styles.field}>Lifecycle<select name="lifecycle" value={value("lifecycle")} onChange={(event) => changeEditorValue("lifecycle", event.target.value)}>{["draft", "planned", "active"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}</select></label>
          <label className={styles.field}>Priority<select name="priority" value={value("priority")} onChange={(event) => changeEditorValue("priority", event.target.value)}>{["low", "medium", "high", "critical"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}</select></label>
          {editor.kind === "project-edit" && <>
            <label className={styles.field}>Review state<select name="review" value={value("review")} onChange={(event) => changeEditorValue("review", event.target.value)}>{["unknown", "not_required", "not_reviewed", "needs_review", "in_review", "reviewed", "waived"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}</select></label>
            <label className={styles.field}>Cadence state<select name="cadence" value={value("cadence")} onChange={(event) => changeEditorValue("cadence", event.target.value)}>{["unset", "current", "due_soon", "overdue", "dormant", "paused"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}</select></label>
          </>}
        </div>
      );
    }
    if (editor.kind === "legacy-promote") {
      return (
        <>
          <div className={styles.boundary}><strong>Explicit migration boundary</strong>This creates one native Project record mapped to the legacy project. Existing compatibility routes and source material remain intact.</div>
          <div className={styles.formGrid}>
            <label className={styles.field} data-wide="true">Current objective<textarea value={value("objective")} onChange={(event) => changeEditorValue("objective", event.target.value)} autoFocus /></label>
            <label className={styles.field}>Area<input value={value("area")} onChange={(event) => changeEditorValue("area", event.target.value)} /></label>
            <label className={styles.field}>Owner<input value={value("owner")} onChange={(event) => changeEditorValue("owner", event.target.value)} /></label>
            <label className={styles.field}>Priority<select value={value("priority")} onChange={(event) => changeEditorValue("priority", event.target.value)}>{["low", "medium", "high", "critical"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}</select></label>
          </div>
        </>
      );
    }
    if (editor.kind === "milestone-create") {
      return <div className={styles.formGrid}>
        <label className={styles.field} data-wide="true">Milestone title<input value={value("title")} onChange={(event) => changeEditorValue("title", event.target.value)} required autoFocus /></label>
        <label className={styles.field} data-wide="true">Description<textarea value={value("description")} onChange={(event) => changeEditorValue("description", event.target.value)} /></label>
        <label className={styles.field}>Due date<input type="date" value={value("dueAt")} onChange={(event) => changeEditorValue("dueAt", event.target.value)} required /></label>
        <label className={styles.field}>Owner<input value={value("owner")} onChange={(event) => changeEditorValue("owner", event.target.value)} /></label>
        <label className={styles.field} data-wide="true">Completion criteria<textarea value={value("completionCriteria")} onChange={(event) => changeEditorValue("completionCriteria", event.target.value)} placeholder="One criterion per line" required /></label>
      </div>;
    }
    if (editor.kind === "blocker-create") {
      return <div className={styles.formGrid}>
        <label className={styles.field} data-wide="true">Blocker title<input value={value("title")} onChange={(event) => changeEditorValue("title", event.target.value)} required autoFocus /></label>
        <label className={styles.field} data-wide="true">Blocking condition<textarea value={value("condition")} onChange={(event) => changeEditorValue("condition", event.target.value)} required /></label>
        <label className={styles.field}>Severity<select value={value("severity")} onChange={(event) => changeEditorValue("severity", event.target.value)}>{["low", "medium", "high", "critical"].map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}</select></label>
        <label className={styles.field}>Owner<input value={value("owner")} onChange={(event) => changeEditorValue("owner", event.target.value)} /></label>
        <label className={styles.field}>Due date<input type="date" value={value("dueAt")} onChange={(event) => changeEditorValue("dueAt", event.target.value)} /></label>
      </div>;
    }
    if (editor.kind === "blocker-resolve") {
      return <label className={styles.field}>Resolution record<textarea value={value("resolution")} onChange={(event) => changeEditorValue("resolution", event.target.value)} required autoFocus placeholder="What changed, and what evidence confirms the blocker is resolved?" /></label>;
    }
    return <div className={styles.formGrid}>
      <label className={styles.field}>Owner module<select value={value("sourceModule")} onChange={(event) => changeEditorValue("sourceModule", event.target.value)}>{LINK_MODULES.map((module) => <option value={module} key={module}>{displayLabel(module)}</option>)}</select></label>
      <label className={styles.field}>Object type<input value={value("sourceObjectType")} onChange={(event) => changeEditorValue("sourceObjectType", event.target.value)} required placeholder="note, resource, media_asset…" /></label>
      <label className={styles.field}>Stable object ID<input value={value("sourceObjectId")} onChange={(event) => changeEditorValue("sourceObjectId", event.target.value)} required autoFocus /></label>
      <label className={styles.field}>Parent / container ID<input value={value("sourceContainerObjectId")} onChange={(event) => changeEditorValue("sourceContainerObjectId", event.target.value)} placeholder="Required for nested Project or Review objects" /></label>
      <label className={styles.field}>Source label<input value={value("sourceLabel")} onChange={(event) => changeEditorValue("sourceLabel", event.target.value)} required /></label>
      <label className={styles.field}>Relationship<select value={value("relationship")} onChange={(event) => changeEditorValue("relationship", event.target.value)}>{LINK_RELATIONSHIPS.map((relationship) => <option value={relationship} key={relationship}>{displayLabel(relationship)}</option>)}</select></label>
      <label className={styles.field} data-wide="true">Project-specific note<textarea value={value("projectSpecificNote")} onChange={(event) => changeEditorValue("projectSpecificNote", event.target.value)} /></label>
      <label className={styles.field}><span><input type="checkbox" checked={Boolean(editor.values.isRequiredEvidence)} onChange={(event) => changeEditorValue("isRequiredEvidence", event.target.checked)} /> Required completion evidence</span></label>
    </div>;
  }

  const confirmationTarget = confirmation
    ? snapshot.projects.find((item) => item.project.id === confirmation.projectId) || null
    : null;
  const completionIssues = confirmation?.kind === "project-complete" && confirmationTarget
    ? [
        ...(!confirmationTarget.project.objective ? ["Record a current project objective."] : []),
        ...(!confirmationTarget.project.owner ? ["Assign a project owner."] : []),
        ...activeMilestones(confirmationTarget).map((milestone) => `Complete or archive milestone: ${milestone.title}`),
        ...openBlockers(confirmationTarget).map((blocker) => `Resolve, waive, or carry forward blocker: ${blocker.title}`)
      ]
    : [];
  const confirmationNeedsReason = confirmation?.kind === "project-archive" || confirmation?.kind === "link-remove" || confirmation?.kind === "milestone-complete";
  const confirmationTitle = confirmation?.kind === "project-complete"
    ? "Complete this project?"
    : confirmation?.kind === "project-archive"
      ? "Archive this project?"
      : confirmation?.kind === "project-restore"
        ? "Restore this project?"
        : confirmation?.kind === "milestone-complete"
          ? "Complete this milestone?"
          : confirmation?.kind === "link-remove"
            ? "Remove this project link?"
            : "Restore this project link?";
  const confirmationDescription = confirmation?.kind === "project-complete"
    ? completionIssues.length
      ? "Completion is blocked until the native project gates below are satisfied."
      : "The project will be marked complete and retained with its links, timeline, and audit history."
    : confirmation?.kind === "project-archive"
      ? "Archiving removes the project from active views without deleting milestones, blockers, links, or history."
      : confirmation?.kind === "project-restore"
        ? "The project will return to active views. Existing history and references remain unchanged."
        : confirmation?.kind === "milestone-complete"
          ? "The milestone completion will be recorded on the native project timeline."
          : confirmation?.kind === "link-remove"
            ? "Only the Project reference will be removed. The source object remains unchanged in its owner module."
            : "The existing typed reference will become active again.";

  const directory = (
    <DirectoryPane className={styles.directory} ariaLabel="Projects directory">
      <div className={styles.mainScroll}>
        <div className={styles.directoryHeader}>
          <div>
            <h1>Projects</h1>
            <p>{visibleProjects.length} shown · {snapshot.projects.length} total identities</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.button} onClick={() => {
              setCompact(!compact);
              updateUrl({ compact: !compact });
            }}>{compact ? "Comfortable" : "Compact"}</button>
            <button type="button" className={styles.button} disabled title="Saved-view persistence is an open product decision.">Save view</button>
            <button type="button" className={styles.button} data-primary="true" onClick={() => openEditor("project-create")}>New project</button>
          </div>
        </div>

        {initialLoadError && <SystemState variant="error" compact title="Some project sources did not load" description={initialLoadError} />}
        {sourceErrors.length > 0 && <p className={styles.notice} role="status">Optional read sources are partially unavailable. Native project data remains usable; see Properties for exact source errors.</p>}
        {mutationError && <p className={styles.errorBanner} role="alert">{mutationError}</p>}
        {notice && <p className={styles.successBanner} role="status">{notice}</p>}

        <label className={styles.search}>
          <span aria-hidden="true">/</span>
          <span className="sr-only">Search projects and linked context</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              updateUrl({ query: event.target.value });
            }}
            placeholder="Search projects, milestones, blockers, linked context…"
          />
          <kbd aria-hidden="true">SEARCH</kbd>
        </label>

        <div className={styles.filterRow} role="toolbar" aria-label="Project filters">
          {(["all", "active", "due", "needs-review", "blocked", "linked", "missing-owner"] as const).map((itemFilter) => (
            <button
              type="button"
              className={styles.filterChip}
              data-active={filter === itemFilter}
              data-tone={itemFilter === "active" ? "green" : itemFilter === "blocked" || itemFilter === "missing-owner" ? "red" : itemFilter === "due" || itemFilter === "needs-review" ? "amber" : itemFilter === "linked" ? "blue" : undefined}
              aria-pressed={filter === itemFilter}
              onClick={() => {
                setFilter(itemFilter);
                updateUrl({ filter: itemFilter });
              }}
              key={itemFilter}
            >{FILTER_LABELS[itemFilter]}</button>
          ))}
        </div>

        <div className={styles.sortRow}>
          <div className={styles.sortControl}>
            <span>Sort</span>
            <select className={styles.selectControl} value={sort} onChange={(event) => {
              const nextSort = event.target.value as ProjectSort;
              setSort(nextSort);
              updateUrl({ sort: nextSort });
            }} aria-label="Sort projects">
              {Object.entries(SORT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </div>
          <span>{VIEW_LABELS[view]} · {FILTER_LABELS[filter]}</span>
        </div>

        {batchSelection.size > 0 && (
          <div className={styles.batchBar} role="status">
            <strong>{batchSelection.size} selected</strong>
            <span>Checkbox selection is independent from the inspector.</span>
            <button type="button" className={styles.button} disabled title="Batch archive needs per-project reason and consequence review; use each project’s Archive action.">Batch archive</button>
            <button type="button" className={styles.button} onClick={() => setBatchSelection(new Set())}>Clear</button>
          </div>
        )}

        {visibleProjects.length ? (
          <div className={styles.list} data-density={compact ? "compact" : "comfortable"} role="list" aria-label="Projects">
            {visibleProjects.map((item) => {
              const milestone = nextMilestone(item);
              const attention = item.attentionReasons[0];
              return (
                <DenseObjectRow
                  id={item.project.id}
                  title={item.project.name}
                  description={excerpt(item.project.description || item.project.objective || "No project context recorded.")}
                  leading={<span className={styles.rowAvatar} aria-label={`${item.project.name} initials`}>{initials(item.project.name)}</span>}
                  metadata={`${item.project.id} · ${item.linkedContext.length} links · ${activeMilestones(item).length} milestones`}
                  trailing={<>
                    <span className={styles.rowState} data-tone={stateTone(item.project.lifecycle)}>{displayLabel(item.project.lifecycle)}</span>
                    <span>{attention || (milestone ? `Next ${formatDate(milestone.dueAt)}` : `Updated ${formatDate(item.project.updatedAt)}`)}</span>
                  </>}
                  selected={selectedProjectId === item.project.id}
                  onSelect={() => selectProject(item)}
                  checkbox={{
                    checked: batchSelection.has(item.project.id),
                    onCheckedChange: (checked) => setChecked(item.project.id, checked),
                    label: `Select ${item.project.name} for batch actions`
                  }}
                  key={item.project.id}
                />
              );
            })}
          </div>
        ) : (
          <SystemState
            variant="empty"
            title="No projects match this operating view"
            description="Clear the search or choose All. Archived projects remain in the Archive view."
            action={{ label: "Clear view", onSelect: () => {
              setView("all");
              setFilter("all");
              setQuery("");
              updateUrl({ view: "all", filter: "all", query: "" });
            } }}
          />
        )}
      </div>
    </DirectoryPane>
  );

  const projectInspector = (
    <InspectorRail
      title={selectedItem ? renderProjectHeader(selectedItem, "h2") : undefined}
      overlay={isInspectorOverlay}
      overlayOpen={inspectorOpen}
      onRequestClose={() => setInspectorOpen(false)}
      ariaLabel={selectedItem ? `${selectedItem.project.name} inspector` : "Project inspector"}
    >
      {selectedItem ? renderProjectBody(selectedItem) : <div className={styles.emptyInspector}><h2>Select a project</h2><p>The inspector keeps native state, linked context, and safe actions together.</p></div>}
    </InspectorRail>
  );

  const completionRail = selectedItem ? (
    <InspectorRail
      title="Completion and context"
      overlay={isInspectorOverlay}
      overlayOpen={inspectorOpen}
      onRequestClose={() => setInspectorOpen(false)}
      ariaLabel={`${selectedItem.project.name} completion rail`}
    >
      {renderCompletionRail(selectedItem)}
    </InspectorRail>
  ) : undefined;

  return (
    <>
      <ModuleShell
        module="projects"
        mode={initialDetail ? "detail" : "directory"}
        className={`${styles.shell} ${initialDetail ? styles.detailShell : ""}`}
        ariaLabel={initialDetail && selectedItem ? `${selectedItem.project.name} project workspace` : "Projects workspace"}
        sidebar={<ModuleSidebar
          title="Projects"
          description="Native project operations and explicit legacy projections."
          sections={sidebarSections}
          className={styles.sidebar}
          mobileOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          footer={<p className={styles.sidebarFootnote}>Projects never imports legacy task counts as milestones or duplicates source objects from owner modules.</p>}
        />}
        inspector={initialDetail ? completionRail : projectInspector}
        aiDock={<SharedAIDock
          open={aiOpen}
          onOpenChange={(open) => {
            setAiOpen(open);
            updateUrl({ ai: open });
          }}
          context={{
            module: "projects",
            object: selectedItem?.project.nativeRef,
            activeTab,
            visibleScope: `${VIEW_LABELS[view]} · ${FILTER_LABELS[filter]}`,
            allowedActions: ["Summarize visible project state", "Draft a reviewed proposal"]
          }}
        />}
      >
        <button type="button" className={`${styles.iconButton} ${styles.mobileMenuButton}`} onClick={() => setMobileSidebarOpen(true)} aria-label="Open Projects navigation">☰</button>
        {isInspectorOverlay && selectedItem && <button type="button" className={`${styles.button} ${styles.mobileInspectorButton}`} onClick={() => setInspectorOpen(true)}>{initialDetail ? "Completion" : "Details"}</button>}
        {initialDetail ? (
          <div className={styles.mainScroll}>
            <div className={styles.mobileToolbar}><Link className={styles.textLink} href={getModuleRoute("projects")}>Back to projects</Link></div>
            {selectedItem ? <>{renderProjectHeader(selectedItem, "h1")}{renderProjectBody(selectedItem)}</> : <SystemState variant="error" title="Project not found" description="The requested project identity is not available in the current native or legacy snapshot." />}
          </div>
        ) : directory}
      </ModuleShell>

      {(mobileSidebarOpen || (isInspectorOverlay && inspectorOpen)) && <button type="button" className={styles.scrim} onClick={() => {
        setMobileSidebarOpen(false);
        setInspectorOpen(false);
      }} aria-label="Close open Projects panel" />}

      <EditorDrawer
        open={Boolean(editor)}
        title={editorTitle}
        description={editorDescription}
        busy={mutationBusy}
        error={editorError}
        onRequestClose={requestCloseEditor}
        onSubmit={submitEditor}
      >
        {renderEditorFields()}
      </EditorDrawer>

      <ConfirmationSheet
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={() => {
          setDiscardOpen(false);
          closeEditor();
        }}
        title="Discard unsaved changes?"
        description="Your current project form values have not been saved."
        consequences={["The open editor values will be cleared.", "No persisted project data will change."]}
        confirmLabel="Discard changes"
        tone="danger"
      />

      <ConfirmationSheet
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !mutationBusy) {
            setConfirmation(null);
            setConfirmationReason("");
          }
        }}
        onConfirm={confirmMutation}
        title={confirmationTitle}
        description={<>
          <p>{confirmationDescription}</p>
          {mutationError && <p className={styles.errorBanner} role="alert">{mutationError}</p>}
        </>}
        consequences={completionIssues}
        confirmLabel={confirmation?.kind === "project-archive" ? "Archive project" : confirmation?.kind === "link-remove" ? "Remove link" : confirmation?.kind === "project-restore" || confirmation?.kind === "link-restore" ? "Restore" : "Confirm completion"}
        tone={confirmation?.kind === "project-archive" || confirmation?.kind === "link-remove" ? "danger" : "default"}
        busy={mutationBusy}
        confirmDisabled={completionIssues.length > 0 || Boolean(confirmationNeedsReason && !confirmationReason.trim())}
        confirmDisabledReason={completionIssues.length ? "Resolve every listed completion gate first." : confirmationNeedsReason && !confirmationReason.trim() ? "A reason is required for this auditable mutation." : undefined}
      >
        {confirmationNeedsReason && (
          <label className={styles.field}>
            {confirmation?.kind === "project-archive" ? "Archive reason" : confirmation?.kind === "link-remove" ? "Removal reason" : "Completion note"}
            <textarea value={confirmationReason} onChange={(event) => setConfirmationReason(event.target.value)} autoFocus={Boolean(confirmationNeedsReason)} />
          </label>
        )}
      </ConfirmationSheet>
    </>
  );
}
