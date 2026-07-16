"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ModuleShell from "./admin-shell/ModuleShell";
import ModuleSidebar, { type ModuleSidebarSection } from "./admin-shell/ModuleSidebar";
import DirectoryPane from "./admin-shell/DirectoryPane";
import InspectorRail from "./admin-shell/InspectorRail";
import SharedAIDock from "./admin-shell/SharedAIDock";
import DenseObjectRow from "./operational/DenseObjectRow";
import ObjectHeader from "./operational/ObjectHeader";
import DetailTabs, { DetailTabPanel, type DetailTab } from "./operational/DetailTabs";
import MetricStrip from "./operational/MetricStrip";
import QuickActionBar from "./operational/QuickActionBar";
import SystemState from "./operational/SystemState";
import ConfirmationSheet from "./operational/ConfirmationSheet";
import {
  contentLinksForObject,
  contentTargetGroupsForObject,
  sameNativeObject,
  unresolvedReferencesForObject,
  type LegacyContentGraph,
  type LegacyUnresolvedReference
} from "../lib/modules/content-graph/types";
import { createNotesRepository } from "../lib/modules/notes/repository";
import {
  buildNoteViewCounts,
  noteRecordToDirectoryItem
} from "../lib/modules/notes/view-model";
import type {
  LegacyWritableNoteType,
  NoteRecord,
  NoteWritableLifecycleStatus
} from "../lib/modules/notes/types";
import {
  parseNotesUrlState,
  serializeNotesUrlState,
  type NotesFilter,
  type NotesSort,
  type NotesTab,
  type NotesView
} from "../lib/native-objects/url-state";
import { getModuleRoute, getNativeObjectRoute } from "../lib/native-objects/routes";
import styles from "./content-graph/ContentGraphWorkspace.module.css";

type NotesWorkspaceProps = {
  initialNotes: NoteRecord[];
  contentGraph: LegacyContentGraph;
  initialMode?: "index" | "detail";
  initialSelectedId?: string;
  initialLoadError?: string;
};

type NoteReviewEvidenceCheck = {
  id: string;
  label: string;
  detail: string;
  required: boolean;
  complete: boolean;
  href?: string;
  actionLabel?: string;
};

type SaveState = "saved" | "unsaved" | "saving" | "failed";

const NOTES_DIRTY_HISTORY_GUARD = "__unigentamos_notes_dirty_guard";
const NOTES_HISTORY_BACK_DESTINATION = "__notes_history_back__";

const TYPE_LABELS: Readonly<Record<NoteRecord["type"], string>> = {
  decision: "Decision Candidate",
  meeting: "Meeting",
  idea: "Idea",
  research: "Research",
  personal_context: "Personal Context",
  project_note: "Project Note"
};

const HOME_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "body", label: "Body" },
  { id: "links", label: "Links" },
  { id: "decisions", label: "Decisions" },
  { id: "review", label: "Review" },
  { id: "properties", label: "Properties" }
];

const DETAIL_TABS: readonly DetailTab[] = [
  { id: "body", label: "Body" },
  { id: "links", label: "Links" },
  { id: "decisions", label: "Decisions" },
  { id: "review", label: "Review" },
  { id: "attachments", label: "Attachments" },
  { id: "properties", label: "Properties" }
];

const VIEW_LABELS: Readonly<Record<NotesView, string>> = {
  all: "All Notes",
  recent: "Recent Notes",
  pinned: "Pinned Notes",
  active: "Active Notes",
  "needs-review": "Needs Review",
  drafts: "Drafts",
  "linked-people": "Linked to People",
  "linked-projects": "Linked to Projects",
  "linked-finance": "Linked to Finance",
  "linked-resources": "Linked to Resources",
  "linked-reviews": "Linked to Reviews",
  "no-links": "No Links",
  decisions: "Decision Candidates",
  meetings: "Meetings",
  ideas: "Ideas",
  research: "Research",
  "personal-context": "Personal Context",
  "project-notes": "Project Notes",
  archived: "Archived Notes"
};

const FILTERS: ReadonlyArray<{
  id: NotesFilter;
  label: string;
  tone: "pink" | "green" | "blue" | "amber" | "purple";
  disabledReason?: string;
}> = [
  { id: "all", label: "All", tone: "pink" },
  { id: "active", label: "Active", tone: "green" },
  { id: "pinned", label: "Pinned", tone: "amber", disabledReason: "Pinned state is not stored by the legacy Notes adapter." },
  { id: "linked", label: "Linked", tone: "blue", disabledReason: "Legacy relation IDs are not promoted to native NoteLink records." },
  { id: "no-links", label: "No links", tone: "amber", disabledReason: "Native NoteLink completeness is not available yet." },
  { id: "needs-review", label: "Needs review", tone: "purple" }
];

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

function displayLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function decisionCandidateRoute(note: NoteRecord) {
  const params = new URLSearchParams({
    create: "decision",
    sourceModule: "notes",
    sourceObjectType: "decision_candidate",
    sourceObjectId: note.id,
    sourceLabel: note.title,
    sourceRoute: getNativeObjectRoute({
      module: "notes",
      objectType: "note",
      objectId: note.id
    })
  });
  return `${getModuleRoute("personal_ops")}/decisions?${params.toString()}`;
}

function resourceSearchRoute(value: string) {
  const params = new URLSearchParams({ query: value });
  return `${getModuleRoute("resources")}?${params.toString()}`;
}

