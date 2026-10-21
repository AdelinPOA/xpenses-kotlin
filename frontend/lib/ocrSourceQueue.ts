"use client";

/**
 * Owner-scoped IndexedDB storage for OCR sources captured while offline.
 * Sources remain available until the receipt-capture flow acknowledges them.
 */
export interface OcrReviewFormValues {
  amount: string;
  currency: string;
  date: string;
  merchant: string;
  description: string;
  categoryId: string;
  taxAmount: string;
  taxRate: string;
  manualFxRate: string;
  fxRateEditMode: boolean;
}

export interface OcrReviewRequestValues {
  amount?: number;
  currency?: string;
  date?: string;
  merchant?: string;
  description?: string;
  category_id?: number | null;
  clear_category?: boolean;
  tax_amount?: number;
  tax_rate?: number | null;
  fx_rate?: number;
  fx_rate_manual?: boolean;
}

export interface OcrReviewRequestBody {
  expected_version: number;
  confirm: boolean;
  values: OcrReviewRequestValues;
}

export interface PendingOcrReviewOperation {
  key: string;
  body: OcrReviewRequestBody;
  navigateTo?: "expenses" | "capture";
}

export interface PendingOcrJobActionOperation {
  action: "retry" | "complete_manually";
  key: string;
  body?: { values?: OcrReviewRequestValues };
}

export type OcrReviewSyncState =
  | "local-only"
  | "saving"
  | "server-saved"
  | "uncertain"
  | "conflict"
  | "error";

export interface PendingOcrSource {
  id: string;
  userId: number;
  name: string;
  type: string;
  /** Null for server-recovered reviews; only locally captured sources have bytes. */
  data: ArrayBuffer | null;
  createdAt: number;
  updatedAt: number;
  leaseToken?: string;
  leaseUntil?: number;
  /** Persisted as soon as upload acceptance is acknowledged. Never re-upload it. */
  remoteJobId?: number;
  /** A POST may already have reached the server. Only a known job ID permits resume. */
  uploadState?: "uploading" | "uncertain" | "rejected";
  reportId?: number;
  reportLinkStatus?: string;
  expenseId?: number;
  receiptId?: number;
  expenseVersion?: number;
  reviewValues?: OcrReviewFormValues;
  reviewSyncState?: OcrReviewSyncState;
  reviewOperation?: PendingOcrReviewOperation;
  jobActionOperation?: PendingOcrJobActionOperation;
  reviewError?: string;
}

export interface NewOcrSource {
  id: string;
  userId: number;
  name: string;
  type: string;
  data: ArrayBuffer;
  reportId?: number;
}

export interface RecoveredOcrReview {
  userId: number;
  remoteJobId?: number;
  expenseId?: number;
  receiptId?: number;
  expenseVersion?: number;
  reportId?: number;
  reportLinkStatus?: string;
}

const DB_NAME = "xpenses-ocr-sources";
const DB_VERSION = 2;
const STORE = "pending_sources";
const LEASE_DURATION_MS = 30_000;
const MAX_QUEUE_SIZE = 20;
const MAX_QUEUE_BYTES = 100 * 1024 * 1024;

function now(): number {
  return Date.now();
}

function createLeaseToken(): string {
  return crypto.randomUUID();
}

