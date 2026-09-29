"use client";
import { browserVault } from "../../local-first/browser-engine";
import type {
  VaultObjectSnapshot,
  VaultMediaManifest,
} from "../../local-first/types";
const thumbnailCache = new Map<string, Blob>();
let generation = 0;
if (typeof window !== "undefined")
  window.addEventListener("unigentamos-vault-locked", clearThumbnailCache);
let thumbnailWorkers = 0;
const thumbnailWaiters: Array<() => void> = [];
export async function smallPreview(object: VaultObjectSnapshot) {
  const started = generation;
  const key = (object.fields.mediaManifest as unknown as VaultMediaManifest)
      .contentRoot,
    cached = thumbnailCache.get(key);
  if (cached) return cached;
  if (thumbnailWorkers >= 3)
    await new Promise<void>((resolve) => thumbnailWaiters.push(resolve));
  thumbnailWorkers++;
  try {
    const { blob } = await browserVault.openMedia(object);
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 384 / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error("Preview unavailable");
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const small = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Preview unavailable"))),
        "image/webp",
        0.8,
      ),
    );
    if (!browserVault.isUnlocked() || generation !== started)
      throw new Error("Vault locked");
    thumbnailCache.set(key, small);
    while (thumbnailCache.size > 60)
      thumbnailCache.delete(thumbnailCache.keys().next().value!);
    return small;
  } finally {
    thumbnailWorkers--;
    thumbnailWaiters.shift()?.();
  }
}

export function clearThumbnailCache() {
  generation++;
  thumbnailCache.clear();
}
