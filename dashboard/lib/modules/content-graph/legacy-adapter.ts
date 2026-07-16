import type { MediaAsset } from "../media/types";
import type { NoteRecord } from "../notes/types";
import type { ResourceRecord } from "../resources/types";
import { normalizeResourceExternalUrl } from "../resources/source-evidence";
import type { NativeObjectRef } from "../../native-objects/types";
import type {
  LegacyContentGraph,
  LegacyContentLinkCandidate,
  LegacyUnresolvedReference
} from "./types";

type LegacyContentGraphInput = {
  notes: readonly NoteRecord[];
  resources: readonly ResourceRecord[];
  media: readonly MediaAsset[];
};

type RelationSource = {
  nativeRef: NativeObjectRef;
  relations: {
    north: readonly string[];
    south: readonly string[];
    east: readonly string[];
    west: readonly string[];
    stakeholders: readonly string[];
    stakeholdings: readonly string[];
    internalSources: readonly string[];
    related: readonly string[];
  };
};

function stableId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

export function normalizeLegacyExternalUrl(value: string): string | null {
  return normalizeResourceExternalUrl(value);
}

function noteUrlEntries(note: NoteRecord): Array<{ value: string; field: string }> {
  const entries: Array<{ value: string; field: string }> = [];
  if (note.legacySources.sourceUrl) {
    entries.push({ value: note.legacySources.sourceUrl, field: "legacySources.sourceUrl" });
  }
  note.legacySources.externalSources.forEach((value, index) => {
    entries.push({ value, field: `legacySources.externalSources[${index}]` });
  });
  return entries;
}

function resourceUrlEntries(resource: ResourceRecord): Array<{
  matchKey: string;
  evidenceFields: string[];
}> {
  const fieldsByKey = new Map<string, string[]>();
  for (const candidate of resource.source.candidates) {
    fieldsByKey.set(candidate.matchKey, [
      ...(fieldsByKey.get(candidate.matchKey) || []),
      candidate.evidenceField
    ]);
  }
  return Array.from(fieldsByKey, ([matchKey, evidenceFields]) => ({
    matchKey,
    evidenceFields
  }));
}

function addLinkCandidate(
  links: LegacyContentLinkCandidate[],
  seen: Set<string>,
  candidate: Omit<LegacyContentLinkCandidate, "id" | "linkState" | "readOnly">
) {
  const identity = [
    candidate.source.module,
    candidate.source.objectId,
    candidate.target.module,
    candidate.target.objectId,
    candidate.relationship,
    candidate.evidenceField,
    candidate.evidenceValue,
    candidate.legacyDirection || ""
  ].join("|");
  if (seen.has(identity)) return;
  seen.add(identity);
  links.push({
    ...candidate,
    id: stableId("legacy-content-link", identity),
    linkState: "pending",
    readOnly: true
  });
}

function addUnresolvedReference(
  unresolved: LegacyUnresolvedReference[],
  seen: Set<string>,
  reference: Omit<LegacyUnresolvedReference, "id" | "readOnly">
) {
  const identity = [
    reference.source.module,
    reference.source.objectId,
    reference.kind,
    reference.evidenceField,
    reference.value,
    reference.legacyDirection || ""
  ].join("|");
  if (seen.has(identity)) return;
  seen.add(identity);
  unresolved.push({
    ...reference,
    id: stableId("legacy-unresolved", identity),
    readOnly: true
  });
}

