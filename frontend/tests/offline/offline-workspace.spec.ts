import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test.use({ serviceWorkers: "allow" });
test.skip(
  () => process.env.RUN_OFFLINE_WORKSPACE !== "1",
  "Real-app PWA test; run npm run test:offline-workspace (one local Next server, one Chromium worker)",
);

const APP_ORIGIN = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;
const OWNER_A = {
  id: 4,
  username: "offline-owner-a",
  display_name: "Owner A",
  role: "technician",
  email: "owner-a@example.test",
  is_active: true,
  auth_source: "local",
  language: "en",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};
const OWNER_B = {
  ...OWNER_A,
  id: 5,
  username: "offline-owner-b",
  display_name: "Owner B",
  email: "owner-b@example.test",
};

const CACHED_EXPENSE_A = {
  id: 901,
  category_id: null,
  category_name: "Travel",
  report_id: null,
  amount_original: 42.5,
  currency_original: "EUR",
  amount_eur: 42.5,
  fx_rate: 1,
  fx_rate_manual: false,
  tax_amount: 0,
  tax_rate: null,
  tax_amount_eur: 0,
  date: "2026-10-17",
  description: "Cached local trip",
  merchant: "Account A private hotel",
  receipt_path: null,
  receipts: [],
  status: "draft",
  created_at: "2026-10-17T00:00:00Z",
  updated_at: "2026-10-17T00:00:00Z",
};

const DASHBOARD = {
  total_month_eur: 42.5,
  draft_count: 1,
  submitted_count: 0,
  paid_count: 0,
  expense_count_total: 1,
  expense_count_month: 1,
  pending_approval_count: 0,
  pending_payment_count: 0,
  recent_expenses: [CACHED_EXPENSE_A],
  spend_by_category: [],
};

interface AppFixture {
  identity: typeof OWNER_A | typeof OWNER_B | null;
  networkAvailable: boolean;
  refreshRejected: boolean;
  authMeForbidden: boolean;
  expenseCreates: Array<Record<string, unknown>>;
  receiptUploads: number;
  ocrRequests: number;
}

function makeFixture(): AppFixture {
  return {
    identity: OWNER_A,
    networkAvailable: true,
    refreshRejected: false,
    authMeForbidden: false,
    expenseCreates: [],
    receiptUploads: 0,
    ocrRequests: 0,
  };
}

async function installApiFixtures(
  context: BrowserContext,
  fixture: AppFixture,
) {
  await context.route("**/api/**", async (route, request) => {
    if (!fixture.networkAvailable) {
      await route.abort("failed");
      return;
    }
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/me") {
      if (fixture.authMeForbidden) {
        await route.fulfill({ status: 403, json: { detail: "Forbidden" } });
      } else if (fixture.identity)
        await route.fulfill({ json: fixture.identity });
      else
        await route.fulfill({ status: 401, json: { detail: "Unauthorized" } });
      return;
    }
    if (pathname === "/api/auth/refresh") {
      if (fixture.refreshRejected) {
        await route.fulfill({
          status: 401,
          json: { detail: "Refresh rejected" },
        });
      } else {
        await route.fulfill({
          json: { access_token: "fixture-refreshed-token" },
        });
      }
      return;
    }
    if (pathname === "/api/dashboard") {
      const cachedExpense =
        fixture.identity?.id === OWNER_B.id
          ? {
              ...CACHED_EXPENSE_A,
              id: 902,
              merchant: "Account B private hotel",
            }
          : CACHED_EXPENSE_A;
      await route.fulfill({
        json: { ...DASHBOARD, recent_expenses: [cachedExpense] },
      });
      return;
    }
    if (pathname === "/api/settings/ui") {
      await route.fulfill({ json: { mobile_quick_add_fab_enabled: false } });
      return;
    }
    if (pathname === "/api/expenses" && request.method() === "POST") {
      fixture.expenseCreates.push(
        request.postDataJSON() as Record<string, unknown>,
      );
      await route.fulfill({
        json: {
          ...CACHED_EXPENSE_A,
          id: 1001 + fixture.expenseCreates.length,
          merchant: "Offline lunch A",
          amount_original: 19.75,
          currency_original: "EUR",
        },
      });
      return;
    }
    if (
      /^\/api\/expenses\/\d+\/receipts$/.test(pathname) &&
      request.method() === "POST"
    ) {
      fixture.receiptUploads++;
      await route.fulfill({ json: [] });
      return;
    }
    if (pathname.includes("/ocr/")) {
      fixture.ocrRequests++;
      await route.fulfill({
        status: 500,
        json: { detail: "OCR must not run offline" },
      });
      return;
    }
    if (pathname === "/api/fx/status") {
      await route.fulfill({
        json: {
          status: "HEALTHY",
          primary_provider: "BNR",
          active_source: "BNR",
          fallback_active: false,
          last_checked_at: "2026-11-20T18:00:00Z",
          primary_error: null,
          providers: [
            {
              provider: "BNR",
              priority: 1,
              healthy: true,
              active: true,
              is_primary: true,
              checked_at: "2026-11-20T18:00:00Z",
              source_date: "2026-11-20",
              ron_per_eur: 5.3482,
              latency_ms: 42,
              error: null,
            },
          ],
          last_db_rate: null,
        },
      });
      return;
    }
    if (pathname === "/api/fuel-prices/status") {
      await route.fulfill({
        json: {
          status: "HEALTHY",
          primary_provider: "PRETCARBURANT_LIVE",
          active_source: "PRETCARBURANT_LIVE",
          fallback_active: false,
          last_checked_at: "2026-11-20T20:00:00Z",
          primary_error: null,
          providers: [
            {
              provider: "PRETCARBURANT_LIVE",
              priority: 1,
              healthy: true,
              active: true,
              is_primary: true,
              checked_at: "2026-11-20T20:00:00Z",
              source_date: "2026-11-20",
              diesel_ron: 10.56,
              petrol_ron: 9.12,
              lpg_ron: 4.83,
              latency_ms: 45,
              error: null,
            },
          ],
          last_db_price: null,
        },
      });
      return;
    }
    await route.fulfill({ json: [] });
  });
}

