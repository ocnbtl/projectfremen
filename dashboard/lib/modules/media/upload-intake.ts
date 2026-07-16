import type { MediaUploadSource } from "./types";

export type LocalUploadOrigin = Extract<MediaUploadSource, "drag_drop" | "manual_upload">;

/**
 * Browser-session evidence only. This is deliberately not a RawFile or an
 * UploadQueueItem: no bytes are retained, uploaded, validated, or persisted.
 */
export type LocalUploadCandidate = {
  localId: string;
  originalFilename: string;
  browserMimeType: string | null;
  extension: string | null;
  sizeBytes: number;
  lastModifiedAt: string | null;
  addedAt: string;
  uploadSource: LocalUploadOrigin;
  nativeState: "not_created";
};

export type LocalUploadFilter = "all" | "needs-type" | "possible-duplicate";
export type LocalUploadSort = "added-desc" | "filename" | "size-desc";

export type LocalFileMetadata = Pick<File, "name" | "type" | "size" | "lastModified">;

export function formatLocalFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function normalizedFilename(value: string) {
  return value.trim() || "Unnamed local file";
}

export function fileExtension(filename: string): string | null {
  const normalized = filename.trim();
  const finalDot = normalized.lastIndexOf(".");
  if (finalDot <= 0 || finalDot === normalized.length - 1) return null;
  return normalized.slice(finalDot + 1).toLowerCase();
}

function lastModifiedIso(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function createLocalUploadCandidates(
  files: readonly LocalFileMetadata[],
  uploadSource: LocalUploadOrigin,
  createId: () => string,
  addedAt = new Date().toISOString()
): LocalUploadCandidate[] {
  return files.map((file) => {
    const originalFilename = normalizedFilename(file.name);
    return {
      localId: createId(),
      originalFilename,
      browserMimeType: file.type.trim() || null,
      extension: fileExtension(originalFilename),
      sizeBytes: Number.isFinite(file.size) && file.size >= 0 ? file.size : 0,
      lastModifiedAt: lastModifiedIso(file.lastModified),
      addedAt,
      uploadSource,
      nativeState: "not_created"
    };
  });
}

function duplicateEvidenceKey(candidate: LocalUploadCandidate): string {
  return [
    candidate.originalFilename.trim().toLowerCase(),
    candidate.sizeBytes,
    candidate.lastModifiedAt || "unknown"
  ].join("::");
}

/**
 * Returns filename/size/modified-time matches inside this local selection.
 * This is never presented as checksum or binary equality.
 */
export function localDuplicateCandidates(
  candidates: readonly LocalUploadCandidate[]
): ReadonlyMap<string, readonly string[]> {
  const buckets = new Map<string, LocalUploadCandidate[]>();
  for (const candidate of candidates) {
    const key = duplicateEvidenceKey(candidate);
    buckets.set(key, [...(buckets.get(key) || []), candidate]);
  }

  const matches = new Map<string, readonly string[]>();
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    for (const candidate of bucket) {
      matches.set(
        candidate.localId,
        bucket.filter((match) => match.localId !== candidate.localId).map((match) => match.localId)
      );
    }
  }
  return matches;
}

export function matchesLocalUploadQuery(candidate: LocalUploadCandidate, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    candidate.localId,
    candidate.originalFilename,
    candidate.browserMimeType || "browser type missing",
    candidate.extension || "extension missing",
    candidate.uploadSource
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

export function matchesLocalUploadFilter(
  candidate: LocalUploadCandidate,
  filter: LocalUploadFilter,
  duplicateMatches: ReadonlyMap<string, readonly string[]>
): boolean {
  if (filter === "needs-type") return !candidate.browserMimeType;
  if (filter === "possible-duplicate") return duplicateMatches.has(candidate.localId);
  return true;
}

export function sortLocalUploadCandidates(
  candidates: readonly LocalUploadCandidate[],
  sort: LocalUploadSort
): LocalUploadCandidate[] {
  return [...candidates].sort((left, right) => {
    if (sort === "filename") {
      return left.originalFilename.localeCompare(right.originalFilename, undefined, {
        sensitivity: "base"
      });
    }
    if (sort === "size-desc") return right.sizeBytes - left.sizeBytes;
    return right.addedAt.localeCompare(left.addedAt);
  });
}
