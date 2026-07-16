import type {
  ResourceDirectoryItem,
  ResourceRecord,
  ResourceReviewState,
  ResourcesViewModel
} from "./types";

export type ResourcesSort = "needs_review_recent" | "recent" | "title";

export type ResourcesViewOptions = {
  query?: string;
  selectedId?: string;
  sort?: ResourcesSort;
};

function resourceToDirectoryItem(resource: ResourceRecord): ResourceDirectoryItem {
  return {
    id: resource.id,
    title: resource.title,
    sourceTitle: resource.source.sourceTitle,
    displayDomain: resource.source.displayDomain,
    canonicalUrl: resource.source.canonicalUrl,
    type: resource.type,
    lifecycleState: resource.lifecycleState,
    reviewState: resource.review.state,
    nextReviewAt: resource.review.nextReviewAt,
    usefulness: resource.review.usefulness,
    pinned: resource.pinned,
    updatedAt: resource.updatedAt,
    readOnly: true
  };
}

function searchableText(resource: ResourceRecord): string {
  return [
    resource.id,
    resource.title,
    resource.body,
    resource.source.sourceTitle,
    resource.source.canonicalUrl,
    resource.source.displayDomain,
    ...resource.source.candidates.map((candidate) => candidate.value),
    ...resource.provenance.externalSources,
    ...resource.provenance.areas,
    ...resource.provenance.subjects,
    ...resource.provenance.projects,
    ...resource.provenance.intents,
    ...resource.relations.north,
    ...resource.relations.south,
    ...resource.relations.east,
    ...resource.relations.west,
    ...resource.relations.stakeholders,
    ...resource.relations.stakeholdings,
    ...resource.relations.internalSources,
    ...resource.relations.related
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function reviewRank(state: ResourceReviewState): number {
  if (state === "blocked") return 0;
  if (state === "needs_review" || state === "needs_cleanup" || state === "stale") return 1;
  if (state === "unknown") return 2;
  if (state === "reviewed") return 3;
  return 4;
}

function compareResources(
  left: ResourceRecord,
  right: ResourceRecord,
  sort: ResourcesSort
): number {
  if (sort === "title") {
    return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  }
  if (sort === "needs_review_recent") {
    const byReview = reviewRank(left.review.state) - reviewRank(right.review.state);
    if (byReview !== 0) return byReview;
  }
  const byUpdated = right.updatedAt.localeCompare(left.updatedAt);
  if (byUpdated !== 0) return byUpdated;
  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
}

export function buildResourcesViewModel(
  resources: ResourceRecord[],
  options: ResourcesViewOptions = {}
): ResourcesViewModel {
  const query = options.query?.trim().toLowerCase() || "";
  const sort = options.sort || "needs_review_recent";
  const filtered = resources
    .filter((resource) => !query || searchableText(resource).includes(query))
    .sort((left, right) => compareResources(left, right, sort));

  return {
    total: resources.length,
    filteredTotal: filtered.length,
    items: filtered.map(resourceToDirectoryItem),
    selected: resources.find((resource) => resource.id === options.selectedId) || null
  };
}
