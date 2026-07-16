export const NATIVE_MODULES = [
  "people",
  "media",
  "projects",
  "notes",
  "personal_ops",
  "reviews",
  "resources",
  "finance"
] as const;

export type ModuleId = (typeof NATIVE_MODULES)[number];

export type LifecycleState = "draft" | "planned" | "active" | "complete" | "archived";

export type HealthState = "healthy" | "attention" | "blocked" | "stale" | "unknown";

export type ReviewState =
  | "not_required"
  | "not_reviewed"
  | "needs_review"
  | "in_review"
  | "reviewed"
  | "waived";

export type CadenceState = "current" | "due_soon" | "overdue" | "dormant" | "paused";

export type LinkState = "active" | "missing" | "stale" | "broken" | "pending" | "removed";

/** A stable, route-aware pointer to an object owned by one native module. */
export type NativeObjectRef = {
  module: ModuleId;
  objectType: string;
  objectId: string;
  /** Parent object used to build an owner route for nested native objects. */
  containerObjectId?: string;
  label: string;
  route: string;
  versionId?: string;
};

/** Orthogonal state dimensions. Do not collapse these into one broad status field. */
export type NativeObjectStates = {
  lifecycle?: LifecycleState;
  health?: HealthState;
  review?: ReviewState;
  cadence?: CadenceState;
  link?: LinkState;
};

export type NativeObjectContext = {
  module: ModuleId;
  object?: NativeObjectRef | null;
  activeTab?: string;
  visibleScope?: string;
};

export function isModuleId(value: string): value is ModuleId {
  return (NATIVE_MODULES as readonly string[]).includes(value);
}
