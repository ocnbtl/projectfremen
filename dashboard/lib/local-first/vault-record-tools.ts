import {
  pendingCanonicalCommands,
  readCanonicalMetadata,
  readCanonicalRelationships,
  type CanonicalModule
} from "./canonical-record";
import type { VaultFieldValue, VaultObjectKind, VaultObjectSnapshot } from "./types";

export type VaultRecordOption = {
  objectId: string;
  canonicalId: string;
  label: string;
  kind: VaultObjectKind;
  module: CanonicalModule;
  moduleLabel: string;
  collection: string;
  route: string;
  updatedAt: string;
  searchText: string;
};

export type VaultRelationshipView = {
  id: string;
  direction: "outgoing" | "incoming";
  relationship: string;
  status: "saved" | "waiting";
  target: VaultRecordOption | null;
  targetCanonicalId: string;
  targetLabel: string;
  healthState?: string;
};

export type VaultSearchEntry = {
  snapshot: VaultObjectSnapshot;
  label: string;
  searchText: string;
};

type NativeRefShape = {
  module: string;
  objectType: string;
  objectId: string;
  label: string;
};

const MODULE_LABELS: Record<CanonicalModule, string> = {
  "personal-records": "Library",
  projects: "Projects",
  "personal-ops": "Personal",
  reviews: "Reviews",
  finance: "Finance"
};

function isRecord(value: unknown): value is Record<string, VaultFieldValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(fields: Record<string, VaultFieldValue>, ...keys: string[]): string {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function vaultRecordLabel(snapshot: VaultObjectSnapshot): string {
  return stringValue(snapshot.fields, "title", "name", "merchant", "fullName", "label", "institution") || "Untitled";
}

function searchableValue(value: VaultFieldValue): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" || typeof item === "number").join(" ");
  return "";
}

function searchableFields(fields: Record<string, VaultFieldValue>): string {
  return Object.entries(fields)
    .filter(([key]) => !key.startsWith("__unigentamos"))
    .map(([key, value]) => `${key} ${JSON.stringify(value)}`)
    .join(" ")
    .normalize("NFKD")
    .toLocaleLowerCase();
}

export function buildVaultSearchIndex(objects: readonly VaultObjectSnapshot[]): VaultSearchEntry[] {
  return objects
    .filter((snapshot) => snapshot.objectKind !== "settings")
    .map((snapshot) => {
      const option = vaultRecordOption(snapshot);
      const label = option?.label || vaultRecordLabel(snapshot);
      return {
        snapshot,
        label,
        searchText: [label, option?.moduleLabel || "", option?.collection || "", snapshot.objectKind, searchableFields(snapshot.fields)]
          .join(" ")
          .normalize("NFKD")
          .toLocaleLowerCase()
      };
    });
}

export function searchVaultRecords(
  index: readonly VaultSearchEntry[],
  query: string,
  kind: VaultObjectKind | "all"
): VaultObjectSnapshot[] {
  const tokens = query.trim().normalize("NFKD").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return index
    .filter((entry) => kind === "all" || entry.snapshot.objectKind === kind)
    .filter((entry) => tokens.every((token) => entry.searchText.includes(token)))
    .sort((left, right) => {
      if (tokens.length) {
        const phrase = tokens.join(" ");
        const leftLabel = left.label.toLocaleLowerCase();
        const rightLabel = right.label.toLocaleLowerCase();
        const leftScore = leftLabel === phrase ? 3 : leftLabel.startsWith(phrase) ? 2 : leftLabel.includes(phrase) ? 1 : 0;
        const rightScore = rightLabel === phrase ? 3 : rightLabel.startsWith(phrase) ? 2 : rightLabel.includes(phrase) ? 1 : 0;
        if (leftScore !== rightScore) return rightScore - leftScore;
      }
      return right.snapshot.updatedAt.localeCompare(left.snapshot.updatedAt) || left.label.localeCompare(right.label);
    })
    .map((entry) => entry.snapshot);
}

