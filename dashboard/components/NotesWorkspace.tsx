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
import LinkedFollowUpsPanel from "./operational/LinkedFollowUpsPanel";
import LinkedProjectsPanel from "./operational/LinkedProjectsPanel";
import { usePersonalOpsFollowUps } from "./operational/usePersonalOpsFollowUps";
import { useProjectsState } from "./operational/useProjectsState";
import NoteAttachmentsView, { NoteAttachmentInspector } from "./notes/NoteAttachmentsView";
import NoteDecisionsView from "./notes/NoteDecisionsView";
import NotePropertiesEditorSheet from "./notes/NotePropertiesEditorSheet";
import NotePropertiesView, { NotePropertiesSummary } from "./notes/NotePropertiesView";
import NoteReviewScheduleEditorSheet from "./notes/NoteReviewScheduleEditorSheet";
import {
  contentLinksForObject,
  contentTargetGroupsForObject,
  sameNativeObject,
  unresolvedReferencesForObject,
  type LegacyContentGraph,
  type LegacyUnresolvedReference
} from "../lib/modules/content-graph/types";
import { createNotesRepository } from "../lib/modules/notes/repository";
import { buildNoteAttachmentEvidence } from "../lib/modules/notes/attachment-evidence";
import {
  buildNotePropertyQueue,
  buildNotePropertyReadiness
} from "../lib/modules/notes/property-readiness";
import { formatNoteReviewCadence } from "../lib/modules/notes/review-schedule";
import type {
  NoteReferenceEvidenceIndex,
  NoteReferenceEvidenceRecord,
  NoteReferenceKnownOwnerModule
} from "../lib/modules/notes/reference-evidence";
import {
  buildNoteViewCounts,
  noteRecordToDirectoryItem
} from "../lib/modules/notes/view-model";
import type {
  LegacyWritableNoteType,
  NoteRecord,
  NoteWritableLifecycleStatus
} from "../lib/modules/notes/types";
import type { MediaAsset } from "../lib/modules/media/types";
import type {
  PersonalOpsDecision,
  PersonalOpsFollowUp,
  PersonalOpsLegacyMapping
} from "../lib/modules/personal-ops/types";
import {
  buildFollowUpCreationRoute,
  type FollowUpSourceRef
} from "../lib/modules/personal-ops/follow-up-links";
import { createProjectsRepository } from "../lib/modules/projects/repository";
import type {
  ProjectLinkRelationship,
  ProjectLinkStrength,
  ProjectsState
} from "../lib/modules/projects/types";
import type { ResourceRecord } from "../lib/modules/resources/types";
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
  referenceEvidence: NoteReferenceEvidenceIndex;
  initialProjectsState: ProjectsState;
  initialProjectsError?: string;
  initialMediaAssets: MediaAsset[];
  initialResources: ResourceRecord[];
  initialMode?: "index" | "detail";
  initialSelectedId?: string;
  initialLoadError?: string;
  initialPersonalOpsDecisions?: PersonalOpsDecision[];
  initialDecisionMappings?: PersonalOpsLegacyMapping[];
  initialDecisionLoadError?: string;
  initialPersonalOpsFollowUps?: PersonalOpsFollowUp[];
  initialFollowUpsError?: string;
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

type ProjectLinkDraft = {
  projectId: string;
  relationship: ProjectLinkRelationship;
  relationshipStrength: ProjectLinkStrength;
  projectSpecificNote: string;
  isRequiredEvidence: boolean;
};

const DEFAULT_PROJECT_LINK_DRAFT: ProjectLinkDraft = {
  projectId: "",
  relationship: "supporting_context",
  relationshipStrength: "normal",
  projectSpecificNote: "",
  isRequiredEvidence: false
};

const NOTE_PROJECT_RELATIONSHIPS: readonly {
  value: ProjectLinkRelationship;
  label: string;
}[] = [
  { value: "supporting_context", label: "Supporting context" },
  { value: "source_material", label: "Source material" },
  { value: "decision_support", label: "Decision support" },
  { value: "evidence", label: "Evidence" },
  { value: "background_reference", label: "Background reference" },
  { value: "review_input", label: "Review input" }
];

const NOTES_DIRTY_HISTORY_GUARD = "__unigentamos_notes_dirty_guard";
const NOTES_HISTORY_BACK_DESTINATION = "__notes_history_back__";
const NOTES_RECENT_WINDOW_DAYS = 30;
const NOTES_RECENT_WINDOW_MS = NOTES_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

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
  { id: "attachments", label: "Attachments" },
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
  "no-links": "No Link Evidence",
  decisions: "Decision Candidates",
  meetings: "Meetings",
  ideas: "Ideas",
  research: "Research",
  "personal-context": "Personal Context",
  "project-notes": "Project Notes",
  "missing-properties": "Missing Properties",
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
  { id: "linked", label: "Link evidence", tone: "blue" },
  { id: "no-links", label: "No link evidence", tone: "amber" },
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

function noteDecisionsRoute(note: NoteRecord) {
  const params = new URLSearchParams({ tab: "decisions" });
  return `${note.nativeRef.route}?${params.toString()}`;
}

function noteFollowUpSource(note: NoteRecord): FollowUpSourceRef {
  return {
    module: "notes",
    objectType: "note",
    objectId: note.id,
    label: note.title,
    route: note.nativeRef.route
  };
}

