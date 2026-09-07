"use client";

import api, { type Expense } from "@/lib/api";
import { compressImage } from "@/lib/ocrScan";
import {
  claimPendingExpense,
  enqueueExpense,
  getPendingExpense,
  listPendingExpenses,
  releasePendingExpense,
  renewPendingExpense,
  removePendingExpense,
  retryPendingExpense,
  updateExpense,
  type PendingExpense,
  type PendingExpenseErrorKind,
  type PendingReceipt,
} from "@/lib/offlineQueue";

export interface ExpenseTransport {
  createExpense(payload: Record<string, unknown>, signal?: AbortSignal): Promise<Expense>;
  uploadReceipts(expenseId: number, receipts: PendingReceipt[], signal?: AbortSignal): Promise<void>;
}

export interface PendingExpenseStore {
  enqueue(payload: Record<string, unknown>, receipts: PendingReceipt[], userId: number): Promise<PendingExpense>;
  get(id: string, userId?: number): Promise<PendingExpense | null>;
  list(userId: number): Promise<PendingExpense[]>;
  claim(id: string, userId: number, at?: number): Promise<PendingExpense | null>;
  update(item: PendingExpense, expectedLeaseToken?: string): Promise<void>;
  remove(id: string, userId?: number, expectedLeaseToken?: string): Promise<void>;
  retry(id: string, userId: number): Promise<PendingExpense | null>;
  renew(item: PendingExpense, at?: number): Promise<PendingExpense | null>;
  release(item: PendingExpense): Promise<void>;
}

const productionTransport: ExpenseTransport = {
  async createExpense(payload, signal) {
    const response = await api.post<Expense>("/expenses", payload, { signal });
    return response.data;
  },
  async uploadReceipts(expenseId, receipts, signal) {
    const formData = new FormData();
    receipts.forEach((receipt) => formData.append("files", receipt.blob, receipt.name));
    await api.post(`/expenses/${expenseId}/receipts`, formData, { signal });
  },
};

const productionStore: PendingExpenseStore = {
  enqueue: enqueueExpense,
  get: getPendingExpense,
  list: listPendingExpenses,
  claim: claimPendingExpense,
  update: updateExpense,
  remove: removePendingExpense,
  retry: retryPendingExpense,
  renew: renewPendingExpense,
  release: releasePendingExpense,
};

export interface ExpenseSavingDependencies {
  transport?: ExpenseTransport;
  store?: PendingExpenseStore;
  now?: () => number;
  signal?: AbortSignal;
}

interface ResolvedExpenseSavingDependencies {
  transport: ExpenseTransport;
  store: PendingExpenseStore;
  now: () => number;
  signal?: AbortSignal;
}

export type NewExpenseSaveResult =
  | { status: "queued"; item: PendingExpense; reason: "offline" | "retryable" | "auth" }
  | { status: "saved"; expense: Expense }
  | { status: "partial"; expense: Expense; item: PendingExpense }
  | { status: "failed"; item: PendingExpense; message: string };

export interface SyncResult {
  synced: number;
  stoppedForNetwork: boolean;
  stoppedForAuth: boolean;
}

const MAX_BACKOFF_MS = 5 * 60 * 1000;

function isBrowserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function responseStatus(error: unknown): number | undefined {
  const candidate = error as { response?: { status?: number }; status?: number } | null;
  return candidate?.response?.status ?? candidate?.status;
}

function errorMessage(error: unknown): string {
  const candidate = error as {
    response?: { data?: { detail?: string; message?: string } };
    message?: string;
  } | null;
  return candidate?.response?.data?.detail
    ?? candidate?.response?.data?.message
    ?? candidate?.message
    ?? "Expense could not be synchronized";
}

function isNetworkFailure(error: unknown): boolean {
  const candidate = error as { response?: unknown; code?: string; request?: unknown } | null;
  return !candidate?.response || candidate?.code === "ECONNABORTED" || Boolean(candidate?.request && !candidate?.response);
}

