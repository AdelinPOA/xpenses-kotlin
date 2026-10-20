const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");

function harness(seed = new Map()) {
  const records = new Map(seed);
  let openedVersion = null;
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
            delete: (id) => request(() => records.delete(id)),
          };
        },
      };
      return tx;
    },
  };
  const indexedDB = {
    open(_name, version) {
      openedVersion = version;
      const req = {};
      queueMicrotask(() => { req.result = db; req.onsuccess?.(); });
      return req;
    },
  };
  const filename = path.resolve(__dirname, "../../lib/ocrSourceQueue.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, indexedDB, Date, Promise, Error, crypto: { randomUUID } }, { filename });
  return { queue: exports, records, get openedVersion() { return openedVersion; } };
}
const source = () => ({ id: "source", userId: 7, name: "receipt.pdf", type: "application/pdf", data: new ArrayBuffer(8) });

test("accepted job ID survives release and re-claim; another owner cannot see or mutate it", async () => {
  const { queue: q } = harness();
  await q.enqueueOcrSource(source());
  const claimed = await q.claimOcrSource("source", 7);
  await q.acknowledgeOcrSource(claimed, 91);
  await q.releaseOcrSource(claimed);
  const restored = await q.claimOcrSource("source", 7);
  assert.equal(restored.remoteJobId, 91);
  assert.equal((await q.listOcrSources(8)).length, 0);
  assert.equal(await q.claimOcrSource("source", 8), null);
  await assert.rejects(q.acknowledgeOcrSource({ ...restored, userId: 8 }, 92), /claim was lost/);
});

test("heartbeat fences out a second tab until claim expires", async () => {
  const { queue: q } = harness();
  await q.enqueueOcrSource(source());
  const first = await q.claimOcrSource("source", 7);
  await q.renewOcrSource(first);
  assert.equal(await q.claimOcrSource("source", 7), null);
  const replacement = await q.claimOcrSource("source", 7, Date.now() + 60_000);
  assert.notEqual(replacement.leaseToken, first.leaseToken);
  await assert.rejects(q.acknowledgeOcrSource(first, 91), /claim was lost/);
});

test("upload intent and uncertainty survive release, and acceptance clears them", async () => {
  const { queue: q } = harness();
  await q.enqueueOcrSource(source());
  const claim = await q.claimOcrSource("source", 7);
  await q.markOcrSourceUpload(claim, "uploading");
  await q.renewOcrSource(claim);
  await q.releaseOcrSource(claim);
  const restored = await q.claimOcrSource("source", 7);
  assert.equal(restored.uploadState, "uploading");
  await q.markOcrSourceUpload(restored, "uncertain");
  await assert.rejects(q.markOcrSourceUpload({ ...restored, userId: 8 }, "rejected"), /claim was lost/);
  assert.equal((await q.listOcrSources(7))[0].uploadState, "uncertain");
  await q.acknowledgeOcrSource(restored, 91);
  assert.equal((await q.listOcrSources(7))[0].uploadState, undefined);
  await assert.rejects(q.markOcrSourceUpload(restored, "uploading"), /must resume/);
});

test("acknowledged source cannot be redirected to a replacement job", async () => {
  const { queue: q } = harness();
  await q.enqueueOcrSource(source());
  const claim = await q.claimOcrSource("source", 7);
  await q.acknowledgeOcrSource(claim, 91);
  await assert.rejects(q.acknowledgeOcrSource(claim, 92), /another job/);
  assert.equal((await q.listOcrSources(7))[0].remoteJobId, 91);
});

test("schema upgrade preserves legacy accepted sources and persists owner-scoped review edits", async () => {
  const legacy = { ...source(), createdAt: 10, updatedAt: 10, remoteJobId: 91 };
  const h = harness(new Map([["source", legacy]]));
  const { queue: q, records } = h;

  const restored = await q.findOcrSourceByExpenseId(7, 31);
  assert.equal(restored, null);
  const [listed] = await q.listOcrSources(7);
  assert.equal(listed.remoteJobId, 91);
  assert.equal(listed.data.byteLength, 8);

  const saved = await q.persistOcrReviewState("source", 7, {
    expenseId: 31,
    receiptId: 32,
    expenseVersion: 4,
    reviewValues: { amount: "12.50", currency: "EUR", date: "2026-10-20" },
    reviewSyncState: "local-only",
  }, 10);
  assert.ok(saved.updatedAt > 10);
  assert.equal((await q.findOcrSourceByExpenseId(7, 31)).reviewValues.amount, "12.50");
  assert.equal(await q.findOcrSourceByExpenseId(8, 31), null);
  assert.equal(records.get("source").remoteJobId, 91);
  assert.equal(h.openedVersion, 2);
});

test("recovered review-only records count toward the cap without inventing upload bytes", async () => {
  const { queue: q } = harness();
  const recovered = await q.createRecoveredOcrReview({
    userId: 7,
    remoteJobId: 91,
    expenseId: 31,
    receiptId: 32,
    expenseVersion: 4,
  });
  assert.equal(recovered.remoteJobId, 91);
  assert.equal(recovered.expenseId, 31);
  assert.equal(recovered.data, null);
  assert.equal((await q.findOcrSourceByExpenseId(7, 31)).id, recovered.id);
  assert.equal(await q.findOcrSourceByExpenseId(8, 31), null);
  await assert.rejects(
    q.persistOcrReviewState(recovered.id, 8, { reviewSyncState: "local-only" }),
    /not owned/,
  );
});
