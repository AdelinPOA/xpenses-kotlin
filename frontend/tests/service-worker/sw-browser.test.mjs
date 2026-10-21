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
const publicFiles = {
  "/offline/index.v9.html": [
    "text/html; charset=utf-8",
    "../../public/offline/index.v9.html",
  ],
  "/offline/workspace.v9.js": [
    "text/javascript; charset=utf-8",
    "../../public/offline/workspace.v9.js",
  ],
  "/offline/workspace.v9.css": [
    "text/css; charset=utf-8",
    "../../public/offline/workspace.v9.css",
  ],
  "/offline/messages.v9.json": [
    "application/json; charset=utf-8",
    "../../public/offline/messages.v9.json",
  ],
};

async function serveFixture(
  request,
  response,
  sessionExpired,
  serviceWorkerSource,
) {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  response.setHeader("Cache-Control", "no-store");

  if (pathname === "/sw.js") {
    response.setHeader("Content-Type", "application/javascript; charset=utf-8");
    response.end(serviceWorkerSource);
    return;
  }
  if (/^\/offline\/workspace\.v10\.js$/.test(pathname)) {
    response.statusCode = 404;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><h1>Missing required dependency</h1>");
    return;
  }
  const v10Path = pathname.match(
    /^\/offline\/(index|workspace|messages)\.v10\.(html|js|css|json)$/,
  )
    ? pathname.replace("v10", "v9")
    : null;
  if (publicFiles[pathname] || (v10Path && publicFiles[v10Path])) {
    const [contentType, relativePath] =
      publicFiles[pathname] ?? publicFiles[v10Path];
    response.setHeader("Cache-Control", "public, max-age=0");
    response.setHeader("Content-Type", contentType);
    let body = await readFile(new URL(relativePath, import.meta.url));
    if (v10Path) {
      body = Buffer.from(
        body
          .toString()
          .replaceAll("v9", "v10")
          .replace('"shellVersion": 9', '"shellVersion": 10'),
      );
    }
    response.end(body);
    return;
  }
  if (pathname === "/manifest.json") {
    response.setHeader("Cache-Control", "public, max-age=0");
    response.setHeader("Content-Type", "application/manifest+json");
    response.end("{}");
    return;
  }
  if (pathname.startsWith("/icons/") || pathname.startsWith("/favicon")) {
    response.setHeader("Cache-Control", "public, max-age=0");
    response.setHeader("Content-Type", "image/png");
    response.end(Buffer.from([137, 80, 78, 71]));
    return;
  }

  response.setHeader("Content-Type", "text/html; charset=utf-8");
  if (pathname === "/server-error") {
    response.statusCode = 503;
    response.end("<!doctype html><h1>Private upstream error body</h1>");
    return;
  }
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
    response.end("<!doctype html><h1>Private API account A response</h1>");
    return;
  }
  if (pathname === "/_next/data/build/private.json") {
    response.end("<!doctype html><h1>Private Next account A response</h1>");
    return;
  }
  response.end(
    "<!doctype html><title>Service worker fixture</title><h1>Isolated local fixture</h1>",
  );
}

test("upgrades from legacy private navigation caches to a generic offline workspace", async (t) => {
  let sessionExpired = false;
  let servedWorkerSource = legacyWorkerSource;
  const server = createServer((request, response) => {
    void serveFixture(request, response, sessionExpired, servedWorkerSource);
  });
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
    await page.getByText("Private account A expense details").waitFor();
    await page.waitForFunction(async () => {
      const legacyCache = await caches.open("xpenses-v6");
      return Boolean(await legacyCache.match("/offline-shell"));
    });

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
      return names.includes("xpenses-v9") && !names.includes("xpenses-v6");
    });

    await page.goto(`${baseUrl}/api/private`);
    await page.goto(`${baseUrl}/_next/data/build/private.json`);
    sessionExpired = true;
    const expiredResponse = await page.goto(`${baseUrl}/dashboard`);
    assert.equal(expiredResponse?.status(), 401);
    await page.getByText("Sign in required").waitFor();

    // A failed v10 install must leave the already working v9 worker and cache intact.
    servedWorkerSource = workerSource.toString().replaceAll("v9", "v10");
    const failedInstallState = page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const failed = new Promise((resolve) => {
        registration.addEventListener(
          "updatefound",
          () => {
            const candidate = registration.installing;
            candidate?.addEventListener("statechange", () => {
              if (candidate.state === "redundant") resolve(candidate.state);
            });
          },
          { once: true },
        );
      });
      await registration.update();
      return failed;
    });
    assert.equal(await failedInstallState, "redundant");
    const cacheNames = await page.evaluate(() => caches.keys());
    assert.ok(cacheNames.includes("xpenses-v9"));
    assert.equal(cacheNames.includes("xpenses-v10"), false);
    servedWorkerSource = workerSource;

    const serverErrorFallback = await page.goto(`${baseUrl}/server-error`);
    assert.equal(serverErrorFallback?.status(), 200);
    const fallbackBody = await page.locator("body").innerText();
    assert.match(fallbackBody, /Offline workspace/);
    assert.doesNotMatch(fallbackBody, /Private upstream error body/);

    await context.setOffline(true);
    const offlineResponse = await page.goto(`${baseUrl}/expenses`, {
      timeout: 10000,
    });
    assert.equal(offlineResponse?.status(), 200);
    await page.getByRole("heading", { name: "Offline workspace" }).waitFor();
    await page
      .locator("#notice")
      .getByText(/No offline workspace is available/)
      .waitFor();
    const offlineText = await page.locator("body").innerText();
    assert.doesNotMatch(offlineText, /Private account A/);
    const apiUnavailable = await page.evaluate(async () => {
      try {
        await fetch("/api/private");
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(
      apiUnavailable,
      true,
      "API remains network-only while the shell loads offline",
    );

    const cachedPaths = await page.evaluate(async () => {
      const paths = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys())
          paths.push(new URL(request.url).pathname);
      }
      return paths.sort();
    });
    assert.equal(cachedPaths.includes("/dashboard"), false);
    assert.equal(cachedPaths.includes("/offline-shell"), false);
    assert.equal(cachedPaths.includes("/api/private"), false);
    assert.equal(cachedPaths.includes("/_next/data/build/private.json"), false);
    assert.ok(cachedPaths.includes("/offline/index.v9.html"));
    assert.ok(cachedPaths.includes("/offline/workspace.v9.js"));
    assert.ok(
      cachedPaths.every(
        (path) =>
          path.startsWith("/offline/") ||
          [
            "/manifest.json",
            "/favicon.ico",
            "/favicon-32x32.png",
            "/icons/icon-192x192.png",
            "/icons/icon-512x512.png",
            "/icons/apple-touch-icon-180x180.png",
          ].includes(path),
      ),
    );
  } finally {
    await context.close();
  }
});