export function vaultRecordOption(snapshot: VaultObjectSnapshot): VaultRecordOption | null {
  const metadata = readCanonicalMetadata(snapshot.fields);
  if (!metadata) return null;
  const searchable = Object.entries(snapshot.fields)
    .filter(([key]) => !key.startsWith("__unigentamos"))
    .slice(0, 40)
    .map(([, value]) => searchableValue(value))
    .filter(Boolean)
    .join(" ");
  const label = vaultRecordLabel(snapshot);
  return {
    objectId: snapshot.objectId,
    canonicalId: metadata.canonicalId,
    label,
    kind: snapshot.objectKind,
    module: metadata.module,
    moduleLabel: MODULE_LABELS[metadata.module],
    collection: metadata.collection,
    route: metadata.route,
    updatedAt: snapshot.updatedAt,
    searchText: [label, MODULE_LABELS[metadata.module], metadata.collection, searchable].join(" ").toLocaleLowerCase()
  };
}

export function findVaultRelationshipTargets(
  selected: VaultObjectSnapshot | null,
  objects: readonly VaultObjectSnapshot[],
  query: string,
  limit = 16
): VaultRecordOption[] {
  const normalized = query.trim().toLocaleLowerCase();
  return objects
    .filter((item) => item.objectId !== selected?.objectId)
    .map(vaultRecordOption)
    .filter((item): item is VaultRecordOption => Boolean(item))
    .filter((item) => !normalized || item.searchText.includes(normalized))
    .sort((left, right) => {
      if (normalized) {
        const leftStarts = left.label.toLocaleLowerCase().startsWith(normalized) ? 1 : 0;
        const rightStarts = right.label.toLocaleLowerCase().startsWith(normalized) ? 1 : 0;
        if (leftStarts !== rightStarts) return rightStarts - leftStarts;
      }
      return right.updatedAt.localeCompare(left.updatedAt) || left.label.localeCompare(right.label);
    })
    .slice(0, limit);
}

function nativeIdentityFor(snapshot: VaultObjectSnapshot): string | null {
  const metadata = readCanonicalMetadata(snapshot.fields);
  if (!metadata) return null;
  let module: string = metadata.module;
  let objectType = stringValue(snapshot.fields, "objectType") || metadata.collection;
  if (metadata.module === "personal-records") {
    module = metadata.collection === "note" ? "notes"
      : metadata.collection === "resource" ? "resources"
        : metadata.collection === "file" ? "media"
          : "people";
    objectType = metadata.collection === "file" ? "media_asset"
      : metadata.collection === "org" ? "organization"
        : metadata.collection;
  } else if (metadata.module === "personal-ops") {
    module = "personal_ops";
  } else if (metadata.module === "projects") {
    objectType = ({ projects: "project", milestones: "project_milestone", blockers: "project_blocker", links: "project_link" } as Record<string, string>)[metadata.collection] || objectType;
  } else if (metadata.module === "reviews") {
    objectType = "review_run";
  }
  return [module, objectType, metadata.recordId].join(":");
}

function nativeRef(value: VaultFieldValue): NativeRefShape | null {
  if (!isRecord(value)) return null;
  return typeof value.module === "string"
    && typeof value.objectType === "string"
    && typeof value.objectId === "string"
    && typeof value.label === "string"
    ? value as unknown as NativeRefShape
    : null;
}

function collectNativeRefs(value: VaultFieldValue, relationship: string, found: Array<{ ref: NativeRefShape; relationship: string }>): void {
  const direct = nativeRef(value);
  if (direct) {
    found.push({ ref: direct, relationship });
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNativeRefs(item, relationship, found);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    collectNativeRefs(nested, key === "sourceRef" || key === "targetRef" ? relationship : key, found);
  }
}

function relationshipRefs(snapshot: VaultObjectSnapshot): Array<{ ref: NativeRefShape; relationship: string }> {
  const found: Array<{ ref: NativeRefShape; relationship: string }> = [];
  for (const [field, value] of Object.entries(snapshot.fields)) {
    if (field.startsWith("__unigentamos") || !/(ref|source|contextLinks|target)/i.test(field)) continue;
    collectNativeRefs(value, field.replace(/Refs?$/i, "").replaceAll("_", " "), found);
  }
  return found;
}

function optionMaps(objects: readonly VaultObjectSnapshot[]) {
  const options = objects.map(vaultRecordOption).filter((item): item is VaultRecordOption => Boolean(item));
  const byCanonical = new Map(options.map((item) => [item.canonicalId, item]));
  const byNative = new Map<string, VaultRecordOption>();
  for (const snapshot of objects) {
    const option = vaultRecordOption(snapshot);
    const identity = nativeIdentityFor(snapshot);
    if (option && identity) byNative.set(identity, option);
  }
  return { options, byCanonical, byNative };
}

