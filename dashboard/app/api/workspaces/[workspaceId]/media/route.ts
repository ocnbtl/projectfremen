import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  photoTypes,
  previewByteLimit,
  previewPixelLimit,
} from "../../../../../lib/modules/media/workspace-photos";
import { requireWorkspaceAccess, workspaceAccessError } from "../../../../../lib/workspace-access";
import {
  MediaError,
  setUploadPrivacy,
  defaultIncludedBytes,
  mediaAction,
  ownUpload,
  validUuid,
  workspaceMediaById,
  workspaceMediaDirectory,
  type WorkspaceMedia,
} from "../../../../../lib/modules/media/workspace-store";
import {
  assertR2Configured,
  directPart,
  readWorkspaceChunk,
  removeUnfinishedParts,
} from "../../../../../lib/modules/media/workspace-r2";

export const runtime = "nodejs";
type Context = { params: Promise<{ workspaceId: string }> };
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie, Authorization",
};
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}
function failure(error: unknown) {
  if (error instanceof MediaError) return json({ error: error.message }, error.status);
  return workspaceAccessError(error);
}
function fileStream(item: WorkspaceMedia) {
  let index = 0;
  const hash = createHash("sha256"),
    count = Math.ceil(item.byte_length / item.chunk_size);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const bytes = await readWorkspaceChunk(item, index++);
      hash.update(bytes);
      if (index === count && hash.digest("hex") !== item.sha256)
        throw new Error("File integrity check failed");
      controller.enqueue(new Uint8Array(bytes));
      if (index === count) controller.close();
    },
  });
}
export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const actor = await requireWorkspaceAccess(request, workspaceId, "read");
    const query = new URL(request.url).searchParams;
    if (!query.has("id")) {
      const offset = Number(query.get("offset") || "0");
      if (!Number.isSafeInteger(offset) || offset < 0) throw new MediaError(400, "Invalid page");
      return json(await workspaceMediaDirectory(actor, offset));
    }
    const item = await workspaceMediaById(actor, query.get("id")!);
    const view = query.get("view");
    if (view === "thumbnail" || view === "photo-copy") {
      if (!photoTypes.includes(item.mime_type) || item.byte_length > previewByteLimit)
        throw new MediaError(415, "A preview is unavailable for this file.");
      const source = Buffer.from(await new Response(fileStream(item)).arrayBuffer());
      // Select a safe raster decoder by its signature before handing data to libvips.
      const sig = source.subarray(0, 12);
      if (
        !(
          sig.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
          sig.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          (sig.toString("ascii", 0, 4) === "RIFF" && sig.toString("ascii", 8, 12) === "WEBP") ||
          ["GIF87a", "GIF89a"].includes(sig.toString("ascii", 0, 6)) ||
          (sig.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(sig.toString("ascii", 8, 12)))
        )
      )
        throw new MediaError(415, "A preview is unavailable for this file.");
      const decoder = sharp(source, { limitInputPixels: previewPixelLimit, pages: 1 });
      if (view === "photo-copy") {
        const copy = await decoder
          .rotate()
          .webp({ lossless: true })
          .toBuffer()
          .catch(() => null);
        if (!copy) throw new MediaError(415, "A photo copy could not be created.");
        return new Response(new Uint8Array(copy), {
          headers: {
            ...headers,
            "Content-Type": "image/webp",
            "Content-Disposition": `attachment; filename="photo-${item.media_id}.webp"`,
          },
        });
      }
      const thumbnail = await decoder
        .rotate()
        .resize(384, 384, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer()
        .catch(() => null);
      if (!thumbnail) throw new MediaError(415, "A preview is unavailable for this file.");
      return new Response(new Uint8Array(thumbnail), {
        headers: { ...headers, "Content-Type": "image/webp" },
      });
    }
    const name = encodeURIComponent(
      Array.from(item.file_name, (c) => (/^[\uD800-\uDFFF]$/.test(c) ? "�" : c)).join(""),
    ).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16));
    return new Response(fileStream(item), {
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(item.byte_length),
        "Content-Disposition": "attachment; filename*=UTF-8''" + name,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const actor = await requireWorkspaceAccess(request, workspaceId, "write");
    if (!request.body) throw new MediaError(400, "Missing upload request");
    const reader = request.body.getReader(),
      parts: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) {
        await reader.cancel();
        throw new MediaError(413, "Upload request too large");
      }
      parts.push(value);
    }
    const data = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (data?.action === "privacy") {
      if (typeof data.metadataFree !== "boolean") throw new MediaError(400, "Invalid photo preference");
      await setUploadPrivacy(actor, data.metadataFree);
      return json({ ok: true });
    }
    if (!data || !validUuid(data.id)) throw new MediaError(400, "Invalid file ID");
    switch (data.action) {
      case "start": {
        assertR2Configured();
        if (
          !Number.isSafeInteger(data.bytes) ||
          data.bytes <= 0 ||
          data.bytes > 268435456 ||
          typeof data.name !== "string" ||
          !data.name.trim() ||
          data.name.length > 240 ||
          /[\x00-\x1f\x7f]/.test(data.name) ||
          typeof data.mime !== "string" ||
          !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(data.mime) ||
          data.mime.length > 200 ||
          typeof data.sha256 !== "string" ||
          !/^[0-9a-f]{64}$/.test(data.sha256)
        )
          throw new MediaError(400, "Invalid upload details");
        const item = await mediaAction(actor, data.id, "start", {
          name: data.name,
          mime: data.mime,
          bytes: data.bytes,
          sha256: data.sha256,
          included: defaultIncludedBytes(),
        });
        return json({ id: item.media_id, state: item.state, chunkSize: item.chunk_size });
      }
      case "part": {
        const item = await mediaAction(actor, data.id, "part");
        if (
          !Number.isInteger(data.index) ||
          data.index < 0 ||
          data.index >= Math.ceil(item.byte_length / item.chunk_size)
        )
          throw new MediaError(400, "Invalid part");
        return json(await directPart(item, data.index));
      }
      case "finish": {
        const item = await ownUpload(actor, data.id);
        if (item.state !== "ready") {
          const hash = createHash("sha256");
          for (let i = 0; i < Math.ceil(item.byte_length / item.chunk_size); i++)
            hash.update(await readWorkspaceChunk(item, i));
          if (hash.digest("hex") !== item.sha256)
            throw new MediaError(409, "The uploaded file failed its integrity check.");
          await mediaAction(actor, data.id, "finish");
        }
        return json({ id: item.media_id, state: "ready" });
      }
      case "share": {
        if (!["private", "workspace"].includes(data.audience)) throw new MediaError(400, "Invalid audience");
        await mediaAction(actor, data.id, "share", { audience: data.audience });
        return json({ ok: true });
      }
      case "discard": {
        const item = await mediaAction(actor, data.id, "discard");
        if (item.state === "discarded") return json({ ok: true });
        if (item.write_deadline && Date.parse(item.write_deadline) >= Date.now())
          return json({ pendingUntil: item.write_deadline }, 202);
        await removeUnfinishedParts(item);
        await mediaAction(actor, data.id, "released");
        return json({ ok: true });
      }
      default:
        throw new MediaError(400, "Unknown upload action");
    }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid upload request" }, 400);
    return failure(error);
  }
}