function normalizeSource(value: PendingOcrSource): PendingOcrSource {
  return {
    ...value,
    updatedAt: value.updatedAt ?? value.createdAt,
    leaseToken: value.leaseToken,
    leaseUntil: value.leaseUntil,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  action: (
    store: IDBObjectStore,
    setResult: (value: T) => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    void openDb()
      .then((db) => {
        let result!: T;
        let settled = false;
        const transaction = db.transaction(STORE, mode);
        const close = () => {
          try {
            db.close();
          } catch {
            // The database may already be closed by the browser.
          }
        };
        const fail = (error: unknown) => {
          if (settled) return;
          settled = true;
          try {
            transaction.abort();
          } catch {
            // The transaction may already be aborting.
          }
          close();
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          close();
          resolve(result);
        };
        transaction.onerror = () =>
          fail(transaction.error ?? new Error("IndexedDB transaction failed"));
        transaction.onabort = () =>
          fail(transaction.error ?? new Error("IndexedDB transaction aborted"));

        try {
          action(
            transaction.objectStore(STORE),
            (value) => {
              result = value;
            },
            fail,
          );
        } catch (error) {
          fail(error);
        }
      })
      .catch(reject);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return runTransaction<T>(mode, (store, setResult, fail) => {
    const request = fn(store);
    request.onsuccess = () => setResult(request.result);
    request.onerror = () =>
      fail(request.error ?? new Error("IndexedDB request failed"));
  });
}

function isValidUserId(userId: number | undefined): userId is number {
  return typeof userId === "number" && Number.isInteger(userId) && userId > 0;
}

/** Persist one OCR source before attempting a network request. */
export async function enqueueOcrSource(
  source: NewOcrSource,
): Promise<PendingOcrSource> {
  if (!isValidUserId(source.userId)) {
    throw new Error(
      "An authenticated Technician is required to queue an OCR source",
    );
  }

  const timestamp = now();
  const item: PendingOcrSource = {
    ...source,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await runTransaction<void>("readwrite", (store, _setResult, fail) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const items = (request.result as PendingOcrSource[]).map(normalizeSource);
      const current = items.find((existing) => existing.id === item.id);
      if (current && current.userId !== item.userId) {
        fail(new Error("OCR source ID is already owned by another account"));
        return;
      }
      const bytes = items.reduce((total, existing) => {
        return total + (existing.data?.byteLength ?? 0);
      }, 0);
      const totalBytes =
        bytes - (current?.data?.byteLength ?? 0) + source.data.byteLength;

      if (!current && items.length >= MAX_QUEUE_SIZE) {
        fail(
          new Error(
            `Offline OCR storage is limited to ${MAX_QUEUE_SIZE} sources`,
          ),
        );
        return;
      }
      if (totalBytes > MAX_QUEUE_BYTES) {
        fail(new Error("Offline OCR storage limit reached"));
        return;
      }

      const put = store.put(item);
      put.onerror = () =>
        fail(put.error ?? new Error("Could not queue OCR source"));
    };
    request.onerror = () =>
      fail(request.error ?? new Error("Could not inspect OCR source queue"));
  });

  return item;
}

/** Return only sources owned by the authenticated Technician. */
export async function listOcrSources(
  userId: number | undefined,
): Promise<PendingOcrSource[]> {
  if (!isValidUserId(userId)) return [];
  const ownerId = userId;
  const items = await withStore<PendingOcrSource[]>("readonly", (store) =>
    store.getAll(),
  );
  return items
    .map(normalizeSource)
    .filter((item) => item.userId === ownerId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Locate a promoted local record without crossing the authenticated owner boundary. */
export async function findOcrSourceByExpenseId(
  userId: number | undefined,
  expenseId: number,
): Promise<PendingOcrSource | null> {
  if (!isValidUserId(userId) || !Number.isSafeInteger(expenseId) || expenseId <= 0) return null;
  const items = await listOcrSources(userId);
  return items.find((item) => item.expenseId === expenseId) ?? null;
}

/** Persist review values and a retryable immutable operation before any network write. */
export async function persistOcrReviewState(
  id: string,
  userId: number | undefined,
  updates: Partial<Pick<PendingOcrSource,
    | "reportId" | "reportLinkStatus" | "expenseId" | "receiptId" | "expenseVersion"
    | "reviewValues" | "reviewSyncState" | "reviewOperation" | "jobActionOperation" | "reviewError"
  >>,
  expectedUpdatedAt?: number,
): Promise<PendingOcrSource> {
  if (!isValidUserId(userId)) throw new Error("Authenticated owner required");
  return runTransaction<PendingOcrSource>("readwrite", (store, setResult, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result
        ? normalizeSource(request.result as PendingOcrSource)
        : null;
      if (!current || current.userId !== userId) {
        fail(new Error("OCR review record is not owned by this account"));
        return;
      }
      if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) {
        fail(new Error("OCR review changed in another tab"));
        return;
      }
      const updated: PendingOcrSource = {
        ...current,
        ...updates,
        updatedAt: Math.max(now(), current.updatedAt + 1),
      };
      const put = store.put(updated);
      put.onsuccess = () => setResult(updated);
      put.onerror = () => fail(put.error ?? new Error("Could not save OCR review"));
    };
    request.onerror = () => fail(request.error ?? new Error("Could not read OCR review"));
  });
}

/** Create a metadata-only local record when recovering a server job after device storage loss. */
export async function createRecoveredOcrReview(
  recovered: RecoveredOcrReview,
): Promise<PendingOcrSource> {
  if (!isValidUserId(recovered.userId)) throw new Error("Authenticated owner required");
  return runTransaction<PendingOcrSource>("readwrite", (store, setResult, fail) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const items = (request.result as PendingOcrSource[]).map(normalizeSource);
      const existing = items.find((item) =>
        item.userId === recovered.userId &&
        ((recovered.expenseId !== undefined && item.expenseId === recovered.expenseId) ||
          (recovered.remoteJobId !== undefined && item.remoteJobId === recovered.remoteJobId)),
      );
      if (existing) {
        setResult(existing);
        return;
      }
      if (items.filter((item) => item.userId === recovered.userId).length >= MAX_QUEUE_SIZE) {
        fail(new Error(`Offline OCR storage is limited to ${MAX_QUEUE_SIZE} sources`));
        return;
      }
      const timestamp = now();
      const item: PendingOcrSource = {
        ...recovered,
        id: crypto.randomUUID(),
        name: "Recovered OCR review",
        type: "application/x-xpenses-ocr-review",
        data: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const put = store.put(item);
      put.onsuccess = () => setResult(item);
      put.onerror = () => fail(put.error ?? new Error("Could not recover OCR review"));
    };
    request.onerror = () => fail(request.error ?? new Error("Could not inspect OCR review queue"));
  });
}

