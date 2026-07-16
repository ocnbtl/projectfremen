import type { MediaAsset } from "./types";

export type MediaRightsIssue =
  | "all"
  | "needs-confirmation"
  | "confirmed-rights"
  | "resource-candidate"
  | "no-resource-candidate"
  | "usage-unavailable";

export type MediaRightsEvidence = {
  rightsConfirmed: boolean;
  hasProvisionalScope: boolean;
  canonicalStateLabel: string;
  scopeLabel: string;
  sourceState: "native" | "candidate" | "unavailable";
  sourceCandidateCount: number;
  legacyContextCount: number;
  usageState: "unavailable";
  versionInheritanceState: "unavailable";
  auditState: "unavailable";
};

function displayLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function buildMediaRightsEvidence(asset: MediaAsset): MediaRightsEvidence {
  const rightsConfirmed =
    asset.rights.scopeState === "confirmed" &&
    Boolean(asset.rights.confirmedBy) &&
    Boolean(asset.rights.confirmedAt) &&
    asset.rights.state !== "unknown" &&
    asset.rights.state !== "needs_confirmation";
  const sourceCandidateCount = asset.source.resourceReferences.length;
  const legacyContextCount =
    asset.provenance.projects.length +
    Object.values(asset.provenance.relations).reduce((total, values) => total + values.length, 0);

  return {
    rightsConfirmed,
    hasProvisionalScope: asset.rights.provisionalAllowedUse.length > 0,
    canonicalStateLabel: rightsConfirmed ? displayLabel(asset.rights.state) : "Needs confirmation",
    scopeLabel: rightsConfirmed
      ? "Confirmed"
      : asset.rights.provisionalAllowedUse.length
        ? `${asset.rights.provisionalAllowedUse.map(displayLabel).join(" / ")} · provisional`
        : "No operating scope recorded",
    sourceState:
      asset.source.id !== null && asset.source.state !== "unknown"
        ? "native"
        : sourceCandidateCount > 0
          ? "candidate"
          : "unavailable",
    sourceCandidateCount,
    legacyContextCount,
    usageState: "unavailable",
    versionInheritanceState: "unavailable",
    auditState: "unavailable"
  };
}

export function matchesMediaRightsIssue(asset: MediaAsset, issue: MediaRightsIssue): boolean {
  if (issue === "all") return true;
  const evidence = buildMediaRightsEvidence(asset);
  if (issue === "needs-confirmation") return !evidence.rightsConfirmed;
  if (issue === "confirmed-rights") return evidence.rightsConfirmed;
  if (issue === "resource-candidate") return evidence.sourceState === "candidate";
  if (issue === "no-resource-candidate") return evidence.sourceState === "unavailable";
  if (issue === "usage-unavailable") return evidence.usageState === "unavailable";
  return false;
}