function optionForRef(ref: NativeRefShape, byNative: Map<string, VaultRecordOption>): VaultRecordOption | null {
  return byNative.get([ref.module, ref.objectType, ref.objectId].join(":")) || null;
}

export function vaultRelationshipsFor(
  selected: VaultObjectSnapshot,
  objects: readonly VaultObjectSnapshot[]
): VaultRelationshipView[] {
  const selectedMetadata = readCanonicalMetadata(selected.fields);
  if (!selectedMetadata) return [];
  const { byCanonical, byNative } = optionMaps(objects);
  const selectedNativeIdentity = nativeIdentityFor(selected);
  const relationships: VaultRelationshipView[] = [];
  const seen = new Set<string>();
  const add = (item: VaultRelationshipView) => {
    const key = [item.direction, item.targetCanonicalId, item.relationship].join(":");
    if (!seen.has(key)) {
      seen.add(key);
      relationships.push(item);
    }
  };

  for (const stored of readCanonicalRelationships(selected.fields)) {
    add({
      id: stored.linkId,
      direction: stored.direction,
      relationship: stored.relationship,
      status: "saved",
      target: byCanonical.get(stored.targetCanonicalId) || null,
      targetCanonicalId: stored.targetCanonicalId,
      targetLabel: stored.targetLabel,
      healthState: stored.state
    });
  }

  for (const { ref, relationship } of relationshipRefs(selected)) {
    const target = optionForRef(ref, byNative);
    if (!target) continue;
    add({
      id: ["outgoing", selectedMetadata.canonicalId, target.canonicalId, relationship].join(":"),
      direction: "outgoing",
      relationship,
      status: "saved",
      target,
      targetCanonicalId: target.canonicalId,
      targetLabel: target.label
    });
  }

  for (const command of pendingCanonicalCommands(selected).map((item) => item.command)) {
    if (command.operation !== "owner_action" || command.ownerAction?.name !== "link") continue;
    const target = byCanonical.get(command.ownerAction.target.canonicalId) || null;
    add({
      id: command.commandId,
      direction: "outgoing",
      relationship: command.ownerAction.relationship || "reference",
      status: "waiting",
      target,
      targetCanonicalId: command.ownerAction.target.canonicalId,
      targetLabel: command.ownerAction.target.label
    });
  }

  for (const source of objects) {
    if (source.objectId === selected.objectId) continue;
    const sourceMetadata = readCanonicalMetadata(source.fields);
    const sourceOption = vaultRecordOption(source);
    if (!sourceMetadata || !sourceOption) continue;

    if (
      selectedMetadata.module === "projects"
      && selectedMetadata.collection === "projects"
      && sourceMetadata.module === "projects"
      && sourceMetadata.collection === "links"
      && source.fields.projectId === selectedMetadata.recordId
      && source.fields.linkState !== "removed"
    ) {
      const sourceRef = nativeRef(source.fields.source);
      const target = sourceRef ? optionForRef(sourceRef, byNative) : null;
      if (target) add({
        id: sourceMetadata.canonicalId,
        direction: "outgoing",
        relationship: stringValue(source.fields, "relationship") || "supporting context",
        status: "saved",
        target,
        targetCanonicalId: target.canonicalId,
        targetLabel: target.label
      });
    }

    if (!selectedNativeIdentity) continue;
    for (const { ref, relationship } of relationshipRefs(source)) {
      if ([ref.module, ref.objectType, ref.objectId].join(":") !== selectedNativeIdentity) continue;
      let relationshipSource = sourceOption;
      if (sourceMetadata.module === "projects" && sourceMetadata.collection === "links" && typeof source.fields.projectId === "string") {
        relationshipSource = byCanonical.get(`projects:projects:${source.fields.projectId}`) || sourceOption;
      }
      add({
        id: ["incoming", relationshipSource.canonicalId, selectedMetadata.canonicalId, relationship].join(":"),
        direction: "incoming",
        relationship: stringValue(source.fields, "relationship") || relationship,
        status: "saved",
        target: relationshipSource,
        targetCanonicalId: relationshipSource.canonicalId,
        targetLabel: relationshipSource.label
      });
    }
  }

  return relationships.sort((left, right) =>
    (left.direction === right.direction ? 0 : left.direction === "outgoing" ? -1 : 1)
    || left.targetLabel.localeCompare(right.targetLabel)
  );
}
