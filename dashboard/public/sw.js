const CACHE_VERSION = "unigentamos-static-v8";
const PUBLIC_SHELL = ["/offline", "/unigentamos-logo.svg"];

async function installOfflineShell() {
  const cache = await caches.open(CACHE_VERSION);
  await cache.addAll(PUBLIC_SHELL);
  const response = await fetch("/vault", { cache: "reload" });
  if (!response.ok) throw new Error("Vault shell could not be cached");
  await cache.put("/vault", response.clone());
  const html = await response.text();
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"']+)["']/g)) assets.add(match[1]);
  await Promise.all([...assets].map((asset) => cache.add(asset).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(installOfflineShell());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/unigentamos-logo.svg") {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
        return response;
      }))
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && url.pathname === "/vault") {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put("/vault", response.clone());
        }
        return response;
      } catch {
        const moduleRoute = url.pathname.startsWith("/admin/");
        return await caches.match(url.pathname === "/vault" || moduleRoute ? "/vault" : "/offline")
          || new Response("Unigentamos is offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
  }
});
