"use client";

/**
 * IndexedDB-backed offline draft queue for expenses.
 *
 * Background Sync API is unsupported in Safari/iOS PWAs, so syncing is
 * driven at app level (see OfflineSyncProvider): on `online`,
 * `visibilitychange` and after login.
 *
 * Queued items are ALWAYS created as new expenses on the server (never
 * PATCHed), which sidesteps edit conflicts entirely.
 */

export interface PendingReceipt {
  name: string;
  type: string;
  /** Structured-cloneable — stored directly in IDB. */
  blob: Blob;
}

export interface PendingExpense {
  id: string;
  userId?: number;
  /** POST /expenses body. */
  payload: Record<string, unknown>;
  receipts: PendingReceipt[];
  createdAt: number;
  /** Set when the server rejected the payload (permanent, needs attention). */
  error?: string;
}

const DB_NAME = "xpenses-offline";
const DB_VERSION = 1;
const STORE = "pending_expenses";

/** Rough client-side safety cap — receipts are pre-compressed (1600px JPEG). */
export const MAX_QUEUE_SIZE = 20;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function enqueueExpense(
  payload: Record<string, unknown>,
  receipts: PendingReceipt[],
  userId?: number
): Promise<PendingExpense> {
  const item: PendingExpense = {
    id: crypto.randomUUID(),
    userId,
    payload,
    receipts,
    createdAt: Date.now(),
  };
  await withStore("readwrite", (store) => store.put(item) as unknown as IDBRequest<undefined>);
  return item;
}

export async function updateExpense(item: PendingExpense): Promise<void> {
  await withStore("readwrite", (store) => store.put(item) as unknown as IDBRequest<undefined>);
}

export async function removePendingExpense(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id) as unknown as IDBRequest<undefined>);
}

export async function listPendingExpenses(userId?: number): Promise<PendingExpense[]> {
  const items = await withStore<PendingExpense[]>("readonly", (store) => store.getAll());
  // If userId is specified, only return items belonging to that user.
  // Unowned legacy items (without userId) are quarantined and not auto-synced by other users.
  const filtered = userId !== undefined
    ? items.filter((i) => i.userId === userId)
    : items;
  // Oldest first — deterministic sync order.
  return filtered.sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPendingExpenses(userId?: number): Promise<number> {
  const items = await listPendingExpenses(userId);
  return items.length;
}
