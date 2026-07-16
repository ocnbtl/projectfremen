import type { LinkState, NativeObjectRef } from "./types";

export type LinkProvenance = "manual" | "inferred" | "imported" | "system";

export type ObjectLink = {
  id: string;
  source: NativeObjectRef;
  target: NativeObjectRef;
  relationship: string;
  provenance: LinkProvenance;
  status: LinkState;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
  removedAt?: string;
  removedBy?: string;
};

export type CreateObjectLinkInput = Omit<ObjectLink, "status"> & {
  status?: Exclude<LinkState, "removed">;
};

export function linkIdentityKey(link: Pick<ObjectLink, "source" | "target" | "relationship">): string {
  const source = `${link.source.module}:${link.source.objectType}:${link.source.objectId}`;
  const target = `${link.target.module}:${link.target.objectType}:${link.target.objectId}`;
  return `${source}->${target}:${link.relationship}`;
}

export function sameLinkIdentity(
  left: Pick<ObjectLink, "source" | "target" | "relationship">,
  right: Pick<ObjectLink, "source" | "target" | "relationship">
): boolean {
  return linkIdentityKey(left) === linkIdentityKey(right);
}

export function createObjectLink(input: CreateObjectLinkInput): ObjectLink {
  return { ...input, status: input.status ?? "active" };
}

export function upsertObjectLink(links: readonly ObjectLink[], next: ObjectLink): ObjectLink[] {
  const index = links.findIndex((link) => link.id === next.id || sameLinkIdentity(link, next));
  if (index === -1) {
    return [...links, next];
  }
  return links.map((link, currentIndex) => (currentIndex === index ? next : link));
}

/** Soft-removes a link. Neither referenced object is changed or deleted. */
export function markObjectLinkRemoved(
  link: ObjectLink,
  input: { removedAt: string; removedBy: string }
): ObjectLink {
  return {
    ...link,
    status: "removed",
    removedAt: input.removedAt,
    removedBy: input.removedBy,
    updatedAt: input.removedAt,
    updatedBy: input.removedBy
  };
}

export function isUsableObjectLink(link: ObjectLink): boolean {
  return link.status === "active";
}

