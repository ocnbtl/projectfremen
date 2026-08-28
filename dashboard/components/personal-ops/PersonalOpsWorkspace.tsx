"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { getActiveFollowUpsForSource } from "../../lib/modules/personal-ops/follow-up-links";
import { createPersonalOpsRepository } from "../../lib/modules/personal-ops/repository";
import type {
  DecisionCreateInput,
  FollowUpCreateInput,
  LegacyPersonalOpsCandidate,
  ObligationCreateInput,
  PersonalOpsCreateInputByFamily,
  PersonalOpsDecision,
  PersonalOpsFamily,
  PersonalOpsFollowUp,
  PersonalOpsGoal,
  PersonalOpsObject,
  PersonalOpsObjectByFamily,
  PersonalOpsObligation,
  PersonalOpsState,
  PersonalOpsUpdateInputByFamily
} from "../../lib/modules/personal-ops/types";
import { createNativeObjectRef } from "../../lib/native-objects/routes";
import {
  parsePersonalOpsUrlState,
  serializePersonalOpsUrlState,
  type PersonalOpsSort,
  type PersonalOpsTab
} from "../../lib/native-objects/url-state";
import {
  isModuleId,
  type ModuleId,
  type NativeObjectRef
} from "../../lib/native-objects/types";
import InspectorRail from "../admin-shell/InspectorRail";
import SharedAIDock from "../admin-shell/SharedAIDock";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import DetailTabs, { type DetailTab } from "../operational/DetailTabs";
import SystemState from "../operational/SystemState";
import {
  PersonalOpsFilterRail,
  PersonalOpsMetricRail,
  PersonalOpsPanel,
  PersonalOpsStateGrid,
  PersonalOpsStatusChip,
  PersonalOpsStatusLine,
  type PersonalOpsMetricItem,
  type PersonalOpsTone
} from "./PersonalOpsPrimitives";
import PersonalOpsSidebar, {
  PERSONAL_OPS_DOMAIN_LABELS,
  type PersonalOpsSidebarCounts
} from "./PersonalOpsSidebar";
import PersonalOpsIcon, { type PersonalOpsIconName } from "./PersonalOpsIcon";
import styles from "./PersonalOpsWorkspace.module.css";

export type PersonalOpsView =
  | "command"
  | "goals"
  | "decisions"
  | "obligations"
  | "follow-ups";

export type LegacyEntityGoalProjection = {
  id: string;
  slug: string;
  entity: string;
  projectLabel: string;
  text: string;
  done: boolean;
  index: number;
};

export type PersonalOpsWorkspaceProps = {
  initialState: PersonalOpsState;
  initialView: PersonalOpsView;
  legacyGoals: LegacyEntityGoalProjection[];
  legacyCandidates: LegacyPersonalOpsCandidate[];
  initialLoadError?: string;
};

type LegacyGoalItem = LegacyEntityGoalProjection & {
  source: "legacy-goal";
  objectType: "goal";
  title: string;
};

type NativeListItem = PersonalOpsObject & { source: "native" };
type PersonalOpsListItem = NativeListItem | LegacyGoalItem;
type PendingAction =
  | { type: "archive"; item: PersonalOpsObject }
  | { type: "complete"; item: PersonalOpsObject }
  | { type: "restore"; item: PersonalOpsObject }
  | { type: "discard" };

type FormDraft = {
  title: string;
  domain: string;
  description: string;
  dueAt: string;
  priority: "low" | "medium" | "high" | "critical";
  health: "healthy" | "attention" | "blocked" | "stale" | "unknown";
  review: "not_required" | "not_reviewed" | "needs_review" | "in_review" | "reviewed" | "waived";
  cadence: "current" | "due_soon" | "overdue" | "dormant" | "paused";
  cadenceRule: string;
  outcome: string;
  targetPeriod: string;
  keyResults: string;
  question: string;
  decisionState: "open" | "decided" | "deferred" | "superseded";
  finalDecision: string;
  rationale: string;
  deferReason: string;
  revisitAt: string;
  reversibility: "reversible" | "reversible_costly" | "irreversible" | "unknown";
  risk: "low" | "medium" | "high" | "critical" | "unknown";
  options: string;
  consequence: string;
  requiredEvidence: string;
  completionCriteria: string;
  completionNote: string;
  obligationState: "open" | "waiting" | "blocked" | "complete";
  followUpType: FollowUpCreateInput["followUpType"];
  followUpState: "open" | "scheduled" | "waiting" | "deferred" | "complete" | "carried_forward";
  context: string;
  followUpOutcome: string;
  deferredUntil: string;
  createLinkedFollowUp: boolean;
  allowSourceDuplicate: boolean;
};

type OpenForm = {
  family: PersonalOpsFamily;
  item?: PersonalOpsObject;
  sourceRef?: NativeObjectRef;
  legacyCandidate?: LegacyPersonalOpsCandidate;
  sourceLabel?: string;
};

const VIEW_COPY: Record<PersonalOpsView, { title: string; description: string; family?: PersonalOpsFamily }> = {
  command: {
    title: "Personal Ops Command",
    description: ""
  },
  goals: {
    title: "Current Goals",
    description: "Outcomes and measurable key results, with the existing Current Goals bridge kept intact.",
    family: "goals"
  },
  decisions: {
    title: "Decisions",
    description: "",
    family: "decisions"
  },
  obligations: {
    title: "Obligations",
    description: "Commitments whose completion depends on criteria and evidence, not a bare checkbox.",
    family: "obligations"
  },
  "follow-ups": {
    title: "Follow-ups",
    description: "Actionable next contact and carry-forward work, linked back to its native source.",
    family: "followUps"
  }
};

const PERSONAL_SYSTEM_LINKS: ReadonlyArray<{ label: string; href: string; icon: PersonalOpsIconName }> = [
  { label: "Passwords", href: "/admin/personal/passwords", icon: "password" },
  { label: "Lists", href: "/admin/personal/lists", icon: "list" },
  { label: "Travel", href: "/admin/personal/travel", icon: "travel" },
  { label: "Personal Build", href: "/admin/personal/personal-build", icon: "build" },
  { label: "Car", href: "/admin/personal/car", icon: "car" }
];

const FAMILY_LABELS: Record<PersonalOpsFamily, string> = {
  goals: "Goal",
  decisions: "Decision",
  obligations: "Obligation",
  followUps: "Follow-up"
};

const FAMILY_ROUTES: Record<PersonalOpsFamily, string> = {
  goals: "/admin/personal/goals",
  decisions: "/admin/personal/decisions",
  obligations: "/admin/personal/obligations",
  followUps: "/admin/personal/follow-ups"
};

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

const SOURCE_MODULE_LABELS: Readonly<Record<ModuleId, string>> = {
  people: "People",
  media: "Media",
  projects: "Projects",
  notes: "Notes",
  personal_ops: "Personal Ops",
  reviews: "Reviews",
  resources: "Resources",
  finance: "Finance"
};

const CREATION_SOURCE_OBJECT_TYPES: Readonly<
  Partial<Record<ModuleId, readonly string[]>>
> = {
  media: ["media_asset"],
  notes: ["note", "decision_candidate"],
  people: ["person", "organization"],
  projects: [
    "project",
    "milestone",
    "project_milestone",
    "blocker",
    "project_blocker",
    "open_loop",
    "project_open_loop",
    "timeline_event",
    "project_timeline_event",
    "project_link"
  ],
  resources: ["resource"],
  finance: ["budget", "finance_close_check"],
  reviews: [
    "review_run",
    "weekly_review",
    "monthly_review",
    "checklist_item",
    "review_checklist_item",
    "evidence_item",
    "review_evidence_item",
    "decision_item",
    "review_decision_item",
    "follow_up_link",
    "review_follow_up",
    "carry_forward_item",
    "review_carry_forward_item"
  ]
};

const INSPECTOR_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "Details" },
  { id: "links", label: "Links" },
  { id: "activity", label: "Activity" },
  { id: "properties", label: "Properties" }
];

function lines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function toLocalDate(value?: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function toIsoDate(value: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function followUpTiming(state: FormDraft["followUpState"], dueAt: string): FormDraft["cadence"] {
  if (state === "deferred") return "paused";
  if (state === "complete") return "current";
  if (!dueAt) return "dormant";
  const due = new Date(`${dueAt}T23:59:59`);
  if (Number.isNaN(due.getTime())) return "dormant";
  const now = new Date();
  if (due.getTime() < now.getTime()) return "overdue";
  if (due.getTime() <= now.getTime() + 7 * 86_400_000) return "due_soon";
  return "current";
}

function formatDate(value?: string, fallback = "No date") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  }).format(date);
}

