import type { NativeObjectRef } from "../../native-objects/types";
import type { ResourceRecord } from "./types";

export type ResourceExactUrlCollisionGroup = {
  matchKey: string;
  displayDomain: string;
  members: readonly {
    resourceId: string;
    target: NativeObjectRef;
  }[];
};

export type ResourceDuplicateEvidenceItem = {
  resourceId: string;
  collisionGroupCount: number;
  matchingResourceCount: number;
  normalizedUrls: readonly string[];
  matchingResourceIds: readonly string[];
};

export type ResourceDuplicateEvidenceIndex = {
  groups: readonly ResourceExactUrlCollisionGroup[];
  byResourceId: ReadonlyMap<string, ResourceDuplicateEvidenceItem>;
  summary: {
    totalResources: number;
    affectedResources: number;
    collisionGroups: number;
    acceptedCandidatesIndexed: number;
    withheldEvidenceExcluded: number;
  };
};

type CollisionMember = {
  resourceId: string;
  target: NativeObjectRef;
  displayDomain: string;
};

/**
 * Builds a read-only exact-match index from the already classified Resource
 * source candidates. It does not fetch URLs, infer fuzzy similarity, confirm a
 * duplicate, persist a scan result, or choose a canonical Resource.
 */
export function buildResourceDuplicateEvidenceIndex(
  resources: readonly ResourceRecord[]
): ResourceDuplicateEvidenceIndex {
  const membersByMatchKey = new Map<string, Map<string, CollisionMember>>();
  let acceptedCandidatesIndexed = 0;
  let withheldEvidenceExcluded = 0;

  for (const resource of resources) {
    acceptedCandidatesIndexed += resource.source.candidates.length;
    withheldEvidenceExcluded += resource.source.evidence.filter(
      (item) => item.state !== "syntax_accepted"
    ).length;

    for (const candidate of resource.source.candidates) {
      const members = membersByMatchKey.get(candidate.matchKey) || new Map<string, CollisionMember>();
      members.set(resource.id, {
        resourceId: resource.id,
        target: resource.nativeRef,
        displayDomain: candidate.displayDomain
      });
      membersByMatchKey.set(candidate.matchKey, members);
    }
  }

  const groups = Array.from(membersByMatchKey.entries())
    .filter(([, members]) => members.size > 1)
    .map(([matchKey, members]) => {
      const sortedMembers = Array.from(members.values()).sort((left, right) =>
        (left.target.label || left.resourceId).localeCompare(
          right.target.label || right.resourceId,
          undefined,
          { sensitivity: "base" }
        )
      );
      return {
        matchKey,
        displayDomain: sortedMembers[0]?.displayDomain || "Source not identified",
        members: sortedMembers.map(({ resourceId, target }) => ({ resourceId, target }))
      };
    })
    .sort((left, right) =>
      left.displayDomain.localeCompare(right.displayDomain, undefined, { sensitivity: "base" }) ||
      left.matchKey.localeCompare(right.matchKey)
    );

  const mutableByResourceId = new Map<
    string,
    {
      normalizedUrls: Set<string>;
      matchingResourceIds: Set<string>;
    }
  >();

  for (const group of groups) {
    for (const member of group.members) {
      const item = mutableByResourceId.get(member.resourceId) || {
        normalizedUrls: new Set<string>(),
        matchingResourceIds: new Set<string>()
      };
      item.normalizedUrls.add(group.matchKey);
      for (const peer of group.members) {
        if (peer.resourceId !== member.resourceId) item.matchingResourceIds.add(peer.resourceId);
      }
      mutableByResourceId.set(member.resourceId, item);
    }
  }

  const byResourceId = new Map<string, ResourceDuplicateEvidenceItem>();
  for (const [resourceId, item] of mutableByResourceId) {
    const normalizedUrls = Array.from(item.normalizedUrls).sort();
    const matchingResourceIds = Array.from(item.matchingResourceIds).sort();
    byResourceId.set(resourceId, {
      resourceId,
      collisionGroupCount: normalizedUrls.length,
      matchingResourceCount: matchingResourceIds.length,
      normalizedUrls,
      matchingResourceIds
    });
  }

  return {
    groups,
    byResourceId,
    summary: {
      totalResources: resources.length,
      affectedResources: byResourceId.size,
      collisionGroups: groups.length,
      acceptedCandidatesIndexed,
      withheldEvidenceExcluded
    }
  };
}
