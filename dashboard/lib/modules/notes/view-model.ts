import type {
  NoteDirectoryItem,
  NoteRecord,
  NotesViewModel,
  NoteViewCounts
} from "./types";

export type NoteFilter =
  | "all"
  | "active"
  | "draft"
  | "archived"
  | "needs_review"
  | "legacy_sources"
  | "legacy_relationships";

export type NoteSort = "updated_desc" | "created_desc" | "title_asc" | "next_review_asc";

export type NotesViewOptions = {
  query?: string;
  filter?: NoteFilter;
  sort?: NoteSort;
  selectedId?: string;
};

function hasLegacyRelationships(note: NoteRecord): boolean {
  return Object.values(note.relations).some((ids) => ids.length > 0);
}

function hasLegacySources(note: NoteRecord): boolean {
  return Boolean(note.legacySources.sourceUrl || note.legacySources.externalSources.length > 0);
}

function bodyExcerpt(body: string): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (!normalized) return "No body content recorded yet.";
  return normalized.length > 180 ? `${normalized.slice(0, 177).trimEnd()}...` : normalized;
}

export function noteRecordToDirectoryItem(note: NoteRecord): NoteDirectoryItem {
  return {
    id: note.id,
    title: note.title,
    bodyExcerpt: bodyExcerpt(note.body),
    type: note.type,
    lifecycleStatus: note.lifecycleStatus,
    reviewState: note.reviewState,
    area: note.areas[0],
    nextReviewAt: note.nextReviewAt,
    updatedAt: note.updatedAt,
    hasLegacySources: hasLegacySources(note),
    hasLegacyRelationships: hasLegacyRelationships(note),
    mappingWarningCount: note.mappingNotes.filter((item) => item.confidence !== "direct").length
  };
}

function searchableText(note: NoteRecord): string {
  return [
    note.title,
    note.body,
    note.type,
    note.lifecycleStatus,
    note.reviewState,
    note.provenance.className,
    note.provenance.status,
    note.legacySources.sourceUrl,
    ...note.legacySources.externalSources,
    ...note.areas,
    ...note.subjects,
    ...note.projects
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesFilter(note: NoteRecord, filter: NoteFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return note.lifecycleStatus === "active";
  if (filter === "draft") return note.lifecycleStatus === "draft";
  if (filter === "archived") return note.lifecycleStatus === "archived";
  if (filter === "needs_review") return note.reviewState === "needs_review";
  if (filter === "legacy_sources") return hasLegacySources(note);
  return hasLegacyRelationships(note);
}

function compareNotes(left: NoteRecord, right: NoteRecord, sort: NoteSort): number {
  let comparison = 0;
  if (sort === "updated_desc") comparison = right.updatedAt.localeCompare(left.updatedAt);
  if (sort === "created_desc") comparison = right.createdAt.localeCompare(left.createdAt);
  if (sort === "title_asc") {
    comparison = left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  }
  if (sort === "next_review_asc") {
    comparison = (left.nextReviewAt || "9999-12-31").localeCompare(
      right.nextReviewAt || "9999-12-31"
    );
  }
  if (comparison !== 0) return comparison;
  const byTitle = left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  return byTitle !== 0 ? byTitle : left.id.localeCompare(right.id);
}

export function buildNoteViewCounts(notes: readonly NoteRecord[]): NoteViewCounts {
  return {
    total: notes.length,
    active: notes.filter((note) => note.lifecycleStatus === "active").length,
    drafts: notes.filter((note) => note.lifecycleStatus === "draft").length,
    archived: notes.filter((note) => note.lifecycleStatus === "archived").length,
    needsReview: notes.filter((note) => note.reviewState === "needs_review").length,
    withLegacySources: notes.filter(hasLegacySources).length,
    withLegacyRelationships: notes.filter(hasLegacyRelationships).length
  };
}

export function buildNotesViewModel(
  notes: readonly NoteRecord[],
  options: NotesViewOptions = {}
): NotesViewModel {
  const query = options.query?.trim().toLowerCase() || "";
  const filter = options.filter || "all";
  const sort = options.sort || "updated_desc";
  const filtered = notes
    .filter((note) => matchesFilter(note, filter))
    .filter((note) => !query || searchableText(note).includes(query))
    .sort((left, right) => compareNotes(left, right, sort));

  return {
    counts: buildNoteViewCounts(notes),
    filteredTotal: filtered.length,
    items: filtered.map(noteRecordToDirectoryItem),
    selected: notes.find((note) => note.id === options.selectedId) || null
  };
}

