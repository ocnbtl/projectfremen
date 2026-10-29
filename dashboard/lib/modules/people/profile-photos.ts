import { deleteJsonFile, mutateJsonFile, readJsonFile, writeJsonFile } from "../../file-store";
import sharp from "sharp";
import { photoCrop } from "./photo-crop";

export type SavedPhotoCrop = { zoom: number; panX: number; panY: number; outputSize: number };

const MAX_PROFILE_PHOTO_BYTES = 1_500_000;
const ALLOWED_PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function decodeProfilePhoto(dataUrl: string) {
  if (typeof dataUrl !== "string" || dataUrl.length > 1_000_000) throw new Error("The prepared profile picture is too large.");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error("Choose a JPEG, PNG, or WebP profile picture.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || !hasExpectedSignature(bytes, match[1])) throw new Error("The profile picture is invalid.");
  return { mimeType: match[1], bytes };
}

export const IMPORT_PHOTO_WARNING = "The profile picture could not be imported. Add it separately as a JPEG, PNG, or WebP image.";

/** Imported vCards can mislabel image types. Inspect bytes without fetching remote photos. */
export function decodeImportedProfilePhoto(dataUrl: unknown) {
  if (typeof dataUrl !== "string" || dataUrl.length > 1_000_000) return null;
  const match = dataUrl.match(/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/= \t\r\n]+)$/i);
  if (!match) return null;
  const encoded = match[1].replace(/[ \t\r\n]/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, "base64");
  // Buffer decoding is permissive; reject incomplete or otherwise malformed payloads.
  if (!bytes.length || bytes.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) return null;
  const mimeType = [...ALLOWED_PROFILE_PHOTO_TYPES].find(type => hasExpectedSignature(bytes, type));
  return mimeType ? { mimeType, bytes } : null;
}

export type StoredPeopleProfilePhoto = {
  personId: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  bytesBase64: string;
  byteLength: number;
  updatedAt: string;
  source?: { mimeType: string; bytesBase64: string };
  crop?: SavedPhotoCrop;
};

function assertPersonId(personId: string): string {
  const clean = personId.trim();
  if (!/^(?:personal|project)-[0-9a-f-]{36}$/i.test(clean)) throw new Error("Invalid profile picture id");
  return clean;
}

function fileName(personId: string): string {
  const id = assertPersonId(personId);
  // Project pictures share the validated crop pipeline, with their own storage namespace.
  return `${id.startsWith("project-") ? "project" : "people"}-profile-photo-${id}.json`;
}

function hasExpectedSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mimeType === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

export async function readPeopleProfilePhoto(personId: string): Promise<StoredPeopleProfilePhoto | null> {
  return readJsonFile<StoredPeopleProfilePhoto | null>(fileName(personId), null);
}

export async function writePeopleProfilePhoto(
  personId: string,
  mimeType: string,
  bytes: Uint8Array
): Promise<StoredPeopleProfilePhoto> {
  const cleanId = assertPersonId(personId);
  if (!ALLOWED_PROFILE_PHOTO_TYPES.has(mimeType)) throw new Error("Profile pictures must be JPEG, PNG, or WebP images.");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error("Profile pictures must be 1.5 MB or smaller after preparation.");
  }
  if (!hasExpectedSignature(bytes, mimeType)) throw new Error("The uploaded file does not match its image type.");
  const photo: StoredPeopleProfilePhoto = {
    personId: cleanId,
    mimeType: mimeType as StoredPeopleProfilePhoto["mimeType"],
    bytesBase64: Buffer.from(bytes).toString("base64"),
    byteLength: bytes.byteLength,
    updatedAt: new Date().toISOString()
  };
  await writeJsonFile(fileName(cleanId), photo);
  return photo;
}

export async function removePeopleProfilePhoto(personId: string): Promise<void> {
  await deleteJsonFile(fileName(personId));
}

/** Keep the source and rendered square together so later edits never crop an earlier crop. */
export async function cropPeopleProfilePhoto(personId: string, input: unknown, expectedUpdatedAt?: string,
  replacement?: { mimeType: string; bytes: Uint8Array }): Promise<StoredPeopleProfilePhoto> {
  const crop = input as SavedPhotoCrop;
  if (!crop || ![crop.zoom, crop.panX, crop.panY, crop.outputSize].every(Number.isFinite)
    || crop.zoom < 1 || crop.zoom > 3 || Math.abs(crop.panX) > 1 || Math.abs(crop.panY) > 1
    || ![256, 512, 1024].includes(crop.outputSize)) throw new Error("Invalid picture crop.");
  if (replacement && (!ALLOWED_PROFILE_PHOTO_TYPES.has(replacement.mimeType)
    || !replacement.bytes.length || replacement.bytes.length > MAX_PROFILE_PHOTO_BYTES
    || !hasExpectedSignature(replacement.bytes, replacement.mimeType))) throw new Error("Invalid source picture. Choose an image under 1.5 MB after preparation.");
  return mutateJsonFile<StoredPeopleProfilePhoto | null, StoredPeopleProfilePhoto>(fileName(personId), null, async current => {
    if (!replacement && (!current || !expectedUpdatedAt || current.updatedAt !== expectedUpdatedAt)) {
      throw new Error("This picture changed. Close the editor and reopen it before saving.");
    }
    const source = replacement ? { mimeType: replacement.mimeType, bytesBase64: Buffer.from(replacement.bytes).toString("base64") }
      : current!.source || { mimeType: current!.mimeType, bytesBase64: current!.bytesBase64 };
    const normalized = await sharp(Buffer.from(source.bytesBase64, "base64"), { limitInputPixels: 40_000_000 }).rotate().toBuffer({ resolveWithObject: true });
    const rect = photoCrop({ ...crop, sourceWidth: normalized.info.width, sourceHeight: normalized.info.height });
    const side = Math.max(1, Math.floor(rect.side));
    const bytes = await sharp(normalized.data).extract({ left: Math.floor(rect.x), top: Math.floor(rect.y), width: side, height: side })
      .resize(crop.outputSize, crop.outputSize).webp({ quality: 90 }).toBuffer();
    const photo: StoredPeopleProfilePhoto = { personId, mimeType: "image/webp", bytesBase64: bytes.toString("base64"), byteLength: bytes.length,
      updatedAt: new Date(Math.max(Date.now(), Date.parse(current?.updatedAt || "") + 1 || 0)).toISOString(),
      source, crop: { zoom: crop.zoom, panX: crop.panX, panY: crop.panY, outputSize: crop.outputSize } };
    return { value: photo, result: photo };
  });
}
