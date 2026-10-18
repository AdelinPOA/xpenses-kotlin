import { expect, test } from "@playwright/test";
import {
  syncPendingExpenses,
  type ExpenseTransport,
  type PendingExpenseStore,
} from "../../lib/expenseSaving";
import type { Expense } from "../../lib/types/expense";
import type { PendingExpense } from "../../lib/offlineQueue";
import type { Page } from "@playwright/test";
import { setupCommonMocks, USERS } from "../shared/mocks";
import {
  AUTH_MARKER_FIELD,
  storedIdentityMatches,
  USER_STORAGE_KEY,
  type AuthProfileStorage,
} from "../../lib/authSession";

const OWNER_ID = 4;

const expense: Expense = {
  id: 81,
  category_id: null,
  category_name: null,
  report_id: null,
  amount_original: 12,
  currency_original: "EUR",
  amount_eur: 12,
  fx_rate: 1,
  fx_rate_manual: false,
  tax_amount: 0,
  tax_rate: null,
  tax_amount_eur: 0,
  date: "2026-10-18",
  description: "Offline purchase",
  merchant: "Example shop",
  receipt_path: null,
  receipts: [],
  status: "draft",
  created_at: "2026-10-18T12:00:00Z",
  updated_at: "2026-10-18T12:00:00Z",
};

function makeQueue() {
  let record: PendingExpense | null = {
    id: "queued-expense-a",
    userId: OWNER_ID,
    payload: { merchant: "Example shop", amount_original: 12 },
    receipts: [
      {
        name: "receipt.jpg",
        type: "image/jpeg",
        blob: new Blob(["offline photo bytes"], { type: "image/jpeg" }),
      },
    ],
    stage: "creation_pending",
    createdAt: 1,
    updatedAt: 1,
    attempts: 0,
    nextAttemptAt: 0,
  };
  let removeCalls = 0;
  let releaseCalls = 0;
  let updateCalls = 0;

  const store: PendingExpenseStore = {
    enqueue: async (_payload, _receipts, userId) => ({ ...record!, userId }),
    get: async () => record,
    list: async (userId) => (record?.userId === userId ? [record] : []),
    claim: async (id, userId) => {
      if (!record || record.id !== id || record.userId !== userId) return null;
      record = {
        ...record,
        leaseToken: "test-lease",
        leaseUntil: Date.now() + 30_000,
      };
      return record;
    },
    update: async (next) => {
      updateCalls++;
      record = next;
    },
    remove: async () => {
      removeCalls++;
      record = null;
    },
    retry: async () => record,
    renew: async () => record,
    release: async (item) => {
      releaseCalls++;
      record = { ...item, leaseToken: undefined, leaseUntil: undefined };
    },
  };

  return {
    store,
    get record() {
      return record;
    },
    get removeCalls() {
      return removeCalls;
    },
    get releaseCalls() {
      return releaseCalls;
    },
    get updateCalls() {
      return updateCalls;
    },
  };
}

const BROWSER_QUEUE_ID = "cross-tab-replay-a";

