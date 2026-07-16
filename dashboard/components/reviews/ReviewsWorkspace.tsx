"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { createReviewsRepository } from "../../lib/modules/reviews/repository";
import { REVIEW_DECISION_READINESS_CHECKS } from "../../lib/modules/reviews/templates";
import type {
  FinanceReviewBridge,
  LegacyReviewRunProjection,
  ReviewCadence,
  ReviewChecklistItem,
  ReviewCompletionBlocker,
  ReviewContextLink,
  ReviewContextRelationship,
  ReviewEvidenceItem,
  ReviewRun,
  ReviewRunCreateInput,
  ReviewRunPatch,
  ReviewStructuredSummary,
  ReviewsState
} from "../../lib/modules/reviews/types";
import { createNativeObjectRef } from "../../lib/native-objects/routes";
import { NATIVE_MODULES, type ModuleId, type NativeObjectRef } from "../../lib/native-objects/types";
import {
  parseReviewsUrlState,
  serializeReviewsUrlState,
  type ReviewsFilter,
  type ReviewsSort,
  type ReviewsTab,
  type ReviewsView
} from "../../lib/native-objects/url-state";
import styles from "./ReviewsWorkspace.module.css";

type ReviewsWorkspaceProps = {
  initialState: ReviewsState;
  legacyRuns: LegacyReviewRunProjection[];
  initialMode?: "index" | "detail";
  initialSelectedReviewId?: string;
  initialLoadError?: string;
  financeBridge: FinanceReviewBridge;
};

type SourceDraft = {
  module: ModuleId;
  objectType: string;
  objectId: string;
  containerObjectId: string;
  label: string;
};

type EditorState =
  | ({ kind: "create"; cadence: ReviewCadence } & ReviewRunCreateInput)
  | ({ kind: "context"; relationship: ReviewContextRelationship } & SourceDraft)
  | ({ kind: "evidence"; evidenceId: string } & SourceDraft)
  | { kind: "waive-evidence"; evidenceId: string; reason: string; riskNote: string }
  | {
      kind: "carry-forward";
      checklistId: string;
      title: string;
      ownerId: string;
      reason: string;
      nextAction: string;
      dueDate: string;
      destinationModule: ModuleId;
    }
  | ({
      kind: "decision";
      title: string;
      question: string;
      destinationModule: ModuleId;
      dueDate: string;
    } & SourceDraft)
  | ({ kind: "follow-up"; title: string; ownerId: string; dueDate: string } & SourceDraft)
  | ({ kind: "reconcile-decision"; decisionId: string; rationale: string } & SourceDraft)
  | ({ kind: "reconcile-follow-up"; followUpId: string } & SourceDraft);

type ConfirmationState =
  | { kind: "complete"; reviewId: string }
  | { kind: "archive"; reviewId: string; reason: string }
  | { kind: "restore"; reviewId: string }
  | { kind: "unlink"; reviewId: string; contextLinkId: string }
  | null;

type DirectoryItem =
  | { source: "native"; id: string; run: ReviewRun }
  | { source: "legacy"; id: string; run: LegacyReviewRunProjection };

const REVIEW_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "checklist", label: "Checklist" },
  { id: "evidence", label: "Evidence" },
  { id: "decisions", label: "Decisions" },
  { id: "follow-ups", label: "Follow-ups" },
  { id: "finance", label: "Finance" },
  { id: "properties", label: "Properties" }
];

const FILTER_LABELS: Readonly<Record<ReviewsFilter, string>> = {
  all: "All",
  current: "Current",
  open: "Open",
  "needs-evidence": "Needs evidence",
  blocked: "Blocked",
  completed: "Completed",
  archived: "Archived"
};

const SORT_LABELS: Readonly<Record<ReviewsSort, string>> = {
  "cadence-due": "Cadence, then due",
  due: "Due date",
  "updated-desc": "Updated — newest",
  title: "Title — A–Z"
};

const SUMMARY_FIELDS: readonly { id: keyof ReviewStructuredSummary; label: string; rows: number }[] = [
  { id: "summary", label: "Review summary", rows: 4 },
  { id: "wins", label: "Wins", rows: 3 },
  { id: "blockers", label: "Blockers", rows: 3 },
  { id: "decisions", label: "Decisions", rows: 3 },
  { id: "carryForward", label: "Carry-forward", rows: 3 },
  { id: "nextFocus", label: "Next focus", rows: 3 }
];

const SOURCE_MODULES = NATIVE_MODULES.filter((module) => module !== "reviews");
const RESOLVED_CHECKLIST_STATES = new Set(["complete", "waived", "carried_forward"]);
const RESOLVED_EVIDENCE_STATES = new Set(["linked", "waived", "replaced", "carried_forward"]);
const RESOLVED_DECISION_STATES = new Set(["filed", "deferred", "waived", "superseded", "carried_forward"]);
const RESOLVED_FOLLOW_UP_STATES = new Set(["created", "carried_forward", "dismissed", "completed"]);

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

function dateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function defaultPeriod(cadence: ReviewCadence) {
  const now = new Date();
  if (cadence === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: dateInputValue(start), end: dateInputValue(end) };
  }
  const start = new Date(now);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: dateInputValue(start), end: dateInputValue(end) };
}

function monogram(cadence: ReviewCadence) {
  return cadence === "weekly" ? "WK" : "MO";
}

function completionBlockers(run: ReviewRun): ReviewCompletionBlocker[] {
  const blockers: ReviewCompletionBlocker[] = [];
  run.checklist.forEach((item) => {
    if (item.required && !RESOLVED_CHECKLIST_STATES.has(item.state)) {
      blockers.push({ id: `checklist-${item.id}`, type: "checklist", sourceItemId: item.id, label: item.label, routeTab: "checklist", severity: "blocking" });
    }
  });
  run.evidence.forEach((item) => {
    if (item.required && item.blocksCompletion && !RESOLVED_EVIDENCE_STATES.has(item.state)) {
      blockers.push({ id: `evidence-${item.id}`, type: "evidence", sourceItemId: item.id, label: item.title, routeTab: "evidence", severity: "blocking" });
    }
  });
  run.decisions.forEach((item) => {
    if (item.required && item.blocksCompletion && !RESOLVED_DECISION_STATES.has(item.state)) {
      blockers.push({ id: `decision-${item.id}`, type: "decision", sourceItemId: item.id, label: item.title, routeTab: "decisions", severity: "blocking" });
    }
  });
  run.followUps.forEach((item) => {
    if (item.required && item.blocksCompletion && !RESOLVED_FOLLOW_UP_STATES.has(item.state)) {
      blockers.push({ id: `follow-up-${item.id}`, type: "follow_up", sourceItemId: item.id, label: item.title, routeTab: "follow-ups", severity: "blocking" });
    }
  });
  run.carryForward.forEach((item) => {
    if (item.state === "pending") {
      blockers.push({ id: `carry-${item.id}`, type: "carry_forward", sourceItemId: item.id, label: item.title, routeTab: "follow-ups", severity: "blocking" });
    }
  });
  if (!run.summary.summary.trim()) {
    blockers.push({
      id: `summary-${run.id}`,
      type: "summary",
      sourceItemId: "summary",
      label: "Review summary is required",
      routeTab: "overview",
      severity: "blocking"
    });
  }
  if (run.cadence === "monthly" && !run.summary.nextFocus.trim()) {
    blockers.push({
      id: `next-focus-${run.id}`,
      type: "summary",
      sourceItemId: "nextFocus",
      label: "Next month focus is required",
      routeTab: "overview",
      severity: "blocking"
    });
  }
  if (run.cadence === "monthly" && run.lifecycle !== "completed" && run.lifecycle !== "archived") {
    blockers.push({
      id: `finance-gate-${run.id}`,
      type: "external_gate",
      sourceItemId: run.id,
      label: "Finance monthly close is available as a read-only bridge only",
      routeTab: "finance",
      severity: "blocking"
    });
  }
  return blockers;
}

function runCounts(run: ReviewRun) {
  const blockers = completionBlockers(run);
  return {
    required: run.checklist.filter((item) => item.required).length,
    resolved: run.checklist.filter((item) => item.required && RESOLVED_CHECKLIST_STATES.has(item.state)).length,
    evidenceLinked: run.evidence.filter((item) => RESOLVED_EVIDENCE_STATES.has(item.state)).length,
    evidenceMissing: run.evidence.filter((item) => item.required && !RESOLVED_EVIDENCE_STATES.has(item.state)).length,
    decisionsOpen: run.decisions.filter((item) => !RESOLVED_DECISION_STATES.has(item.state)).length,
    followUpsOpen: run.followUps.filter((item) => !RESOLVED_FOLLOW_UP_STATES.has(item.state)).length,
    blockers
  };
}

function reviewIsReadOnly(run: ReviewRun) {
  return ["completed", "archived", "canceled"].includes(run.lifecycle);
}

function matchesDirectoryItem(item: DirectoryItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const values = item.source === "native"
    ? [item.run.id, item.run.title, item.run.cadence, item.run.summary.summary, item.run.summary.blockers, item.run.summary.nextFocus]
    : [item.run.legacyReviewEntryId, item.run.title, item.run.cadence, item.run.summary, ...Object.values(item.run.rawValues)];
  return values.join(" ").toLowerCase().includes(normalized);
}

function matchesView(item: DirectoryItem, view: ReviewsView) {
  if (item.source === "legacy") return view === "all" || view === "open";
  const { run } = item;
  if (view === "all") return run.lifecycle !== "archived";
  if (view === "current") return run.current && run.lifecycle !== "archived";
  if (view === "open") return ["draft", "open", "in_progress"].includes(run.lifecycle);
  if (view === "needs-evidence") return runCounts(run).evidenceMissing > 0;
  if (view === "completed") return run.lifecycle === "completed";
  return run.lifecycle === "archived";
}

function matchesFilter(item: DirectoryItem, filter: ReviewsFilter) {
  if (filter === "all") return item.source === "legacy" || item.run.lifecycle !== "archived";
  if (item.source === "legacy") return filter === "open";
  if (filter === "current") return item.run.current && item.run.lifecycle !== "archived";
  if (filter === "open") return ["draft", "open", "in_progress"].includes(item.run.lifecycle);
  if (filter === "needs-evidence") return runCounts(item.run).evidenceMissing > 0;
  if (filter === "blocked") return completionBlockers(item.run).length > 0 && item.run.lifecycle !== "completed";
  if (filter === "completed") return item.run.lifecycle === "completed";
  return item.run.lifecycle === "archived";
}

