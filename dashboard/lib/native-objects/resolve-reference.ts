import { readPersonalRecords } from "../personal-records-store";
import { legacyPersonalRecordsToMediaAssets } from "../modules/media/legacy-adapter";
import { legacyPersonalRecordsToNotes } from "../modules/notes/legacy-adapter";
import { legacyPersonalRecordsToPeople } from "../modules/people/legacy-adapter";
import { readPersonalOpsState } from "../modules/personal-ops/store";
import { readProjectsState } from "../modules/projects/store";
import { legacyPersonalRecordsToResources } from "../modules/resources/legacy-adapter";
import { readReviewsState } from "../modules/reviews/store";
import { createNativeObjectRef } from "./routes";
import type { ModuleId, NativeObjectRef } from "./types";

type Candidate = {
  module: ModuleId;
  objectType: string;
  objectId: string;
  containerObjectId?: string;
  label: string;
  archived: boolean;
};

function archived(value: Record<string, unknown>): boolean {
  return Boolean(
    value.archivedAt
    || value.lifecycle === "archived"
    || value.lifecycleStatus === "archived"
    || value.state === "archived"
    || value.linkState === "removed"
  );
}

function objectCandidate(
  module: ModuleId,
  value: Record<string, unknown>,
  defaults: { objectType?: string; containerObjectId?: string; label?: string } = {}
): Candidate | null {
  const objectId = typeof value.id === "string" ? value.id : "";
  const objectType = typeof value.objectType === "string" ? value.objectType : defaults.objectType || "";
  if (!objectId || !objectType) return null;
  const labelValue = [value.title, value.name, value.fullName, value.label, defaults.label]
    .find((candidate) => typeof candidate === "string" && candidate.trim());
  return {
    module,
    objectType,
    objectId,
    ...(defaults.containerObjectId ? { containerObjectId: defaults.containerObjectId } : {}),
    label: typeof labelValue === "string" ? labelValue.trim() : `${objectType} ${objectId}`,
    archived: archived(value)
  };
}

function refCandidate(ref: NativeObjectRef, source: Record<string, unknown>): Candidate {
  return {
    module: ref.module,
    objectType: ref.objectType,
    objectId: ref.objectId,
    ...(ref.containerObjectId ? { containerObjectId: ref.containerObjectId } : {}),
    label: ref.label,
    archived: archived(source)
  };
}

function add(candidate: Candidate | null, candidates: Candidate[]) {
  if (candidate) candidates.push(candidate);
}

async function loadCandidates(module: ModuleId): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  if (module === "notes" || module === "media" || module === "resources" || module === "people") {
    const records = await readPersonalRecords();
    const objects = module === "notes" ? legacyPersonalRecordsToNotes(records)
      : module === "media" ? legacyPersonalRecordsToMediaAssets(records)
        : module === "resources" ? legacyPersonalRecordsToResources(records)
          : legacyPersonalRecordsToPeople(records);
    for (const object of objects) {
      add(refCandidate(object.nativeRef, object as unknown as Record<string, unknown>), candidates);
    }
    return candidates;
  }

  if (module === "projects") {
    const state = await readProjectsState();
    for (const project of state.projects) add(objectCandidate(module, project), candidates);
    for (const item of [...state.milestones, ...state.blockers, ...state.links]) {
      add(objectCandidate(module, item, { containerObjectId: item.projectId }), candidates);
    }
    return candidates;
  }

  if (module === "personal_ops") {
    const state = await readPersonalOpsState();
    for (const item of [
      ...state.goals,
      ...state.decisions,
      ...state.obligations,
      ...state.followUps,
      ...state.routines,
      ...state.captures,
      ...state.templates
    ]) add(objectCandidate(module, item), candidates);
    return candidates;
  }

  if (module === "reviews") {
    const state = await readReviewsState();
    for (const run of state.runs) {
      add(objectCandidate(module, run, { objectType: "review_run" }), candidates);
      const nested: ReadonlyArray<readonly [Record<string, unknown>, string]> = [
        ...run.checklist.map((item) => [item as unknown as Record<string, unknown>, "review_checklist_item"] as const),
        ...run.contextLinks.map((item) => [item as unknown as Record<string, unknown>, "review_context_link"] as const),
        ...run.evidence.map((item) => [item as unknown as Record<string, unknown>, "review_evidence_item"] as const),
        ...run.decisions.map((item) => [item as unknown as Record<string, unknown>, "review_decision_item"] as const),
        ...run.followUps.map((item) => [item as unknown as Record<string, unknown>, "review_follow_up"] as const),
        ...run.carryForward.map((item) => [item as unknown as Record<string, unknown>, "review_carry_forward_item"] as const)
      ];
      for (const [item, objectType] of nested) {
        add(objectCandidate(module, item, { objectType, containerObjectId: run.id }), candidates);
      }
    }
    return candidates;
  }

  // Finance evidence must come from a separately owned native object. This
  // avoids circular self-attestation inside a payment or close gate.
  return candidates;
}

export async function resolveActiveNativeObjectRef(ref: NativeObjectRef): Promise<NativeObjectRef | null> {
  const candidates = await loadCandidates(ref.module);
  const candidate = candidates.find((item) =>
    item.objectType === ref.objectType
    && item.objectId === ref.objectId
    && (item.containerObjectId || "") === (ref.containerObjectId || "")
  );
  if (!candidate || candidate.archived) return null;
  return createNativeObjectRef({
    module: candidate.module,
    objectType: candidate.objectType,
    objectId: candidate.objectId,
    ...(candidate.containerObjectId ? { containerObjectId: candidate.containerObjectId } : {}),
    label: candidate.label
  });
}