export interface ClassifiedFailure {
  kind: PendingExpenseErrorKind;
  message: string;
}

export function classifyExpenseFailure(error: unknown): ClassifiedFailure {
  const status = responseStatus(error);
  if (status === 401) return { kind: "auth", message: errorMessage(error) };
  if (status === 404 || status === 410 || status === 409) return { kind: "stale", message: errorMessage(error) };
  if (isNetworkFailure(error) || status === 408 || status === 425 || status === 429 || (status !== undefined && status >= 500)) {
    return { kind: "retryable", message: errorMessage(error) };
  }
  return { kind: "permanent", message: errorMessage(error) };
}

function nextAttemptAt(at: number, attempts: number): number {
  const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(Math.max(attempts - 1, 0), 8));
  return at + delay;
}

async function recordFailure(
  item: PendingExpense,
  error: unknown,
  dependencies: ResolvedExpenseSavingDependencies,
): Promise<{ item: PendingExpense; failure: ClassifiedFailure }> {
  const failure = classifyExpenseFailure(error);
  const timestamp = dependencies.now();
  const attempts = item.attempts + 1;
  const terminal = failure.kind === "permanent" || failure.kind === "stale";
  const updated: PendingExpense = {
    ...item,
    attempts,
    updatedAt: timestamp,
    nextAttemptAt: terminal ? 0 : nextAttemptAt(timestamp, attempts),
    error: terminal ? failure.message : undefined,
    errorKind: failure.kind,
    leaseToken: undefined,
    leaseUntil: undefined,
  };
  await dependencies.store.update(updated, item.leaseToken);
  return { item: updated, failure };
}

export async function prepareReceiptFiles(files: File[]): Promise<PendingReceipt[]> {
  return Promise.all(files.map(async (file) => {
    const blob = await compressImage(file);
    return { name: file.name, type: blob.type || file.type, blob };
  }));
}

