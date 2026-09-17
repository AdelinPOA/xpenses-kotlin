import { test, expect, type Page } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks } from "../shared/mocks";

/**
 * Offline staged recovery:
 * save while offline → staged work lands in IndexedDB → going back online
 * creates the Expense once and then completes its Receipt batch.
 */

async function idbQueueItems(
  page: Page,
): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      // Omit the version so this helper follows schema migrations.
      const req = indexedDB.open("xpenses-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const items = await new Promise<Array<Record<string, unknown>>>(
      (resolve, reject) => {
        const tx = db.transaction("pending_expenses", "readonly");
        const request = tx.objectStore("pending_expenses").getAll();
        request.onsuccess = () =>
          resolve(request.result as Array<Record<string, unknown>>);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return items;
  });
}

async function idbQueueCount(page: Page): Promise<number> {
  return (await idbQueueItems(page)).length;
}

test.describe("Offline draft queue", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupAuthMocks(page, "user");
    await setupCommonMocks(page);
  });

  test("save offline queues the draft and syncs when back online", async ({
    page,
  }) => {
    let syncedPayload: { amount?: number; merchant?: string | null } | null =
      null;

    // LIFO: this more-specific route wins once registered.
    await page.route("**/api/expenses", async (route, req) => {
      if (req.method() === "POST") {
        syncedPayload = req.postDataJSON();
        await route.fulfill({
          status: 201,
          json: {
            id: 999,
            amount_original: syncedPayload?.amount ?? 0,
            currency_original: "EUR",
            amount_eur: syncedPayload?.amount ?? 0,
            fx_rate: 1,
            fx_rate_manual: false,
            tax_amount: 0,
            tax_rate: null,
            tax_amount_eur: 0,
            status: "draft",
            date: "2026-08-24",
            merchant: syncedPayload?.merchant ?? null,
            description: null,
            category_id: null,
            receipts: [],
            report_id: null,
            created_at: "2026-08-24T00:00:00Z",
            updated_at: "2026-08-24T00:00:00Z",
          },
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("/expenses/new", { waitUntil: "load" });
    await expect(page.locator("#expense-amount")).toBeVisible();

    // Go offline and save.
    await page.context().setOffline(true);
    // navigator.onLine propagates lazily to the renderer — wait for it,
    // otherwise the save takes the online path with a hung request.
    await expect
      .poll(() => page.evaluate(() => navigator.onLine), { timeout: 10000 })
      .toBe(false);
    await page.locator("#expense-amount").fill("42.5");
    await page.getByLabel("Merchant", { exact: true }).fill("Offline Shop");
    await page.getByRole("button", { name: /Create expense/i }).click();

    // While offline nothing must hit the network (the draft sits in IDB;
    // the redirect may land on a browser error page, so don't probe DOM).
    await page.waitForTimeout(2000);
    expect(syncedPayload).toBeNull();

    // Back online — reopen the app (the offline redirect landed on a
    // browser error page); mount-time sync loop POSTs the queued draft.
    await page.context().setOffline(false);
    await page.reload({ waitUntil: "load" });
    await expect
      .poll(() => syncedPayload, { timeout: 15000 })
      .toMatchObject({ amount: 42.5, merchant: "Offline Shop" });
    // (The "Synced N" toast is intentionally not asserted here: it can
    // expire during the reload+sync window above.)

    await expect.poll(() => idbQueueCount(page), { timeout: 10000 }).toBe(0);
  });

  test("reuses an acknowledged Expense when Receipt upload fails", async ({
    page,
  }) => {
    let createCount = 0;
    let receiptCount = 0;
    let allowReceiptRetry = false;

    await page.route("**/api/expenses", async (route, req) => {
      if (req.method() !== "POST") {
        await route.fallback();
        return;
      }
      createCount += 1;
      await route.fulfill({
        status: 201,
        json: {
          id: 999,
          amount_original: 42.5,
          currency_original: "EUR",
          amount_eur: 42.5,
          fx_rate: 1,
          fx_rate_manual: false,
          tax_amount: 0,
          tax_rate: null,
          tax_amount_eur: 0,
          status: "draft",
          date: "2026-08-24",
          merchant: "Receipt Shop",
          description: null,
          category_id: null,
          receipts: [],
          report_id: null,
          created_at: "2026-08-24T00:00:00Z",
          updated_at: "2026-08-24T00:00:00Z",
        },
      });
    });

    await page.route("**/api/expenses/999/receipts", async (route) => {
      receiptCount += 1;
      if (!allowReceiptRetry) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        status: 200,
        json: [
          { id: 1, file_path: "receipt.jpg", original_name: "receipt.jpg" },
        ],
      });
    });

    await page.goto("/expenses/new", { waitUntil: "load" });
    await expect(page.locator("#expense-amount")).toBeVisible();
    await page.locator("#expense-amount").fill("42.5");
    await page.getByLabel("Merchant", { exact: true }).fill("Receipt Shop");
    await page.locator('input[name="receipts"]').setInputFiles({
      name: "receipt.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("not-a-real-image"),
    });
    await page.getByRole("button", { name: /Create expense/i }).click();

    await expect(page).toHaveURL(/\/expenses\/999\/edit\?upload_failed=1/);
    await expect
      .poll(async () => {
        const [item] = await idbQueueItems(page);
        return item?.expenseId;
      })
      .toBe(999);
    expect(createCount).toBe(1);
    expect(receiptCount).toBeGreaterThanOrEqual(1);

    // Allow the provider's backoff timer to resume the Receipt stage without
    // issuing a second Expense creation.
    allowReceiptRetry = true;
    await expect
      .poll(() => receiptCount, { timeout: 15000 })
      .toBeGreaterThan(1);
    await expect.poll(() => idbQueueCount(page), { timeout: 10000 }).toBe(0);
    expect(createCount).toBe(1);
  });

  test("connection banner appears when offline with a queue and clears on reconnect", async ({
    page,
  }) => {
    await page.goto("/expenses/new", { waitUntil: "load" });
    await expect(page.locator("#expense-amount")).toBeVisible();

    await page.context().setOffline(true);
    await expect(
      page.getByText(/Offline — changes will sync automatically/i),
    ).toBeVisible();

    await page.context().setOffline(false);
    await expect(
      page.getByText(/Offline — changes will sync automatically/i),
    ).toBeHidden({ timeout: 10000 });
  });
});
