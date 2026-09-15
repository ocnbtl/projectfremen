import { request as httpsRequest } from "node:https";
import { resolvePublicPage } from "./public-page";
import { decodeProfilePhoto } from "../modules/people/profile-photos";
import sharp from "sharp";

export type OrganizationLogo = { url: string; sourceUrl: string; kind: "linkedin" | "website" | "instagram" };

export function isInstagramLogoUrl(raw: string): boolean {
  try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password && !url.port && /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/i.test(url.hostname); }
  catch { return false; }
}

/** Preserve the complete mark with padding, never crop lettering to fill an avatar. */
export async function prepareOrganizationLogo(input: Buffer): Promise<string> {
  if (input.length > 2_000_000) throw new Error("Company picture is too large");
  const image = sharp(input, { limitInputPixels: 16_000_000, failOn: "error" });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1 || !metadata.width || !metadata.height
    || Math.min(metadata.width, metadata.height) < 48 || Math.max(metadata.width / metadata.height, metadata.height / metadata.width) > 4) throw new Error("Company picture is not suitable for a square profile");
  // Transparent white artwork needs a dark neutral backing to remain visible.
  const sample = await image.clone().resize(64, 64, { fit: "inside" }).ensureAlpha().raw().toBuffer();
  let light = 0, visible = 0;
  for (let i = 0; i < sample.length; i += 4) if (sample[i + 3] > 128) { visible++; if (Math.min(sample[i], sample[i + 1], sample[i + 2]) > 225) light++; }
  if (!visible) throw new Error("Company picture is empty");
  const background = metadata.hasAlpha && light / visible > 0.85 ? "#303a37" : "#ffffff";
  const output = await image.rotate().resize(448, 448, { fit: "contain", background }).flatten({ background })
    .extend({ top: 32, bottom: 32, left: 32, right: 32, background }).webp({ quality: 90 }).toBuffer();
  const dataUrl = `data:image/webp;base64,${output.toString("base64")}`;
  decodeProfilePhoto(dataUrl);
  return dataUrl;
}

export function isLinkedInLogoUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && /(?:^|\.)licdn\.com$/i.test(url.hostname) && /company-logo/i.test(url.pathname);
  } catch { return false; }
}

/** Copy only the company-logo image identified on a matched public LinkedIn profile. */
export async function fetchLinkedInLogo(raw: string, timeoutMs = 3000): Promise<string> {
  return fetchOrganizationLogo({ url: raw, sourceUrl: raw, kind: "linkedin" }, timeoutMs);
}

export async function fetchOrganizationLogo(logo: OrganizationLogo, timeoutMs = 3000): Promise<string> {
  const signal = AbortSignal.timeout(timeoutMs);
  const run = async () => {
    let next = logo.url;
    for (let hop = 0; hop < 3; hop++) {
      const target = new URL(next);
      if (target.protocol !== "https:" || target.username || target.password || target.port
        || logo.kind === "linkedin" && !isLinkedInLogoUrl(next)
        || logo.kind === "instagram" && !isInstagramLogoUrl(next)) throw new Error("Company picture unavailable");
      const { url, address } = await resolvePublicPage(next);
      signal.throwIfAborted();
      const response = await new Promise<{ redirect?: string; bytes?: Buffer }>((resolve, reject) => {
        const request = httpsRequest(url, {
          agent: false, signal, maxHeaderSize: 16_384, family: address.family,
          lookup: (_host, _options, callback) => callback(null, address.address, address.family),
          headers: { Accept: "image/jpeg,image/png,image/webp", "Accept-Encoding": "identity" }
        }, (response) => {
          response.on("error", reject);
          if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
            resolve({ redirect: new URL(response.headers.location, url).toString() }); response.destroy(); return;
          }
          const mime = response.headers["content-type"]?.split(";")[0];
          if (response.statusCode !== 200 || !/^image\/(?:jpeg|png|webp)$/.test(mime || "") || Number(response.headers["content-length"] || 0) > 2_000_000 || response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
            response.destroy(new Error("LinkedIn company picture unavailable")); return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 2_000_000) response.destroy(new Error("Company picture is too large"));
            else chunks.push(chunk);
          });
          response.on("end", () => {
            resolve({ bytes: Buffer.concat(chunks) });
          });
        });
        request.on("error", reject); request.end();
      });
      if (response.bytes) { signal.throwIfAborted(); return prepareOrganizationLogo(response.bytes); }
      next = response.redirect!;
    }
    throw new Error("Company picture redirects too many times");
  };
  return Promise.race([run(), new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Company picture timed out")), { once: true }))]);
}