async function seedBrowserQueue(page: Page) {
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("xpenses-offline", 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("pending_expenses"))
          request.result.createObjectStore("pending_expenses", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction("pending_expenses", "readwrite");
    transaction.objectStore("pending_expenses").put({
      id,
      userId: 4,
      payload: { merchant: "Example shop", amount_original: 12 },
      receipts: [
        {
          name: "receipt.jpg",
          type: "image/jpeg",
          blob: new Blob(["retained A receipt bytes"], { type: "image/jpeg" }),
        },
      ],
      stage: "creation_pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0,
      nextAttemptAt: 0,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, BROWSER_QUEUE_ID);
}

async function readBrowserQueueSummary(page: Page) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("xpenses-offline", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction("pending_expenses", "readonly");
    const request = transaction.objectStore("pending_expenses").get(id);
    const item = await new Promise<Record<string, unknown> | undefined>(
      (resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    const receipts = item?.receipts as Array<{ blob?: Blob }> | undefined;
    return item
      ? {
          userId: item.userId,
          merchant: (item.payload as Record<string, unknown>)?.merchant,
          receiptBytes: receipts?.[0]?.blob?.size ?? 0,
          leaseToken: item.leaseToken ?? null,
        }
      : null;
  }, BROWSER_QUEUE_ID);
}

async function startDelayedBrowserReplay(page: Page) {
  let serverUser = USERS.user;
  let releaseResponse!: () => void;
  const createResponseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let createStarted = false;
  let createRouteFinished = false;
  let receiptUploads = 0;

  await setupCommonMocks(page, { role: "user" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: serverUser }),
  );
  await page.route("**/api/expenses", async (route, request) => {
    if (request.method() !== "POST") return route.fallback();
    createStarted = true;
    await createResponseGate;
    try {
      await route.fulfill({ status: 201, json: expense });
    } catch {
      // A cross-tab identity change may abort the in-flight fetch first.
    }
    createRouteFinished = true;
  });
  await page.route("**/api/expenses/*/receipts", async (route) => {
    receiptUploads++;
    await route.fulfill({ status: 201, json: [] });
  });
  await page.goto("/dashboard");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const profile = localStorage.getItem("xpenses_user_profile");
        return profile ? JSON.parse(profile).id : null;
      }),
    )
    .toBe(OWNER_ID);

  await seedBrowserQueue(page);
  await page.evaluate(() => {
    const timer = window.setInterval(
      () => window.dispatchEvent(new Event("online")),
      100,
    );
    window.setTimeout(() => window.clearInterval(timer), 10_000);
  });
  await expect.poll(() => createStarted, { timeout: 10_000 }).toBe(true);

  return {
    setServerUser: (nextUser: typeof USERS[keyof typeof USERS]) => {
      serverUser = nextUser;
    },
    releaseResponse: () => releaseResponse(),
    get createRouteFinished() {
      return createRouteFinished;
    },
    get receiptUploads() {
      return receiptUploads;
    },
  };
}

function makeSharedOwnerMarker() {
  let rawProfile: string | null = JSON.stringify({
    id: OWNER_ID,
    [AUTH_MARKER_FIELD]: "session-a",
  });
  const storage: AuthProfileStorage = {
    getItem: (key) => (key === USER_STORAGE_KEY ? rawProfile : null),
  };
  return {
    storage,
    setOwner(ownerId: number | null, marker?: string) {
      rawProfile =
        ownerId == null
          ? null
          : JSON.stringify({
              id: ownerId,
              [AUTH_MARKER_FIELD]: marker ?? `session-${ownerId}`,
            });
    },
    isOwnerCurrent(ownerId: number, marker: string) {
      return storedIdentityMatches(storage, ownerId, marker);
    },
  };
}

