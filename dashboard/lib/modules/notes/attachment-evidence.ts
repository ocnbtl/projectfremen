import {
  contentTargetGroupsForObject,
  unresolvedReferencesForObject,
  type LegacyContentGraph,
  type LegacyContentLinkCandidate,
  type LegacyUnresolvedReference
} from "../content-graph/types";
import type { MediaAsset } from "../media/types";
import type { ResourceRecord } from "../resources/types";
import type { NativeObjectRef } from "../../native-objects/types";
import type { NoteRecord } from "./types";

export type NoteAttachmentEvidenceKind =
  | "media_candidate"
  | "resource_reference"
  | "other_reference"
  | "unresolved_reference";

export type NoteAttachmentEvidenceState = "candidate" | "ambiguous" | "unresolved";

export type NoteAttachmentEvidenceItem = {
  id: string;
  title: string;
  subtitle: string;
  kind: NoteAttachmentEvidenceKind;
  state: NoteAttachmentEvidenceState;
  ownerRef: NativeObjectRef | null;
  ownerModuleLabel: string;
  evidenceFields: string[];
  relationships: string[];
  matchBasis: string[];
  caveats: string[];
  updatedAt: string | null;
  media: MediaAsset | null;
  resource: ResourceRecord | null;
  unresolved: LegacyUnresolvedReference | null;
  readOnly: true;
};

export type NoteAttachmentEvidenceSummary = {
  mediaCandidates: number;
  resourceReferences: number;
  otherReferences: number;
  unresolvedReferences: number;
  attentionItems: number;
  rightsChecks: number;
  latestOwnerUpdateAt: string | null;
};

