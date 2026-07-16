import type { ResourceRecord } from "./types";

export type ResourceReviewEvidenceItem = {
  id: string;
  label: string;
  detail: string;
  outcome: "supported" | "attention" | "unavailable";
  outcomeLabel: string;
};

export type ResourceReviewEvidence = {
  checks: readonly ResourceReviewEvidenceItem[];
  supportedCount: number;
  unavailableCount: number;
  noteSourceMatches: number;
  ownerTargetCount: number;
  unresolvedReferenceCount: number;
};

export function buildResourceReviewEvidence(
  resource: ResourceRecord,
  context: {
    noteSourceMatches: number;
    ownerTargetCount: number;
    unresolvedReferenceCount: number;
  }
): ResourceReviewEvidence {
  const urlReachabilitySupported =
    Boolean(resource.health.lastCheckedAt) &&
    (resource.health.state === "ok" || resource.health.state === "redirected");
  const sourceIdentitySupported =
    resource.source.canonicalState === "confirmed" &&
    Boolean(resource.source.canonicalUrl && resource.source.sourceTitle && resource.source.publisher);
  const citationMetadataSupported =
    resource.citationCount !== null &&
    Boolean(resource.source.author && resource.source.publishedAt && resource.source.sourceTitle);
  const linkedUsageSupported = resource.linkedObjectCount !== null;
  const snapshotSupported = resource.health.snapshotState === "attached";
  const duplicateCheckSupported =
    Boolean(resource.health.lastCheckedAt) && resource.health.duplicateState !== "unknown";

  const checks: ResourceReviewEvidenceItem[] = [
    {
      id: "url-reachable",
      label: "URL reachable",
      detail: urlReachabilitySupported
        ? `Last checked ${resource.health.lastCheckedAt}; state ${resource.health.state}.`
        : resource.source.canonicalUrl
          ? "A legacy URL candidate is retained, but no URL-health result or HTTP status is stored."
          : "No valid HTTP or HTTPS candidate is retained, and no URL-health result exists.",
      outcome: urlReachabilitySupported ? "supported" : "unavailable",
      outcomeLabel: urlReachabilitySupported ? "Evidence available" : "Health check unavailable"
    },
    {
      id: "source-identity",
      label: "Source identity confirmed",
      detail: sourceIdentitySupported
        ? "Canonical URL, fetched title, and publisher evidence are recorded."
        : "The user title is preserved separately; fetched title, publisher, and confirmed canonical identity are not connected.",
      outcome: sourceIdentitySupported ? "supported" : "unavailable",
      outcomeLabel: sourceIdentitySupported ? "Evidence available" : "Identity unverified"
    },
    {
      id: "citation-metadata",
      label: "Citation metadata complete",
      detail: citationMetadataSupported
        ? "Citation count, fetched title, author, and publication date are recorded."
        : "No persisted citation record proves author, publication date, fetched title, or citation completeness.",
      outcome: citationMetadataSupported ? "supported" : "unavailable",
      outcomeLabel: citationMetadataSupported ? "Evidence available" : "Citation data unavailable"
    },
    {
      id: "key-claims",
      label: "Key claims reviewed",
      detail: "The legacy Resource body is preserved as source context; no native extraction or claim-review records are inferred from it.",
      outcome: "unavailable",
      outcomeLabel: "Extraction review unavailable"
    },
    {
      id: "anchors",
      label: "Quote / snippet anchors confirmed",
      detail: "No native quote, snippet, source range, or anchor record is connected.",
      outcome: "unavailable",
      outcomeLabel: "Anchors unavailable"
    },
    {
      id: "note-citations",
      label: "Notes citations current",
      detail: context.noteSourceMatches
        ? `${context.noteSourceMatches} Note owner ${context.noteSourceMatches === 1 ? "match carries" : "matches carry"} exact normalized URL evidence, but none is treated as a persisted citation or currentness check.`
        : "No exact Note source match or persisted citation-currentness record is available.",
      outcome: "unavailable",
      outcomeLabel: "Citation review unavailable"
    },
    {
      id: "linked-usage",
      label: "Linked usage reviewed",
      detail: linkedUsageSupported
        ? `${resource.linkedObjectCount} persisted Resource links are available for review.`
        : context.ownerTargetCount || context.unresolvedReferenceCount
          ? `${context.ownerTargetCount} exact owner ${context.ownerTargetCount === 1 ? "target" : "targets"} and ${context.unresolvedReferenceCount} unresolved legacy ${context.unresolvedReferenceCount === 1 ? "reference are" : "references are"} retained as candidates, not reviewed usage.`
          : "No persisted ResourceLink or reviewed-usage registry is connected.",
      outcome: linkedUsageSupported ? "supported" : "unavailable",
      outcomeLabel: linkedUsageSupported ? "Evidence available" : "Usage review unavailable"
    },
    {
      id: "snapshot",
      label: "Snapshot / fallback available",
      detail: snapshotSupported
        ? "A verified Media snapshot relationship is recorded."
        : "No verified Media snapshot relationship is connected; URL matches do not prove a binary fallback.",
      outcome: snapshotSupported ? "supported" : "unavailable",
      outcomeLabel: snapshotSupported ? "Evidence available" : "Snapshot unavailable"
    },
    {
      id: "duplicate-source",
      label: "Duplicate source check",
      detail: duplicateCheckSupported
        ? `Duplicate state is ${resource.health.duplicateState}.`
        : "No duplicate URL scan result exists, so no match or uniqueness claim is made.",
      outcome: duplicateCheckSupported ? "supported" : "unavailable",
      outcomeLabel: duplicateCheckSupported ? "Evidence available" : "Duplicate check unavailable"
    }
  ];

  const supportedCount = checks.filter((check) => check.outcome === "supported").length;
  return {
    checks,
    supportedCount,
    unavailableCount: checks.length - supportedCount,
    ...context
  };
}