export function buildLegacyContentGraph({
  notes,
  resources,
  media
}: LegacyContentGraphInput): LegacyContentGraph {
  const linkCandidates: LegacyContentLinkCandidate[] = [];
  const unresolvedReferences: LegacyUnresolvedReference[] = [];
  const seenLinks = new Set<string>();
  const seenUnresolved = new Set<string>();
  const resourcesByUrl = new Map<
    string,
    Array<{ resource: ResourceRecord; evidenceFields: string[] }>
  >();

  for (const resource of resources) {
    for (const entry of resourceUrlEntries(resource)) {
      resourcesByUrl.set(entry.matchKey, [
        ...(resourcesByUrl.get(entry.matchKey) || []),
        { resource, evidenceFields: entry.evidenceFields }
      ]);
    }
  }

  for (const note of notes) {
    for (const entry of noteUrlEntries(note)) {
      const normalized = normalizeLegacyExternalUrl(entry.value);
      if (!normalized) continue;
      const targets = resourcesByUrl.get(normalized) || [];
      if (!targets.length) {
        addUnresolvedReference(unresolvedReferences, seenUnresolved, {
          source: note.nativeRef,
          kind: "external_url_candidate",
          value: entry.value,
          evidenceField: entry.field,
          ownerHint: "resources",
          caveat: "No legacy Resource has the same normalized URL. Creating or linking one requires confirmation."
        });
        continue;
      }
      for (const target of targets) {
        addLinkCandidate(linkCandidates, seenLinks, {
          source: note.nativeRef,
          target: target.resource.nativeRef,
          relationship: "note_source_candidate",
          matchBasis: "exact_normalized_url",
          evidenceValue: entry.value,
          evidenceField: entry.field,
          normalizedMatchKey: normalized,
          normalizationVersion: "whatwg-http-v1",
          targetEvidenceFields: target.evidenceFields,
          ambiguity: targets.length === 1 ? "unique" : "multiple_targets",
          caveat: "Exact normalized URL evidence connects these legacy records, but this is not yet a persisted citation or ObjectLink."
        });
      }
    }
  }

  for (const asset of media) {
    for (const reference of asset.source.resourceReferences) {
      const normalized = normalizeLegacyExternalUrl(reference.value);
      if (!normalized) continue;
      const targets = resourcesByUrl.get(normalized) || [];
      if (!targets.length) {
        addUnresolvedReference(unresolvedReferences, seenUnresolved, {
          source: asset.nativeRef,
          kind: "external_url_candidate",
          value: reference.value,
          evidenceField: reference.provenance,
          ownerHint: "resources",
          caveat: "The URL belongs in Resources. It is not evidence of a binary, snapshot, or Media version."
        });
        continue;
      }
      for (const target of targets) {
        addLinkCandidate(linkCandidates, seenLinks, {
          source: asset.nativeRef,
          target: target.resource.nativeRef,
          relationship: "media_source_reference_candidate",
          matchBasis: "exact_normalized_url",
          evidenceValue: reference.value,
          evidenceField: reference.provenance,
          normalizedMatchKey: normalized,
          normalizationVersion: "whatwg-http-v1",
          targetEvidenceFields: target.evidenceFields,
          ambiguity: targets.length === 1 ? "unique" : "multiple_targets",
          caveat: "The Media record references this Resource URL. It does not establish a snapshot or binary relationship."
        });
      }
    }
  }

  const relationSources: RelationSource[] = [
    ...notes.map((note) => ({ nativeRef: note.nativeRef, relations: note.relations })),
    ...resources.map((resource) => ({ nativeRef: resource.nativeRef, relations: resource.relations })),
    ...media.map((asset) => ({ nativeRef: asset.nativeRef, relations: asset.provenance.relations }))
  ];
  const refsById = new Map<string, NativeObjectRef[]>();
  for (const source of relationSources) {
    refsById.set(source.nativeRef.objectId, [
      ...(refsById.get(source.nativeRef.objectId) || []),
      source.nativeRef
    ]);
  }

  for (const source of relationSources) {
    for (const [direction, ids] of Object.entries(source.relations)) {
      ids.forEach((value, index) => {
        const targets = (refsById.get(value) || []).filter(
          (target) =>
            target.module !== source.nativeRef.module || target.objectId !== source.nativeRef.objectId
        );
        if (!targets.length) {
          addUnresolvedReference(unresolvedReferences, seenUnresolved, {
            source: source.nativeRef,
            kind: "legacy_relation_id",
            value,
            evidenceField: `relations.${direction}[${index}]`,
            ownerHint: null,
            legacyDirection: direction,
            caveat: "The retained legacy ID does not resolve to a Notes, Resources, or Media record in this read model."
          });
          return;
        }
        for (const target of targets) {
          addLinkCandidate(linkCandidates, seenLinks, {
            source: source.nativeRef,
            target,
            relationship: "legacy_relation_candidate",
            matchBasis: "legacy_relation_id",
            evidenceValue: value,
            evidenceField: `relations.${direction}[${index}]`,
            legacyDirection: direction,
            ambiguity: targets.length === 1 ? "unique" : "multiple_targets",
            caveat: "The target ID resolves exactly, but the legacy direction is not promoted to native relationship semantics."
          });
        }
      });
    }
  }

  return { linkCandidates, unresolvedReferences };
}
