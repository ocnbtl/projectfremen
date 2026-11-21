"use client";
import { photoTypes, previewByteLimit, previewPixelLimit } from "./workspace-photos";
import { browserPreference } from "../../design-system/browser-preference";
export const useUploadLocation = browserPreference(
  "unigentamos.media.import-location",
  false,
  (value) => value === "true",
  String,
);

export async function metadataFreePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (!photoTypes.includes(file.type) || file.size > previewByteLimit)
    throw new Error("Choose a JPEG, PNG, WebP, AVIF or GIF up to 20 MiB for a metadata-free upload.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > previewPixelLimit)
      throw new Error("Choose a photo up to 24 megapixels.");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser could not prepare a photo copy.");
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Photo copy failed."))),
        "image/png",
      ),
    );
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-copy.png", {
      type: "image/png",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