function sortDirectory(items: DirectoryItem[], sort: ReviewsSort) {
  return [...items].sort((left, right) => {
    const leftRun = left.run;
    const rightRun = right.run;
    if (sort === "title") return leftRun.title.localeCompare(rightRun.title);
    if (sort === "updated-desc") return rightRun.updatedAt.localeCompare(leftRun.updatedAt);
    const leftDue = left.source === "native" ? left.run.dueAt || left.run.periodEnd : left.run.scheduledFor;
    const rightDue = right.source === "native" ? right.run.dueAt || right.run.periodEnd : right.run.scheduledFor;
    if (sort === "due") return leftDue.localeCompare(rightDue);
    const cadenceDelta = leftRun.cadence.localeCompare(rightRun.cadence);
    return cadenceDelta || leftDue.localeCompare(rightDue);
  });
}

function nativeRefFromDraft(draft: SourceDraft): NativeObjectRef {
  return createNativeObjectRef({
    module: draft.module,
    objectType: draft.objectType.trim(),
    objectId: draft.objectId.trim(),
    ...(draft.containerObjectId.trim() ? { containerObjectId: draft.containerObjectId.trim() } : {}),
    label: draft.label.trim()
  });
}

function defaultSourceDraft(module: ModuleId = "projects"): SourceDraft {
  return { module, objectType: module === "projects" ? "project" : "record", objectId: "", containerObjectId: "", label: "" };
}

function sourceNeedsContainer(draft: SourceDraft) {
  return draft.module === "projects" && !["project", "legacy_project"].includes(draft.objectType.trim());
}

function personalOpsCreateRoute(kind: "decision" | "follow-up", run: ReviewRun, sourceRef: NativeObjectRef, title: string, dueAt?: string) {
  const params = new URLSearchParams({
    create: kind,
    sourceModule: "reviews",
    sourceObjectType: kind === "decision" ? "review_decision_item" : "review_follow_up",
    sourceObjectId: sourceRef.objectId,
    sourceContainerObjectId: run.id,
    sourceLabel: title,
    sourceRoute: sourceRef.route
  });
  if (dueAt) params.set("dueAt", dueAt);
  return `/admin/personal/${kind === "decision" ? "decisions" : "follow-ups"}?${params.toString()}`;
}