async function addCookies(context: BrowserContext, owner = OWNER_A) {
  await context.addCookies([
    {
      name: "access_token",
      value: `fixture-access-${owner.id}`,
      url: APP_ORIGIN,
    },
    {
      name: "refresh_token",
      value: `fixture-refresh-${owner.id}`,
      url: APP_ORIGIN,
    },
  ]);
}

async function readPersistedOwner(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("xpenses-cache", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("react_query")) {
          request.result.createObjectStore("react_query");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<number | null>((resolve, reject) => {
      const transaction = db.transaction("react_query", "readonly");
      const request = transaction
        .objectStore("react_query")
        .get("persisted_state");
      let ownerId: number | null = null;
      request.onsuccess = () => {
        ownerId = request.result?.userId ?? null;
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(ownerId);
      };
      transaction.onerror = transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    });
  });
}

async function readQueuedItems(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("xpenses-offline", 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("pending_expenses")) {
          request.result.createObjectStore("pending_expenses", {
            keyPath: "id",
          });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<
      Array<{
        userId: number;
        payload: { merchant?: string };
        receipts: Array<{ name: string; size: number; type: string }>;
      }>
    >((resolve, reject) => {
      const transaction = db.transaction("pending_expenses", "readonly");
      const request = transaction.objectStore("pending_expenses").getAll();
      let items: Array<{
        userId: number;
        payload: { merchant?: string };
        receipts: Array<{ name: string; size: number; type: string }>;
      }> = [];
      request.onsuccess = () => {
        items = (request.result ?? []).map((item) => ({
          userId: item.userId,
          payload: item.payload,
          receipts: (item.receipts ?? []).map(
            (receipt: { name: string; type: string; blob: Blob }) => ({
              name: receipt.name,
              type: receipt.type,
              size: receipt.blob?.size ?? 0,
            }),
          ),
        }));
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(items);
      };
      transaction.onerror = transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    });
  });
}

async function prepareInstalledOwner(page: Page, fixture: AppFixture) {
  await installApiFixtures(page.context(), fixture);
  await addCookies(page.context());
  await page.goto(`${APP_ORIGIN}/dashboard`);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("xpenses_user_profile");
    return raw !== null && JSON.parse(raw).id === 4;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect.poll(() => readPersistedOwner(page)).toBe(4);
  await page.waitForFunction(async () =>
    Boolean(await caches.match("/offline/index.v9.html")),
  );
}

async function createStorageWriterTab(context: BrowserContext) {
  const writer = await context.newPage();
  await writer.goto(`${APP_ORIGIN}/offline/index.v9.html`);
  await expect(
    writer.getByRole("heading", { name: "Offline workspace" }),
  ).toBeVisible();
  return writer;
}

