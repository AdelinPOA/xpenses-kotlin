import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { chromium } from "@playwright/test";

const workerSource = await readFile(
  new URL("../../public/sw.js", import.meta.url),
);
const legacyWorkerSource = `
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && response.status === 200) {
        const cache = await caches.open("xpenses-v6");
        cache.put(event.request, response.clone());
        cache.put("/offline-shell", response.clone());
      }
      return response;
    } catch {
      const cache = await caches.open("xpenses-v6");
      return await cache.match(event.request) || await cache.match("/offline-shell");
    }
  })());
});
`;

function serveFixture(
  request,
  response,
  sessionExpired = false,
  serviceWorkerSource = workerSource,
) {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  response.setHeader("Cache-Control", "no-store");

  if (pathname === "/sw.js") {
    response.setHeader("Content-Type", "application/javascript; charset=utf-8");
    response.end(serviceWorkerSource);
    return;
  }

  if (pathname.startsWith("/_next/static/")) {
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("Content-Type", "application/javascript; charset=utf-8");
    response.end("window.fixtureStaticAsset = true;");
    return;
  }
  if (pathname.startsWith("/icons/") || pathname.startsWith("/favicon")) {
    response.setHeader("Cache-Control", "public, max-age=604800");
    response.setHeader("Content-Type", "image/png");
    response.end("fixture icon");
    return;
  }
  if (pathname === "/manifest.json") {
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Content-Type", "application/manifest+json");
    response.end("{}");
    return;
  }

  response.setHeader("Content-Type", "text/html; charset=utf-8");
  if (pathname === "/dashboard") {
    if (sessionExpired) {
      response.statusCode = 401;
      response.end(
        "<!doctype html><title>Sign in</title><h1>Sign in required</h1>",
      );
      return;
    }
    response.end(
      "<!doctype html><title>Dashboard</title><h1>Private account A expense details</h1>",
    );
    return;
  }
  if (pathname === "/api/private") {
    response.end(
      "<!doctype html><title>Private API</title><h1>Private API account A response</h1>",
    );
    return;
  }
  if (pathname === "/_next/data/build/private.json") {
    response.end(
      "<!doctype html><title>Private Next data</title><h1>Private Next account A response</h1>",
    );
    return;
  }

  response.end(
    "<!doctype html><title>Service worker fixture</title><h1>Isolated local fixture</h1>",
  );
}

test("real service worker drops legacy navigation HTML and never restores it offline", async (t) => {
  let sessionExpired = false;
  let servedWorkerSource = legacyWorkerSource;
  const server = createServer((request, response) =>
    serveFixture(request, response, sessionExpired, servedWorkerSource),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await page.goto(`${baseUrl}/seed`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() =>
      navigator.serviceWorker.controller?.scriptURL.endsWith("/sw.js"),
    );

    await page.goto(`${baseUrl}/dashboard`);
    await assert.doesNotReject(() =>
      page.getByText("Private account A expense details").waitFor(),
    );
    await page.waitForFunction(async () => {
      const legacyCache = await caches.open("xpenses-v6");
      return Boolean(await legacyCache.match("/offline-shell"));
    });

    // Simulate an in-place deployment: the v6 worker is active, then serves v7.
    await page.evaluate(() => {
      window.legacyController = navigator.serviceWorker.controller;
    });
    servedWorkerSource = workerSource;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== window.legacyController,
    );
    await page.waitForFunction(async () => {
      const names = await caches.keys();
      return names.includes("xpenses-v7") && !names.includes("xpenses-v6");
    });

    await page.goto(`${baseUrl}/api/private`);
    await page.goto(`${baseUrl}/_next/data/build/private.json`);
    sessionExpired = true;
    const expiredResponse = await page.goto(`${baseUrl}/dashboard`);
    assert.equal(expiredResponse?.status(), 401);
    await page.getByText("Sign in required").waitFor();

    const cachedPrivateRoutes = await page.evaluate(async () => {
      const matches = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (
            [
              "/dashboard",
              "/offline-shell",
              "/api/private",
              "/_next/data/build/private.json",
            ].includes(new URL(request.url).pathname)
          ) {
            matches.push(new URL(request.url).pathname);
          }
        }
      }
      return matches;
    });

    await context.setOffline(true);
    const offlineResponse = await page.goto(`${baseUrl}/expenses`, {
      timeout: 10000,
    });
    const offlineHtml = await page.locator("body").innerText();
    assert.match(offlineHtml, /You are offline/);
    assert.doesNotMatch(offlineHtml, /Private account A/);
    assert.equal(offlineResponse?.status(), 503);
    assert.deepEqual(cachedPrivateRoutes, []);
    assert.deepEqual(await page.evaluate(() => caches.keys()), ["xpenses-v7"]);
  } finally {
    await context.close();
  }
});
