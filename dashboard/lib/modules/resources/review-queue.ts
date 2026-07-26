import {
  contentTargetGroupsForObject,
  unresolvedReferencesForObject,
  type LegacyContentGraph
} from "../content-graph/types";
import { buildResourceReviewEvidence } from "./review-evidence";
import { buildResourceSourceEvidenceReport } from "./source-evidence";
import type { ResourceRecord } from "./types";

export type ResourceReviewQueueReason =
  | "review_evidence"
  | "no_safe_source"
  | "withheld_source"
  | "exact_url_candidate"
  | "unresolved_reference"
  | "snapshot_unverified";

export type ResourceReviewQueueItem = {
  resourceId: string;
  evidenceGapCount: number;
  supportedCheckCount: number;
  signalCount: number;
  priorityScore: number;
  primaryReason: string;
  reasons: readonly ResourceReviewQueueReason[];
  safeSourceCandidateCount: number;
  withheldSourceCount: number;
  exactUrlCandidateCount: number;
  unresolvedReferenceCount: number;
  ownerTargetCount: number;
  noteSourceMatchCount: number;
  snapshotVerified: boolean;
};

export type ResourceReviewQueueSummary = {
  totalResources: number;
  queuedResources: number;
  evidenceGaps: number;
  supportedChecks: number;
  withoutSafeSource: number;
  withheldSourceValues: number;
  exactUrlCandidates: number;
  unresolvedReferences: number;
  ownerTargets: number;
  noteSourceMatches: number;
  snapshotsUnverified: number;
};

export type ResourceReviewQueue = {
  items: readonly ResourceReviewQueueItem[];
  byResourceId: ReadonlyMap<string, ResourceReviewQueueItem>;
  summary: ResourceReviewQueueSummary;
};

function primaryReason(item: Omit<ResourceReviewQueueItem, "primaryReason">): string {
  if (item.safeSourceCandidateCount === 0) return "No safe source candidate";
  if (item.withheldSourceCount > 0) {
    return `${item.withheldSourceCount} source ${item.withheldSourceCount === 1 ? "value needs" : "values need"} inspection`;
  }
  if (item.exactUrlCandidateCount > 0) {
    return `${item.exactUrlCandidateCount} exact URL ${item.exactUrlCandidateCount === 1 ? "candidate" : "candidates"}`;
  }
  if (item.unresolvedReferenceCount > 0) {
    return `${item.unresolvedReferenceCount} unresolved ${item.unresolvedReferenceCount === 1 ? "reference" : "references"}`;
  }
  if (!item.snapshotVerified) return "Snapshot not verified";
  return `${item.evidenceGapCount} of 9 evidence checks unavailable`;
}

function buildItem(
  resource: ResourceRecord,
  resources: readonly ResourceRecord[],
  contentGraph: LegacyContentGraph
): ResourceReviewQueueItem {
  const targetGroups = contentTargetGroupsForObject(contentGraph, resource.nativeRef);
  const unresolvedReferences = unresolvedReferencesForObject(contentGraph, resource.nativeRef);
  const noteSourceMatches = targetGroups.filter(
    (group) => group.candidates.some((candidate) => candidate.relationship === "note_source_candidate")
  ).length;
  const reviewEvidence = buildResourceReviewEvidence(resource, {
    noteSourceMatches,
    ownerTargetCount: targetGroups.length,
    unresolvedReferenceCount: unresolvedReferences.length
  });
  const sourceEvidence = buildResourceSourceEvidenceReport(resource, resources);
  const safeSourceCandidateCount = resource.source.candidates.length;
  const withheldSourceCount = sourceEvidence.withheldCount;
  const exactUrlCandidateCount = sourceEvidence.exactResourceMatches.length;
  const snapshotVerified = resource.health.snapshotState === "attached";
  const reasons: ResourceReviewQueueReason[] = [];

  if (reviewEvidence.unavailableCount) reasons.push("review_evidence");
  if (!safeSourceCandidateCount) reasons.push("no_safe_source");
  if (withheldSourceCount) reasons.push("withheld_source");
  if (exactUrlCandidateCount) reasons.push("exact_url_candidate");
  if (unresolvedReferences.length) reasons.push("unresolved_reference");
  if (!snapshotVerified) reasons.push("snapshot_unverified");

  const signalCount =
    Number(!safeSourceCandidateCount) +
    withheldSourceCount +
    exactUrlCandidateCount +
    unresolvedReferences.length +
    Number(!snapshotVerified);
  const priorityScore =
    reviewEvidence.unavailableCount * 10 +
    Number(!safeSourceCandidateCount) * 8 +
    withheldSourceCount * 4 +
    exactUrlCandidateCount * 3 +
    unresolvedReferences.length * 2 +
    Number(!snapshotVerified);
  const itemWithoutLabel = {
    resourceId: resource.id,
    evidenceGapCount: reviewEvidence.unavailableCount,
    supportedCheckCount: reviewEvidence.supportedCount,
    signalCount,
    priorityScore,
    reasons,
    safeSourceCandidateCount,
    withheldSourceCount,
    exactUrlCandidateCount,
    unresolvedReferenceCount: unresolvedReferences.length,
    ownerTargetCount: targetGroups.length,
    noteSourceMatchCount: noteSourceMatches,
    snapshotVerified
  };

  return {
    ...itemWithoutLabel,
    primaryReason: primaryReason(itemWithoutLabel)
  };
}

export function buildResourceReviewQueue(
  resources: readonly ResourceRecord[],
  contentGraph: LegacyContentGraph
): ResourceReviewQueue {
  const items = resources
    .map((resource) => buildItem(resource, resources, contentGraph))
    .filter((item) => item.evidenceGapCount > 0 || item.signalCount > 0)
    .sort((left, right) =>
      right.priorityScore - left.priorityScore ||
      left.resourceId.localeCompare(right.resourceId)
    );
  const byResourceId = new Map(items.map((item) => [item.resourceId, item]));

  return {
    items,
    byResourceId,
    summary: {
      totalResources: resources.length,
      queuedResources: items.length,
      evidenceGaps: items.reduce((sum, item) => sum + item.evidenceGapCount, 0),
      supportedChecks: items.reduce((sum, item) => sum + item.supportedCheckCount, 0),
      withoutSafeSource: items.filter((item) => item.safeSourceCandidateCount === 0).length,
      withheldSourceValues: items.reduce((sum, item) => sum + item.withheldSourceCount, 0),
      exactUrlCandidates: items.reduce((sum, item) => sum + item.exactUrlCandidateCount, 0),
      unresolvedReferences: items.reduce((sum, item) => sum + item.unresolvedReferenceCount, 0),
      ownerTargets: items.reduce((sum, item) => sum + item.ownerTargetCount, 0),
      noteSourceMatches: items.reduce((sum, item) => sum + item.noteSourceMatchCount, 0),
      snapshotsUnverified: items.filter((item) => !item.snapshotVerified).length
    }
  };
}
