import { readPlanningState } from "./store";
import { eventOccurrences, addDays } from "./calendar-model";
import { outcomeId, outcomeSource } from "./event-outcomes";
import type { NativeObjectRef } from "../../native-objects/types";
import { editableCalendarRef, type CalendarWorkItem, type CalendarWorkResult } from "./linked-work-types";
import { readPersonalRecords, updatePersonalRecord, NOTE_KINDS } from "../../personal-records-store";
import type { GoalState, DecisionState, FollowUpState } from "../personal-ops/types";
import { readPersonalOpsState, updatePersonalOpsObject } from "../personal-ops/store";
import { PERSONAL_STATUS_OPTIONS } from "../personal-ops/status-display";
import { createNativeObjectRef } from "../../native-objects/routes";
import { INTERACTION_KINDS } from "./interaction-kinds";

function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
const text = (value: unknown, max = 4000, required = false) => {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) return fail("Check the required fields and text length.");
  return value.trim();
};
const date = (value: unknown) => {
  const result = text(value, 10);
  if (result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result)) fail("Choose a valid date.");
  return result;
};

/** Resolve only the actual occurrence's links, then return the original records.
 * This runs when opened, never as Calendar preloading. Receipts are immutable. */
export async function readCalendarWork(rawSource: unknown): Promise<CalendarWorkResult> {
  const source = outcomeSource(rawSource);
  const state = await readPlanningState();
  const ops = await readPersonalOpsState();
  let references: NativeObjectRef[];
  if (source.family === "events") {
    const record = state.events.find(e => e.id === source.id);
    if (!record || record.archivedAt) fail("This event is no longer available.", 404);
    const day = source.occurrenceKey.slice(0, 10);
    if (!Number.isFinite(Date.parse(day))) fail("Choose a valid occurrence.");
    const event = eventOccurrences([record], addDays(day, -2), addDays(day, 3), record.timeZone).find(e => e.occurrenceKey === source.occurrenceKey);
    if (!event || event.source?.cancelled) fail("This occurrence is no longer available.", 404);
    references = event.linkedRefs;
  } else {
    // Dated Personal work is a projection: editing its due date must not strand
    // the open editor on the old occurrence or require a second task record.
    const item = ops[source.family].find(i => i.id === source.id);
    if (!item) fail("This Personal item is no longer available.", 404);
    references = [createNativeObjectRef({module:"personal_ops",objectType:item.objectType,objectId:item.id,label:item.title}), ...item.linkedRefs, ...item.sourceRefs];
  }
  const receipt = state.outcomeReceipts?.find(r => r.id === outcomeId(source, state));
  const refs = [...references, ...(receipt?.refs || [])].filter(editableCalendarRef);
  const records = refs.some(r => r.module !== "personal_ops") ? await readPersonalRecords() : [];
  const items = new Map<string, CalendarWorkItem>();
  for (const ref of refs) {
    if (ref.module !== "personal_ops") {
      const item = records.find(r => r.id === ref.objectId && ["note", "interaction"].includes(r.className));
      if (!item) continue;
      items.set("record:" + item.id, { id: item.id, kind: item.className === "interaction" ? "interaction" : "note", title: item.title,
        updatedAt: item.updatedAt, body: item.body, status: item.status, readOnly: Boolean(item.archivedAt), noteType: item.noteType, interaction: item.interaction });
    } else {
      const item = [...ops.goals, ...ops.decisions, ...ops.followUps].find(r => r.id === ref.objectId && r.objectType === ref.objectType);
      if (!item) continue;
      items.set("work:" + item.id, { id: item.id, kind: item.objectType, title: item.title, updatedAt: item.updatedAt,
        body: item.description, dueAt: item.dueAt, readOnly: item.lifecycle === "archived",
        status: item.lifecycle === "archived" ? "archived" : item.objectType === "goal" ? item.goalState || item.lifecycle : item.objectType === "decision" ? item.decisionState : item.followUpState,
        ...(item.objectType === "goal" ? { outcome: item.outcome, keyResults: item.keyResults } :
          item.objectType === "decision" ? { question: item.question, finalDecision: item.finalDecision, deferReason: item.deferReason, revisitAt: item.revisitAt, replacementId: item.supersededBy?.objectId } :
          { outcome: item.outcome, question: item.context, deferReason: item.deferReason, revisitAt: item.deferredUntil }) });
    }
  }
  return { items: [...items.values()], replacements: items.size && [...items.values()].some(i => i.kind === "decision") ?
    ops.decisions.filter(d => d.lifecycle !== "archived").map(d => ({ id: d.id, title: d.title })) : [] };
}