function SourceFields({ draft, onChange }: { draft: SourceDraft; onChange: (patch: Partial<SourceDraft>) => void }) {
  return (
    <div className={styles.formGrid}>
      <label className={styles.field}>
        <span>Owner module</span>
        <select value={draft.module} onChange={(event) => onChange({ module: event.target.value as ModuleId })}>
          {SOURCE_MODULES.map((module) => <option value={module} key={module}>{displayLabel(module)}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        <span>Object type</span>
        <input value={draft.objectType} onChange={(event) => onChange({ objectType: event.target.value })} required />
      </label>
      <label className={styles.field}>
        <span>Object ID</span>
        <input value={draft.objectId} onChange={(event) => onChange({ objectId: event.target.value })} required />
      </label>
      <label className={styles.field}>
        <span>Parent ID, if nested</span>
        <input value={draft.containerObjectId} onChange={(event) => onChange({ containerObjectId: event.target.value })} />
        <small>Required for Project milestones/blockers and other contained objects.</small>
      </label>
      <label className={styles.field} data-span="full">
        <span>Source label</span>
        <input value={draft.label} onChange={(event) => onChange({ label: event.target.value })} required />
      </label>
    </div>
  );
}

export default function ReviewsWorkspace({
  initialState,
  legacyRuns,
  initialMode = "index",
  initialSelectedReviewId = "",
  initialLoadError = "",
  financeBridge
}: ReviewsWorkspaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const repository = useMemo(() => createReviewsRepository(), []);
  const urlState = useMemo(() => parseReviewsUrlState(searchParams), [searchParams]);
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialLoadError);
  const [notice, setNotice] = useState("");
  const [queryDraft, setQueryDraft] = useState(urlState.query);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(initialMode === "index" && Boolean(urlState.review || initialSelectedReviewId));
  const [inspectorOverlay, setInspectorOverlay] = useState(false);
  const [discardSummaryOpen, setDiscardSummaryOpen] = useState(false);
  const [legacyConversion, setLegacyConversion] = useState<LegacyReviewRunProjection | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);
  const [summaryDraft, setSummaryDraft] = useState<ReviewStructuredSummary | null>(null);
  const [summaryInitial, setSummaryInitial] = useState("");
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const lastSelectedIdRef = useRef("");
  const confirmationErrorRef = useRef<HTMLParagraphElement>(null);

  const selectedId = initialMode === "detail" ? initialSelectedReviewId : urlState.review;
  const selectedRun = state.runs.find((run) => run.id === selectedId) || null;
  const selectedLegacy = legacyRuns.find((run) => run.reviewId === selectedId) || null;
  const summaryDirty = Boolean(summaryDraft && JSON.stringify(summaryDraft) !== summaryInitial);

  const updateUrl = useCallback((patch: Partial<ReturnType<typeof parseReviewsUrlState>>, push = false) => {
    const params = serializeReviewsUrlState({ ...urlState, ...patch }, searchParams);
    const next = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    if (push) router.push(next, { scroll: false });
    else router.replace(next, { scroll: false });
  }, [pathname, router, searchParams, urlState]);

  const proceedWithNavigation = useCallback((action: () => void) => {
    if (!summaryDirty) {
      action();
      return;
    }
    pendingNavigationRef.current = action;
    setDiscardSummaryOpen(true);
  }, [summaryDirty]);

  const selectDirectoryScope = useCallback((patch: Partial<ReturnType<typeof parseReviewsUrlState>>) => {
    proceedWithNavigation(() => {
      if (initialMode === "index") {
        updateUrl(patch);
        return;
      }
      const params = serializeReviewsUrlState({ ...urlState, ...patch, review: "", tab: "overview", item: "" });
      const query = params.toString();
      router.push(query ? `/admin/reviews?${query}` : "/admin/reviews", { scroll: false });
    });
  }, [initialMode, proceedWithNavigation, router, updateUrl, urlState]);

  const refreshState = useCallback(async () => {
    const result = await repository.readState({ includeArchived: true });
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    setState(result.data.state);
    return true;
  }, [repository]);

  const applyConfirmedRun = useCallback((run: ReviewRun) => {
    setState((current) => ({
      ...current,
      runs: current.runs.some((item) => item.id === run.id)
        ? current.runs.map((item) => item.id === run.id ? run : item)
        : [run, ...current.runs]
    }));
  }, []);

  useEffect(() => setQueryDraft(urlState.query), [urlState.query]);

  useEffect(() => {
    if (editor) setError("");
  }, [editor?.kind]);

  useEffect(() => {
    if (confirmation) setError("");
  }, [confirmation?.kind]);

  useEffect(() => {
    if (legacyConversion) setError("");
  }, [legacyConversion?.legacyReviewEntryId]);

  useEffect(() => {
    if (confirmation && error) confirmationErrorRef.current?.focus();
  }, [confirmation, error]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1180px)");
    const update = () => {
      setInspectorOverlay(media.matches);
      if (!media.matches) setMobileInspectorOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (initialMode !== "index" || !inspectorOverlay) {
      lastSelectedIdRef.current = selectedId;
      return;
    }
    if (selectedId === lastSelectedIdRef.current) return;
    lastSelectedIdRef.current = selectedId;
    setMobileInspectorOpen(Boolean(selectedId));
  }, [initialMode, inspectorOverlay, selectedId]);

  useEffect(() => {
    if (!selectedRun) {
      setSummaryDraft(null);
      setSummaryInitial("");
      return;
    }
    setSummaryDraft(selectedRun.summary);
    setSummaryInitial(JSON.stringify(selectedRun.summary));
  }, [selectedRun?.id, selectedRun?.updatedAt]);

  useEffect(() => {
    if (!summaryDraft || !selectedRun) return;
    const dirty = JSON.stringify(summaryDraft) !== summaryInitial;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [selectedRun, summaryDraft, summaryInitial]);

  useEffect(() => {
    if (!summaryDirty) return;
    const handleInternalLink = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      pendingNavigationRef.current = () => router.push(`${destination.pathname}${destination.search}${destination.hash}`, { scroll: false });
      setDiscardSummaryOpen(true);
    };
    document.addEventListener("click", handleInternalLink, true);
    return () => document.removeEventListener("click", handleInternalLink, true);
  }, [router, summaryDirty]);

  useEffect(() => {
    if (!urlState.item) return;
    const targetId = urlState.item === "summary" || urlState.item === "nextFocus"
      ? "review-item-summary"
      : `review-item-${urlState.item}`;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ block: "center", behavior: "auto" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [urlState.item, urlState.tab]);

  const directoryItems = useMemo<DirectoryItem[]>(() => [
    ...state.runs.map((run) => ({ source: "native" as const, id: run.id, run })),
    ...legacyRuns
      .filter((run) => !state.legacyMappings.some((mapping) => mapping.legacyReviewEntryId === run.legacyReviewEntryId))
      .map((run) => ({ source: "legacy" as const, id: run.reviewId, run }))
  ], [legacyRuns, state.legacyMappings, state.runs]);

  const visibleItems = useMemo(() => sortDirectory(
    directoryItems.filter((item) => {
      if (!matchesDirectoryItem(item, urlState.query)) return false;
      if (!matchesView(item, urlState.view) || !matchesFilter(item, urlState.filter)) return false;
      if (urlState.cadence !== "all" && item.run.cadence !== urlState.cadence) return false;
      return true;
    }),
    urlState.sort
  ), [directoryItems, urlState.cadence, urlState.filter, urlState.query, urlState.sort, urlState.view]);

  const openNative = state.runs.filter((run) => ["draft", "open", "in_progress"].includes(run.lifecycle));
  const needsEvidence = state.runs.filter((run) => runCounts(run).evidenceMissing > 0);
  const blocked = state.runs.filter((run) => completionBlockers(run).length > 0 && run.lifecycle !== "completed");

  const sidebarSections = useMemo<ModuleSidebarSection[]>(() => [
    {
      id: "views",
      label: "Reviews",
      items: [
        { id: "all", label: "All Reviews", count: directoryItems.length, active: urlState.view === "all", onSelect: () => selectDirectoryScope({ view: "all", filter: "all" }) },
        { id: "current", label: "Current", count: state.runs.filter((run) => run.current && run.lifecycle !== "archived").length, active: urlState.view === "current", onSelect: () => selectDirectoryScope({ view: "current", filter: "current" }) },
        { id: "open", label: "Open", count: openNative.length + legacyRuns.length, active: urlState.view === "open", onSelect: () => selectDirectoryScope({ view: "open", filter: "open" }) },
        { id: "needs-evidence", label: "Needs Evidence", count: needsEvidence.length, active: urlState.view === "needs-evidence", tone: needsEvidence.length ? "attention" : "default", onSelect: () => selectDirectoryScope({ view: "needs-evidence", filter: "needs-evidence" }) },
        { id: "archive", label: "Archive", count: state.runs.filter((run) => run.lifecycle === "archived").length, active: urlState.view === "archived", onSelect: () => selectDirectoryScope({ view: "archived", filter: "archived" }) }
      ]
    },
    {
      id: "cadence",
      label: "Cadence",
      items: [
        { id: "weekly", label: "Weekly", count: directoryItems.filter((item) => item.run.cadence === "weekly").length, active: urlState.cadence === "weekly", onSelect: () => selectDirectoryScope({ cadence: urlState.cadence === "weekly" ? "all" : "weekly" }) },
        { id: "monthly", label: "Monthly", count: directoryItems.filter((item) => item.run.cadence === "monthly").length, active: urlState.cadence === "monthly", onSelect: () => selectDirectoryScope({ cadence: urlState.cadence === "monthly" ? "all" : "monthly" }) }
      ]
    },
    {
      id: "future",
      label: "Deliberately unavailable",
      items: [
        { id: "quarterly", label: "Quarterly templates", disabled: true, disabledReason: "Quarterly template semantics are not approved yet." },
        { id: "automation", label: "Automatic context pull", disabled: true, disabledReason: "Context stays user-selected until source-selection and risk policy are approved." }
      ]
    }
  ], [directoryItems, legacyRuns.length, needsEvidence.length, openNative.length, selectDirectoryScope, state.runs, urlState.cadence, urlState.view]);

  function openCreate(cadence: ReviewCadence) {
    const period = defaultPeriod(cadence);
    const hasCurrentCadence = state.runs.some(
      (run) =>
        run.cadence === cadence &&
        run.current &&
        !["completed", "archived", "canceled"].includes(run.lifecycle)
    );
    setEditor({
      kind: "create",
      cadence,
      title: cadence === "weekly" ? "Weekly Review" : "Monthly Review",
      periodStart: period.start,
      periodEnd: period.end,
      dueAt: period.end,
      ownerId: "admin",
      current: !hasCurrentCadence
    });
  }

  async function patchRun(run: ReviewRun, patch: ReviewRunPatch, successMessage: string) {
    setBusy(true);
    setError("");
    setNotice("");
    const result = await repository.patchRun(run.id, run.updatedAt, patch);
    if (!result.ok) {
      setError(result.error.message);
      setBusy(false);
      return false;
    }
    applyConfirmedRun(result.data.item);
    const refreshed = await refreshState();
    setNotice(refreshed ? successMessage : `${successMessage} The confirmed response is shown, but the collection refresh failed.`);
    setBusy(false);
    return true;
  }

  async function handleEditorConfirm() {
    if (!editor) return;
    if (editor.kind === "create") {
      setBusy(true);
      setError("");
      const result = await repository.createRun({
        cadence: editor.cadence,
        title: editor.title?.trim() || displayLabel(editor.cadence),
        periodStart: editor.periodStart,
        periodEnd: editor.periodEnd,
        dueAt: editor.dueAt,
        ownerId: editor.ownerId,
        current: editor.current
      });
      if (!result.ok) {
        setError(result.error.message);
        setBusy(false);
        return;
      }
      applyConfirmedRun(result.data.item);
      const refreshed = await refreshState();
      const createdId = result.data.item.id;
      setEditor(null);
      setBusy(false);
      setNotice(
        refreshed
          ? `${displayLabel(editor.cadence)} review started. No source records were changed.`
          : `${displayLabel(editor.cadence)} review started from the confirmed response, but the collection refresh failed.`
      );
      if (createdId) {
        if (initialMode === "detail") router.replace(`/admin/reviews/${encodeURIComponent(createdId)}`);
        else updateUrl({ review: createdId, tab: "overview" }, true);
        setMobileInspectorOpen(true);
      }
      return;
    }
    if (!selectedRun) return;

    if (editor.kind === "context") {
      const ok = await patchRun(selectedRun, { action: "link_context", sourceRef: nativeRefFromDraft(editor), relationship: editor.relationship }, "Source context linked. The source object was not copied or changed.");
      if (ok) setEditor(null);
      return;
    }
    if (editor.kind === "evidence") {
      const ok = await patchRun(selectedRun, { action: "update_evidence", evidence: { evidenceId: editor.evidenceId, state: "linked", sourceRef: nativeRefFromDraft(editor) } }, "Evidence source linked. Ownership remains with its native module.");
      if (ok) setEditor(null);
      return;
    }
    if (editor.kind === "waive-evidence") {
      const ok = await patchRun(selectedRun, { action: "update_evidence", evidence: { evidenceId: editor.evidenceId, state: "waived", waiver: { reason: editor.reason.trim(), riskNote: editor.riskNote.trim() } } }, "Evidence requirement waived with an auditable reason and risk note.");
      if (ok) setEditor(null);
      return;
    }
    if (editor.kind === "carry-forward") {
      const carryId = globalThis.crypto?.randomUUID?.() || `carry-${Date.now()}`;
      const sourceRef = createNativeObjectRef({ module: "reviews", objectType: "review_checklist_item", objectId: editor.checklistId, containerObjectId: selectedRun.id, label: editor.title });
      setBusy(true);
      setError("");
      setNotice("");
      const first = await repository.patchRun(selectedRun.id, selectedRun.updatedAt, {
        action: "upsert_carry_forward",
        carryForward: {
          id: carryId,
          title: editor.title.trim(),
          sourceType: "checklist",
          sourceId: editor.checklistId,
          sourceRef,
          destinationModule: editor.destinationModule,
          ownerId: editor.ownerId.trim(),
          reason: editor.reason.trim(),
          nextAction: editor.nextAction.trim(),
          dueDate: editor.dueDate || undefined,
          state: "assigned"
        }
      });
      if (!first.ok) {
        setError(first.error.message);
        setBusy(false);
        return;
      }
      const second = await repository.patchRun(first.data.item.id, first.data.item.updatedAt, {
        action: "update_checklist",
        checklist: { itemId: editor.checklistId, state: "carried_forward", carryForwardId: carryId }
      });
      if (!second.ok) {
        applyConfirmedRun(first.data.item);
        await refreshState();
        setError(`The assignment was saved, but the checklist link was not: ${second.error.message}`);
        setBusy(false);
        return;
      }
      applyConfirmedRun(second.data.item);
      const refreshed = await refreshState();
      setNotice(
        refreshed
          ? "Checklist item carried forward with an owner and next action."
          : "Carry-forward was confirmed, but the collection refresh failed; the confirmed response is shown."
      );
      setBusy(false);
      setEditor(null);
      return;
    }
    if (editor.kind === "decision") {
      const sourceRef = nativeRefFromDraft(editor);
      const ok = await patchRun(selectedRun, {
        action: "upsert_decision",
        decision: {
          title: editor.title.trim(),
          question: editor.question.trim(),
          sourceRef,
          destinationModule: editor.destinationModule,
          destinationObjectType: "decision",
          state: "candidate",
          ownerId: "admin",
          risk: "medium",
          impact: "medium",
          confidence: "medium",
          reversibility: "reversible",
          dueDate: editor.dueDate || undefined,
          rationale: "",
          recommendation: "",
          alternatives: [],
          reversalCondition: "",
          evidenceIds: [],
          required: true,
          blocksCompletion: true,
          resolution: {}
        }
      }, "Decision candidate added. It is not yet a durable Decision.");
      if (ok) setEditor(null);
      return;
    }
    if (editor.kind === "reconcile-decision") {
      const existing = selectedRun.decisions.find((item) => item.id === editor.decisionId);
      if (!existing) {
        setError("The decision candidate is no longer available. Refresh this ReviewRun before linking it.");
        return;
      }
      const { createdAt: _createdAt, updatedAt: _updatedAt, filedAt: _filedAt, filedBy: _filedBy, ...decision } = existing;
      const ok = await patchRun(selectedRun, {
        action: "upsert_decision",
        decision: {
          ...decision,
          state: "filed",
          destinationModule: "personal_ops",
          destinationObjectType: "decision",
          destinationRef: nativeRefFromDraft(editor),
          rationale: editor.rationale.trim()
        }
      }, "Durable Personal Ops Decision linked and this review candidate marked filed.");
      if (ok) setEditor(null);
      return;
    }
    if (editor.kind === "reconcile-follow-up") {
      const existing = selectedRun.followUps.find((item) => item.id === editor.followUpId);
      if (!existing) {
        setError("The follow-up candidate is no longer available. Refresh this ReviewRun before linking it.");
        return;
      }
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...followUp } = existing;
      const ok = await patchRun(selectedRun, {
        action: "upsert_follow_up",
        followUp: {
          ...followUp,
          state: "created",
          destinationModule: "personal_ops",
          createdObjectRef: nativeRefFromDraft(editor)
        }
      }, "Durable Personal Ops Follow-up linked and this review candidate resolved.");
      if (ok) setEditor(null);
      return;
    }
    if (editor.kind === "follow-up") {
      const sourceRef = nativeRefFromDraft(editor);
      const ok = await patchRun(selectedRun, {
        action: "upsert_follow_up",
        followUp: {
          title: editor.title.trim(),
          sourceRef,
          destinationModule: "personal_ops",
          ownerId: editor.ownerId.trim(),
          dueDate: editor.dueDate || undefined,
          state: "suggested",
          required: true,
          blocksCompletion: true
        }
      }, "Follow-up candidate added. Create the actionable object in Personal Ops, then link it here to resolve the candidate.");
      if (ok) setEditor(null);
    }
  }

  async function handleConfirmation() {
    if (!confirmation) return;
    const run = state.runs.find((item) => item.id === confirmation.reviewId);
    if (!run) return;
    if (confirmation.kind === "complete") {
      const ok = await patchRun(run, { action: "complete" }, "Review completed. Source objects remain unchanged.");
      if (ok) setConfirmation(null);
      return;
    }
    if (confirmation.kind === "archive") {
      const ok = await patchRun(run, { action: "archive", reason: confirmation.reason.trim() }, "Review archived with its audit history intact.");
      if (ok) setConfirmation(null);
      return;
    }
    if (confirmation.kind === "restore") {
      const ok = await patchRun(run, { action: "restore" }, "Review restored.");
      if (ok) setConfirmation(null);
      return;
    }
    const ok = await patchRun(run, { action: "unlink_context", contextLinkId: confirmation.contextLinkId }, "Link removed. Neither object was deleted.");
    if (ok) setConfirmation(null);
  }

  async function saveSummary(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedRun || !summaryDraft) return;
    const ok = await patchRun(selectedRun, { action: "update_summary", summary: summaryDraft }, "Review summary saved.");
    if (ok) setSummaryInitial(JSON.stringify(summaryDraft));
  }

  async function toggleChecklist(item: ReviewChecklistItem) {
    if (!selectedRun) return;
    const next = item.state === "complete" ? "open" : "complete";
    await patchRun(selectedRun, { action: "update_checklist", checklist: { itemId: item.id, state: next } }, next === "complete" ? "Checklist item completed." : "Checklist item reopened.");
  }

  async function convertLegacyReview() {
    if (!legacyConversion) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await repository.convertLegacyRun(legacyConversion.legacyReviewEntryId);
    if (!result.ok) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    applyConfirmedRun(result.data.item);
    setState((current) => ({
      ...current,
      legacyMappings: current.legacyMappings.some((mapping) => mapping.legacyReviewEntryId === result.data.mapping.legacyReviewEntryId)
        ? current.legacyMappings
        : [result.data.mapping, ...current.legacyMappings]
    }));
    const refreshed = await refreshState();
    setLegacyConversion(null);
    setBusy(false);
    setNotice(
      `${result.data.created ? "Converted" : "Reused"} the legacy review as a native ReviewRun without deleting its source.${refreshed ? "" : " The confirmed response is shown, but the collection refresh failed."}`
    );
    updateUrl({ review: result.data.item.id, tab: "overview" }, true);
    if (inspectorOverlay) setMobileInspectorOpen(true);
  }

  function selectItem(item: DirectoryItem) {
    proceedWithNavigation(() => {
      if (item.source === "legacy") {
        updateUrl({ review: item.id, tab: "overview" }, true);
      } else {
        updateUrl({ review: item.run.id, tab: "overview" }, true);
      }
      if (inspectorOverlay) setMobileInspectorOpen(true);
    });
  }

  const renderSummary = (run: ReviewRun) => (
    <form id="review-item-summary" className={styles.summaryPanel} data-selected={urlState.item === "summary" || urlState.item === "nextFocus" || undefined} tabIndex={-1} onSubmit={(event) => void saveSummary(event)}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Structured summary</h2>
          <p>Saved explicitly; a failed write leaves your draft intact.</p>
        </div>
        <span className={styles.chip}>{JSON.stringify(summaryDraft) === summaryInitial ? "Saved" : "Unsaved"}</span>
      </div>
      <div className={styles.summaryFields}>
        {SUMMARY_FIELDS.map((field) => (
          <label className={styles.field} key={field.id}>
            <span>{field.label}</span>
            <textarea
              rows={field.rows}
              value={summaryDraft?.[field.id] || ""}
              onChange={(event) => setSummaryDraft((current) => current ? { ...current, [field.id]: event.target.value } : current)}
              disabled={busy || reviewIsReadOnly(run)}
            />
          </label>
        ))}
      </div>
      <div className={styles.formActions}>
        <button type="submit" className={styles.button} data-primary="true" disabled={busy || reviewIsReadOnly(run) || JSON.stringify(summaryDraft) === summaryInitial}>Save summary</button>
      </div>
    </form>
  );

  const renderChecklist = (run: ReviewRun) => (
    <div className={styles.panel} data-span="full">
      <div className={styles.panelHeader}>
        <div>
          <h2>{run.cadence === "weekly" ? "10" : "13"}-check completion ledger</h2>
          <p>Each check carries its owner and evidence rule. Counts are literal, never weighted.</p>
        </div>
      </div>
      <ul className={styles.list}>
        {run.checklist.map((item) => {
          const evidenceMissing = item.evidenceRequired && item.evidenceRequirementIds.some((id) => {
            const evidence = run.evidence.find((entry) => entry.requirementId === id || entry.id === id);
            return !evidence || !RESOLVED_EVIDENCE_STATES.has(evidence.state);
          });
          return (
            <li id={`review-item-${item.id}`} className={styles.checklistRow} data-state={item.state} data-selected={urlState.item === item.id || undefined} tabIndex={-1} key={item.id}>
              <div className={styles.checklistTop}>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.description}</p>
                </div>
                <span className={styles.stateChip} data-tone={item.state === "complete" ? "positive" : item.state === "blocked" || item.state === "needs_evidence" ? "danger" : "attention"}>{displayLabel(item.state)}</span>
              </div>
              <div className={styles.statusLine}>
                <span className={styles.ownerChip}>{item.ownerModule ? displayLabel(item.ownerModule) : "Reviews"} owns source</span>
                <span className={styles.chip}>{item.required ? "Required" : "Optional"}</span>
                {item.evidenceRequired && <span className={styles.chip}>{evidenceMissing ? "Evidence missing" : "Evidence resolved"}</span>}
              </div>
              <div className={styles.inlineActions}>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => void toggleChecklist(item)}
                  disabled={busy || run.lifecycle === "archived" || run.lifecycle === "completed" || (item.state !== "complete" && evidenceMissing)}
                  title={evidenceMissing ? "Link or waive the required evidence first." : undefined}
                >
                  {item.state === "complete" ? "Reopen check" : "Mark complete"}
                </button>
                {item.carryForwardAllowed && item.state !== "complete" && item.state !== "carried_forward" && (
                  <button type="button" className={styles.button} onClick={() => setEditor({ kind: "carry-forward", checklistId: item.id, title: item.label, ownerId: "admin", reason: "", nextAction: "", dueDate: "", destinationModule: item.ownerModule || "personal_ops" })} disabled={busy || run.lifecycle === "archived" || run.lifecycle === "completed"}>Carry forward…</button>
                )}
                {evidenceMissing && <button type="button" className={styles.button} onClick={() => updateUrl({ tab: "evidence", item: item.evidenceRequirementIds[0] || "" })}>Open evidence</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const renderEvidence = (run: ReviewRun) => (
    <div className={styles.panel} data-span="full">
      <div className={styles.panelHeader}>
        <div>
          <h2>Evidence-use ledger</h2>
          <p>Links point to owner-module records. Reviews stores use state, not copied source facts.</p>
        </div>
      </div>
      {run.evidence.length === 0 ? (
        <SystemState variant="empty" title="No evidence requirements" description="This template has no evidence requirements." compact />
      ) : (
        <ul className={styles.list}>
          {run.evidence.map((item) => {
            const waiverAllowed = run.checklist.some((check) => check.waiverAllowed && check.evidenceRequirementIds.includes(item.requirementId));
            return (
            <li id={`review-item-${item.id}`} className={styles.evidenceRow} data-selected={urlState.item === item.id || undefined} tabIndex={-1} key={item.id}>
              <div className={styles.evidenceTop}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <span className={styles.stateChip} data-tone={RESOLVED_EVIDENCE_STATES.has(item.state) ? "positive" : item.required ? "danger" : "attention"}>{displayLabel(item.state)}</span>
              </div>
              <div className={styles.statusLine}>
                <span className={styles.ownerChip}>{displayLabel(item.ownerModule)} owns source</span>
                <span className={styles.chip}>{item.blocksCompletion ? "Blocks completion" : "Advisory"}</span>
              </div>
              {item.sourceRef && (
                <div className={styles.sourceLine}>
                  <span>Source</span>
                  <Link href={item.sourceRef.route}>{item.sourceRef.label}</Link>
                  <span>{item.sourceRef.objectId}</span>
                </div>
              )}
              {item.waiver && <p className={styles.readOnlyBanner}>Waived: {item.waiver.reason} Risk: {item.waiver.riskNote}</p>}
              <div className={styles.inlineActions}>
                <button type="button" className={styles.button} onClick={() => setEditor({ kind: "evidence", evidenceId: item.id, ...defaultSourceDraft(item.ownerModule) })} disabled={busy || run.lifecycle === "archived" || run.lifecycle === "completed"}>{item.sourceRef ? "Replace source…" : "Link source…"}</button>
                {waiverAllowed && item.state !== "waived" && (
                  <button type="button" className={styles.button} onClick={() => setEditor({ kind: "waive-evidence", evidenceId: item.id, reason: "", riskNote: "" })} disabled={busy || run.lifecycle === "archived" || run.lifecycle === "completed"}>Waive with reason…</button>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const renderDecisions = (run: ReviewRun) => (
    <div className={styles.panelGrid}>
      <section className={styles.panel} data-span="full">
        <div className={styles.panelHeader}>
          <div>
            <h2>Decision candidates</h2>
            <p>Reviews owns readiness. Durable Decisions are filed in Personal Ops.</p>
          </div>
          <button type="button" className={styles.button} onClick={() => setEditor({ kind: "decision", title: "", question: "", destinationModule: "personal_ops", dueDate: "", ...defaultSourceDraft("projects") })} disabled={busy || run.lifecycle === "archived" || run.lifecycle === "completed"}>Add candidate…</button>
        </div>
        {run.decisions.length === 0 ? <SystemState variant="empty" title="No decision candidates" description="Add a source-backed candidate when this review surfaces a durable choice." compact /> : (
          <ul className={styles.list}>
            {run.decisions.map((item) => (
              <li id={`review-item-${item.id}`} className={styles.sourceRow} data-selected={urlState.item === item.id || undefined} tabIndex={-1} key={item.id}>
                <div className={styles.sourceTop}>
                  <div><strong>{item.title}</strong><p>{item.question}</p></div>
                  <span className={styles.stateChip} data-tone={RESOLVED_DECISION_STATES.has(item.state) ? "positive" : "attention"}>{displayLabel(item.state)}</span>
                </div>
                <div className={styles.sourceLine}><span>Source</span><Link href={item.sourceRef.route}>{item.sourceRef.label}</Link></div>
                <div className={styles.inlineActions}>
                  {item.destinationRef ? <Link className={styles.textLink} href={item.destinationRef.route}>Open filed Decision</Link> : <><Link className={styles.textLink} href={personalOpsCreateRoute("decision", run, createNativeObjectRef({ module: "reviews", objectType: "review_decision_item", objectId: item.id, containerObjectId: run.id, label: item.title }), item.title, item.dueDate)}>Create once in Personal Ops…</Link><button type="button" className={styles.button} onClick={() => setEditor({ kind: "reconcile-decision", decisionId: item.id, rationale: item.rationale, module: "personal_ops", objectType: "decision", objectId: "", containerObjectId: "", label: item.title })}>Link filed Decision…</button></>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={styles.panel} data-span="full">
        <div className={styles.panelHeader}>
          <div><h2>Decision readiness · nine explicit checks</h2><p>No score is inferred. Each check remains unevaluated until a source-backed rule is approved.</p></div>
        </div>
        <ul className={styles.list}>
          {REVIEW_DECISION_READINESS_CHECKS.map((check, index) => (
            <li className={styles.readinessRow} data-state="unevaluated" key={check}>
              <strong>{index + 1}. {check}</strong>
              <p>Not automatically evaluated — inspect the source records and candidate states above.</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  const renderFollowUps = (run: ReviewRun) => (
    <div className={styles.panelGrid}>
      <section className={styles.panel} data-span="full">
        <div className={styles.panelHeader}>
          <div><h2>Actionable follow-ups</h2><p>Reviews proposes and tracks resolution; Personal Ops owns the actionable object.</p></div>
          <button type="button" className={styles.button} onClick={() => setEditor({ kind: "follow-up", title: "", ownerId: "admin", dueDate: "", ...defaultSourceDraft("projects") })} disabled={busy || run.lifecycle === "archived" || run.lifecycle === "completed"}>Add follow-up…</button>
        </div>
        {run.followUps.length === 0 ? <SystemState variant="empty" title="No follow-up candidates" description="Add a source-backed candidate when the review identifies actionable work." compact /> : (
          <ul className={styles.list}>
            {run.followUps.map((item) => (
              <li id={`review-item-${item.id}`} className={styles.sourceRow} data-selected={urlState.item === item.id || undefined} tabIndex={-1} key={item.id}>
                <div className={styles.sourceTop}>
                  <div><strong>{item.title}</strong><p>{item.ownerId || "Unassigned"}{item.dueDate ? ` · due ${formatDate(item.dueDate)}` : " · no due date"}</p></div>
                  <span className={styles.stateChip} data-tone={RESOLVED_FOLLOW_UP_STATES.has(item.state) ? "positive" : "attention"}>{displayLabel(item.state)}</span>
                </div>
                <div className={styles.sourceLine}><span>Source</span><Link href={item.sourceRef.route}>{item.sourceRef.label}</Link></div>
                <div className={styles.inlineActions}>
                  {item.createdObjectRef ? <Link className={styles.textLink} href={item.createdObjectRef.route}>Open Follow-up</Link> : <><Link className={styles.textLink} href={personalOpsCreateRoute("follow-up", run, createNativeObjectRef({ module: "reviews", objectType: "review_follow_up", objectId: item.id, containerObjectId: run.id, label: item.title }), item.title, item.dueDate)}>Create once in Personal Ops…</Link><button type="button" className={styles.button} onClick={() => setEditor({ kind: "reconcile-follow-up", followUpId: item.id, module: "personal_ops", objectType: "follow_up", objectId: "", containerObjectId: "", label: item.title })}>Link created Follow-up…</button></>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={styles.panel} data-span="full">
        <div className={styles.panelHeader}><div><h2>Carry-forward assignments</h2><p>Unresolved work needs a destination, owner, reason, and next action.</p></div></div>
        {run.carryForward.length === 0 ? <SystemState variant="empty" title="Nothing carried forward" description="Carry-forward is created from a checklist item and remains auditable here." compact /> : (
          <ul className={styles.list}>{run.carryForward.map((item) => <li id={`review-item-${item.id}`} className={styles.sourceRow} data-selected={urlState.item === item.id || undefined} tabIndex={-1} key={item.id}><div className={styles.sourceTop}><div><strong>{item.title}</strong><p>{item.reason}</p></div><span className={styles.stateChip} data-tone={item.state === "resolved" ? "positive" : "attention"}>{displayLabel(item.state)}</span></div><div className={styles.sourceLine}><span>{displayLabel(item.destinationModule || "reviews")}</span><span>{item.ownerId}</span><span>{item.nextAction}</span>{item.dueDate && <span>{formatDate(item.dueDate)}</span>}</div></li>)}</ul>
        )}
      </section>
    </div>
  );

  const renderOverview = (run: ReviewRun) => {
    const counts = runCounts(run);
    const activeLinks = run.contextLinks.filter((link) => link.state !== "removed");
    return (
      <div className={styles.panelGrid}>
        <div className={styles.panel} data-span="full">
          <MetricStrip items={[
            { id: "checks", label: "Required checks", value: `${counts.resolved}/${counts.required}`, detail: "literal count" },
            { id: "evidence", label: "Evidence missing", value: counts.evidenceMissing, tone: counts.evidenceMissing ? "danger" : "positive" },
            { id: "decisions", label: "Open decisions", value: counts.decisionsOpen, tone: counts.decisionsOpen ? "attention" : "default" },
            { id: "blockers", label: "Completion blockers", value: counts.blockers.length, tone: counts.blockers.length ? "danger" : "positive" }
          ]} ariaLabel="Review completion facts" />
        </div>
        {renderSummary(run)}
        <section className={styles.panel} data-span="full">
          <div className={styles.panelHeader}>
            <div><h2>Linked source context</h2><p>Manual selection is the safe boundary: no inferred context is saved without acceptance.</p></div>
            <button type="button" className={styles.button} onClick={() => setEditor({ kind: "context", relationship: "context", ...defaultSourceDraft() })} disabled={busy || run.lifecycle === "archived" || run.lifecycle === "completed"}>Link source…</button>
          </div>
          {activeLinks.length === 0 ? <SystemState variant="empty" title="No source context linked" description="Link only records you have reviewed. Automatic source selection remains disabled." compact /> : (
            <ul className={styles.list}>{activeLinks.map((link) => <ContextLinkRow link={link} run={run} busy={busy} onUnlink={() => setConfirmation({ kind: "unlink", reviewId: run.id, contextLinkId: link.id })} key={link.id} />)}</ul>
          )}
        </section>
      </div>
    );
  };

  const renderFinance = (run: ReviewRun) => (
    <div className={styles.panelGrid}>
      <section className={styles.panel} data-span="full">
        <div className={styles.panelHeader}><div><h2>Finance-owned monthly close</h2><p>{financeBridge.reason}</p></div><span className={styles.stateChip} data-tone="attention">Read-only bridge</span></div>
        <p className={styles.ownershipBanner}>Reviews can hold a link to Finance evidence and coordinate completion. It cannot close the ledger, reconcile accounts, or present fixture values as live facts.</p>
        <div className={styles.inlineActions}><Link className={styles.textLink} href={financeBridge.href}>{financeBridge.label}</Link><button type="button" className={styles.button} disabled title="Finance close mutations belong to Finance and are not connected from Reviews.">Close Finance month</button></div>
      </section>
      <section className={styles.panel} data-span="full"><div className={styles.panelHeader}><div><h2>Linked Finance sources</h2><p>Only explicit Finance-owned references appear here.</p></div></div>{run.contextLinks.filter((link) => link.sourceRef.module === "finance" && link.state !== "removed").length === 0 ? <SystemState variant="empty" title="No Finance source linked" description="Use Overview or Evidence to link a Finance-owned record after reviewing it." compact /> : <ul className={styles.list}>{run.contextLinks.filter((link) => link.sourceRef.module === "finance" && link.state !== "removed").map((link) => <ContextLinkRow link={link} run={run} busy={busy} onUnlink={() => setConfirmation({ kind: "unlink", reviewId: run.id, contextLinkId: link.id })} key={link.id} />)}</ul>}</section>
    </div>
  );

  const renderProperties = (run: ReviewRun) => (
    <div className={styles.panelGrid}>
      <section className={styles.panel} data-span="full">
        <div className={styles.panelHeader}><div><h2>Review properties</h2><p>Lifecycle, cadence, and source-link states remain independent.</p></div></div>
        <dl className={styles.definitionList}>
          <dt>Review ID</dt><dd>{run.id}</dd>
          <dt>Template</dt><dd>{run.templateId} · v{run.templateVersion}</dd>
          <dt>Cadence</dt><dd>{displayLabel(run.cadence)}</dd>
          <dt>Lifecycle</dt><dd>{displayLabel(run.lifecycle)}</dd>
          <dt>Period</dt><dd>{formatDate(run.periodStart)} – {formatDate(run.periodEnd)}</dd>
          <dt>Owner</dt><dd>{run.ownerId}</dd>
          <dt>Created</dt><dd>{formatDate(run.createdAt)}</dd>
          <dt>Updated</dt><dd>{formatDate(run.updatedAt)}</dd>
          <dt>Legacy source</dt><dd>{run.legacyReviewEntryId || "Native review run"}</dd>
        </dl>
      </section>
      <section className={styles.panel} data-span="full"><div className={styles.panelHeader}><div><h2>Audit boundary</h2><p>{state.auditEvents.filter((event) => event.object.objectId === run.id || event.object.containerObjectId === run.id).length} related native audit events are retained. Source-module audit remains with each owner.</p></div></div></section>
    </div>
  );

  function ReviewSurface({ run, headingLevel = "h1" }: { run: ReviewRun; headingLevel?: "h1" | "h2" }) {
    const counts = runCounts(run);
    const tabs = REVIEW_TABS
      .filter((tab) => run.cadence === "monthly" || tab.id !== "finance")
      .map((tab) => tab.id === "checklist" ? { ...tab, count: run.checklist.length } : tab.id === "evidence" ? { ...tab, count: run.evidence.length } : tab.id === "decisions" ? { ...tab, count: run.decisions.length } : tab.id === "follow-ups" ? { ...tab, count: run.followUps.length + run.carryForward.length } : tab);
    const activeTab = run.cadence === "weekly" && urlState.tab === "finance" ? "evidence" : urlState.tab;
    return (
      <>
        <div className={styles.detailHead}>
          <ObjectHeader
            objectType={`${displayLabel(run.cadence)} review`}
            title={run.title}
            subtitle={`${formatDate(run.periodStart)} – ${formatDate(run.periodEnd)}`}
            identity={<span className={styles.monogram}>{monogram(run.cadence)}</span>}
            states={<><span className={styles.stateChip} data-tone={run.lifecycle === "completed" ? "positive" : run.lifecycle === "archived" ? "danger" : "attention"}>{displayLabel(run.lifecycle)}</span>{run.current && <span className={styles.chip}>Current</span>}</>}
            metadata={<span className={styles.sourceLine}><span>{run.id}</span><span>Updated {formatDate(run.updatedAt)}</span></span>}
            headingLevel={headingLevel}
          />
        </div>
        <div className={styles.tabBar}><DetailTabs id={`review-${run.id}`} tabs={tabs} activeTab={activeTab} onTabChange={(tab) => updateUrl({ tab: tab as ReviewsTab, item: "" }, true)} ariaLabel="Review sections" /></div>
        <DetailTabPanel tabsId={`review-${run.id}`} tabId="overview" active={activeTab === "overview"}>{renderOverview(run)}</DetailTabPanel>
        <DetailTabPanel tabsId={`review-${run.id}`} tabId="checklist" active={activeTab === "checklist"}>{renderChecklist(run)}</DetailTabPanel>
        <DetailTabPanel tabsId={`review-${run.id}`} tabId="evidence" active={activeTab === "evidence"}>{renderEvidence(run)}</DetailTabPanel>
        <DetailTabPanel tabsId={`review-${run.id}`} tabId="decisions" active={activeTab === "decisions"}>{renderDecisions(run)}</DetailTabPanel>
        <DetailTabPanel tabsId={`review-${run.id}`} tabId="follow-ups" active={activeTab === "follow-ups"}>{renderFollowUps(run)}</DetailTabPanel>
        <DetailTabPanel tabsId={`review-${run.id}`} tabId="finance" active={activeTab === "finance"}>{renderFinance(run)}</DetailTabPanel>
        <DetailTabPanel tabsId={`review-${run.id}`} tabId="properties" active={activeTab === "properties"}>{renderProperties(run)}</DetailTabPanel>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        <QuickActionBar
          sticky
          label={`${counts.blockers.length} completion blocker${counts.blockers.length === 1 ? "" : "s"}`}
          actions={reviewActions(run, counts.blockers, setConfirmation)}
        />
      </>
    );
  }

  const inspector = (
    <InspectorRail
      className={styles.inspector}
      title={inspectorOverlay ? "Review detail" : undefined}
      actions={inspectorOverlay ? <button type="button" className={styles.button} onClick={() => setMobileInspectorOpen(false)} aria-label="Close review detail">Close</button> : undefined}
      overlay={inspectorOverlay}
      overlayOpen={mobileInspectorOpen}
      onRequestClose={() => setMobileInspectorOpen(false)}
      ariaLabel="Review inspector"
    >
      {selectedRun ? (
        <div className={styles.detailScroll}><ReviewSurface run={selectedRun} headingLevel="h2" /></div>
      ) : selectedLegacy ? (
        <div className={styles.detailScroll}>
          <div className={styles.inspectorHead}><ObjectHeader objectType="Legacy review · read-only" title={selectedLegacy.title} subtitle={`${formatDate(selectedLegacy.periodStart)} – ${formatDate(selectedLegacy.periodEnd)}`} identity={<span className={styles.monogram}>{monogram(selectedLegacy.cadence)}</span>} states={<span className={styles.stateChip} data-tone="attention">Legacy read-only</span>} headingLevel="h2" /></div>
          <p className={styles.readOnlyBanner}>This projection preserves the existing Review record and raw values. Start a native run explicitly; viewing never migrates or deletes legacy data.</p>
          <dl className={styles.legacyGrid}>{Object.entries(selectedLegacy.rawValues).map(([key, value]) => <div className={styles.legacyField} key={key}><dt>{displayLabel(key)}</dt><dd>{value || "Not recorded"}</dd></div>)}</dl>
          <div className={styles.inlineActions}><Link className={styles.textLink} href={selectedLegacy.route}>Open compatibility route</Link><button type="button" className={styles.button} onClick={() => setLegacyConversion(selectedLegacy)}>Convert legacy review…</button></div>
        </div>
      ) : (
        <div className={styles.emptyInspector}><h2>Select a review</h2><p>Row-body selection opens review context. No source data changes until you explicitly save or confirm.</p></div>
      )}
    </InspectorRail>
  );

  const detailInspector = (
    <InspectorRail
      ariaLabel="Review completion rail"
      title={inspectorOverlay ? "Completion rail" : undefined}
      actions={inspectorOverlay ? <button type="button" className={styles.button} onClick={() => setMobileInspectorOpen(false)} aria-label="Close completion rail">Close</button> : undefined}
      readOnly={selectedRun?.lifecycle === "completed" || selectedRun?.lifecycle === "archived"}
      overlay={inspectorOverlay}
      overlayOpen={mobileInspectorOpen}
      onRequestClose={() => setMobileInspectorOpen(false)}
    >
      {selectedRun ? (() => {
        const counts = runCounts(selectedRun);
        return (
          <>
            <div className={styles.completionHead}>
              <div className={styles.completionHeading}>
                <div><h2>Completion rail</h2><p>Literal requirements and server-enforced gates</p></div>
                <span className={styles.stateChip} data-tone={counts.blockers.length ? "danger" : "positive"}>{counts.blockers.length ? `${counts.blockers.length} blocked` : "Ready"}</span>
              </div>
              <MetricStrip className={styles.completionMetrics} items={[
                { id: "checks", label: "Required", value: `${counts.resolved}/${counts.required}` },
                { id: "evidence", label: "Missing evidence", value: counts.evidenceMissing, tone: counts.evidenceMissing ? "danger" : "positive" },
                { id: "blockers", label: "All blockers", value: counts.blockers.length, tone: counts.blockers.length ? "danger" : "positive" }
              ]} ariaLabel="Completion facts" />
            </div>
            <div className={styles.completionBody}>
              {selectedRun.cadence === "monthly" && <p className={styles.ownershipBanner}>Monthly completion stays blocked while Finance close is only a read-only bridge. Reviews cannot certify or mutate the close.</p>}
              {counts.blockers.length === 0 ? <SystemState variant="empty" title="No completion blockers" description="The server will verify this again when you confirm completion." compact /> : (
                <ul className={styles.list}>{counts.blockers.map((blocker) => <li className={styles.blockerRow} key={blocker.id}><strong>{blocker.label}</strong><p>{displayLabel(blocker.type)} · blocking</p><button type="button" className={styles.button} onClick={() => updateUrl({ tab: blocker.routeTab, item: blocker.sourceItemId }, true)}>Open requirement</button></li>)}</ul>
              )}
              <section className={styles.panel}><h3>Owner boundary</h3><p>Review state and carry-forward live here. Source facts, durable Decisions, actionable Follow-ups, and Finance close remain in their owner modules.</p></section>
              <QuickActionBar actions={reviewActions(selectedRun, counts.blockers, setConfirmation)} ariaLabel="Review completion actions" />
            </div>
          </>
        );
      })() : <div className={styles.emptyInspector}><h2>No ReviewRun loaded</h2><p>Return to Reviews and select an available run.</p></div>}
    </InspectorRail>
  );

  const sidebar = <ModuleSidebar title="Reviews" description="Auditable review runs" sections={sidebarSections} footer={<p className={styles.sidebarFootnote}>ReviewRuns live here. Finance closes in Finance; durable Decisions and actionable Follow-ups live in Personal Ops.</p>} mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} className={styles.sidebar} />;

  const directory = (
    <DirectoryPane className={styles.directory} ariaLabel="Review directory" busy={busy}>
      <div className={styles.mobileToolbar}><button type="button" className={styles.iconButton} onClick={() => setMobileSidebarOpen(true)} aria-label="Open Reviews navigation">Menu</button><span className={styles.chip}>{visibleItems.length} shown</span></div>
      <div className={styles.scroll}>
        <header className={styles.header}>
          <div><h1>Reviews</h1><p>Review the source, resolve the work, then complete with evidence.</p></div>
          <div className={styles.headerActions}><button type="button" className={styles.button} onClick={() => openCreate("weekly")}>Start weekly</button><button type="button" className={styles.button} data-primary="true" onClick={() => openCreate("monthly")}>Start monthly</button></div>
        </header>
        <p className={styles.ownershipBanner}>Reviews coordinates completion. It does not duplicate Project blockers, Personal Ops Decisions or Follow-ups, or Finance close state.</p>
        {initialLoadError && <SystemState variant="error" description={initialLoadError} action={{ label: "Retry", onSelect: () => void refreshState() }} />}
        <MetricStrip className={styles.metrics} items={[
          { id: "open", label: "Open native runs", value: openNative.length },
          { id: "evidence", label: "Need evidence", value: needsEvidence.length, tone: needsEvidence.length ? "attention" : "default" },
          { id: "blocked", label: "Blocked", value: blocked.length, tone: blocked.length ? "danger" : "default" },
          { id: "legacy", label: "Legacy read-only", value: legacyRuns.length }
        ]} ariaLabel="Review directory facts" />
        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input value={queryDraft} onChange={(event) => { const value = event.target.value; setQueryDraft(value); if (queryTimer.current) clearTimeout(queryTimer.current); queryTimer.current = setTimeout(() => updateUrl({ query: value }), 180); }} placeholder="Search reviews, summaries, blockers…" aria-label="Search reviews" />
          <kbd>/</kbd>
        </label>
        <div className={styles.filterRow} role="toolbar" aria-label="Review filters">
          {(Object.keys(FILTER_LABELS) as ReviewsFilter[]).map((filter) => <button type="button" className={styles.filterChip} aria-pressed={urlState.filter === filter} onClick={() => updateUrl({ filter })} key={filter}>{FILTER_LABELS[filter]}</button>)}
          <select className={styles.select} value={urlState.sort} onChange={(event) => updateUrl({ sort: event.target.value as ReviewsSort })} aria-label="Sort reviews">{(Object.keys(SORT_LABELS) as ReviewsSort[]).map((sort) => <option value={sort} key={sort}>{SORT_LABELS[sort]}</option>)}</select>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {visibleItems.length === 0 ? <SystemState variant="empty" title="No reviews match this scope" description="Clear the filter or start a native Weekly or Monthly review." action={{ label: "Clear filters", onSelect: () => updateUrl({ query: "", filter: "all", view: "all", cadence: "all" }) }} /> : (
          <div className={styles.rows} role="list" aria-label="Reviews">
            {visibleItems.map((item) => {
              if (item.source === "legacy") {
                return (
                  <DenseObjectRow
                    id={item.id}
                    title={item.run.title}
                    description={item.run.summary || "Legacy review record"}
                    leading={<span className={styles.monogram}>{monogram(item.run.cadence)}</span>}
                    metadata={<span className={styles.rowMeta}><span>{displayLabel(item.run.cadence)}</span><span>Legacy read-only</span><span>{item.run.legacyReviewEntryId}</span></span>}
                    trailing={<span className={styles.stateChip} data-tone="attention">Read-only</span>}
                    selected={selectedId === item.id}
                    onSelect={() => selectItem(item)}
                    key={item.id}
                  />
                );
              }
              const counts = runCounts(item.run);
              return (
                <DenseObjectRow
                  id={item.id}
                  title={item.run.title}
                  description={item.run.summary.summary || `${displayLabel(item.run.cadence)} review for ${formatDate(item.run.periodStart)} – ${formatDate(item.run.periodEnd)}`}
                  leading={<span className={styles.monogram}>{monogram(item.run.cadence)}</span>}
                  metadata={<span className={styles.rowMeta}><span>{displayLabel(item.run.cadence)}</span><span>{displayLabel(item.run.lifecycle)}</span><span>{counts.blockers.length} blockers</span></span>}
                  trailing={<span className={styles.stateChip} data-tone={item.run.lifecycle === "completed" ? "positive" : counts.blockers.length > 0 ? "danger" : "attention"}>{counts.blockers.length ? "Blocked" : displayLabel(item.run.lifecycle)}</span>}
                  selected={selectedId === item.id}
                  onSelect={() => selectItem(item)}
                  key={item.id}
                />
              );
            })}
          </div>
        )}
      </div>
    </DirectoryPane>
  );

  return (
    <>
      <ModuleShell
        module="reviews"
        sidebar={sidebar}
        inspector={initialMode === "detail" ? detailInspector : inspector}
        aiDock={
          <SharedAIDock
            open={urlState.ai}
            onOpenChange={(open) => updateUrl({ ai: open })}
            context={{
              module: "reviews",
              object: selectedRun
                ? createNativeObjectRef({ module: "reviews", objectType: "review_run", objectId: selectedRun.id, label: selectedRun.title })
                : null,
              activeTab: urlState.tab,
              visibleScope: `${visibleItems.length} review rows`,
              allowedActions: ["Summarize linked evidence after review", "Draft changes for explicit acceptance"]
            }}
          />
        }
        mode={initialMode === "detail" ? "review" : "directory"}
        className={`${styles.shell} ${initialMode === "detail" ? styles.detailShell : ""}`}
        ariaLabel="Reviews workspace"
      >
        {initialMode === "detail" ? <><div className={styles.mobileToolbar}><button type="button" className={styles.button} onClick={() => proceedWithNavigation(() => router.push("/admin/reviews", { scroll: false }))}>All reviews</button><button type="button" className={styles.iconButton} onClick={() => setMobileSidebarOpen(true)}>Menu</button><button type="button" className={styles.button} onClick={() => setMobileInspectorOpen(true)}>Completion</button></div><div className={styles.detailScroll}>{selectedRun ? <ReviewSurface run={selectedRun} /> : <SystemState variant="error" title="Review not found" description="The requested native ReviewRun could not be loaded. Legacy reviews remain available through their compatibility routes." action={{ label: "Return to Reviews", onSelect: () => router.push("/admin/reviews") }} />}</div></> : directory}
      </ModuleShell>
      <button type="button" className={styles.mobileBackdrop} data-open={mobileSidebarOpen || (inspectorOverlay && mobileInspectorOpen) || undefined} aria-label="Close open panel" onClick={() => { setMobileSidebarOpen(false); setMobileInspectorOpen(false); }} />
      <EditorSheet editor={editor} setEditor={setEditor} busy={busy} errorMessage={error} onConfirm={() => void handleEditorConfirm()} />
      <ConfirmationSheet
        open={Boolean(legacyConversion)}
        onOpenChange={(open) => { if (!open) setLegacyConversion(null); }}
        onConfirm={() => void convertLegacyReview()}
        title="Convert this legacy review?"
        description="Creates or reuses an idempotently mapped native ReviewRun while preserving the original legacy ID, raw values, and compatibility route."
        consequences={["The legacy Review record is not deleted or rewritten.", "No source-module object is mutated.", "The native run receives independent checklist, evidence-use, and audit state."]}
        confirmLabel="Convert review"
        busy={busy}
      >
        {error && <p className={styles.error} role="alert">{error}</p>}
      </ConfirmationSheet>
      <ConfirmationSheet
        open={discardSummaryOpen}
        onOpenChange={(open) => {
          setDiscardSummaryOpen(open);
          if (!open) pendingNavigationRef.current = null;
        }}
        onConfirm={() => {
          const pending = pendingNavigationRef.current;
          pendingNavigationRef.current = null;
          setDiscardSummaryOpen(false);
          setSummaryInitial(summaryDraft ? JSON.stringify(summaryDraft) : "");
          pending?.();
        }}
        title="Discard unsaved summary changes?"
        description="Your summary draft has not been saved to this ReviewRun."
        consequences={["The current summary edits will be cleared.", "No persisted review or source data will change."]}
        confirmLabel="Discard and continue"
        tone="danger"
      />
      <ConfirmationSheet open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }} onConfirm={() => void handleConfirmation()} title={confirmation?.kind === "complete" ? "Complete this review?" : confirmation?.kind === "archive" ? "Archive this review?" : confirmation?.kind === "restore" ? "Restore this review?" : "Remove this source link?"} description={confirmation?.kind === "complete" ? "The server will re-check every required checklist, evidence, decision, follow-up, and carry-forward state." : confirmation?.kind === "archive" ? "Archiving is soft and auditable. The ReviewRun and source links remain recoverable." : confirmation?.kind === "unlink" ? "Only the relationship is removed; neither source object is deleted." : "The previous lifecycle is restored."} consequences={confirmation?.kind === "complete" ? ["Completion is blocked if any required state remains unresolved.", "Finance close remains Finance-owned.", "No linked source object will be mutated."] : undefined} confirmLabel={confirmation?.kind === "complete" ? "Complete review" : confirmation?.kind === "archive" ? "Archive review" : confirmation?.kind === "restore" ? "Restore review" : "Remove link"} tone={confirmation?.kind === "archive" || confirmation?.kind === "unlink" ? "danger" : "default"} busy={busy} confirmDisabled={confirmation?.kind === "archive" && !confirmation.reason.trim()} confirmDisabledReason={confirmation?.kind === "archive" && !confirmation.reason.trim() ? "An archive reason is required." : undefined}>
        {error && <p ref={confirmationErrorRef} className={styles.error} role="alert" tabIndex={-1}>{error}</p>}
        {confirmation?.kind === "archive" && <label className={styles.field}><span>Archive reason</span><textarea value={confirmation.reason} onChange={(event) => setConfirmation({ ...confirmation, reason: event.target.value })} required /></label>}
      </ConfirmationSheet>
    </>
  );
}

function ContextLinkRow({ link, run, busy, onUnlink }: { link: ReviewContextLink; run: ReviewRun; busy: boolean; onUnlink: () => void }) {
  return (
    <li className={styles.sourceRow}>
      <div className={styles.sourceTop}>
        <div><strong>{link.lastKnownLabel}</strong><p>{displayLabel(link.relationship)} · {displayLabel(link.sourceRef.module)} owns source</p></div>
        <span className={styles.stateChip} data-tone={link.state === "linked" ? "positive" : link.state === "broken" ? "danger" : "attention"}>{displayLabel(link.state)}</span>
      </div>
      <div className={styles.sourceLine}><span>{link.sourceRef.objectType}</span><span>{link.sourceRef.objectId}</span></div>
      <div className={styles.inlineActions}><Link className={styles.textLink} href={link.sourceRef.route}>Open source</Link><button type="button" className={styles.button} onClick={onUnlink} disabled={busy || run.lifecycle === "archived" || run.lifecycle === "completed"}>Remove link…</button></div>
    </li>
  );
}

function reviewActions(run: ReviewRun, blockers: ReviewCompletionBlocker[], setConfirmation: (value: ConfirmationState) => void): QuickAction[] {
  if (run.lifecycle === "archived") return [{ id: "restore", label: "Restore", intent: "primary", onSelect: () => setConfirmation({ kind: "restore", reviewId: run.id }) }];
  if (run.lifecycle === "completed") return [
    { id: "complete", label: "Completed", disabled: true, disabledReason: "Completed Review reopen semantics are intentionally unresolved." },
    { id: "archive", label: "Archive…", intent: "destructive", onSelect: () => setConfirmation({ kind: "archive", reviewId: run.id, reason: "" }) }
  ];
  return [
    { id: "complete", label: blockers.length ? `Complete · ${blockers.length} blocked` : "Complete review…", intent: "primary", onSelect: () => setConfirmation({ kind: "complete", reviewId: run.id }), disabled: blockers.length > 0, disabledReason: blockers.length ? "Resolve every blocking item before completion." : undefined },
    { id: "archive", label: "Archive…", intent: "destructive", onSelect: () => setConfirmation({ kind: "archive", reviewId: run.id, reason: "" }) }
  ];
}

function EditorSheet({ editor, setEditor, busy, errorMessage, onConfirm }: { editor: EditorState | null; setEditor: (value: EditorState | null) => void; busy: boolean; errorMessage: string; onConfirm: () => void }) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (editor && errorMessage) errorRef.current?.focus();
  }, [editor, errorMessage]);
  if (!editor) return null;
  const sourceEditor = ["context", "evidence", "decision", "follow-up", "reconcile-decision", "reconcile-follow-up"].includes(editor.kind) ? editor as EditorState & SourceDraft : null;
  const title = editor.kind === "create" ? `Start ${editor.cadence} review` : editor.kind === "context" ? "Link source context" : editor.kind === "evidence" ? "Link evidence source" : editor.kind === "waive-evidence" ? "Waive evidence requirement" : editor.kind === "carry-forward" ? "Assign carry-forward" : editor.kind === "decision" ? "Add decision candidate" : editor.kind === "follow-up" ? "Add follow-up candidate" : editor.kind === "reconcile-decision" ? "Link filed Personal Ops Decision" : "Link created Personal Ops Follow-up";
  const confirmLabel = editor.kind === "create" ? "Start review" : editor.kind === "waive-evidence" ? "Record waiver" : editor.kind === "carry-forward" ? "Assign carry-forward" : editor.kind === "decision" || editor.kind === "follow-up" ? "Add candidate" : editor.kind === "reconcile-decision" ? "Link Decision" : editor.kind === "reconcile-follow-up" ? "Link Follow-up" : "Link source";
  let invalid = false;
  if (editor.kind === "create") invalid = !editor.title?.trim() || !editor.periodStart || !editor.periodEnd;
  else if (editor.kind === "waive-evidence") invalid = !editor.reason.trim() || !editor.riskNote.trim();
  else if (editor.kind === "carry-forward") invalid = !editor.ownerId.trim() || !editor.reason.trim() || !editor.nextAction.trim();
  else if (sourceEditor) {
    invalid = !sourceEditor.objectType.trim() || !sourceEditor.objectId.trim() || !sourceEditor.label.trim() || (sourceNeedsContainer(sourceEditor) && !sourceEditor.containerObjectId.trim());
    if (editor.kind === "decision") invalid ||= !editor.title.trim() || !editor.question.trim();
    if (editor.kind === "follow-up") invalid ||= !editor.title.trim();
    if (editor.kind === "reconcile-decision") invalid ||= !editor.rationale.trim() || editor.module !== "personal_ops" || editor.objectType.trim() !== "decision";
    if (editor.kind === "reconcile-follow-up") invalid ||= editor.module !== "personal_ops" || editor.objectType.trim() !== "follow_up";
  }
  return (
    <ConfirmationSheet open onOpenChange={(open) => { if (!open) setEditor(null); }} onConfirm={onConfirm} title={title} description={editor.kind === "create" ? "Creates a native ReviewRun. It does not migrate or mutate legacy Review entries." : editor.kind === "waive-evidence" ? "Waivers are explicit audit events and require both a reason and a risk note." : "The source remains owned by its native module; Reviews stores a route-aware reference."} confirmLabel={confirmLabel} busy={busy} confirmDisabled={invalid} confirmDisabledReason={invalid ? "Complete every required field." : undefined}>
      {errorMessage && <p ref={errorRef} className={styles.error} role="alert" tabIndex={-1}>{errorMessage}</p>}
      {editor.kind === "create" && <div className={styles.formGrid}><label className={styles.field} data-span="full"><span>Title</span><input value={editor.title || ""} onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label><label className={styles.field}><span>Period start</span><input type="date" value={editor.periodStart} onChange={(event) => setEditor({ ...editor, periodStart: event.target.value })} /></label><label className={styles.field}><span>Period end</span><input type="date" value={editor.periodEnd} onChange={(event) => setEditor({ ...editor, periodEnd: event.target.value })} /></label><label className={styles.field}><span>Due date</span><input type="date" value={editor.dueAt || ""} onChange={(event) => setEditor({ ...editor, dueAt: event.target.value })} /></label><label className={styles.field}><span>Owner</span><input value={editor.ownerId || ""} onChange={(event) => setEditor({ ...editor, ownerId: event.target.value })} /></label><label className={styles.field} data-span="full"><span><input type="checkbox" checked={editor.current ?? false} onChange={(event) => setEditor({ ...editor, current: event.target.checked })} /> Make this the current {editor.cadence} review</span><small>Only one open current run is allowed per cadence. Scheduled runs remain fully usable.</small></label></div>}
      {editor.kind === "context" && <><SourceFields draft={editor} onChange={(patch) => setEditor({ ...editor, ...patch })} /><label className={styles.field}><span>Relationship</span><select value={editor.relationship} onChange={(event) => setEditor({ ...editor, relationship: event.target.value as ReviewContextRelationship })}><option value="context">Context</option><option value="blocker_source">Blocker source</option><option value="decision_source">Decision source</option><option value="follow_up_source">Follow-up source</option><option value="summary_source">Summary source</option></select></label></>}
      {editor.kind === "evidence" && <SourceFields draft={editor} onChange={(patch) => setEditor({ ...editor, ...patch })} />}
      {editor.kind === "waive-evidence" && <div className={styles.formGrid}><label className={styles.field} data-span="full"><span>Reason</span><textarea value={editor.reason} onChange={(event) => setEditor({ ...editor, reason: event.target.value })} /></label><label className={styles.field} data-span="full"><span>Risk note</span><textarea value={editor.riskNote} onChange={(event) => setEditor({ ...editor, riskNote: event.target.value })} /></label></div>}
      {editor.kind === "carry-forward" && <div className={styles.formGrid}><label className={styles.field} data-span="full"><span>Item</span><input value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label><label className={styles.field}><span>Owner</span><input value={editor.ownerId} onChange={(event) => setEditor({ ...editor, ownerId: event.target.value })} /></label><label className={styles.field}><span>Destination</span><select value={editor.destinationModule} onChange={(event) => setEditor({ ...editor, destinationModule: event.target.value as ModuleId })}>{NATIVE_MODULES.map((module) => <option value={module} key={module}>{displayLabel(module)}</option>)}</select></label><label className={styles.field} data-span="full"><span>Reason</span><textarea value={editor.reason} onChange={(event) => setEditor({ ...editor, reason: event.target.value })} /></label><label className={styles.field} data-span="full"><span>Next action</span><textarea value={editor.nextAction} onChange={(event) => setEditor({ ...editor, nextAction: event.target.value })} /></label><label className={styles.field}><span>Due date</span><input type="date" value={editor.dueDate} onChange={(event) => setEditor({ ...editor, dueDate: event.target.value })} /></label></div>}
      {editor.kind === "decision" && <><div className={styles.formGrid}><label className={styles.field} data-span="full"><span>Candidate title</span><input value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label><label className={styles.field} data-span="full"><span>Decision question</span><textarea value={editor.question} onChange={(event) => setEditor({ ...editor, question: event.target.value })} /></label><label className={styles.field}><span>Due date</span><input type="date" value={editor.dueDate} onChange={(event) => setEditor({ ...editor, dueDate: event.target.value })} /></label><label className={styles.field}><span>Durable destination</span><input value="Personal Ops · Decision" disabled /><small>Reviews owns candidate readiness; Personal Ops owns the durable Decision.</small></label></div><SourceFields draft={editor} onChange={(patch) => setEditor({ ...editor, ...patch })} /></>}
      {editor.kind === "follow-up" && <><div className={styles.formGrid}><label className={styles.field} data-span="full"><span>Follow-up title</span><input value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label><label className={styles.field}><span>Owner</span><input value={editor.ownerId} onChange={(event) => setEditor({ ...editor, ownerId: event.target.value })} /></label><label className={styles.field}><span>Due date</span><input type="date" value={editor.dueDate} onChange={(event) => setEditor({ ...editor, dueDate: event.target.value })} /></label></div><SourceFields draft={editor} onChange={(patch) => setEditor({ ...editor, ...patch })} /></>}
      {editor.kind === "reconcile-decision" && <div className={styles.formGrid}><p className={styles.ownershipBanner}>After creating the durable Decision in Personal Ops, paste its native ID here. This explicit link prevents duplicate creation and is required before the review candidate can be filed.</p><label className={styles.field}><span>Personal Ops Decision ID</span><input value={editor.objectId} onChange={(event) => setEditor({ ...editor, objectId: event.target.value })} /></label><label className={styles.field}><span>Decision label</span><input value={editor.label} onChange={(event) => setEditor({ ...editor, label: event.target.value })} /></label><label className={styles.field} data-span="full"><span>Filed rationale</span><textarea value={editor.rationale} onChange={(event) => setEditor({ ...editor, rationale: event.target.value })} /></label></div>}
      {editor.kind === "reconcile-follow-up" && <div className={styles.formGrid}><p className={styles.ownershipBanner}>After creating the actionable Follow-up in Personal Ops, paste its native ID here. The Review candidate remains open until this link is saved.</p><label className={styles.field}><span>Personal Ops Follow-up ID</span><input value={editor.objectId} onChange={(event) => setEditor({ ...editor, objectId: event.target.value })} /></label><label className={styles.field}><span>Follow-up label</span><input value={editor.label} onChange={(event) => setEditor({ ...editor, label: event.target.value })} /></label></div>}
    </ConfirmationSheet>
  );
}
