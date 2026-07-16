import { createNativeObjectRef } from "../../native-objects/routes";
import type { NativeObjectRef } from "../../native-objects/types";
import type {
  LegacyPersonalOpsCandidate,
  LegacyPersonalRecordDescriptor,
  PersonalOpsFamily,
  PersonalOpsLegacyMapping,
  PersonalOpsState
} from "./types";

const ALL_EXPLICIT_CONVERSIONS: PersonalOpsFamily[] = [
  "goals",
  "decisions",
  "obligations",
  "followUps"
];

function ownedSourceRef(record: LegacyPersonalRecordDescriptor): NativeObjectRef {
  if (record.className === "person" || record.className === "org") {
    return createNativeObjectRef({
      module: "people",
      objectType: record.className,
      objectId: record.id,
      label: record.title
    });
  }

  if (record.className === "resource") {
    return createNativeObjectRef({
      module: "resources",
      objectType: "resource",
      objectId: record.id,
      label: record.title
    });
  }

  if (record.className === "file") {
    return createNativeObjectRef({
      module: "media",
      objectType: "asset",
      objectId: record.id,
      label: record.title
    });
  }

  if (record.domain === "notes-docs") {
    return createNativeObjectRef({
      module: "notes",
      objectType: record.className === "decision" ? "decision_candidate" : "note",
      objectId: record.id,
      label: record.title
    });
  }

  return createNativeObjectRef({
    module: "personal_ops",
    objectType: "capture_item",
    objectId: record.id,
    label: record.title
  });
}

/**
 * Classifies a legacy Personal Record without mutating or promoting it.
 * Class alone is intentionally insufficient to create a native operating object.
 */
export function classifyLegacyPersonalRecord(
  record: LegacyPersonalRecordDescriptor
): LegacyPersonalOpsCandidate {
  if (record.className === "person" || record.className === "org") {
    return {
      legacyPersonalRecordId: record.id,
      title: record.title,
      classification: "owned_elsewhere",
      currentOwner: "people",
      allowedConversions: [],
      requiresExplicitChoice: true,
      reason: "Identity and relationship profiles remain People-owned.",
      source: { ...record }
    };
  }

  if (record.className === "resource") {
    return {
      legacyPersonalRecordId: record.id,
      title: record.title,
      classification: "owned_elsewhere",
      currentOwner: "resources",
      allowedConversions: [],
      requiresExplicitChoice: true,
      reason: "External-source identity remains Resources-owned.",
      source: { ...record }
    };
  }

  if (record.className === "file") {
    return {
      legacyPersonalRecordId: record.id,
      title: record.title,
      classification: "owned_elsewhere",
      currentOwner: "media",
      allowedConversions: [],
      requiresExplicitChoice: true,
      reason: "Files and binaries remain Media-owned.",
      source: { ...record }
    };
  }

  if (record.domain === "notes-docs" && record.className === "decision") {
    return {
      legacyPersonalRecordId: record.id,
      title: record.title,
      classification: "decision_candidate",
      currentOwner: "notes",
      allowedConversions: ["decisions"],
      requiresExplicitChoice: true,
      reason:
        "The legacy Decision class is a Notes decision candidate. Filing a durable Decision requires explicit confirmation.",
      source: { ...record }
    };
  }

  if (record.domain === "notes-docs") {
    return {
      legacyPersonalRecordId: record.id,
      title: record.title,
      classification: "owned_elsewhere",
      currentOwner: "notes",
      allowedConversions: [],
      requiresExplicitChoice: true,
      reason: "Authored knowledge remains Notes-owned and is not reinterpreted as operating work.",
      source: { ...record }
    };
  }

  return {
    legacyPersonalRecordId: record.id,
    title: record.title,
    classification: "unclassified_capture",
    currentOwner: "personal_ops",
    allowedConversions: [...ALL_EXPLICIT_CONVERSIONS],
    requiresExplicitChoice: true,
    reason:
      "The legacy domain/class combination is ambiguous. Preserve it as source context until a user selects a native destination.",
    source: { ...record }
  };
}

export function classifyLegacyPersonalRecords(
  records: LegacyPersonalRecordDescriptor[]
): LegacyPersonalOpsCandidate[] {
  return records.map(classifyLegacyPersonalRecord);
}

export function findLegacyMapping(
  state: Pick<PersonalOpsState, "legacyMappings">,
  legacyPersonalRecordId: string,
  conversionKey: string
): PersonalOpsLegacyMapping | undefined {
  return state.legacyMappings.find(
    (mapping) =>
      mapping.legacyPersonalRecordId === legacyPersonalRecordId &&
      mapping.conversionKey === conversionKey
  );
}

export function getLegacySourceRef(record: LegacyPersonalRecordDescriptor): NativeObjectRef {
  return ownedSourceRef(record);
}

