// Bump this version whenever the allowlist, shell, or asset policy changes.
const CACHE_NAME = "xpenses-v9";
const OFFLINE_DOCUMENT = "/offline/index.v9.html";
const OFFLINE_ASSETS = [
  {
    url: OFFLINE_DOCUMENT,
    contentTypes: ["text/html"],
    marker: 'name="xpenses-offline-shell" content="v9"',
  },
  {
    url: "/offline/workspace.v9.js",
    contentTypes: ["text/javascript", "application/javascript"],
    marker: "xpenses-offline-asset:v9",
  },
  {
    url: "/offline/workspace.v9.css",
    contentTypes: ["text/css"],
    marker: "xpenses-offline-asset:v9",
  },
  {
    url: "/offline/messages.v9.json",
    contentTypes: ["application/json"],
    marker: '"shellVersion": 9',
  },
];
const STATIC_ASSETS = [
  {
    url: "/manifest.json",
    contentTypes: ["application/json", "application/manifest+json"],
  },
  {
    url: "/favicon.ico",
    contentTypes: ["image/x-icon", "image/vnd.microsoft.icon", "image/png"],
  },
  { url: "/favicon-32x32.png", contentTypes: ["image/png"] },
  { url: "/icons/icon-192x192.png", contentTypes: ["image/png"] },
  { url: "/icons/icon-512x512.png", contentTypes: ["image/png"] },
  { url: "/icons/apple-touch-icon-180x180.png", contentTypes: ["image/png"] },
];
const CACHEABLE_PUBLIC_URLS = new Set([
  ...OFFLINE_ASSETS.map(({ url }) => url),
  ...STATIC_ASSETS.map(({ url }) => url),
]);
const XPENSES_CACHE_PREFIX = "xpenses-";
const OFFLINE_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob: data:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        // Icons are optional; the document and its executable dependencies are not.
        await Promise.all(
          STATIC_ASSETS.map((asset) => cacheStaticAsset(cache, asset)),
        );
        const prepared = await prepareOfflineWorkspace(cache);
        if (!prepared)
          throw new Error("Required offline workspace asset is unavailable");
        await self.skipWaiting();
      } catch (error) {
        // This cache belongs only to the uninstalled worker. Never damage the
        // previous active worker's cache when an update is incomplete.
        await caches.delete(CACHE_NAME).catch(() => {});
        throw error;
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      if (!(await isVerifiedShell(cache))) {
        throw new Error(
          "Refusing to activate without a verified offline workspace",
        );
      }
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith(XPENSES_CACHE_PREFIX) && key !== CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_CACHE") return;
  // Cache Storage is public shell data only. Purge known application caches,
  // but preserve unrelated origin caches and restore the shell if it was removed.
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith(XPENSES_CACHE_PREFIX) && key !== CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      );
      const cache = await caches.open(CACHE_NAME);
      if (!(await isVerifiedShell(cache))) await prepareOfflineWorkspace(cache);
    })(),
  );
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

  const isPrivateRequest =
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-State-Tree") ||
    request.headers.get("Next-Url") ||
    request.headers.get("Next-Action") ||
    url.searchParams.has("_rsc");

  // API, framework internals, Server Actions and RSC are always network-only.
  if (isPrivateRequest) return;

  // Never store or reuse route documents. Failed navigations receive only the
  // exact verified generic workspace; it reads private state from IndexedDB.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (request.method !== "GET" || url.search !== "") return;
  if (!CACHEABLE_PUBLIC_URLS.has(url.pathname)) return;

  event.respondWith(cacheFirstPublicAsset(request));
});

async function prepareOfflineWorkspace(cache) {
  const prepared = [];
  for (const asset of OFFLINE_ASSETS) {
    const response = await fetchPublicAsset(asset);
    if (!response) return false;
    prepared.push([asset.url, response]);
  }

  // Commit executable dependencies first and the document last. A failure is
  // handled by install() by discarding this version's entire staged cache.
  for (const [url, response] of prepared.slice(1)) {
    await cache.put(url, response);
  }
  await cache.put(prepared[0][0], prepared[0][1]);
  return true;
}

