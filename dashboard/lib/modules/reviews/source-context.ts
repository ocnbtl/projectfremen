import { createNativeObjectRef } from "../../native-objects/routes";
import type { ModuleId, NativeObjectRef } from "../../native-objects/types";
import type {
  ReviewContextLink,
  ReviewContextLinkState,
  ReviewContextRelationship,
  ReviewEvidenceItem,
  ReviewRunView
} from "./types";

export const REVIEW_SOURCE_HANDOFF = "review-source" as const;

const HANDOFF_PARAMS = [
  "handoff",
  "sourceModule",
  "sourceObjectType",
  "sourceObjectId",
  "sourceContainerObjectId",
  "sourceLabel",
  "sourceRelationship"
] as const;

const ALLOWED_SOURCE_TYPES: Readonly<Record<string, ReadonlySet<string>>> = {
  projects: new Set(["project", "milestone", "blocker"]),
  notes: new Set(["note"]),
  resources: new Set(["resource"]),
  media: new Set(["media_asset", "asset"])
};

type SearchParamsReader = {
  get(name: string): string | null;
};

export type ReviewSourceHandoff = {
  sourceRef: NativeObjectRef;
  relationship: ReviewContextRelationship;
};

export type LinkedReviewContextSummary = {
  reviewRef: NativeObjectRef;
  title: string;
  cadence: ReviewRunView["run"]["cadence"];
  lifecycle: ReviewRunView["run"]["lifecycle"];
  current: boolean;
  updatedAt: string;
  canComplete: boolean;
  blockerCount: number;
  linkState: Exclude<ReviewContextLinkState, "removed">;
  links: ReviewContextLink[];
  evidenceUses: LinkedReviewEvidenceUse[];
};

export type LinkedReviewEvidenceUse = Pick<
  ReviewEvidenceItem,
  "id" | "title" | "state" | "required" | "blocksCompletion" | "updatedAt"
>;

function cleanParam(value: string | null, maxLength: number) {
  const clean = value?.trim() || "";
  if (!clean || clean.length > maxLength || /[\u0000-\u001f\u007f]/.test(clean)) return "";
  return clean;
}

function defaultRelationship(source: Pick<NativeObjectRef, "module" | "objectType">): ReviewContextRelationship {
  if (source.module === "projects" && source.objectType === "blocker") return "blocker_source";
  if (source.module === "media" || source.module === "resources") return "evidence";
  return "context";
}

function acceptedRelationship(value: string, fallback: ReviewContextRelationship) {
  return value === "context" || value === "evidence" || value === "blocker_source"
    ? value
    : fallback;
}

function activeLinkState(links: readonly ReviewContextLink[]): LinkedReviewContextSummary["linkState"] {
  if (links.some((link) => link.state === "broken")) return "broken";
  if (links.some((link) => link.state === "stale")) return "stale";
  return "linked";
}

function sameSource(left: NativeObjectRef, right: NativeObjectRef) {
  return (
    left.module === right.module &&
    left.objectType === right.objectType &&
    left.objectId === right.objectId &&
    (left.containerObjectId || "") === (right.containerObjectId || "")
  );
}

function evidenceSource(item: ReviewEvidenceItem) {
  if (item.state === "replaced") return item.replacement?.replacementSourceRef;
  return item.sourceRef;
}

