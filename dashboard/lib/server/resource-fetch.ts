import { resolvePublicPage, requestPinnedPage } from "./public-page";

/** Keep DNS validation bound to the actual socket, including every redirect. */
export async function fetchResource(raw: string, metadata: boolean, dependencies: {
  resolve?: Parameters<typeof resolvePublicPage>[1];
  request?: typeof requestPinnedPage;
  timeoutMs?: number;
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 8000);
  const aborted = new Promise<never>((_resolve, reject) => controller.signal.addEventListener("abort", () => reject(new Error("The URL check timed out.")), { once: true }));
  const run = async () => {
    let next = raw;
    for (let hop = 0; hop <= 4; hop++) {
      const target = await resolvePublicPage(next, dependencies.resolve);
      controller.signal.throwIfAborted();
      const page = await (dependencies.request || requestPinnedPage)(target, controller.signal, 512000, metadata ? "html" : "headers");
      if ([301,302,303,307,308].includes(page.status)) {
        if (!page.headers.location || hop === 4) throw new Error("The URL redirected too many times.");
        next = new URL(page.headers.location, target.url).toString();
        continue;
      }
      const headers = new Headers();
      for (const [key,value] of Object.entries(page.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const body = metadata && ![204,205,304].includes(page.status) ? page.html : null;
      return { response: new Response(body, { status: page.status, headers }), finalUrl: target.url.toString() };
    }
    throw new Error("The URL could not be checked.");
  };
  try { return await Promise.race([run(), aborted]); }
  finally { clearTimeout(timeout); }
}
