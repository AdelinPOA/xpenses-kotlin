import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const workerSource = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const origin = "https://fixture.xpenses.test";
const cacheName = "xpenses-v9";
const shellPath = "/offline/index.v9.html";
const offlineAssets = [
  shellPath,
  "/offline/workspace.v9.js",
  "/offline/workspace.v9.css",
  "/offline/messages.v9.json",
];

function responseFor(url) {
  const requestUrl = typeof url === "string" ? url : url.url;
  const pathname = new URL(requestUrl, origin).pathname;
  const assetPath = new URL(`../../public${pathname}`, import.meta.url);
  const contentTypes = {
    [shellPath]: "text/html; charset=utf-8",
    "/offline/workspace.v9.js": "text/javascript; charset=utf-8",
    "/offline/workspace.v9.css": "text/css; charset=utf-8",
    "/offline/messages.v9.json": "application/json; charset=utf-8",
  };
  if (contentTypes[pathname]) {
    return new Response(readFileSync(assetPath), {
      status: 200,
      headers: {
        "Content-Type": contentTypes[pathname],
        "Cache-Control": "public, max-age=0",
      },
    });
  }
  if (pathname === "/manifest.json") {
    return new Response("{}", {
      headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=0" },
    });
  }
  return new Response(new Uint8Array([137, 80, 78, 71]), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=0" },
  });
}