async function changeOwnerFromOtherTab(
  writer: Page,
  owner: typeof OWNER_B | null,
) {
  await writer.evaluate((nextOwner) => {
    if (nextOwner)
      localStorage.setItem("xpenses_user_profile", JSON.stringify(nextOwner));
    else localStorage.removeItem("xpenses_user_profile");
  }, owner);
  await writer.reload();
}

async function deleteQueueDatabase(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("xpenses-offline");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(new Error("Offline queue database is still open"));
      }),
  );
}

async function prepareQueueDatabase(page: Page, withRecord = false) {
  await page.evaluate(
    (seed) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("xpenses-offline", 2);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("pending_expenses");
          if (seed)
            store.put(
              { id: "legacy-record", userId: 4, payload: {}, receipts: [] },
              "legacy-record",
            );
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      }),
    withRecord,
  );
}

async function reopenOfflineWithoutCookies(
  page: Page,
  fixture: AppFixture,
  clearQueue = false,
) {
  if (clearQueue) await deleteQueueDatabase(page);
  await page.close();
  await page.context().clearCookies();
  fixture.networkAvailable = false;
  await page.context().setOffline(true);
  const coldStart = await page.context().newPage();
  const response = await coldStart.goto(`${APP_ORIGIN}/dashboard`);
  expect(response?.status()).toBe(200);
  await expect(
    coldStart.getByRole("heading", { name: "Offline workspace" }),
  ).toBeVisible();
  await expect(coldStart.locator("#private-workspace")).toBeVisible();
  return coldStart;
}

async function createOfflineExpense(
  page: Page,
  merchant: string,
  includePhoto = true,
) {
  await page.locator("#amount").fill("19.75");
  await page.locator("#currency").selectOption("EUR");
  await page.locator("#date").fill("2026-10-18");
  await page.locator("#merchant").fill(merchant);
  await page.locator("#description").fill("Captured without a connection");
  if (includePhoto) {
    await page.locator("#receipt-photo").setInputFiles({
      name: "camera-receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pKcAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  }
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.locator("#notice")).toContainText("Saved on this device");
  await expect(page.locator("#offline-drafts")).toContainText(merchant);
}

async function verifyAccountIfPrompted(page: Page) {
  const button = page.locator("#check-account");
  if (await button.isVisible()) await button.click();
}

async function ownerProfileId(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("xpenses_user_profile");
    return raw ? (JSON.parse(raw)?.id ?? null) : null;
  });
}

test("installed app cold-starts offline without cookies, captures a durable photo draft, then verifies and syncs the same owner", async ({
  page,
}) => {
  const fixture = makeFixture();
  await prepareInstalledOwner(page, fixture);
  const offlinePage = await reopenOfflineWithoutCookies(page, fixture, true);

  await expect(offlinePage.locator("#cached-expenses")).toContainText(
    "Account A private hotel",
  );
  const cachedShell = await offlinePage.evaluate(async () =>
    (
      await (await caches.open("xpenses-v9")).match("/offline/index.v9.html")
    )?.text(),
  );
  expect(cachedShell).not.toContain("Account A private hotel");
  await createOfflineExpense(offlinePage, "Offline lunch A", true);

  const queued = await readQueuedItems(offlinePage);
  expect(queued).toHaveLength(1);
  expect(queued[0].userId).toBe(OWNER_A.id);
  expect(queued[0].payload.merchant).toBe("Offline lunch A");
  expect(queued[0].receipts[0].size).toBeGreaterThan(0);
  expect(
    await offlinePage.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("xpenses-offline", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const keyPath = db
        .transaction("pending_expenses", "readonly")
        .objectStore("pending_expenses").keyPath;
      db.close();
      return keyPath;
    }),
  ).toBe("id");
  expect(fixture.ocrRequests).toBe(0);

  await offlinePage.reload();
  await expect(offlinePage.locator("#offline-drafts")).toContainText(
    "Offline lunch A",
  );
  await expect(offlinePage.locator("#cached-expenses")).toContainText(
    "Account A private hotel",
  );

  fixture.networkAvailable = true;
  await addCookies(offlinePage.context());
  await offlinePage.context().setOffline(false);
  await verifyAccountIfPrompted(offlinePage);
  await expect(offlinePage.locator("#reconnect-link")).toBeVisible();
  await offlinePage.locator("#reconnect-link").click();
  await expect(offlinePage).toHaveURL(/\/dashboard\?offline=return/);
  await expect.poll(() => fixture.expenseCreates.length).toBe(1);
  await expect.poll(() => fixture.receiptUploads).toBe(1);
  await expect.poll(() => readQueuedItems(offlinePage)).toHaveLength(0);
  expect(fixture.expenseCreates[0].merchant).toBe("Offline lunch A");
  expect(fixture.ocrRequests).toBe(0);
});