/** Claim one source so two tabs cannot submit it simultaneously. */
export async function claimOcrSource(
  id: string,
  userId: number | undefined,
  at = now(),
): Promise<PendingOcrSource | null> {
  if (!isValidUserId(userId)) return null;
  return runTransaction<PendingOcrSource | null>(
    "readwrite",
    (store, setResult, fail) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const current = request.result
          ? normalizeSource(request.result as PendingOcrSource)
          : null;
        if (!current || current.userId !== userId) {
          setResult(null);
          return;
        }
        if (current.leaseUntil && current.leaseUntil > at) {
          setResult(null);
          return;
        }

        const claimed: PendingOcrSource = {
          ...current,
          leaseToken: createLeaseToken(),
          leaseUntil: at + LEASE_DURATION_MS,
          updatedAt: Math.max(at, current.updatedAt + 1),
        };
        const put = store.put(claimed);
        put.onsuccess = () => setResult(claimed);
        put.onerror = () =>
          fail(put.error ?? new Error("Could not claim OCR source"));
      };
      request.onerror = () =>
        fail(request.error ?? new Error("Could not claim OCR source"));
    },
  );
}

/** Persist acceptance under the same fenced claim used for upload. */
export async function acknowledgeOcrSource(
  source: PendingOcrSource,
  remoteJobId: number,
): Promise<void> {
  if (!Number.isSafeInteger(remoteJobId) || remoteJobId <= 0) {
    throw new Error("Invalid OCR job ID");
  }
  await updateClaimedSource(source, { remoteJobId, uploadState: undefined });
}

/** Commit transport intent before POST; preserve uncertainty across reload/tab handoff. */
export async function markOcrSourceUpload(
  source: PendingOcrSource,
  uploadState: NonNullable<PendingOcrSource["uploadState"]>,
): Promise<void> {
  await updateClaimedSource(source, { uploadState });
}

/** Keep the local upload/poll claim alive during long provider fallbacks. */
export async function renewOcrSource(source: PendingOcrSource): Promise<void> {
  await updateClaimedSource(source, {});
}

