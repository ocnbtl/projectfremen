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
import { createPersonalOpsRepository } from "../../lib/modules/personal-ops/repository";
import type {
  CaptureProcessingOutputDraft,
  CaptureProcessingPreview,
  LegacyPersonalOpsCandidate,
  PersonalOpsCaptureItem,
  PersonalOpsDestinationDraft,
  PersonalOpsRoutine,
  PersonalOpsSecondaryCreateInputByFamily,
  PersonalOpsSecondaryFamily,
  PersonalOpsSecondaryObject,
  PersonalOpsSecondaryObjectByFamily,
  PersonalOpsSecondaryUpdateInputByFamily,
  PersonalOpsState,
  PersonalOpsTemplate,
  RoutineRunPreview,
  TemplateField,
  TemplateFieldValue,
  TemplateTestPreview
} from "../../lib/modules/personal-ops/types";
import { createNativeObjectRef } from "../../lib/native-objects/routes";
import {
  parsePersonalOpsUrlState,
  serializePersonalOpsUrlState,
  type PersonalOpsSort,
  type PersonalOpsTab
} from "../../lib/native-objects/url-state";
import InspectorRail from "../admin-shell/InspectorRail";
import SharedAIDock from "../admin-shell/SharedAIDock";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import DetailTabs, { DetailTabPanel, type DetailTab } from "../operational/DetailTabs";
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
import styles from "./PersonalOpsWorkspace.module.css";

export type PersonalOpsAdvancedView = "routines" | "inbox" | "templates";

export type PersonalOpsAdvancedWorkspaceProps = {
  initialState: PersonalOpsState;
  initialView: PersonalOpsAdvancedView;
  legacyCandidates?: LegacyPersonalOpsCandidate[];
  initialLoadError?: string;
};

type LegacyCaptureProjection = {
  id: string;
  source: "legacy";
  title: string;
  domain: string;
  updatedAt?: string;
  candidate: LegacyPersonalOpsCandidate;
};

type AdvancedListItem = PersonalOpsSecondaryObject | LegacyCaptureProjection;

type AdvancedDraft = {
  title: string;
  summary: string;
  domain: string;
  owner: string;
  health: "healthy" | "attention" | "blocked" | "stale" | "unknown";
  review: "not_required" | "not_reviewed" | "needs_review" | "in_review" | "reviewed" | "waived";
  cadence: "current" | "due_soon" | "overdue" | "dormant" | "paused";
  priority: "low" | "medium" | "high" | "critical";
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "annual" | "custom";
  interval: string;
  timezone: string;
  reminderWindowDays: string;
  nextRunAt: string;
  completionCriteria: string;
  generateFollowUp: boolean;
  generateObligation: boolean;
  rawText: string;
  triageState: "untriaged" | "needs_context" | "ready" | "processed";
  missingContext: string;
  availability: "draft" | "active" | "paused" | "deprecated";
  templateTarget: "goals" | "decisions" | "obligations" | "followUps";
  templateFields: string;
};

type OpenForm = {
  family: PersonalOpsSecondaryFamily;
  item?: PersonalOpsSecondaryObject;
};

type PendingAction =
  | { type: "discard" }
  | { type: "archive"; item: PersonalOpsSecondaryObject }
  | { type: "restore"; item: PersonalOpsSecondaryObject }
  | { type: "activate"; item: PersonalOpsTemplate }
  | { type: "deprecate"; item: PersonalOpsTemplate }
  | { type: "activate-routine"; item: PersonalOpsRoutine }
  | { type: "pause-routine"; item: PersonalOpsRoutine }
  | { type: "resume-routine"; item: PersonalOpsRoutine };

type RoutineOperation = {
  kind: "routine";
  item: PersonalOpsRoutine;
  preview: RoutineRunPreview;
  operationKey: string;
  input: { scheduledFor?: string; ruleIds: string[] };
};

type CaptureSetupOperation = {
  kind: "capture-setup";
  item: PersonalOpsCaptureItem;
  decision: boolean;
  followUp: boolean;
  obligation: boolean;
};

type CapturePreviewOperation = {
  kind: "capture-preview";
  item: PersonalOpsCaptureItem;
  preview: CaptureProcessingPreview;
  outputs: CaptureProcessingOutputDraft[];
  operationKey: string;
};

type TemplateValuesOperation = {
  kind: "template-values";
  item: PersonalOpsTemplate;
  values: Record<string, TemplateFieldValue>;
};

type TemplatePreviewOperation = {
  kind: "template-preview";
  item: PersonalOpsTemplate;
  preview: TemplateTestPreview;
  values: Record<string, TemplateFieldValue>;
  definitionId?: string;
  operationKey: string;
};

type Operation =
  | RoutineOperation
  | CaptureSetupOperation
  | CapturePreviewOperation
  | TemplateValuesOperation
  | TemplatePreviewOperation;

const VIEW_CONFIG: Record<PersonalOpsAdvancedView, {
  family: PersonalOpsSecondaryFamily;
  title: string;
  description: string;
  singular: string;
}> = {
  routines: {
    family: "routines",
    title: "Routines",
    description: "Recurring operating rhythms, cadence rules, and generated work.",
    singular: "Routine"
  },
  inbox: {
    family: "captures",
    title: "Capture Inbox",
    description: "Raw inputs, quick captures, and triage into native Personal Ops objects.",
    singular: "Capture"
  },
  templates: {
    family: "templates",
    title: "Templates",
    description: "Reusable creation patterns for operating objects, triage, cadence, and review work.",
    singular: "Template"
  }
};

const ROUTINE_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "cadence", label: "Cadence" },
  { id: "generated-items", label: "Generated Items" },
  { id: "links", label: "Links" },
  { id: "history", label: "History" },
  { id: "rules", label: "Rules" },
  { id: "properties", label: "Properties" }
];

const CAPTURE_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "triage", label: "Triage" },
  { id: "links", label: "Links" },
  { id: "source", label: "Source" },
  { id: "activity", label: "Activity" },
  { id: "properties", label: "Properties" }
];

const TEMPLATE_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "fields", label: "Fields" },
  { id: "usage", label: "Usage" },
  { id: "links", label: "Links" },
  { id: "rules", label: "Rules" },
  { id: "activity", label: "Activity" },
  { id: "properties", label: "Properties" }
];

