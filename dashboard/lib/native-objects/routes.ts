import type { ModuleId, NativeObjectRef } from "./types";

export const MODULE_ROUTES: Readonly<Record<ModuleId, string>> = {
  people: "/admin/people",
  media: "/admin/media",
  projects: "/admin/projects",
  notes: "/admin/notes",
  personal_ops: "/admin/personal",
  reviews: "/admin/reviews",
  resources: "/admin/resources",
  finance: "/admin/finance"
};

/** Canonical smart-view paths. Unimplemented paths may still render an explicit boundary page. */
export const MODULE_VIEW_ROUTES: Readonly<
  Partial<Record<ModuleId, Readonly<Record<string, string>>>>
> = {
  media: {
    all: "/admin/media",
    "needs-review": "/admin/media/needs-review",
    "upload-queue": "/admin/media/upload-queue",
    duplicates: "/admin/media/duplicates",
    "rights-usage": "/admin/media/rights-usage",
    "in-use": "/admin/media/in-use",
    "missing-metadata": "/admin/media/missing-metadata"
  },
  personal_ops: {
    command: "/admin/personal",
    goals: "/admin/personal/goals",
    decisions: "/admin/personal/decisions",
    obligations: "/admin/personal/obligations",
    "follow-ups": "/admin/personal/follow-ups",
    routines: "/admin/personal/routines",
    inbox: "/admin/personal/inbox",
    templates: "/admin/personal/templates"
  },
  finance: {
    overview: "/admin/finance",
    transactions: "/admin/finance/transactions",
    accounts: "/admin/finance/accounts",
    bills: "/admin/finance/bills",
    budgets: "/admin/finance/budgets",
    review: "/admin/finance/monthly-review"
  }
};

type NativeObjectRouteInput = {
  module: ModuleId;
  objectType: string;
  objectId: string;
  containerObjectId?: string;
  mode?: "view" | "edit";
};

type NativeObjectRefInput = NativeObjectRouteInput & {
  label: string;
  versionId?: string;
};

const PERSONAL_OPS_COLLECTIONS: Readonly<Record<string, string>> = {
  goal: "goals",
  key_result: "goals",
  decision: "decisions",
  obligation: "obligations",
  follow_up: "follow-ups",
  routine: "routines",
  capture_item: "inbox",
  template: "templates"
};

const FINANCE_VIEWS: Readonly<Record<string, string>> = {
  account: "accounts",
  transaction: "transactions",
  transfer: "transactions",
  bill: "bills",
  subscription: "bills",
  budget: "budgets",
  monthly_review: "review",
  finance_close_check: "review"
};

const PROJECT_CHILD_TABS: Readonly<Record<string, string>> = {
  milestone: "timeline",
  project_milestone: "timeline",
  blocker: "timeline",
  project_blocker: "timeline",
  open_loop: "timeline",
  project_open_loop: "timeline",
  timeline_event: "timeline",
  project_timeline_event: "timeline",
  knowledge_link: "notes-decisions",
  project_knowledge_link: "notes-decisions",
  decision_candidate: "notes-decisions",
  project_person_link: "people",
  person_link: "people",
  project_link: "files-links",
  file_link: "files-links",
  resource_link: "files-links",
  health_rule: "properties",
  missing_context_rule: "properties",
  completion_rule: "properties"
};

const REVIEW_CHILD_TABS: Readonly<Record<string, string>> = {
  checklist_item: "checklist",
  review_checklist_item: "checklist",
  context_link: "overview",
  review_context_link: "overview",
  evidence_item: "evidence",
  review_evidence_item: "evidence",
  evidence_requirement: "evidence",
  decision_item: "decisions",
  review_decision_item: "decisions",
  follow_up_link: "follow-ups",
  review_follow_up: "follow-ups",
  carry_forward_item: "follow-ups",
  review_carry_forward_item: "follow-ups",
  finance_check: "finance",
  review_finance_check: "finance"
};

