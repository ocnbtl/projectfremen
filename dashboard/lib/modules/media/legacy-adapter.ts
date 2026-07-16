import type { PersonalRecord } from "../../personal-records-store";
import { createNativeObjectRef } from "../../native-objects/routes";
import { buildResourceSourceEvidenceItems } from "../resources/source-evidence";
import type {
  MediaAsset,
  MediaLegacyRelations,
  MediaResourceReference
} from "./types";

export type LegacyMediaRecord = PersonalRecord & { className: "file" };

function copyRelations(record: LegacyMediaRecord): MediaLegacyRelations {
  return {
    north: [...record.relations.north],
    south: [...record.relations.south],
    east: [...record.relations.east],
    west: [...record.relations.west],
    stakeholders: [...record.relations.stakeholders],
    stakeholdings: [...record.relations.stakeholdings],
    internalSources: [...record.relations.internalSources],
    related: [...record.relations.related]
  };
}

function resourceReferences(record: LegacyMediaRecord): MediaResourceReference[] {
  const references: MediaResourceReference[] = [];
  const seen = new Set<string>();

  for (const evidence of buildResourceSourceEvidenceItems({
    recordId: record.id,
    url: record.url,
    externalSources: record.externalSources
  })) {
    if (evidence.state !== "syntax_accepted" || !evidence.navigationUrl || seen.has(evidence.navigationUrl)) continue;
    seen.add(evidence.navigationUrl);
    references.push({
      value: evidence.navigationUrl,
      kind: "url",
      provenance: evidence.provenance,
      state: "unresolved"
    });
  }

  return references;
}

function nonCandidateSourceEvidence(record: LegacyMediaRecord): string[] {
  return Array.from(
    new Set(
      buildResourceSourceEvidenceItems({
        recordId: record.id,
        url: record.url,
        externalSources: record.externalSources
      })
        .filter((evidence) => evidence.state !== "syntax_accepted")
        .map((evidence) => evidence.displayValue)
    )
  );
}

export function isLegacyMediaRecord(record: PersonalRecord): record is LegacyMediaRecord {
  return record.className === "file";
}

export function legacyPersonalRecordToMediaAsset(record: LegacyMediaRecord): MediaAsset {
  const references = resourceReferences(record);

  return {
    id: record.id,
    nativeRef: createNativeObjectRef({
      module: "media",
      objectType: "media_asset",
      objectId: record.id,
      label: record.title
    }),
    title: record.title,
    body: record.body,
    type: "unknown",
    roles: [],
    lifecycleState: "unknown",
    pinnedState: "unknown",
    reviewState: "unknown",
    readinessState: "unknown",
    duplicateState: "unknown",
    visibility: "unknown",
    technical: {
      filename: null,
      mimeType: null,
      fileSizeBytes: null,
      checksum: null,
      dimensions: null,
      durationSeconds: null,
      pageCount: null
    },
    source: {
      id: null,
      state: references.length > 0 ? "resource_reference_unresolved" : "unknown",
      rawFileId: null,
      storageKey: null,
      resourceReferences: references
    },
    rights: {
      id: null,
      state: "needs_confirmation",
      scopeState: "provisional",
      confirmedAllowedUse: [],
      provisionalAllowedUse: ["internal", "review"],
      publicUseAllowed: null,
      commercialUseAllowed: null,
      modificationAllowed: null,
      attributionRequired: null,
      licenseResourceId: null,
      confirmedBy: null,
      confirmedAt: null
    },
    accessibility: {
      altTextState: "unknown",
      altText: null,
      ocrState: "unknown",
      ocrText: null,
      transcriptState: "unknown",
      transcriptText: null
    },
    currentVersionId: null,
    archivedAt: null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    readOnly: true,
    migrationState: "legacy_unverified",
    provenance: {
      kind: "legacy_personal_record",
      recordId: record.id,
      domain: record.domain,
      className: "file",
      status: record.status,
      stage: record.stage,
      privacy: record.privacy,
      knowledgeShape: record.knowledgeShape,
      growth: record.growth,
      url: record.url || null,
      externalSources: [...record.externalSources],
      nonUrlExternalReferences: nonCandidateSourceEvidence(record),
      areas: [...record.areas],
      subjects: [...record.subjects],
      projects: [...record.projects],
      intents: [...record.intents],
      relations: copyRelations(record),
      time: { ...record.time }
    }
  };
}

export function legacyPersonalRecordsToMediaAssets(records: PersonalRecord[]): MediaAsset[] {
  return records.filter(isLegacyMediaRecord).map(legacyPersonalRecordToMediaAsset);
}

/**
 * Literal legacy URL fields remain available to trusted server-side adapters.
 * Client workspaces receive only classified HTTP(S) candidates plus redacted
 * non-candidate evidence, matching the Resources privacy boundary.
 */
export function mediaAssetForClient(asset: MediaAsset): MediaAsset {
  return {
    ...asset,
    provenance: {
      ...asset.provenance,
      url: null,
      externalSources: []
    }
  };
}
