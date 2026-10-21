import { test, expect } from "@playwright/test";
import { APP_ORIGIN, EXPENSES, setupAuthMocks } from "../shared/mocks";

test.describe("disabled immediate-review release gate", () => {
  test.skip(process.env.NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED !== "false", "Run with the release gate explicitly disabled");

  test("disabled capture performs no OCR recovery or upload, even with a queued source", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.context().addCookies([{ name: "lang", value: "en", url: APP_ORIGIN }]);
    let ocrRequests = 0;
    await page.route("**/api/ocr/**", (route) => { ocrRequests += 1; return route.fulfill({ json: [] }); });
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("xpenses-ocr-sources", 2);
        request.onupgradeneeded = () => request.result.createObjectStore("pending_sources", { keyPath: "id" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("pending_sources", "readwrite");
        tx.objectStore("pending_sources").put({ id: "queued", userId: 4, name: "queued.pdf", type: "application/pdf", data: new ArrayBuffer(8), createdAt: Date.now(), updatedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    await page.goto("/expenses/capture", { waitUntil: "networkidle" });
    await expect(page.getByText(/Receipt capture review is temporarily unavailable/i)).toBeVisible();
    expect(ocrRequests).toBe(0);
  });

  test("disabled gate keeps a pending Expense on the compatible edit form", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.context().addCookies([{ name: "lang", value: "en", url: APP_ORIGIN }]);
    await page.route("**/api/expenses/31", (route) => route.fulfill({ json: { ...EXPENSES[0], id: 31, status: "draft", verification_state: "PENDING", version: 7 } }));
    await page.goto("/expenses/31/edit", { waitUntil: "load" });
    await expect(page.getByLabel(/Amount/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Check the receipt details" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm Expense", exact: true })).toHaveCount(0);
  });
});