function lines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function cleanLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toLocalDate(value?: string) {
  if (!value) return "";
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

function formatDate(value?: string, fallback = "No date") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
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

function isLegacy(item: AdvancedListItem): item is LegacyCaptureProjection {
  return "source" in item && item.source === "legacy";
}

function toneFor(value: string): PersonalOpsTone {
  if (["active", "healthy", "ready", "reviewed", "current", "processed"].includes(value)) return "positive";
  if (["blocked", "overdue", "invalid"].includes(value)) return "danger";
  if (["attention", "needs_attention", "needs_context", "due_soon", "paused", "deprecated"].includes(value)) return "attention";
  if (["needs_review", "not_reviewed", "in_review"].includes(value)) return "review";
  return "neutral";
}

function lifecycleFor(item: AdvancedListItem) {
  return isLegacy(item) ? "compatibility" : item.lifecycle;
}

function stateFor(item: AdvancedListItem) {
  if (isLegacy(item)) return "unclassified";
  if (item.objectType === "capture_item") return item.triageState;
  if (item.objectType === "template") return item.availability;
  return item.cadence;
}

function summaryFor(item: AdvancedListItem) {
  if (isLegacy(item)) return item.candidate.reason;
  if (item.objectType === "routine") return item.summary || "Manual recurring operating rhythm";
  if (item.objectType === "capture_item") return item.rawText;
  return item.summary || "Reusable native-object creation pattern";
}

function domainFor(item: AdvancedListItem) {
  return item.domain || "Personal Admin";
}

function dateFor(item: AdvancedListItem) {
  if (isLegacy(item)) return item.updatedAt;
  if (item.objectType === "routine") return item.nextRunAt;
  if (item.objectType === "capture_item") return item.source.capturedAt;
  return item.lastUsedAt || item.updatedAt;
}

function refsFor(item: AdvancedListItem) {
  if (isLegacy(item)) return [];
  if (item.objectType === "capture_item") return [...item.linkedRefs, ...item.processedRefs];
  return item.linkedRefs;
}

function priorityFor(item: AdvancedListItem) {
  return !isLegacy(item) && item.objectType === "routine" ? item.priority : "medium";
}

function familyForObject(item: PersonalOpsSecondaryObject): PersonalOpsSecondaryFamily {
  if (item.objectType === "routine") return "routines";
  if (item.objectType === "capture_item") return "captures";
  return "templates";
}

function replaceSecondary<Family extends PersonalOpsSecondaryFamily>(
  state: PersonalOpsState,
  family: Family,
  item: PersonalOpsSecondaryObjectByFamily[Family]
): PersonalOpsState {
  const collection = state[family] as PersonalOpsSecondaryObjectByFamily[Family][];
  const exists = collection.some((existing) => existing.id === item.id);
  return {
    ...state,
    [family]: exists
      ? collection.map((existing) => existing.id === item.id ? item : existing)
      : [item, ...collection]
  };
}

function defaultFieldsFor(target: AdvancedDraft["templateTarget"]): TemplateField[] {
  const semanticKey = target === "goals" ? "outcome" : target === "decisions" ? "question" : target === "obligations" ? "consequence" : "context";
  return [
    { id: `field-${crypto.randomUUID()}`, key: "title", label: "Title", type: "short_text", required: true, options: [] },
    { id: `field-${crypto.randomUUID()}`, key: semanticKey, label: cleanLabel(semanticKey), type: "long_text", required: true, options: [] }
  ];
}

function fieldsToText(fields: readonly TemplateField[]) {
  return fields.map((field) => [field.key, field.label, field.required ? "required" : "optional", field.defaultValue ?? ""].join(" | ")).join("\n");
}

function parseTemplateFields(value: string): Array<Partial<TemplateField> & Pick<TemplateField, "key" | "label" | "type">> {
  return lines(value).map((line) => {
    const [rawKey, rawLabel, rawRequired, rawDefault] = line.split("|").map((part) => part.trim());
    const key = rawKey.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
    return {
      key,
      label: rawLabel || cleanLabel(key),
      type: "short_text" as const,
      required: rawRequired.toLowerCase() !== "optional",
      defaultValue: rawDefault || undefined,
      options: []
    };
  });
}

function destinationForTemplate(target: AdvancedDraft["templateTarget"], domain: string): PersonalOpsDestinationDraft {
  if (target === "goals") return { module: "personal_ops", family: "goals", input: { title: "{{title}}", outcome: "{{outcome}}", domain, lifecycle: "draft" } };
  if (target === "decisions") return { module: "personal_ops", family: "decisions", input: { title: "{{title}}", question: "{{question}}", domain, lifecycle: "draft", decisionState: "open" } };
  if (target === "obligations") return { module: "personal_ops", family: "obligations", input: { title: "{{title}}", consequence: "{{consequence}}", domain, lifecycle: "draft", obligationState: "open" } };
  return { module: "personal_ops", family: "followUps", input: { title: "{{title}}", context: "{{context}}", domain, lifecycle: "draft", followUpType: "other", followUpState: "open" } };
}

function templateTarget(item?: PersonalOpsTemplate): AdvancedDraft["templateTarget"] {
  const destination = item?.generatedDefinitions[0]?.destination;
  return destination?.module === "personal_ops" ? destination.family : "decisions";
}

function defaultDraft(family: PersonalOpsSecondaryFamily, item?: PersonalOpsSecondaryObject): AdvancedDraft {
  const target = item?.objectType === "template" ? templateTarget(item) : "decisions";
  const templateFields = item?.objectType === "template" ? item.fields : defaultFieldsFor(target);
  return {
    title: item?.title || "",
    summary: item?.objectType === "routine" || item?.objectType === "template" ? item.summary : "",
    domain: item?.domain || "Personal Admin",
    owner: item?.owner || "You",
    health: item?.health === "healthy" || item?.health === "attention" || item?.health === "blocked" || item?.health === "stale" || item?.health === "unknown" ? item.health : "unknown",
    review: item?.review || "not_reviewed",
    cadence: item?.objectType === "routine" ? item.cadence : "dormant",
    priority: item?.objectType === "routine" ? item.priority : "medium",
    frequency: item?.objectType === "routine" ? item.cadenceRule.frequency : "weekly",
    interval: item?.objectType === "routine" ? String(item.cadenceRule.interval) : "1",
    timezone: item?.objectType === "routine" ? item.cadenceRule.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    reminderWindowDays: item?.objectType === "routine" ? String(item.cadenceRule.reminderWindowDays) : "2",
    nextRunAt: item?.objectType === "routine" ? toLocalDate(item.nextRunAt) : "",
    completionCriteria: item?.objectType === "routine" ? item.completionCriteria.join("\n") : "",
    generateFollowUp: item?.objectType === "routine" ? item.generationRules.some((rule) => rule.destination.module === "personal_ops" && rule.destination.family === "followUps") : true,
    generateObligation: item?.objectType === "routine" ? item.generationRules.some((rule) => rule.destination.module === "personal_ops" && rule.destination.family === "obligations") : false,
    rawText: item?.objectType === "capture_item" ? item.rawText : "",
    triageState: item?.objectType === "capture_item" ? item.triageState : "untriaged",
    missingContext: item?.objectType === "capture_item" ? item.missingContext.join("\n") : "",
    availability: item?.objectType === "template" ? item.availability : "draft",
    templateTarget: target,
    templateFields: fieldsToText(templateFields)
  };
}

function createSecondaryInput(form: OpenForm, draft: AdvancedDraft): PersonalOpsSecondaryCreateInputByFamily[PersonalOpsSecondaryFamily] {
  if (form.family === "routines") {
    const generationRules = [];
    if (draft.generateFollowUp) generationRules.push({ label: "Routine follow-up", enabled: true, destination: { module: "personal_ops" as const, family: "followUps" as const, input: { title: `${draft.title} follow-up`, followUpType: "recurring_cadence" as const, followUpState: "open" as const, context: `Generated from routine: ${draft.title}`, domain: draft.domain, lifecycle: "draft" as const } } });
    if (draft.generateObligation) generationRules.push({ label: "Routine obligation", enabled: true, destination: { module: "personal_ops" as const, family: "obligations" as const, input: { title: `${draft.title} obligation`, consequence: `Recurring obligation generated from ${draft.title}.`, domain: draft.domain, lifecycle: "draft" as const, obligationState: "open" as const, completionCriteria: [{ label: "Review and complete this routine output", satisfied: false }] } } });
    return {
      title: draft.title,
      summary: draft.summary,
      domain: draft.domain,
      owner: draft.owner,
      health: draft.health,
      review: draft.review,
      cadence: draft.cadence,
      priority: draft.priority,
      cadenceRule: {
        frequency: draft.frequency,
        interval: Math.max(1, Number(draft.interval) || 1),
        timezone: draft.timezone,
        reminderWindowDays: Math.max(0, Number(draft.reminderWindowDays) || 0),
        trigger: "manual",
        autoCreateNext: false
      },
      generationRules,
      completionCriteria: lines(draft.completionCriteria),
      nextRunAt: toIsoDate(draft.nextRunAt)
    };
  }
  if (form.family === "captures") {
    return {
      rawText: draft.rawText,
      title: draft.title || undefined,
      domain: draft.domain,
      owner: draft.owner,
      health: draft.health,
      review: draft.review,
      triageState: draft.triageState,
      source: { kind: "quick_capture", label: "Manual quick capture" },
      missingContext: lines(draft.missingContext)
    };
  }
  return {
    title: draft.title,
    summary: draft.summary,
    domain: draft.domain,
    owner: draft.owner,
    lifecycle: "draft",
    availability: "draft",
    health: "unknown",
    review: draft.review,
    fields: parseTemplateFields(draft.templateFields),
    generatedDefinitions: [{ label: `${cleanLabel(draft.templateTarget)} output`, enabled: true, destination: destinationForTemplate(draft.templateTarget, draft.domain) }]
  };
}

function updateSecondaryInput(form: OpenForm, draft: AdvancedDraft): PersonalOpsSecondaryUpdateInputByFamily[PersonalOpsSecondaryFamily] {
  const created = createSecondaryInput(form, draft);
  if (form.family === "captures") {
    const capture = created as PersonalOpsSecondaryCreateInputByFamily["captures"];
    return {
      title: capture.title,
      domain: capture.domain,
      owner: capture.owner,
      health: capture.health,
      review: capture.review,
      triageState: capture.triageState,
      missingContext: capture.missingContext
    };
  }
  return created as PersonalOpsSecondaryUpdateInputByFamily[PersonalOpsSecondaryFamily];
}

function Field({ label, children, hint, full = false }: { label: string; children: ReactNode; hint?: string; full?: boolean }) {
  return (
    <label className={[styles.field, full && styles.fullWidth].filter(Boolean).join(" ")}>
      <span>{label}</span>
      {children}
      {hint && <small className={styles.fieldHint}>{hint}</small>}
    </label>
  );
}

function AdvancedObjectForm({
  form,
  draft,
  setDraft,
  onSubmit,
  onClose,
  busy,
  error
}: {
  form: OpenForm;
  draft: AdvancedDraft;
  setDraft: (value: AdvancedDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  busy: boolean;
  error: string;
}) {
  const sheetRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef(draft);
  const label = form.family === "routines" ? "Routine" : form.family === "captures" ? "Capture" : "Template";
  const editing = Boolean(form.item);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
    ) || []);
    controls()[0]?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = controls();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
      previousFocus?.focus();
    };
  }, [onClose]);

  function update<Key extends keyof AdvancedDraft>(key: Key, value: AdvancedDraft[Key]) {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    setDraft(next);
  }

  return (
    <>
      <button type="button" className={styles.scrim} data-open="true" onClick={onClose} aria-label={`Close ${label} form`} />
      <form ref={sheetRef} className={styles.formSheet} onSubmit={onSubmit} role="dialog" aria-modal="true" aria-label={`${editing ? "Edit" : "Create"} ${label}`}>
        <header className={styles.sheetHeader}>
          <div>
            <h2>{editing ? `Edit ${label}` : `New ${label}`}</h2>
            <p>{form.family === "routines" ? "Cadence stays manual until a run is explicitly previewed and confirmed." : form.family === "captures" ? "Raw source is preserved; classification is optional." : "New templates begin as drafts and test without writing objects."}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label={`Close ${label} form`}>×</button>
        </header>
        <div className={styles.sheetScroll}>
          <div className={styles.formGrid}>
            {form.family === "captures" && editing ? (
              <div className={[styles.notice, styles.fullWidth, styles.immutableSource].join(" ")}>
                <strong>Immutable raw capture</strong>
                <p>{form.item?.objectType === "capture_item" ? form.item.rawText : ""}</p>
              </div>
            ) : form.family === "captures" ? (
              <Field label="Raw capture" full hint="Save the unprocessed source first. You can classify it later without changing this text.">
                <textarea value={draft.rawText} onChange={(event) => update("rawText", event.target.value)} required rows={7} maxLength={12000} />
              </Field>
            ) : null}

            <Field label={form.family === "captures" ? "Title (optional)" : "Title"} full>
              <input value={draft.title} onChange={(event) => update("title", event.target.value)} required={form.family !== "captures"} maxLength={240} />
            </Field>
            <Field label="Domain">
              <select value={draft.domain} onChange={(event) => update("domain", event.target.value)}>
                {PERSONAL_OPS_DOMAIN_LABELS.map((domain) => <option key={domain}>{domain}</option>)}
              </select>
            </Field>
            <Field label="Owner">
              <input value={draft.owner} onChange={(event) => update("owner", event.target.value)} maxLength={160} />
            </Field>
            {form.family !== "templates" && (
              <Field label="Health">
                <select value={draft.health} onChange={(event) => update("health", event.target.value as AdvancedDraft["health"])}>
                  <option value="unknown">Unknown</option>
                  <option value="healthy">Healthy</option>
                  <option value="attention">Needs attention</option>
                  <option value="blocked">Blocked</option>
                  <option value="stale">Stale</option>
                </select>
              </Field>
            )}
            <Field label="Review state">
              <select value={draft.review} onChange={(event) => update("review", event.target.value as AdvancedDraft["review"])}>
                <option value="not_reviewed">Not reviewed</option>
                <option value="needs_review">Needs review</option>
                <option value="in_review">In review</option>
                <option value="reviewed">Reviewed</option>
                <option value="not_required">Not required</option>
                <option value="waived">Waived</option>
              </select>
            </Field>

            {form.family === "routines" && (
              <>
                <Field label="Summary" full>
                  <textarea value={draft.summary} onChange={(event) => update("summary", event.target.value)} rows={4} />
                </Field>
                <Field label="Frequency">
                  <select value={draft.frequency} onChange={(event) => update("frequency", event.target.value as AdvancedDraft["frequency"])}>
                    {(["daily", "weekly", "biweekly", "monthly", "quarterly", "annual", "custom"] as const).map((value) => <option value={value} key={value}>{cleanLabel(value)}</option>)}
                  </select>
                </Field>
                <Field label="Interval">
                  <input type="number" min="1" max="365" value={draft.interval} onChange={(event) => update("interval", event.target.value)} required />
                </Field>
                <Field label="Next run">
                  <input type="date" value={draft.nextRunAt} onInput={(event) => update("nextRunAt", event.currentTarget.value)} />
                </Field>
                <Field label="Reminder window (days)">
                  <input type="number" min="0" max="90" value={draft.reminderWindowDays} onChange={(event) => update("reminderWindowDays", event.target.value)} />
                </Field>
                <Field label="Timezone" full>
                  <input value={draft.timezone} onChange={(event) => update("timezone", event.target.value)} required />
                </Field>
                <Field label="Completion criteria" full hint="One run-level criterion per line. Completing a run never completes the Routine definition.">
                  <textarea value={draft.completionCriteria} onChange={(event) => update("completionCriteria", event.target.value)} />
                </Field>
                <fieldset className={[styles.field, styles.fullWidth, styles.choiceGroup].join(" ")}>
                  <legend>Confirmed run may create</legend>
                  <label><input type="checkbox" checked={draft.generateFollowUp} onChange={(event) => update("generateFollowUp", event.target.checked)} /> Draft Follow-up</label>
                  <label><input type="checkbox" checked={draft.generateObligation} onChange={(event) => update("generateObligation", event.target.checked)} /> Draft Obligation</label>
                  <small className={styles.fieldHint}>Cross-module Review, Finance, Note, and Resource writes stay disabled until their destination repositories expose safe create adapters.</small>
                </fieldset>
              </>
            )}

            {form.family === "captures" && (
              <>
                <Field label="Triage state">
                  <select value={draft.triageState} onChange={(event) => update("triageState", event.target.value as AdvancedDraft["triageState"])}>
                    <option value="untriaged">Untriaged</option>
                    <option value="needs_context">Needs context</option>
                    <option value="ready">Ready</option>
                    {form.item?.objectType === "capture_item" && form.item.triageState === "processed" && <option value="processed">Processed</option>}
                  </select>
                </Field>
                <Field label="Missing context" full hint="One missing fact or source per line.">
                  <textarea value={draft.missingContext} onChange={(event) => update("missingContext", event.target.value)} />
                </Field>
                <div className={[styles.notice, styles.fullWidth].join(" ")}>AI classification and file attachment are intentionally unavailable here. AI remains proposal-only; files belong in Media and URLs belong in Resources.</div>
              </>
            )}

            {form.family === "templates" && (
              <>
                <Field label="Summary" full>
                  <textarea value={draft.summary} onChange={(event) => update("summary", event.target.value)} rows={4} />
                </Field>
                <div className={[styles.notice, styles.fullWidth].join(" ")}>Template health is derived from definition validation: drafts begin Unknown, and a successful activation sets Ready. It is not manually edited.</div>
                <Field label="Destination object">
                  <select value={draft.templateTarget} onChange={(event) => {
                    const target = event.target.value as AdvancedDraft["templateTarget"];
                    const next = { ...draftRef.current, templateTarget: target, templateFields: fieldsToText(defaultFieldsFor(target)) };
                    draftRef.current = next;
                    setDraft(next);
                  }} disabled={editing} title={editing ? "Duplicate the draft to change its destination object." : undefined}>
                    <option value="decisions">Decision</option>
                    <option value="followUps">Follow-up</option>
                    <option value="obligations">Obligation</option>
                    <option value="goals">Goal</option>
                  </select>
                </Field>
                <Field label="Field definitions" full hint="One field per line: key | label | required or optional | default. Definitions stay compact and domain-specific.">
                  <textarea value={draft.templateFields} onChange={(event) => update("templateFields", event.target.value)} rows={8} required />
                </Field>
                <div className={[styles.notice, styles.fullWidth].join(" ")}>Save as draft first. Test Creation validates and previews without writing; activation is a separate confirmation.</div>
              </>
            )}
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
        <footer className={styles.formActions}>
          <button type="button" className={styles.button} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : form.family === "templates" ? "Save draft" : `Create ${label}`}</button>
        </footer>
      </form>
    </>
  );
}

