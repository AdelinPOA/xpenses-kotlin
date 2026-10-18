import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const workerSource = readFileSync(
  new URL("../../public/sw.js", import.meta.url),
  "utf8",
);
const origin = "https://fixture.xpenses.test";

function createCacheStorage(fetchImplementation) {
  const stores = new Map();

  function keyFor(request) {
    return typeof request === "string"
      ? new URL(request, origin).href
      : request.url;
  }

  return {
    stores,
    async open(name) {
      if (!stores.has(name)) {
        const entries = new Map();
        stores.set(name, {
          entries,
          async add(request) {
            const key = keyFor(request);
            const response = await fetchImplementation(key);
            if (!response.ok)
              throw new TypeError("Cannot add a failed response");
            entries.set(key, response.clone());
          },
          async match(request) {
            return entries.get(keyFor(request))?.clone();
          },
          async put(request, response) {
            entries.set(keyFor(request), response.clone());
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
    async match(request) {
      for (const cache of stores.values()) {
        const response = await cache.match(request);
        if (response) return response;
      }
      return undefined;
    },
  };
}

function loadWorker(fetchImplementation) {
  const listeners = new Map();
  const cacheStorage = createCacheStorage(fetchImplementation);
  const self = {
    location: { origin },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };

  vm.runInNewContext(workerSource, {
    URL,
    Response,
    caches: cacheStorage,
    fetch: fetchImplementation,
    self,
  });

  return { listeners, cacheStorage };
}

function request(path, { mode = "cors", destination = "", headers = {} } = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    url: new URL(path, origin).href,
    method: "GET",
    mode,
    destination,
    headers: {
      get: (name) => normalizedHeaders.get(name.toLowerCase()) ?? null,
    },
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

  if (!responsePromise) return undefined;
  return responsePromise;
}

test("never serves account-specific navigation HTML from a prior route while offline", async () => {
  let online = true;
  const worker = loadWorker(async () => {
    if (!online) throw new TypeError("fixture network unavailable");
    return new Response("<h1>Private account A expense details</h1>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  });

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
  const offlineHtml = await offlineResponse.text();
  assert.match(offlineHtml, /You are offline/);
  assert.doesNotMatch(offlineHtml, /Private account A/);

  for (const cache of worker.cacheStorage.stores.values()) {
    assert.equal(
      cache.entries.size,
      0,
      "navigation HTML must never be persisted",
    );
  }
});

test("does not precache HTML sign-in or error pages from static asset URLs", async () => {
  const worker = loadWorker(
    async (url) =>
      new Response(`<h1>Sign in at ${url}</h1>`, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
  );

  let installation = Promise.resolve();
  worker.listeners.get("install")({
    waitUntil(promise) {
      installation = promise;
    },
  });
  await installation;

  const cache = await worker.cacheStorage.open("xpenses-v7");
  assert.equal(cache.entries.size, 0);
});

test("activation deletes the prior worker's unsafe navigation cache", async () => {
  const worker = loadWorker(async () => new Response("fixture"));
  const oldCache = await worker.cacheStorage.open("xpenses-v6");
  await oldCache.put("/dashboard", new Response("Private account A"));
  await oldCache.put("/offline-shell", new Response("Private account A"));

  let activation = Promise.resolve();
  worker.listeners.get("activate")({
    waitUntil(promise) {
      activation = promise;
    },
  });
  await activation;

  assert.deepEqual(await worker.cacheStorage.keys(), []);
});

test("does not persist private responses reached through navigation", async () => {
  const worker = loadWorker(
    async () => new Response("Private API response", { status: 200 }),
  );

  await dispatchFetch(worker, request("/api/private", { mode: "navigate" }));
  await dispatchFetch(
    worker,
    request("/_next/data/build/private.json", { mode: "navigate" }),
  );

  for (const cache of worker.cacheStorage.stores.values()) {
    assert.equal(
      cache.entries.size,
      0,
      "private navigation responses must not be cached",
    );
  }
});

test("does not cache HTML responses even at static-looking asset URLs", async () => {
  const worker = loadWorker(
    async () =>
      new Response("<h1>Private rendered page</h1>", {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private",
        },
      }),
  );

  const response = await dispatchFetch(
    worker,
    request("/_next/static/chunks/app.js", {
      destination: "script",
    }),
  );
  assert.match(await response.text(), /Private rendered page/);

  const cache = await worker.cacheStorage.open("xpenses-v7");
  assert.equal(cache.entries.size, 0);
});

test("does not intercept ordinary API or React Server Component requests", async () => {
  const worker = loadWorker(async () => new Response("Private payload"));

  const apiResponse = await dispatchFetch(worker, request("/api/private"));
  const rscResponse = await dispatchFetch(
    worker,
    request("/expenses", {
      headers: { RSC: "1", "Next-Router-State-Tree": "fixture" },
    }),
  );

  assert.equal(apiResponse, undefined);
  assert.equal(rscResponse, undefined);
  assert.equal(worker.cacheStorage.stores.size, 0);
});

test("does not intercept arbitrary same-origin style or font destinations", async () => {
  let fetchCalls = 0;
  const worker = loadWorker(async () => {
    fetchCalls += 1;
    return new Response("Private theme asset");
  });

  const styleResponse = await dispatchFetch(
    worker,
    request("/account/theme.css", { destination: "style" }),
  );
  const fontResponse = await dispatchFetch(
    worker,
    request("/account/font.woff2", { destination: "font" }),
  );

  assert.equal(styleResponse, undefined);
  assert.equal(fontResponse, undefined);
  assert.equal(fetchCalls, 0);
  assert.equal(worker.cacheStorage.stores.size, 0);
});

test("continues to cache static assets for offline use", async () => {
  let online = true;
  const worker = loadWorker(async () => {
    if (!online) throw new TypeError("fixture network unavailable");
    return new Response("static fixture asset", {
      headers: { "Content-Type": "text/javascript; charset=utf-8" },
    });
  });
  const assetRequest = request("/_next/static/chunks/app.js", {
    destination: "script",
  });

  const onlineResponse = await dispatchFetch(worker, assetRequest);
  assert.equal(await onlineResponse.text(), "static fixture asset");
  online = false;

  const offlineResponse = await dispatchFetch(worker, assetRequest);
  assert.equal(await offlineResponse.text(), "static fixture asset");
});

test("continues to cache styles and fonts from Next static paths", async () => {
  const worker = loadWorker(async (request) => {
    const url = typeof request === "string" ? request : request.url;
    return new Response(`static fixture asset: ${new URL(url).pathname}`);
  });

  const stylesResponse = await dispatchFetch(
    worker,
    request("/_next/static/css/app.css", { destination: "style" }),
  );
  const fontsResponse = await dispatchFetch(
    worker,
    request("/_next/static/media/app.woff2", { destination: "font" }),
  );

  assert.match(await stylesResponse.text(), /static fixture asset/);
  assert.match(await fontsResponse.text(), /static fixture asset/);
  const cache = await worker.cacheStorage.open("xpenses-v7");
  assert.equal(cache.entries.size, 2);
});
