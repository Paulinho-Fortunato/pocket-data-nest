/* AngoStudy service worker — shell cache, offline fallback, safe updates.
 *
 * Rules:
 *  - never cache AI responses, credentials or non-GET requests;
 *  - never cache cross-origin requests (the AI provider, fonts, YouTube);
 *  - navigations are network-first so deploys are picked up immediately,
 *    with the cached shell (or /offline.html) as an honest fallback;
 *  - hashed build assets are cache-first + background refresh;
 *  - a new version waits until the app asks it o take over (SKIP_WAITING).
 */

const VERSION = "angostudy-3.0.0";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

const NEVER_CACHE = [/\/api\//, /\/_serverFn\//, /\/openrouter/, /\/auth/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `addAll` fails atomically if one URL 404s, so add individually.
      await Promise.all(
        SHELL_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // Offline during install: cache what is possible.
          }
        }),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isCacheableAsset(url) {
  return (
    /\/(?:assets|_build)\//.test(url.pathname) ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico|webmanifest)$/.test(url.pathname)
  );
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put("/", response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const shell = await caches.match("/", { ignoreSearch: true });
    if (shell) return shell;
    const offline = await caches.match("/offline.html");
    if (offline) return offline;
    return new Response(
      "<!doctype html><title>Sem ligação</title><p>Estás offline e esta página ainda não foi guardada.</p>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const response = await network;
  if (response) return response;
  throw new Error("Asset indisponível offline");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((pattern) => pattern.test(url.pathname))) return;
  if (request.headers.get("authorization")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(
      staleWhileRevalidate(request).catch(
        () => new Response("", { status: 504, statusText: "Offline" }),
      ),
    );
  }
});
