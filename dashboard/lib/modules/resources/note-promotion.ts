import type { NoteCreateInput, NoteRecord, NoteUpdateInput } from "../notes/types";
import { normalizeResourceExternalUrl } from "./source-evidence";
import type { ResourceRecord } from "./types";

export function resourceNoteSourceUrl(resource: ResourceRecord): string | null {
  const value = resource.source.canonicalUrl;
  return value && normalizeResourceExternalUrl(value) ? value : null;
}

export function defaultResourceNoteTitle(resource: ResourceRecord): string {
  return `Notes on ${resource.title}`;
}

export function noteHasResourceSource(note: NoteRecord, sourceUrl: string): boolean {
  const matchKey = normalizeResourceExternalUrl(sourceUrl);
  if (!matchKey) return false;
  return note.legacySources.externalSources.some(
    (candidate) => normalizeResourceExternalUrl(candidate) === matchKey
  );
}

export function buildResourceNoteDraftInput(
  resource: ResourceRecord,
  input: { title: string; body: string }
): NoteCreateInput | null {
  const sourceUrl = resourceNoteSourceUrl(resource);
  if (!sourceUrl) return null;
  return {
    title: input.title.trim(),
    body: input.body.trim(),
    type: "idea",
    lifecycleStatus: "draft",
    privacy: "private",
    externalSources: [sourceUrl]
  };
}

export function buildNoteSourceAttachment(
  note: NoteRecord,
  sourceUrl: string
): NoteUpdateInput | null {
  const matchKey = normalizeResourceExternalUrl(sourceUrl);
  if (!matchKey || noteHasResourceSource(note, sourceUrl)) return null;
  return {
    externalSources: [
      ...note.legacySources.externalSources,
      sourceUrl
    ]
  };
}
