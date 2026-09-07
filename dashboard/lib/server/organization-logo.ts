import { request as httpsRequest } from "node:https";
import { resolvePublicPage } from "./public-page";
import { decodeProfilePhoto } from "../modules/people/profile-photos";

export function isLinkedInLogoUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && /(?:^|\.)licdn\.com$/i.test(url.hostname) && /company-logo/i.test(url.pathname);
  } catch { return false; }
}

/** Copy only the company-logo image identified on a matched public LinkedIn profile. */
export async function fetchLinkedInLogo(raw: string, timeoutMs = 3000): Promise<string> {
  const signal = AbortSignal.timeout(timeoutMs);
  const run = async () => {
    let next = raw;
    for (let hop = 0; hop < 3; hop++) {
      if (!isLinkedInLogoUrl(next)) throw new Error("LinkedIn company picture unavailable");
      const { url, address } = await resolvePublicPage(next);
      signal.throwIfAborted();
      const response = await new Promise<{ redirect?: string; dataUrl?: string }>((resolve, reject) => {
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
          if (response.statusCode !== 200 || !/^image\/(?:jpeg|png|webp)$/.test(mime || "") || Number(response.headers["content-length"] || 0) > 700_000 || response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
            response.destroy(new Error("LinkedIn company picture unavailable")); return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 700_000) response.destroy(new Error("Company picture is too large"));
            else chunks.push(chunk);
          });
          response.on("end", () => {
            const dataUrl = `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
            try { decodeProfilePhoto(dataUrl); resolve({ dataUrl }); } catch (error) { reject(error); }
          });
        });
        request.on("error", reject); request.end();
      });
      if (response.dataUrl) return response.dataUrl;
      next = response.redirect!;
    }
    throw new Error("Company picture redirects too many times");
  };
  return Promise.race([run(), new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Company picture timed out")), { once: true }))]);
}