function nativeRefFor(item: PersonalOpsSecondaryObject) {
  return createNativeObjectRef({ module: "personal_ops", objectType: item.objectType, objectId: item.id, label: item.title });
}

function captureOutputs(item: PersonalOpsCaptureItem, choices: Pick<CaptureSetupOperation, "decision" | "followUp" | "obligation">): CaptureProcessingOutputDraft[] {
  const source = nativeRefFor(item);
  const outputs: CaptureProcessingOutputDraft[] = [];
  if (choices.decision) outputs.push({
    id: `decision-${crypto.randomUUID()}`,
    excerpt: item.rawText,
    destination: { module: "personal_ops", family: "decisions", input: { title: item.title, question: `What should be decided from this capture?`, description: item.rawText, domain: item.domain, lifecycle: "draft", decisionState: "open", sourceRefs: [source] } }
  });
  if (choices.followUp) outputs.push({
    id: `follow-up-${crypto.randomUUID()}`,
    excerpt: item.rawText,
    destination: { module: "personal_ops", family: "followUps", input: { title: `Follow up: ${item.title}`, context: item.rawText, domain: item.domain, lifecycle: "draft", followUpType: "other", followUpState: "open", sourceRefs: [source] } }
  });
  if (choices.obligation) outputs.push({
    id: `obligation-${crypto.randomUUID()}`,
    excerpt: item.rawText,
    destination: { module: "personal_ops", family: "obligations", input: { title: item.title, consequence: item.rawText, domain: item.domain, lifecycle: "draft", obligationState: "open", sourceRefs: [source], completionCriteria: [{ label: "Resolve the captured obligation", satisfied: false }] } }
  });
  return outputs;
}

function defaultTemplateValues(item: PersonalOpsTemplate): Record<string, TemplateFieldValue> {
  return Object.fromEntries(item.fields.map((field) => [field.key, field.defaultValue ?? ""]));
}

function NativeReferenceList({ refs, empty = "No linked native objects." }: { refs: ReturnType<typeof refsFor>; empty?: string }) {
  if (!refs.length) return <p className={styles.mutedCopy}>{empty}</p>;
  return (
    <ul className={styles.referenceList}>
      {refs.map((ref) => (
        <li key={`${ref.module}:${ref.objectType}:${ref.objectId}`}>
          <Link href={ref.route}>{ref.label}</Link>
          <span>{cleanLabel(ref.module)} · {cleanLabel(ref.objectType)}</span>
        </li>
      ))}
    </ul>
  );
}

