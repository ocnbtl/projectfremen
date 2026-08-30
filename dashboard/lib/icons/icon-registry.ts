import registryJson from "./icon-registry.json";

export const ICON_MODULES = [
  "System",
  "Projects",
  "Notes",
  "People",
  "Media",
  "Personal",
  "Reviews",
  "Resources",
  "Finance",
  "Vault"
] as const;

export type IconModuleName = (typeof ICON_MODULES)[number];

export type IconUsage = {
  module: IconModuleName;
  breadcrumb: string;
};

export type IconRegistryEntry = {
  id: string;
  label: string;
  defaultCandidate: string;
  candidates: [string, string, string, string, string];
  usages: IconUsage[];
};

export const ICON_REGISTRY = registryJson as IconRegistryEntry[];
export const ICON_REGISTRY_BY_ID = new Map(ICON_REGISTRY.map((entry) => [entry.id, entry]));

export function getIconEntry(role: string): IconRegistryEntry {
  return ICON_REGISTRY_BY_ID.get(role) || ICON_REGISTRY_BY_ID.get("object") || ICON_REGISTRY[0];
}

export function isIconCandidate(role: string, candidate: string): boolean {
  return getIconEntry(role).candidates.includes(candidate);
}

export function candidateLabel(candidate: string): string {
  return candidate
    .split("-")
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}

export function streamlineIconUrl(candidate: string): string {
  return `https://www.streamlinehq.com/icons/download/${encodeURIComponent(candidate)}--29169`;
}

export function iconModules(entry: IconRegistryEntry): IconModuleName[] {
  return Array.from(new Set(entry.usages.map((usage) => usage.module)));
}

export function selectedIconMap(assignments: ReadonlyArray<{ icon: string; selection?: string }>): Record<string, string> {
  return Object.fromEntries(
    assignments
      .filter((assignment) => assignment.selection && isIconCandidate(assignment.icon, assignment.selection))
      .map((assignment) => [assignment.icon, assignment.selection as string])
  );
}