function selectedObjectRoute(base: string, objectId: string, mode: "view" | "edit") {
  const params = new URLSearchParams({ selected: objectId });
  if (mode === "edit") {
    params.set("mode", "edit");
  }
  return `${base}?${params.toString()}`;
}

function containedObjectRoute(
  base: string,
  objectId: string,
  tab: string,
  mode: "view" | "edit"
) {
  const params = new URLSearchParams({ tab, item: objectId });
  if (mode === "edit") {
    params.set("mode", "edit");
  }
  return `${base}?${params.toString()}`;
}

export function getModuleRoute(module: ModuleId): string {
  return MODULE_ROUTES[module];
}

export function getModuleViewRoute(module: ModuleId, view: string): string {
  const registered = MODULE_VIEW_ROUTES[module]?.[view];
  if (registered) return registered;
  const params = new URLSearchParams({ view });
  return `${MODULE_ROUTES[module]}?${params.toString()}`;
}

export function getNativeObjectRoute({
  module,
  objectType,
  objectId,
  containerObjectId,
  mode = "view"
}: NativeObjectRouteInput): string {
  const encodedId = encodeURIComponent(objectId);
  const encodedContainerId = containerObjectId
    ? encodeURIComponent(containerObjectId)
    : "";

  if (module === "people") {
    return `/admin/people/${encodedId}${mode === "edit" ? "/edit" : ""}`;
  }

  if (module === "notes" || module === "media" || module === "resources") {
    return `${MODULE_ROUTES[module]}/${encodedId}${mode === "edit" ? "/edit" : ""}`;
  }

  if (module === "projects") {
    if (encodedContainerId) {
      const tab = PROJECT_CHILD_TABS[objectType] || "overview";
      return containedObjectRoute(
        `${MODULE_ROUTES.projects}/${encodedContainerId}`,
        objectId,
        tab,
        mode
      );
    }
    const route = `${MODULE_ROUTES.projects}/${encodedId}`;
    return mode === "edit" ? `${route}?mode=edit` : route;
  }

  if (module === "reviews") {
    if (objectType === "legacy_weekly_review" || objectType === "weekly_review_entry") {
      return `/admin/reviews/weekly/${encodedId}`;
    }
    if (objectType === "legacy_monthly_review" || objectType === "monthly_review_entry") {
      return `/admin/reviews/monthly/${encodedId}`;
    }
    if (encodedContainerId) {
      const tab = REVIEW_CHILD_TABS[objectType] || "overview";
      return containedObjectRoute(
        `${MODULE_ROUTES.reviews}/${encodedContainerId}`,
        objectId,
        tab,
        mode
      );
    }
    const route = `/admin/reviews/${encodedId}`;
    return mode === "edit" ? `${route}?mode=edit` : route;
  }

  if (module === "personal_ops") {
    const collection = PERSONAL_OPS_COLLECTIONS[objectType];
    const base = collection ? `/admin/personal/${collection}` : MODULE_ROUTES.personal_ops;
    return selectedObjectRoute(base, objectId, mode);
  }

  // Finance Rules has no native route yet. Keep rule references within Finance,
  // but do not reinterpret a rule id as a selected Command account.
  if (objectType === "rule") {
    return MODULE_ROUTES.finance;
  }

  const view = objectType === "finance_view" && MODULE_VIEW_ROUTES.finance?.[objectId]
    ? objectId
    : FINANCE_VIEWS[objectType] || "overview";
  const base = getModuleViewRoute("finance", view);
  if (objectType === "finance_view") {
    return base;
  }
  const params = new URLSearchParams({ selected: objectId });
  if (mode === "edit") params.set("mode", "edit");
  return `${base}?${params.toString()}`;
}

export function createNativeObjectRef(input: NativeObjectRefInput): NativeObjectRef {
  return {
    module: input.module,
    objectType: input.objectType,
    objectId: input.objectId,
    ...(input.containerObjectId ? { containerObjectId: input.containerObjectId } : {}),
    label: input.label,
    route: getNativeObjectRoute(input),
    ...(input.versionId ? { versionId: input.versionId } : {})
  };
}