export function getReviewEvidenceUses(
  run: Pick<ReviewRunView["run"], "evidence">,
  sourceRef: NativeObjectRef
): LinkedReviewEvidenceUse[] {
  return run.evidence
    .filter((item) => {
      const source = evidenceSource(item);
      return Boolean(source && sameSource(source, sourceRef));
    })
    .map(({ id, title, state, required, blocksCompletion, updatedAt }) => ({
      id,
      title,
      state,
      required,
      blocksCompletion,
      updatedAt
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sortSummaries(items: LinkedReviewContextSummary[]) {
  return items.sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    const leftActive = !["completed", "archived", "canceled"].includes(left.lifecycle);
    const rightActive = !["completed", "archived", "canceled"].includes(right.lifecycle);
    if (leftActive !== rightActive) return leftActive ? -1 : 1;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function getLinkedReviewContexts(
  views: readonly ReviewRunView[],
  sourceRef: NativeObjectRef
): LinkedReviewContextSummary[] {
  return sortSummaries(
    views.flatMap((view) => {
      const links = view.run.contextLinks.filter(
        (link) => link.state !== "removed" && sameSource(link.sourceRef, sourceRef)
      );
      const evidenceUses = getReviewEvidenceUses(view.run, sourceRef);
      if (!links.length && !evidenceUses.length) return [];
      return [{
        reviewRef: createNativeObjectRef({
          module: "reviews",
          objectType: "review_run",
          objectId: view.run.id,
          label: view.run.title
        }),
        title: view.run.title,
        cadence: view.run.cadence,
        lifecycle: view.run.lifecycle,
        current: view.run.current,
        updatedAt: view.run.updatedAt,
        canComplete: view.canComplete,
        blockerCount: view.blockers.length,
        linkState: links.length ? activeLinkState(links) : "linked",
        links,
        evidenceUses
      }];
    })
  );
}

export function reviewContextOwnerRoute(context: LinkedReviewContextSummary) {
  const evidenceUse = context.evidenceUses[0];
  if (evidenceUse) {
    return `${context.reviewRef.route}?${new URLSearchParams({ tab: "evidence", item: evidenceUse.id }).toString()}`;
  }
  const params = new URLSearchParams({
    tab: "overview",
    item: context.links[0]?.id || ""
  });
  if (!params.get("item")) params.delete("item");
  return `${context.reviewRef.route}?${params.toString()}`;
}

export function buildReviewSourceHandoffRoute(
  sourceRef: NativeObjectRef,
  relationship: ReviewContextRelationship = defaultRelationship(sourceRef)
) {
  const params = new URLSearchParams({
    handoff: REVIEW_SOURCE_HANDOFF,
    sourceModule: sourceRef.module,
    sourceObjectType: sourceRef.objectType,
    sourceObjectId: sourceRef.objectId,
    sourceLabel: sourceRef.label,
    sourceRelationship: relationship
  });
  if (sourceRef.containerObjectId) {
    params.set("sourceContainerObjectId", sourceRef.containerObjectId);
  }
  return `/admin/reviews?${params.toString()}`;
}

export function parseReviewSourceHandoff(searchParams: SearchParamsReader): ReviewSourceHandoff | null {
  const handoff = searchParams.get("handoff");
  if (handoff !== REVIEW_SOURCE_HANDOFF && handoff !== "project-context") return null;

  const module = cleanParam(searchParams.get("sourceModule"), 40) as ModuleId;
  const objectType = cleanParam(searchParams.get("sourceObjectType"), 80);
  const objectId = cleanParam(searchParams.get("sourceObjectId"), 240);
  const containerObjectId = cleanParam(searchParams.get("sourceContainerObjectId"), 240);
  const label = cleanParam(searchParams.get("sourceLabel"), 500);
  const allowedTypes = ALLOWED_SOURCE_TYPES[module];
  if (!allowedTypes?.has(objectType) || !objectId || !label) return null;

  const containedProjectSource = module === "projects" && (objectType === "milestone" || objectType === "blocker");
  if (containedProjectSource !== Boolean(containerObjectId)) return null;

  const sourceRef = createNativeObjectRef({
    module,
    objectType,
    objectId,
    ...(containerObjectId ? { containerObjectId } : {}),
    label
  });
  const fallback = defaultRelationship(sourceRef);
  const relationship = acceptedRelationship(
    cleanParam(searchParams.get("sourceRelationship"), 40),
    fallback
  );
  return { sourceRef, relationship };
}

export function clearReviewSourceHandoffParams(searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams);
  HANDOFF_PARAMS.forEach((param) => next.delete(param));
  return next;
}
