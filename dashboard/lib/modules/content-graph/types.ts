import type { LinkState, ModuleId, NativeObjectRef } from "../../native-objects/types";

export type LegacyContentMatchBasis = "exact_normalized_url" | "legacy_relation_id";

export type LegacyContentRelationship =
  | "note_source_candidate"
  | "media_source_reference_candidate"
  | "legacy_relation_candidate";

/**
 * Read-only evidence that two legacy records may participate in one native
 * relationship. This is deliberately not an ObjectLink: promotion requires an
 * approved native link repository and an explicit user decision.
 */
export type LegacyContentLinkCandidate = {
  id: string;
  source: NativeObjectRef;
  target: NativeObjectRef;
  relationship: LegacyContentRelationship;
  matchBasis: LegacyContentMatchBasis;
  linkState: Extract<LinkState, "pending">;
  evidenceValue: string;
  evidenceField: string;
  normalizedMatchKey?: string;
  normalizationVersion?: "whatwg-http-v1";
  targetEvidenceFields?: string[];
  legacyDirection?: string;
  ambiguity: "unique" | "multiple_targets";
  readOnly: true;
  caveat: string;
};

export type LegacyUnresolvedReference = {
  id: string;
  source: NativeObjectRef;
  kind: "external_url_candidate" | "legacy_relation_id";
  value: string;
  evidenceField: string;
  ownerHint: ModuleId | null;
  legacyDirection?: string;
  readOnly: true;
  caveat: string;
};

export type LegacyContentGraph = {
  linkCandidates: LegacyContentLinkCandidate[];
  unresolvedReferences: LegacyUnresolvedReference[];
};

export type LegacyContentTargetGroup = {
  target: NativeObjectRef;
  candidates: LegacyContentLinkCandidate[];
};

export function sameNativeObject(
  left: Pick<NativeObjectRef, "module" | "objectType" | "objectId">,
  right: Pick<NativeObjectRef, "module" | "objectType" | "objectId">
): boolean {
  return (
    left.module === right.module &&
    left.objectType === right.objectType &&
    left.objectId === right.objectId
  );
}

export function contentLinksForObject(
  graph: LegacyContentGraph,
  object: NativeObjectRef
): LegacyContentLinkCandidate[] {
  return graph.linkCandidates.filter(
    (candidate) => sameNativeObject(candidate.source, object) || sameNativeObject(candidate.target, object)
  );
}

/**
 * Groups raw legacy evidence by the other native object. Multiple source
 * fields may point at the same owner route; operational surfaces should show
 * that route once while preserving every evidence signal in the group.
 */
export function contentTargetGroupsForObject(
  graph: LegacyContentGraph,
  object: NativeObjectRef
): LegacyContentTargetGroup[] {
  const groups = new Map<string, LegacyContentTargetGroup>();

  for (const candidate of contentLinksForObject(graph, object)) {
    const target = sameNativeObject(candidate.source, object)
      ? candidate.target
      : candidate.source;
    const key = `${target.module}|${target.objectType}|${target.objectId}`;
    const existing = groups.get(key);

    if (existing) {
      existing.candidates.push(candidate);
      continue;
    }

    groups.set(key, { target, candidates: [candidate] });
  }

  return Array.from(groups.values());
}

export function unresolvedReferencesForObject(
  graph: LegacyContentGraph,
  object: NativeObjectRef
): LegacyUnresolvedReference[] {
  return graph.unresolvedReferences.filter((reference) => sameNativeObject(reference.source, object));
}
