const CACHE_NAME = "xpenses-v6";
const STATIC_URLS = [
  "/manifest.json",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/apple-touch-icon-180x180.png",
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
      // Purge all legacy caches
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

  // Network-First with Cache Fallback for document navigation (ADR 0005)
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

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

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
      cache.put("/offline-shell", response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const exactMatch = await cache.match(request);
    if (exactMatch) return exactMatch;

    const shellMatch = (await cache.match("/offline-shell")) || (await cache.match("/dashboard"));
    if (shellMatch) return shellMatch;

    return new Response(
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Offline - Xpenses</title><style>:root{color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem;text-align:center;background:#09090b;color:#f4f4f5}h1{font-size:1.5rem;margin:0 0 0.5rem}p{color:#a1a1aa;margin:0 0 1.5rem;font-size:0.95rem}button{padding:0.75rem 1.5rem;border-radius:0.5rem;background:#2563eb;color:#fff;border:none;font-weight:600;font-size:0.95rem;cursor:pointer}</style></head><body><h1>You are offline</h1><p>The requested page is not cached yet. Reconnect to sync drafts or reload.</p><button onclick="window.location.reload()">Retry</button></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 }
    );
  }
}

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

