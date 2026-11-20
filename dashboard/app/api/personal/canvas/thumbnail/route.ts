import sharp from "sharp";
import { hasAdminSession } from "../../../../../lib/admin-session";
import { readMediaFileRecords } from "../../../../../lib/personal-records-store";
import { accountChunk, accountThumbnail } from "../../../../../lib/modules/media/account-store";
import type { MediaProfile } from "../../../../../lib/modules/media/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type FileInfo = NonNullable<MediaProfile["accountFile"]>;
const pending = new Map<string, Promise<Buffer>>();
let readingFiles: ReturnType<typeof readMediaFileRecords> | undefined;
let workers = 0;
const waiters:Array<()=>void> = [];
const baseHeaders = { Vary:"Cookie", "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff" };
const empty = (status:number) => new Response(null,{status,headers:baseHeaders});

async function preview(file:FileInfo) {
  const saved = await accountThumbnail(file.id,file.sha256);
  if (saved) return saved;
  // Existing uploads acquire a small derivative on first use; subsequent board visits only read it.
  if (workers>=2) await new Promise<void>(resolve=>waiters.push(resolve));
  else workers++;
  try {
    const chunks:Buffer[] = [];
    for (let index=0;index<file.totalChunks;index++) chunks.push(await accountChunk(file.id,index));
    const raster = sharp(Buffer.concat(chunks),{limitInputPixels:36_000_000,pages:1});
    const meta = await raster.metadata();
    if (!meta.format || !["png","jpeg","webp","heif","gif","tiff"].includes(meta.format)) throw new Error("Unsupported preview");
    const image = await raster.rotate().resize(400,400,{fit:"inside",withoutEnlargement:true}).webp({quality:76}).toBuffer();
    // Another instance may already have stored the same immutable derivative.
    try { await accountThumbnail(file.id,file.sha256,image); }
    catch (error) { if (!(await accountThumbnail(file.id,file.sha256))) throw error; }
    return image;
  } finally {
    const next=waiters.shift();
    if (next) next(); else workers--;
  }
}

export async function GET(request:Request) {
  if (!await hasAdminSession()) return empty(401);
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (!id || id.length>240) return empty(400);
  try {
    // A burst of visible cards shares one file-manifest read. No retained authorization or archive state.
    readingFiles ??= readMediaFileRecords().finally(()=>{readingFiles=undefined;});
    const record = (await readingFiles).find(row => row.id===id && !row.archivedAt);
    const profile = record?.mediaProfile;
    const file = profile?.accountFile;
    if (!file || !profile || profile.archivedAt) return empty(404);
    if (params.get("original")==="1") {
      const mime=profile.manifest.mimeType.toLowerCase();
      if(!/^image\/(jpeg|png|webp|gif|avif|bmp|tiff|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(mime)) return empty(404);
      const etag='"original-'+file.sha256+'"';
      const headers={...baseHeaders,ETag:etag,"Cache-Control":"private, max-age=120, must-revalidate","Content-Type":mime,
        "Content-Length":String(file.byteLength),"Content-Security-Policy":"sandbox; default-src 'none'; style-src 'unsafe-inline'","Content-Disposition":"attachment"};
      if(request.headers.get("if-none-match")===etag) return new Response(null,{status:304,headers});
      let index=0;
      const stream=new ReadableStream<Uint8Array>({
        async pull(controller) {
          if(index===file.totalChunks || request.signal.aborted){controller.close();return;}
          controller.enqueue(new Uint8Array(await accountChunk(file.id,index++)));
        }
      });
      return new Response(stream,{headers});
    }
    if (!/^image\/(?:jpeg|png|webp|avif|gif|tiff)$/i.test(profile.manifest.mimeType) || file.byteLength>24*1024*1024) return empty(404);
    const etag = '"canvas-' + file.sha256 + '"';
    const headers = {...baseHeaders, "Cache-Control":params.get("v")===record?.updatedAt ? "private, max-age=120, must-revalidate" : "private, no-cache", ETag:etag, "Content-Type":"image/webp"};
    if (request.headers.get("if-none-match")===etag) return new Response(null,{status:304,headers});
    let job = pending.get(file.id);
    if (!job) {
      job = preview(file).finally(()=>pending.delete(file.id));
      pending.set(file.id,job);
    }
    return new Response(new Uint8Array(await job),{headers});
  } catch { return empty(503); }
}
