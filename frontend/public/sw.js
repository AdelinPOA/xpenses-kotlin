const CACHE_NAME = "xpenses-v2";
const SHELL_URLS = ["/", "/login", "/dashboard", "/expenses", "/reports"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url).catch(() => {})));
      // Activate immediately instead of waiting for all clients to close
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Never intercept API traffic: authenticated responses must not be cached
  // (stale data + PII persistence in Cache Storage).
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate" || request.destination === "style" || request.destination === "script" || request.destination === "font") {
    event.respondWith(networkFirst(request));
  } else if (request.destination === "image") {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (request.method === "GET") {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (request.method === "GET") {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}