function formatTimestamp(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function familyForObject(item: PersonalOpsObject): PersonalOpsFamily {
  if (item.objectType === "goal") return "goals";
  if (item.objectType === "decision") return "decisions";
  if (item.objectType === "obligation") return "obligations";
  return "followUps";
}

function viewForFamily(family: PersonalOpsFamily): PersonalOpsView {
  return family === "followUps" ? "follow-ups" : family;
}

function nativeItems(state: PersonalOpsState): PersonalOpsObject[] {
  return [...state.goals, ...state.decisions, ...state.obligations, ...state.followUps];
}

function nativeStateLabel(item: PersonalOpsObject) {
  if (item.objectType === "decision") return item.decisionState;
  if (item.objectType === "obligation") return item.obligationState;
  if (item.objectType === "follow_up") return item.followUpState;
  return item.lifecycle;
}

function summaryForItem(item: PersonalOpsListItem) {
  if (item.source === "legacy-goal") return `${item.entity} · existing Current Goals bridge`;
  if (item.objectType === "goal") return item.outcome;
  if (item.objectType === "decision") return item.finalDecision || item.question;
  if (item.objectType === "obligation") return item.consequence;
  return item.description || item.context || "No description recorded";
}

function typeLabel(item: PersonalOpsListItem) {
  if (item.source === "legacy-goal") return "Goal bridge";
  return FAMILY_LABELS[familyForObject(item)];
}

function stateLabel(item: PersonalOpsListItem) {
  if (item.source === "legacy-goal") return item.done ? "complete" : "active";
  return nativeStateLabel(item);
}

function decisionReviewState(item: PersonalOpsDecision) {
  return item.lifecycle === "complete" ? "reviewed" : item.review;
}

function toneForState(value: string): PersonalOpsTone {
  if (["complete", "decided", "healthy", "reviewed", "current"].includes(value)) return "positive";
  if (["blocked", "critical", "overdue"].includes(value)) return "danger";
  if (["attention", "needs_review", "due_soon", "waiting", "deferred"].includes(value)) return "attention";
  if (["in_review", "not_reviewed"].includes(value)) return "review";
  return "neutral";
}

function cleanLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dueTime(item: PersonalOpsListItem) {
  if (item.source === "legacy-goal") return Number.POSITIVE_INFINITY;
  return item.dueAt ? new Date(item.dueAt).getTime() : Number.POSITIVE_INFINITY;
}

function isDueToday(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function isDueWithin(value: string | undefined, days: number) {
  if (!value) return false;
  const date = new Date(value).getTime();
  const now = Date.now();
  return date >= now - 86_400_000 && date <= now + days * 86_400_000;
}

function defaultDraft(family: PersonalOpsFamily, item?: PersonalOpsObject, sourceLabel?: string): FormDraft {
  const common = item;
  return {
    title: item?.title || sourceLabel || "",
    domain: item?.domain || "Personal Admin",
    description: item?.description || (item?.objectType === "follow_up" ? item.context : ""),
    dueAt: toLocalDate(item?.dueAt),
    priority: item?.priority || "medium",
    health: item?.health || "unknown",
    review: item?.review || "not_reviewed",
    cadence: item?.cadence || "dormant",
    cadenceRule: item?.cadenceRule || "",
    outcome: item?.objectType === "goal" ? item.outcome : "",
    targetPeriod: item?.objectType === "goal" ? item.targetPeriod || "" : "",
    keyResults:
      item?.objectType === "goal" ? item.keyResults.map((result) => result.title).join("\n") : "",
    question:
      item?.objectType === "decision"
        ? item.question
        : sourceLabel
          ? `What decision should be made about ${sourceLabel}?`
          : "",
    decisionState: item?.objectType === "decision" ? item.decisionState : "open",
    finalDecision: item?.objectType === "decision" ? item.finalDecision || "" : "",
    rationale: item?.objectType === "decision" ? item.rationale || "" : "",
    deferReason: item?.objectType === "decision" ? item.deferReason || "" : item?.objectType === "follow_up" ? item.deferReason || "" : "",
    revisitAt: item?.objectType === "decision" ? toLocalDate(item.revisitAt) : "",
    reversibility: item?.objectType === "decision" ? item.reversibility : "unknown",
    risk: item?.objectType === "decision" ? item.risk : "unknown",
    options: item?.objectType === "decision" ? item.options.map((option) => option.title).join("\n") : "",
    consequence: item?.objectType === "obligation" ? item.consequence : "",
    requiredEvidence:
      item?.objectType === "obligation"
        ? item.requiredEvidence.map((requirement) => requirement.label).join("\n")
        : "",
    completionCriteria:
      item?.objectType === "obligation"
        ? item.completionCriteria.map((criterion) => criterion.label).join("\n")
        : item?.objectType === "follow_up"
          ? item.completionCriteria || ""
          : "",
    completionNote: item?.objectType === "obligation" ? item.completionNote || "" : "",
    obligationState: item?.objectType === "obligation" ? item.obligationState : "open",
    followUpType: item?.objectType === "follow_up" ? item.followUpType : family === "followUps" ? "other" : "decision_follow_up",
    followUpState: item?.objectType === "follow_up" ? item.followUpState : "open",
    context: item?.objectType === "follow_up" ? item.context : "",
    followUpOutcome: item?.objectType === "follow_up" ? item.outcome || "" : "",
    deferredUntil: item?.objectType === "follow_up" ? toLocalDate(item.deferredUntil) : "",
    createLinkedFollowUp: family === "decisions" && Boolean(sourceLabel),
    allowSourceDuplicate: false
  };
}

function withSource<T extends Record<string, unknown>>(
  input: T,
  form: OpenForm
): T & { sourceRefs?: NativeObjectRef[]; legacySource?: PersonalOpsCreateInputByFamily["decisions"]["legacySource"] } {
  const sourceRefs = form.sourceRef ? [form.sourceRef] : undefined;
  const allowed = form.legacyCandidate?.allowedConversions.includes(form.family);
  const legacySource = allowed
    ? {
        record: form.legacyCandidate!.source,
        conversionConfirmed: true as const,
        conversionKey: `${form.family}-native-v1`
      }
    : undefined;
  return {
    ...input,
    ...(sourceRefs ? { sourceRefs } : {}),
    ...(legacySource ? { legacySource } : {})
  };
}

function createInput(form: OpenForm, draft: FormDraft): PersonalOpsCreateInputByFamily[PersonalOpsFamily] {
  const common = {
    title: draft.title,
    domain: draft.domain,
    description: draft.description,
    dueAt: toIsoDate(draft.dueAt),
    priority: draft.priority,
    health: draft.health,
    review: draft.review,
    cadence: draft.cadence,
    cadenceRule: draft.cadenceRule || undefined,
    owner: "You"
  };
  if (form.family === "goals") {
    return withSource(
      {
        ...common,
        outcome: draft.outcome,
        targetPeriod: draft.targetPeriod || undefined,
        keyResults: lines(draft.keyResults).map((title) => ({ title, complete: false }))
      },
      form
    );
  }
  if (form.family === "decisions") {
    const input: DecisionCreateInput = {
      ...common,
      review: draft.decisionState === "decided" ? "reviewed" : draft.review,
      question: draft.question,
      decisionState: draft.decisionState,
      finalDecision: draft.finalDecision || undefined,
      rationale: draft.rationale || undefined,
      deferReason: draft.deferReason || undefined,
      revisitAt: toIsoDate(draft.revisitAt),
      reversibility: draft.reversibility,
      risk: draft.risk,
      options: lines(draft.options).map((title) => ({ title, selected: title === draft.finalDecision }))
    };
    return withSource(input, form);
  }
  if (form.family === "obligations") {
    const input: ObligationCreateInput = {
      ...common,
      consequence: draft.consequence,
      obligationState: draft.obligationState,
      requiredEvidence: lines(draft.requiredEvidence).map((label) => ({
        label,
        required: true,
        state: "missing"
      })),
      completionCriteria: lines(draft.completionCriteria).map((label) => ({
        label,
        satisfied: false
      })),
      completionNote: draft.completionNote || undefined
    };
    return withSource(input, form);
  }
  const input: FollowUpCreateInput = {
    ...common,
    cadence: followUpTiming(draft.followUpState, draft.dueAt),
    cadenceRule: undefined,
    followUpType: draft.followUpType,
    allowSourceDuplicate: draft.allowSourceDuplicate,
    followUpState: draft.followUpState,
    context: draft.context || undefined,
    outcome: draft.followUpOutcome || undefined,
    deferReason: draft.deferReason || undefined,
    deferredUntil: toIsoDate(draft.deferredUntil),
    completionCriteria: draft.completionCriteria || undefined
  };
  return withSource(input, form);
}

function updateInput(form: OpenForm, draft: FormDraft): PersonalOpsUpdateInputByFamily[PersonalOpsFamily] {
  const common = {
    title: draft.title,
    domain: draft.domain,
    description: draft.description,
    dueAt: toIsoDate(draft.dueAt),
    priority: draft.priority,
    health: draft.health,
    review: draft.review,
    cadence: draft.cadence,
    cadenceRule: draft.cadenceRule || undefined,
    owner: "You"
  };
  if (form.family === "goals") {
    const current = form.item?.objectType === "goal" ? form.item : undefined;
    const completedByTitle = new Map(current?.keyResults.map((result) => [result.title, result]) || []);
    return {
      ...common,
      outcome: draft.outcome,
      targetPeriod: draft.targetPeriod || undefined,
      keyResults: lines(draft.keyResults).map((title) => completedByTitle.get(title) || { title, complete: false })
    };
  }
  if (form.family === "decisions") {
    const current = form.item?.objectType === "decision" ? form.item : undefined;
    const byTitle = new Map(current?.options.map((option) => [option.title, option]) || []);
    return {
      ...common,
      review: draft.decisionState === "decided" ? "reviewed" : draft.review,
      question: draft.question,
      decisionState: draft.decisionState,
      finalDecision: draft.finalDecision || undefined,
      rationale: draft.rationale || undefined,
      deferReason: draft.deferReason || undefined,
      revisitAt: toIsoDate(draft.revisitAt),
      reversibility: draft.reversibility,
      risk: draft.risk,
      options: lines(draft.options).map((title) => byTitle.get(title) || { title, selected: title === draft.finalDecision })
    };
  }
  if (form.family === "obligations") {
    const current = form.item?.objectType === "obligation" ? form.item : undefined;
    const evidenceByLabel = new Map(current?.requiredEvidence.map((item) => [item.label, item]) || []);
    const criteriaByLabel = new Map(current?.completionCriteria.map((item) => [item.label, item]) || []);
    return {
      ...common,
      consequence: draft.consequence,
      obligationState: draft.obligationState,
      requiredEvidence: lines(draft.requiredEvidence).map(
        (label) => evidenceByLabel.get(label) || { label, required: true, state: "missing" }
      ),
      completionCriteria: lines(draft.completionCriteria).map(
        (label) => criteriaByLabel.get(label) || { label, satisfied: false }
      ),
      completionNote: draft.completionNote || undefined
    };
  }
  return {
    ...common,
    cadence: followUpTiming(draft.followUpState, draft.dueAt),
    cadenceRule: form.item?.cadenceRule,
    followUpType: draft.followUpType,
    followUpState: draft.followUpState,
    context: draft.context,
    outcome: draft.followUpOutcome || undefined,
    deferReason: draft.deferReason || undefined,
    deferredUntil: toIsoDate(draft.deferredUntil),
    completionCriteria: draft.completionCriteria || undefined
  };
}

function replaceInState<Family extends PersonalOpsFamily>(
  state: PersonalOpsState,
  family: Family,
  item: PersonalOpsObjectByFamily[Family]
): PersonalOpsState {
  const collection = state[family] as PersonalOpsObjectByFamily[Family][];
  const exists = collection.some((existing) => existing.id === item.id);
  return {
    ...state,
    [family]: exists
      ? collection.map((existing) => (existing.id === item.id ? item : existing))
      : [item, ...collection]
  };
}

function sourceRefFromParams(params: URLSearchParams): NativeObjectRef | undefined {
  const module = params.get("sourceModule");
  const requestedObjectType = params.get("sourceObjectType")?.trim();
  const objectId = params.get("sourceObjectId")?.trim();
  const containerObjectId = params.get("sourceContainerObjectId")?.trim();
  const label = params.get("sourceLabel")?.trim();
  if (!objectId || !label) return undefined;
  if (!module || !isModuleId(module)) return undefined;

  const allowedObjectTypes = CREATION_SOURCE_OBJECT_TYPES[module];
  if (!allowedObjectTypes) return undefined;

  const fallbackObjectType =
    module === "notes" ? "decision_candidate" : module === "people" ? "person" : "";
  const objectType = requestedObjectType || fallbackObjectType;
  if (!objectType || !allowedObjectTypes.includes(objectType)) return undefined;
  const isContainedSource = module === "projects"
    ? objectType !== "project"
    : module === "reviews"
      ? objectType !== "review_run" && objectType !== "weekly_review" && objectType !== "monthly_review"
      : false;
  if (isContainedSource && !containerObjectId) return undefined;

  return createNativeObjectRef({
    module,
    objectType,
    objectId,
    containerObjectId,
    label
  });
}

function followUpRoute(item: PersonalOpsFollowUp): string {
  return createNativeObjectRef({
    module: "personal_ops",
    objectType: "follow_up",
    objectId: item.id,
    label: item.title
  }).route;
}

function Field({
  label,
  children,
  hint,
  full = false
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  full?: boolean;
}) {
  return (
    <label className={[styles.field, full && styles.fullWidth].filter(Boolean).join(" ")}>
      <span>{label}</span>
      {children}
      {hint && <small className={styles.fieldHint}>{hint}</small>}
    </label>
  );
}

function DecisionPrompts({
  question,
  decision,
  compact = false
}: {
  question: string;
  decision?: string;
  compact?: boolean;
}) {
  return (
    <span className={styles.decisionPrompts} data-compact={compact || undefined}>
      <span className={styles.decisionPrompt}>
        <small className={styles.decisionPromptIcon} aria-label="Question">?</small>
        <span>{question || "No question recorded."}</span>
      </span>
      <span className={styles.decisionPrompt}>
        <small className={styles.decisionPromptIcon} aria-label="Decision">!</small>
        <span>{decision || "No decision recorded yet."}</span>
      </span>
    </span>
  );
}

function ObjectForm({
  form,
  draft,
  setDraft,
  onSubmit,
  onClose,
  busy,
  error,
  notice,
  sourceDuplicates
}: {
  form: OpenForm;
  draft: FormDraft;
  setDraft: (draft: FormDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  busy: boolean;
  error: string;
  notice: string;
  sourceDuplicates: PersonalOpsFollowUp[];
}) {
  const familyLabel = FAMILY_LABELS[form.family];
  const editing = Boolean(form.item);
  const sourceOwner = form.sourceRef
    ? SOURCE_MODULE_LABELS[form.sourceRef.module]
    : "its owner module";
  const duplicateConfirmationRequired =
    !editing &&
    form.family === "followUps" &&
    sourceDuplicates.length > 0 &&
    !draft.allowSourceDuplicate;
  const titleId = `personal-ops-${form.family}-form-title`;
  function update<Key extends keyof FormDraft>(key: Key, value: FormDraft[Key]) {
    setDraft({ ...draft, [key]: value });
  }

  return (
    <>
      <button className={styles.scrim} data-open="true" onClick={onClose} aria-label="Close form" />
      <form
        className={styles.formSheet}
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.sheetHeader}>
          <div>
            <h2 id={titleId}>{editing ? `Edit ${familyLabel}` : `New ${familyLabel}`}</h2>
            <p>{form.sourceLabel ? `Source: ${form.sourceLabel}` : "Saved to the native Personal Ops ledger."}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close form">
            ×
          </button>
        </header>
        <div className={styles.sheetScroll}>
          <div className={styles.formGrid}>
            {form.sourceLabel && (
              <div className={[styles.notice, styles.fullWidth].join(" ")}>
                This creates a linked operating object. The source stays in {sourceOwner}.
              </div>
            )}
            {sourceDuplicates.length > 0 && !editing && form.family === "followUps" && (
              <section
                className={[styles.duplicateWarning, styles.fullWidth].join(" ")}
                aria-labelledby="personal-ops-source-duplicate-title"
              >
                <div>
                  <strong id="personal-ops-source-duplicate-title">
                    {sourceDuplicates.length} active {sourceDuplicates.length === 1 ? "follow-up already uses" : "follow-ups already use"} this {sourceOwner} source
                  </strong>
                  <p>Open the existing item first, or confirm that this is genuinely separate work.</p>
                </div>
                <ul>
                  {sourceDuplicates.map((item) => (
                    <li key={item.id}>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{cleanLabel(item.followUpState)} · {formatDate(item.dueAt)}</small>
                      </span>
                      <Link href={followUpRoute(item)} target="_blank" rel="noreferrer">
                        Open existing
                      </Link>
                    </li>
                  ))}
                </ul>
                <label className={styles.duplicateConfirmation}>
                  <input
                    type="checkbox"
                    checked={draft.allowSourceDuplicate}
                    onChange={(event) => update("allowSourceDuplicate", event.target.checked)}
                  />
                  <span>
                    <strong>I need a separate follow-up for this source</strong>
                    <small>The confirmation is recorded in Personal Ops audit history.</small>
                  </span>
                </label>
              </section>
            )}
            <Field label="Title" full>
              <input aria-label="Title" value={draft.title} onChange={(event) => update("title", event.target.value)} required maxLength={240} />
            </Field>
            {form.family === "followUps" ? (
              <>
                <Field label="Description" full hint="Add the useful detail or reminder in one place.">
                  <textarea value={draft.description} onChange={(event) => update("description", event.target.value)} />
                </Field>
                <Field label="Status">
                  <select value={draft.followUpState} onChange={(event) => update("followUpState", event.target.value as FormDraft["followUpState"])}>
                    <option value="open">Open</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="waiting">Waiting</option>
                    <option value="deferred">Deferred</option>
                    <option value="complete">Complete</option>
                    <option value="carried_forward">Carried forward</option>
                  </select>
                </Field>
                <Field label="Due date">
                  <input type="date" value={draft.dueAt} onChange={(event) => update("dueAt", event.target.value)} />
                </Field>
                <Field label="Priority">
                  <select value={draft.priority} onChange={(event) => update("priority", event.target.value as FormDraft["priority"])}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
                <Field label="Outcome (optional)" full hint="Add the result now or after the follow-up. You can complete it without one.">
                  <textarea value={draft.followUpOutcome} onChange={(event) => update("followUpOutcome", event.target.value)} />
                </Field>
                {draft.followUpState === "deferred" && (
                  <>
                    <Field label="Why defer?" full>
                      <textarea value={draft.deferReason} onChange={(event) => update("deferReason", event.target.value)} required />
                    </Field>
                    <Field label="New date">
                      <input type="date" value={draft.deferredUntil} onChange={(event) => update("deferredUntil", event.target.value)} required />
                    </Field>
                  </>
                )}
              </>
            ) : (
              <>
                <Field label="Domain">
                  <select aria-label="Domain" value={draft.domain} onChange={(event) => update("domain", event.target.value)}>
                    {!PERSONAL_OPS_DOMAIN_LABELS.some((domain) => domain === draft.domain) && <option value={draft.domain}>{draft.domain}</option>}
                    {PERSONAL_OPS_DOMAIN_LABELS.map((domain) => <option key={domain}>{domain}</option>)}
                  </select>
                </Field>
                <Field label="Due date">
                  <input aria-label="Due date" type="date" value={draft.dueAt} onChange={(event) => update("dueAt", event.target.value)} />
                </Field>
                <Field label="Priority">
                  <select aria-label="Priority" value={draft.priority} onChange={(event) => update("priority", event.target.value as FormDraft["priority"])}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
                {form.family !== "decisions" && (
                  <Field label="Health">
                    <select value={draft.health} onChange={(event) => update("health", event.target.value as FormDraft["health"])}>
                      <option value="unknown">Unknown</option>
                      <option value="healthy">Healthy</option>
                      <option value="attention">Needs attention</option>
                      <option value="blocked">Blocked</option>
                      <option value="stale">Stale</option>
                    </select>
                  </Field>
                )}
                <Field label="Review state">
                  <select aria-label="Review state" value={draft.review} onChange={(event) => update("review", event.target.value as FormDraft["review"])}>
                    <option value="not_reviewed">Not reviewed</option>
                    <option value="needs_review">Needs review</option>
                    <option value="in_review">In review</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="not_required">Not required</option>
                    <option value="waived">Waived</option>
                  </select>
                </Field>
                {form.family !== "decisions" && (
                  <>
                    <Field label="Cadence">
                      <select value={draft.cadence} onChange={(event) => update("cadence", event.target.value as FormDraft["cadence"])}>
                        <option value="dormant">No cadence</option>
                        <option value="current">Current</option>
                        <option value="due_soon">Due soon</option>
                        <option value="overdue">Overdue</option>
                        <option value="paused">Paused</option>
                      </select>
                    </Field>
                    <Field label="Cadence rule" full hint="Plain-language reminder only; automatic creation is not enabled.">
                      <input value={draft.cadenceRule} onChange={(event) => update("cadenceRule", event.target.value)} placeholder="Example: review every Friday" />
                    </Field>
                  </>
                )}
                <Field label={form.family === "decisions" ? "Context" : "Description"} full>
                  <textarea aria-label={form.family === "decisions" ? "Context" : "Description"} value={draft.description} onChange={(event) => update("description", event.target.value)} />
                </Field>
              </>
            )}

            {form.family === "goals" && (
              <>
                <Field label="Outcome" full hint="Describe the result, not a container of tasks.">
                  <textarea value={draft.outcome} onChange={(event) => update("outcome", event.target.value)} required />
                </Field>
                <Field label="Target period">
                  <input value={draft.targetPeriod} onChange={(event) => update("targetPeriod", event.target.value)} placeholder="Q3 2026" />
                </Field>
                <Field label="Key results" full hint="One measurable result per line. Existing checked state is preserved when the title stays the same.">
                  <textarea value={draft.keyResults} onChange={(event) => update("keyResults", event.target.value)} />
                </Field>
              </>
            )}

            {form.family === "decisions" && (
              <>
                <Field label="Question" full>
                  <textarea aria-label="Question" value={draft.question} onChange={(event) => update("question", event.target.value)} required />
                </Field>
                <Field label="Decision" full>
                  <textarea aria-label="Decision" value={draft.finalDecision} onChange={(event) => update("finalDecision", event.target.value)} required={draft.decisionState === "decided"} />
                </Field>
                <Field label="Decision state">
                  <select
                    aria-label="Decision state"
                    value={draft.decisionState}
                    onChange={(event) => {
                      const decisionState = event.target.value as FormDraft["decisionState"];
                      setDraft({
                        ...draft,
                        decisionState,
                        ...(decisionState === "decided" ? { review: "reviewed" as const } : {})
                      });
                    }}
                  >
                    <option value="open">Open</option>
                    <option value="decided">Decided</option>
                    <option value="deferred">Deferred</option>
                  </select>
                </Field>
                <Field label="Reversibility">
                  <select aria-label="Reversibility" value={draft.reversibility} onChange={(event) => update("reversibility", event.target.value as FormDraft["reversibility"])}>
                    <option value="unknown">Unknown</option>
                    <option value="reversible">Reversible</option>
                    <option value="reversible_costly">Reversible, costly</option>
                    <option value="irreversible">Irreversible</option>
                  </select>
                </Field>
                {draft.decisionState === "deferred" && (
                  <>
                    <Field label="Why defer?" full>
                      <textarea value={draft.deferReason} onChange={(event) => update("deferReason", event.target.value)} required />
                    </Field>
                    <Field label="Revisit date">
                      <input type="date" value={draft.revisitAt} onChange={(event) => update("revisitAt", event.target.value)} required />
                    </Field>
                  </>
                )}
                {!editing && form.sourceLabel && (
                  <label className={[styles.linkedFollowUpToggle, styles.fullWidth].join(" ")}>
                    <input type="checkbox" checked={draft.createLinkedFollowUp} onChange={(event) => update("createLinkedFollowUp", event.target.checked)} />
                    <span>
                      <strong>Create one linked follow-up</strong>
                      <small>The follow-up is created after the Decision saves; duplicate linked work is avoided.</small>
                    </span>
                  </label>
                )}
              </>
            )}

            {form.family === "obligations" && (
              <>
                <Field label="Current state">
                  <select value={draft.obligationState} onChange={(event) => update("obligationState", event.target.value as FormDraft["obligationState"])}>
                    <option value="open">Open</option>
                    <option value="waiting">Waiting</option>
                    <option value="blocked">Blocked</option>
                    <option value="complete">Complete</option>
                  </select>
                </Field>
                <Field label="Consequence" full hint="What happens if this commitment is missed?">
                  <textarea value={draft.consequence} onChange={(event) => update("consequence", event.target.value)} required />
                </Field>
                <Field label="Required evidence" full hint="One requirement per line. New requirements begin as missing and must be updated in the inspector.">
                  <textarea value={draft.requiredEvidence} onChange={(event) => update("requiredEvidence", event.target.value)} />
                </Field>
                <Field label="Completion criteria" full hint="One criterion per line. Completion is blocked until every criterion is checked.">
                  <textarea value={draft.completionCriteria} onChange={(event) => update("completionCriteria", event.target.value)} />
                </Field>
                <Field label="Completion note" full>
                  <textarea value={draft.completionNote} onChange={(event) => update("completionNote", event.target.value)} />
                </Field>
              </>
            )}

          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {notice && <p className={styles.notice} role="status">{notice}</p>}
        </div>
        <footer className={styles.formActions}>
          <button type="button" className={styles.button} onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={busy || duplicateConfirmationRequired}
            aria-describedby={duplicateConfirmationRequired ? "personal-ops-source-duplicate-title" : undefined}
          >
            {busy ? "Saving…" : editing ? "Save changes" : `Create ${familyLabel}`}
          </button>
        </footer>
      </form>
    </>
  );
}

export default function PersonalOpsWorkspace({
  initialState,
  initialView,
  legacyGoals: initialLegacyGoals,
  legacyCandidates,
  initialLoadError = ""
}: PersonalOpsWorkspaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const repository = useMemo(() => createPersonalOpsRepository(), []);
  const urlState = useMemo(() => parsePersonalOpsUrlState(searchParams), [searchParams]);
  const [state, setState] = useState(initialState);
  const [legacyGoals, setLegacyGoals] = useState(initialLegacyGoals);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(Boolean(urlState.selected));
  const [openForm, setOpenForm] = useState<OpenForm | null>(null);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [formInitial, setFormInitial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialLoadError);
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [queryDraft, setQueryDraft] = useState(urlState.query);
  const [filtersOpen, setFiltersOpen] = useState(urlState.filter !== "all");
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateUrl = useCallback(
    (patch: Partial<ReturnType<typeof parsePersonalOpsUrlState>>, options: { push?: boolean; clearSource?: boolean } = {}) => {
      const params = serializePersonalOpsUrlState({ ...urlState, ...patch }, searchParams);
      if (options.clearSource) {
        [
          "create",
          "sourceModule",
          "sourceObjectType",
          "sourceObjectId",
          "sourceContainerObjectId",
          "sourceLabel",
          "sourceRoute",
          "dueAt"
        ].forEach((key) => params.delete(key));
      }
      const next = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      if (options.push) router.push(next, { scroll: false });
      else router.replace(next, { scroll: false });
    },
    [pathname, router, searchParams, urlState]
  );

  useEffect(() => setQueryDraft(urlState.query), [urlState.query]);

  useEffect(() => {
    if (!openForm || !draft) return;
    const dirty = JSON.stringify(draft) !== formInitial;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draft, formInitial, openForm]);

  const allNative = useMemo(() => nativeItems(state), [state]);
  const selectedNative = useMemo(
    () => allNative.find((item) => item.id === urlState.selected) || null,
    [allNative, urlState.selected]
  );
  const selectedLegacyGoal = useMemo(
    () => legacyGoals.find((goal) => goal.id === urlState.selected) || null,
    [legacyGoals, urlState.selected]
  );
  const sourceDuplicates = useMemo(
    () =>
      openForm?.family === "followUps" && !openForm.item
        ? getActiveFollowUpsForSource(state.followUps, openForm.sourceRef)
        : [],
    [openForm, state.followUps]
  );

  const baseItems = useMemo<PersonalOpsListItem[]>(() => {
    if (initialView === "goals") {
      return [
        ...state.goals.map((item) => ({ ...item, source: "native" as const })),
        ...legacyGoals.map((item) => ({ ...item, title: item.text, source: "legacy-goal" as const, objectType: "goal" as const }))
      ];
    }
    if (initialView === "decisions") return state.decisions.map((item) => ({ ...item, source: "native" as const }));
    if (initialView === "obligations") return state.obligations.map((item) => ({ ...item, source: "native" as const }));
    if (initialView === "follow-ups") return state.followUps.map((item) => ({ ...item, source: "native" as const }));
    return [
      ...allNative.filter((item) => item.lifecycle !== "complete" && item.lifecycle !== "archived").map((item) => ({ ...item, source: "native" as const })),
      ...legacyGoals.filter((item) => !item.done).map((item) => ({ ...item, title: item.text, source: "legacy-goal" as const, objectType: "goal" as const }))
    ];
  }, [allNative, initialView, legacyGoals, state.decisions, state.followUps, state.goals, state.obligations]);

  const scopedItems = useMemo(() => {
    const query = urlState.query.toLowerCase();
    const now = Date.now();
    const filtered = baseItems.filter((item) => {
      if (query && !`${item.title} ${summaryForItem(item)} ${item.source === "native" ? item.domain : item.entity}`.toLowerCase().includes(query)) return false;
      const filter = urlState.filter;
      if (filter === "all") return item.source === "legacy-goal" || item.lifecycle !== "archived";
      if (filter === "archived") return item.source === "native" && item.lifecycle === "archived";
      if (item.source === "legacy-goal") return filter === "active" ? !item.done : filter === "complete" ? item.done : false;
      if (filter === "today") return isDueToday(item.dueAt);
      if (filter === "week" || filter === "due-soon") return isDueWithin(item.dueAt, 7);
      if (filter === "overdue") return Boolean(item.dueAt && new Date(item.dueAt).getTime() < now && item.lifecycle !== "complete");
      if (filter === "active") return item.lifecycle === "active" || item.lifecycle === "planned" || item.lifecycle === "draft";
      if (filter === "complete") return item.lifecycle === "complete";
      if (filter === "needs-review") return item.review === "needs_review" || item.review === "not_reviewed";
      if (filter === "in-review") return item.review === "in_review";
      if (filter === "reviewed") return item.review === "reviewed" || (item.objectType === "decision" && item.lifecycle === "complete");
      if (filter === "blocked") return item.health === "blocked";
      if (filter === "recurring") return Boolean(item.cadenceRule);
      if (filter.startsWith("domain-")) return item.domain.toLowerCase().replace(/\s+/g, "-") === filter.slice(7);
      if (filter.startsWith("linked-")) return [...item.sourceRefs, ...item.linkedRefs].some((ref) => ref.module.replace("_ops", "") === filter.slice(7));
      return true;
    });
    return filtered.sort((left, right) => {
      const sort = urlState.sort as PersonalOpsSort;
      if (sort === "title") return left.title.localeCompare(right.title);
      if (sort === "due") return dueTime(left) - dueTime(right);
      if (sort === "updated") {
        const leftValue = left.source === "native" ? left.updatedAt : "";
        const rightValue = right.source === "native" ? right.updatedAt : "";
        return rightValue.localeCompare(leftValue);
      }
      const leftPriority = left.source === "native" ? PRIORITY_WEIGHT[left.priority] : PRIORITY_WEIGHT.medium;
      const rightPriority = right.source === "native" ? PRIORITY_WEIGHT[right.priority] : PRIORITY_WEIGHT.medium;
      return leftPriority - rightPriority || dueTime(left) - dueTime(right);
    });
  }, [baseItems, urlState.filter, urlState.query, urlState.sort]);

  useEffect(() => {
    if (!urlState.selected) return;
    if (scopedItems.some((item) => item.id === urlState.selected)) return;
    updateUrl({ selected: "" });
    setMobileInspectorOpen(false);
  }, [scopedItems, updateUrl, urlState.selected]);

  useEffect(() => {
    const create = searchParams.get("create");
    if (!create || openForm) return;
    const family: PersonalOpsFamily | null =
      create === "goal" ? "goals" : create === "decision" ? "decisions" : create === "obligation" ? "obligations" : create === "follow-up" ? "followUps" : null;
    if (!family) return;
    const sourceRef = sourceRefFromParams(new URLSearchParams(searchParams.toString()));
    const sourceLabel = searchParams.get("sourceLabel")?.trim() || undefined;
    const candidate = sourceRef ? legacyCandidates.find((item) => item.legacyPersonalRecordId === sourceRef.objectId) : undefined;
    const form = { family, sourceRef, legacyCandidate: candidate, sourceLabel };
    const nextDraft = defaultDraft(family, undefined, sourceLabel);
    const dueAt = searchParams.get("dueAt");
    if (dueAt) nextDraft.dueAt = toLocalDate(dueAt);
    if (sourceRef?.module === "people") {
      nextDraft.followUpType = "person_check_in";
      nextDraft.domain = "Relationships";
      nextDraft.title = sourceLabel ? `Check in with ${sourceLabel}` : "Relationship check-in";
      nextDraft.description = `Reconnect with ${sourceLabel || "this person"}.`;
    }
    setOpenForm(form);
    setDraft(nextDraft);
    setFormInitial(JSON.stringify(nextDraft));
  }, [legacyCandidates, openForm, searchParams]);

  function openCreate(family: PersonalOpsFamily) {
    const form = { family };
    const nextDraft = defaultDraft(family);
    setOpenForm(form);
    setDraft(nextDraft);
    setFormInitial(JSON.stringify(nextDraft));
    setError("");
    setNotice("");
  }

  function openEdit(item: PersonalOpsObject) {
    const family = familyForObject(item);
    const form = { family, item };
    const nextDraft = defaultDraft(family, item);
    setOpenForm(form);
    setDraft(nextDraft);
    setFormInitial(JSON.stringify(nextDraft));
    setError("");
    setNotice("");
  }

  function requestCloseForm() {
    if (draft && JSON.stringify(draft) !== formInitial) {
      setPendingAction({ type: "discard" });
      return;
    }
    setOpenForm(null);
    setDraft(null);
    updateUrl({}, { clearSource: true });
  }

  async function createByFamily(family: PersonalOpsFamily, input: PersonalOpsCreateInputByFamily[PersonalOpsFamily]) {
    if (family === "goals") return repository.create("goals", input as PersonalOpsCreateInputByFamily["goals"]);
    if (family === "decisions") return repository.create("decisions", input as PersonalOpsCreateInputByFamily["decisions"]);
    if (family === "obligations") return repository.create("obligations", input as PersonalOpsCreateInputByFamily["obligations"]);
    return repository.create("followUps", input as PersonalOpsCreateInputByFamily["followUps"]);
  }

  async function updateByFamily(
    family: PersonalOpsFamily,
    item: PersonalOpsObject,
    patch: PersonalOpsUpdateInputByFamily[PersonalOpsFamily]
  ) {
    if (family === "goals") return repository.update("goals", item.id, patch as PersonalOpsUpdateInputByFamily["goals"], item.updatedAt);
    if (family === "decisions") return repository.update("decisions", item.id, patch as PersonalOpsUpdateInputByFamily["decisions"], item.updatedAt);
    if (family === "obligations") return repository.update("obligations", item.id, patch as PersonalOpsUpdateInputByFamily["obligations"], item.updatedAt);
    return repository.update("followUps", item.id, patch as PersonalOpsUpdateInputByFamily["followUps"], item.updatedAt);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openForm || !draft || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (openForm.item) {
        const result = await updateByFamily(openForm.family, openForm.item, updateInput(openForm, draft));
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setState((current) => replaceInState(current, openForm.family, result.data as never));
        updateUrl({ selected: result.data.id }, { clearSource: true });
      } else {
        const result = await createByFamily(openForm.family, createInput(openForm, draft));
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        const created = result.data.item as PersonalOpsObject;
        setState((current) => replaceInState(current, openForm.family, created as never));
        let followUpNotice = "";
        if (openForm.family === "decisions" && draft.createLinkedFollowUp) {
          const decisionRef = createNativeObjectRef({
            module: "personal_ops",
            objectType: "decision",
            objectId: created.id,
            label: created.title
          });
          const alreadyLinked = state.followUps.some((followUp) =>
            followUp.linkedRefs.some((ref) => ref.objectId === created.id && ref.module === "personal_ops")
          );
          if (!alreadyLinked) {
            const followUpResult = await repository.create("followUps", {
              title: `Follow up: ${created.title}`,
              followUpType: "decision_follow_up",
              context: `Carry the decision forward and record the outcome: ${created.title}`,
              domain: created.domain,
              priority: created.priority,
              health: "unknown",
              review: "not_reviewed",
              cadence: "due_soon",
              dueAt: toIsoDate(draft.dueAt),
              owner: "You",
              linkedRefs: [decisionRef],
              sourceRefs: openForm.sourceRef ? [openForm.sourceRef] : []
            });
            if (followUpResult.ok) {
              setState((current) => replaceInState(current, "followUps", followUpResult.data.item));
              followUpNotice = " A linked follow-up was also created.";
            } else {
              followUpNotice = ` The Decision is safe, but its follow-up could not be created: ${followUpResult.error.message}`;
            }
          }
        }
        setNotice(`${result.data.created ? `${FAMILY_LABELS[openForm.family]} created.` : "Existing conversion reopened."}${followUpNotice}`);
        updateUrl({ selected: created.id }, { clearSource: true });
      }
      setOpenForm(null);
      setDraft(null);
      setMobileInspectorOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function patchItem<Family extends PersonalOpsFamily>(
    family: Family,
    item: PersonalOpsObjectByFamily[Family],
    patch: PersonalOpsUpdateInputByFamily[Family]
  ) {
    setBusy(true);
    setError("");
    const result = await repository.update(family, item.id, patch, item.updatedAt);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    setState((current) => replaceInState(current, family, result.data));
    return true;
  }

  async function toggleLegacyGoal(goal: LegacyEntityGoalProjection) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/entity-goals?slug=${encodeURIComponent(goal.slug)}`, { cache: "no-store" });
      const current = (await response.json()) as { ok?: boolean; goals?: Array<{ text: string; done: boolean }>; error?: string };
      if (!response.ok || !current.ok || !current.goals) throw new Error(current.error || "Current Goals could not be refreshed.");
      const target = current.goals.findIndex((item, index) => index === goal.index && item.text === goal.text);
      if (target === -1) throw new Error("This Current Goal changed elsewhere. Refresh before updating it.");
      const goals = current.goals.map((item, index) => index === target ? { ...item, done: !goal.done } : item);
      const save = await fetch("/api/entity-goals", {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ slug: goal.slug, goals })
      });
      const saved = (await save.json()) as { ok?: boolean; goals?: Array<{ text: string; done: boolean }>; error?: string };
      if (!save.ok || !saved.ok || !saved.goals) throw new Error(saved.error || "Current Goal could not be saved.");
      setLegacyGoals((items) => items.map((item) => item.slug === goal.slug && item.index === goal.index ? { ...item, done: Boolean(saved.goals?.[goal.index]?.done) } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Current Goal could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleKeyResult(goal: PersonalOpsGoal, keyResultId: string) {
    await patchItem("goals", goal, {
      keyResults: goal.keyResults.map((result) => result.id === keyResultId ? { ...result, complete: !result.complete } : result)
    });
  }

  async function toggleEvidence(obligation: PersonalOpsObligation, evidenceId: string) {
    await patchItem("obligations", obligation, {
      requiredEvidence: obligation.requiredEvidence.map((requirement) =>
        requirement.id === evidenceId
          ? { ...requirement, state: requirement.state === "missing" ? "received" : requirement.state === "received" ? "verified" : "missing" }
          : requirement
      )
    });
  }

  async function toggleCriterion(obligation: PersonalOpsObligation, criterionId: string) {
    await patchItem("obligations", obligation, {
      completionCriteria: obligation.completionCriteria.map((criterion) =>
        criterion.id === criterionId ? { ...criterion, satisfied: !criterion.satisfied } : criterion
      )
    });
  }

  const metrics = useMemo<PersonalOpsMetricItem[]>(() => {
    const nativeScope = baseItems.filter((item): item is NativeListItem => item.source === "native");
    const active = baseItems.filter((item) => stateLabel(item) !== "complete" && stateLabel(item) !== "decided").length;
    const dueSoon = nativeScope.filter((item) => isDueWithin(item.dueAt, 7) && item.lifecycle !== "complete").length;
    const overdue = nativeScope.filter((item) => item.dueAt && new Date(item.dueAt).getTime() < Date.now() && item.lifecycle !== "complete").length;
    const review = nativeScope.filter((item) => item.review === "needs_review" || item.review === "not_reviewed").length;
    const blocked = nativeScope.filter((item) => item.health === "blocked").length;
    const linked = nativeScope.filter((item) => item.sourceRefs.length + item.linkedRefs.length > 0).length;
    const complete = baseItems.length - active;
    const recurring = nativeScope.filter((item) => Boolean(item.cadenceRule)).length;
    if (initialView === "decisions") {
      const decisions = state.decisions;
      const openDecisions = decisions.filter((item) => item.decisionState === "open").length;
      const inReview = decisions.filter((item) => item.review === "in_review").length;
      const reviewed = decisions.filter((item) => decisionReviewState(item) === "reviewed").length;
      const decided = decisions.filter((item) => item.decisionState === "decided" || item.decisionState === "superseded").length;
      return [
        { id: "open", label: "Open", value: openDecisions, detail: "awaiting a choice", onSelect: () => updateUrl({ filter: "active" }), active: urlState.filter === "active" },
        { id: "due", label: "Due in 7 days", value: dueSoon, detail: "dated decisions", tone: "attention", onSelect: () => updateUrl({ filter: "due-soon" }), active: urlState.filter === "due-soon" },
        { id: "overdue", label: "Overdue", value: overdue, detail: "past due", tone: overdue ? "danger" : "positive", onSelect: () => updateUrl({ filter: "overdue" }), active: urlState.filter === "overdue" },
        { id: "needs-review", label: "Needs review", value: review, detail: "not yet reviewed", tone: "review", onSelect: () => updateUrl({ filter: "needs-review" }), active: urlState.filter === "needs-review" },
        { id: "in-review", label: "In review", value: inReview, detail: "being evaluated", tone: "review", onSelect: () => updateUrl({ filter: "in-review" }), active: urlState.filter === "in-review" },
        { id: "reviewed", label: "Reviewed", value: reviewed, detail: `${decided} decided`, tone: "positive", onSelect: () => updateUrl({ filter: "reviewed" }), active: urlState.filter === "reviewed" }
      ];
    }
    const items: PersonalOpsMetricItem[] = [
      { id: "active", label: "Active", value: active, detail: "in this ledger", onSelect: () => updateUrl({ filter: "active" }), active: urlState.filter === "active" },
      { id: "due", label: "Due in 7 days", value: dueSoon, detail: "dated objects", tone: "attention", onSelect: () => updateUrl({ filter: "due-soon" }), active: urlState.filter === "due-soon" },
      { id: "overdue", label: "Overdue", value: overdue, detail: "needs attention", tone: overdue ? "danger" : "positive", onSelect: () => updateUrl({ filter: "overdue" }), active: urlState.filter === "overdue" },
      { id: "review", label: "Needs review", value: review, detail: "explicit review state", tone: "review", onSelect: () => updateUrl({ filter: "needs-review" }), active: urlState.filter === "needs-review" },
      { id: "blocked", label: "Blocked", value: blocked, detail: "health state", tone: blocked ? "danger" : "positive", onSelect: () => updateUrl({ filter: "blocked" }), active: urlState.filter === "blocked" },
      { id: "linked", label: "Linked", value: linked, detail: "has native context" },
      { id: "complete", label: "Complete", value: complete, detail: "preserved history", tone: "positive", onSelect: () => updateUrl({ filter: "complete" }), active: urlState.filter === "complete" },
      { id: "recurring", label: "Recurring", value: recurring, detail: "manual cadence rules", onSelect: () => updateUrl({ filter: "recurring" }), active: urlState.filter === "recurring" }
    ];
    if (initialView === "command") return items.slice(0, 6);
    if (initialView === "goals") return items.slice(0, 8);
    if (initialView === "obligations") return [...items, { id: "evidence", label: "Missing evidence", value: state.obligations.reduce((total, item) => total + item.requiredEvidence.filter((evidence) => evidence.required && evidence.state === "missing").length, 0), detail: "blocks completion", tone: "attention" }];
    return [...items, { id: "people", label: "People-linked", value: state.followUps.filter((item) => item.sourceRefs.some((ref) => ref.module === "people")).length, detail: "relationship context", tone: "review" }];
  }, [baseItems, initialView, state.decisions, state.followUps, state.obligations, updateUrl, urlState.filter]);

  const sidebarCounts: PersonalOpsSidebarCounts = {
    command: allNative.filter((item) => item.lifecycle !== "complete" && item.lifecycle !== "archived").length + legacyGoals.filter((item) => !item.done).length,
    goals: state.goals.length + legacyGoals.length,
    decisions: state.decisions.length,
    obligations: state.obligations.length,
    followUps: state.followUps.length,
    routines: state.routines.length,
    captures: state.captures.length,
    templates: state.templates.length,
    archived: allNative.filter((item) => item.lifecycle === "archived").length
  };

  const selectedItem: PersonalOpsListItem | null = selectedNative
    ? { ...selectedNative, source: "native" }
    : selectedLegacyGoal
      ? { ...selectedLegacyGoal, title: selectedLegacyGoal.text, source: "legacy-goal", objectType: "goal" }
      : null;

  function selectItem(item: PersonalOpsListItem) {
    updateUrl({ selected: item.id }, { push: true });
    setMobileInspectorOpen(true);
  }

  function changeQuery(value: string) {
    setQueryDraft(value);
    if (queryTimer.current) clearTimeout(queryTimer.current);
    queryTimer.current = setTimeout(() => updateUrl({ query: value, selected: "" }), 180);
  }

  const defaultFilterItems = [
    { id: "all", label: "All", count: baseItems.filter((item) => item.source === "legacy-goal" || item.lifecycle !== "archived").length },
    { id: "active", label: "Active", count: baseItems.filter((item) => stateLabel(item) !== "complete" && stateLabel(item) !== "decided").length },
    { id: "due-soon", label: "Due soon", count: baseItems.filter((item) => item.source === "native" && isDueWithin(item.dueAt, 7)).length },
    { id: "needs-review", label: "Needs review", count: baseItems.filter((item) => item.source === "native" && (item.review === "needs_review" || item.review === "not_reviewed")).length },
    { id: "blocked", label: "Blocked", count: baseItems.filter((item) => item.source === "native" && item.health === "blocked").length },
    { id: "complete", label: "Complete", count: baseItems.filter((item) => stateLabel(item) === "complete" || stateLabel(item) === "decided").length }
  ];
  const decisionFilterItems = [
    { id: "all", label: "All", count: state.decisions.filter((item) => item.lifecycle !== "archived").length },
    { id: "active", label: "Open", count: state.decisions.filter((item) => item.decisionState === "open").length },
    { id: "due-soon", label: "Due soon", count: state.decisions.filter((item) => isDueWithin(item.dueAt, 7)).length },
    { id: "needs-review", label: "Needs review", count: state.decisions.filter((item) => item.review === "needs_review" || item.review === "not_reviewed").length },
    { id: "in-review", label: "In review", count: state.decisions.filter((item) => item.review === "in_review").length },
    { id: "reviewed", label: "Reviewed", count: state.decisions.filter((item) => decisionReviewState(item) === "reviewed").length },
    { id: "complete", label: "Decided", count: state.decisions.filter((item) => item.decisionState === "decided" || item.decisionState === "superseded").length }
  ];
  const filterItems = (initialView === "decisions" ? decisionFilterItems : defaultFilterItems)
    .map((item) => ({ ...item, active: urlState.filter === item.id, onSelect: () => updateUrl({ filter: item.id, selected: "" }) }));

  const primaryFamily = VIEW_COPY[initialView].family || "followUps";
  const isDecisionView = initialView === "decisions";

  async function confirmPendingAction() {
    if (!pendingAction) return;
    if (pendingAction.type === "discard") {
      setOpenForm(null);
      setDraft(null);
      setPendingAction(null);
      updateUrl({}, { clearSource: true });
      return;
    }
    const item = pendingAction.item;
    const family = familyForObject(item);
    let patch: PersonalOpsUpdateInputByFamily[PersonalOpsFamily];
    if (pendingAction.type === "archive") patch = { lifecycle: "archived", archiveReason };
    else if (pendingAction.type === "restore") patch = { lifecycle: "active" };
    else if (item.objectType === "goal") patch = { lifecycle: "complete" };
    else if (item.objectType === "decision") patch = { decisionState: "decided", review: "reviewed" };
    else if (item.objectType === "obligation") patch = { obligationState: "complete" };
    else patch = { followUpState: "complete" };
    const saved = await updateByFamily(family, item, patch);
    if (saved.ok) {
      setState((current) => replaceInState(current, family, saved.data as never));
      setPendingAction(null);
      setArchiveReason("");
    } else {
      setError(saved.error.message);
    }
  }

  const completionDisabledReason = selectedNative
    ? selectedNative.objectType === "goal" && selectedNative.keyResults.some((result) => !result.complete)
      ? "Complete every key result first."
      : selectedNative.objectType === "decision" && !selectedNative.finalDecision
        ? "Add the decision first."
        : selectedNative.objectType === "obligation" && (selectedNative.requiredEvidence.some((item) => item.required && item.state === "missing") || selectedNative.completionCriteria.length === 0 || selectedNative.completionCriteria.some((item) => !item.satisfied))
          ? "Receive required evidence and satisfy every completion criterion first."
          : ""
    : "";

  return (
    <div className={styles.shell} data-has-inspector={Boolean(selectedItem)}>
      <PersonalOpsSidebar
        activeView={initialView}
        filter={urlState.filter}
        pathname={pathname}
        counts={sidebarCounts}
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      <main className={styles.directory} aria-label={`${VIEW_COPY[initialView].title} ledger`}>
        <div className={styles.mobileToolbar}>
          <button type="button" onClick={() => setMobileSidebarOpen(true)} aria-expanded={mobileSidebarOpen}>☰ Personal Ops</button>
          <button type="button" onClick={() => openCreate(primaryFamily)}><PersonalOpsIcon name="plus" /> {FAMILY_LABELS[primaryFamily]}</button>
        </div>
        <div className={styles.mainScroll}>
          <header className={styles.pageHeader}>
            <div>
              <h1>{VIEW_COPY[initialView].title}</h1>
              {VIEW_COPY[initialView].description && <p>{VIEW_COPY[initialView].description}</p>}
            </div>
            <div className={styles.headerActions}>
              <label className={styles.visuallyHidden} htmlFor="personal-ops-search">Search this ledger</label>
              <span className={styles.searchControl}>
                <PersonalOpsIcon name="search" />
                <input
                  id="personal-ops-search"
                  type="search"
                  value={queryDraft}
                  onChange={(event) => changeQuery(event.target.value)}
                  placeholder="Search..."
                />
              </span>
              <select
                className={styles.button}
                value={urlState.sort}
                onChange={(event) => updateUrl({ sort: event.target.value as PersonalOpsSort })}
                aria-label="Sort ledger"
              >
                <option value="priority">Priority</option>
                <option value="due">Due date</option>
                <option value="updated">Recently updated</option>
                <option value="title">Title</option>
              </select>
              <button
                type="button"
                className={styles.filterToggle}
                data-active={urlState.filter !== "all" || undefined}
                aria-label={filtersOpen ? "Hide filters" : "Show filters"}
                aria-expanded={filtersOpen}
                aria-controls="personal-ops-filter-rail"
                onClick={() => setFiltersOpen((current) => !current)}
              >
                <PersonalOpsIcon name="filter" />
                {urlState.filter !== "all" && <span>1</span>}
              </button>
              {initialView === "command" ? (
                <div className={styles.commandCreateActions} aria-label="Create Personal Ops object">
                  <button type="button" className={styles.primaryButton} onClick={() => openCreate("followUps")}><PersonalOpsIcon name="plus" />Follow-up</button>
                  <button type="button" className={styles.button} onClick={() => openCreate("decisions")}><PersonalOpsIcon name="plus" />Decision</button>
                  <button type="button" className={styles.button} onClick={() => openCreate("obligations")}><PersonalOpsIcon name="plus" />Obligation</button>
                  <button type="button" className={styles.button} onClick={() => openCreate("goals")}><PersonalOpsIcon name="plus" />Goal</button>
                </div>
              ) : (
                <button type="button" className={styles.primaryButton} onClick={() => openCreate(primaryFamily)}><PersonalOpsIcon name="plus" />{FAMILY_LABELS[primaryFamily]}</button>
              )}
            </div>
            {!isDecisionView && (
              <PersonalOpsStatusLine items={[
                { id: "scope", label: `${scopedItems.length} shown` },
                { id: "native", label: `${allNative.length} native objects`, tone: "positive" },
                { id: "bridge", label: `${legacyGoals.length} Current Goals bridge`, tone: "attention" },
                { id: "audit", label: `${state.auditEvents.length} native audit events` }
              ]} />
            )}
          </header>

          {initialView === "command" && (
            <nav className={styles.personalSystemsDock} aria-label="Personal systems">
              {PERSONAL_SYSTEM_LINKS.map((item) => (
                <Link href={item.href} aria-label={item.label} title={item.label} key={item.href}>
                  <PersonalOpsIcon name={item.icon} />
                  <span className={styles.visuallyHidden}>{item.label}</span>
                </Link>
              ))}
            </nav>
          )}

          <PersonalOpsMetricRail items={metrics} />
          {filtersOpen && <div id="personal-ops-filter-rail"><PersonalOpsFilterRail items={filterItems} /></div>}

          {error && <div className={styles.error} role="alert" style={{ margin: "0 16px 10px" }}>{error}</div>}
          {notice && <div className={styles.notice} role="status" style={{ margin: "0 16px 10px" }}>{notice}</div>}

          {initialLoadError ? (
            <SystemState variant="error" title="Personal Ops could not load" description={initialLoadError} />
          ) : scopedItems.length === 0 ? (
            <SystemState
              variant="empty"
              title={urlState.query || urlState.filter !== "all" ? "No objects match this scope" : `No ${VIEW_COPY[initialView].title.toLowerCase()} yet`}
              description={urlState.query || urlState.filter !== "all" ? "Clear search or change the active filter." : "Create the first native object; nothing here is a fixture."}
              action={urlState.query || urlState.filter !== "all"
                ? { label: "Clear scope", onSelect: () => updateUrl({ query: "", filter: "all", selected: "" }) }
                : { label: `Create ${FAMILY_LABELS[primaryFamily]}`, onSelect: () => openCreate(primaryFamily) }}
            />
          ) : (
            <div className={styles.ledgerFrame}>
              <div className={styles.ledgerScroller}>
                <table className={styles.ledger}>
                  <thead>
                    <tr>
                      <th style={{ width: isDecisionView ? "46%" : "45%" }}>{isDecisionView ? "Decision" : "Object"}</th>
                      {!isDecisionView && <th>Type</th>}
                      <th>{isDecisionView ? "Decision state" : "State"}</th>
                      <th>Domain</th>
                      <th>Due</th>
                      <th>{isDecisionView ? "Review state" : "Review"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopedItems.map((item) => {
                      const selected = item.id === urlState.selected;
                      const checked = selectedIds.has(item.id);
                      return (
                        <tr className={[styles.ledgerRow, selected && styles.selectedRow].filter(Boolean).join(" ")} key={item.id}>
                          <td data-primary="true">
                            <div className={styles.identityCell}>
                              <label className={styles.rowCheckbox} onClick={(event) => event.stopPropagation()}>
                                <span className={styles.visuallyHidden}>Select {item.title} for batch actions</span>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setSelectedIds((current) => {
                                    const next = new Set(current);
                                    if (next.has(item.id)) next.delete(item.id);
                                    else next.add(item.id);
                                    return next;
                                  })}
                                />
                              </label>
                              <button type="button" className={styles.rowBody} onClick={() => selectItem(item)} aria-pressed={selected}>
                                <span className={styles.rowTitle}>{item.title}</span>
                                {isDecisionView && item.source === "native" && item.objectType === "decision" ? (
                                  <DecisionPrompts question={item.question} decision={item.finalDecision} compact />
                                ) : (
                                  <span className={styles.rowSummary}>{summaryForItem(item)}</span>
                                )}
                              </button>
                            </div>
                          </td>
                          {!isDecisionView && <td data-label="Type"><PersonalOpsStatusChip tone={item.source === "legacy-goal" ? "attention" : item.objectType === "follow_up" && item.sourceRefs.some((ref) => ref.module === "people") ? "people" : "neutral"}>{typeLabel(item)}</PersonalOpsStatusChip></td>}
                          <td data-label={isDecisionView ? "Decision state" : "State"}><PersonalOpsStatusChip tone={toneForState(stateLabel(item))}>{cleanLabel(stateLabel(item))}</PersonalOpsStatusChip></td>
                          <td data-label="Domain">{item.source === "legacy-goal" ? item.entity : item.domain}</td>
                          <td data-label="Due" className={styles.mono}>{item.source === "legacy-goal" ? "Bridge" : formatDate(item.dueAt)}</td>
                          <td data-label={isDecisionView ? "Review state" : "Review"}>{item.source === "legacy-goal" ? "Legacy" : cleanLabel(item.objectType === "decision" ? decisionReviewState(item) : item.review)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <footer className={styles.ledgerFooter}>
                <span>{scopedItems.length} of {baseItems.length} objects · row selects inspector · checkbox selects batch</span>
                {selectedIds.size > 0 && <button type="button" onClick={() => setSelectedIds(new Set())}>Clear {selectedIds.size} selected</button>}
              </footer>
            </div>
          )}
        </div>

      </main>

      {selectedItem && (
        <>
          <button className={[styles.scrim, styles.inspectorScrim].join(" ")} data-open={mobileInspectorOpen || undefined} onClick={() => setMobileInspectorOpen(false)} aria-label="Close inspector" />
          <InspectorRail
            className={styles.inspector}
            overlay
            overlayOpen={mobileInspectorOpen}
            onRequestClose={() => setMobileInspectorOpen(false)}
            busy={busy}
          >
            <header className={styles.inspectorHeader}>
              <div className={styles.inspectorTop}>
                <span className={styles.objectIcon} aria-hidden="true">{selectedItem.source === "legacy-goal" ? "G" : selectedItem.objectType === "decision" ? "D" : selectedItem.objectType === "obligation" ? "O" : selectedItem.objectType === "follow_up" ? "F" : "G"}</span>
                <div>
                  <h2>{selectedItem.title}</h2>
                  <p>{typeLabel(selectedItem)} · {selectedItem.source === "legacy-goal" ? selectedItem.projectLabel : selectedItem.domain}</p>
                </div>
                <button type="button" className={styles.closeButton} onClick={() => { updateUrl({ selected: "" }); setMobileInspectorOpen(false); }} aria-label="Close inspector">×</button>
              </div>
              <div className={styles.chipRow}>
                <PersonalOpsStatusChip tone={toneForState(stateLabel(selectedItem))}>{cleanLabel(stateLabel(selectedItem))}</PersonalOpsStatusChip>
                {selectedItem.source === "native" && selectedItem.objectType === "decision" && <PersonalOpsStatusChip tone={toneForState(decisionReviewState(selectedItem))}>{cleanLabel(decisionReviewState(selectedItem))}</PersonalOpsStatusChip>}
                {selectedItem.source === "native" && selectedItem.objectType !== "follow_up" && selectedItem.objectType !== "decision" && <PersonalOpsStatusChip tone={toneForState(selectedItem.health)}>{cleanLabel(selectedItem.health)}</PersonalOpsStatusChip>}
                {selectedItem.source === "legacy-goal" && <PersonalOpsStatusChip tone="attention">Existing Current Goals</PersonalOpsStatusChip>}
              </div>
              <div className={styles.inspectorTabs}>
                <DetailTabs id="personal-ops-inspector" tabs={INSPECTOR_TABS} activeTab={urlState.tab} onTabChange={(tab) => updateUrl({ tab: tab as PersonalOpsTab })} />
              </div>
            </header>

            <div className={styles.inspectorScroll}>
              {selectedItem.source === "legacy-goal" ? (
                <div className={styles.panelGrid}>
                  <PersonalOpsStateGrid items={[
                    { id: "state", label: "Completion", value: selectedItem.done ? "Complete" : "Active", tone: selectedItem.done ? "positive" : "attention" },
                    { id: "owner", label: "Owner", value: selectedItem.entity },
                    { id: "source", label: "Persistence", value: "Current Goals" },
                    { id: "scope", label: "Project", value: selectedItem.projectLabel }
                  ]} />
                  <PersonalOpsPanel title="Compatibility bridge" wide>
                    <p>This goal remains in the existing entity-goals store so the current entity hubs keep their exact behavior. It is not presented as a native Goal with invented key results, cadence, or health.</p>
                  </PersonalOpsPanel>
                </div>
              ) : (
                <>
                  <PersonalOpsStateGrid items={selectedItem.objectType === "follow_up" ? [
                    { id: "status", label: "Status", value: cleanLabel(selectedItem.followUpState), tone: toneForState(selectedItem.followUpState) },
                    { id: "due", label: "Due", value: formatDate(selectedItem.dueAt) },
                    { id: "priority", label: "Priority", value: cleanLabel(selectedItem.priority), tone: toneForState(selectedItem.priority) },
                    { id: "timing", label: "Timing", value: cleanLabel(selectedItem.cadence), tone: toneForState(selectedItem.cadence) }
                  ] : selectedItem.objectType === "decision" ? [
                    { id: "decision", label: "Decision state", value: cleanLabel(selectedItem.decisionState), tone: toneForState(selectedItem.decisionState) },
                    { id: "review", label: "Review state", value: cleanLabel(decisionReviewState(selectedItem)), tone: toneForState(decisionReviewState(selectedItem)) },
                    { id: "due", label: "Due", value: formatDate(selectedItem.dueAt) },
                    { id: "reversibility", label: "Reversibility", value: cleanLabel(selectedItem.reversibility) }
                  ] : [
                    { id: "lifecycle", label: "Lifecycle", value: cleanLabel(selectedItem.lifecycle), tone: toneForState(selectedItem.lifecycle) },
                    { id: "health", label: "Health", value: cleanLabel(selectedItem.health), tone: toneForState(selectedItem.health) },
                    { id: "review", label: "Review", value: cleanLabel(selectedItem.review), tone: toneForState(selectedItem.review) },
                    { id: "cadence", label: "Cadence", value: cleanLabel(selectedItem.cadence), tone: toneForState(selectedItem.cadence) }
                  ]} />
                  <div className={styles.panelGrid}>
                    {urlState.tab === "overview" && (
                      selectedItem.objectType === "decision" ? (
                        <>
                          <PersonalOpsPanel title="Question and decision" wide>
                            <DecisionPrompts question={selectedItem.question} decision={selectedItem.finalDecision} />
                          </PersonalOpsPanel>
                          {selectedItem.description && <PersonalOpsPanel title="Context" wide><p>{selectedItem.description}</p></PersonalOpsPanel>}
                          {selectedItem.decisionState === "deferred" && (
                            <PersonalOpsPanel title="Deferred until review" wide>
                              <p>{selectedItem.deferReason || "No deferral context recorded."}</p>
                              <small className={styles.mutedCopy}>Revisit {formatDate(selectedItem.revisitAt)}</small>
                            </PersonalOpsPanel>
                          )}
                        </>
                      ) : (
                        <>
                          <PersonalOpsPanel title={selectedItem.objectType === "goal" ? "Outcome" : selectedItem.objectType === "obligation" ? "Consequence" : "Description"} wide>
                            <p>{summaryForItem(selectedItem)}</p>
                          </PersonalOpsPanel>
                          {selectedItem.description && selectedItem.objectType !== "follow_up" && <PersonalOpsPanel title="Description" wide><p>{selectedItem.description}</p></PersonalOpsPanel>}
                          <PersonalOpsPanel title="Next safe action" wide>
                            <p>{completionDisabledReason || (selectedItem.lifecycle === "complete" ? "This object is complete; archive it when it should leave active history." : "Completion requirements are satisfied. Review the object, then complete it explicitly.")}</p>
                          </PersonalOpsPanel>
                        </>
                      )
                    )}

                    {urlState.tab === "details" && selectedItem.objectType === "goal" && (
                      <PersonalOpsPanel title="Key results" meta={`${selectedItem.keyResults.filter((item) => item.complete).length}/${selectedItem.keyResults.length} complete`} wide>
                        {selectedItem.keyResults.length ? (
                          <ul>{selectedItem.keyResults.map((result) => <li key={result.id}><label><input type="checkbox" checked={result.complete} onChange={() => void toggleKeyResult(selectedItem, result.id)} /> {result.title}</label></li>)}</ul>
                        ) : <p>No key results yet. Completion remains explainable: add measurable results or keep this Goal open.</p>}
                      </PersonalOpsPanel>
                    )}

                    {urlState.tab === "details" && selectedItem.objectType === "decision" && (
                      <>
                        <PersonalOpsPanel title="Decision record" wide>
                          <dl><dt>Review state</dt><dd>{cleanLabel(decisionReviewState(selectedItem))}</dd><dt>Decision state</dt><dd>{cleanLabel(selectedItem.decisionState)}</dd><dt>Reversibility</dt><dd>{cleanLabel(selectedItem.reversibility)}</dd><dt>Due</dt><dd>{formatDate(selectedItem.dueAt)}</dd></dl>
                        </PersonalOpsPanel>
                        {selectedItem.rationale && <PersonalOpsPanel title="Supporting rationale" wide><p>{selectedItem.rationale}</p></PersonalOpsPanel>}
                      </>
                    )}

                    {urlState.tab === "details" && selectedItem.objectType === "obligation" && (
                      <>
                        <PersonalOpsPanel title="Evidence" meta="Click to cycle missing → received → verified" wide>
                          {selectedItem.requiredEvidence.length ? <ul>{selectedItem.requiredEvidence.map((requirement) => <li key={requirement.id}><button type="button" className={styles.button} onClick={() => void toggleEvidence(selectedItem, requirement.id)}>{cleanLabel(requirement.state)} · {requirement.label}</button></li>)}</ul> : <p>No evidence requirements recorded.</p>}
                        </PersonalOpsPanel>
                        <PersonalOpsPanel title="Completion criteria" wide>
                          {selectedItem.completionCriteria.length ? <ul>{selectedItem.completionCriteria.map((criterion) => <li key={criterion.id}><label><input type="checkbox" checked={criterion.satisfied} onChange={() => void toggleCriterion(selectedItem, criterion.id)} /> {criterion.label}</label></li>)}</ul> : <p>Add at least one completion criterion before completing this obligation.</p>}
                        </PersonalOpsPanel>
                      </>
                    )}

                    {urlState.tab === "details" && selectedItem.objectType === "follow_up" && (
                      <>
                        <PersonalOpsPanel title="Outcome" wide><p>{selectedItem.outcome || "No outcome recorded. This is optional."}</p></PersonalOpsPanel>
                        <PersonalOpsPanel title="Completion criterion"><p>{selectedItem.completionCriteria || "No criterion recorded."}</p></PersonalOpsPanel>
                        <PersonalOpsPanel title="Follow-up type"><p>{cleanLabel(selectedItem.followUpType)}</p></PersonalOpsPanel>
                      </>
                    )}

                    {urlState.tab === "links" && (
                      <PersonalOpsPanel title="Native links" meta={`${selectedItem.sourceRefs.length + selectedItem.linkedRefs.length} total`} wide>
                        {selectedItem.sourceRefs.length + selectedItem.linkedRefs.length ? (
                          <ul>{[...selectedItem.sourceRefs, ...selectedItem.linkedRefs].map((ref) => <li key={`${ref.module}:${ref.objectType}:${ref.containerObjectId || "root"}:${ref.objectId}`}><Link href={ref.route}>{ref.label}</Link> <small>({cleanLabel(ref.module)})</small></li>)}</ul>
                        ) : <p>No links. Creating a link never moves or deletes either object.</p>}
                      </PersonalOpsPanel>
                    )}

                    {urlState.tab === "activity" && (
                      <PersonalOpsPanel title="Audit activity" meta={`${selectedItem.history.length} events`} wide>
                        <ol>{selectedItem.history.slice().reverse().map((entry) => <li key={entry.id}><strong>{cleanLabel(entry.action)}</strong> · <span className={styles.mono}>{formatTimestamp(entry.occurredAt)}</span>{entry.detail ? ` · ${entry.detail}` : ""}</li>)}</ol>
                      </PersonalOpsPanel>
                    )}

                    {urlState.tab === "properties" && (
                      <PersonalOpsPanel title="Properties" wide>
                        <dl><dt>ID</dt><dd className={styles.mono}>{selectedItem.id}</dd><dt>Owner</dt><dd>{selectedItem.owner}</dd><dt>Domain</dt><dd>{selectedItem.domain}</dd><dt>Priority</dt><dd>{cleanLabel(selectedItem.priority)}</dd><dt>Created</dt><dd className={styles.mono}>{formatTimestamp(selectedItem.createdAt)}</dd><dt>Updated</dt><dd className={styles.mono}>{formatTimestamp(selectedItem.updatedAt)}</dd>{selectedItem.objectType !== "follow_up" && selectedItem.objectType !== "decision" && selectedItem.cadenceRule && <><dt>Cadence rule</dt><dd>{selectedItem.cadenceRule} (manual)</dd></>}</dl>
                      </PersonalOpsPanel>
                    )}
                  </div>
                </>
              )}
            </div>

            <footer className={styles.actionFooter}>
              {selectedItem.source === "legacy-goal" ? (
                <>
                  <span><small>Existing persistence</small></span>
                  <button type="button" className={styles.primaryButton} onClick={() => void toggleLegacyGoal(selectedItem)} disabled={busy}>{selectedItem.done ? "Reopen goal" : "Mark complete"}</button>
                </>
              ) : (
                <>
                  <span>{completionDisabledReason && <small>{completionDisabledReason}</small>}</span>
                  <button type="button" className={styles.button} onClick={() => openEdit(selectedItem)} disabled={busy || selectedItem.lifecycle === "archived"}>Edit</button>
                  {selectedItem.lifecycle === "archived" ? (
                    <button type="button" className={styles.primaryButton} onClick={() => setPendingAction({ type: "restore", item: selectedItem })} disabled={busy}>Restore</button>
                  ) : selectedItem.lifecycle === "complete" ? (
                    <button type="button" className={styles.button} onClick={() => setPendingAction({ type: "archive", item: selectedItem })} disabled={busy}>Archive</button>
                  ) : (
                    <button type="button" className={styles.primaryButton} onClick={() => setPendingAction({ type: "complete", item: selectedItem })} disabled={busy || Boolean(completionDisabledReason)} title={completionDisabledReason || undefined}>Complete</button>
                  )}
                </>
              )}
            </footer>
          </InspectorRail>
        </>
      )}

      {openForm && draft && (
        <ObjectForm
          form={openForm}
          draft={draft}
          setDraft={setDraft}
          onSubmit={(event) => void submitForm(event)}
          onClose={requestCloseForm}
          busy={busy}
          error={error}
          notice={notice}
          sourceDuplicates={sourceDuplicates}
        />
      )}

      <ConfirmationSheet
        open={Boolean(pendingAction)}
        onOpenChange={(open) => { if (!open && !busy) setPendingAction(null); }}
        onConfirm={confirmPendingAction}
        title={pendingAction?.type === "discard" ? "Discard unsaved changes?" : pendingAction?.type === "archive" ? "Archive this object?" : pendingAction?.type === "restore" ? "Restore this object?" : "Complete this object?"}
        description={pendingAction?.type === "archive" ? "Archiving is reversible and preserves links, history, and provenance." : pendingAction?.type === "complete" ? pendingAction.item.objectType === "follow_up" ? "This marks the follow-up complete and keeps its history. An outcome is optional." : "This records a native completion event after object-specific requirements pass." : undefined}
        consequences={pendingAction?.type === "discard" ? ["The current form input will be lost."] : pendingAction?.type === "archive" ? ["The object leaves active views.", "No linked object is deleted."] : undefined}
        confirmLabel={pendingAction?.type === "discard" ? "Discard changes" : pendingAction?.type === "archive" ? "Archive" : pendingAction?.type === "restore" ? "Restore" : "Complete"}
        tone={pendingAction?.type === "discard" || pendingAction?.type === "archive" ? "danger" : "default"}
        busy={busy}
        confirmDisabled={pendingAction?.type === "archive" && !archiveReason.trim()}
        confirmDisabledReason={pendingAction?.type === "archive" && !archiveReason.trim() ? "Add an archive reason." : undefined}
      >
        {pendingAction?.type === "archive" && (
          <label><span>Archive reason</span><textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} rows={3} required /></label>
        )}
      </ConfirmationSheet>

      <SharedAIDock
        open={urlState.ai}
        onOpenChange={(open) => updateUrl({ ai: open })}
        context={{
          module: "personal_ops",
          object: selectedNative ? createNativeObjectRef({ module: "personal_ops", objectType: selectedNative.objectType, objectId: selectedNative.id, label: selectedNative.title }) : null,
          activeTab: urlState.tab,
          visibleScope: `${VIEW_COPY[initialView].title} · ${urlState.filter}`,
          allowedActions: ["Draft a proposal", "Summarize context", "Suggest links for review"]
        }}
      />
    </div>
  );
}