async function fetchPublicAsset(asset) {
  try {
    const response = await fetch(
      new URL(asset.url, self.location.origin).href,
      {
        credentials: "omit",
        cache: "reload",
        redirect: "error",
      },
    );
    if (!isSafePublicResponse(response, asset.contentTypes)) return null;

    const responseUrl = response.url ? new URL(response.url) : null;
    if (
      responseUrl &&
      (responseUrl.origin !== self.location.origin ||
        responseUrl.pathname !== asset.url)
    ) {
      return null;
    }

    const body = await response.text();
    if (asset.marker && !body.includes(asset.marker)) return null;
    if (asset.url === "/offline/messages.v9.json") {
      const messages = JSON.parse(body);
      if (messages.shellVersion !== 9 || !messages.en || !messages.ro)
        return null;
    }
    return new Response(body, { status: 200, headers: response.headers });
  } catch {
    return null;
  }
}

async function cacheStaticAsset(cache, asset) {
  try {
    const response = await fetchPublicAsset(asset);
    if (response) await cache.put(asset.url, response);
  } catch {
    // Icons and the manifest are optional and cannot block shell installation.
  }
}

function isSafePublicResponse(response, allowedContentTypes) {
  if (
    !response.ok ||
    response.status !== 200 ||
    response.type === "opaque" ||
    response.redirected ||
    response.headers.has("Set-Cookie")
  ) {
    return false;
  }

  const cacheControl = response.headers.get("Cache-Control") || "";
  if (/(?:^|,)\s*(?:private|no-store)\b/i.test(cacheControl)) return false;
  if (!allowedContentTypes) return true;
  const contentType = (response.headers.get("Content-Type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  return allowedContentTypes.includes(contentType);
}

async function isVerifiedShell(cache) {
  for (const asset of OFFLINE_ASSETS) {
    const response = await cache.match(asset.url);
    if (!response || !isSafePublicResponse(response, asset.contentTypes))
      return false;
    const body = await response.clone().text();
    if (asset.marker && !body.includes(asset.marker)) return false;
    if (asset.url === "/offline/messages.v9.json") {
      try {
        const messages = JSON.parse(body);
        if (messages.shellVersion !== 9 || !messages.en || !messages.ro)
          return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    // Preserve real auth/authorization errors and all non-server responses.
    // Resolved 5xx documents are an unavailable frontend, not a valid page.
    if (response.status < 500 || response.status > 599) return response;
  } catch {
    // Fall through to the verified generic shell on transport failure.
  }

  const cache = await caches.open(CACHE_NAME);
  if (!(await isVerifiedShell(cache)))
    return offlineWorkspaceUnavailable(request);
  const shell = await cache.match(OFFLINE_DOCUMENT);
  return new Response(shell.body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": OFFLINE_CSP,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function offlineWorkspaceUnavailable(request) {
  const language = /(?:^|[,;\s])ro(?:[-,;\s]|$)/i.test(
    request.headers.get("Accept-Language") || "",
  )
    ? "ro"
    : "en";
  const message =
    language === "ro"
      ? {
          title: "Spațiul offline nu este pregătit",
          body: "Reconectează-te la Xpenses pentru a pregăti spațiul offline. Datele private nu au fost încărcate.",
        }
      : {
          title: "Offline workspace is not ready",
          body: "Reconnect to Xpenses to prepare this workspace. No private data was loaded.",
        };
  return new Response(
    `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${message.title}</title><style>body{display:grid;min-height:100vh;margin:0;padding:1.5rem;place-items:center;background:#f8fafc;color:#0f172a;font:16px system-ui,sans-serif}main{max-width:32rem;border-top:4px solid #ea580c;padding:1.25rem}h1{font-size:1.5rem}p{line-height:1.55;color:#334155}</style></head><body><main><h1>${message.title}</h1><p>${message.body}</p></main></body></html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function cacheFirstPublicAsset(request) {
  let pathname;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return;
  }

  const asset =
    OFFLINE_ASSETS.find((candidate) => candidate.url === pathname) ||
    STATIC_ASSETS.find((candidate) => candidate.url === pathname);
  if (!asset) return;

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached && (await isValidAssetResponse(cached, asset))) return cached;

  const response = await fetchPublicAsset(asset);
  if (!response) {
    return new Response("Offline asset unavailable", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  await cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function isValidAssetResponse(response, asset) {
  if (!isSafePublicResponse(response, asset.contentTypes)) return false;
  if (!asset.marker) return true;
  const body = await response.clone().text();
  if (!body.includes(asset.marker)) return false;
  if (asset.url === "/offline/messages.v9.json") {
    try {
      const messages = JSON.parse(body);
      return (
        messages.shellVersion === 9 &&
        Boolean(messages.en) &&
        Boolean(messages.ro)
      );
    } catch {
      return false;
    }
  }
  return true;
}