function noteFollowUpCreationRoute(note: NoteRecord) {
  return buildFollowUpCreationRoute(noteFollowUpSource(note), {
    dueAt: note.nextReviewAt
  });
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

function isRecentNote(note: NoteRecord, now = Date.now()) {
  if (note.lifecycleStatus === "archived") return false;
  const updatedAt = new Date(note.updatedAt).getTime();
  return Number.isFinite(updatedAt) && updatedAt >= now - NOTES_RECENT_WINDOW_MS;
}

function ownerModuleForView(view: NotesView): NoteReferenceKnownOwnerModule | null {
  if (view === "linked-people") return "people";
  if (view === "linked-projects") return "projects";
  if (view === "linked-finance") return "finance";
  if (view === "linked-resources") return "resources";
  if (view === "linked-reviews") return "reviews";
  return null;
}

function emptyReferenceEvidence(noteId: string): NoteReferenceEvidenceRecord {
  return {
    noteId,
    placements: [],
    ownerModules: [],
    unresolvedReferenceCount: 0,
    hasConnectedEvidence: false
  };
}

function matchesView(
  note: NoteRecord,
  view: NotesView,
  reference: NoteReferenceEvidenceRecord | null,
  now = Date.now()
) {
  if (view === "all") return note.lifecycleStatus !== "archived";
  if (view === "recent") return isRecentNote(note, now);
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
  if (view === "missing-properties") return buildNotePropertyReadiness(note).requiresAttention;
  const ownerModule = ownerModuleForView(view);
  if (ownerModule) {
    return (
      note.lifecycleStatus !== "archived" &&
      Boolean(reference?.placements.some((placement) => placement.ownerModule === ownerModule))
    );
  }
  if (view === "no-links") {
    return Boolean(
      note.lifecycleStatus !== "archived" &&
      reference &&
      reference.placements.length === 0 &&
      reference.unresolvedReferenceCount === 0
    );
  }
  return false;
}

function viewUnavailable(view: NotesView, referenceEvidence: NoteReferenceEvidenceIndex) {
  if (view === "pinned") return "Pinned state is not stored by the legacy Notes adapter.";
  const ownerModule = ownerModuleForView(view);
  if (ownerModule) {
    const coverage = referenceEvidence.coverage.find((entry) => entry.ownerModule === ownerModule);
    if (coverage?.state === "read_failed") {
      return coverage.error || `${displayLabel(ownerModule)} references could not be loaded.`;
    }
    if (coverage?.state === "disconnected") {
      return coverage.error || `${displayLabel(ownerModule)} reference indexing is not connected.`;
    }
  }
  return "";
}

function matchesFilter(
  note: NoteRecord,
  filter: NotesFilter,
  reference: NoteReferenceEvidenceRecord | null
) {
  if (filter === "all") return true;
  if (filter === "active") return note.lifecycleStatus === "active";
  if (filter === "needs-review") return note.reviewState === "needs_review";
  if (filter === "linked") return Boolean(reference?.hasConnectedEvidence);
  if (filter === "no-links") {
    return Boolean(
      reference &&
      reference.placements.length === 0 &&
      reference.unresolvedReferenceCount === 0
    );
  }
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
  return tab;
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
  referenceEvidence,
  initialProjectsState,
  initialProjectsError = "",
  initialMediaAssets,
  initialResources,
  initialMode = "index",
  initialSelectedId,
  initialLoadError = "",
  initialPersonalOpsDecisions = [],
  initialDecisionMappings = [],
  initialDecisionLoadError = "",
  initialPersonalOpsFollowUps = [],
  initialFollowUpsError = ""
}: NotesWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const repository = useMemo(() => createNotesRepository(), []);
  const projectsRepository = useMemo(() => createProjectsRepository(), []);
  const [firstUrlState] = useState(() => parseNotesUrlState(searchParams));
  const [recentReferenceTime] = useState(() => Date.now());
  const [notes, setNotes] = useState(initialNotes);
  const [personalOpsDecisions, setPersonalOpsDecisions] = useState(initialPersonalOpsDecisions);
  const [decisionMappings, setDecisionMappings] = useState(initialDecisionMappings);
  const {
    followUps,
    error: followUpsError,
    loading: followUpsLoading,
    refresh: refreshFollowUps
  } = usePersonalOpsFollowUps(initialPersonalOpsFollowUps, initialFollowUpsError);
  const {
    state: projectsState,
    error: projectsError,
    loading: projectsLoading,
    refresh: refreshProjects
  } = useProjectsState(initialProjectsState, initialProjectsError);
  const [query, setQuery] = useState(firstUrlState.query);
  const [view, setView] = useState<NotesView>(firstUrlState.view);
  const [filter, setFilter] = useState<NotesFilter>(firstUrlState.filter);
  const [sort, setSort] = useState<NotesSort>(firstUrlState.sort);
  const [density, setDensity] = useState(firstUrlState.density);
  const [selectedId, setSelectedId] = useState(initialSelectedId || firstUrlState.note || initialNotes[0]?.id || "");
  const [selectedAttachmentItemId, setSelectedAttachmentItemId] = useState(firstUrlState.item);
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
  const [propertyEditorNoteId, setPropertyEditorNoteId] = useState<string | null>(null);
  const [reviewScheduleEditorNoteId, setReviewScheduleEditorNoteId] = useState<string | null>(null);
  const [projectLinkDraft, setProjectLinkDraft] = useState<ProjectLinkDraft>(DEFAULT_PROJECT_LINK_DRAFT);
  const [projectLinkSaving, setProjectLinkSaving] = useState(false);
  const [projectLinkError, setProjectLinkError] = useState("");
  const [projectLinkNotice, setProjectLinkNotice] = useState("");
  const [captureFocusRequested, setCaptureFocusRequested] = useState(false);
  const captureTitleRef = useRef<HTMLInputElement>(null);
  const projectLinkFormRef = useRef<HTMLFormElement>(null);
  const dirtyHistoryGuardRef = useRef<string | null>(null);
  const suppressDirtyPopRef = useRef(false);
  const isInspectorOverlay = useMediaQuery("(max-width: 1240px)");
  const searchParamKey = searchParams.toString();

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) || null,
    [notes, selectedId]
  );
  const propertyEditorNote = useMemo(
    () => notes.find((note) => note.id === propertyEditorNoteId) || null,
    [notes, propertyEditorNoteId]
  );
  const reviewScheduleEditorNote = useMemo(
    () => notes.find((note) => note.id === reviewScheduleEditorNoteId) || null,
    [notes, reviewScheduleEditorNoteId]
  );
  const selectedAttachmentEvidence = useMemo(
    () => selectedNote
      ? buildNoteAttachmentEvidence({
          note: selectedNote,
          graph: contentGraph,
          mediaAssets: initialMediaAssets,
          resources: initialResources
        })
      : null,
    [contentGraph, initialMediaAssets, initialResources, selectedNote]
  );
  const selectedAttachmentItem = useMemo(
    () => selectedAttachmentEvidence?.items.find((item) => item.id === selectedAttachmentItemId) || null,
    [selectedAttachmentEvidence, selectedAttachmentItemId]
  );
  const attachmentEvidenceKey = selectedAttachmentEvidence?.items.map((item) => item.id).join("|") || "";
  const writableSelectedLifecycle = selectedNote ? writableLifecycleFor(selectedNote) : null;
  const linkableProjects = useMemo(
    () => projectsState.projects
      .filter((project) => !["complete", "archived"].includes(project.lifecycle))
      .sort((left, right) => {
        const activeDelta =
          Number(right.lifecycle === "active") - Number(left.lifecycle === "active");
        return activeDelta || left.name.localeCompare(right.name);
      }),
    [projectsState.projects]
  );
  const counts = useMemo(() => buildNoteViewCounts(notes), [notes]);
  const referenceEvidenceByNoteId = useMemo(
    () => new Map(referenceEvidence.records.map((record) => [record.noteId, record] as const)),
    [referenceEvidence.records]
  );
  const propertyQueue = useMemo(() => buildNotePropertyQueue(notes), [notes]);
  const selectedPropertyReadiness = useMemo(
    () => selectedNote ? buildNotePropertyReadiness(selectedNote) : null,
    [selectedNote]
  );
  const unavailableViewReason = viewUnavailable(view, referenceEvidence);
  const visibleNotes = useMemo(
    () => sortNotes(
      notes.filter((note) => {
        const reference =
          referenceEvidenceByNoteId.get(note.id) || emptyReferenceEvidence(note.id);
        return (
          matchesView(note, view, reference, recentReferenceTime) &&
          matchesFilter(note, filter, reference) &&
          matchesQuery(note, query)
        );
      }),
      sort
    ),
    [filter, notes, query, recentReferenceTime, referenceEvidenceByNoteId, sort, view]
  );
  const visiblePropertyQueue = useMemo(
    () => buildNotePropertyQueue(visibleNotes),
    [visibleNotes]
  );
  const referenceViewOwnerModule = ownerModuleForView(view);
  const isReferenceEvidenceView = Boolean(referenceViewOwnerModule) || view === "no-links";
  const visibleReferenceRecords = visibleNotes.map(
    (note) => referenceEvidenceByNoteId.get(note.id) || emptyReferenceEvidence(note.id)
  );
  const visibleReferenceCount = visibleReferenceRecords.reduce(
    (total, record) =>
      total +
      record.placements.filter(
        (placement) =>
          !referenceViewOwnerModule || placement.ownerModule === referenceViewOwnerModule
      ).length,
    0
  );
  const visibleUnresolvedReferenceCount = visibleReferenceRecords.reduce(
    (total, record) => total + record.unresolvedReferenceCount,
    0
  );
  const coverageGapCount = referenceEvidence.coverage.filter(
    (entry) => entry.state !== "indexed"
  ).length;

  useEffect(() => {
    const next = parseNotesUrlState(searchParams);
    setQuery(next.query);
    setView(next.view);
    setFilter(next.filter);
    setSort(next.sort);
    setDensity(next.density);
    setAiOpen(next.ai);
    setSelectedAttachmentItemId(next.item);
    if (!initialSelectedId) setSelectedId(next.note || initialNotes[0]?.id || "");
    setActiveTab(initialMode === "detail" && next.tab === "overview" ? "body" : next.tab);
    if (initialMode === "index") setInspectorTab(inspectorTabFor(next.tab));
  }, [initialMode, initialSelectedId, searchParamKey]);

  useEffect(() => {
    if (activeTab !== "attachments" || !selectedAttachmentEvidence) return;
    const nextItemId = selectedAttachmentEvidence.items.some((item) => item.id === selectedAttachmentItemId)
      ? selectedAttachmentItemId
      : selectedAttachmentEvidence.items[0]?.id || "";
    if (nextItemId === selectedAttachmentItemId) return;
    setSelectedAttachmentItemId(nextItemId);
    updateUrl({ item: nextItemId }, { history: "replace" });
  }, [activeTab, attachmentEvidenceKey, selectedAttachmentItemId]);

  useEffect(() => {
    if (!selectedNote) return;
    setDraftTitle(selectedNote.title);
    setDraftBody(selectedNote.body);
    setDraftLifecycle(writableLifecycleFor(selectedNote) || "active");
    setSaveState("saved");
    setSaveError("");
    setProjectLinkDraft(DEFAULT_PROJECT_LINK_DRAFT);
    setProjectLinkError("");
    setProjectLinkNotice("");
  }, [selectedNote?.id]);

  useEffect(() => {
    if (!captureFocusRequested || view !== "all") return;
    captureTitleRef.current?.focus();
    setCaptureFocusRequested(false);
  }, [captureFocusRequested, view]);

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
        item: selectedAttachmentItemId,
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
    setSelectedAttachmentItemId("");
    setInspectorOpen(true);
    setInspectorTab("overview");
    setActiveTab("overview");
    updateUrl({ note: id, tab: "overview", item: "" }, { history: "push" });
  }

  function selectDirectoryView(nextView: NotesView, reason = "") {
    setView(nextView);
    setFilter("all");
    setNotice(reason);
    updateUrl(
      { view: nextView, filter: "all", tab: "overview" },
      {
        path: getModuleRoute("notes"),
        history: "push"
      }
    );
  }

  function openQuickCapture() {
    if (view === "all") {
      captureTitleRef.current?.focus();
      return;
    }
    setCaptureFocusRequested(true);
    selectDirectoryView("all");
  }

  function setBatch(id: string, checked: boolean) {
    setBatchSelection((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openPropertyEditor(note: NoteRecord | null) {
    if (!note) return;
    setAiOpen(false);
    setPropertyEditorNoteId(note.id);
    if (aiOpen) updateUrl({ ai: false });
  }

  function handlePropertiesSaved(savedNote: NoteRecord) {
    setNotes((current) =>
      current.map((note) => note.id === savedNote.id ? savedNote : note)
    );
    setPropertyEditorNoteId(null);
    setNotice("Note routing properties saved through the audited Personal Records adapter.");
  }

  function openReviewScheduleEditor(note: NoteRecord | null) {
    if (!note) return;
    setAiOpen(false);
    setReviewScheduleEditorNoteId(note.id);
    if (aiOpen) updateUrl({ ai: false });
  }

  function handleReviewScheduleSaved(savedNote: NoteRecord) {
    setNotes((current) =>
      current.map((note) => note.id === savedNote.id ? savedNote : note)
    );
    setReviewScheduleEditorNoteId(null);
    setNotice(
      savedNote.nextReviewAt
        ? "Note review schedule saved through the audited Personal Records adapter."
        : "Note review schedule removed through the audited Personal Records adapter."
    );
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
  const projectLinkDraftDirty = Boolean(
    initialMode === "detail" && (
      projectLinkDraft.projectId ||
      projectLinkDraft.relationship !== DEFAULT_PROJECT_LINK_DRAFT.relationship ||
      projectLinkDraft.relationshipStrength !== DEFAULT_PROJECT_LINK_DRAFT.relationshipStrength ||
      projectLinkDraft.projectSpecificNote.trim() ||
      projectLinkDraft.isRequiredEvidence
    )
  );
  const workspaceDirty = editorDirty || projectLinkDraftDirty;

  useEffect(() => {
    if (!editorDirty) {
      if (!workspaceDirty && dirtyHistoryGuardRef.current) void releaseDirtyHistoryGuard();
      if (saveState !== "saving" && saveState !== "saved") setSaveState("saved");
      if (saveError) setSaveError("");
      return;
    }
    if (saveState !== "failed" && saveState !== "saving") setSaveState("unsaved");
  }, [draftBody, draftLifecycle, draftTitle, editorDirty, workspaceDirty]);

  useEffect(() => {
    if (!workspaceDirty) return;
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
  }, [workspaceDirty]);

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

  async function submitProjectAssociation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedNote || projectLinkSaving) return;
    const project = linkableProjects.find((item) => item.id === projectLinkDraft.projectId);
    if (!project) {
      setProjectLinkError("Choose an active or planned Project before creating this association.");
      return;
    }

    setProjectLinkSaving(true);
    setProjectLinkError("");
    setProjectLinkNotice("");
    const result = await projectsRepository.create("links", {
      projectId: project.id,
      source: selectedNote.nativeRef,
      relationship: projectLinkDraft.relationship,
      relationshipStrength: projectLinkDraft.relationshipStrength,
      isRequiredEvidence: projectLinkDraft.isRequiredEvidence,
      projectSpecificNote: projectLinkDraft.projectSpecificNote.trim() || undefined
    });
    if (!result.ok) {
      setProjectLinkSaving(false);
      setProjectLinkError(
        `${result.error.message} Your Project-association draft was preserved.`
      );
      return;
    }

    setProjectLinkDraft(DEFAULT_PROJECT_LINK_DRAFT);
    setProjectLinkNotice(
      result.data.created
        ? `Linked this Note to ${result.data.project.name}. Projects now owns the association and its lifecycle.`
        : `This exact ${displayLabel(result.data.item.relationship)} association already exists in ${result.data.project.name}; no duplicate was created.`
    );
    await refreshProjects();
    router.refresh();
    setProjectLinkSaving(false);
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
    setProjectLinkDraft(DEFAULT_PROJECT_LINK_DRAFT);
    setProjectLinkError("");
    setProjectLinkNotice("");
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
    if (item === "missing-properties") return counts.missingProperties;
    if (
      item === "recent" ||
      item === "no-links" ||
      ownerModuleForView(item)
    ) {
      if (viewUnavailable(item, referenceEvidence)) return undefined;
      return notes.filter((note) =>
        matchesView(
          note,
          item,
          referenceEvidenceByNoteId.get(note.id) || emptyReferenceEvidence(note.id),
          recentReferenceTime
        )
      ).length;
    }
    return undefined;
  };

  const sidebarSections: ModuleSidebarSection[] = [
    {
      id: "notes",
      label: "Notes",
      items: [
        ["all", "All Notes"], ["recent", "Recent"], ["pinned", "Pinned"], ["active", "Active"],
        ["needs-review", "Needs Review"], ["drafts", "Drafts"]
      ].map(([id, label]) => {
        const reason = viewUnavailable(id as NotesView, referenceEvidence);
        return {
          id,
          label,
          count: getViewCount(id as NotesView),
          active: view === id,
          disabled: Boolean(reason),
          disabledReason: reason || undefined,
          onSelect: reason ? undefined : () => selectDirectoryView(id as NotesView)
        };
      })
    },
    {
      id: "smart",
      label: "Smart Views",
      items: [
        ["linked-people", "Linked to People"], ["linked-projects", "Linked to Projects"],
        ["linked-finance", "Linked to Finance"], ["linked-resources", "Linked to Resources"],
        ["linked-reviews", "Linked to Reviews"], ["no-links", "No Links"]
      ].map(([id, label]) => {
        const reason = viewUnavailable(id as NotesView, referenceEvidence);
        return {
          id,
          label: id === "no-links" ? "No Link Evidence" : label,
          count: getViewCount(id as NotesView),
          active: view === id,
          disabled: Boolean(reason),
          disabledReason: reason || undefined,
          onSelect: reason ? undefined : () => selectDirectoryView(id as NotesView)
        };
      })
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
        {
          id: "missing-properties",
          label: "Missing Properties",
          count: counts.missingProperties,
          active: view === "missing-properties",
          onSelect: () => selectDirectoryView("missing-properties")
        },
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
      footer={<p className={styles.sidebarFootnote}>Legacy Notes adapter · 30-day Recent view · owner references indexed read-only · native NoteLinks and versions pending</p>}
    />
  );

  const aiDock = propertyEditorNoteId || reviewScheduleEditorNoteId ? null : (
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

  function propertyContextFor(note: NoteRecord) {
    const sourceCandidateCount =
      Number(Boolean(note.legacySources.sourceUrl)) + note.legacySources.externalSources.length;
    return {
      retainedRelationCount: relationCount(note),
      sourceCandidateCount,
      resolvedOwnerTargetCount: contentTargetGroupsForObject(contentGraph, note.nativeRef).length,
      unresolvedReferenceCount: unresolvedReferencesForObject(contentGraph, note.nativeRef).length
    };
  }

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
    const projectLinks = projectsState.links.filter(
      (link) =>
        link.linkState !== "removed" &&
        link.source.module === note.nativeRef.module &&
        link.source.objectType === note.nativeRef.objectType &&
        link.source.objectId === note.nativeRef.objectId &&
        (link.source.containerObjectId || "") === (note.nativeRef.containerObjectId || "")
    );
    const existingDraftLink = projectLinks.find(
      (link) =>
        link.projectId === projectLinkDraft.projectId &&
        link.relationship === projectLinkDraft.relationship
    );

    return (
      <DetailTabPanel tabsId={tabsId} tabId="links" active>
        <div className={styles.overviewGrid}>
          <section className={styles.panel} data-wide="true">
            <MetricStrip
              ariaLabel="Note link evidence summary"
              items={[
                { id: "url", label: "Exact normalized URL candidates", value: exactUrlCandidates.length },
                { id: "id", label: "Exact ID candidates", value: exactIdCandidates.length },
                { id: "persisted", label: "Projects-owned links", value: projectLinks.length, tone: projectLinks.length ? "positive" : "attention" },
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
              <div>
                <h2>Project associations</h2>
                <p>Exact, typed ProjectLink records that point back to this Notes-owned object.</p>
              </div>
              <strong>{projectLinks.length}</strong>
            </div>
            <LinkedProjectsPanel
              source={note.nativeRef}
              sourceLabel={note.title}
              state={projectsState}
              loading={projectsLoading}
              error={projectsError}
              onRefresh={refreshProjects}
              manageLifecycle
              legacyProjectLabels={note.projects}
              legacyLabel="Legacy Note routing labels, not stable links:"
              title="Projects using this Note"
              ownerTab="notes-decisions"
              emptyDescription="No active Projects-owned association points to this Note yet."
              boundary="Notes owns the title, body, review timing, and legacy routing labels. Projects owns relationship semantics, evidence flags, and association lifecycle."
              limit={8}
            />
          </section>

          <section className={styles.panel} data-wide="true">
            <form
              ref={projectLinkFormRef}
              className={styles.projectAssociationForm}
              data-project-link-editor={note.id}
              onSubmit={(event) => void submitProjectAssociation(event)}
            >
              <div className={styles.panelHeader}>
                <div>
                  <h2>Associate with a Project</h2>
                  <p>Create one protected ProjectLink without copying or changing this Note.</p>
                </div>
                <span className={styles.stateChip} data-tone="blue">Projects-owned write</span>
              </div>
              {projectLinkError && <p className={styles.errorBanner} role="alert">{projectLinkError}</p>}
              {projectLinkNotice && <p className={styles.successBanner} role="status">{projectLinkNotice}</p>}
              <div className={styles.projectAssociationGrid}>
                <label className={styles.field}>
                  Destination Project
                  <select
                    aria-label="Destination Project"
                    value={projectLinkDraft.projectId}
                    onChange={(event) => {
                      setProjectLinkDraft((current) => ({ ...current, projectId: event.target.value }));
                      setProjectLinkError("");
                      setProjectLinkNotice("");
                    }}
                    disabled={projectLinkSaving || !linkableProjects.length}
                    required
                  >
                    <option value="">Choose a Project</option>
                    {linkableProjects.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.name} · {displayLabel(project.lifecycle)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Relationship
                  <select
                    aria-label="Project relationship"
                    value={projectLinkDraft.relationship}
                    onChange={(event) => {
                      setProjectLinkDraft((current) => ({
                        ...current,
                        relationship: event.target.value as ProjectLinkRelationship
                      }));
                      setProjectLinkError("");
                      setProjectLinkNotice("");
                    }}
                    disabled={projectLinkSaving}
                  >
                    {NOTE_PROJECT_RELATIONSHIPS.map((relationship) => (
                      <option value={relationship.value} key={relationship.value}>
                        {relationship.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Relationship strength
                  <select
                    aria-label="Relationship strength"
                    value={projectLinkDraft.relationshipStrength}
                    onChange={(event) => setProjectLinkDraft((current) => ({
                      ...current,
                      relationshipStrength: event.target.value as ProjectLinkStrength
                    }))}
                    disabled={projectLinkSaving}
                  >
                    <option value="weak">Weak</option>
                    <option value="normal">Normal</option>
                    <option value="strong">Strong</option>
                  </select>
                </label>
                <label className={styles.projectAssociationCheckbox}>
                  <input
                    type="checkbox"
                    checked={projectLinkDraft.isRequiredEvidence}
                    onChange={(event) => setProjectLinkDraft((current) => ({
                      ...current,
                      isRequiredEvidence: event.target.checked
                    }))}
                    disabled={projectLinkSaving}
                  />
                  <span>
                    <strong>Required evidence</strong>
                    <small>The Project cannot treat this as optional context.</small>
                  </span>
                </label>
              </div>
              <label className={styles.field}>
                Project-specific context
                <textarea
                  aria-label="Project-specific context"
                  value={projectLinkDraft.projectSpecificNote}
                  onChange={(event) => setProjectLinkDraft((current) => ({
                    ...current,
                    projectSpecificNote: event.target.value
                  }))}
                  placeholder="Why this Note matters to this Project. The text is stored with the ProjectLink, not in the Note body."
                  disabled={projectLinkSaving}
                />
              </label>
              {existingDraftLink && (
                <div className={styles.readOnlyNotice}>
                  <strong>Exact association already present</strong>
                  <span>
                    This Project already has a {displayLabel(existingDraftLink.relationship)} link to this Note. Submitting will verify the idempotent owner record instead of creating a duplicate.
                  </span>
                </div>
              )}
              {!linkableProjects.length && (
                <SystemState
                  variant={projectsError ? "error" : "empty"}
                  compact
                  title={projectsError ? "Projects are unavailable" : "No linkable native Projects"}
                  description={projectsError || "Create or promote a Project before associating this Note. Completed and archived Projects remain read-only."}
                />
              )}
              <div className={styles.sourceBoundary}>
                <strong>Ownership boundary</strong>
                <span>
                  This action writes only a Projects-owned ProjectLink through the existing protected API. It does not alter the Note, create a second Note, or convert legacy project labels.
                </span>
              </div>
              <div className={styles.projectAssociationActions}>
                <Link className={styles.linkButton} href={getModuleRoute("projects")}>Open Projects directory</Link>
                <button
                  type="submit"
                  className={styles.button}
                  data-primary="true"
                  disabled={projectLinkSaving || !linkableProjects.length || !projectLinkDraft.projectId}
                >
                  {projectLinkSaving
                    ? "Associating…"
                    : existingDraftLink
                      ? "Verify existing association"
                      : "Create Project association"}
                </button>
              </div>
            </form>
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
                {
                  id: "link-project",
                  label: "Associate Project",
                  intent: "primary",
                  onSelect: () => {
                    projectLinkFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    projectLinkFormRef.current?.querySelector<HTMLSelectElement>("select")?.focus();
                  }
                },
                { id: "link", label: "Link other object", disabled: true, disabledReason: "Native NoteLink persistence and relationship provenance are not connected for non-Project objects." },
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

  function renderDetailAttachmentsPanel(note: NoteRecord, tabsId: string) {
    const evidence = selectedAttachmentEvidence || buildNoteAttachmentEvidence({
      note,
      graph: contentGraph,
      mediaAssets: initialMediaAssets,
      resources: initialResources
    });

    return (
      <DetailTabPanel tabsId={tabsId} tabId="attachments" active>
        <NoteAttachmentsView
          evidence={evidence}
          selectedItemId={selectedAttachmentItemId}
          onSelectItem={(itemId) => {
            setSelectedAttachmentItemId(itemId);
            setInspectorTab("attachments");
            setInspectorOpen(true);
            updateUrl({ tab: "attachments", item: itemId }, { history: "push" });
          }}
        />
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
    const durableDecisionMapping = decisionMappings.find(
      (mapping) =>
        mapping.family === "decisions" &&
        mapping.legacyPersonalRecordId === note.provenance.recordId
    );
    const durableDecision = personalOpsDecisions.find(
      (decision) =>
        decision.id === durableDecisionMapping?.nativeRef.objectId ||
        decision.sourceRefs.some(
          (reference) => reference.module === "notes" && reference.objectId === note.id
        )
    );
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
        detail: durableDecision
          ? `Durable Personal Ops Decision “${durableDecision.title}” is linked through current native state.`
          : durableDecisionMapping
            ? "The conversion mapping is present, but its Personal Ops Decision target is missing and needs repair."
            : "No durable Personal Ops Decision has been filed from this candidate.",
        required: true,
        complete: Boolean(durableDecision),
        href: durableDecisionMapping && durableDecision?.id === durableDecisionMapping.nativeRef.objectId
          ? durableDecisionMapping.nativeRef.route
          : noteDecisionsRoute(note),
        actionLabel: durableDecision ? "Open Decision" : "Review candidate"
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
        detail: note.reviewCadence ? `${formatNoteReviewCadence(note.reviewCadence)} cadence is stored as ${note.reviewCadence}.` : "No recurring cadence is stored.",
        required: false,
        complete: Boolean(note.reviewCadence)
      }
    );

    const requiredChecks = checks.filter((check) => check.required);
    const blockers = requiredChecks.filter((check) => !check.complete);
    const completedRequired = requiredChecks.length - blockers.length;
    const decisionAction = note.type === "decision"
      ? [{
          id: "decision",
          label: durableDecision ? "Open durable Decision" : "Review Decision candidate",
          href: durableDecisionMapping && durableDecision?.id === durableDecisionMapping.nativeRef.objectId
            ? durableDecisionMapping.nativeRef.route
            : noteDecisionsRoute(note)
        }]
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
              <div className={styles.fact}><span>Review cadence</span><strong>{note.nextReviewAt ? formatNoteReviewCadence(note.reviewCadence) : "Not scheduled"}</strong></div>
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
                {
                  id: "schedule-review",
                  label: note.nextReviewAt ? "Edit review schedule" : "Schedule review",
                  onSelect: () => openReviewScheduleEditor(note),
                  intent: "primary"
                },
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

  function renderDetailPropertiesPanel(note: NoteRecord, tabsId: string) {
    const readiness = buildNotePropertyReadiness(note);
    return (
      <DetailTabPanel tabsId={tabsId} tabId="properties" active>
        <NotePropertiesView
          note={note}
          readiness={readiness}
          context={propertyContextFor(note)}
          onOpenTab={(tab) => {
            setActiveTab(tab);
            updateUrl({ tab });
          }}
          onEditProperties={() => openPropertyEditor(note)}
          onScheduleReview={() => openReviewScheduleEditor(note)}
        />
      </DetailTabPanel>
    );
  }

  function renderDetailDecisionsPanel(note: NoteRecord, tabsId: string) {
    return (
      <DetailTabPanel tabsId={tabsId} tabId="decisions" active>
        <div className={styles.followUpStack}>
          <NoteDecisionsView
            note={note}
            decisions={personalOpsDecisions}
            mappings={decisionMappings}
            loadError={initialDecisionLoadError}
            onConverted={(decision, mapping) => {
              setPersonalOpsDecisions((current) => [
                decision,
                ...current.filter((item) => item.id !== decision.id)
              ]);
              if (mapping) {
                setDecisionMappings((current) => [
                  mapping,
                  ...current.filter((item) => item.id !== mapping.id)
                ]);
              }
            }}
          />
          <LinkedFollowUpsPanel
            source={noteFollowUpSource(note)}
            followUps={followUps}
            loading={followUpsLoading}
            error={followUpsError}
            onRefresh={() => void refreshFollowUps()}
            createHref={noteFollowUpCreationRoute(note)}
            title="Note follow-through"
          />
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

  const inspectorDisplayTab =
    initialMode === "detail" && (
      activeTab === "properties" ||
      activeTab === "decisions" ||
      activeTab === "attachments"
    )
      ? activeTab
      : inspectorTab;

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

    if (inspectorDisplayTab === "properties" && selectedPropertyReadiness) {
      const propertiesAreOpen = initialMode === "detail" && activeTab === "properties";
      return (
        <DetailTabPanel tabsId={`note-home-${selectedNote.id}`} tabId="properties" active>
          <NotePropertiesSummary
            note={selectedNote}
            readiness={selectedPropertyReadiness}
            context={propertyContextFor(selectedNote)}
            onEditProperties={() => openPropertyEditor(selectedNote)}
            onOpenProperties={propertiesAreOpen
              ? undefined
              : () => {
                  router.push(
                    destinationFor(
                      { tab: "properties", note: "" },
                      { path: selectedNote.nativeRef.route }
                    )
                  );
                }}
          />
        </DetailTabPanel>
      );
    }

    if (inspectorDisplayTab === "decisions") {
      const mapping = decisionMappings.find(
        (item) =>
          item.family === "decisions" &&
          item.legacyPersonalRecordId === selectedNote.provenance.recordId
      );
      const decision = personalOpsDecisions.find(
        (item) =>
          item.id === mapping?.nativeRef.objectId ||
          item.sourceRefs.some(
            (reference) => reference.module === "notes" && reference.objectId === selectedNote.id
          )
      );
      const candidateOpen = selectedNote.type === "decision" && !decision;
      return (
        <DetailTabPanel tabsId={`note-home-${selectedNote.id}`} tabId="decisions" active>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.eyebrow}>Decision candidate inspector</span>
                  <h2>{decision?.title || selectedNote.title}</h2>
                </div>
                <span className={styles.stateChip} data-tone={decision ? "green" : candidateOpen ? "amber" : "blue"}>
                  {decision ? displayLabel(decision.decisionState) : candidateOpen ? "Candidate" : "No candidate"}
                </span>
              </div>
              <div className={styles.factGrid}>
                <div className={styles.fact}><span>Type</span><strong>{decision ? "Durable Decision" : TYPE_LABELS[selectedNote.type]}</strong></div>
                <div className={styles.fact}><span>Status</span><strong>{decision ? displayLabel(decision.decisionState) : candidateOpen ? "Open candidate" : "Not present"}</strong></div>
                <div className={styles.fact}><span>Destination</span><strong>Personal Ops / Decisions</strong></div>
                <div className={styles.fact}><span>Source</span><strong>Note body</strong></div>
                <div className={styles.fact}><span>Owner</span><strong>{decision?.owner || "You"}</strong></div>
                <div className={styles.fact}><span>Provenance</span><strong>{mapping || selectedNote.provenance.recordId ? "Linked" : "Open"}</strong></div>
              </div>
            </section>
            <section className={styles.panel} data-wide="true">
              <h2>Why this matters</h2>
              <p>
                Filing a structured Decision preserves the question, proposed outcome, and rationale without changing the authored Note that supplied the context.
              </p>
            </section>
            <section className={styles.panel} data-wide="true" data-ai-safe="true">
              <h2>Conversion actions</h2>
              <QuickActionBar
                actions={[
                  decision
                    ? {
                        id: "open",
                        label: "Open durable Decision",
                        href: getNativeObjectRoute({
                          module: "personal_ops",
                          objectType: "decision",
                          objectId: decision.id
                        }),
                        intent: "primary"
                      }
                    : {
                        id: "file",
                        label: "Review filing form",
                        href: noteDecisionsRoute(selectedNote),
                        intent: "primary"
                      },
                  {
                    id: "follow-up",
                    label: "Create Follow-up",
                    href: noteFollowUpCreationRoute(selectedNote)
                  },
                  {
                    id: "review-link",
                    label: "Attach Review",
                    disabled: true,
                    disabledReason: "Native Review context-link persistence is not connected."
                  }
                ]}
              />
            </section>
            <LinkedFollowUpsPanel
              source={noteFollowUpSource(selectedNote)}
              followUps={followUps}
              loading={followUpsLoading}
              error={followUpsError}
              onRefresh={() => void refreshFollowUps()}
              createHref={noteFollowUpCreationRoute(selectedNote)}
              className={styles.panel}
              wide
              title="Note follow-through"
            />
            <section className={styles.panel} data-wide="true">
              <h2>Object boundary</h2>
              <div className={styles.sourceBoundary}>Decision is owned by Personal Ops. The Note body remains intact; the source mapping preserves provenance.</div>
            </section>
          </div>
        </DetailTabPanel>
      );
    }

    if (inspectorDisplayTab === "review") {
      const reviewRoute = destinationFor(
        { tab: "review", note: "" },
        { path: selectedNote.nativeRef.route }
      );
      const reviewMapping = selectedNote.mappingNotes.find(
        (mapping) => mapping.field === "review"
      );
      return (
        <DetailTabPanel tabsId={`note-home-${selectedNote.id}`} tabId="review" active>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.eyebrow}>Review timing</span>
                  <h2>Review timing</h2>
                </div>
                <span
                  className={styles.stateChip}
                  data-tone={selectedNote.reviewState === "needs_review" ? "pink" : "blue"}
                >
                  {displayLabel(selectedNote.reviewState)}
                </span>
              </div>
              <div className={styles.factGrid}>
                <div className={styles.fact}><span>Lifecycle</span><strong>{displayLabel(selectedNote.lifecycleStatus)}</strong></div>
                <div className={styles.fact}><span>Next review</span><strong>{formatDate(selectedNote.nextReviewAt)}</strong></div>
                <div className={styles.fact}><span>Cadence</span><strong>{selectedNote.nextReviewAt ? formatNoteReviewCadence(selectedNote.reviewCadence) : "Not scheduled"}</strong></div>
                <div className={styles.fact}><span>Last legacy review</span><strong>{formatDate(selectedNote.legacyLastReviewAt)}</strong></div>
              </div>
              <p>{reviewMapping?.message || "No independent Note review state is stored."}</p>
            </section>
            <section className={styles.panel} data-wide="true" data-ai-safe="true">
              <h2>Review actions</h2>
              <QuickActionBar
                actions={[
                  {
                    id: "schedule-review",
                    label: selectedNote.nextReviewAt ? "Edit schedule" : "Schedule review",
                    onSelect: () => openReviewScheduleEditor(selectedNote),
                    intent: "primary"
                  },
                  { id: "open-review", label: "Open review evidence", href: reviewRoute },
                  {
                    id: "mark-reviewed",
                    label: "Mark reviewed",
                    disabled: true,
                    disabledReason: "Native blockers, reviewer identity, waivers, and completion audit are not connected."
                  }
                ]}
              />
            </section>
            <section className={styles.panel} data-wide="true">
              <h2>Explicit review boundary</h2>
              <div className={styles.sourceBoundary}>
                Scheduling updates only the legacy timing fields. Lifecycle stays separate, and
                Notes does not create or complete a Reviews-owned ReviewRun.
              </div>
            </section>
          </div>
        </DetailTabPanel>
      );
    }

    if (inspectorDisplayTab === "attachments" && selectedAttachmentEvidence) {
      return (
        <DetailTabPanel tabsId={`note-home-${selectedNote.id}`} tabId="attachments" active>
          <NoteAttachmentInspector
            evidence={selectedAttachmentEvidence}
            selectedItem={selectedAttachmentItem}
          />
        </DetailTabPanel>
      );
    }

    if (inspectorDisplayTab !== "overview" && inspectorDisplayTab !== "body") {
      return (
        <DetailTabPanel tabsId={`note-home-${selectedNote.id}`} tabId={inspectorDisplayTab} active>
          <SystemState
            variant="read_only"
            title={`${HOME_TABS.find((tab) => tab.id === inspectorDisplayTab)?.label || "This tab"} is staged`}
            description="The approved surface is represented in the route and tab framework, but its native persistence and ownership-safe mutations are not connected in this checkpoint."
            compact
          />
        </DetailTabPanel>
      );
    }

    return (
      <DetailTabPanel tabsId={`note-home-${selectedNote.id}`} tabId={inspectorDisplayTab} active>
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
                { id: "decision", label: "Review decision output", href: noteDecisionsRoute(selectedNote) },
                { id: "schedule", label: selectedNote.nextReviewAt ? "Edit review schedule" : "Schedule review", onSelect: () => openReviewScheduleEditor(selectedNote) },
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
          activeTab={inspectorDisplayTab}
          onTabChange={(tab) => {
            const nextTab = tab as NotesTab;
            if (
              initialMode === "detail" &&
              (
                activeTab === "properties" ||
                activeTab === "decisions" ||
                activeTab === "attachments"
              )
            ) {
              const nextDetailTab = nextTab === "overview" ? "body" : nextTab;
              setActiveTab(nextDetailTab);
              setInspectorTab(nextTab);
              updateUrl({ tab: nextDetailTab });
              return;
            }
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

  const propertyEditor = propertyEditorNote ? (
    <NotePropertiesEditorSheet
      key={propertyEditorNote.id}
      open
      note={propertyEditorNote}
      onClose={() => setPropertyEditorNoteId(null)}
      onSaved={handlePropertiesSaved}
    />
  ) : null;

  const reviewScheduleEditor = reviewScheduleEditorNote ? (
    <NoteReviewScheduleEditorSheet
      key={reviewScheduleEditorNote.id}
      open
      note={reviewScheduleEditorNote}
      onClose={() => setReviewScheduleEditorNoteId(null)}
      onSaved={handleReviewScheduleSaved}
    />
  ) : null;

  if (initialMode === "detail") {
    const currentNote = selectedNote;
    const detailTabsId = currentNote ? `note-detail-${currentNote.id}` : "note-detail";
    return (
      <ModuleShell
        module="notes"
        sidebar={sidebar}
        inspector={inspector}
        aiDock={isInspectorOverlay && inspectorOpen ? undefined : aiDock}
        mode="editor"
        ariaLabel="Note editor"
        className={`${styles.shell} ${styles.detailShell}`}
      >
        {propertyEditor}
        {reviewScheduleEditor}
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
                    <button type="button" className={styles.button} onClick={() => openReviewScheduleEditor(currentNote)}>{currentNote.nextReviewAt ? "Edit review schedule" : "Schedule review"}</button>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => {
                        setActiveTab("decisions");
                        updateUrl({ tab: "decisions" });
                      }}
                      aria-label={`Review Decision candidates and outputs for ${currentNote.title}`}
                    >
                      Decisions
                    </button>
                    <button type="button" className={styles.button} aria-disabled="true" onClick={() => setNotice("Review blockers are not available in the legacy adapter.")}>Mark reviewed</button>
                  </div>
                </div>
                <div className={styles.editorMeta}>
                  <div className={styles.fact}><span>Updated</span><strong>{formatDate(currentNote.updatedAt)}</strong></div>
                  <div className={styles.fact}><span>Next review</span><strong>{formatDate(currentNote.nextReviewAt)}</strong></div>
                  <div className={styles.fact}><span>Persistence</span><strong>Legacy adapter</strong></div>
                  <div className={styles.fact} data-mono="true"><span>UID</span><strong>{currentNote.uid}</strong></div>
                </div>
                <DetailTabs id={detailTabsId} tabs={DETAIL_TABS} activeTab={activeTab === "overview" ? "body" : activeTab} onTabChange={(tab) => { setActiveTab(tab as NotesTab); updateUrl({ tab: tab as NotesTab }); }} className={styles.tabs} ariaLabel="Note detail tabs" />
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
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => {
                        setActiveTab("decisions");
                        updateUrl({ tab: "decisions" });
                      }}
                      aria-label={`Review Decision candidates and outputs for ${currentNote.title}`}
                    >
                      Decision
                    </button>
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
              ) : activeTab === "decisions" ? (
                renderDetailDecisionsPanel(currentNote, detailTabsId)
              ) : activeTab === "review" ? (
                renderDetailReviewPanel(currentNote, detailTabsId)
              ) : activeTab === "attachments" ? (
                renderDetailAttachmentsPanel(currentNote, detailTabsId)
              ) : activeTab === "properties" ? (
                renderDetailPropertiesPanel(currentNote, detailTabsId)
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
          title="Discard unsaved Notes workspace changes?"
          description="The current Note editor or Project-association draft has not been written to its owning repository."
          consequences={[
            "The stored Note and existing Project associations remain unchanged.",
            "Only the unsaved editor and association drafts will be discarded."
          ]}
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
      aiDock={isInspectorOverlay && inspectorOpen ? undefined : aiDock}
      mode="directory"
      ariaLabel="Notes directory"
      className={styles.shell}
    >
      {propertyEditor}
      {reviewScheduleEditor}
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
              <button type="button" className={styles.button} data-primary="true" onClick={openQuickCapture}>+ New Note</button>
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

          {view === "all" && (
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
          )}
          {captureError && <p className={styles.errorBanner} role="alert">{captureError}</p>}
          {notice && <p className={styles.successBanner} role="status">{notice}</p>}

          {view === "recent" && !unavailableViewReason && (
            <section
              className={`${styles.reviewQueueSummary} ${styles.operatingSummary}`}
              aria-labelledby="notes-recent-window-title"
              data-note-operating-view="recent"
            >
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.eyebrow}>Operating view</span>
                  <h2 id="notes-recent-window-title">Recent operating window</h2>
                  <p>Non-archived Notes updated in the last {NOTES_RECENT_WINDOW_DAYS} rolling days.</p>
                </div>
                <strong>{visibleNotes.length} shown</strong>
              </div>
              <MetricStrip
                ariaLabel="Recent Notes scope"
                className={styles.operatingMetrics}
                items={[
                  { id: "window", label: "Window", value: `${NOTES_RECENT_WINDOW_DAYS} days` },
                  { id: "recent", label: "Recent Notes in scope", value: visibleNotes.length },
                  { id: "all", label: "Non-archived Notes", value: counts.total - counts.archived }
                ]}
              />
              <div className={styles.reviewQueueBoundary}>
                <strong>INFERRED · 30-day rolling view · no writes</strong>
                <span>
                  The approved handoff leaves the window open. This reversible default keeps the daily workspace useful without
                  inventing saved-view persistence; search, filters, sort, selection, and view stay URL-restorable.
                </span>
              </div>
            </section>
          )}

          {isReferenceEvidenceView && !unavailableViewReason && (
            <section
              className={`${styles.reviewQueueSummary} ${styles.operatingSummary}`}
              aria-labelledby="notes-reference-view-title"
              data-note-operating-view="reference-evidence"
              data-reference-owner={referenceViewOwnerModule || "none"}
            >
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.eyebrow}>Cross-module index</span>
                  <h2 id="notes-reference-view-title">
                    {referenceViewOwnerModule
                      ? `${displayLabel(referenceViewOwnerModule)} reference evidence`
                      : "No connected link evidence"}
                  </h2>
                  <p>
                    {referenceViewOwnerModule
                      ? "Exact retained candidates and owner-module references, grouped by source Note."
                      : "Notes with no candidate, owner-module, or unresolved reference evidence in the connected indexes."}
                  </p>
                </div>
                <strong>{visibleNotes.length} shown</strong>
              </div>
              <MetricStrip
                ariaLabel="Visible Note reference evidence"
                className={styles.operatingMetrics}
                items={[
                  { id: "notes", label: "Notes in scope", value: visibleNotes.length },
                  { id: "references", label: "Reference rows", value: visibleReferenceCount },
                  {
                    id: "coverage",
                    label: "Unresolved / coverage gaps",
                    value: `${visibleUnresolvedReferenceCount} / ${coverageGapCount}`,
                    tone: coverageGapCount ? "attention" : "positive"
                  }
                ]}
              />
              <div className={styles.inlineActions} aria-label="Reference index coverage">
                {referenceEvidence.coverage.map((entry) => (
                  <span
                    className={styles.stateChip}
                    data-tone={entry.state === "indexed" ? "green" : "amber"}
                    title={entry.error || undefined}
                    key={entry.ownerModule}
                  >
                    {displayLabel(entry.ownerModule)} · {displayLabel(entry.state)}
                  </span>
                ))}
              </div>
              <div className={styles.reviewQueueBoundary}>
                <strong>Read-only evidence · not persisted NoteLinks</strong>
                <span>
                  Projects and Reviews keep their native reference state. People and Resources use exact retained-ID or normalized-URL
                  candidates. Finance remains disconnected because the fixture has no stable Note identifiers. “No connected link
                  evidence” is therefore a bounded index result, never proof that a Note is unused.
                </span>
              </div>
            </section>
          )}

          {view === "missing-properties" && (
            <section className={styles.reviewQueueSummary} aria-labelledby="notes-property-queue-title">
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.eyebrow}>Data quality</span>
                  <h2 id="notes-property-queue-title">Property attention queue</h2>
                  <p>Derived from the same searched and filtered Notes shown below.</p>
                </div>
                <strong>{visiblePropertyQueue.summary.queuedNotes} shown</strong>
              </div>
              <MetricStrip
                ariaLabel="Visible Note property queue summary"
                items={[
                  { id: "queued", label: "Notes in scope", value: visiblePropertyQueue.summary.queuedNotes },
                  {
                    id: "attention",
                    label: "Attention items",
                    value: visiblePropertyQueue.summary.attentionItems,
                    tone: visiblePropertyQueue.summary.attentionItems ? "attention" : "positive"
                  },
                  {
                    id: "missing",
                    label: "Missing values",
                    value: visiblePropertyQueue.summary.missingValues,
                    tone: visiblePropertyQueue.summary.missingValues ? "danger" : "positive"
                  },
                  {
                    id: "invalid",
                    label: "Invalid values",
                    value: visiblePropertyQueue.summary.invalidValues,
                    tone: visiblePropertyQueue.summary.invalidValues ? "danger" : "positive"
                  },
                  {
                    id: "confirm",
                    label: "Mappings to confirm",
                    value: visiblePropertyQueue.summary.unconfirmedMappings,
                    tone: visiblePropertyQueue.summary.unconfirmedMappings ? "attention" : "positive"
                  }
                ]}
              />
              <div className={styles.reviewQueueBoundary}>
                <strong>Queue rule · explicit and reversible</strong>
                <span>
                  A Note appears when a currently checkable property is missing, invalid, or mapped without direct legacy evidence.
                  Native-only owner, pinned, version, reviewer, schema, and audit fields remain visible as unavailable, but they do
                  not put every Note into this queue. No weighted readiness percentage is calculated.
                </span>
              </div>
            </section>
          )}

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
                const propertyItem = propertyQueue.byNoteId.get(note.id);
                const referenceRecord =
                  referenceEvidenceByNoteId.get(note.id) || emptyReferenceEvidence(note.id);
                const viewPlacements = referenceViewOwnerModule
                  ? referenceRecord.placements.filter(
                      (placement) => placement.ownerModule === referenceViewOwnerModule
                    )
                  : referenceRecord.placements;
                const referenceTrailing = isReferenceEvidenceView
                  ? view === "no-links"
                    ? <><strong>No connected evidence</strong><span>Bounded by indexed owners</span></>
                    : (
                      <>
                        <strong>{viewPlacements.length} reference {viewPlacements.length === 1 ? "row" : "rows"}</strong>
                        <span>{Array.from(new Set(viewPlacements.map((placement) => placement.ownerRef.label))).join(" · ")}</span>
                      </>
                    )
                  : null;
                return (
                  <DenseObjectRow
                    id={note.id}
                    title={note.title}
                    description={`${TYPE_LABELS[note.type]} · ${displayLabel(note.lifecycleStatus)} · ${item.area || "Unassigned"}`}
                    metadata={`${item.bodyExcerpt} · updated ${formatDate(note.updatedAt)}`}
                    trailing={referenceTrailing || (view === "missing-properties" && propertyItem
                      ? <><strong>{propertyItem.attentionCount} property {propertyItem.attentionCount === 1 ? "item" : "items"}</strong><span>{propertyItem.primaryReason} first</span></>
                      : <><strong>{displayLabel(note.reviewState)}</strong><span>{note.nextReviewAt ? `Review ${formatDate(note.nextReviewAt)}` : "No review date"}</span></>)}
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
