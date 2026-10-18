import { test, expect } from "@playwright/test";
import { setupCommonMocks } from "../shared/mocks";

async function seedPendingExpense(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("xpenses-offline", 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("pending_expenses")) {
          request.result.createObjectStore("pending_expenses", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const transaction = db.transaction("pending_expenses", "readwrite");
    const store = transaction.objectStore("pending_expenses");
    const now = Date.now();
    for (let index = 0; index < 20; index += 1) {
      store.put({
        id: `layout-regression-${index}`,
        userId: 4,
        payload: {},
        receipts: [],
        stage: "creation_pending",
        createdAt: now,
        updatedAt: now,
        attempts: 0,
        nextAttemptAt: now + 60_000,
      });
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  });
}

async function geometry(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const banner = document.querySelector<HTMLElement>("#connection-banner");
    const header = document.querySelector<HTMLElement>("#app-header")!;
    const main = document.querySelector<HTMLElement>("#main-content")!;
    const toast = document.querySelector<HTMLElement>('[data-testid="toast-container"]')!;
    return {
      bannerHeight: banner?.getBoundingClientRect().height ?? 0,
      bannerBottom: banner?.getBoundingClientRect().bottom ?? 0,
      measuredBannerHeight: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-banner-height")) || 0,
      headerTop: header.getBoundingClientRect().top,
      headerHeight: header.getBoundingClientRect().height,
      mainPaddingTop: parseFloat(getComputedStyle(main).paddingTop),
      toastTop: toast.getBoundingClientRect().top,
      viewportWidth: window.innerWidth,
    };
  });
}

test("connection banner keeps the header, page content, and toasts below it", async ({ page }) => {
  await setupCommonMocks(page, { role: "user" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/dashboard");
  await expect(page.locator("#main-content")).toBeVisible();
  const baseline = await geometry(page);

  await seedPendingExpense(page);
  await page.reload();

  const banner = page.locator("#connection-banner");
  await expect(banner).toContainText(/offline draft/i);
  await expect(banner).toContainText("20");

  const mobile = await geometry(page);
  expect(mobile.bannerHeight).toBeGreaterThan(0);
  expect(mobile.headerTop).toBeCloseTo(mobile.bannerBottom, 0);
  expect(mobile.mainPaddingTop).toBeGreaterThan(mobile.bannerHeight + mobile.headerHeight);
  expect(mobile.toastTop).toBeGreaterThan(mobile.bannerBottom + mobile.headerHeight - 1);

  await page.context().setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(banner).toContainText(/offline/i);

  await page.getByRole("button", { name: /open sidebar/i }).click();
  const closeButton = page.getByRole("button", { name: /close navigation/i });
  await expect(closeButton).toBeVisible();
  const closeBox = await closeButton.boundingBox();
  expect(closeBox).not.toBeNull();
  expect(closeBox!.y).toBeGreaterThanOrEqual(mobile.bannerBottom);
  const closeIsTopmost = await closeButton.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button;
  });
  expect(closeIsTopmost).toBe(true);
  await closeButton.click();

  // A wrapped banner must resize the shared offset, too.
  await banner.evaluate((node) => {
    node.textContent = "Offline — " + "pending draft needs attention. ".repeat(12);
  });
  await expect.poll(async () => (await geometry(page)).bannerHeight).toBeGreaterThan(mobile.bannerHeight);
  await expect.poll(async () => {
    const current = await geometry(page);
    return Math.abs(current.measuredBannerHeight - current.bannerHeight);
  }).toBeLessThanOrEqual(1);
  await expect.poll(async () => {
    const current = await geometry(page);
    return Math.abs(current.headerTop - current.bannerBottom);
  }).toBeLessThanOrEqual(1);
  const wrapped = await geometry(page);
  expect(wrapped.headerTop).toBeCloseTo(wrapped.bannerBottom, 0);
  expect(wrapped.toastTop).toBeGreaterThan(wrapped.bannerBottom + wrapped.headerHeight - 1);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => {
    const current = await geometry(page);
    return Math.abs(current.measuredBannerHeight - current.bannerHeight);
  }).toBeLessThanOrEqual(1);
  const landscape = await geometry(page);
  expect(landscape.headerTop).toBeCloseTo(landscape.bannerBottom, 0);
  expect(landscape.mainPaddingTop).toBeCloseTo(64 + landscape.bannerHeight, 0);
  expect(landscape.toastTop).toBeGreaterThan(landscape.bannerBottom + landscape.headerHeight);

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktop = await geometry(page);
  expect(desktop.mainPaddingTop).toBeGreaterThan(desktop.bannerHeight);
  expect(desktop.toastTop).toBeGreaterThanOrEqual(desktop.bannerHeight);
  await page.setViewportSize({ width: 375, height: 812 });

  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("xpenses-offline", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction("pending_expenses", "readwrite");
    transaction.objectStore("pending_expenses").clear();
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  });
  await page.context().setOffline(false);
  await expect(page.locator("#connection-banner")).toHaveCount(0);
  const cleared = await geometry(page);
  expect(cleared.measuredBannerHeight).toBe(0);
  expect(cleared.headerTop).toBe(0);
  expect(cleared.mainPaddingTop).toBeCloseTo(baseline.mainPaddingTop, 0);
  expect(cleared.toastTop).toBeCloseTo(baseline.toastTop, 0);

});