export async function editCalendarWork(rawSource: unknown, raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("Choose a linked record.");
  const input = raw as Record<string, unknown>;
  const loaded = await readCalendarWork(rawSource);
  const current = loaded.items.find(i => i.id === input.id && i.kind === input.kind);
  if (!current) fail("This record is no longer linked to this occurrence.", 404);
  if (current.readOnly) fail("Restore this record in its original module before editing.", 409);
  if (text(input.updatedAt, 120, true) !== current.updatedAt) fail("This record changed elsewhere. Your draft is still here; reload the latest version before saving.", 409);
  const title = text(input.title, 240, true), body = text(input.body, 200000);
  if (current.kind === "note" || current.kind === "interaction") {
    let interaction = current.interaction;
    if (current.kind === "interaction" && interaction && input.interaction) {
      const edit = input.interaction as Record<string, unknown>;
      if (!INTERACTION_KINDS.some(k => k.value === edit.kind)) fail("Choose an interaction type.");
      interaction = { ...interaction, kind: edit.kind as typeof interaction.kind, occurredOn: date(edit.occurredOn),
        startTime: text(edit.startTime ?? "", 5), endTime: text(edit.endTime ?? "", 5), endNextDay: edit.endNextDay === true };
    }
    if (current.kind === "note" && !NOTE_KINDS.includes(input.noteType as typeof NOTE_KINDS[number])) fail("Choose a note type.");
    await updatePersonalRecord(current.id, { title, body, ...(current.kind === "note" ? { noteType: input.noteType as typeof NOTE_KINDS[number] } : { interaction }) }, { expectedUpdatedAt: current.updatedAt });
  } else {
    const status = text(input.status, 30, true);
    if (!(PERSONAL_STATUS_OPTIONS[current.kind] as readonly string[]).includes(status)) fail("Choose a valid status.");
    const common = { title, description: body, ...(input.dueAt !== current.dueAt ? {dueAt: date(input.dueAt ?? "")} : {}), ...(status !== current.status ? {lifecycle: status === "archived" ? "archived" as const : status === "complete" ? "complete" as const : "active" as const} : {}), ...(status === "archived" ? {archiveReason:text(input.archiveReason,2000,true)} : {}) };
    if (current.kind === "goal") {
      // Existing result identities and measurements stay intact; only completion changes here.
      const changes = Array.isArray(input.keyResults) ? input.keyResults : [];
      const keyResults = (current.keyResults || []).map(k => ({ ...k, complete: changes.find(c => c?.id === k.id)?.complete ?? k.complete }));
      await updatePersonalOpsObject("goals", current.id, { ...common, ...(status !== "archived" ? { goalState: status as GoalState } : {}), outcome: text(input.outcome, 4000, true), keyResults }, { expectedUpdatedAt: current.updatedAt });
    } else if (current.kind === "decision") {
      const replacement = loaded.replacements.find(r => r.id === input.replacementId && r.id !== current.id);
      if (status === "superseded" && !replacement) fail("Choose the replacement decision.");
      await updatePersonalOpsObject("decisions", current.id, { ...common, ...(status !== "archived" ? { decisionState: status as DecisionState } : {}),
        question: text(input.question, 4000, true), finalDecision: text(input.finalDecision ?? "", 4000), deferReason: text(input.deferReason ?? ""), ...(input.revisitAt !== current.revisitAt ? {revisitAt: date(input.revisitAt ?? "")} : {}),
        ...(replacement ? { supersededBy: createNativeObjectRef({ module: "personal_ops", objectType: "decision", objectId: replacement.id, label: replacement.title }) } : {}) }, { expectedUpdatedAt: current.updatedAt });
    } else {
      await updatePersonalOpsObject("followUps", current.id, { ...common, ...(status !== "archived" ? { followUpState: status as FollowUpState } : {}),
        context: text(input.question ?? "", 4000), outcome: text(input.outcome ?? "", 6000), deferReason: text(input.deferReason ?? ""), ...(input.revisitAt !== current.revisitAt ? {deferredUntil: date(input.revisitAt ?? "")} : {}) }, { expectedUpdatedAt: current.updatedAt });
    }
  }
  // A separate read is intentionally avoided after mutation: callers reload when needed.
  return { saved: true };
}