const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
test.beforeEach(() => {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
test.afterEach(() => {
  if (onlineDescriptor)
    Object.defineProperty(navigator, "onLine", onlineDescriptor);
  else delete (navigator as { onLine?: boolean }).onLine;
});

test("a changed shared owner marker prevents replay and retains the queued Expense", async () => {
  const queue = makeQueue();
  const sharedOwner = makeSharedOwnerMarker();
  sharedOwner.setOwner(55, "session-b");
  let createCalls = 0;
  const transport: ExpenseTransport = {
    createExpense: async () => {
      createCalls++;
      return expense;
    },
    uploadReceipts: async () => {},
  };

  const result = await syncPendingExpenses(OWNER_ID, {
    store: queue.store,
    transport,
    isSessionCurrent: () => sharedOwner.isOwnerCurrent(OWNER_ID, "session-a"),
  });

  expect(result.stoppedForAuth).toBe(true);
  expect(createCalls).toBe(0);
  expect(queue.record?.payload.merchant).toBe("Example shop");
  expect(queue.record?.receipts[0]?.blob.size).toBeGreaterThan(0);
  expect(queue.removeCalls).toBe(0);
});

async function finishReplayAfterSharedOwnerChange(
  changeOwner: (setOwner: (id: number | null, marker?: string) => void) => void,
) {
  const queue = makeQueue();
  const sharedOwner = makeSharedOwnerMarker();
  let signalCreateStarted!: () => void;
  let resolveCreate!: (created: Expense) => void;
  const createStarted = new Promise<void>((resolve) => {
    signalCreateStarted = resolve;
  });
  const createResponse = new Promise<Expense>((resolve) => {
    resolveCreate = resolve;
  });
  let uploadCalls = 0;
  const transport: ExpenseTransport = {
    createExpense: () => {
      signalCreateStarted();
      return createResponse;
    },
    uploadReceipts: async () => {
      uploadCalls++;
    },
  };

  const replay = syncPendingExpenses(OWNER_ID, {
    store: queue.store,
    transport,
    isSessionCurrent: () => sharedOwner.isOwnerCurrent(OWNER_ID, "session-a"),
  });
  await createStarted;
  changeOwner(sharedOwner.setOwner);
  resolveCreate(expense);
  const result = await replay;
  return { queue, result, uploadCalls };
}

test("a delayed A create response cannot upload or remove A's bytes after a second tab logs in as B", async () => {
  const { queue, result, uploadCalls } = await finishReplayAfterSharedOwnerChange(
    (setOwner) => setOwner(55, "session-b"),
  );

  expect(result.stoppedForAuth).toBe(true);
  expect(uploadCalls).toBe(0);
  expect(queue.updateCalls).toBe(0);
  expect(queue.removeCalls).toBe(0);
  expect(queue.releaseCalls).toBe(1);
  expect(queue.record?.userId).toBe(OWNER_ID);
  expect(queue.record?.payload.merchant).toBe("Example shop");
  expect(queue.record?.receipts[0]?.blob.size).toBeGreaterThan(0);
});

test("a delayed A create response cannot upload or remove A's bytes after a second tab logs out", async () => {
  const { queue, result, uploadCalls } = await finishReplayAfterSharedOwnerChange(
    (setOwner) => setOwner(null),
  );

  expect(result.stoppedForAuth).toBe(true);
  expect(uploadCalls).toBe(0);
  expect(queue.updateCalls).toBe(0);
  expect(queue.removeCalls).toBe(0);
  expect(queue.releaseCalls).toBe(1);
  expect(queue.record?.userId).toBe(OWNER_ID);
  expect(queue.record?.payload.merchant).toBe("Example shop");
  expect(queue.record?.receipts[0]?.blob.size).toBeGreaterThan(0);
});

test("two real tabs stop A replay when the second tab verifies login as B", async ({
  page,
  context,
}) => {
  const replay = await startDelayedBrowserReplay(page);
  const secondTab = await context.newPage();
  replay.setServerUser(USERS.manager);
  await setupCommonMocks(secondTab, { role: "manager" });
  await secondTab.setViewportSize({ width: 1280, height: 800 });
  await secondTab.goto("/dashboard");

  await expect
    .poll(() =>
      secondTab.evaluate(() => {
        const profile = localStorage.getItem("xpenses_user_profile");
        return profile ? JSON.parse(profile).id : null;
      }),
    )
    .toBe(USERS.manager.id);
  await expect(page.getByText(USERS.manager.display_name).first()).toBeVisible();

  replay.releaseResponse();
  await expect.poll(() => replay.createRouteFinished).toBe(true);
  await expect
    .poll(() => readBrowserQueueSummary(page))
    .toMatchObject({
      userId: OWNER_ID,
      merchant: "Example shop",
      receiptBytes: 24,
      leaseToken: null,
    });
  expect(replay.receiptUploads).toBe(0);
});

test("two real tabs retain A's queued receipt when the second tab logs out", async ({
  page,
  context,
}) => {
  const replay = await startDelayedBrowserReplay(page);
  const secondTab = await context.newPage();
  await setupCommonMocks(secondTab, { role: "user" });
  await secondTab.route("**/api/auth/logout", (route) =>
    route.fulfill({ status: 200, json: {} }),
  );
  await secondTab.setViewportSize({ width: 1280, height: 800 });
  await secondTab.goto("/dashboard");
  await expect(secondTab.getByRole("button", { name: /sign out/i })).toBeVisible();
  await secondTab.getByRole("button", { name: /sign out/i }).click();

  await expect
    .poll(() =>
      secondTab.evaluate(() => localStorage.getItem("xpenses_user_profile")),
    )
    .toBeNull();
  await expect(page).toHaveURL(/\/login/);

  replay.releaseResponse();
  await expect.poll(() => replay.createRouteFinished).toBe(true);
  await expect
    .poll(() => readBrowserQueueSummary(page))
    .toMatchObject({
      userId: OWNER_ID,
      merchant: "Example shop",
      receiptBytes: 24,
      leaseToken: null,
    });
  expect(replay.receiptUploads).toBe(0);
});
