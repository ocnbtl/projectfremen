import type { VaultMediaManifest } from "../../local-first/types";
import type { NativeObjectRef } from "../../native-objects/types";
import { isModuleId } from "../../native-objects/types";
import { createNativeObjectRef } from "../../native-objects/routes";

export type MediaProfile = {
  version: 1;
  manifest: VaultMediaManifest;
  linkedRefs: NativeObjectRef[];
  altText: string;
  archivedAt?: string;
  location?: {
    latitude: number;
    longitude: number;
    source: "embedded" | "manual";
  };
};
export function normalizeMediaProfile(
  value: unknown,
): MediaProfile | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid media metadata");
  const raw = value as MediaProfile,
    m = raw.manifest;
  if (
    raw.version !== 1 ||
    !m ||
    m.format !== "unigentamos-vault-media-v1" ||
    m.digestAlgorithm !== "chunk-root-v1" ||
    !/^[a-f\d]{64}$/i.test(m.contentRoot)
  )
    throw new Error("Invalid encrypted media manifest");
  if (
    ![m.mediaId, m.objectId].every(
      (id) => typeof id === "string" && /^[a-z\d-]{16,80}$/i.test(id),
    )
  )
    throw new Error("Invalid media identity");
  if (
    !Number.isSafeInteger(m.byteLength) ||
    m.byteLength < 1 ||
    m.byteLength > 256 * 1024 * 1024 ||
    !Number.isSafeInteger(m.chunkSize) ||
    m.chunkSize < 1 ||
    m.totalChunks !== Math.ceil(m.byteLength / m.chunkSize)
  )
    throw new Error("Invalid media size");
  if (
    typeof m.fileName !== "string" ||
    m.fileName.length > 240 ||
    typeof m.mimeType !== "string" ||
    m.mimeType.length > 200 ||
    !Number.isFinite(Date.parse(m.createdAt))
  )
    throw new Error("Invalid media description");
  if (!Array.isArray(raw.linkedRefs) || raw.linkedRefs.length > 100)
    throw new Error("Use no more than 100 linked records");
  const linkedRefs = raw.linkedRefs.map((ref) => {
    if (
      !ref ||
      !isModuleId(ref.module) ||
      typeof ref.objectId !== "string" ||
      !ref.objectId ||
      ref.objectId.length > 300 ||
      typeof ref.objectType !== "string" ||
      ref.objectType.length > 100 ||
      typeof ref.label !== "string" ||
      ref.label.length > 500
    )
      throw new Error("Invalid linked media record");
    return createNativeObjectRef({
      module: ref.module,
      objectId: ref.objectId,
      objectType: ref.objectType,
      label: ref.label,
    });
  });
  if (
    raw.location &&
    (!Number.isFinite(raw.location.latitude) ||
      Math.abs(raw.location.latitude) > 90 ||
      !Number.isFinite(raw.location.longitude) ||
      Math.abs(raw.location.longitude) > 180)
  )
    throw new Error("Invalid photo coordinates");
  return {
    version: 1,
    manifest: {
      format: m.format,
      mediaId: m.mediaId,
      objectId: m.objectId,
      contentRoot: m.contentRoot,
      digestAlgorithm: m.digestAlgorithm,
      fileName: m.fileName,
      mimeType: m.mimeType,
      byteLength: m.byteLength,
      chunkSize: m.chunkSize,
      totalChunks: m.totalChunks,
      createdAt: m.createdAt,
    },
    linkedRefs,
    altText: typeof raw.altText === "string" ? raw.altText.slice(0, 2000) : "",
    ...(raw.archivedAt
      ? { archivedAt: String(raw.archivedAt).slice(0, 40) }
      : {}),
    ...(raw.location
      ? {
          location: {
            latitude: raw.location.latitude,
            longitude: raw.location.longitude,
            source:
              raw.location.source === "embedded"
                ? ("embedded" as const)
                : ("manual" as const),
          },
        }
      : {}),
  };
}