function initials(title: string) {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "N";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function relationCount(note: NoteRecord) {
  return Object.values(note.relations).reduce((total, values) => total + values.length, 0);
}

function hasLegacySource(note: NoteRecord) {
  return Boolean(note.legacySources.sourceUrl || note.legacySources.externalSources.length);
}

function matchesView(note: NoteRecord, view: NotesView) {
  if (view === "all") return note.lifecycleStatus !== "archived";
  if (view === "active") return note.lifecycleStatus === "active";
  if (view === "needs-review") return note.reviewState === "needs_review";
  if (view === "drafts") return note.lifecycleStatus === "draft";
  if (view === "archived") return note.lifecycleStatus === "archived";
  if (view === "decisions") return note.type === "decision";
  if (view === "meetings") return note.type === "meeting";
  if (view === "ideas") return note.type === "idea";
  if (view === "research") return note.type === "research";
  if (view === "personal-context") return note.type === "personal_context";
  if (view === "project-notes") return note.type === "project_note";
  return false;
}

function viewUnavailable(view: NotesView) {
  if (view === "recent") return "The recency window is an open product decision.";
  if (view === "pinned") return "Pinned state is not stored by the legacy Notes adapter.";
  if (view.startsWith("linked-") || view === "no-links") {
    return "Native NoteLink records and module-specific relationship semantics are not connected yet.";
  }
  return "";
}

function matchesFilter(note: NoteRecord, filter: NotesFilter) {
  if (filter === "all") return true;
  if (filter === "active") return note.lifecycleStatus === "active";
  if (filter === "needs-review") return note.reviewState === "needs_review";
  return false;
}

function matchesQuery(note: NoteRecord, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    note.id,
    note.uid,
    note.title,
    note.body,
    note.type,
    note.lifecycleStatus,
    note.reviewState,
    note.legacySources.sourceUrl,
    ...note.legacySources.externalSources,
    ...note.areas,
    ...note.subjects,
    ...note.projects
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function sortNotes(notes: NoteRecord[], sort: NotesSort) {
  return [...notes].sort((left, right) => {
    if (sort === "title") return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    if (sort === "created-desc") return right.createdAt.localeCompare(left.createdAt);
    if (sort === "review") {
      return (left.nextReviewAt || "9999-12-31").localeCompare(right.nextReviewAt || "9999-12-31");
    }
    if (sort === "updated-asc") return left.updatedAt.localeCompare(right.updatedAt);
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function inspectorTabFor(tab: NotesTab): NotesTab {
  return tab === "attachments" ? "overview" : tab;
}

function writableLifecycleFor(note: NoteRecord): NoteWritableLifecycleStatus | null {
  return note.provenance.status === "draft" || note.provenance.status === "active"
    ? note.provenance.status
    : null;
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

export default function NotesWorkspace({
  initialNotes,
  contentGraph,
  initialMode = "index",
  initialSelectedId,
  initialLoadError = ""
}: NotesWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const repository = useMemo(() => createNotesRepository(), []);
  const [firstUrlState] = useState(() => parseNotesUrlState(searchParams));
  const [notes, setNotes] = useState(initialNotes);
  const [query, setQuery] = useState(firstUrlState.query);
  const [view, setView] = useState<NotesView>(firstUrlState.view);
  const [filter, setFilter] = useState<NotesFilter>(firstUrlState.filter);
  const [sort, setSort] = useState<NotesSort>(firstUrlState.sort);
  const [density, setDensity] = useState(firstUrlState.density);
  const [selectedId, setSelectedId] = useState(initialSelectedId || firstUrlState.note || initialNotes[0]?.id || "");
  const [activeTab, setActiveTab] = useState<NotesTab>(
    initialMode === "detail" && firstUrlState.tab === "overview" ? "body" : firstUrlState.tab
  );
  const [inspectorTab, setInspectorTab] = useState<NotesTab>(
    initialMode === "detail" ? "overview" : inspectorTabFor(firstUrlState.tab)
  );
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(firstUrlState.ai);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<LegacyWritableNoteType>("idea");
  const [lifecycle, setLifecycle] = useState<NoteWritableLifecycleStatus>("draft");
  const [captureSaving, setCaptureSaving] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [notice, setNotice] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftLifecycle, setDraftLifecycle] = useState<NoteWritableLifecycleStatus>("draft");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const captureTitleRef = useRef<HTMLInputElement>(null);
  const dirtyHistoryGuardRef = useRef<string | null>(null);
  const suppressDirtyPopRef = useRef(false);
  const isInspectorOverlay = useMediaQuery("(max-width: 1240px)");
  const searchParamKey = searchParams.toString();

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) || null,
    [notes, selectedId]
  );
  const writableSelectedLifecycle = selectedNote ? writableLifecycleFor(selectedNote) : null;
  const counts = useMemo(() => buildNoteViewCounts(notes), [notes]);
  const unavailableViewReason = viewUnavailable(view);
  const visibleNotes = useMemo(
    () => sortNotes(
      notes.filter((note) => matchesView(note, view) && matchesFilter(note, filter) && matchesQuery(note, query)),
      sort
    ),
    [filter, notes, query, sort, view]
  );

  useEffect(() => {
    const next = parseNotesUrlState(searchParams);
    setQuery(next.query);
    setView(next.view);
    setFilter(next.filter);
    setSort(next.sort);
    setDensity(next.density);
    setAiOpen(next.ai);
    if (!initialSelectedId) setSelectedId(next.note || initialNotes[0]?.id || "");
    setActiveTab(initialMode === "detail" && next.tab === "overview" ? "body" : next.tab);
    if (initialMode === "index") setInspectorTab(inspectorTabFor(next.tab));
  }, [initialMode, initialSelectedId, searchParamKey]);

  useEffect(() => {
    if (!selectedNote) return;
    setDraftTitle(selectedNote.title);
    setDraftBody(selectedNote.body);
    setDraftLifecycle(writableLifecycleFor(selectedNote) || "active");
    setSaveState("saved");
    setSaveError("");
  }, [selectedNote?.id]);

  useEffect(() => {
    if (initialMode !== "index" || unavailableViewReason || !visibleNotes.length) return;
    if (visibleNotes.some((note) => note.id === selectedId)) return;
    const nextId = visibleNotes[0].id;
    setSelectedId(nextId);
    updateUrl({ note: nextId }, { history: "replace" });
  }, [filter, initialMode, query, sort, unavailableViewReason, view, visibleNotes.length]);

  function destinationFor(
    partial: Partial<ReturnType<typeof parseNotesUrlState>>,
    options: { path?: string } = {}
  ) {
    const path = options.path || pathname;
    const params = serializeNotesUrlState(
      {
        view,
        filter,
        sort,
        density,
        query,
        note: path === getModuleRoute("notes") ? selectedId : "",
        tab: activeTab,
        ai: aiOpen,
        ...partial
      },
      searchParams
    );
    return `${path}${params.size ? `?${params.toString()}` : ""}`;
  }

  function updateUrl(
    partial: Partial<ReturnType<typeof parseNotesUrlState>>,
    options: { path?: string; history?: "push" | "replace" } = {}
  ) {
    const destination = destinationFor(partial, options);
    if (options.history === "push") router.push(destination, { scroll: false });
    else router.replace(destination, { scroll: false });
  }

  function selectNote(id: string) {
    setSelectedId(id);
    setInspectorOpen(true);
    setInspectorTab("overview");
    setActiveTab("overview");
    updateUrl({ note: id, tab: "overview" }, { history: "push" });
  }

  function selectDirectoryView(nextView: NotesView, reason = "") {
    setView(nextView);
    setFilter("all");
    setNotice(reason);
    updateUrl(
      { view: nextView, filter: "all", tab: "overview" },
      {
        path: getModuleRoute("notes"),
        history: initialMode === "detail" ? "push" : "replace"
      }
    );
  }

  function setBatch(id: string, checked: boolean) {
    setBatchSelection((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setCaptureError("Title is required by the current persistence adapter.");
      return;
    }
    setCaptureSaving(true);
    setCaptureError("");
    setNotice("");
    const result = await repository.create({
      title: title.trim(),
      body,
      type: noteType,
      lifecycleStatus: lifecycle,
      areas: [],
      subjects: []
    });
    setCaptureSaving(false);
    if (!result.ok) {
      setCaptureError(result.error.message);
      return;
    }
    setNotes((current) => [result.data, ...current.filter((note) => note.id !== result.data.id)]);
    setSelectedId(result.data.id);
    setTitle("");
    setBody("");
    setNoteType("idea");
    setLifecycle("draft");
    setNotice("Note saved through the existing Personal Records adapter.");
    updateUrl({ note: result.data.id, view: "all", filter: "all", tab: "overview" }, { history: "push" });
  }

  const editorDirty = Boolean(
    initialMode === "detail" && selectedNote && (
      draftTitle !== selectedNote.title ||
      draftBody !== selectedNote.body ||
      (writableSelectedLifecycle !== null && draftLifecycle !== writableSelectedLifecycle)
    )
  );

  useEffect(() => {
    if (!editorDirty) {
      if (dirtyHistoryGuardRef.current) void releaseDirtyHistoryGuard();
      if (saveState !== "saving" && saveState !== "saved") setSaveState("saved");
      if (saveError) setSaveError("");
      return;
    }
    if (saveState !== "failed" && saveState !== "saving") setSaveState("unsaved");
  }, [draftBody, draftLifecycle, draftTitle, editorDirty]);

  useEffect(() => {
    if (!editorDirty) return;
    if (!dirtyHistoryGuardRef.current) {
      const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      dirtyHistoryGuardRef.current = marker;
      window.history.pushState(
        { ...(window.history.state || {}), [NOTES_DIRTY_HISTORY_GUARD]: marker },
        "",
        window.location.href
      );
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handleLinkNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      event.preventDefault();
      setPendingNavigation(`${destination.pathname}${destination.search}${destination.hash}`);
      setConfirmOpen(true);
    };
    const handlePopState = () => {
      if (suppressDirtyPopRef.current) {
        suppressDirtyPopRef.current = false;
        return;
      }
      if (!dirtyHistoryGuardRef.current) return;
      suppressDirtyPopRef.current = true;
      window.history.forward();
      setPendingNavigation(NOTES_HISTORY_BACK_DESTINATION);
      setConfirmOpen(true);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleLinkNavigation, true);
    };
  }, [editorDirty]);

  useEffect(() => {
    if (initialMode !== "detail") return;
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNote();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [draftBody, draftLifecycle, draftTitle, initialMode, selectedNote?.id]);

  async function releaseDirtyHistoryGuard() {
    const marker = dirtyHistoryGuardRef.current;
    if (!marker) return;
    dirtyHistoryGuardRef.current = null;
    if (window.history.state?.[NOTES_DIRTY_HISTORY_GUARD] !== marker) return;
    suppressDirtyPopRef.current = true;
    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        suppressDirtyPopRef.current = false;
        window.removeEventListener("popstate", finish);
        window.clearTimeout(timeoutId);
        resolve();
      };
      const timeoutId = window.setTimeout(finish, 350);
      window.addEventListener("popstate", finish, { once: true });
      window.history.back();
    });
  }

  async function saveNote() {
    if (!selectedNote || !editorDirty || saveState === "saving") return;
    if (!draftTitle.trim()) {
      setSaveState("failed");
      setSaveError("Title is required before this legacy-backed Note can be saved.");
      return;
    }
    setSaveState("saving");
    setSaveError("");
    const lifecycleChanged = writableSelectedLifecycle !== null && draftLifecycle !== writableSelectedLifecycle;
    const result = await repository.update(selectedNote.id, {
      title: draftTitle,
      body: draftBody,
      ...(lifecycleChanged ? { lifecycleStatus: draftLifecycle } : {})
    });
    if (!result.ok) {
      setSaveState("failed");
      setSaveError(result.error.message);
      return;
    }
    setNotes((current) => current.map((note) => note.id === result.data.id ? result.data : note));
    setDraftTitle(result.data.title);
    setDraftBody(result.data.body);
    setDraftLifecycle(writableLifecycleFor(result.data) || "active");
    setSaveState("saved");
    await releaseDirtyHistoryGuard();
  }

  async function discardChanges() {
    const destination = pendingNavigation;
    setConfirmOpen(false);
    setPendingNavigation(null);
    if (destination === NOTES_HISTORY_BACK_DESTINATION) {
      const marker = dirtyHistoryGuardRef.current;
      const onGuardEntry = marker && window.history.state?.[NOTES_DIRTY_HISTORY_GUARD] === marker;
      dirtyHistoryGuardRef.current = null;
      suppressDirtyPopRef.current = true;
      window.history.go(onGuardEntry ? -2 : -1);
      return;
    }
    await releaseDirtyHistoryGuard();
    if (selectedNote) {
      setDraftTitle(selectedNote.title);
      setDraftBody(selectedNote.body);
      setDraftLifecycle(writableLifecycleFor(selectedNote) || "active");
    }
    router.push(destination || getModuleRoute("notes"));
  }

  const getViewCount = (item: NotesView) => {
    if (item === "all") return counts.total - counts.archived;
    if (item === "active") return counts.active;
    if (item === "needs-review") return counts.needsReview;
    if (item === "drafts") return counts.drafts;
    if (item === "archived") return counts.archived;
    if (item === "decisions") return notes.filter((note) => note.type === "decision").length;
    if (item === "meetings") return notes.filter((note) => note.type === "meeting").length;
    if (item === "ideas") return notes.filter((note) => note.type === "idea").length;
    if (item === "research") return notes.filter((note) => note.type === "research").length;
    if (item === "personal-context") return notes.filter((note) => note.type === "personal_context").length;
    if (item === "project-notes") return notes.filter((note) => note.type === "project_note").length;
    return undefined;
  };

  const sidebarSections: ModuleSidebarSection[] = [
    {
      id: "notes",
      label: "Notes",
      items: [
        ["all", "All Notes"], ["recent", "Recent"], ["pinned", "Pinned"], ["active", "Active"],
        ["needs-review", "Needs Review"], ["drafts", "Drafts"]
      ].map(([id, label]) => ({
        id,
        label,
        count: getViewCount(id as NotesView),
        active: view === id,
        onSelect: () => {
          const reason = viewUnavailable(id as NotesView);
          selectDirectoryView(id as NotesView, reason);
        }
      }))
    },
    {
      id: "smart",
      label: "Smart Views",
      items: [
        ["linked-people", "Linked to People"], ["linked-projects", "Linked to Projects"],
        ["linked-finance", "Linked to Finance"], ["linked-resources", "Linked to Resources"],
        ["linked-reviews", "Linked to Reviews"], ["no-links", "No Links"]
      ].map(([id, label]) => ({
        id,
        label,
        active: view === id,
        onSelect: () => {
          selectDirectoryView(id as NotesView, viewUnavailable(id as NotesView));
        }
      }))
    },
    {
      id: "types",
      label: "Types",
      items: [
        ["decisions", "Decision Candidates"], ["meetings", "Meetings"], ["ideas", "Ideas"],
        ["research", "Research"], ["personal-context", "Personal Context"], ["project-notes", "Project Notes"]
      ].map(([id, label]) => ({
        id,
        label,
        count: getViewCount(id as NotesView),
        active: view === id,
        onSelect: () => {
          selectDirectoryView(id as NotesView);
        }
      }))
    },
    {
      id: "data",
      label: "Data",
      items: [
        { id: "import", label: "Import / Export", disabled: true, disabledReason: "Import and export are not connected yet." },
        { id: "duplicates", label: "Duplicate Notes", disabled: true, disabledReason: "Duplicate detection is not connected and Notes are never auto-merged." },
        { id: "properties", label: "Missing Properties", disabled: true, disabledReason: "Native property readiness is not connected yet." },
        { id: "archived", label: "Archived", count: counts.archived, active: view === "archived", onSelect: () => selectDirectoryView("archived") },
        { id: "settings", label: "Notes Settings", disabled: true, disabledReason: "Notes settings are not implemented." }
      ]
    }
  ];

  const sidebar = (
    <ModuleSidebar
      title="Notes"
      description="Authored internal knowledge, explicit links, and note-local review state."
      sections={sidebarSections}
      mobileOpen={mobileSidebarOpen}
      onClose={() => setMobileSidebarOpen(false)}
      className={styles.sidebar}
      footer={<p className={styles.sidebarFootnote}>Legacy Personal Records adapter · authored Notes only · native links and versions pending</p>}
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
        module: "notes",
        object: selectedNote?.nativeRef || null,
        activeTab,
        visibleScope: initialMode === "detail" ? "Note editor" : view,
        allowedActions: ["Draft a summary", "Suggest links", "Propose a downstream action"]
      }}
    />
  );

  function renderDetailLinksPanel(note: NoteRecord, tabsId: string) {
    const candidates = contentLinksForObject(contentGraph, note.nativeRef);
    const targetGroups = contentTargetGroupsForObject(contentGraph, note.nativeRef);
    const unresolved = unresolvedReferencesForObject(contentGraph, note.nativeRef);
    const exactUrlCandidates = candidates.filter((candidate) => candidate.matchBasis === "exact_normalized_url");
    const exactIdCandidates = candidates.filter((candidate) => candidate.matchBasis === "legacy_relation_id");
    const resourceTargets = targetGroups.filter((group) => group.target.module === "resources");
    const mediaTargets = targetGroups.filter((group) => group.target.module === "media");
    const unresolvedUrls = unresolved.filter((reference) => reference.kind === "external_url_candidate");
    const unresolvedIds = unresolved.filter((reference) => reference.kind === "legacy_relation_id");

    return (
      <DetailTabPanel tabsId={tabsId} tabId="links" active>
        <div className={styles.overviewGrid}>
          <section className={styles.panel} data-wide="true">
            <MetricStrip
              ariaLabel="Note link evidence summary"
              items={[
                { id: "url", label: "Exact normalized URL candidates", value: exactUrlCandidates.length },
                { id: "id", label: "Exact ID candidates", value: exactIdCandidates.length },
                { id: "persisted", label: "Persisted ObjectLinks", value: 0, tone: "attention" },
                { id: "unresolved", label: "Unresolved references", value: unresolved.length, tone: unresolved.length ? "attention" : "positive" },
                { id: "resources", label: "Resource targets", value: resourceTargets.length },
                { id: "media", label: "Media targets", value: mediaTargets.length }
              ]}
            />
            <div className={styles.readOnlyNotice}>
              <strong>Candidate graph · not persisted NoteLinks</strong>
              <span>
                These rows come from exact normalized URLs or retained record IDs. They can open the owning object, but they are not citations, attachments, backlinks, or persisted ObjectLinks and cannot be edited or removed here.
              </span>
            </div>
          </section>

          <section className={styles.panel} data-wide="true">
            <div className={styles.panelHeader}>
              <div><h2>Resolved owner routes</h2><p>Exact candidates grouped by their native owner.</p></div>
              <strong>{targetGroups.length}</strong>
            </div>
            {targetGroups.length ? (
              <ul className={styles.objectList} aria-label="Read-only Note link candidates">
                {targetGroups.map((group) => {
                  const urlSignals = group.candidates.filter((candidate) => candidate.matchBasis === "exact_normalized_url").length;
                  const idSignals = group.candidates.filter((candidate) => candidate.matchBasis === "legacy_relation_id").length;
                  const relationships = Array.from(new Set(group.candidates.map((candidate) => displayLabel(candidate.relationship))));
                  const ambiguous = group.candidates.some((candidate) => candidate.ambiguity === "multiple_targets");
                  const signalSummary = [
                    urlSignals ? `${urlSignals} URL ${urlSignals === 1 ? "signal" : "signals"}` : "",
                    idSignals ? `${idSignals} retained-ID ${idSignals === 1 ? "signal" : "signals"}` : ""
                  ].filter(Boolean).join(" · ");
                  return (
                    <li
                      key={`${group.target.module}-${group.target.objectType}-${group.target.objectId}`}
                      data-content-target={`${group.target.module}:${group.target.objectId}`}
                    >
                      <span>
                        <strong>{group.target.label}</strong>
                        <small>{displayLabel(group.target.module)} · {displayLabel(group.target.objectType)} · {relationships.join(" / ")}</small>
                      </span>
                      <span className={styles.inlineActions}>
                        <span className={styles.stateChip} data-tone={ambiguous ? "amber" : "blue"}>
                          {signalSummary}{ambiguous ? " · ambiguous" : ""}
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
                title="No exact cross-module candidates"
                description="No Resource URL or retained Notes, Resources, or Media record ID resolves exactly in the current read model."
              />
            )}
          </section>

          <section className={styles.panel} data-wide="true">
            <div className={styles.panelHeader}>
              <div><h2>Unresolved retained references</h2><p>Unresolved values stay visible instead of disappearing from the graph.</p></div>
              <strong>{unresolved.length}</strong>
            </div>
            {unresolved.length ? (
              <ul className={styles.sourceList} aria-label="Unresolved Note references">
                {unresolved.map((reference: LegacyUnresolvedReference) => (
                  <li key={reference.id}>
                    <span>
                      <strong className={styles.mono}>{reference.value}</strong>
                      <small>{displayLabel(reference.legacyDirection || reference.kind)} · {reference.caveat}</small>
                    </span>
                    {reference.kind === "external_url_candidate" ? (
                      <Link className={styles.linkButton} href={resourceSearchRoute(reference.value)}>Search Resources</Link>
                    ) : (
                      <span className={styles.stateChip} data-tone="amber">Owner unresolved</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p>No unresolved URL candidates or retained relation IDs for this Note.</p>}
          </section>

          <section className={styles.panel}>
            <h2>Resources</h2>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>Resolved URL identities</span><strong>{resourceTargets.length}</strong></div>
              <div className={styles.fact}><span>Unresolved URL candidates</span><strong>{unresolvedUrls.length}</strong></div>
            </div>
            <div className={styles.sourceBoundary}>Resources owns canonical URLs, fetched titles, health, citations, and freshness. An exact normalized URL match is still only a link candidate until explicitly promoted.</div>
          </section>

          <section className={styles.panel}>
            <h2>Media and files</h2>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>Media-shaped records</span><strong>{mediaTargets.length}</strong></div>
              <div className={styles.fact}><span>Verified File objects</span><strong>0</strong></div>
            </div>
            <div className={styles.sourceBoundary}>Media candidates remain distinct from Resources. A legacy file-shaped record does not prove a binary, upload, snapshot, version, preview, or standalone File object.</div>
          </section>

          <section className={styles.panel} data-wide="true">
            <h2>Safe link actions</h2>
            <QuickActionBar
              actions={[
                { id: "link", label: "Link object", disabled: true, disabledReason: "Native NoteLink persistence and relationship provenance are not connected." },
                { id: "promote", label: "Promote candidate", disabled: true, disabledReason: "Candidate promotion requires an approved link repository and explicit audit event." },
                { id: "repair", label: "Repair unresolved ID", disabled: true, disabledReason: `${unresolvedIds.length} retained ID reference${unresolvedIds.length === 1 ? "" : "s"} need an ownership-safe relink workflow.` },
                { id: "remove", label: "Remove link", disabled: true, disabledReason: "No persisted ObjectLink exists to remove. Neither source nor target will be deleted.", intent: "destructive" }
              ]}
            />
          </section>
        </div>
      </DetailTabPanel>
    );
  }

  function renderDetailReviewPanel(note: NoteRecord, tabsId: string) {
    const candidates = contentLinksForObject(contentGraph, note.nativeRef);
    const outgoingCandidates = candidates.filter((candidate) => sameNativeObject(candidate.source, note.nativeRef));
    const unresolved = unresolvedReferencesForObject(contentGraph, note.nativeRef);
    const exactUrlCandidates = outgoingCandidates.filter((candidate) => candidate.matchBasis === "exact_normalized_url");
    const exactIdCandidates = outgoingCandidates.filter((candidate) => candidate.matchBasis === "legacy_relation_id");
    const unresolvedUrls = unresolved.filter((reference) => reference.kind === "external_url_candidate");
    const unresolvedIds = unresolved.filter((reference) => reference.kind === "legacy_relation_id");
    const resourceTargets = Array.from(new Map(
      exactUrlCandidates
        .map((candidate) => candidate.target)
        .filter((target) => target.module === "resources")
        .map((target) => [`${target.module}|${target.objectType}|${target.objectId}`, target])
    ).values());
    const reviewMapping = note.mappingNotes.find((mapping) => mapping.field === "review");
    const hasSourceCandidates = hasLegacySource(note);
    const legacyRelations = relationCount(note);
    const checks: NoteReviewEvidenceCheck[] = [
      {
        id: "title",
        label: "Title is present",
        detail: note.title.trim() ? "Stored authored title is available." : "A title is required before this Note can be reviewed.",
        required: true,
        complete: Boolean(note.title.trim())
      },
      {
        id: "body",
        label: "Authored body is present",
        detail: note.body.trim() ? "Stored body content is available for human review." : "This Note has no authored body to verify.",
        required: true,
        complete: Boolean(note.body.trim())
      },
      {
        id: "provenance",
        label: "Legacy provenance is preserved",
        detail: `Record ${note.provenance.recordId} · UID ${note.uid}`,
        required: true,
        complete: Boolean(note.provenance.recordId && note.uid && note.createdAt)
      },
      {
        id: "body-accuracy",
        label: "Body accuracy has been confirmed",
        detail: "The legacy adapter has no independent checklist state, reviewer identity, waiver, or completion audit.",
        required: true,
        complete: false
      }
    ];

    if (hasSourceCandidates) {
      const sourcesResolveUniquely = exactUrlCandidates.length > 0 &&
        unresolvedUrls.length === 0 &&
        exactUrlCandidates.every((candidate) => candidate.ambiguity === "unique");
      checks.push({
        id: "resource-identity",
        label: "External source identity resolves uniquely",
        detail: sourcesResolveUniquely
          ? `${resourceTargets.length} Resource owner target${resourceTargets.length === 1 ? "" : "s"} resolve from ${exactUrlCandidates.length} exact normalized URL signal${exactUrlCandidates.length === 1 ? "" : "s"} without ambiguity.`
          : `${unresolvedUrls.length} unresolved URL candidate${unresolvedUrls.length === 1 ? "" : "s"}; exact matches remain candidates, not citations.`,
        required: true,
        complete: sourcesResolveUniquely,
        ...(unresolvedUrls[0] ? { href: resourceSearchRoute(unresolvedUrls[0].value), actionLabel: "Search Resources" } : {})
      });
    }

    if (resourceTargets.length > 0) {
      checks.push({
        id: "resource-health",
        label: "Resource health is verified by Resources",
        detail: "Exact identity is known, but URL health, freshness, trust, and citation readiness remain Resource-owned and unknown here.",
        required: true,
        complete: false,
        href: resourceTargets[0].route,
        actionLabel: "Open Resource"
      });
    }

    if (legacyRelations > 0) {
      checks.push({
        id: "relationship-promotion",
        label: "Retained relationships have native meaning",
        detail: `${legacyRelations} retained relation ID${legacyRelations === 1 ? "" : "s"} are evidence only; ${exactIdCandidates.length} resolve to a current owner route.`,
        required: true,
        complete: false
      });
    }

    if (unresolvedIds.length > 0) {
      checks.push({
        id: "unresolved-ids",
        label: "Retained relation IDs resolve to owner objects",
        detail: `${unresolvedIds.length} relation ID${unresolvedIds.length === 1 ? "" : "s"} remain visible but unresolved.`,
        required: true,
        complete: false
      });
    }

    if (note.type === "decision") {
      checks.push({
        id: "decision-candidate",
        label: "Decision candidate is reconciled",
        detail: "The durable Decision belongs to Personal Ops. This Notes read model cannot confirm an existing output mapping.",
        required: true,
        complete: false,
        href: decisionCandidateRoute(note),
        actionLabel: "Open in Personal Ops"
      });
    }

    checks.push(
      {
        id: "next-review",
        label: "Next review is scheduled",
        detail: note.nextReviewAt ? `Next review ${formatDate(note.nextReviewAt)}.` : "No next review date is stored.",
        required: false,
        complete: Boolean(note.nextReviewAt)
      },
      {
        id: "cadence",
        label: "Review cadence is recorded",
        detail: note.reviewCadence ? `Legacy cadence ${note.reviewCadence}.` : "No cadence is stored.",
        required: false,
        complete: Boolean(note.reviewCadence)
      }
    );

    const requiredChecks = checks.filter((check) => check.required);
    const blockers = requiredChecks.filter((check) => !check.complete);
    const completedRequired = requiredChecks.length - blockers.length;
    const decisionAction = note.type === "decision"
      ? [{ id: "decision", label: "Review Decision in Personal Ops", href: decisionCandidateRoute(note) }]
      : [];

    return (
      <DetailTabPanel tabsId={tabsId} tabId="review" active>
        <div className={styles.overviewGrid}>
          <section className={styles.panel} data-wide="true">
            <MetricStrip
              ariaLabel="Note review evidence summary"
              items={[
                { id: "state", label: "Derived review state", value: displayLabel(note.reviewState), tone: note.reviewState === "needs_review" ? "attention" : "default" },
                { id: "lifecycle", label: "Lifecycle", value: displayLabel(note.lifecycleStatus) },
                { id: "required", label: "Required evidence ready", value: `${completedRequired}/${requiredChecks.length}` },
                { id: "blockers", label: "Required blockers", value: blockers.length, tone: blockers.length ? "danger" : "positive" },
                { id: "optional", label: "Optional open", value: checks.filter((check) => !check.required && !check.complete).length },
                { id: "next", label: "Next review", value: formatDate(note.nextReviewAt, "Not scheduled") }
              ]}
            />
            <div className={styles.readOnlyNotice}>
              <strong>Lifecycle and review are separate</strong>
              <span>
                This Note is {displayLabel(note.lifecycleStatus)} while its review state is {displayLabel(note.reviewState)}. The review state is derived from legacy timing/status evidence and does not create a native NoteReviewState.
              </span>
            </div>
          </section>

          <section className={styles.panel} data-wide="true">
            <div className={styles.panelHeader}>
              <div><h2>Why this Note appears here</h2><p>{reviewMapping?.message || "The legacy adapter cannot establish an independent Note review state."}</p></div>
              <span className={styles.stateChip} data-tone={note.reviewState === "needs_review" ? "pink" : "blue"}>{displayLabel(note.reviewState)}</span>
            </div>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>Last legacy review</span><strong>{formatDate(note.legacyLastReviewAt)}</strong></div>
              <div className={styles.fact}><span>Next legacy review</span><strong>{formatDate(note.nextReviewAt)}</strong></div>
              <div className={styles.fact}><span>Review cadence</span><strong>{note.reviewCadence || "Not recorded"}</strong></div>
              <div className={styles.fact}><span>Required blockers</span><strong>{blockers.length}</strong></div>
            </div>
          </section>

          <section className={styles.panel} data-wide="true">
            <div className={styles.panelHeader}>
              <div><h2>Evidence checklist</h2><p>Required and optional checks are calculated from current stored evidence; no weighted readiness percentage is used.</p></div>
              <strong>{completedRequired}/{requiredChecks.length} required ready</strong>
            </div>
            <ul className={styles.objectList} aria-label="Note review evidence checklist">
              {checks.map((check) => (
                <li key={check.id}>
                  <span>
                    <strong>{check.label}</strong>
                    <small>{check.detail}</small>
                  </span>
                  <span className={styles.inlineActions}>
                    <span className={styles.stateChip} data-tone={check.complete ? "green" : check.required ? "pink" : "amber"}>
                      {check.complete ? "Ready" : check.required ? "Required · open" : "Optional · open"}
                    </span>
                    {check.href && <Link className={styles.linkButton} href={check.href}>{check.actionLabel || "Open owner"}</Link>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.panel}>
            <h2>Required before reviewed</h2>
            {blockers.length ? (
              <ul className={styles.sourceList}>
                {blockers.map((check) => <li key={check.id}><span>{check.label}</span><strong>Open</strong></li>)}
              </ul>
            ) : <p>All calculable evidence is ready, but completion still requires a native review write path and audit.</p>}
          </section>

          <section className={styles.panel}>
            <h2>Owner-module boundaries</h2>
            <div className={styles.sourceBoundary}>Resource health stays in Resources. Durable Decisions stay in Personal Ops. Candidate evidence shown here never copies either object into Notes.</div>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>Resource owner routes</span><strong>{resourceTargets.length}</strong></div>
              <div className={styles.fact}><span>Decision candidate</span><strong>{note.type === "decision" ? "Open" : "Not present"}</strong></div>
            </div>
          </section>

          <section className={styles.panel} data-wide="true">
            <h2>Review actions</h2>
            <QuickActionBar
              actions={[
                ...decisionAction,
                { id: "mark-reviewed", label: "Mark reviewed", disabled: true, disabledReason: "The legacy timestamp write cannot validate required checks, store waivers, identify the reviewer, or create an auditable native review completion." },
                { id: "waive", label: "Waive blocker", disabled: true, disabledReason: "Native check IDs, reviewer identity, reason, and waiver audit are not stored by the legacy adapter." },
                { id: "carry-forward", label: "Carry forward", disabled: true, disabledReason: "Carry-forward requires a native Note review aggregate and destination review state." }
              ]}
            />
            <div className={styles.readOnlyNotice}>
              <strong>Completion intentionally unavailable</strong>
              <span>Resolve owner-module evidence where links are available. Notes will not claim a completed review until the required checks, waivers, reviewer, timestamp, and audit event can be persisted together.</span>
            </div>
          </section>
        </div>
      </DetailTabPanel>
    );
  }

  const inspectorTitle = selectedNote ? (
    <ObjectHeader
      objectType="Internal note"
      title={selectedNote.title}
      subtitle={TYPE_LABELS[selectedNote.type]}
      identity={initials(selectedNote.title)}
      states={
        <>
          <span className={styles.stateChip} data-tone={selectedNote.lifecycleStatus === "active" ? "green" : "amber"}>{displayLabel(selectedNote.lifecycleStatus)}</span>
          <span className={styles.stateChip} data-tone={selectedNote.reviewState === "needs_review" ? "pink" : "blue"}>{displayLabel(selectedNote.reviewState)}</span>
          {(hasLegacySource(selectedNote) || relationCount(selectedNote) > 0) && <span className={styles.stateChip} data-tone="blue">Legacy context</span>}
        </>
      }
      actions={
        <>
          {isInspectorOverlay && <button type="button" className={`${styles.button} ${styles.closeButton}`} onClick={() => setInspectorOpen(false)}>Close</button>}
          <button type="button" className={styles.button} aria-disabled="true" aria-describedby="notes-pin-unavailable" onClick={() => setNotice("Pinned state is not stored by the legacy Notes adapter.")}>Pin<span id="notes-pin-unavailable" className="sr-only">Pinned state is not stored by the legacy Notes adapter.</span></button>
          <Link className={styles.linkButton} href={getNativeObjectRoute({ module: "notes", objectType: "note", objectId: selectedNote.id })}>Edit</Link>
          <button type="button" className={styles.button} aria-disabled="true" aria-describedby="notes-more-unavailable" onClick={() => setNotice("Additional Note actions are not connected yet.")}>More<span id="notes-more-unavailable" className="sr-only">Additional Note actions are not connected yet.</span></button>
        </>
      }
    />
  ) : undefined;

  function renderInspectorPanel() {
    if (!selectedNote) {
      return <div className={styles.emptyInspector}><h2>No Note selected</h2><p>Select a row or capture a Note to inspect it.</p></div>;
    }
    const sourceValues = Array.from(new Set([
      selectedNote.legacySources.sourceUrl,
      ...selectedNote.legacySources.externalSources
    ].filter((value): value is string => Boolean(value))));
    const relationValues = Object.entries(selectedNote.relations).flatMap(([direction, values]) =>
      values.map((value) => ({ direction, value }))
    );

    if (inspectorTab !== "overview" && inspectorTab !== "body") {
      return (
        <DetailTabPanel tabsId={`note-home-${selectedNote.id}`} tabId={inspectorTab} active>
          <SystemState
            variant="read_only"
            title={`${HOME_TABS.find((tab) => tab.id === inspectorTab)?.label || "This tab"} is staged`}
            description="The approved surface is represented in the route and tab framework, but its native persistence and ownership-safe mutations are not connected in this checkpoint."
            compact
          />
        </DetailTabPanel>
      );
    }

    return (
      <DetailTabPanel tabsId={`note-home-${selectedNote.id}`} tabId={inspectorTab} active>
        <div className={styles.overviewGrid}>
          <section className={styles.panel} data-wide="true">
            <div className={styles.panelHeader}><h2>Note Body</h2><Link href={selectedNote.nativeRef.route}>Open full editor</Link></div>
            <p>{selectedNote.body || "No body content recorded yet."}</p>
          </section>
          <section className={styles.panel}>
            <h2>Review &amp; cleanup</h2>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>Next review</span><strong>{formatDate(selectedNote.nextReviewAt)}</strong></div>
              <div className={styles.fact}><span>Updated</span><strong>{formatDate(selectedNote.updatedAt)}</strong></div>
              <div className={styles.fact}><span>Review state</span><strong>{displayLabel(selectedNote.reviewState)}</strong></div>
              <div className={styles.fact}><span>Mapping notes</span><strong>{selectedNote.mappingNotes.length}</strong></div>
            </div>
          </section>
          <section className={styles.panel}>
            <h2>Quick actions</h2>
            <QuickActionBar
              actions={[
                { id: "edit", label: "Open full editor", href: selectedNote.nativeRef.route, intent: "primary" },
                { id: "link", label: "Link object", disabled: true, disabledReason: "Native NoteLink persistence is unresolved." },
                { id: "decision", label: "Convert to decision", href: decisionCandidateRoute(selectedNote) },
                { id: "review", label: "Mark reviewed", disabled: true, disabledReason: "The legacy review action cannot enforce native review blockers." },
                { id: "archive", label: "Archive", disabled: true, disabledReason: "Native archive metadata and retention are unresolved.", intent: "destructive" }
              ]}
            />
          </section>
          <section className={styles.panel} data-wide="true">
            <h2>Legacy relationship context</h2>
            {relationValues.length ? (
              <ul className={styles.objectList}>
                {relationValues.slice(0, 8).map((relation) => <li key={`${relation.direction}-${relation.value}`}><span>{relation.value}</span><strong>{displayLabel(relation.direction)}</strong></li>)}
              </ul>
            ) : <p>No legacy relation IDs are attached. Native NoteLinks are not inferred.</p>}
          </section>
          <section className={styles.panel} data-wide="true">
            <h2>Resource candidates</h2>
            <div className={styles.sourceBoundary}>URLs remain legacy source candidates until Resources creates canonical external-source objects. They are not duplicated as Notes-owned source records.</div>
            {sourceValues.length ? (
              <ul className={styles.sourceList}>
                {sourceValues.map((source) => <li key={source}><span className={styles.mono}>{source}</span>{/^https?:\/\//i.test(source) ? <a href={source} target="_blank" rel="noreferrer">Open ↗</a> : <strong>Unresolved</strong>}</li>)}
              </ul>
            ) : <p>No legacy source candidates.</p>}
          </section>
          <section className={styles.panel} data-wide="true">
            <h2>Metadata</h2>
            <div className={styles.factGrid}>
              <div className={styles.fact}><span>Type</span><strong>{TYPE_LABELS[selectedNote.type]}</strong></div>
              <div className={styles.fact}><span>Lifecycle</span><strong>{displayLabel(selectedNote.lifecycleStatus)}</strong></div>
              <div className={styles.fact}><span>Privacy</span><strong>{displayLabel(selectedNote.privacy)}</strong></div>
              <div className={styles.fact} data-mono="true"><span>UID</span><strong>{selectedNote.uid}</strong></div>
            </div>
          </section>
        </div>
      </DetailTabPanel>
    );
  }

  const inspector = (
    <InspectorRail
      title={inspectorTitle}
      overlay={isInspectorOverlay}
      overlayOpen={isInspectorOverlay ? inspectorOpen : true}
      onRequestClose={() => setInspectorOpen(false)}
      className={inspectorOpen ? "is-open" : undefined}
      ariaLabel={selectedNote ? `${selectedNote.title} Note inspector` : "Note inspector"}
      readOnly={!selectedNote?.capabilities.nativeLinks}
    >
      {selectedNote && (
        <DetailTabs
          id={`note-home-${selectedNote.id}`}
          tabs={HOME_TABS}
          activeTab={inspectorTab}
          onTabChange={(tab) => {
            const nextTab = tab as NotesTab;
            setInspectorTab(nextTab);
            if (initialMode === "index") {
              setActiveTab(nextTab);
              updateUrl({ tab: nextTab });
            }
          }}
          className={styles.tabs}
          ariaLabel="Selected Note preview"
        />
      )}
      {renderInspectorPanel()}
    </InspectorRail>
  );

  if (initialMode === "detail") {
    const currentNote = selectedNote;
    const detailTabsId = currentNote ? `note-detail-${currentNote.id}` : "note-detail";
    return (
      <ModuleShell
        module="notes"
        sidebar={sidebar}
        inspector={inspector}
        aiDock={aiDock}
        mode="editor"
        ariaLabel="Note editor"
        className={`${styles.shell} ${styles.detailShell}`}
      >
        <button type="button" className={`${styles.button} ${styles.mobileMenuButton}`} onClick={() => { setInspectorOpen(false); setMobileSidebarOpen(true); }} aria-label="Open Notes navigation">Menu</button>
        <button type="button" className={`${styles.button} ${styles.mobileInspectorButton}`} onClick={() => { setMobileSidebarOpen(false); setInspectorOpen(true); }} disabled={!currentNote}>Context</button>
        {(mobileSidebarOpen || (isInspectorOverlay && inspectorOpen)) && <button type="button" className={styles.scrim} onClick={() => { setMobileSidebarOpen(false); setInspectorOpen(false); }} aria-label="Close overlay" />}
        <div className={styles.mainScroll}>
          {initialLoadError ? (
            <SystemState variant="error" title="Note could not be loaded" description={initialLoadError} />
          ) : !currentNote ? (
            <SystemState variant="empty" title="Note not found" description="The requested Note is not available in the current adapter." />
          ) : (
            <>
              <header className={styles.editorHeader}>
                <div className={styles.editorHeadingRow}>
                  <div>
                    <span className={styles.eyebrow}>Personal Note</span>
                    <h1>{currentNote.title}</h1>
                    <p>Internal knowledge / {currentNote.areas[0] || "Unassigned"} / {displayLabel(currentNote.lifecycleStatus)}</p>
                    <div className={styles.stateChips}>
                      <span className={styles.stateChip} data-tone="blue">{TYPE_LABELS[currentNote.type]}</span>
                      <span className={styles.stateChip} data-tone={currentNote.lifecycleStatus === "active" ? "green" : "amber"}>{displayLabel(currentNote.lifecycleStatus)}</span>
                      <span className={styles.stateChip} data-tone={currentNote.reviewState === "needs_review" ? "pink" : "blue"}>{displayLabel(currentNote.reviewState)}</span>
                    </div>
                  </div>
                  <div className={styles.headerActions}>
                    <button type="button" className={styles.button} data-primary="true" onClick={() => void saveNote()} disabled={!editorDirty || saveState === "saving"}>{saveState === "saving" ? "Saving…" : "Save"}</button>
                    <button type="button" className={styles.button} aria-disabled="true" onClick={() => setNotice("Pinned state is not stored by the legacy Notes adapter.")}>Pin</button>
                    <button type="button" className={styles.button} aria-disabled="true" onClick={() => setNotice("Native NoteLink persistence is unresolved.")}>Link object</button>
                    <Link
                      className={styles.button}
                      href={decisionCandidateRoute(currentNote)}
                      aria-label={`Convert ${currentNote.title} to a Personal Ops decision candidate`}
                    >
                      Convert to decision
                    </Link>
                    <button type="button" className={styles.button} aria-disabled="true" onClick={() => setNotice("Review blockers are not available in the legacy adapter.")}>Mark reviewed</button>
                  </div>
                </div>
                <div className={styles.editorMeta}>
                  <div className={styles.fact}><span>Updated</span><strong>{formatDate(currentNote.updatedAt)}</strong></div>
                  <div className={styles.fact}><span>Next review</span><strong>{formatDate(currentNote.nextReviewAt)}</strong></div>
                  <div className={styles.fact}><span>Persistence</span><strong>Legacy adapter</strong></div>
                  <div className={styles.fact} data-mono="true"><span>UID</span><strong>{currentNote.uid}</strong></div>
                </div>
                <DetailTabs id={detailTabsId} tabs={DETAIL_TABS} activeTab={activeTab === "overview" ? "body" : activeTab} onTabChange={(tab) => { setActiveTab(tab as NotesTab); updateUrl({ tab: tab as NotesTab }); }} ariaLabel="Note detail tabs" />
              </header>

              {activeTab === "body" || activeTab === "overview" ? (
                <DetailTabPanel tabsId={detailTabsId} tabId="body" active>
                  <div className={styles.editorToolbar} role="toolbar" aria-label="Note formatting and object actions">
                    <span className={styles.eyebrow}>Format</span>
                    {[
                      ["B", "Rich-text bold is unavailable in the legacy plain-text adapter"],
                      ["I", "Rich-text italic is unavailable in the legacy plain-text adapter"],
                      ["H", "Structured headings are unavailable in the legacy plain-text adapter"],
                      ["Link object", "Native NoteLink persistence is unresolved"],
                      ["Attach", "Media upload and attachment relationships are not connected"],
                      ["Resource", "Resource creation requires native Resources persistence"]
                    ].map(([label, reason]) => <button type="button" className={styles.button} aria-disabled="true" onClick={() => setNotice(reason)} key={label}>{label}</button>)}
                    <Link
                      className={styles.button}
                      href={decisionCandidateRoute(currentNote)}
                      aria-label={`Create a Personal Ops decision candidate from ${currentNote.title}`}
                    >
                      Decision
                    </Link>
                    <span className={styles.saveState} data-state={saveState}>{saveState === "failed" ? "Save failed" : displayLabel(saveState)}</span>
                    <span className={styles.technicalRow}>legacy current revision</span>
                  </div>
                  {saveError && <p className={styles.errorBanner} role="alert">{saveError}</p>}
                  {notice && <p className={styles.successBanner} role="status">{notice}</p>}
                  <div className={styles.readOnlyNotice}><strong>Persistence boundary</strong><span>Explicit Save writes title and body through the current audited Personal Records API. Lifecycle is written only when its source is directly draft/active and you explicitly change it. Autosave, structured nodes, and version history remain intentionally unavailable.</span></div>
                  <form className={styles.editorSurface} onSubmit={(event) => { event.preventDefault(); void saveNote(); }}>
                    <label className={`${styles.editorField} ${styles.editorTitle}`}>
                      Editable title
                      <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} required />
                    </label>
                    <div className={styles.controlRow}>
                      {writableSelectedLifecycle ? (
                        <label className={styles.field}>Lifecycle<select value={draftLifecycle} onChange={(event) => setDraftLifecycle(event.target.value as NoteWritableLifecycleStatus)}><option value="draft">Draft</option><option value="active">Active</option></select></label>
                      ) : (
                        <label className={styles.field}>Lifecycle<input value={displayLabel(currentNote.lifecycleStatus)} readOnly aria-describedby="note-lifecycle-readonly" /></label>
                      )}
                      <label className={styles.field}>Type<input value={TYPE_LABELS[currentNote.type]} readOnly aria-describedby="note-type-readonly" /></label>
                      <span id="note-type-readonly" className={styles.readOnlyNotice}>Type changes are unavailable because the legacy PATCH API cannot round-trip them safely.</span>
                      {!writableSelectedLifecycle && <span id="note-lifecycle-readonly" className={styles.readOnlyNotice}>This lifecycle is inferred from legacy status {displayLabel(currentNote.provenance.status)}. Saving title or body preserves that source status.</span>}
                    </div>
                    <label className={`${styles.editorField} ${styles.editorBody}`}>
                      Body
                      <textarea value={draftBody} onChange={(event) => setDraftBody(event.target.value)} placeholder="Capture authored internal knowledge." />
                    </label>
                    <div className={styles.bodyBoundary}><strong>Source-safe editor</strong><span>Downstream objects are never created silently and the body is not rewritten by AI.</span></div>
                    <div className={styles.editorSaveRow}>
                      <Link href={getModuleRoute("notes")}>Back to All Notes</Link>
                      <button type="submit" className={styles.button} data-primary="true" disabled={!editorDirty || saveState === "saving"}>{saveState === "saving" ? "Saving…" : "Save Note"}</button>
                    </div>
                  </form>
                </DetailTabPanel>
              ) : activeTab === "links" ? (
                renderDetailLinksPanel(currentNote, detailTabsId)
              ) : activeTab === "review" ? (
                renderDetailReviewPanel(currentNote, detailTabsId)
              ) : (
                <DetailTabPanel tabsId={detailTabsId} tabId={activeTab} active>
                  <SystemState
                    variant="read_only"
                    title={`${DETAIL_TABS.find((tab) => tab.id === activeTab)?.label || "This tab"} is not connected yet`}
                    description="The approved route and tab are present, but this workflow depends on native links, versioned anchors, review blockers, or Media/Resource persistence that has not been approved. No static interaction is presented as functional."
                  />
                </DetailTabPanel>
              )}
            </>
          )}
        </div>
        <ConfirmationSheet
          open={confirmOpen}
          onOpenChange={(open) => { setConfirmOpen(open); if (!open) setPendingNavigation(null); }}
          onConfirm={() => void discardChanges()}
          title="Discard unsaved Note changes?"
          description="The current title, body, or lifecycle changes have not been written to the Personal Records adapter."
          consequences={["The stored Note remains unchanged.", "Only this unsaved editor draft will be discarded."]}
          confirmLabel="Discard changes"
          tone="danger"
        />
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      module="notes"
      sidebar={sidebar}
      inspector={inspector}
      aiDock={aiDock}
      mode="directory"
      ariaLabel="Notes directory"
      className={styles.shell}
    >
      <button type="button" className={`${styles.button} ${styles.mobileMenuButton}`} onClick={() => { setInspectorOpen(false); setMobileSidebarOpen(true); }} aria-label="Open Notes navigation">Menu</button>
      <button type="button" className={`${styles.button} ${styles.mobileInspectorButton}`} onClick={() => { setMobileSidebarOpen(false); setInspectorOpen(true); }} disabled={!selectedNote}>Preview</button>
      {(mobileSidebarOpen || (isInspectorOverlay && inspectorOpen)) && <button type="button" className={styles.scrim} onClick={() => { setMobileSidebarOpen(false); setInspectorOpen(false); }} aria-label="Close overlay" />}
      <DirectoryPane className={styles.directory} ariaLabel="Notes directory and capture">
        <div className={styles.mainScroll}>
          <header className={styles.directoryHeader}>
            <div><h1>{VIEW_LABELS[view]}</h1><p>{unavailableViewReason ? "View unavailable" : `${visibleNotes.length} shown`} · {notes.length} total internal knowledge {notes.length === 1 ? "object" : "objects"}</p></div>
            <div className={styles.headerActions}>
              <button type="button" className={styles.button} onClick={() => document.querySelector<HTMLElement>(`.${styles.chipRow}`)?.focus()}>Filter</button>
              <button type="button" className={styles.button} onClick={() => { const next = density === "compact" ? "comfortable" : "compact"; setDensity(next); updateUrl({ density: next }); }}>{density === "compact" ? "Comfortable" : "Compact"}</button>
              <button type="button" className={styles.button} data-primary="true" onClick={() => captureTitleRef.current?.focus()}>+ New Note</button>
            </div>
          </header>

          <label className={styles.search}>
            <span aria-hidden="true">/</span>
            <input value={query} onChange={(event) => { setQuery(event.target.value); updateUrl({ query: event.target.value }); }} placeholder="Search notes, people, resources, projects..." aria-label="Search Notes" />
            <kbd>{visibleNotes.length}</kbd>
          </label>

          <div className={styles.chipRow} tabIndex={-1} aria-label="Note filters">
            {FILTERS.map((item) => (
              <button
                type="button"
                className={styles.chip}
                data-tone={item.tone}
                data-active={filter === item.id || undefined}
                aria-disabled={Boolean(item.disabledReason) || undefined}
                aria-describedby={item.disabledReason ? `note-filter-${item.id}-reason` : undefined}
                title={item.disabledReason}
                onClick={() => {
                  if (item.disabledReason) {
                    setNotice(item.disabledReason);
                    return;
                  }
                  setFilter(item.id);
                  updateUrl({ filter: item.id });
                }}
                key={item.id}
              >{item.label}{item.disabledReason && <span id={`note-filter-${item.id}-reason`} className="sr-only">{item.disabledReason}</span>}</button>
            ))}
          </div>

          <form className={styles.capture} onSubmit={submitNote}>
            <div className={styles.captureHeader}>
              <div><span className={styles.eyebrow}>Quick capture</span><h2>Add internal note</h2></div>
              <button type="button" className={styles.button} aria-disabled="true" onClick={() => setNotice("Advanced native Note creation is not connected yet.")}>Advanced create</button>
            </div>
            <div className={styles.captureGrid}>
              <label className={styles.field}>Title<input ref={captureTitleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Decision, meeting, idea, or context" required /></label>
              <label className={styles.field}>Type<select value={noteType} onChange={(event) => setNoteType(event.target.value as LegacyWritableNoteType)}><option value="idea">Idea</option><option value="meeting">Meeting</option><option value="decision">Decision candidate</option></select></label>
              <label className={styles.field}>Lifecycle<select value={lifecycle} onChange={(event) => setLifecycle(event.target.value as NoteWritableLifecycleStatus)}><option value="draft">Draft</option><option value="active">Active</option></select></label>
            </div>
            <div className={styles.captureBody}>
              <label className={styles.field}>Context<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Capture context, next action, and why it matters." /></label>
              <button type="button" className={styles.button} aria-disabled="true" onClick={() => setNotice("Native NoteLink persistence is unresolved.")}>+ Link object</button>
              <button type="submit" className={styles.button} data-primary="true" disabled={captureSaving || !title.trim()}>{captureSaving ? "Saving…" : "Save Note"}</button>
            </div>
          </form>
          {captureError && <p className={styles.errorBanner} role="alert">{captureError}</p>}
          {notice && <p className={styles.successBanner} role="status">{notice}</p>}

          <div className={styles.sortRow}>
            <span>Sort</span>
            <label className={styles.field}>
              <span className="sr-only">Sort Notes</span>
              <select value={sort} onChange={(event) => { setSort(event.target.value as NotesSort); updateUrl({ sort: event.target.value as NotesSort }); }}>
                <option value="updated-desc">Recently updated</option>
                <option value="updated-asc">Oldest update</option>
                <option value="created-desc">Created date</option>
                <option value="title">Title</option>
                <option value="review">Next review</option>
              </select>
            </label>
            <strong>{unavailableViewReason ? "View unavailable" : `${visibleNotes.length} shown`}</strong>
          </div>

          {batchSelection.size > 0 && (
            <div className={styles.batchBar} role="toolbar" aria-label="Selected Notes actions">
              <strong>{batchSelection.size} selected</strong>
              <button type="button" className={styles.button} onClick={() => setBatchSelection(new Set())}>Clear</button>
              <button type="button" className={styles.button} aria-disabled="true" onClick={() => setNotice("Batch archive requires native archive and audit support.")}>Archive unavailable</button>
            </div>
          )}

          {initialLoadError ? (
            <SystemState variant="error" title="Notes could not be loaded" description={initialLoadError} />
          ) : unavailableViewReason ? (
            <SystemState variant="read_only" title="This Notes view is staged" description={unavailableViewReason} />
          ) : visibleNotes.length ? (
            <div className={styles.list} data-density={density} role="list" aria-label="Notes">
              {visibleNotes.map((note) => {
                const item = noteRecordToDirectoryItem(note);
                return (
                  <DenseObjectRow
                    id={note.id}
                    title={note.title}
                    description={`${TYPE_LABELS[note.type]} · ${displayLabel(note.lifecycleStatus)} · ${item.area || "Unassigned"}`}
                    metadata={`${item.bodyExcerpt} · updated ${formatDate(note.updatedAt)}`}
                    trailing={<><strong>{displayLabel(note.reviewState)}</strong><span>{note.nextReviewAt ? `Review ${formatDate(note.nextReviewAt)}` : "No review date"}</span></>}
                    selected={selectedNote?.id === note.id}
                    onSelect={() => selectNote(note.id)}
                    checkbox={{ checked: batchSelection.has(note.id), onCheckedChange: (checked) => setBatch(note.id, checked), label: `Select ${note.title} for batch actions` }}
                    key={note.id}
                  />
                );
              })}
            </div>
          ) : (
            <SystemState variant="empty" title={notes.length ? "No Notes match this view" : "No Notes yet"} description={notes.length ? "Adjust search, view, or filters without losing current directory state." : "Use Quick capture to create the first persisted internal Note."} />
          )}
        </div>
      </DirectoryPane>
    </ModuleShell>
  );
}
