const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");

function harness() {
  const records = new Map();
  const db = {
    close() {},
    transaction() {
      let pending = 0;
      let aborted = false;
      const tx = {
        abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); },
        objectStore() {
          const request = (action) => {
            const req = {};
            pending++;
            queueMicrotask(() => {
              if (aborted) return;
              req.result = action();
              req.onsuccess?.();
              if (--pending === 0) queueMicrotask(() => { if (!aborted) tx.oncomplete?.(); });
            });
            return req;
          };
          return {
            get: (key) => request(() => records.get(key)),
            getAll: () => request(() => [...records.values()]),
            put: (value) => request(() => records.set(value.id, value)),
            delete: (key) => request(() => records.delete(key)),
          };
        },
      };
      return tx;
    },
  };
  const indexedDB = { open() { const req = {}; queueMicrotask(() => { req.result = db; req.onsuccess?.(); }); return req; } };
  const filename = path.resolve(__dirname, "../../lib/ocrSourceQueue.ts");
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, indexedDB, Date, Promise, Error, crypto: { randomUUID } }, { filename });
  return { queue: exports, records };
}

const source = {
  id: "capture-source",
  userId: 7,
  name: "receipt.pdf",
  type: "application/pdf",
  data: new ArrayBuffer(12),
  reportId: 44,
};

test("capture promotion keeps one accepted source and authoritative IDs until server verification", async () => {
  const { queue, records } = harness();
  await queue.enqueueOcrSource(source);
  let claim = await queue.claimOcrSource(source.id, source.userId);
  await queue.markOcrSourceUpload(claim, "uploading");
  await queue.acknowledgeOcrSource(claim, 91);
  await queue.releaseOcrSource(claim);
  claim = await queue.claimOcrSource(source.id, source.userId);
  assert.equal(claim.remoteJobId, 91);
  await queue.persistOcrReviewState(source.id, source.userId, {
    expenseId: 31,
    receiptId: 32,
    expenseVersion: 5,
    reportId: 44,
    reviewSyncState: "server-saved",
  });
  const promoted = await queue.findOcrSourceByExpenseId(source.userId, 31);
  assert.equal(promoted.remoteJobId, 91);
  assert.equal(promoted.receiptId, 32);
  assert.equal(promoted.data.byteLength, 12);
  assert.equal(promoted.reportId, 44);
  await queue.persistOcrReviewState(source.id, source.userId, {
    reviewSyncState: "server-saved",
    reviewError: undefined,
  });
  await queue.releaseOcrSource(claim);
  assert.equal(records.size, 1, "saved review remains resumable before confirmation");
  await queue.removeOcrSource(source.id, source.userId);
  assert.equal(records.size, 0, "source is removed only after the caller receives verification acknowledgement");
});

test("reloaded uncertain review retains its exact versioned request and owner fence", async () => {
  const { queue } = harness();
  const recovered = await queue.createRecoveredOcrReview({ userId: 7, expenseId: 31, receiptId: 32, expenseVersion: 5 });
  const operation = {
    key: "stable-review-key",
    navigateTo: "expenses",
    body: {
      expected_version: 5,
      confirm: true,
      values: { amount: 12.5, currency: "EUR", date: "2026-10-20", merchant: "Corrected Market" },
    },
  };
  await queue.persistOcrReviewState(recovered.id, 7, {
    reviewValues: {
      amount: "12.50", currency: "EUR", date: "2026-10-20", merchant: "Corrected Market",
      description: "", categoryId: "", taxAmount: "0", taxRate: "", manualFxRate: "", fxRateEditMode: false,
    },
    reviewSyncState: "uncertain",
    reviewOperation: operation,
  });
  const afterReload = (await queue.listOcrSources(7))[0];
  assert.deepEqual(JSON.parse(JSON.stringify(afterReload.reviewOperation)), operation);
  assert.equal(await queue.findOcrSourceByExpenseId(8, 31), null);
  await assert.rejects(queue.persistOcrReviewState(recovered.id, 8, { reviewOperation: undefined }), /not owned/);
});