function createCacheStorage(shouldFailPut = () => false) {
  const stores = new Map();
  const keyFor = (request) =>
    typeof request === "string" ? new URL(request, origin).href : request.url;

  return {
    stores,
    async open(name) {
      if (!stores.has(name)) {
        const entries = new Map();
        stores.set(name, {
          entries,
          async match(request) {
            return entries.get(keyFor(request))?.clone();
          },
          async put(request, response) {
            if (shouldFailPut(name, request)) throw new Error("fixture cache quota exceeded");
            entries.set(keyFor(request), response.clone());
          },
          async delete(request) {
            return entries.delete(keyFor(request));
          },
        });
      }
      return stores.get(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
}

function loadWorker(
  fetchImplementation = async (url) => responseFor(url),
  source = workerSource,
  cacheStorage = createCacheStorage(),
) {
  const listeners = new Map();
  let skipWaitingCalls = 0;
  const self = {
    location: { origin },
    clients: { claim: async () => {} },
    skipWaiting: async () => { skipWaitingCalls++; },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  vm.runInNewContext(source, {
    URL,
    Response,
    caches: cacheStorage,
    fetch: fetchImplementation,
    self,
  });
  return {
    listeners,
    cacheStorage,
    get skipWaitingCalls() { return skipWaitingCalls; },
  };
}

function request(path, { mode = "cors", method = "GET", headers = {} } = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    url: new URL(path, origin).href,
    method,
    mode,
    headers: { get: (name) => normalizedHeaders.get(name.toLowerCase()) ?? null },
  };
}

async function dispatchFetch(worker, fetchRequest) {
  let responsePromise;
  worker.listeners.get("fetch")({
    request: fetchRequest,
    respondWith(promise) {
      responsePromise = promise;
    },
  });
  return responsePromise ? responsePromise : undefined;
}

async function install(worker) {
  let installation = Promise.resolve();
  worker.listeners.get("install")({ waitUntil(promise) { installation = promise; } });
  await installation;
}

async function activate(worker) {
  let activation = Promise.resolve();
  worker.listeners.get("activate")({ waitUntil(promise) { activation = promise; } });
  await activation;
}

function cachedPaths(worker, name = cacheName) {
  const cache = worker.cacheStorage.stores.get(name);
  return [...(cache?.entries.keys() ?? [])].map((url) => new URL(url).pathname).sort();
}

test("prepares only versioned public offline shell assets and fixed public icons", async () => {
  const worker = loadWorker();
  await install(worker);

  const paths = cachedPaths(worker);
  for (const asset of offlineAssets) assert.ok(paths.includes(asset), `${asset} was not prepared`);
  assert.ok(paths.includes("/manifest.json"));
  assert.ok(paths.includes("/icons/icon-192x192.png"));
  assert.equal(paths.some((path) => path.startsWith("/_next/")), false);
  assert.equal(worker.skipWaitingCalls, 1);
});

test("never stores account-specific navigation HTML and serves the generic functional shell offline", async () => {
  let online = true;
  const worker = loadWorker(async (url) => {
    const pathname = new URL(typeof url === "string" ? url : url.url, origin).pathname;
    if (!online) throw new TypeError("fixture network unavailable");
    if (pathname === "/dashboard") {
      return new Response("<h1>Private account A expense details</h1>", {
        headers: { "Content-Type": "text/html" },
      });
    }
    return responseFor(url);
  });
  await install(worker);

  const onlineResponse = await dispatchFetch(
    worker,
    request("/dashboard", { mode: "navigate" }),
  );
  assert.match(await onlineResponse.text(), /Private account A/);
  online = false;

  const offlineResponse = await dispatchFetch(
    worker,
    request("/expenses", { mode: "navigate" }),
  );
  assert.equal(offlineResponse.status, 200);
  assert.equal(offlineResponse.headers.get("Cache-Control"), "no-store");
  const html = await offlineResponse.text();
  assert.match(html, /xpenses-offline-shell/);
  assert.match(html, /workspace\.v9\.js/);
  assert.doesNotMatch(html, /Private account A/);
  assert.equal(cachedPaths(worker).includes("/dashboard"), false);
  assert.equal(cachedPaths(worker).includes("/offline-shell"), false);
});

test("resolved server errors fall back to the shell, but auth responses remain visible", async () => {
  const worker = loadWorker(async (url) => {
    const pathname = new URL(typeof url === "string" ? url : url.url, origin).pathname;
    if (pathname === "/dashboard") {
      return new Response("private upstream error body", {
        status: 503,
        headers: { "Content-Type": "text/html" },
      });
    }
    if (pathname === "/forbidden") {
      return new Response("real authorization rejection", {
        status: 403,
        headers: { "Content-Type": "text/html" },
      });
    }
    return responseFor(url);
  });
  await install(worker);

  const fallback = await dispatchFetch(worker, request("/dashboard", { mode: "navigate" }));
  assert.equal(fallback.status, 200);
  const fallbackHtml = await fallback.text();
  assert.match(fallbackHtml, /xpenses-offline-shell/);
  assert.doesNotMatch(fallbackHtml, /private upstream error body/);

  const forbidden = await dispatchFetch(worker, request("/forbidden", { mode: "navigate" }));
  assert.equal(forbidden.status, 403);
  assert.equal(await forbidden.text(), "real authorization rejection");
});

test("an unprepared, invalid, or poisoned shell gets neutral guidance, never an account document", async () => {
  let offline = false;
  const poisoned = loadWorker(async (url) => {
    const pathname = new URL(typeof url === "string" ? url : url.url, origin).pathname;
    if (offline && pathname === "/dashboard") throw new TypeError("offline");
    if (pathname === shellPath) {
      return new Response("<h1>Sign in as private account A</h1>", {
        headers: { "Content-Type": "text/html", "Cache-Control": "public, max-age=0" },
      });
    }
    return responseFor(url);
  });
  await assert.rejects(install(poisoned));
  offline = true;
  const poisonedResponse = await dispatchFetch(
    poisoned,
    request("/dashboard", { mode: "navigate" }),
  );
  assert.equal(poisonedResponse.status, 503);
  const poisonedHtml = await poisonedResponse.text();
  assert.match(poisonedHtml, /Offline workspace is not ready/);
  assert.doesNotMatch(poisonedHtml, /Sign in as private account A/);

  const unprepared = loadWorker(async () => { throw new TypeError("fixture offline"); });
  const fallback = await dispatchFetch(
    unprepared,
    request("/dashboard", { mode: "navigate", headers: { "Accept-Language": "ro-RO,ro;q=0.9" } }),
  );
  assert.equal(fallback.status, 503);
  assert.match(await fallback.text(), /Spațiul offline nu este pregătit/);

  const corrupted = loadWorker(async (url) => {
    if (new URL(typeof url === "string" ? url : url.url, origin).pathname === "/dashboard") {
      throw new TypeError("fixture offline");
    }
    return responseFor(url);
  });
  await install(corrupted);
  const cache = await corrupted.cacheStorage.open(cacheName);
  await cache.put(shellPath, new Response("<h1>Unverified cached account HTML</h1>", {
    headers: { "Content-Type": "text/html" },
  }));
  const safeFallback = await dispatchFetch(
    corrupted,
    request("/dashboard", { mode: "navigate", headers: { "Accept-Language": "en" } }),
  );
  assert.equal(safeFallback.status, 503);
  assert.doesNotMatch(await safeFallback.text(), /Unverified cached account HTML/);
});

test("a failed update is discarded and does not promote or remove the previous working shell", async () => {
  const sharedCaches = createCacheStorage();
  let oldWorkerOnline = true;
  const oldWorker = loadWorker(async (url) => {
    const pathname = new URL(typeof url === "string" ? url : url.url, origin).pathname;
    if (!oldWorkerOnline && pathname === "/dashboard") throw new TypeError("fixture offline");
    return responseFor(url);
  }, workerSource, sharedCaches);
  await install(oldWorker);
  await activate(oldWorker);

  const failedSource = workerSource.replaceAll("v9", "v10");
  const failedUpdate = loadWorker(async (url) => {
    const pathname = new URL(typeof url === "string" ? url : url.url, origin).pathname;
    if (pathname === "/offline/workspace.v10.js") {
      return new Response("Not found", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    }
    const mapped = pathname.replace("v10", "v9");
    const response = responseFor(new URL(mapped, origin).href);
    if (pathname.startsWith("/offline/")) {
      const body = (await response.text()).replaceAll("v9", "v10").replace('"shellVersion": 9', '"shellVersion": 10');
      return new Response(body, {
        status: response.status,
        headers: response.headers,
      });
    }
    return response;
  }, failedSource, sharedCaches);

  await assert.rejects(install(failedUpdate));
  assert.equal(failedUpdate.skipWaitingCalls, 0);
  assert.deepEqual(await sharedCaches.keys(), [cacheName]);

  oldWorkerOnline = false;
  const offlineResponse = await dispatchFetch(
    oldWorker,
    request("/dashboard", { mode: "navigate" }),
  );
  assert.equal(offlineResponse.status, 200);
  assert.match(await offlineResponse.text(), /workspace\.v9\.js/);
});

test("cache quota failure rejects installation and removes only the incomplete new cache", async () => {
  const caches = createCacheStorage((_name, request) =>
    String(typeof request === "string" ? request : request.url).includes("workspace.v9.js"),
  );
  const worker = loadWorker(undefined, workerSource, caches);
  await assert.rejects(install(worker));
  assert.equal(worker.skipWaitingCalls, 0);
  assert.deepEqual(await caches.keys(), []);
});

test("does not intercept API, RSC, Server Actions, arbitrary assets, or Next chunks", async () => {
  let fetchCalls = 0;
  const worker = loadWorker(async () => {
    fetchCalls += 1;
    return new Response("private payload");
  });

  assert.equal(await dispatchFetch(worker, request("/api/private")), undefined);
  assert.equal(
    await dispatchFetch(worker, request("/expenses", { headers: { RSC: "1" } })),
    undefined,
  );
  assert.equal(
    await dispatchFetch(worker, request("/expenses", { headers: { "Next-Action": "action" } })),
    undefined,
  );
  assert.equal(
    await dispatchFetch(worker, request("/_next/static/chunks/app.js")),
    undefined,
  );
  assert.equal(await dispatchFetch(worker, request("/account/theme.css")), undefined);
  assert.equal(fetchCalls, 0);
  assert.equal(worker.cacheStorage.stores.size, 0);
});

test("only a known versioned dependency can be loaded from the public cache", async () => {
  let javascriptFetches = 0;
  const jsWorker = loadWorker(async (url) => {
    const pathname = new URL(typeof url === "string" ? url : url.url, origin).pathname;
    if (pathname === "/offline/workspace.v9.js") javascriptFetches += 1;
    return responseFor(url);
  });
  await install(jsWorker);
  const offlineAsset = await dispatchFetch(
    jsWorker,
    request("/offline/workspace.v9.js"),
  );
  assert.match(await offlineAsset.text(), /xpenses-offline-asset:v9/);
  assert.equal(javascriptFetches, 1, "installation fetches the known asset once; fetch uses its cached copy");
  assert.equal(
    await dispatchFetch(jsWorker, request("/offline/attacker.js")),
    undefined,
  );
});

test("activation and logout preserve only the generic app cache, not unrelated origin caches", async () => {
  const worker = loadWorker();
  await worker.cacheStorage.open("xpenses-v8");
  await worker.cacheStorage.open("xpenses-private-old");
  const unrelated = await worker.cacheStorage.open("other-origin-app");
  await unrelated.put("/private", new Response("Unrelated application cache"));
  await install(worker);
  await activate(worker);
  assert.deepEqual((await worker.cacheStorage.keys()).sort(), ["other-origin-app", cacheName]);

  let clearing = Promise.resolve();
  worker.listeners.get("message")({
    data: { type: "CLEAR_CACHE" },
    waitUntil(promise) { clearing = promise; },
  });
  await clearing;
  assert.deepEqual((await worker.cacheStorage.keys()).sort(), ["other-origin-app", cacheName]);
  let shell = await (await worker.cacheStorage.open(cacheName)).match(shellPath);
  assert.match(await shell.text(), /xpenses-offline-shell/);

  // AuthProvider may purge the current cache before posting CLEAR_CACHE.
  await worker.cacheStorage.delete(cacheName);
  let restoring = Promise.resolve();
  worker.listeners.get("message")({
    data: { type: "CLEAR_CACHE" },
    waitUntil(promise) { restoring = promise; },
  });
  await restoring;
  shell = await (await worker.cacheStorage.open(cacheName)).match(shellPath);
  assert.match(await shell.text(), /xpenses-offline-shell/);
});