function HistoryList({ entries }: { entries: readonly { id: string; action: string; occurredAt: string; actorId: string; detail?: string }[] }) {
  if (!entries.length) return <p className={styles.mutedCopy}>No recorded history yet.</p>;
  return (
    <ol className={styles.historyList}>
      {[...entries].reverse().map((entry) => (
        <li key={entry.id}>
          <span>{cleanLabel(entry.action)}</span>
          <small>{formatTimestamp(entry.occurredAt)} · {entry.actorId}</small>
          {entry.detail && <p>{entry.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

function ProposedInput({ value }: { value?: object }) {
  if (!value) return <p className={styles.mutedCopy}>No writable destination payload is available.</p>;
  return <pre className={styles.proposedInput}>{JSON.stringify(value, null, 2)}</pre>;
}

export default function PersonalOpsAdvancedWorkspace({
  initialState,
  initialView,
  legacyCandidates = [],
  initialLoadError = ""
}: PersonalOpsAdvancedWorkspaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const repository = useMemo(() => createPersonalOpsRepository(), []);
  const urlState = useMemo(() => parsePersonalOpsUrlState(searchParams), [searchParams]);
  const config = VIEW_CONFIG[initialView];
  const [state, setState] = useState(initialState);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [queryDraft, setQueryDraft] = useState(urlState.query);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(Boolean(urlState.selected));
  const [openForm, setOpenForm] = useState<OpenForm | null>(null);
  const [draft, setDraft] = useState<AdvancedDraft | null>(null);
  const [formInitial, setFormInitial] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [operation, setOperation] = useState<Operation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateUrl = useCallback((patch: Partial<ReturnType<typeof parsePersonalOpsUrlState>>, push = false) => {
    const params = serializePersonalOpsUrlState({ ...urlState, ...patch }, searchParams);
    const target = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    if (push) router.push(target, { scroll: false });
    else router.replace(target, { scroll: false });
  }, [pathname, router, searchParams, urlState]);

  useEffect(() => {
    setQueryDraft(urlState.query);
  }, [urlState.query]);

  useEffect(() => () => {
    if (queryTimer.current) clearTimeout(queryTimer.current);
  }, []);

  useEffect(() => {
    if (!openForm || !draft) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (JSON.stringify(draft) === formInitial) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [draft, formInitial, openForm]);

  const legacyCaptures = useMemo<LegacyCaptureProjection[]>(() => legacyCandidates
    .filter((candidate) => candidate.classification === "unclassified_capture")
    .map((candidate) => ({
      id: `legacy-capture:${candidate.legacyPersonalRecordId}`,
      source: "legacy",
      title: candidate.title,
      domain: candidate.source.domain,
      updatedAt: candidate.source.updatedAt,
      candidate
    })), [legacyCandidates]);

  const baseItems = useMemo<AdvancedListItem[]>(() => {
    if (initialView === "routines") return state.routines;
    if (initialView === "templates") return state.templates;
    return [...state.captures, ...legacyCaptures];
  }, [initialView, legacyCaptures, state.captures, state.routines, state.templates]);

  const queryItems = useMemo(() => {
    const query = urlState.query.trim().toLowerCase();
    if (!query) return baseItems;
    return baseItems.filter((item) => [item.title, summaryFor(item), domainFor(item), stateFor(item)]
      .join(" ").toLowerCase().includes(query));
  }, [baseItems, urlState.query]);

  const scopedItems = useMemo(() => {
    const now = Date.now();
    const filtered = queryItems.filter((item) => {
      const filter = urlState.filter;
      if (filter === "all") return lifecycleFor(item) !== "archived";
      if (filter === "archived") return lifecycleFor(item) === "archived";
      if (filter.startsWith("domain-")) return `domain-${domainFor(item).toLowerCase().replace(/\s+/g, "-")}` === filter;
      if (filter === "needs-review") return !isLegacy(item) && (item.review === "needs_review" || item.review === "not_reviewed");
      if (filter === "blocked") return !isLegacy(item) && item.health === "blocked";
      if (filter === "linked-people") return refsFor(item).some((ref) => ref.module === "people");
      if (filter === "linked-finance") return refsFor(item).some((ref) => ref.module === "finance");
      if (filter === "linked-reviews") return refsFor(item).some((ref) => ref.module === "reviews");
      if (filter === "recurring") return !isLegacy(item) && item.objectType === "routine";
      if (filter === "due-soon") return !isLegacy(item) && item.objectType === "routine" && Boolean(item.nextRunAt && new Date(item.nextRunAt).getTime() <= now + 7 * 86_400_000);
      if (filter === "active") return lifecycleFor(item) === "active" && stateFor(item) !== "paused";
      if (filter === "paused") return stateFor(item) === "paused";
      if (filter === "ready") return stateFor(item) === "ready";
      if (filter === "untriaged") return stateFor(item) === "untriaged" || stateFor(item) === "unclassified";
      if (filter === "processed") return stateFor(item) === "processed";
      if (filter === "draft") return stateFor(item) === "draft";
      if (filter === "deprecated") return stateFor(item) === "deprecated";
      return lifecycleFor(item) !== "archived";
    });
    return [...filtered].sort((left, right) => {
      if (urlState.sort === "title") return left.title.localeCompare(right.title);
      if (urlState.sort === "updated") return (right.updatedAt || "").localeCompare(left.updatedAt || "");
      if (urlState.sort === "due") return (dateFor(left) || "9999").localeCompare(dateFor(right) || "9999");
      const weights = { critical: 0, high: 1, medium: 2, low: 3 };
      return weights[priorityFor(left)] - weights[priorityFor(right)] || (dateFor(left) || "9999").localeCompare(dateFor(right) || "9999");
    });
  }, [queryItems, urlState.filter, urlState.sort]);

  const selectedItem = useMemo(() => baseItems.find((item) => item.id === urlState.selected) || null, [baseItems, urlState.selected]);
  const selectedNative = selectedItem && !isLegacy(selectedItem) ? selectedItem : null;
  const selectionOutsideScope = Boolean(selectedItem && !scopedItems.some((item) => item.id === selectedItem.id));

  const sidebarCounts: PersonalOpsSidebarCounts = {
    command: [...state.goals, ...state.decisions, ...state.obligations, ...state.followUps].filter((item) => item.lifecycle !== "complete" && item.lifecycle !== "archived").length + state.routines.filter((item) => item.lifecycle !== "archived").length,
    goals: state.goals.length,
    decisions: state.decisions.length,
    obligations: state.obligations.length,
    followUps: state.followUps.length,
    routines: state.routines.length,
    captures: state.captures.length + legacyCaptures.length,
    templates: state.templates.length,
    archived: [...state.goals, ...state.decisions, ...state.obligations, ...state.followUps].filter((item) => item.lifecycle === "archived").length + state.routines.filter((item) => item.lifecycle === "archived").length + state.captures.filter((item) => item.lifecycle === "archived").length + state.templates.filter((item) => item.lifecycle === "archived").length
  };

  const metrics = useMemo<PersonalOpsMetricItem[]>(() => {
    const native = queryItems.filter((item): item is PersonalOpsSecondaryObject => !isLegacy(item));
    const metric = (id: string, label: string, value: number, detail: string, tone?: PersonalOpsTone): PersonalOpsMetricItem => ({
      id,
      label,
      value,
      detail,
      tone,
      active: urlState.filter === id,
      onSelect: () => updateUrl({ filter: id, selected: "" })
    });
    if (initialView === "routines") {
      const routines = native.filter((item): item is PersonalOpsRoutine => item.objectType === "routine");
      const now = new Date();
      const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
      return [
        metric("active", "Active routines", routines.filter((item) => item.lifecycle === "active" && item.cadence !== "paused").length, "manual definitions", "positive"),
        metric("due-today", "Due today", routines.filter((item) => item.nextRunAt && new Date(item.nextRunAt).getTime() < endToday && new Date(item.nextRunAt).getTime() >= now.setHours(0, 0, 0, 0)).length, "explicit next run", "attention"),
        metric("due-soon", "Due this week", routines.filter((item) => item.nextRunAt && new Date(item.nextRunAt).getTime() <= Date.now() + 7 * 86_400_000).length, "next 7 days", "attention"),
        metric("overdue", "Missed cadence", routines.filter((item) => item.cadence === "overdue").length, "needs a decision", "danger"),
        metric("needs-review", "Needs review", routines.filter((item) => item.review === "needs_review").length, "explicit review state", "review"),
        { id: "follow-ups", label: "Generates follow-ups", value: routines.filter((item) => item.generationRules.some((rule) => rule.enabled && rule.destination.module === "personal_ops" && rule.destination.family === "followUps")).length, detail: "confirmation-first" },
        { id: "obligations", label: "Generates obligations", value: routines.filter((item) => item.generationRules.some((rule) => rule.enabled && rule.destination.module === "personal_ops" && rule.destination.family === "obligations")).length, detail: "confirmation-first" },
        { id: "reviews", label: "Linked reviews", value: routines.filter((item) => item.linkedRefs.some((ref) => ref.module === "reviews")).length, detail: "reference only", tone: "review" },
        metric("paused", "Paused", routines.filter((item) => item.cadence === "paused").length, "generates nothing", "attention")
      ];
    }
    if (initialView === "inbox") {
      const captures = native.filter((item): item is PersonalOpsCaptureItem => item.objectType === "capture_item");
      const today = new Date().toDateString();
      return [
        metric("untriaged", "Untriaged", captures.filter((item) => item.triageState === "untriaged").length + legacyCaptures.length, "raw intake", "attention"),
        metric("ready", "Ready to process", captures.filter((item) => item.triageState === "ready").length, "manual confirmation", "positive"),
        { id: "missing-context", label: "Missing context", value: captures.filter((item) => item.triageState === "needs_context" || item.missingContext.length > 0).length, detail: "source gaps", tone: "danger" },
        { id: "today", label: "Captured today", value: captures.filter((item) => new Date(item.source.capturedAt).toDateString() === today).length, detail: "native captures" },
        { id: "manual", label: "Quick notes", value: captures.filter((item) => item.source.kind === "quick_capture" || item.source.kind === "manual").length, detail: "source preserved" },
        { id: "people", label: "People-linked", value: captures.filter((item) => refsFor(item).some((ref) => ref.module === "people")).length, detail: "reference only", tone: "people" },
        { id: "finance", label: "Finance-linked", value: captures.filter((item) => refsFor(item).some((ref) => ref.module === "finance")).length, detail: "reference only" },
        { id: "reviews", label: "Review evidence", value: captures.filter((item) => refsFor(item).some((ref) => ref.module === "reviews")).length, detail: "source-owned", tone: "review" },
        metric("processed", "Processed", captures.filter((item) => item.triageState === "processed").length, "outputs linked", "positive")
      ];
    }
    const templates = native.filter((item): item is PersonalOpsTemplate => item.objectType === "template");
    return [
      metric("active", "Active templates", templates.filter((item) => item.availability === "active").length, "future use", "positive"),
      metric("draft", "Draft templates", templates.filter((item) => item.availability === "draft").length, "safe to edit"),
      metric("needs-review", "Needs review", templates.filter((item) => item.review === "needs_review" || item.health === "needs_attention" || item.health === "invalid").length, "explicit reasons", "review"),
      { id: "capture-used", label: "Capture Inbox used", value: templates.filter((item) => item.usages.some((usage) => usage.definitionId.includes("capture"))).length, detail: "recorded usage" },
      { id: "routine-linked", label: "Routine-linked", value: templates.filter((item) => item.linkedRefs.some((ref) => ref.objectType === "routine")).length, detail: "definition link" },
      { id: "review-linked", label: "Review-linked", value: templates.filter((item) => item.linkedRefs.some((ref) => ref.module === "reviews")).length, detail: "reference only", tone: "review" },
      { id: "used", label: "Recorded uses", value: templates.reduce((total, item) => total + item.usages.length, 0), detail: "confirmed only" },
      { id: "missing-fields", label: "Missing fields", value: templates.filter((item) => item.fields.length === 0).length, detail: "blocks activation", tone: "attention" },
      metric("deprecated", "Deprecated", templates.filter((item) => item.availability === "deprecated").length, "new use blocked", "attention")
    ];
  }, [initialView, legacyCaptures.length, queryItems, updateUrl, urlState.filter]);

  const filters = useMemo(() => {
    const ids = initialView === "routines"
      ? [["all", "All"], ["active", "Active"], ["due-soon", "Due soon"], ["needs-review", "Needs review"], ["paused", "Paused"], ["archived", "Archived"]]
      : initialView === "inbox"
        ? [["all", "All"], ["untriaged", "Untriaged"], ["ready", "Ready"], ["needs-review", "Needs review"], ["processed", "Processed"], ["archived", "Archived"]]
        : [["all", "All"], ["active", "Active"], ["draft", "Draft"], ["needs-review", "Needs review"], ["deprecated", "Deprecated"], ["archived", "Archived"]];
    return ids.map(([id, label]) => ({
      id,
      label,
      count: queryItems.filter((item) => {
        if (id === "all") return lifecycleFor(item) !== "archived";
        if (id === "archived") return lifecycleFor(item) === "archived";
        if (id === "active") return lifecycleFor(item) === "active" && stateFor(item) !== "paused";
        if (id === "needs-review") return !isLegacy(item) && (item.review === "needs_review" || item.review === "not_reviewed");
        return stateFor(item) === id;
      }).length,
      active: urlState.filter === id,
      onSelect: () => updateUrl({ filter: id, selected: "" })
    }));
  }, [initialView, queryItems, updateUrl, urlState.filter]);

  async function refreshState() {
    const result = await repository.readState();
    if (result.ok) setState(result.data);
    return result;
  }

  function changeQuery(value: string) {
    setQueryDraft(value);
    if (queryTimer.current) clearTimeout(queryTimer.current);
    queryTimer.current = setTimeout(() => updateUrl({ query: value, selected: "" }), 180);
  }

  function selectItem(item: AdvancedListItem) {
    updateUrl({ selected: item.id, tab: "overview" }, true);
    setMobileInspectorOpen(true);
  }

  function openCreate() {
    const form = { family: config.family };
    const nextDraft = defaultDraft(config.family);
    setOpenForm(form);
    setDraft(nextDraft);
    setFormInitial(JSON.stringify(nextDraft));
    setError("");
  }

  function openEdit(item: PersonalOpsSecondaryObject) {
    if (item.objectType === "template" && item.availability === "active") {
      setNotice("Active template definitions are immutable in this checkpoint. Duplicate as a draft before structural edits.");
      return;
    }
    const family = familyForObject(item);
    const nextDraft = defaultDraft(family, item);
    setOpenForm({ family, item });
    setDraft(nextDraft);
    setFormInitial(JSON.stringify(nextDraft));
    setError("");
  }

  function requestCloseForm() {
    if (draft && JSON.stringify(draft) !== formInitial) setPendingAction({ type: "discard" });
    else {
      setOpenForm(null);
      setDraft(null);
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openForm || !draft) return;
    setBusy(true);
    setError("");
    const result = openForm.item
      ? await repository.updateSecondary(openForm.family, openForm.item.id, updateSecondaryInput(openForm, draft) as never, openForm.item.updatedAt)
      : await repository.createSecondary(openForm.family, createSecondaryInput(openForm, draft) as never);
    if (!result.ok) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    const item = "item" in result.data ? result.data.item : result.data;
    setState((current) => replaceSecondary(current, openForm.family, item as never));
    await refreshState();
    setOpenForm(null);
    setDraft(null);
    setNotice(`${config.singular} saved. Persistence was verified through the native Personal Ops repository.`);
    updateUrl({ selected: item.id, tab: "overview" }, true);
    setMobileInspectorOpen(true);
    setBusy(false);
  }

  async function patchItem<Family extends PersonalOpsSecondaryFamily>(
    family: Family,
    item: PersonalOpsSecondaryObjectByFamily[Family],
    patch: PersonalOpsSecondaryUpdateInputByFamily[Family],
    successMessage: string
  ) {
    setBusy(true);
    setError("");
    const result = await repository.updateSecondary(family, item.id, patch, item.updatedAt);
    if (!result.ok) {
      setError(result.error.message);
      setBusy(false);
      return false;
    }
    setState((current) => replaceSecondary(current, family, result.data));
    await refreshState();
    setNotice(successMessage);
    setBusy(false);
    return true;
  }

  async function duplicateTemplate(item: PersonalOpsTemplate) {
    setBusy(true);
    setError("");
    const result = await repository.createSecondary("templates", {
      title: `${item.title} — draft copy`,
      summary: item.summary,
      domain: item.domain,
      owner: item.owner,
      lifecycle: "draft",
      availability: "draft",
      health: "unknown",
      review: "not_reviewed",
      fields: item.fields.map(({ key, label, type, required, defaultValue, options, helpText }) => ({ key, label, type, required, defaultValue, options, helpText })),
      rules: item.rules.map(({ label, enabled, when, fieldKey, expectedValue, explanation }) => ({ label, enabled, when, fieldKey, expectedValue, explanation })),
      generatedDefinitions: item.generatedDefinitions.map(({ label, enabled, destination }) => ({ label, enabled, destination })),
      linkedRefs: item.linkedRefs
    });
    if (!result.ok) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    await refreshState();
    updateUrl({ selected: result.data.item.id, tab: "overview" }, true);
    setNotice("Template definition duplicated as a new draft. Usage history and existing outputs were not copied or changed.");
    setMobileInspectorOpen(true);
    setBusy(false);
  }

  async function startRoutinePreview(item: PersonalOpsRoutine) {
    if (item.cadence === "paused") {
      setError("Paused routines cannot run. Resume the cadence first.");
      return;
    }
    setBusy(true);
    setError("");
    const input = {
      scheduledFor: item.nextRunAt,
      ruleIds: item.generationRules.filter((rule) => rule.enabled).map((rule) => rule.id)
    };
    const result = await repository.previewRoutineRun(item.id, input);
    if (!result.ok) setError(result.error.message);
    else setOperation({ kind: "routine", item, input, preview: result.data, operationKey: `manual-run:${item.id}:${item.nextRunAt || crypto.randomUUID()}` });
    setBusy(false);
  }

  async function previewCapture(setup: CaptureSetupOperation) {
    const outputs = captureOutputs(setup.item, setup);
    if (!outputs.length) {
      setError("Choose at least one native output to preview.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await repository.previewCaptureProcessing(setup.item.id, { outputs });
    if (!result.ok) setError(result.error.message);
    else setOperation({ kind: "capture-preview", item: setup.item, outputs, preview: result.data, operationKey: `capture-process:${setup.item.id}:${crypto.randomUUID()}` });
    setBusy(false);
  }

  async function previewTemplate(valuesOperation: TemplateValuesOperation) {
    setBusy(true);
    setError("");
    const result = await repository.testTemplate(valuesOperation.item.id, { values: valuesOperation.values });
    if (!result.ok) setError(result.error.message);
    else setOperation({
      kind: "template-preview",
      item: valuesOperation.item,
      values: valuesOperation.values,
      preview: result.data,
      definitionId: result.data.entries.find((entry) => entry.canCreate)?.definitionId || result.data.entries[0]?.definitionId,
      operationKey: `template-use:${valuesOperation.item.id}:${crypto.randomUUID()}`
    });
    setBusy(false);
  }

  async function confirmOperation() {
    if (!operation) return;
    setBusy(true);
    setError("");
    if (operation.kind === "capture-setup") {
      setBusy(false);
      await previewCapture(operation);
      return;
    }
    if (operation.kind === "template-values") {
      setBusy(false);
      await previewTemplate(operation);
      return;
    }
    if (operation.kind === "routine") {
      const result = await repository.confirmRoutineRun(operation.item.id, {
        ...operation.input,
        expectedUpdatedAt: operation.preview.routineUpdatedAt,
        operationKey: operation.operationKey,
        confirmed: true
      });
      if (!result.ok) setError(result.error.message);
      else {
        await refreshState();
        setOperation(null);
        setNotice(result.data.created ? `Run recorded. ${result.data.run.generatedRefs.length} destination-native draft${result.data.run.generatedRefs.length === 1 ? "" : "s"} created.` : "This run was already recorded; no duplicate objects were created.");
      }
      setBusy(false);
      return;
    }
    if (operation.kind === "capture-preview") {
      const result = await repository.confirmCaptureProcessing(operation.item.id, {
        outputs: operation.outputs,
        expectedUpdatedAt: operation.preview.captureUpdatedAt,
        operationKey: operation.operationKey,
        confirmed: true
      });
      if (!result.ok) setError(result.error.message);
      else {
        await refreshState();
        setOperation(null);
        setNotice(result.data.created ? `Capture processed into ${result.data.action.createdRefs.length} linked native object${result.data.action.createdRefs.length === 1 ? "" : "s"}. Raw source was preserved.` : "This processing operation was already recorded; no duplicate objects were created.");
      }
      setBusy(false);
      return;
    }
    if (!operation.definitionId) {
      setError("No valid destination definition is available for this template.");
      setBusy(false);
      return;
    }
    const result = await repository.instantiateTemplate(operation.item.id, {
      values: operation.values,
      definitionId: operation.definitionId,
      expectedUpdatedAt: operation.preview.templateUpdatedAt,
      operationKey: operation.operationKey,
      confirmed: true
    });
    if (!result.ok) setError(result.error.message);
    else {
      await refreshState();
      setOperation(null);
      setNotice(result.data.created ? `Template created ${result.data.usage.createdRef.label} in its native Personal Ops collection.` : "This template use was already recorded; no duplicate object was created.");
    }
    setBusy(false);
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    if (pendingAction.type === "discard") {
      setPendingAction(null);
      setOpenForm(null);
      setDraft(null);
      return;
    }
    const item = pendingAction.item;
    const family = familyForObject(item);
    let patch: PersonalOpsSecondaryUpdateInputByFamily[typeof family];
    let message: string;
    if (pendingAction.type === "archive") {
      patch = { lifecycle: "archived", archiveReason, archiveConfirmed: true } as never;
      message = `${cleanLabel(item.objectType)} archived. Links, source provenance, generated objects, and audit history were preserved.`;
    } else if (pendingAction.type === "restore") {
      patch = item.objectType === "routine"
        ? { lifecycle: "active", restoreConfirmed: true }
        : item.objectType === "capture_item"
          ? { lifecycle: "active", restoreConfirmed: true }
          : { lifecycle: "draft", availability: "draft", restoreConfirmed: true };
      message = `${cleanLabel(item.objectType)} restored to a safe editable state.`;
    } else if (pendingAction.type === "activate") {
      patch = { lifecycle: "active", availability: "active", health: "ready" };
      message = "Template activated for future explicit use. Existing objects were not changed.";
    } else if (pendingAction.type === "deprecate") {
      patch = { availability: "deprecated" };
      message = "Template deprecated. New use is blocked; prior usage and outputs remain intact.";
    } else if (pendingAction.type === "activate-routine") {
      patch = { lifecycle: "active", cadence: "current" };
      message = "Routine activated for manual runs. No work was created and no scheduler was enabled.";
    } else if (pendingAction.type === "pause-routine") {
      patch = { cadence: "paused" };
      message = "Routine paused. Its definition and run history remain available, and it cannot generate work while paused.";
    } else {
      patch = { cadence: "current" };
      message = "Routine resumed for manual runs. No work was created automatically.";
    }
    const saved = await patchItem(family, item as never, patch as never, message);
    if (saved) {
      setPendingAction(null);
      setArchiveReason("");
    }
  }

  const tabs = initialView === "routines" ? ROUTINE_TABS : initialView === "inbox" ? CAPTURE_TABS : TEMPLATE_TABS;
  const tabAvailable = tabs.some((tab) => tab.id === urlState.tab);
  const activeTab = tabAvailable ? urlState.tab : "overview";

  const primaryHeaderAction = initialView === "routines" ? "Review Routines" : initialView === "inbox" ? "Process Inbox" : "Review Templates";
  const primaryHeaderActionReason = initialView === "inbox" && !selectedNative ? "Select a native Capture to process." : undefined;

  const operationTitle = operation?.kind === "routine"
    ? "Preview this Routine run"
    : operation?.kind === "capture-setup"
      ? "Choose native outputs"
      : operation?.kind === "capture-preview"
        ? "Confirm Capture processing"
        : operation?.kind === "template-values"
          ? "Test Template values"
          : operation?.kind === "template-preview"
            ? "Template test preview"
            : "Preview operation";

  const operationConfirmLabel = operation?.kind === "routine"
    ? "Confirm and record run"
    : operation?.kind === "capture-setup"
      ? "Preview outputs"
      : operation?.kind === "capture-preview"
        ? "Create linked objects"
        : operation?.kind === "template-values"
          ? "Test creation"
          : "Use template";

  const operationConfirmDisabled = operation?.kind === "capture-setup"
    ? !operation.decision && !operation.followUp && !operation.obligation
    : operation?.kind === "routine"
      ? operation.preview.confirmableCount === 0 || operation.preview.disabledCount > 0
    : operation?.kind === "capture-preview"
      ? operation.preview.confirmableCount === 0 || operation.preview.disabledCount > 0
      : operation?.kind === "template-preview"
        ? operation.preview.confirmableCount === 0 || Object.keys(operation.preview.fieldErrors).length > 0 || operation.item.availability !== "active"
        : false;

  function secondaryCell(item: AdvancedListItem, column: number): ReactNode {
    if (initialView === "routines") {
      if (isLegacy(item) || item.objectType !== "routine") return "—";
      if (column === 0) return cleanLabel(item.cadenceRule.frequency);
      if (column === 1) return formatDate(item.nextRunAt);
      if (column === 2) return `${item.generationRules.filter((rule) => rule.enabled).length} definitions`;
      if (column === 3) return <PersonalOpsStatusChip tone={toneFor(item.health)}>{cleanLabel(item.health)}</PersonalOpsStatusChip>;
      return <PersonalOpsStatusChip tone={toneFor(item.cadence)}>{item.lifecycle === "archived" ? "Archived" : cleanLabel(item.cadence)}</PersonalOpsStatusChip>;
    }
    if (initialView === "inbox") {
      if (isLegacy(item)) {
        if (column === 0) return "Legacy Personal Record";
        if (column === 1) return "Not classified";
        if (column === 2) return "Not scored";
        if (column === 3) return "Source only";
        return <PersonalOpsStatusChip tone="attention">Compatibility</PersonalOpsStatusChip>;
      }
      if (item.objectType !== "capture_item") return "—";
      if (column === 0) return item.source.label;
      if (column === 1) return item.suggestions.filter((suggestion) => suggestion.kind === "destination" && suggestion.state !== "rejected").map((suggestion) => suggestion.label).join(", ") || "Not classified";
      if (column === 2) return "Not scored";
      if (column === 3) return `${refsFor(item).length} links`;
      return <PersonalOpsStatusChip tone={toneFor(item.triageState)}>{cleanLabel(item.triageState)}</PersonalOpsStatusChip>;
    }
    if (isLegacy(item) || item.objectType !== "template") return "—";
    const destination = item.generatedDefinitions[0]?.destination;
    if (column === 0) return destination?.module === "personal_ops" ? cleanLabel(destination.family) : destination ? cleanLabel(destination.module) : "No target";
    if (column === 1) return `${item.fields.filter((field) => field.required).length} required`;
    if (column === 2) return `${item.usages.length} uses`;
    if (column === 3) return <PersonalOpsStatusChip tone={toneFor(item.health)}>{cleanLabel(item.health)}</PersonalOpsStatusChip>;
    return <PersonalOpsStatusChip tone={toneFor(item.availability)}>{cleanLabel(item.availability)}</PersonalOpsStatusChip>;
  }

  const columnLabels = initialView === "routines"
    ? ["Cadence", "Next run", "Generates", "Health", "State"]
    : initialView === "inbox"
      ? ["Source", "Suggested type", "Confidence", "Linked to", "Triage state"]
      : ["Object type", "Required fields", "Usage", "Health", "State"];

  return (
    <div className={styles.shell} data-has-inspector={Boolean(selectedItem)} data-compact={urlState.compact || undefined}>
      <PersonalOpsSidebar
        activeView={initialView}
        filter={urlState.filter}
        pathname={pathname}
        counts={sidebarCounts}
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      <main className={styles.directory} aria-label={`${config.title} ledger`}>
        <div className={styles.mobileToolbar}>
          <button type="button" onClick={() => setMobileSidebarOpen(true)} aria-expanded={mobileSidebarOpen}>☰ Personal Ops</button>
          <button type="button" onClick={openCreate}>+ {config.singular}</button>
        </div>
        <div className={styles.mainScroll}>
          <header className={styles.pageHeader}>
            <div>
              <h1>{config.title}</h1>
              <p>{config.description}</p>
            </div>
            <div className={styles.headerActions}>
              <label className={styles.visuallyHidden} htmlFor={`personal-ops-${initialView}-search`}>Search {config.title}</label>
              <input
                id={`personal-ops-${initialView}-search`}
                className={styles.button}
                type="search"
                value={queryDraft}
                onChange={(event) => changeQuery(event.target.value)}
                placeholder={`Search ${config.title.toLowerCase()}`}
              />
              <button type="button" className={styles.button} onClick={() => updateUrl({ filter: urlState.filter === "all" ? "needs-review" : "all", selected: "" })}>Filter</button>
              <button type="button" className={styles.button} aria-pressed={urlState.compact} onClick={() => updateUrl({ compact: !urlState.compact })}>Compact</button>
              <button type="button" className={styles.primaryButton} onClick={openCreate}>+ {config.singular}</button>
              <button
                type="button"
                className={styles.button}
                title={primaryHeaderActionReason}
                onClick={() => {
                  if (initialView === "inbox" && selectedNative?.objectType === "capture_item") {
                    setOperation({ kind: "capture-setup", item: selectedNative, decision: true, followUp: true, obligation: false });
                  } else {
                    updateUrl({ filter: initialView === "inbox" ? "ready" : "needs-review", selected: "" });
                    if (initialView === "inbox") setNotice("Ready captures are now in scope. Select one to preview native outputs.");
                  }
                }}
              >{primaryHeaderAction}</button>
            </div>
            <PersonalOpsStatusLine items={[
              { id: "shown", label: `${scopedItems.length} shown` },
              { id: "native", label: `${baseItems.filter((item) => !isLegacy(item)).length} native`, tone: "positive" },
              ...(initialView === "inbox" ? [{ id: "legacy", label: `${legacyCaptures.length} legacy source${legacyCaptures.length === 1 ? "" : "s"}`, tone: "attention" as const }] : []),
              { id: "audit", label: `${state.auditEvents.length} audit events` }
            ]} />
          </header>

          <div className={styles.boundaryBanner} role="note">
            <strong>Safe operating boundary:</strong>{" "}
            {initialView === "routines"
              ? "Runs are manual, previewed, idempotent, and limited to confirmed destination-native Personal Ops drafts. No scheduler runs in the background."
              : initialView === "inbox"
                ? "Raw capture text is immutable. Processing is explicit, atomic for supported Personal Ops outputs, and never performs AI or cross-module mutation."
                : "Templates are definitions. Testing writes nothing; using an active template requires confirmation and never changes prior outputs."}
          </div>

          <PersonalOpsMetricRail items={metrics} />
          <PersonalOpsFilterRail items={filters} />

          {error && <div className={styles.error} role="alert" style={{ margin: "0 16px 10px" }}>{error}</div>}
          {notice && <div className={styles.notice} role="status" style={{ margin: "0 16px 10px" }}>{notice}</div>}

          {initialLoadError ? (
            <SystemState variant="error" title={`${config.title} could not load`} description={initialLoadError} />
          ) : scopedItems.length === 0 ? (
            <SystemState
              variant="empty"
              title={urlState.query || urlState.filter !== "all" ? "No objects match this scope" : `No ${config.title.toLowerCase()} yet`}
              description={urlState.query || urlState.filter !== "all" ? "Clear search or change the active filter." : `Create the first native ${config.singular.toLowerCase()}; no mockup rows are presented as live data.`}
              action={urlState.query || urlState.filter !== "all"
                ? { label: "Clear scope", onSelect: () => updateUrl({ query: "", filter: "all", selected: "" }) }
                : { label: `Create ${config.singular}`, onSelect: openCreate }}
            />
          ) : (
            <div className={styles.ledgerFrame}>
              <div className={styles.ledgerScroller}>
                <table className={styles.ledger}>
                  <thead>
                    <tr>
                      <th style={{ width: "38%" }}>{config.singular}</th>
                      <th>Domain</th>
                      {columnLabels.map((label) => <th key={label}>{label}</th>)}
                      <th>{initialView === "routines" ? "Last action" : initialView === "inbox" ? "Captured" : "Last used"}</th>
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
                                <span className={styles.visuallyHidden}>Select {item.title} for batch context</span>
                                <input type="checkbox" checked={checked} onChange={() => setSelectedIds((current) => {
                                  const next = new Set(current);
                                  if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                  return next;
                                })} />
                              </label>
                              <button type="button" className={styles.rowBody} onClick={() => selectItem(item)} aria-pressed={selected}>
                                <span className={styles.rowTitle}>{item.title}</span>
                                <span className={styles.rowSummary}>{summaryFor(item)}</span>
                              </button>
                            </div>
                          </td>
                          <td data-label="Domain">{domainFor(item)}</td>
                          {columnLabels.map((label, index) => <td data-label={label} key={label}>{secondaryCell(item, index)}</td>)}
                          <td data-label={initialView === "routines" ? "Last action" : initialView === "inbox" ? "Captured" : "Last used"} className={styles.mono}>{formatDate(dateFor(item))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <footer className={styles.ledgerFooter}>
                <span>{scopedItems.length} of {baseItems.length} objects · row selects inspector · checkbox selects batch context</span>
                {selectedIds.size > 0 && <button type="button" onClick={() => setSelectedIds(new Set())}>Clear {selectedIds.size} selected</button>}
              </footer>
            </div>
          )}
        </div>

        <nav className={styles.quickActions} aria-label={`${config.title} quick actions`}>
          <button type="button" onClick={openCreate}><span>New {config.singular.toLowerCase()}</span><small>explicit native save</small></button>
          {initialView === "routines" && <button type="button" onClick={() => selectedNative?.objectType === "routine" && void startRoutinePreview(selectedNative)} disabled={selectedNative?.objectType !== "routine"} title={selectedNative?.objectType === "routine" ? undefined : "Select a native Routine first."}><span>Run routine</span><small>preview first</small></button>}
          {initialView === "inbox" && <button type="button" onClick={() => selectedNative?.objectType === "capture_item" && setOperation({ kind: "capture-setup", item: selectedNative, decision: true, followUp: true, obligation: false })} disabled={selectedNative?.objectType !== "capture_item"} title={selectedNative?.objectType === "capture_item" ? undefined : "Select a native Capture first."}><span>Process selected</span><small>split preview</small></button>}
          {initialView === "templates" && <button type="button" onClick={() => selectedNative?.objectType === "template" && setOperation({ kind: "template-values", item: selectedNative, values: defaultTemplateValues(selectedNative) })} disabled={selectedNative?.objectType !== "template"} title={selectedNative?.objectType === "template" ? undefined : "Select a native Template first."}><span>Test creation</span><small>writes nothing</small></button>}
          <button type="button" disabled title="The global AI dock can draft proposals, but classification and execution remain disconnected."><span>Ask AI</span><small>proposal only</small></button>
        </nav>
      </main>

      {selectedItem && (
        <>
          <button
            type="button"
            className={[styles.scrim, styles.inspectorScrim].join(" ")}
            data-open={mobileInspectorOpen || undefined}
            onClick={() => setMobileInspectorOpen(false)}
            aria-label="Close selected object inspector"
          />
          <InspectorRail
            className={styles.inspector}
            overlay
            overlayOpen={mobileInspectorOpen}
            onRequestClose={() => setMobileInspectorOpen(false)}
            busy={busy}
            readOnly={isLegacy(selectedItem)}
            ariaLabel={`${selectedItem.title} inspector`}
            footer={!isLegacy(selectedItem) ? (
              <div className={styles.actionFooter}>
                <span>
                  {selectedItem.objectType === "routine" && selectedItem.lifecycle === "draft" && <small>Activate before the first manual run.</small>}
                  {selectedItem.objectType === "capture_item" && selectedItem.triageState === "processed" && <small>Processed output links and raw source are preserved.</small>}
                  {selectedItem.objectType === "template" && selectedItem.availability === "active" && <small>Duplicate as draft for structural changes.</small>}
                </span>
                {selectedItem.lifecycle === "archived" ? (
                  <button type="button" className={styles.primaryButton} onClick={() => setPendingAction({ type: "restore", item: selectedItem })} disabled={busy}>Restore</button>
                ) : selectedItem.objectType === "routine" ? (
                  <>
                    <button type="button" className={styles.button} onClick={() => openEdit(selectedItem)} disabled={busy}>Edit</button>
                    {selectedItem.lifecycle === "draft" ? (
                      <button type="button" className={styles.primaryButton} onClick={() => setPendingAction({ type: "activate-routine", item: selectedItem })} disabled={busy}>Activate</button>
                    ) : selectedItem.cadence === "paused" ? (
                      <button type="button" className={styles.primaryButton} onClick={() => setPendingAction({ type: "resume-routine", item: selectedItem })} disabled={busy}>Resume</button>
                    ) : (
                      <button type="button" className={styles.primaryButton} onClick={() => void startRoutinePreview(selectedItem)} disabled={busy}>Run now</button>
                    )}
                    {selectedItem.lifecycle === "active" && selectedItem.cadence !== "paused" && <button type="button" className={styles.button} onClick={() => setPendingAction({ type: "pause-routine", item: selectedItem })} disabled={busy}>Pause</button>}
                    <button type="button" className={styles.button} onClick={() => setPendingAction({ type: "archive", item: selectedItem })} disabled={busy}>Archive</button>
                  </>
                ) : selectedItem.objectType === "capture_item" ? (
                  <>
                    <button type="button" className={styles.button} onClick={() => openEdit(selectedItem)} disabled={busy}>Edit triage</button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => setOperation({ kind: "capture-setup", item: selectedItem, decision: true, followUp: true, obligation: false })}
                      disabled={busy || selectedItem.triageState === "processed"}
                      title={selectedItem.triageState === "processed" ? "This Capture is already processed. Its outputs remain linked." : undefined}
                    >Process</button>
                    <button type="button" className={styles.button} onClick={() => setPendingAction({ type: "archive", item: selectedItem })} disabled={busy}>Archive</button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => selectedItem.availability === "active" ? void duplicateTemplate(selectedItem) : openEdit(selectedItem)}
                      disabled={busy}
                    >{selectedItem.availability === "active" ? "Duplicate draft" : "Edit"}</button>
                    <button type="button" className={styles.button} onClick={() => setOperation({ kind: "template-values", item: selectedItem, values: defaultTemplateValues(selectedItem) })} disabled={busy || selectedItem.availability === "deprecated"} title={selectedItem.availability === "deprecated" ? "Deprecated templates cannot be tested or used." : undefined}>Test creation</button>
                    {selectedItem.availability === "draft" && <button type="button" className={styles.primaryButton} onClick={() => setPendingAction({ type: "activate", item: selectedItem })} disabled={busy || selectedItem.fields.length === 0 || selectedItem.generatedDefinitions.length === 0} title={selectedItem.fields.length === 0 || selectedItem.generatedDefinitions.length === 0 ? "Add fields and a generated definition before activation." : undefined}>Activate</button>}
                    {selectedItem.availability === "active" && <button type="button" className={styles.primaryButton} onClick={() => setOperation({ kind: "template-values", item: selectedItem, values: defaultTemplateValues(selectedItem) })} disabled={busy}>Use template</button>}
                    {selectedItem.availability === "active" && <button type="button" className={styles.button} onClick={() => setPendingAction({ type: "deprecate", item: selectedItem })} disabled={busy}>Deprecate</button>}
                    <button type="button" className={styles.button} onClick={() => setPendingAction({ type: "archive", item: selectedItem })} disabled={busy}>Archive</button>
                  </>
                )}
              </div>
            ) : undefined}
          >
            {isLegacy(selectedItem) ? (
              <div className={styles.inspectorScroll}>
                <div className={styles.inspectorTop}>
                  <span className={styles.objectIcon} aria-hidden="true">⌁</span>
                  <div>
                    <h2>{selectedItem.title}</h2>
                    <p>Legacy Personal Record · compatibility source</p>
                  </div>
                  <button type="button" className={styles.closeButton} onClick={() => updateUrl({ selected: "" }, true)} aria-label="Close inspector">×</button>
                </div>
                <div className={[styles.notice, styles.legacyBoundary].join(" ")} data-tone="attention">
                  This record remains in its current owner and has not been classified or converted. Native creation requires a separate explicit choice; this view never copies it silently.
                </div>
                <div className={styles.panelGrid}>
                  <PersonalOpsPanel title="Why it appears" wide><p>{selectedItem.candidate.reason}</p></PersonalOpsPanel>
                  <PersonalOpsPanel title="Current source"><dl className={styles.metadataList}><div><dt>Domain</dt><dd>{selectedItem.domain}</dd></div><div><dt>Class</dt><dd>{selectedItem.candidate.source.className}</dd></div><div><dt>Legacy state</dt><dd>{selectedItem.candidate.source.status}</dd></div><div><dt>Last changed</dt><dd>{formatTimestamp(selectedItem.updatedAt)}</dd></div></dl></PersonalOpsPanel>
                  <PersonalOpsPanel title="Safe next step" wide>
                    <p>Open the existing record to inspect its full body. Create a native Capture only when you intentionally want immutable intake provenance.</p>
                    <Link className={styles.button} href={`/admin/personal/records/${encodeURIComponent(selectedItem.candidate.legacyPersonalRecordId)}`}>Open source record</Link>
                  </PersonalOpsPanel>
                </div>
              </div>
            ) : (
              <>
                <header className={styles.inspectorHeader}>
                  <div className={styles.inspectorTop}>
                    <span className={styles.objectIcon} aria-hidden="true">{selectedItem.objectType === "routine" ? "↻" : selectedItem.objectType === "capture_item" ? "↳" : "▤"}</span>
                    <div>
                      <h2>{selectedItem.title}</h2>
                      <p>{cleanLabel(selectedItem.objectType)} · {selectedItem.domain} · owner {selectedItem.owner}</p>
                    </div>
                    <button type="button" className={styles.closeButton} onClick={() => updateUrl({ selected: "" }, true)} aria-label="Close inspector">×</button>
                  </div>
                  <div className={styles.chipRow}>
                    <PersonalOpsStatusChip tone={toneFor(selectedItem.lifecycle)}>{cleanLabel(selectedItem.lifecycle)}</PersonalOpsStatusChip>
                    <PersonalOpsStatusChip tone={toneFor(stateFor(selectedItem))}>{cleanLabel(stateFor(selectedItem))}</PersonalOpsStatusChip>
                    <PersonalOpsStatusChip tone={toneFor(selectedItem.health)}>{cleanLabel(selectedItem.health)}</PersonalOpsStatusChip>
                    <PersonalOpsStatusChip tone={toneFor(selectedItem.review)}>{cleanLabel(selectedItem.review)}</PersonalOpsStatusChip>
                    {selectionOutsideScope && <PersonalOpsStatusChip tone="attention">Outside current filter</PersonalOpsStatusChip>}
                  </div>
                  <div className={styles.inspectorTabs}>
                    <DetailTabs id={`personal-ops-${selectedItem.id}`} tabs={tabs} activeTab={activeTab} onTabChange={(tab) => updateUrl({ tab: tab as PersonalOpsTab })} ariaLabel={`${selectedItem.title} details`} />
                  </div>
                </header>

                <div className={styles.inspectorScroll}>
                  <DetailTabPanel tabsId={`personal-ops-${selectedItem.id}`} tabId={activeTab} active>
                    {activeTab === "overview" && (
                      <>
                        <PersonalOpsStateGrid items={selectedItem.objectType === "routine" ? [
                          { id: "lifecycle", label: "Lifecycle", value: cleanLabel(selectedItem.lifecycle), detail: "definition state", tone: toneFor(selectedItem.lifecycle) },
                          { id: "cadence", label: "Cadence", value: cleanLabel(selectedItem.cadence), detail: formatDate(selectedItem.nextRunAt), tone: toneFor(selectedItem.cadence) },
                          { id: "health", label: "Health", value: cleanLabel(selectedItem.health), detail: "separate from cadence", tone: toneFor(selectedItem.health) },
                          { id: "review", label: "Review", value: cleanLabel(selectedItem.review), detail: "explicit review state", tone: toneFor(selectedItem.review) }
                        ] : selectedItem.objectType === "capture_item" ? [
                          { id: "lifecycle", label: "Lifecycle", value: cleanLabel(selectedItem.lifecycle), detail: "soft archive only", tone: toneFor(selectedItem.lifecycle) },
                          { id: "triage", label: "Triage", value: cleanLabel(selectedItem.triageState), detail: "intake workflow", tone: toneFor(selectedItem.triageState) },
                          { id: "health", label: "Health", value: cleanLabel(selectedItem.health), detail: "source confidence not scored", tone: toneFor(selectedItem.health) },
                          { id: "review", label: "Review", value: cleanLabel(selectedItem.review), detail: "manual review state", tone: toneFor(selectedItem.review) }
                        ] : [
                          { id: "lifecycle", label: "Lifecycle", value: cleanLabel(selectedItem.lifecycle), detail: "definition lifecycle", tone: toneFor(selectedItem.lifecycle) },
                          { id: "availability", label: "Availability", value: cleanLabel(selectedItem.availability), detail: "future use only", tone: toneFor(selectedItem.availability) },
                          { id: "health", label: "Health", value: cleanLabel(selectedItem.health), detail: "validation state", tone: toneFor(selectedItem.health) },
                          { id: "review", label: "Review", value: cleanLabel(selectedItem.review), detail: "manual review state", tone: toneFor(selectedItem.review) }
                        ]} />
                        <div className={styles.panelGrid}>
                          <PersonalOpsPanel title={selectedItem.objectType === "capture_item" ? "Immutable raw source" : "Operating summary"} wide>
                            <p className={selectedItem.objectType === "capture_item" ? styles.rawSource : undefined}>{selectedItem.objectType === "capture_item" ? selectedItem.rawText : selectedItem.summary || "No summary recorded."}</p>
                          </PersonalOpsPanel>
                          {selectedItem.objectType === "routine" && <PersonalOpsPanel title="Completion criteria"><ul className={styles.compactList}>{selectedItem.completionCriteria.length ? selectedItem.completionCriteria.map((criterion) => <li key={criterion}>{criterion}</li>) : <li>No criteria recorded.</li>}</ul></PersonalOpsPanel>}
                          {selectedItem.objectType === "capture_item" && <PersonalOpsPanel title="Source provenance"><dl className={styles.metadataList}><div><dt>Source</dt><dd>{selectedItem.source.label}</dd></div><div><dt>Captured</dt><dd>{formatTimestamp(selectedItem.source.capturedAt)}</dd></div><div><dt>Raw edited</dt><dd>Never</dd></div></dl></PersonalOpsPanel>}
                          {selectedItem.objectType === "template" && <PersonalOpsPanel title="Creation contract"><p>{selectedItem.generatedDefinitions.length} destination definition{selectedItem.generatedDefinitions.length === 1 ? "" : "s"}; testing is non-writing and confirmed use creates one native object.</p></PersonalOpsPanel>}
                          <PersonalOpsPanel title="Native links"><NativeReferenceList refs={refsFor(selectedItem)} /></PersonalOpsPanel>
                        </div>
                      </>
                    )}

                    {selectedItem.objectType === "routine" && activeTab === "cadence" && <div className={styles.panelGrid}>
                      <PersonalOpsPanel title="Cadence rule" wide><dl className={styles.metadataList}><div><dt>Frequency</dt><dd>{cleanLabel(selectedItem.cadenceRule.frequency)}</dd></div><div><dt>Interval</dt><dd>Every {selectedItem.cadenceRule.interval}</dd></div><div><dt>Timezone</dt><dd>{selectedItem.cadenceRule.timezone}</dd></div><div><dt>Next run</dt><dd>{formatTimestamp(selectedItem.nextRunAt)}</dd></div><div><dt>Trigger</dt><dd>Manual confirmation</dd></div><div><dt>Background create</dt><dd>Disabled</dd></div></dl></PersonalOpsPanel>
                      <PersonalOpsPanel title="Reminder window"><p>{selectedItem.cadenceRule.reminderWindowDays} day{selectedItem.cadenceRule.reminderWindowDays === 1 ? "" : "s"}. This is displayed as context; notification delivery is not connected.</p></PersonalOpsPanel>
                      <PersonalOpsPanel title="Missed occurrence"><p>{cleanLabel(selectedItem.cadenceRule.skipBehavior)}. Any catch-up remains a manual decision.</p></PersonalOpsPanel>
                    </div>}
                    {selectedItem.objectType === "routine" && activeTab === "generated-items" && <div className={styles.panelGrid}>
                      <PersonalOpsPanel title="Generation definitions" wide><ul className={styles.definitionList}>{selectedItem.generationRules.length ? selectedItem.generationRules.map((rule) => <li key={rule.id}><div><strong>{rule.label}</strong><span>{rule.destination.module === "personal_ops" ? cleanLabel(rule.destination.family) : cleanLabel(rule.destination.module)}</span></div><PersonalOpsStatusChip tone={rule.enabled ? "positive" : "attention"}>{rule.enabled ? "Previewable" : "Disabled"}</PersonalOpsStatusChip></li>) : <li>No output definitions.</li>}</ul></PersonalOpsPanel>
                      <PersonalOpsPanel title="Latest run"><p>{selectedItem.lastRunAt ? formatTimestamp(selectedItem.lastRunAt) : "Never run."}</p><p>{selectedItem.runHistory[0]?.generatedRefs.length ?? 0} native drafts in latest recorded run.</p></PersonalOpsPanel>
                      <PersonalOpsPanel title="Safety boundary"><p>Each run previews exact destination payloads, requires confirmation, and uses an idempotency key. Unsupported modules remain disabled.</p></PersonalOpsPanel>
                    </div>}
                    {selectedItem.objectType === "routine" && activeTab === "history" && <div className={styles.panelGrid}><PersonalOpsPanel title="Run history" wide><ol className={styles.historyList}>{selectedItem.runHistory.length ? [...selectedItem.runHistory].reverse().map((run) => <li key={run.id}><span>{run.generatedRefs.length} draft{run.generatedRefs.length === 1 ? "" : "s"} created</span><small>{formatTimestamp(run.completedAt)} · {run.completedBy}</small><NativeReferenceList refs={run.generatedRefs} /></li>) : <li>No confirmed runs yet.</li>}</ol></PersonalOpsPanel><PersonalOpsPanel title="Object audit" wide><HistoryList entries={selectedItem.history} /></PersonalOpsPanel></div>}
                    {selectedItem.objectType === "routine" && activeTab === "rules" && <div className={styles.panelGrid}><PersonalOpsPanel title="Run policy" wide><ul className={styles.compactList}><li>Manual trigger only.</li><li>Preview precedes every mutation.</li><li>Paused and archived definitions cannot run.</li><li>Destination objects are native drafts with source references.</li><li>No silent AI or cross-module write.</li></ul></PersonalOpsPanel></div>}

                    {selectedItem.objectType === "capture_item" && activeTab === "triage" && <div className={styles.panelGrid}>
                      <PersonalOpsPanel title="Missing context" wide><ul className={styles.compactList}>{selectedItem.missingContext.length ? selectedItem.missingContext.map((entry) => <li key={entry}>{entry}</li>) : <li>No missing context recorded.</li>}</ul></PersonalOpsPanel>
                      <PersonalOpsPanel title="Suggestions" wide><ul className={styles.definitionList}>{selectedItem.suggestions.length ? selectedItem.suggestions.map((suggestion) => <li key={suggestion.id}><div><strong>{suggestion.label}</strong><span>{suggestion.explanation || "Manual suggestion"}</span></div><PersonalOpsStatusChip tone={toneFor(suggestion.state)}>{cleanLabel(suggestion.state)}</PersonalOpsStatusChip></li>) : <li>No suggestions. AI classification is disconnected.</li>}</ul></PersonalOpsPanel>
                    </div>}
                    {selectedItem.objectType === "capture_item" && activeTab === "source" && <div className={styles.panelGrid}><PersonalOpsPanel title="Immutable source" wide><p className={styles.rawSource}>{selectedItem.rawText}</p></PersonalOpsPanel><PersonalOpsPanel title="Capture metadata" wide><dl className={styles.metadataList}><div><dt>Kind</dt><dd>{cleanLabel(selectedItem.source.kind)}</dd></div><div><dt>Label</dt><dd>{selectedItem.source.label}</dd></div><div><dt>Captured</dt><dd>{formatTimestamp(selectedItem.source.capturedAt)}</dd></div><div><dt>Record ID</dt><dd className={styles.mono}>{selectedItem.id}</dd></div></dl></PersonalOpsPanel></div>}
                    {selectedItem.objectType === "capture_item" && activeTab === "activity" && <div className={styles.panelGrid}><PersonalOpsPanel title="Processing actions" wide><ol className={styles.historyList}>{selectedItem.processingActions.length ? [...selectedItem.processingActions].reverse().map((action) => <li key={action.id}><span>{action.createdRefs.length} linked object{action.createdRefs.length === 1 ? "" : "s"}</span><small>{formatTimestamp(action.processedAt)} · {action.processedBy}</small><NativeReferenceList refs={action.createdRefs} /></li>) : <li>Not processed yet.</li>}</ol></PersonalOpsPanel><PersonalOpsPanel title="Object audit" wide><HistoryList entries={selectedItem.history} /></PersonalOpsPanel></div>}

                    {selectedItem.objectType === "template" && activeTab === "fields" && <div className={styles.panelGrid}><PersonalOpsPanel title="Field definitions" wide><div className={styles.definitionTable} role="table" aria-label="Template fields">{selectedItem.fields.map((field) => <div role="row" key={field.id}><span role="cell"><strong>{field.label}</strong><small className={styles.mono}>{field.key}</small></span><span role="cell">{cleanLabel(field.type)}</span><span role="cell">{field.required ? "Required" : "Optional"}</span><span role="cell">{String(field.defaultValue ?? "No default")}</span></div>)}</div></PersonalOpsPanel></div>}
                    {selectedItem.objectType === "template" && activeTab === "usage" && <div className={styles.panelGrid}><PersonalOpsPanel title="Recorded uses" wide><ol className={styles.historyList}>{selectedItem.usages.length ? [...selectedItem.usages].reverse().map((usage) => <li key={usage.id}><Link href={usage.createdRef.route}>{usage.createdRef.label}</Link><small>{formatTimestamp(usage.usedAt)} · {usage.usedBy}</small><p>Created as {cleanLabel(usage.createdRef.objectType)}. Prior output is independent of later template changes.</p></li>) : <li>No confirmed uses yet.</li>}</ol></PersonalOpsPanel></div>}
                    {selectedItem.objectType === "template" && activeTab === "rules" && <div className={styles.panelGrid}><PersonalOpsPanel title="Validation rules" wide><ul className={styles.definitionList}>{selectedItem.rules.length ? selectedItem.rules.map((rule) => <li key={rule.id}><div><strong>{rule.label}</strong><span>{rule.explanation || cleanLabel(rule.when)}</span></div><PersonalOpsStatusChip tone={rule.enabled ? "positive" : "attention"}>{rule.enabled ? "Enabled" : "Disabled"}</PersonalOpsStatusChip></li>) : <li>Required-field validation only.</li>}</ul></PersonalOpsPanel><PersonalOpsPanel title="Generated definitions" wide><ul className={styles.definitionList}>{selectedItem.generatedDefinitions.map((definition) => <li key={definition.id}><div><strong>{definition.label}</strong><span>{definition.destination.module === "personal_ops" ? cleanLabel(definition.destination.family) : cleanLabel(definition.destination.module)}</span></div><PersonalOpsStatusChip tone={definition.enabled ? "positive" : "attention"}>{definition.enabled ? "Enabled" : "Disabled"}</PersonalOpsStatusChip></li>)}</ul></PersonalOpsPanel></div>}
                    {selectedItem.objectType === "template" && activeTab === "activity" && <div className={styles.panelGrid}><PersonalOpsPanel title="Object audit" wide><HistoryList entries={selectedItem.history} /></PersonalOpsPanel></div>}

                    {activeTab === "links" && <div className={styles.panelGrid}><PersonalOpsPanel title="Linked native objects" wide><NativeReferenceList refs={refsFor(selectedItem)} empty="No native links recorded. Removing a link never deletes either object." /></PersonalOpsPanel><PersonalOpsPanel title="Ownership rule" wide><p>References open the owner module through the centralized native-object route registry. This object stores only the reference and provenance.</p></PersonalOpsPanel></div>}
                    {activeTab === "properties" && <div className={styles.panelGrid}><PersonalOpsPanel title="Properties" wide><dl className={styles.metadataList}><div><dt>ID</dt><dd className={styles.mono}>{selectedItem.id}</dd></div><div><dt>Object type</dt><dd>{cleanLabel(selectedItem.objectType)}</dd></div><div><dt>Domain</dt><dd>{selectedItem.domain}</dd></div><div><dt>Owner</dt><dd>{selectedItem.owner}</dd></div><div><dt>Created</dt><dd>{formatTimestamp(selectedItem.createdAt)}</dd></div><div><dt>Updated</dt><dd>{formatTimestamp(selectedItem.updatedAt)}</dd></div>{selectedItem.archivedAt && <div><dt>Archived</dt><dd>{formatTimestamp(selectedItem.archivedAt)}</dd></div>}</dl></PersonalOpsPanel></div>}
                  </DetailTabPanel>
                </div>
              </>
            )}
          </InspectorRail>
        </>
      )}

      {openForm && draft && (
        <AdvancedObjectForm form={openForm} draft={draft} setDraft={setDraft} onSubmit={(event) => void submitForm(event)} onClose={requestCloseForm} busy={busy} error={error} />
      )}

      <ConfirmationSheet
        open={Boolean(pendingAction)}
        onOpenChange={(open) => { if (!open && !busy) setPendingAction(null); }}
        onConfirm={confirmPendingAction}
        title={pendingAction?.type === "discard" ? "Discard unsaved changes?" : pendingAction?.type === "archive" ? "Archive this object?" : pendingAction?.type === "restore" ? "Restore this object?" : pendingAction?.type === "activate" ? "Activate this Template?" : pendingAction?.type === "deprecate" ? "Deprecate this Template?" : pendingAction?.type === "activate-routine" ? "Activate this Routine?" : pendingAction?.type === "pause-routine" ? "Pause this Routine?" : "Resume this Routine?"}
        description={pendingAction?.type === "archive" ? "Archiving is reversible and preserves links, provenance, generated outputs, and audit history." : pendingAction?.type === "activate" ? "Activation makes this definition available for future explicit use; it creates nothing now." : pendingAction?.type === "deprecate" ? "Deprecation blocks future use while preserving prior outputs and usage history." : pendingAction?.type?.includes("routine") ? "This changes only the Routine definition. No work is created and no background scheduler is enabled." : undefined}
        consequences={pendingAction?.type === "discard" ? ["Current form input will be lost."] : pendingAction?.type === "archive" ? ["The object leaves active views.", "No linked or generated object is deleted."] : pendingAction?.type === "pause-routine" ? ["Manual runs are blocked until you resume.", "Run history remains visible."] : undefined}
        confirmLabel={pendingAction?.type === "discard" ? "Discard changes" : pendingAction?.type === "archive" ? "Archive" : pendingAction?.type === "restore" ? "Restore" : pendingAction?.type === "activate" || pendingAction?.type === "activate-routine" ? "Activate" : pendingAction?.type === "deprecate" ? "Deprecate" : pendingAction?.type === "pause-routine" ? "Pause" : "Resume"}
        tone={pendingAction?.type === "discard" || pendingAction?.type === "archive" || pendingAction?.type === "deprecate" ? "danger" : "default"}
        busy={busy}
        confirmDisabled={pendingAction?.type === "archive" && !archiveReason.trim()}
        confirmDisabledReason={pendingAction?.type === "archive" && !archiveReason.trim() ? "Add an archive reason." : undefined}
      >
        {pendingAction?.type === "archive" && <label className={styles.confirmField}><span>Archive reason</span><textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} rows={3} required /></label>}
      </ConfirmationSheet>

      <ConfirmationSheet
        open={Boolean(operation)}
        onOpenChange={(open) => { if (!open && !busy) setOperation(null); }}
        onConfirm={confirmOperation}
        title={operationTitle}
        description={operation?.kind === "routine" ? "Review each generated destination before recording this manual run." : operation?.kind === "capture-setup" ? "Choose one or more native Personal Ops outputs. The raw capture remains unchanged." : operation?.kind === "capture-preview" ? "All supported outputs will be created together and linked back to the immutable capture source." : operation?.kind === "template-values" ? "Enter values and test the definition. Testing never writes an object." : operation?.kind === "template-preview" ? "The test result below is non-writing. Only an active template can be used after this preview." : undefined}
        consequences={operation?.kind === "routine" ? ["Confirmed destination-native drafts are created once.", "The run and created references are written to audit history."] : operation?.kind === "capture-preview" ? ["Supported outputs are created atomically.", "Raw text and provenance remain unchanged."] : operation?.kind === "template-preview" && operation.item.availability === "active" ? ["One destination-native object is created.", "Usage and created reference are recorded on this Template."] : undefined}
        confirmLabel={operationConfirmLabel}
        busy={busy}
        confirmDisabled={operationConfirmDisabled}
        confirmDisabledReason={operation?.kind === "routine" && operation.preview.disabledCount > 0 ? "Resolve disabled destinations before confirming this run." : operation?.kind === "capture-setup" && !operation.decision && !operation.followUp && !operation.obligation ? "Choose at least one native output." : operation?.kind === "capture-preview" && (operation.preview.confirmableCount === 0 || operation.preview.disabledCount > 0) ? "Every selected output must be supported before atomic processing." : operation?.kind === "template-preview" && operation.item.availability !== "active" ? "This is a non-writing test. Activate the Template before using it." : operation?.kind === "template-preview" && Object.keys(operation.preview.fieldErrors).length > 0 ? "Resolve required field errors." : undefined}
      >
        {operation?.kind === "capture-setup" && <fieldset className={styles.operationChoices}><legend>Native outputs</legend><label><input type="checkbox" checked={operation.decision} onChange={(event) => setOperation({ ...operation, decision: event.target.checked })} /> Decision draft</label><label><input type="checkbox" checked={operation.followUp} onChange={(event) => setOperation({ ...operation, followUp: event.target.checked })} /> Follow-up draft</label><label><input type="checkbox" checked={operation.obligation} onChange={(event) => setOperation({ ...operation, obligation: event.target.checked })} /> Obligation draft</label><p>Notes, Projects, Reviews, Finance, files, and URLs stay in their owner modules and are not created here.</p></fieldset>}

        {operation?.kind === "template-values" && <div className={styles.operationFields}>{operation.item.fields.map((field) => <label key={field.id}><span>{field.label}{field.required ? " *" : ""}</span>{field.type === "boolean" ? <input type="checkbox" checked={Boolean(operation.values[field.key])} onChange={(event) => setOperation({ ...operation, values: { ...operation.values, [field.key]: event.target.checked } })} /> : <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={String(operation.values[field.key] ?? "")} onChange={(event) => setOperation({ ...operation, values: { ...operation.values, [field.key]: field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value } })} />}{field.helpText && <small>{field.helpText}</small>}</label>)}</div>}

        {operation?.kind === "routine" && <div className={styles.previewStack}>{operation.preview.entries.map((entry) => <section className={styles.previewCard} key={entry.ruleId}><header><div><strong>{entry.label}</strong><span>{cleanLabel(entry.destinationModule)}{entry.destinationFamily ? ` · ${cleanLabel(entry.destinationFamily)}` : ""}</span></div><PersonalOpsStatusChip tone={entry.canCreate ? "positive" : "attention"}>{entry.canCreate ? "Ready" : "Disabled"}</PersonalOpsStatusChip></header>{entry.disabledReason && <p>{entry.disabledReason}</p>}<ProposedInput value={entry.proposedInput} /></section>)}</div>}
        {operation?.kind === "capture-preview" && <div className={styles.previewStack}><blockquote className={styles.rawSource}>{operation.preview.rawText}</blockquote>{operation.preview.entries.map((entry) => <section className={styles.previewCard} key={entry.outputId}><header><div><strong>{entry.destinationFamily ? cleanLabel(entry.destinationFamily) : cleanLabel(entry.destinationModule)}</strong><span>{entry.excerpt || "Full capture source"}</span></div><PersonalOpsStatusChip tone={entry.canCreate ? "positive" : "attention"}>{entry.canCreate ? "Ready" : "Disabled"}</PersonalOpsStatusChip></header>{entry.disabledReason && <p>{entry.disabledReason}</p>}<ProposedInput value={entry.proposedInput} /></section>)}</div>}
        {operation?.kind === "template-preview" && <div className={styles.previewStack}>{Object.entries(operation.preview.fieldErrors).map(([field, errors]) => <div className={styles.error} role="alert" key={field}><strong>{cleanLabel(field)}</strong>: {errors.join(" ")}</div>)}{operation.preview.entries.map((entry) => <section className={styles.previewCard} key={entry.definitionId}><header><div><strong>{entry.label}</strong><span>{cleanLabel(entry.destinationModule)}{entry.destinationFamily ? ` · ${cleanLabel(entry.destinationFamily)}` : ""}</span></div><PersonalOpsStatusChip tone={entry.canCreate ? "positive" : "attention"}>{entry.canCreate ? "Valid preview" : "Disabled"}</PersonalOpsStatusChip></header>{entry.disabledReason && <p>{entry.disabledReason}</p>}<ProposedInput value={entry.proposedInput} /></section>)}</div>}
      </ConfirmationSheet>

      <SharedAIDock
        open={urlState.ai}
        onOpenChange={(open) => updateUrl({ ai: open })}
        context={{
          module: "personal_ops",
          object: selectedNative ? nativeRefFor(selectedNative) : null,
          activeTab,
          visibleScope: `${config.title} · ${urlState.filter}`,
          allowedActions: ["Draft a proposal", "Summarize visible context", "Suggest classification for review"]
        }}
      />
    </div>
  );
}