async function updateClaimedSource(
  source: PendingOcrSource,
  updates: Pick<PendingOcrSource, "remoteJobId" | "uploadState">,
): Promise<void> {
  if (!isValidUserId(source.userId) || !source.leaseToken) {
    throw new Error("OCR source claim required");
  }
  await runTransaction<void>("readwrite", (store, _setResult, fail) => {
    const request = store.get(source.id);
    request.onsuccess = () => {
      const current = request.result as PendingOcrSource | undefined;
      if (!current || current.userId !== source.userId || current.leaseToken !== source.leaseToken) {
        fail(new Error("OCR source claim was lost"));
        return;
      }
      if (updates.uploadState && current.remoteJobId) {
        fail(new Error("Accepted OCR source must resume its existing job"));
        return;
      }
      if (updates.remoteJobId && current.remoteJobId && current.remoteJobId !== updates.remoteJobId) {
        fail(new Error("OCR source already belongs to another job"));
        return;
      }
      const put = store.put({
        ...current, ...updates, updatedAt: Math.max(now(), current.updatedAt + 1), leaseUntil: now() + LEASE_DURATION_MS,
      });
      put.onerror = () => fail(put.error ?? new Error("Could not persist OCR acceptance"));
    };
    request.onerror = () => fail(request.error ?? new Error("Could not read OCR source"));
  });
}

/** Release a claim after a transient network failure or page unmount. */
export async function releaseOcrSource(
  source: PendingOcrSource,
  at = now(),
): Promise<void> {
  if (!isValidUserId(source.userId) || !source.leaseToken) return;
  await runTransaction<void>("readwrite", (store, _setResult, fail) => {
    const request = store.get(source.id);
    request.onsuccess = () => {
      const current = request.result
        ? normalizeSource(request.result as PendingOcrSource)
        : null;
      if (
        !current ||
        current.userId !== source.userId ||
        current.leaseToken !== source.leaseToken
      ) {
        return;
      }
      const put = store.put({
        ...current,
        leaseToken: undefined,
        leaseUntil: undefined,
        updatedAt: Math.max(at, current.updatedAt + 1),
      });
      put.onerror = () =>
        fail(put.error ?? new Error("Could not release OCR source"));
    };
    request.onerror = () =>
      fail(request.error ?? new Error("Could not release OCR source"));
  });
}

/** Explicit local discard is safe only when the server cannot own this source. */
export async function discardUnacceptedOcrSource(id: string, userId: number | undefined): Promise<void> {
  if (!isValidUserId(userId)) throw new Error("Authenticated owner required");
  await runTransaction<void>("readwrite", (store, _setResult, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const source = request.result as PendingOcrSource | undefined;
      if (!source) return;
      if (source.userId !== userId) return fail(new Error("Authenticated owner required"));
      if (source.leaseUntil && source.leaseUntil > now()) return fail(new Error("OCR source is in use"));
      if (source.remoteJobId || source.expenseId || source.reviewOperation || source.jobActionOperation) {
        return fail(new Error("Accepted work must be recovered, not discarded locally"));
      }
      if (source.uploadState === "uploading" || source.uploadState === "uncertain") {
        return fail(new Error("Resolve upload acceptance before discarding this source"));
      }
      const deletion = store.delete(id);
      deletion.onerror = () => fail(deletion.error ?? new Error("Could not discard OCR source"));
    };
    request.onerror = () => fail(request.error ?? new Error("Could not read OCR source"));
  });
}

/** Remove a source after explicit cancellation or acknowledged verification. */
export async function removeOcrSource(
  id: string,
  userId: number | undefined,
  expectedLeaseToken?: string,
  expectedUpdatedAt?: number,
): Promise<void> {
  if (!isValidUserId(userId)) return;
  await runTransaction<void>("readwrite", (store, _setResult, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result
        ? normalizeSource(request.result as PendingOcrSource)
        : null;
      if (!current || current.userId !== userId) return;
      if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) return;
      if (expectedLeaseToken && current.leaseToken !== expectedLeaseToken) {
        return;
      }
      if (
        !expectedLeaseToken &&
        current.leaseToken &&
        current.leaseUntil &&
        current.leaseUntil > now()
      ) {
        return;
      }
      const deletion = store.delete(id);
      deletion.onerror = () =>
        fail(deletion.error ?? new Error("Could not remove OCR source"));
    };
    request.onerror = () =>
      fail(request.error ?? new Error("Could not find OCR source"));
  });
}
