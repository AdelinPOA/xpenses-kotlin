// Bump this whenever the caching policy changes; activation removes legacy HTML caches.
const CACHE_NAME = "xpenses-v7";
const STATIC_URLS = [
  "/manifest.json",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/apple-touch-icon-180x180.png",
];

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Offline - Xpenses</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, -apple-system, sans-serif; }
      body { display: grid; min-height: 100vh; margin: 0; padding: 1.5rem; place-items: center; background: #09090b; color: #f4f4f5; }
      main { max-width: 32rem; text-align: center; }
      h1 { margin: 0 0 0.75rem; font-size: 1.5rem; }
      p { color: #a1a1aa; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>You are offline</h1>
      <p>Reconnect to reopen Xpenses. Drafts already saved on this device can sync after you reopen the app.</p>
    </main>
  </body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        STATIC_URLS.map((url) => cacheStaticAsset(cache, url)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Purge all legacy caches
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;

  const isNextStatic = url.pathname.startsWith("/_next/static/");
  const isPrivateRequest =
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    (url.pathname.startsWith("/_next/") && !isNextStatic) ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-State-Tree") ||
    request.headers.get("Next-Url") ||
    request.headers.get("Next-Action") ||
    url.searchParams.has("_rsc");

  // Never intercept API, dynamic framework, Server Action, or RSC responses.
  if (isPrivateRequest) return;

  // Navigation HTML can contain authenticated data even after a successful response.
  // Never persist or reuse documents; offline launches get only this generic fallback.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (request.method !== "GET") return;

  // Strictly restrict caching to immutable public static assets.
  const isStaticImage =
    url.pathname.startsWith("/icons/") || url.pathname === "/favicon.ico";
  const isStaticAsset = isNextStatic || isStaticImage;

  if (isStaticAsset) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheStaticAsset(cache, url) {
  try {
    const response = await fetch(url);
    if (isCacheableStaticResponse(response)) {
      await cache.put(url, response);
    }
  } catch {
    // An unavailable static asset must not prevent the worker from activating.
  }
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    // Deliberately not cached or hydrated: offline full-page navigations cannot
    // safely restore an authenticated app shell or its server-rendered content.
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}

function isCacheableStaticResponse(response) {
  if (
    !response.ok ||
    response.type === "opaque" ||
    response.headers.has("Set-Cookie")
  ) {
    return false;
  }

  const contentType = response.headers.get("Content-Type") || "";
  const cacheControl = response.headers.get("Cache-Control") || "";
  return (
    !/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType) &&
    !/(?:^|,)\s*(?:private|no-store)\b/i.test(cacheControl)
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (isCacheableStaticResponse(response)) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}
