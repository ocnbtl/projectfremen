import { createNativeObjectRef } from "../../native-objects/routes";
import type { PersonalRecord } from "../../personal-records-store";
import type {
  ResourceLegacyProvenance,
  ResourceLifecycleState,
  ResourceRecord,
  ResourceRelations,
  ResourceReviewCadence
} from "./types";
import {
  buildResourceSourceEvidenceItems,
  resourceSourceCandidatesFromEvidence
} from "./source-evidence";

export type LegacyResourceRecord = PersonalRecord & { className: "resource" };

function copyRelations(record: LegacyResourceRecord): ResourceRelations {
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

function lifecycleState(status: LegacyResourceRecord["status"]): {
  state: ResourceLifecycleState;
  mapping: ResourceLegacyProvenance["lifecycleMapping"];
} {
  if (status === "active") {
    return { state: "active", mapping: "legacy_active_to_active" };
  }
  return { state: "unknown", mapping: "not_inferred" };
}

function reviewCadence(value?: string): ResourceReviewCadence {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "P1W" || normalized === "WEEKLY") return "weekly";
  if (normalized === "P1M" || normalized === "MONTHLY") return "monthly";
  if (normalized === "P3M" || normalized === "QUARTERLY") return "quarterly";
  if (normalized === "P1Y" || normalized === "ANNUAL" || normalized === "YEARLY") return "annual";
  if (normalized === "MANUAL") return "manual";
  return "unknown";
}

export function isLegacyResourceRecord(record: PersonalRecord): record is LegacyResourceRecord {
  return record.className === "resource";
}

export function legacyPersonalRecordToResource(record: LegacyResourceRecord): ResourceRecord {
  const evidence = buildResourceSourceEvidenceItems({
    recordId: record.id,
    url: record.url,
    externalSources: record.externalSources
  });
  const candidates = resourceSourceCandidatesFromEvidence(evidence);
  const primaryEvidence = evidence.find((item) => item.evidenceField === "url") || null;
  const canonicalUrl = primaryEvidence?.navigationUrl || null;
  const canonicalState = canonicalUrl
    ? "legacy_unverified"
    : primaryEvidence
      ? "withheld_unsafe"
      : "missing";
  const lifecycle = lifecycleState(record.status);
  const relations = copyRelations(record);

  return {
    id: record.id,
    nativeRef: createNativeObjectRef({
      module: "resources",
      objectType: "resource",
      objectId: record.id,
      label: record.title
    }),
    title: record.title,
    body: record.body,
    type: "unknown",
    lifecycleState: lifecycle.state,
    pinned: null,
    source: {
      canonicalUrl,
      canonicalState,
      sourceTitle: null,
      sourceTitleState: "not_available",
      displayDomain: primaryEvidence?.displayDomain || null,
      publisher: null,
      author: null,
      publishedAt: null,
      savedAt: record.createdAt,
      lastFetchedAt: null,
      sourceImportId: null,
      captureMethod: "legacy_unknown",
      candidates,
      evidence
    },
    health: {
      state: "unknown",
      httpStatus: null,
      lastCheckedAt: null,
      redirectTarget: null,
      duplicateState: "unknown",
      snapshotState: "unknown"
    },
    review: {
      state: "unknown",
      cadence: reviewCadence(record.time.reviewCadence),
      usefulness: "unknown",
      trustLevel: "unknown",
      freshness: "unknown",
      confidence: "unknown",
      // The legacy normalizer may synthesize review dates from createdAt, so
      // they remain provenance-only until an explicit review record exists.
      lastReviewedAt: null,
      nextReviewAt: null
    },
    citationCount: null,
    linkedObjectCount: null,
    relations,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    readOnly: true,
    migrationState: "legacy_unverified",
    provenance: {
      kind: "legacy_personal_record",
      recordId: record.id,
      domain: record.domain,
      className: "resource",
      status: record.status,
      stage: record.stage,
      privacy: record.privacy,
      knowledgeShape: record.knowledgeShape,
      growth: record.growth,
      rawUrl: record.url || null,
      externalSources: [...record.externalSources],
      areas: [...record.areas],
      subjects: [...record.subjects],
      projects: [...record.projects],
      intents: [...record.intents],
      relations: copyRelations(record),
      time: { ...record.time },
      createdMeta: { ...record.createdMeta },
      lifecycleMapping: lifecycle.mapping,
      pinnedMapping: "legacy_model_has_no_pinned_field"
    }
  };
}

export function legacyPersonalRecordsToResources(records: PersonalRecord[]): ResourceRecord[] {
  return records.filter(isLegacyResourceRecord).map(legacyPersonalRecordToResource);
}

export function resourceForClient(resource: ResourceRecord): ResourceRecord {
  return {
    ...resource,
    provenance: {
      ...resource.provenance,
      // Literal legacy values remain available to trusted server-side adapters.
      // The client receives classified/redacted source evidence instead of raw
      // credential-bearing or otherwise withheld strings.
      rawUrl: null,
      externalSources: []
    }
  };
}
