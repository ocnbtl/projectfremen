import { normalizeResourceExternalUrl } from "../resources/source-evidence";
import type { MediaAsset, MediaResourceReference } from "./types";

export type MediaDuplicateEvidenceSignal = {
  kind: "shared_resource_candidate";
  label: "Exact shared Resource candidate";
  matchKey: string;
  normalizationVersion: "whatwg-http-v1";
};

export type MediaDuplicateEvidenceMember = {
  asset: MediaAsset;
  references: readonly MediaResourceReference[];
};

/**
 * A reversible read-model for literal overlap evidence. This is intentionally
 * not a native DuplicateCase: it has no confidence, resolution state, owner,
 * recommendation, or mutation path.
 */
export type MediaDuplicateEvidenceGroup = {
  id: string;
  state: "evidence_only";
  signal: MediaDuplicateEvidenceSignal;
  members: readonly MediaDuplicateEvidenceMember[];
  participantCount: number;
  pairCount: number;
  sameRetainedTitle: boolean;
  latestUpdatedAt: string;
};

export type MediaDuplicateEvidenceSummary = {
  groups: readonly MediaDuplicateEvidenceGroup[];
  acceptedAssetCount: number;
  participatingAssetCount: number;
  acceptedButUniqueAssetCount: number;
  nonMatchableAssetCount: number;
  pairCount: number;
};

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function compareAssets(left: MediaAsset, right: MediaAsset) {
  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" }) ||
    left.id.localeCompare(right.id);
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function groupId(matchKey: string) {
  return `legacy-source-${fnv1a(matchKey)}-${matchKey.length.toString(16)}`;
}

function newestTimestamp(members: readonly MediaDuplicateEvidenceMember[]) {
  return members.reduce(
    (latest, member) => member.asset.updatedAt > latest ? member.asset.updatedAt : latest,
    ""
  );
}

export function buildMediaDuplicateEvidence(
  assets: readonly MediaAsset[]
): MediaDuplicateEvidenceSummary {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const referencesByMatchKey = new Map<string, Map<string, MediaResourceReference[]>>();
  const acceptedAssetIds = new Set<string>();

  for (const asset of assets) {
    const referencesByAssetKey = new Map<string, MediaResourceReference[]>();
    for (const reference of asset.source.resourceReferences) {
      const matchKey = normalizeResourceExternalUrl(reference.value);
      if (!matchKey) continue;
      const existing = referencesByAssetKey.get(matchKey) || [];
      if (!existing.some((candidate) => candidate.value === reference.value)) {
        existing.push(reference);
      }
      referencesByAssetKey.set(matchKey, existing);
    }

    if (referencesByAssetKey.size > 0) acceptedAssetIds.add(asset.id);
    for (const [matchKey, references] of referencesByAssetKey) {
      const group = referencesByMatchKey.get(matchKey) || new Map<string, MediaResourceReference[]>();
      group.set(asset.id, references);
      referencesByMatchKey.set(matchKey, group);
    }
  }

  const groups = Array.from(referencesByMatchKey.entries())
    .filter(([, members]) => members.size >= 2)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([matchKey, referencesByAsset]) => {
      const members = Array.from(referencesByAsset.entries())
        .flatMap(([assetId, references]) => {
          const asset = assetById.get(assetId);
          return asset ? [{
            asset,
            references: [...references].sort((left, right) => left.value.localeCompare(right.value))
          }] : [];
        })
        .sort((left, right) => compareAssets(left.asset, right.asset));
      const normalizedTitles = new Set(
        members.map((member) => normalizeTitle(member.asset.title)).filter(Boolean)
      );
      const participantCount = members.length;
      return {
        id: groupId(matchKey),
        state: "evidence_only" as const,
        signal: {
          kind: "shared_resource_candidate" as const,
          label: "Exact shared Resource candidate" as const,
          matchKey,
          normalizationVersion: "whatwg-http-v1" as const
        },
        members,
        participantCount,
        pairCount: participantCount * (participantCount - 1) / 2,
        sameRetainedTitle: normalizedTitles.size === 1 && participantCount > 1,
        latestUpdatedAt: newestTimestamp(members)
      };
    });

  const participatingAssetIds = new Set(
    groups.flatMap((group) => group.members.map((member) => member.asset.id))
  );

  return {
    groups,
    acceptedAssetCount: acceptedAssetIds.size,
    participatingAssetCount: participatingAssetIds.size,
    acceptedButUniqueAssetCount: Array.from(acceptedAssetIds).filter(
      (assetId) => !participatingAssetIds.has(assetId)
    ).length,
    nonMatchableAssetCount: assets.length - acceptedAssetIds.size,
    pairCount: groups.reduce((total, group) => total + group.pairCount, 0)
  };
}
