import { createNativeObjectRef } from "../../native-objects/routes";
import type { NativeObjectRef } from "../../native-objects/types";
import type {
  Project,
  ProjectLinkRelationship,
  ProjectLinkStrength,
  ProjectsState
} from "./types";

export type PeopleProjectConnection = {
  projectId: string;
  projectRef: NativeObjectRef;
  name: string;
  lifecycle: Project["lifecycle"];
  health: Project["health"];
  priority: Project["priority"];
  owner: boolean;
  relationships: ProjectLinkRelationship[];
  relationshipStrengths: ProjectLinkStrength[];
  notes: string[];
  linkIds: string[];
  updatedAt: string;
};

export type ProjectSourceIdentity = Pick<
  NativeObjectRef,
  "module" | "objectType" | "objectId" | "containerObjectId"
>;

export type SourceProjectConnection = PeopleProjectConnection;

function sameSourceIdentity(
  reference: NativeObjectRef | undefined,
  source: ProjectSourceIdentity
) {
  return Boolean(
    reference &&
      reference.module === source.module &&
      reference.objectType === source.objectType &&
      reference.objectId === source.objectId &&
      (reference.containerObjectId || "") === (source.containerObjectId || "")
  );
}

function samePeopleIdentity(
  reference: NativeObjectRef | undefined,
  personId: string
) {
  return Boolean(
    reference &&
      reference.module === "people" &&
      reference.objectId === personId &&
      ["person", "organization"].includes(reference.objectType)
  );
}

function unique<Value>(values: Value[]) {
  return Array.from(new Set(values));
}

function buildProjectConnections(
  state: ProjectsState,
  matchesOwner: (reference: NativeObjectRef | undefined) => boolean,
  matchesLink: (reference: NativeObjectRef | undefined) => boolean
): SourceProjectConnection[] {
  return state.projects
    .flatMap((project) => {
      const owner = matchesOwner(project.ownerRef);
      const links = state.links.filter(
        (link) =>
          link.projectId === project.id &&
          link.linkState !== "removed" &&
          matchesLink(link.source)
      );
      if (!owner && links.length === 0) return [];
      return [{
        projectId: project.id,
        projectRef: createNativeObjectRef({
          module: "projects",
          objectType: "project",
          objectId: project.id,
          label: project.name
        }),
        name: project.name,
        lifecycle: project.lifecycle,
        health: project.health,
        priority: project.priority,
        owner,
        relationships: unique(links.map((link) => link.relationship)),
        relationshipStrengths: unique(links.map((link) => link.relationshipStrength)),
        notes: unique(
          links
            .map((link) => link.projectSpecificNote?.trim() || "")
            .filter(Boolean)
        ),
        linkIds: links.map((link) => link.id),
        updatedAt: [project.updatedAt, ...links.map((link) => link.updatedAt)]
          .sort()
          .at(-1) || project.updatedAt
      }];
    })
    .sort((left, right) => {
      const activeDelta =
        Number(right.lifecycle === "active") - Number(left.lifecycle === "active");
      if (activeDelta) return activeDelta;
      const ownerDelta = Number(right.owner) - Number(left.owner);
      if (ownerDelta) return ownerDelta;
      return right.updatedAt.localeCompare(left.updatedAt);
    });
}

export function getSourceProjectConnections(
  state: ProjectsState,
  source: ProjectSourceIdentity,
  options: { includeOwner?: boolean } = {}
): SourceProjectConnection[] {
  const includeOwner = options.includeOwner ?? false;
  return buildProjectConnections(
    state,
    (reference) => includeOwner && sameSourceIdentity(reference, source),
    (reference) => sameSourceIdentity(reference, source)
  );
}

export function getPeopleProjectConnections(
  state: ProjectsState,
  personId: string
): PeopleProjectConnection[] {
  return buildProjectConnections(
    state,
    (reference) => samePeopleIdentity(reference, personId),
    (reference) => samePeopleIdentity(reference, personId)
  );
}
