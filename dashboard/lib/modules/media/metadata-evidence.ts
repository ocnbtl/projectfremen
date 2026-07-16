import type { MediaAsset } from "./types";

export type MediaMetadataIssue =
  | "all"
  | "type"
  | "source"
  | "binary"
  | "accessibility"
  | "rights"
  | "links"
  | "owner";

export type MediaMetadataEvidenceField = {
  id: string;
  label: string;
  value: string;
  detail: string;
  outcome: "supported" | "attention" | "unavailable";
  outcomeLabel: string;
  issue: Exclude<MediaMetadataIssue, "all">;
};

export type MediaMetadataEvidence = {
  fields: readonly MediaMetadataEvidenceField[];
  supportedCount: number;
  candidateCount: number;
  unavailableCount: number;
};

function formatBytes(value: number | null): string {
  if (value === null) return "Unavailable in legacy adapter";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildMediaMetadataEvidence(asset: MediaAsset): MediaMetadataEvidence {
  const hasBinaryIdentity = Boolean(asset.source.rawFileId && asset.source.storageKey);
  const hasSourceCandidate = asset.source.resourceReferences.length > 0;
  const hasNativeSource = asset.source.id !== null && asset.source.state !== "unknown";
  const hasConfirmedRights =
    asset.rights.scopeState === "confirmed" &&
    Boolean(asset.rights.confirmedBy) &&
    Boolean(asset.rights.confirmedAt) &&
    asset.rights.state !== "unknown" &&
    asset.rights.state !== "needs_confirmation";
  const accessibilityDetermined =
    asset.accessibility.altTextState !== "unknown" ||
    asset.accessibility.ocrState !== "unknown" ||
    asset.accessibility.transcriptState !== "unknown";
  const retainedRelationCount = Object.values(asset.provenance.relations).reduce(
    (total, values) => total + values.length,
    0
  );

  const fields: MediaMetadataEvidenceField[] = [
    {
      id: "type",
      label: "Asset type",
      value: asset.type === "unknown" ? "Unavailable in legacy adapter" : asset.type.replace(/_/g, " "),
      detail: asset.type === "unknown"
        ? "The broad Personal Records file class does not establish a native Media type."
        : "A native Media type is recorded.",
      outcome: asset.type === "unknown" ? "unavailable" : "supported",
      outcomeLabel: asset.type === "unknown" ? "Type unverified" : "Evidence available",
      issue: "type"
    },
    {
      id: "filename",
      label: "Filename",
      value: asset.technical.filename || "Unavailable in legacy adapter",
      detail: "The legacy title remains a display title and is never silently treated as a filename.",
      outcome: asset.technical.filename ? "supported" : "unavailable",
      outcomeLabel: asset.technical.filename ? "Evidence available" : "Binary fact unavailable",
      issue: "binary"
    },
    {
      id: "mime",
      label: "MIME type",
      value: asset.technical.mimeType || "Unavailable in legacy adapter",
      detail: "No raw-file record or verified binary inspection result is connected.",
      outcome: asset.technical.mimeType ? "supported" : "unavailable",
      outcomeLabel: asset.technical.mimeType ? "Evidence available" : "Binary fact unavailable",
      issue: "binary"
    },
    {
      id: "size",
      label: "File size",
      value: formatBytes(asset.technical.fileSizeBytes),
      detail: "No placeholder size is inferred from the URL, body, or title.",
      outcome: asset.technical.fileSizeBytes === null ? "unavailable" : "supported",
      outcomeLabel: asset.technical.fileSizeBytes === null ? "Binary fact unavailable" : "Evidence available",
      issue: "binary"
    },
    {
      id: "checksum",
      label: "Checksum",
      value: asset.technical.checksum || "Unavailable in legacy adapter",
      detail: hasBinaryIdentity
        ? "A raw-file identity exists, but no checksum is recorded."
        : "No raw-file ID or storage key exists to support duplicate or integrity checks.",
      outcome: asset.technical.checksum ? "supported" : "unavailable",
      outcomeLabel: asset.technical.checksum ? "Evidence available" : "Binary fact unavailable",
      issue: "binary"
    },
    {
      id: "source",
      label: "Source / provenance",
      value: hasNativeSource
        ? "Native source connected"
        : hasSourceCandidate
          ? `${asset.source.resourceReferences.length} unresolved Resource ${asset.source.resourceReferences.length === 1 ? "candidate" : "candidates"}`
          : "Unavailable in legacy adapter",
      detail: hasSourceCandidate
        ? "URLs stay owned by Resources until an explicit Media source relationship is persisted."
        : "No accepted HTTP(S) source candidate is retained; invalid or withheld evidence may still exist, and this does not prove the original asset has no source.",
      outcome: hasNativeSource ? "supported" : hasSourceCandidate ? "attention" : "unavailable",
      outcomeLabel: hasNativeSource ? "Evidence available" : hasSourceCandidate ? "Candidate only" : "Source unverified",
      issue: "source"
    },
    {
      id: "owner",
      label: "Owner / creator",
      value: "Unavailable in legacy adapter",
      detail: "Legacy stakeholders and relation IDs are not promoted to creator or rights-holder identity.",
      outcome: "unavailable",
      outcomeLabel: "Identity unverified",
      issue: "owner"
    },
    {
      id: "accessibility",
      label: "Alt text / OCR applicability",
      value: accessibilityDetermined ? "Workflow state recorded" : "Unverified in legacy adapter",
      detail: accessibilityDetermined
        ? "At least one accessibility workflow state is recorded."
        : "Without a verified type or binary, the system cannot claim alt text, OCR, or transcript is required or missing.",
      outcome: accessibilityDetermined ? "supported" : "unavailable",
      outcomeLabel: accessibilityDetermined ? "Evidence available" : "Applicability unverified",
      issue: "accessibility"
    },
    {
      id: "rights",
      label: "Rights state",
      value: hasConfirmedRights ? asset.rights.state.replace(/_/g, " ") : "Needs confirmation",
      detail: hasConfirmedRights
        ? "Confirmed rights evidence and timestamp are recorded."
        : "Internal / review is provisional scope, not a rights grant or public-safe decision.",
      outcome: hasConfirmedRights ? "supported" : "attention",
      outcomeLabel: hasConfirmedRights ? "Evidence available" : "Confirmation required",
      issue: "rights"
    },
    {
      id: "linked-context",
      label: "Linked context",
      value: retainedRelationCount
        ? `${retainedRelationCount} untyped legacy ${retainedRelationCount === 1 ? "reference" : "references"}`
        : "No native AssetLink records",
      detail: retainedRelationCount
        ? "The references remain provenance until their native objects and semantic roles are resolved."
        : "No cross-module relationship is inferred from absence.",
      outcome: "unavailable",
      outcomeLabel: "Native links unavailable",
      issue: "links"
    }
  ];

  return {
    fields,
    supportedCount: fields.filter((field) => field.outcome === "supported").length,
    candidateCount: fields.filter((field) => field.outcome === "attention").length,
    unavailableCount: fields.filter((field) => field.outcome === "unavailable").length
  };
}

export function matchesMediaMetadataIssue(asset: MediaAsset, issue: MediaMetadataIssue): boolean {
  if (issue === "all") return true;
  return buildMediaMetadataEvidence(asset).fields.some(
    (field) => field.issue === issue && field.outcome !== "supported"
  );
}