function dependenciesFor(overrides: ExpenseSavingDependencies): ResolvedExpenseSavingDependencies {
  return {
    transport: overrides.transport ?? productionTransport,
    store: overrides.store ?? productionStore,
    now: overrides.now ?? Date.now,
    signal: overrides.signal,
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function withLeaseHeartbeat<T>(
  item: PendingExpense,
  dependencies: ResolvedExpenseSavingDependencies,
  operation: () => Promise<T>,
): Promise<T> {
  const heartbeat = setInterval(() => {
    void dependencies.store.renew(item, dependencies.now());
  }, 10_000);
  try {
    return await operation();
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Save one new Expense and its Receipt batch. The queue is created first so
 * online partial failures and offline captures use the same recovery path.
 */
export async function saveNewExpense(
  payload: Record<string, unknown>,
  files: File[],
  userId: number,
  overrides: ExpenseSavingDependencies = {},
): Promise<NewExpenseSaveResult> {
  const dependencies = dependenciesFor(overrides);
  const receipts = await prepareReceiptFiles(files);
  const queued = await dependencies.store.enqueue(payload, receipts, userId);
  const claimed = await dependencies.store.claim(queued.id, userId, dependencies.now());

  if (!claimed) return { status: "queued", item: queued, reason: "retryable" };
  if (!isBrowserOnline()) {
    await dependencies.store.release(claimed);
    return { status: "queued", item: claimed, reason: "offline" };
  }

  let expense: Expense;
  try {
    expense = await withLeaseHeartbeat(claimed, dependencies, () => {
      throwIfAborted(dependencies.signal);
      return dependencies.transport.createExpense(claimed.payload, dependencies.signal);
    });
  } catch (error) {
    const recorded = await recordFailure(claimed, error, dependencies);
    if (recorded.failure.kind === "permanent" || recorded.failure.kind === "stale") {
      return { status: "failed", item: recorded.item, message: recorded.failure.message };
    }
    return { status: "queued", item: recorded.item, reason: recorded.failure.kind === "auth" ? "auth" : "retryable" };
  }

  const withExpenseId: PendingExpense = {
    ...claimed,
    expenseId: expense.id,
    stage: "receipts_pending",
    updatedAt: dependencies.now(),
    error: undefined,
    errorKind: undefined,
    nextAttemptAt: 0,
  };
  throwIfAborted(dependencies.signal);
  await dependencies.store.update(withExpenseId, claimed.leaseToken);

  if (receipts.length === 0) {
    throwIfAborted(dependencies.signal);
    await dependencies.store.remove(withExpenseId.id, userId, withExpenseId.leaseToken);
    return { status: "saved", expense };
  }

  try {
    await withLeaseHeartbeat(withExpenseId, dependencies, () => {
      throwIfAborted(dependencies.signal);
      return dependencies.transport.uploadReceipts(expense.id, receipts, dependencies.signal);
    });
    throwIfAborted(dependencies.signal);
    await dependencies.store.remove(withExpenseId.id, userId, withExpenseId.leaseToken);
    return { status: "saved", expense };
  } catch (error) {
    const recorded = await recordFailure(withExpenseId, error, dependencies);
    return { status: "partial", expense, item: recorded.item };
  }
}

export async function syncPendingExpenses(
  userId: number,
  overrides: ExpenseSavingDependencies = {},
): Promise<SyncResult> {
  const dependencies = dependenciesFor(overrides);
  if (!isBrowserOnline()) return { synced: 0, stoppedForNetwork: true, stoppedForAuth: false };
  throwIfAborted(dependencies.signal);

  let synced = 0;
  let stoppedForNetwork = false;
  let stoppedForAuth = false;
  const items = await dependencies.store.list(userId);

  for (const listed of items) {
    if (dependencies.signal?.aborted) break;
    if (listed.error || listed.nextAttemptAt > dependencies.now()) continue;
    const item = await dependencies.store.claim(listed.id, userId, dependencies.now());
    if (!item) continue;

    let current = item;
    try {
      if (current.stage === "creation_pending") {
        const expense = await withLeaseHeartbeat(current, dependencies, () => {
          throwIfAborted(dependencies.signal);
          return dependencies.transport.createExpense(current.payload, dependencies.signal);
        });
        current = {
          ...current,
          expenseId: expense.id,
          stage: "receipts_pending",
          updatedAt: dependencies.now(),
          error: undefined,
          errorKind: undefined,
          nextAttemptAt: 0,
        };
        throwIfAborted(dependencies.signal);
        await dependencies.store.update(current, item.leaseToken);
      }

      if (current.expenseId === undefined || current.receipts.length === 0) {
        throwIfAborted(dependencies.signal);
        await dependencies.store.remove(current.id, userId, item.leaseToken);
        synced += 1;
        continue;
      }

      await withLeaseHeartbeat(current, dependencies, () => {
        throwIfAborted(dependencies.signal);
        return dependencies.transport.uploadReceipts(current.expenseId!, current.receipts, dependencies.signal);
      });
      throwIfAborted(dependencies.signal);
      await dependencies.store.remove(current.id, userId, item.leaseToken);
      synced += 1;
    } catch (error) {
      if (dependencies.signal?.aborted) {
        await dependencies.store.release(current).catch(() => undefined);
        break;
      }
      const recorded = await recordFailure(current, error, dependencies);
      if (recorded.failure.kind === "auth") {
        stoppedForAuth = true;
        break;
      }
      if (recorded.failure.kind === "retryable" && isNetworkFailure(error)) {
        stoppedForNetwork = true;
        break;
      }
    }
  }

  return { synced, stoppedForNetwork, stoppedForAuth };
}

export async function retryQueuedExpense(
  id: string,
  userId: number,
  overrides: ExpenseSavingDependencies = {},
): Promise<PendingExpense | null> {
  const dependencies = dependenciesFor(overrides);
  return dependencies.store.retry(id, userId);
}

export async function discardQueuedExpense(
  id: string,
  userId: number,
  overrides: ExpenseSavingDependencies = {},
): Promise<void> {
  const dependencies = dependenciesFor(overrides);
  await dependencies.store.remove(id, userId);
}
