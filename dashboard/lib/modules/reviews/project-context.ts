import { createNativeObjectRef } from "../../native-objects/routes";
import type { NativeObjectRef } from "../../native-objects/types";
import type {
  ReviewContextLink,
  ReviewContextLinkState,
  ReviewContextRelationship,
  ReviewRunView
} from "./types";

export const PROJECT_REVIEW_HANDOFF = "project-context" as const;

const PROJECT_REVIEW_HANDOFF_PARAMS = [
  "handoff",
  "sourceModule",
  "sourceObjectType",
  "sourceObjectId",
  "sourceContainerObjectId",
  "sourceLabel"
] as const;

export type ProjectReviewSourceType = "project" | "milestone" | "blocker";

export type ProjectReviewSource = {
  objectType: ProjectReviewSourceType;
  objectId: string;
  containerObjectId?: string;
  label: string;
};

export type ProjectReviewContextSummary = {
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
};

type SearchParamsReader = {
  get(name: string): string | null;
};

function cleanParam(value: string | null, maxLength: number) {
  const clean = value?.trim() || "";
  if (!clean || clean.length > maxLength || /[\u0000-\u001f\u007f]/.test(clean)) return "";
  return clean;
}

function sourceRelationship(source: ProjectReviewSource): ReviewContextRelationship {
  return source.objectType === "blocker" ? "blocker_source" : "context";
}

function activeLinkState(links: readonly ReviewContextLink[]): ProjectReviewContextSummary["linkState"] {
  if (links.some((link) => link.state === "broken")) return "broken";
  if (links.some((link) => link.state === "stale")) return "stale";
  return "linked";
}

function matchesProject(link: ReviewContextLink, projectId: string) {
  return (
    link.state !== "removed" &&
    link.sourceRef.module === "projects" &&
    (link.sourceRef.objectId === projectId || link.sourceRef.containerObjectId === projectId)
  );
}

function matchesSource(link: ReviewContextLink, source: ProjectReviewSource) {
  if (link.state === "removed" || link.sourceRef.module !== "projects") return false;
  return (
    link.sourceRef.objectType === source.objectType &&
    link.sourceRef.objectId === source.objectId &&
    (link.sourceRef.containerObjectId || "") === (source.containerObjectId || "")
  );
}

function summarizeReview(view: ReviewRunView, links: ReviewContextLink[]): ProjectReviewContextSummary {
  return {
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
    linkState: activeLinkState(links),
    links
  };
}

function sortSummaries(items: ProjectReviewContextSummary[]) {
  return items.sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    const leftActive = !["completed", "archived", "canceled"].includes(left.lifecycle);
    const rightActive = !["completed", "archived", "canceled"].includes(right.lifecycle);
    if (leftActive !== rightActive) return leftActive ? -1 : 1;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function getProjectReviewContexts(
  views: readonly ReviewRunView[],
  projectId: string
): ProjectReviewContextSummary[] {
  return sortSummaries(
    views.flatMap((view) => {
      const links = view.run.contextLinks.filter((link) => matchesProject(link, projectId));
      return links.length ? [summarizeReview(view, links)] : [];
    })
  );
}

export function getProjectSourceReviewContexts(
  views: readonly ReviewRunView[],
  source: ProjectReviewSource
): ProjectReviewContextSummary[] {
  return sortSummaries(
    views.flatMap((view) => {
      const links = view.run.contextLinks.filter((link) => matchesSource(link, source));
      return links.length ? [summarizeReview(view, links)] : [];
    })
  );
}

export function projectReviewSourceRef(source: ProjectReviewSource): NativeObjectRef {
  return createNativeObjectRef({
    module: "projects",
    objectType: source.objectType,
    objectId: source.objectId,
    ...(source.containerObjectId ? { containerObjectId: source.containerObjectId } : {}),
    label: source.label
  });
}

export function buildProjectReviewHandoffRoute(source: ProjectReviewSource): string {
  const params = new URLSearchParams({
    handoff: PROJECT_REVIEW_HANDOFF,
    sourceModule: "projects",
    sourceObjectType: source.objectType,
    sourceObjectId: source.objectId,
    sourceLabel: source.label
  });
  if (source.containerObjectId) params.set("sourceContainerObjectId", source.containerObjectId);
  return `/admin/reviews?${params.toString()}`;
}

export function parseProjectReviewHandoff(searchParams: SearchParamsReader): {
  source: ProjectReviewSource;
  sourceRef: NativeObjectRef;
  relationship: ReviewContextRelationship;
} | null {
  if (
    searchParams.get("handoff") !== PROJECT_REVIEW_HANDOFF ||
    searchParams.get("sourceModule") !== "projects"
  ) {
    return null;
  }
  const objectType = cleanParam(searchParams.get("sourceObjectType"), 40);
  if (objectType !== "project" && objectType !== "milestone" && objectType !== "blocker") return null;
  const objectId = cleanParam(searchParams.get("sourceObjectId"), 240);
  const containerObjectId = cleanParam(searchParams.get("sourceContainerObjectId"), 240);
  const label = cleanParam(searchParams.get("sourceLabel"), 500);
  if (!objectId || !label || (objectType !== "project" && !containerObjectId)) return null;
  if (objectType === "project" && containerObjectId) return null;
  const source: ProjectReviewSource = {
    objectType,
    objectId,
    ...(containerObjectId ? { containerObjectId } : {}),
    label
  };
  return {
    source,
    sourceRef: projectReviewSourceRef(source),
    relationship: sourceRelationship(source)
  };
}

export function clearProjectReviewHandoffParams(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  PROJECT_REVIEW_HANDOFF_PARAMS.forEach((param) => next.delete(param));
  return next;
}
