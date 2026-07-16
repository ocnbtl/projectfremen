import { ADMIN_PROJECTS } from "../../admin-navigation";
import { ENTITY_HUBS } from "../../entity-hub";
import { createNativeObjectRef } from "../../native-objects/routes";
import type { NativeObjectRef } from "../../native-objects/types";
import type {
  LegacyProjectDefinition,
  ProjectsLegacyMapping,
  ProjectsState
} from "./types";

const PROJECT_ID_BY_SLUG: Readonly<Record<string, string>> = {
  blacktube: "PRJ-BLK",
  fremen: "PRJ-FRM",
  iceflake: "PRJ-ICE",
  pacific: "PRJ-PAC",
  pint: "PRJ-PNT"
};

function legacyKey(slug: string) {
  return `admin-project:${slug}`;
}

export const LEGACY_PROJECT_DEFINITIONS: readonly LegacyProjectDefinition[] = ADMIN_PROJECTS.map(
  (project) => {
    const entity = ENTITY_HUBS.find((candidate) => candidate.projectLabel === project.label);
    return {
      key: legacyKey(project.slug),
      projectId: PROJECT_ID_BY_SLUG[project.slug] || `PRJ-${project.slug.toUpperCase()}`,
      slug: project.slug,
      name: project.label,
      shortName: project.shortLabel,
      description: entity?.shortDescription || "",
      lifecycle: project.status,
      legacyRoute: project.href,
      ...(entity
        ? {
            entitySlug: entity.slug,
            entityName: entity.entity,
            repos: [...entity.repos]
          }
        : { repos: [] })
    };
  }
);

export function getLegacyProjectDefinition(identifier: string): LegacyProjectDefinition | null {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) return null;
  return (
    LEGACY_PROJECT_DEFINITIONS.find(
      (project) =>
        project.key.toLowerCase() === normalized ||
        project.projectId.toLowerCase() === normalized ||
        project.slug.toLowerCase() === normalized ||
        project.name.toLowerCase() === normalized
    ) || null
  );
}

export function findLegacyProjectMapping(
  state: Pick<ProjectsState, "legacyMappings">,
  legacyKeyValue: string
): ProjectsLegacyMapping | null {
  return state.legacyMappings.find((mapping) => mapping.legacyKey === legacyKeyValue) || null;
}

export function getLegacyProjectNativeRef(project: LegacyProjectDefinition): NativeObjectRef {
  return createNativeObjectRef({
    module: "projects",
    objectType: "project",
    objectId: project.projectId,
    label: project.name
  });
}

/**
 * Legacy project navigation remains a read-only identity source. Promotion is
 * explicit and handled by the Projects store; this adapter never writes or
 * imports legacy action items, KPIs, goals, or documents as Project records.
 */
export function listUnpromotedLegacyProjects(state: Pick<ProjectsState, "legacyMappings">) {
  const mappedKeys = new Set(state.legacyMappings.map((mapping) => mapping.legacyKey));
  return LEGACY_PROJECT_DEFINITIONS.filter((project) => !mappedKeys.has(project.key));
}

