const CACHE_NAME = "xpenses-v4";
const STATIC_URLS = [
  "/manifest.json",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(STATIC_URLS.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Purge all legacy caches including xpenses-v3 and old versions
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Never intercept document navigations (iOS Safari PWA compatibility)
  if (request.mode === "navigate") return;

  // Never intercept API traffic: authenticated responses must not be cached
  if (url.pathname.startsWith("/api/")) return;

  // Never intercept or cache RSC / server action payloads or dynamic next data
  // which may contain authenticated user data
  if (
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-State-Tree") ||
    request.headers.get("Next-Url") ||
    url.searchParams.has("_rsc") ||
    url.pathname.startsWith("/_next/data/")
  ) {
    return;
  }

  // Strictly restrict caching to immutable static assets
  const isNextStatic = url.pathname.startsWith("/_next/static/");
  const isStaticImage = url.pathname.startsWith("/icons/") || url.pathname === "/favicon.ico";
  const isStaticAsset =
    isNextStatic ||
    isStaticImage ||
    request.destination === "style" ||
    request.destination === "font";

  if (isStaticAsset) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (request.method === "GET" && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

