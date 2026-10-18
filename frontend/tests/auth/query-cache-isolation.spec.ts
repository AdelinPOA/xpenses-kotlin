import { expect, test, type Page, type Route } from "@playwright/test";
import { EXPENSES, setupCommonMocks, USERS } from "../shared/mocks";

const CACHE_RECORD_KEY = "persisted_state";

async function seedExpenseCache(page: Page, ownerId: number | undefined, merchant: string) {
  const expense = { ...EXPENSES[0], merchant };
  await page.evaluate(async ({ ownerId, expense, recordKey }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("xpenses-cache", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("react_query", "readwrite");
      tx.objectStore("react_query").put({
        timestamp: Date.now(),
        ...(ownerId === undefined ? {} : { userId: ownerId }),
        state: {
          mutations: [],
          queries: [{
            dehydratedAt: Date.now(),
            queryKey: ["expenses", "list", { page: 0, size: 20 }],
            queryHash: '["expenses","list",{"page":0,"size":20}]',
            state: {
              data: [expense],
              dataUpdateCount: 1,
              dataUpdatedAt: Date.now(),
              error: null,
              errorUpdateCount: 0,
              errorUpdatedAt: 0,
              fetchFailureCount: 0,
              fetchFailureReason: null,
              fetchMeta: null,
              isInvalidated: false,
              status: "success",
              fetchStatus: "idle",
            },
          }],
        },
      }, recordKey);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }, { ownerId, expense, recordKey: CACHE_RECORD_KEY });
}

async function readPersistedOwner(page: Page): Promise<number | undefined> {
  return page.evaluate(async (recordKey) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("xpenses-cache", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const payload = await new Promise<{ userId?: number } | undefined>((resolve, reject) => {
      const tx = db.transaction("react_query", "readonly");
      const request = tx.objectStore("react_query").get(recordKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
    return payload?.userId;
  }, CACHE_RECORD_KEY);
}

async function setStoredUser(page: Page, user: (typeof USERS)[keyof typeof USERS]) {
  await page.evaluate((value) => localStorage.setItem("xpenses_user_profile", JSON.stringify(value)), user);
}

async function setup(page: Page, user: (typeof USERS)[keyof typeof USERS] = USERS.manager) {
  await setupCommonMocks(page, { role: "manager" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem("xpenses_user_profile");
    return raw ? JSON.parse(raw).id : null;
  })).toBe(user.id);
}

test.describe("authenticated query cache ownership", () => {
  test("rejects cache owned by another user before expense data is shown", async ({ page }) => {
    await setup(page, USERS.manager);
    await setStoredUser(page, USERS.mod);
    await seedExpenseCache(page, USERS.mod.id, "PRIVATE ACCOUNT A EXPENSE");

    await page.goto("/expenses");

    await expect(page.getByRole("heading", { name: /expenses/i })).toBeVisible();
    await page.locator("[data-expense-row]:visible").first().waitFor();
    await expect(page.getByText("PRIVATE ACCOUNT A EXPENSE")).toHaveCount(0);
    await expect.poll(() => readPersistedOwner(page)).toBe(USERS.manager.id);
  });

  test("rejects legacy cache without an owner before expense data is shown", async ({ page }) => {
    await setup(page, USERS.manager);
    await setStoredUser(page, USERS.manager);
    await seedExpenseCache(page, undefined, "LEGACY PRIVATE EXPENSE");

    await page.goto("/expenses");

    await expect(page.getByRole("heading", { name: /expenses/i })).toBeVisible();
    await page.locator("[data-expense-row]:visible").first().waitFor();
    await expect(page.getByText("LEGACY PRIVATE EXPENSE")).toHaveCount(0);
  });

  test("repeated same-user visibility checks preserve the cached query", async ({ page }) => {
    let meRequests = 0;
    await setupCommonMocks(page, { role: "manager" });
    await page.route("**/api/auth/me", (route) => {
      meRequests++;
      return route.fulfill({ json: USERS.manager });
    });
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem("xpenses_user_profile");
      return raw ? JSON.parse(raw).id : null;
    })).toBe(USERS.manager.id);
    await setStoredUser(page, USERS.manager);
    await seedExpenseCache(page, USERS.manager.id, "SAME ACCOUNT CACHED EXPENSE");

    await page.goto("/expenses");
    const cachedExpense = page.locator("[data-expense-row]:visible").getByText("SAME ACCOUNT CACHED EXPENSE");
    await expect(cachedExpense.first()).toBeVisible();
    const before = meRequests;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => meRequests).toBeGreaterThan(before);
    await expect(cachedExpense.first()).toBeVisible();
    expect(await readPersistedOwner(page)).toBe(USERS.manager.id);
  });

  test("offline auth fallback restores the stored user's own cached expense", async ({ page }) => {
    await setup(page, USERS.manager);
    await setStoredUser(page, USERS.manager);
    await seedExpenseCache(page, USERS.manager.id, "OFFLINE CACHED EXPENSE");
    await page.route("**/api/auth/me", (route) => route.abort());
    await page.route("**/api/expenses**", (route) => route.abort());

    await page.goto("/expenses");

    const cachedExpense = page.locator("[data-expense-row]:visible").getByText("OFFLINE CACHED EXPENSE");
    await expect(cachedExpense.first()).toBeVisible();
    expect(await readPersistedOwner(page)).toBe(USERS.manager.id);
  });

  test("login initializes the persisted owner and stored profile despite an older /me response", async ({ page }) => {
    let finishMe!: () => void;
    const mePending = new Promise<void>((resolve) => { finishMe = resolve; });
    let heldMeRoute!: Route;
    await setupCommonMocks(page, { role: "manager" });
    await page.route("**/api/auth/me", async (route) => {
      heldMeRoute = route;
      await mePending;
      await route.fulfill({ json: USERS.mod });
    });
    await page.route("**/api/auth/login", (route) => route.fulfill({ json: USERS.manager }));
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect.poll(() => Boolean(heldMeRoute)).toBe(true);
    const username = page.locator('input[name="username"]');
    const password = page.locator('input[name="password"]');
    await username.fill(USERS.manager.username);
    await password.fill("password");
    await expect(username).toHaveValue(USERS.manager.username);
    await expect(password).toHaveValue("password");
    const loginRequest = page.waitForRequest((request) => request.url().includes("/api/auth/login"));
    await page.getByRole("button", { name: /sign in/i }).click();
    await loginRequest;
    await page.waitForURL("**/dashboard");

    finishMe();
    await expect.poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem("xpenses_user_profile");
      return raw ? JSON.parse(raw).id : null;
    })).toBe(USERS.manager.id);
    await expect(page.getByRole("heading", { name: "Manager Work Hub" })).toBeVisible();
    await expect.poll(() => readPersistedOwner(page), { timeout: 5000 }).toBe(USERS.manager.id);
    expect(heldMeRoute).toBeTruthy();
  });
});