export type NoteAttachmentEvidence = {
  noteRef: NativeObjectRef;
  items: NoteAttachmentEvidenceItem[];
  summary: NoteAttachmentEvidenceSummary;
  persistenceState: "repository_disconnected";
  reviewEvidenceState: "not_indexed";
  readOnly: true;
};

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function unique(values: readonly string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function relationshipLabels(candidates: LegacyContentLinkCandidate[]) {
  return unique(candidates.map((candidate) => titleCase(candidate.relationship)));
}

function evidenceFieldLabels(candidates: LegacyContentLinkCandidate[]) {
  return unique(candidates.flatMap((candidate) => [
    candidate.evidenceField,
    ...(candidate.targetEvidenceFields || [])
  ]));
}

function matchBasisLabels(candidates: LegacyContentLinkCandidate[]) {
  return unique(candidates.map((candidate) =>
    candidate.matchBasis === "exact_normalized_url" ? "Exact normalized URL" : "Retained record ID"
  ));
}

function latestIso(values: Array<string | null | undefined>) {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .filter((value) => !Number.isNaN(new Date(value).getTime()))
    .sort((left, right) => right.localeCompare(left));
  return valid[0] || null;
}

/**
 * Builds a deterministic, read-only attachment evidence view. These items are
 * not NoteAttachment records: the legacy graph can prove exact candidates and
 * unresolved values, but it cannot prove relationship metadata or persistence.
 */
export function buildNoteAttachmentEvidence({
  note,
  graph,
  mediaAssets,
  resources
}: {
  note: NoteRecord;
  graph: LegacyContentGraph;
  mediaAssets: readonly MediaAsset[];
  resources: readonly ResourceRecord[];
}): NoteAttachmentEvidence {
  const mediaById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const items: NoteAttachmentEvidenceItem[] = contentTargetGroupsForObject(graph, note.nativeRef)
    .map((group): NoteAttachmentEvidenceItem => {
      const media = group.target.module === "media"
        ? mediaById.get(group.target.objectId) || null
        : null;
      const resource = group.target.module === "resources"
        ? resourcesById.get(group.target.objectId) || null
        : null;
      const ambiguous = group.candidates.some((candidate) => candidate.ambiguity === "multiple_targets");
      const caveats = unique(group.candidates.map((candidate) => candidate.caveat));
      const updatedAt = media?.updatedAt || resource?.updatedAt || null;

      if (group.target.module === "media") {
        return {
          id: `media:${group.target.objectId}`,
          title: media?.title || group.target.label,
          subtitle: media
            ? `${titleCase(media.type)} · binary and technical metadata stay Media-owned`
            : "Media owner resolves, but the current Media read model has no matching asset",
          kind: "media_candidate",
          state: ambiguous || !media ? "ambiguous" : "candidate",
          ownerRef: group.target,
          ownerModuleLabel: "Media",
          evidenceFields: evidenceFieldLabels(group.candidates),
          relationships: relationshipLabels(group.candidates),
          matchBasis: matchBasisLabels(group.candidates),
          caveats,
          updatedAt,
          media,
          resource: null,
          unresolved: null,
          readOnly: true
        };
      }

      if (group.target.module === "resources") {
        return {
          id: `resource:${group.target.objectId}`,
          title: resource?.title || group.target.label,
          subtitle: resource?.source.displayDomain
            ? `${resource.source.displayDomain} · external source stays Resource-owned`
            : "External source identity stays Resource-owned",
          kind: "resource_reference",
          state: ambiguous || !resource ? "ambiguous" : "candidate",
          ownerRef: group.target,
          ownerModuleLabel: "Resources",
          evidenceFields: evidenceFieldLabels(group.candidates),
          relationships: relationshipLabels(group.candidates),
          matchBasis: matchBasisLabels(group.candidates),
          caveats,
          updatedAt,
          media: null,
          resource,
          unresolved: null,
          readOnly: true
        };
      }

      return {
        id: `${group.target.module}:${group.target.objectId}`,
        title: group.target.label,
        subtitle: `${titleCase(group.target.objectType)} · relationship candidate`,
        kind: "other_reference",
        state: ambiguous ? "ambiguous" : "candidate",
        ownerRef: group.target,
        ownerModuleLabel: titleCase(group.target.module),
        evidenceFields: evidenceFieldLabels(group.candidates),
        relationships: relationshipLabels(group.candidates),
        matchBasis: matchBasisLabels(group.candidates),
        caveats,
        updatedAt,
        media: null,
        resource: null,
        unresolved: null,
        readOnly: true
      };
    });

  items.push(
    ...unresolvedReferencesForObject(graph, note.nativeRef).map((reference) => ({
      id: `unresolved:${reference.id}`,
      title: reference.value,
      subtitle: reference.kind === "external_url_candidate"
        ? "External source value has no exact Resource owner"
        : "Retained relation ID has no exact native owner",
      kind: "unresolved_reference" as const,
      state: "unresolved" as const,
      ownerRef: null,
      ownerModuleLabel: reference.ownerHint ? titleCase(reference.ownerHint) : "Unknown owner",
      evidenceFields: [reference.evidenceField],
      relationships: reference.legacyDirection ? [titleCase(reference.legacyDirection)] : [],
      matchBasis: [reference.kind === "external_url_candidate" ? "Stored URL value" : "Retained record ID"],
      caveats: [reference.caveat],
      updatedAt: null,
      media: null,
      resource: null,
      unresolved: reference,
      readOnly: true as const
    }))
  );

  items.sort((left, right) => {
    const kindOrder: Record<NoteAttachmentEvidenceKind, number> = {
      media_candidate: 0,
      resource_reference: 1,
      other_reference: 2,
      unresolved_reference: 3
    };
    return kindOrder[left.kind] - kindOrder[right.kind] || left.title.localeCompare(right.title);
  });

  const mediaItems = items.filter((item) => item.kind === "media_candidate");
  const resourceItems = items.filter((item) => item.kind === "resource_reference");
  const otherItems = items.filter((item) => item.kind === "other_reference");
  const unresolvedItems = items.filter((item) => item.kind === "unresolved_reference");

  return {
    noteRef: note.nativeRef,
    summary: {
      mediaCandidates: mediaItems.length,
      resourceReferences: resourceItems.length,
      otherReferences: otherItems.length,
      unresolvedReferences: unresolvedItems.length,
      attentionItems: items.filter((item) => item.state !== "candidate").length,
      rightsChecks: mediaItems.filter((item) =>
        !item.media || item.media.rights.state === "unknown" || item.media.rights.state === "needs_confirmation"
      ).length,
      latestOwnerUpdateAt: latestIso(items.map((item) => item.updatedAt))
    },
    items,
    persistenceState: "repository_disconnected",
    reviewEvidenceState: "not_indexed",
    readOnly: true
  };
}
