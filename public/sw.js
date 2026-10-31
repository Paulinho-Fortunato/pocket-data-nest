// AngoStudy service worker — offline support for the local-first app.
// Strategy: precache nothing at install (the server bundle changes often);
// instead cache-on-first-visit with a network-first fallback for navigations.
const CACHE = "angostudy-v1";
const NAVIGATION_TIMEOUT = 4000;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && new URL(request.url).origin === self.location.origin) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstWithTimeout(request, timeoutMs) {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    if (response.ok && response.type !== "opaque") {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error("offline and not cached");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirstWithTimeout(request, NAVIGATION_TIMEOUT).catch(() =>
        caches.match("/").then((cached) => cached ?? new Response("Offline", { status: 503 })),
      ),
    );
    return;
  }

  // Static assets (JS, CSS, fonts, images): cache-first.
  event.respondWith(cacheFirst(request));
});
