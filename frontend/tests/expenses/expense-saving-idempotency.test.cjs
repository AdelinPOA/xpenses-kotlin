const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

// Exercise the real production transport and save/replay orchestration. Only
// the HTTP boundary and IndexedDB store are replaced with deterministic seams.
function harness(post) {
  const filename = path.resolve(__dirname, "../../lib/expenseSaving.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "@/lib/api") return { default: { post } };
      if (name === "@/lib/receiptCapture") return { compressImage: async file => file };
      if (name === "@/lib/offlineQueue") return {};
      throw new Error(`Unexpected module ${name}`);
    },
    FormData, DOMException, Date, Promise, setInterval, clearInterval,
  }, { filename });
  return exports;
}

function store() {
  const items = new Map();
  let sequence = 0;
  return {
    items,
    async enqueue(payload, receipts, userId) {
      const item = { id: `pending-${++sequence}`, userId, payload: structuredClone(payload), receipts,
        stage: "creation_pending", createdAt: 0, updatedAt: 0, attempts: 0, nextAttemptAt: 0 };
      items.set(item.id, item);
      return item;
    },
    async list(userId) { return [...items.values()].filter(item => item.userId === userId); },
    async get(id, userId) { const item = items.get(id); return item?.userId === userId ? item : null; },
    async claim(id, userId) {
      const item = items.get(id);
      if (!item || item.userId !== userId || item.leaseToken) return null;
      const claimed = { ...item, leaseToken: `lease-${id}`, leaseUntil: 30000 };
      items.set(id, claimed);
      return claimed;
    },
    async update(item, token) {
      assert.equal(items.get(item.id)?.leaseToken, token);
      items.set(item.id, { ...item });
    },
    async remove(id, userId, token) {
      assert.equal(items.get(id)?.userId, userId);
      assert.equal(items.get(id)?.leaseToken, token);
      items.delete(id);
    },
    async release(item) {
      const current = items.get(item.id);
      if (current?.leaseToken === item.leaseToken) items.set(item.id, { ...current, leaseToken: undefined, leaseUntil: undefined });
    },
    async renew(item) { return item; },
    async retry(id) { return items.get(id) ?? null; },
  };
}
const receipt = () => new File(["%PDF-test"], "receipt.pdf", { type: "application/pdf" });
const payload = { amount: 12.5, currency: "EUR", date: "2026-10-18" };
const keyOf = config => config.headers?.["Idempotency-Key"];

test("lost create response replays the persisted payload and creation key after module reload", async () => {
  const queue = store();
  const requests = [];
  let created = false;
  const post = async (url, body, config) => {
    requests.push({ url, body: structuredClone(body), config });
    if (!created) { created = true; throw new Error("response lost after commit"); }
    return { data: { id: 71 } };
  };
  const saved = await harness(post).saveNewExpense(payload, [], 9, { store: queue, now: () => 0 });
  assert.equal(saved.status, "queued");
  assert.equal(saved.item.stage, "creation_pending");
  const synced = await harness(post).syncPendingExpenses(9, { store: queue, now: () => 2000 });
  assert.equal(synced.synced, 1);
  assert.equal(queue.items.size, 0);
  assert.deepEqual(requests.map(request => keyOf(request.config)), ["pending-1:expense", "pending-1:expense"]);
  assert.deepEqual(requests.map(request => request.body), [payload, payload]);
});

test("lost receipt response retries the same receipt key and bytes without recreating the Expense", async () => {
  const queue = store();
  const requests = [];
  let attachments = 0;
  const post = async (url, body, config) => {
    requests.push({ url, body, config });
    if (url === "/expenses") return { data: { id: 71 } };
    if (++attachments === 1) throw new Error("receipt response lost after commit");
    return { data: [] };
  };
  const saved = await harness(post).saveNewExpense(payload, [receipt()], 9, { store: queue, now: () => 0 });
  assert.equal(saved.status, "partial");
  assert.equal(saved.item.expenseId, 71);
  const synced = await harness(post).syncPendingExpenses(9, { store: queue, now: () => 2000 });
  assert.equal(synced.synced, 1);
  assert.deepEqual(requests.map(request => request.url), ["/expenses", "/expenses/71/receipts", "/expenses/71/receipts"]);
  assert.deepEqual(requests.map(request => keyOf(request.config)), ["pending-1:expense", "pending-1:receipts", "pending-1:receipts"]);
  for (const request of requests.slice(1)) {
    const files = request.body.getAll("files");
    assert.equal(files.length, 1);
    assert.equal(files[0].name, "receipt.pdf");
    assert.equal(files[0].type, "application/pdf");
    assert.equal(await files[0].text(), "%PDF-test");
  }
});

test("distinct saves use distinct durable keys and preserve the optional signal position", async () => {
  const queue = store();
  const requests = [];
  const controller = new AbortController();
  const saving = harness(async (url, body, config) => {
    requests.push({ url, config });
    return { data: url === "/expenses" ? { id: requests.length } : [] };
  });
  await saving.saveNewExpense(payload, [receipt()], 9, { store: queue, signal: controller.signal });
  await saving.saveNewExpense(payload, [receipt()], 9, { store: queue, signal: controller.signal });
  assert.deepEqual(requests.map(request => keyOf(request.config)), ["pending-1:expense", "pending-1:receipts", "pending-2:expense", "pending-2:receipts"]);
  assert.ok(requests.every(request => request.config.signal === controller.signal));
});

test("session guard and owner filtering prevent replay under a changed or different account", async () => {
  const queue = store();
  await queue.enqueue(payload, [], 9);
  let posted = false;
  const saving = harness(async () => { posted = true; throw new Error("must not send"); });
  const stopped = await saving.syncPendingExpenses(9, { store: queue, isSessionCurrent: () => false });
  assert.equal(stopped.stoppedForAuth, true);
  assert.equal(posted, false);
  const other = await saving.syncPendingExpenses(10, { store: queue, isSessionCurrent: () => true });
  assert.equal(other.synced, 0);
  assert.equal(posted, false);
  assert.equal(queue.items.size, 1);
});

test("session change after create acknowledgement retains the original replay identity and stops Receipt upload", async () => {
  const queue = store();
  await queue.enqueue(payload, [{ name: "receipt.pdf", type: "application/pdf", blob: receipt() }], 9);
  let current = true;
  const requests = [];
  const saving = harness(async (url, body, config) => {
    requests.push({ url, config });
    current = false;
    return { data: { id: 71 } };
  });
  const stopped = await saving.syncPendingExpenses(9, { store: queue, isSessionCurrent: () => current });
  assert.equal(stopped.stoppedForAuth, true);
  assert.equal(requests.length, 1);
  assert.equal(keyOf(requests[0].config), "pending-1:expense");
  assert.equal(queue.items.get("pending-1").stage, "creation_pending");
  assert.equal(queue.items.get("pending-1").leaseToken, undefined);
});
