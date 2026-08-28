import { createNativeObjectRef } from "../../native-objects/routes";
import type {
  PersonalRecord,
  PersonalRecordInput,
  PersonalRecordPatch
} from "../../personal-records-store";
import type {
  ResourceCreateInput,
  ResourceLegacyProvenance,
  ResourceLifecycleState,
  ResourceRecord,
  ResourceRelations,
  ResourceReviewCadence,
  ResourceUpdateInput
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

function gradientForLegacy(seed: string) {
  const palettes = [
    ["#193B42", "#86AEB0", "#E5D7C8"],
    ["#292D4F", "#8076A3", "#D9CABD"],
    ["#503542", "#B27C78", "#E9D7C6"],
    ["#23413D", "#6F9B86", "#D8D0B4"]
  ];
  let hash = 0;
  for (const character of seed) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return {
    pattern: "aurora" as const,
    colors: palettes[Math.abs(hash) % palettes.length],
    focalX: 48,
    focalY: 42,
    angle: Math.abs(hash) % 360
  };
}

function numericLevel(value: number) {
  if (value >= 8) return "high" as const;
  if (value >= 4) return "medium" as const;
  return "low" as const;
}

function reviewCadence(value?: string): ResourceReviewCadence {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "P1W" || normalized === "WEEKLY") return "weekly";
  if (normalized === "P1M" || normalized === "MONTHLY") return "monthly";
  if (normalized === "P3M" || normalized === "QUARTERLY") return "quarterly";
  if (normalized === "P6M" || normalized === "SEMIANNUAL") return "semiannual";
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
  const profile = record.resourceProfile;
  const timeline = profile?.timeline || [{
    id: `resource-created-${record.id}`,
    kind: "created" as const,
    title: "Resource added",
    occurredAt: record.createdAt
  }];
  const lastReviewedAt = [...timeline]
    .reverse()
    .find((event) => event.kind === "reviewed")?.occurredAt || null;
  const currentLifecycle = record.archivedAt
    ? "archived"
    : profile?.lifecycle || lifecycle.state;
  const usefulness = profile?.usefulness ?? 5;
  const trust = profile?.trust ?? 5;

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
    type: profile?.resourceType || "unknown",
    lifecycleState: currentLifecycle,
    pinned: record.starred === true,
    source: {
      canonicalUrl,
      canonicalState,
      sourceTitle: profile?.metadata.title || null,
      sourceTitleState: "not_available",
      displayDomain: profile?.sourceDomain || primaryEvidence?.displayDomain || null,
      publisher: profile?.metadata.siteName || null,
      author: profile?.metadata.author || null,
      publishedAt: profile?.metadata.publishedAt || null,
      savedAt: record.createdAt,
      lastFetchedAt: profile?.metadata.fetchedAt || null,
      sourceImportId: null,
      captureMethod: "legacy_unknown",
      candidates,
      evidence
    },
    health: {
      state: profile?.health.state || "unknown",
      httpStatus: profile?.health.httpStatus ?? null,
      lastCheckedAt: profile?.health.lastCheckedAt || null,
      redirectTarget: profile?.health.redirectTarget || null,
      duplicateState: profile?.duplicate.state || "unknown",
      snapshotState: "unknown"
    },
    review: {
      state: "unknown",
      cadence: reviewCadence(record.time.reviewCadence),
      usefulness: numericLevel(usefulness),
      trustLevel: numericLevel(trust),
      freshness: "unknown",
      confidence: "unknown",
      // The legacy normalizer may synthesize review dates from createdAt, so
      // last review remains provenance-only until an explicit review record
      // exists. nextReview is exposed strictly as legacy-backed queue timing;
      // it never establishes review completion.
      lastReviewedAt,
      nextReviewAt: record.time.nextReview || null
    },
    citationCount: null,
    linkedObjectCount: null,
    usefulness,
    trust,
    notes: profile?.notes || [],
    gradient: profile?.gradient || gradientForLegacy(record.id),
    metadata: profile?.metadata || {},
    automations: profile?.automations || {
      urlHealth: { status: "idle" },
      duplicateScan: { status: "idle" },
      metadataRefresh: { status: "idle" }
    },
    timeline,
    deletedAt: profile?.deletedAt || null,
    relations,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    readOnly: false,
    migrationState: profile ? "native_profile" : "legacy_unverified",
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

export function resourceCreateInputToLegacy(input: ResourceCreateInput): PersonalRecordInput {
  return {
    domain: "notes-docs",
    title: input.title.trim(),
    className: "resource",
    knowledgeShape: "reference",
    privacy: "private",
    stage: "processed",
    status: "active",
    body: input.body?.trim() || "",
    url: input.url.trim(),
    areas: input.areas?.map((item) => item.trim()).filter(Boolean),
    subjects: input.subjects?.map((item) => item.trim()).filter(Boolean),
    intents: ["retain"],
    resourceProfile: {
      version: 1,
      resourceType: input.type || "unknown",
      lifecycle: input.lifecycle || "active",
      sourceDomain: input.sourceDomain?.trim(),
      usefulness: input.usefulness ?? 5,
      trust: input.trust ?? 5,
      notes: input.notes || [],
      ...(input.gradient ? { gradient: input.gradient } : {})
    }
  };
}

export function resourceUpdateInputToLegacy(input: ResourceUpdateInput): PersonalRecordPatch {
  const hasTimeUpdate = input.reviewCadence !== undefined || input.nextReviewAt !== undefined;
  return {
    title: input.title?.trim(),
    body: input.body?.trim(),
    url: input.url?.trim(),
    areas: input.areas?.map((item) => item.trim()).filter(Boolean),
    subjects: input.subjects?.map((item) => item.trim()).filter(Boolean),
    action: input.action,
    archiveReason: input.archiveReason,
    starred: input.starred,
    resourceProfile: {
      ...(input.type !== undefined ? { resourceType: input.type } : {}),
      ...(input.lifecycle !== undefined ? { lifecycle: input.lifecycle } : {}),
      ...(input.sourceDomain !== undefined ? { sourceDomain: input.sourceDomain } : {}),
      ...(input.usefulness !== undefined ? { usefulness: input.usefulness } : {}),
      ...(input.trust !== undefined ? { trust: input.trust } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.gradient !== undefined ? { gradient: input.gradient } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      ...(input.deletedAt !== undefined ? { deletedAt: input.deletedAt } : {}),
      ...(input.timeline !== undefined ? { timeline: input.timeline } : {})
    },
    time: hasTimeUpdate
      ? {
          reviewCadence: input.reviewCadence,
          nextReview: input.nextReviewAt
        }
      : undefined
  };
}