test("cross-tab account changes clear the form and cancel a save paused in storage.persist", async ({
  page,
}) => {
  const fixture = makeFixture();
  await prepareInstalledOwner(page, fixture);
  const writer = await createStorageWriterTab(page.context());
  const offlinePage = await reopenOfflineWithoutCookies(page, fixture);
  await offlinePage.locator("#amount").fill("19.75");
  await offlinePage.locator("#date").fill("2026-10-18");
  await offlinePage.locator("#merchant").fill("Never relabel this A draft");
  await offlinePage.locator("#receipt-photo").setInputFiles({
    name: "camera-receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pKcAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await offlinePage.evaluate(() => {
    Object.defineProperty(navigator.storage, "persist", {
      configurable: true,
      value: () =>
        new Promise<boolean>((resolve) => {
          Object.defineProperty(window, "resolveOfflinePersist", {
            configurable: true,
            value: resolve,
          });
        }),
    });
  });
  await offlinePage
    .getByRole("button", { name: "Save on this device" })
    .click();
  await expect
    .poll(() =>
      offlinePage.evaluate(
        () =>
          typeof (window as Window & { resolveOfflinePersist?: unknown })
            .resolveOfflinePersist,
      ),
    )
    .toBe("function");
  await offlinePage.locator("#receipt-photo").dispatchEvent("click");

  await changeOwnerFromOtherTab(writer, OWNER_B);
  await expect(offlinePage.locator("#private-workspace")).toBeHidden();
  await expect(offlinePage.locator("#amount")).toHaveValue("");
  await expect(offlinePage.locator("#merchant")).toHaveValue("");
  await expect(offlinePage.locator("#receipt-photo")).toHaveValue("");
  await offlinePage.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("#receipt-photo")!;
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["late photo"], "late-photo.jpg", { type: "image/jpeg" }),
    );
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(offlinePage.locator("#receipt-photo")).toHaveValue("");
  await expect(offlinePage.locator("#photo-name")).toHaveText(
    "No photo selected",
  );
  await offlinePage.evaluate(() => {
    (
      window as Window & { resolveOfflinePersist?: (value: boolean) => void }
    ).resolveOfflinePersist?.(false);
  });
  await expect.poll(() => readQueuedItems(offlinePage)).toHaveLength(0);
  await expect(offlinePage.locator("body")).not.toContainText(
    "Never relabel this A draft",
  );
  await writer.close();
});

test("cross-tab logout clears the form and cancels a pending local save", async ({
  page,
}) => {
  const fixture = makeFixture();
  await prepareInstalledOwner(page, fixture);
  const writer = await createStorageWriterTab(page.context());
  const offlinePage = await reopenOfflineWithoutCookies(page, fixture);
  await offlinePage.locator("#amount").fill("7.50");
  await offlinePage.locator("#date").fill("2026-10-18");
  await offlinePage.locator("#merchant").fill("Draft canceled on logout");
  await offlinePage.evaluate(() => {
    Object.defineProperty(navigator.storage, "persist", {
      configurable: true,
      value: () =>
        new Promise<boolean>((resolve) => {
          Object.defineProperty(window, "resolveOfflinePersist", {
            configurable: true,
            value: resolve,
          });
        }),
    });
  });
  await offlinePage
    .getByRole("button", { name: "Save on this device" })
    .click();
  await expect
    .poll(() =>
      offlinePage.evaluate(
        () =>
          typeof (window as Window & { resolveOfflinePersist?: unknown })
            .resolveOfflinePersist,
      ),
    )
    .toBe("function");

  await changeOwnerFromOtherTab(writer, null);
  await expect(offlinePage.locator("#private-workspace")).toBeHidden();
  await expect(offlinePage.locator("#amount")).toHaveValue("");
  await expect(offlinePage.locator("#merchant")).toHaveValue("");
  await offlinePage.evaluate(() => {
    (
      window as Window & { resolveOfflinePersist?: (value: boolean) => void }
    ).resolveOfflinePersist?.(false);
  });
  await expect.poll(() => readQueuedItems(offlinePage)).toHaveLength(0);
  await expect(offlinePage.locator("body")).not.toContainText(
    "Draft canceled on logout",
  );
  await writer.close();
});

test("an empty incompatible queue schema is safely repaired without preventing capture", async ({
  page,
}) => {
  const fixture = makeFixture();
  await prepareInstalledOwner(page, fixture);
  await deleteQueueDatabase(page);
  await prepareQueueDatabase(page);
  const offlinePage = await reopenOfflineWithoutCookies(page, fixture);
  await createOfflineExpense(offlinePage, "Repaired empty queue", false);
  expect(
    await offlinePage.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("xpenses-offline", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const keyPath = db
        .transaction("pending_expenses", "readonly")
        .objectStore("pending_expenses").keyPath;
      db.close();
      return keyPath;
    }),
  ).toBe("id");
  await expect.poll(() => readQueuedItems(offlinePage)).toHaveLength(1);
});

test("manual capture rejects malformed dates, currencies, and receipt blobs before queueing", async ({
  page,
}) => {
  const fixture = makeFixture();
  await prepareInstalledOwner(page, fixture);
  const offlinePage = await reopenOfflineWithoutCookies(page, fixture);
  await offlinePage.locator("#amount").fill("12.50");
  await offlinePage.locator("#merchant").fill("Validation check");
  await offlinePage.evaluate(() => {
    const date = document.querySelector<HTMLInputElement>("#date")!;
    date.type = "text";
    date.value = "2026-02-30";
  });
  await offlinePage
    .getByRole("button", { name: "Save on this device" })
    .click();
  await expect(offlinePage.locator("#form-error")).toContainText(
    "Choose a valid expense date",
  );
  await expect.poll(() => readQueuedItems(offlinePage)).toHaveLength(0);

  await offlinePage.evaluate(() => {
    const date = document.querySelector<HTMLInputElement>("#date")!;
    date.type = "date";
    date.value = "2026-10-18";
    const currency = document.querySelector<HTMLSelectElement>("#currency")!;
    currency.add(new Option("Invalid", "EU"));
    currency.value = "EU";
  });
  await offlinePage
    .getByRole("button", { name: "Save on this device" })
    .click();
  await expect(offlinePage.locator("#form-error")).toContainText(
    "valid three-letter currency",
  );
  await expect.poll(() => readQueuedItems(offlinePage)).toHaveLength(0);

  await offlinePage.evaluate(() => {
    const currency = document.querySelector<HTMLSelectElement>("#currency")!;
    currency.value = "EUR";
  });
  await offlinePage.locator("#receipt-photo").setInputFiles({
    name: "receipt.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await offlinePage
    .getByRole("button", { name: "Save on this device" })
    .click();
  await expect(offlinePage.locator("#form-error")).toContainText(
    "Choose a readable receipt photo",
  );
  await expect.poll(() => readQueuedItems(offlinePage)).toHaveLength(0);
});

test("a nonempty incompatible queue is preserved and disables writes without breaking cached reads", async ({
  page,
}) => {
  const fixture = makeFixture();
  await prepareInstalledOwner(page, fixture);
  await deleteQueueDatabase(page);
  await prepareQueueDatabase(page, true);
  const offlinePage = await reopenOfflineWithoutCookies(page, fixture);
  await expect(offlinePage.locator("#cached-expenses")).toContainText(
    "Account A private hotel",
  );
  await expect(offlinePage.locator("#notice")).toContainText(
    "could not be read safely",
  );
  await expect(
    offlinePage.getByRole("button", { name: "Save on this device" }),
  ).toBeDisabled();
  expect(await readQueuedItems(offlinePage)).toHaveLength(1);
});

test("a mismatched online account cannot see or replay the prior owner's offline data", async ({
  page,
}) => {
  const fixture = makeFixture();
  await prepareInstalledOwner(page, fixture);
  const offlinePage = await reopenOfflineWithoutCookies(page, fixture);
  await createOfflineExpense(offlinePage, "Owner A private draft", false);

  fixture.identity = OWNER_B;
  fixture.networkAvailable = true;
  await addCookies(offlinePage.context(), OWNER_B);
  await offlinePage.context().setOffline(false);
  await verifyAccountIfPrompted(offlinePage);
  await expect(offlinePage.locator("#notice")).toContainText(
    "different account",
  );
  await expect(offlinePage.locator("#private-workspace")).toBeHidden();
  await expect(offlinePage.locator("body")).not.toContainText(
    "Account A private hotel",
  );
  await expect(offlinePage.locator("body")).not.toContainText(
    "Owner A private draft",
  );
  expect(fixture.expenseCreates).toHaveLength(0);

  await offlinePage.locator("#reconnect-link").click();
  await expect(offlinePage).toHaveURL(/\/dashboard\?offline=return/);
  await expect(offlinePage.locator("body")).toContainText(
    "Account B private hotel",
  );
  await expect(offlinePage.locator("body")).not.toContainText(
    "Account A private hotel",
  );
  await expect.poll(() => ownerProfileId(offlinePage)).toBe(OWNER_B.id);
  await expect.poll(() => fixture.expenseCreates.length).toBe(0);

  const queued = await readQueuedItems(offlinePage);
  expect(queued).toHaveLength(1);
  expect(queued[0].userId).toBe(OWNER_A.id);
  expect(queued[0].payload.merchant).toBe("Owner A private draft");
});

test("an auth-check 403 is unverifiable rather than a definitive login rejection", async ({
  page,
}) => {
  const fixture = makeFixture();
  await prepareInstalledOwner(page, fixture);
  const offlinePage = await reopenOfflineWithoutCookies(page, fixture);
  await createOfflineExpense(offlinePage, "Kept after auth-check 403", false);

  fixture.authMeForbidden = true;
  fixture.networkAvailable = true;
  await addCookies(offlinePage.context());
  await offlinePage.context().setOffline(false);
  await verifyAccountIfPrompted(offlinePage);
  await expect(offlinePage.locator("#notice")).toContainText(
    "Could not verify this account",
  );
  await expect(offlinePage.locator("#notice")).not.toContainText(
    "server requires a sign-in",
  );
  await expect(offlinePage.locator("#private-workspace")).toBeHidden();
  await expect.poll(() => ownerProfileId(offlinePage)).toBe(OWNER_A.id);
  const queued = await readQueuedItems(offlinePage);
  expect(queued).toHaveLength(1);
  expect(queued[0].userId).toBe(OWNER_A.id);
  expect(queued[0].payload.merchant).toBe("Kept after auth-check 403");
});

test("a definitive session rejection asks for login but keeps the local draft and receipt bytes", async ({
  page,
}) => {
  const fixture = makeFixture();
  await prepareInstalledOwner(page, fixture);
  const offlinePage = await reopenOfflineWithoutCookies(page, fixture);
  await createOfflineExpense(offlinePage, "Retained after expiry", true);

  fixture.identity = null;
  fixture.refreshRejected = true;
  fixture.networkAvailable = true;
  await addCookies(offlinePage.context());
  await offlinePage.context().setOffline(false);
  await verifyAccountIfPrompted(offlinePage);
  await expect(offlinePage.locator("#notice")).toContainText(
    "server requires a sign-in",
  );
  await expect(offlinePage.locator("#private-workspace")).toBeHidden();
  await offlinePage.locator("#reconnect-link").click();
  await expect(offlinePage).toHaveURL(/\/login/);
  await expect(
    offlinePage.getByRole("button", { name: /sign in/i }),
  ).toBeVisible();
  await expect.poll(() => ownerProfileId(offlinePage)).toBeNull();

  const queued = await readQueuedItems(offlinePage);
  expect(queued).toHaveLength(1);
  expect(queued[0].userId).toBe(OWNER_A.id);
  expect(queued[0].payload.merchant).toBe("Retained after expiry");
  expect(queued[0].receipts[0].size).toBeGreaterThan(0);
  expect(fixture.expenseCreates).toHaveLength(0);
});

test("an ownerless installation receives neutral guidance and no local account data", async ({
  page,
}) => {
  const fixture = makeFixture();
  fixture.identity = null;
  fixture.refreshRejected = true;
  await installApiFixtures(page.context(), fixture);
  await page.goto(`${APP_ORIGIN}/login`);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.waitForFunction(async () =>
    Boolean(await caches.match("/offline/index.v9.html")),
  );

  fixture.networkAvailable = false;
  await page.context().setOffline(true);
  const coldPage = await page.context().newPage();
  const response = await coldPage.goto(`${APP_ORIGIN}/dashboard`);
  expect(response?.status()).toBe(200);
  await expect(
    coldPage.getByRole("heading", { name: "Offline workspace" }),
  ).toBeVisible();
  await expect(coldPage.locator("#notice")).toContainText(
    "No offline workspace is available",
  );
  await expect(coldPage.locator("#private-workspace")).toBeHidden();
  await expect(coldPage.locator("body")).not.toContainText(
    "Account A private hotel",
  );
  await expect(coldPage.locator("#reconnect-link")).toBeHidden();
});
