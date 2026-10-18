const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const { QueryClient, dehydrate } = require("@tanstack/react-query");

const sourcePath = path.resolve(__dirname, "../lib/queryPersister.ts");
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function makeHarness() {
  const records = new Map();
  const gates = { open: null, get: null, put: null, delete: null };
  const database = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    close() {},
    transaction() {
      const tx = {
        objectStore() {
          return {
            get(key) {
              const request = {};
              Promise.resolve(gates.get?.promise).then(() => queueMicrotask(() => {
                request.result = records.get(key);
                request.onsuccess?.();
                queueMicrotask(() => tx.oncomplete?.());
              }));
              return request;
            },
            put(value, key) {
              const request = {};
              Promise.resolve(gates.put?.promise).then(() => queueMicrotask(() => {
                records.set(key, value);
                request.onsuccess?.();
                queueMicrotask(() => tx.oncomplete?.());
              }));
              return request;
            },
            delete(key) {
              const request = {};
              Promise.resolve(gates.delete?.promise).then(() => queueMicrotask(() => {
                records.delete(key);
                request.onsuccess?.();
                queueMicrotask(() => tx.oncomplete?.());
              }));
              return request;
            },
          };
        },
      };
      return tx;
    },
  };
  const indexedDB = {
    open() {
      const request = {};
      Promise.resolve(gates.open?.promise).then(() => queueMicrotask(() => {
        request.result = database;
        request.onsuccess?.();
      }));
      return request;
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => require(name),
    window: { indexedDB },
    indexedDB,
    setTimeout,
    clearTimeout,
    Date,
    Promise,
    Set,
  }, { filename: sourcePath });
  return { createQueryPersistence: exports.createQueryPersistence, records, gates };
}

function stateFor(userId, value) {
  const client = new QueryClient();
  client.setQueryData(["categories", userId], value);
  const state = dehydrate(client);
  client.clear();
  return state;
}

function record(userId, value) {
  return { timestamp: Date.now(), userId, state: stateFor(userId, value) };
}

function tick(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("unknown identity cannot restore or write; legacy ownership is purged", async () => {
  const { createQueryPersistence, records } = makeHarness();
  records.set("persisted_state", { timestamp: Date.now(), state: stateFor(1, "legacy") });
  const client = new QueryClient();
  const persistence = createQueryPersistence(client);
  persistence.setOwner(1);
  const stop = persistence.start();
  await tick(20);
  assert.equal(client.getQueryCache().getAll().length, 0);
  assert.equal(records.has("persisted_state"), false);

  persistence.setOwner(null);
  const anonymousClient = new QueryClient();
  const anonymous = createQueryPersistence(anonymousClient);
  const stopAnonymous = anonymous.start();
  anonymousClient.setQueryData(["categories", 1], "anonymous");
  await tick(1050);
  assert.equal(records.has("persisted_state"), false);
  stop();
  stopAnonymous();
  client.clear();
  anonymousClient.clear();
});

test("same identity restores offline data and repeated auth checks preserve it", async () => {
  const { createQueryPersistence, records } = makeHarness();
  records.set("persisted_state", record(17, "offline data"));
  const client = new QueryClient();
  const persistence = createQueryPersistence(client);
  persistence.setOwner(17);
  const stop = persistence.start();
  await tick(20);
  assert.equal(client.getQueryData(["categories", 17]), "offline data");
  client.setQueryData(["categories", 17], "still available");
  persistence.setOwner(17);
  assert.equal(client.getQueryData(["categories", 17]), "still available");
  await tick(20);
  assert.equal(records.has("persisted_state"), true);
  stop();
  client.clear();
});

test("identity switch during a pending restore cannot hydrate the old owner", async () => {
  const { createQueryPersistence, records, gates } = makeHarness();
  records.set("persisted_state", record(1, "owner A"));
  gates.get = deferred();
  const client = new QueryClient();
  const persistence = createQueryPersistence(client);
  persistence.setOwner(1);
  const stop = persistence.start();
  await tick();
  persistence.setOwner(2);
  gates.get.resolve();
  await tick(20);
  assert.equal(client.getQueryCache().getAll().length, 0);
  assert.equal(records.has("persisted_state"), false);
  stop();
  client.clear();
});

test("logout during a pending restore cannot hydrate or keep the saved record", async () => {
  const { createQueryPersistence, records, gates } = makeHarness();
  records.set("persisted_state", record(8, "private data"));
  gates.get = deferred();
  const client = new QueryClient();
  const persistence = createQueryPersistence(client);
  persistence.setOwner(8);
  const stop = persistence.start();
  await tick();
  persistence.setOwner(null);
  gates.get.resolve();
  await tick(20);
  assert.equal(client.getQueryCache().getAll().length, 0);
  assert.equal(records.has("persisted_state"), false);
  stop();
  client.clear();
});

test("logout during a pending write deletes the write after it settles", async () => {
  const { createQueryPersistence, records, gates } = makeHarness();
  const client = new QueryClient();
  const persistence = createQueryPersistence(client);
  persistence.setOwner(5);
  const stop = persistence.start();
  client.setQueryData(["categories", 5], "private");
  gates.put = deferred();
  await tick(1050);
  persistence.setOwner(null);
  gates.put.resolve();
  await tick(30);
  assert.equal(records.has("persisted_state"), false);
  stop();
  client.clear();
});

test("stopping the controller cancels a pending save timer", async () => {
  const { createQueryPersistence, records } = makeHarness();
  const client = new QueryClient();
  const persistence = createQueryPersistence(client);
  persistence.setOwner(9);
  const stop = persistence.start();
  client.setQueryData(["categories", 9], "private");
  stop();
  await tick(1050);
  assert.equal(records.has("persisted_state"), false);
  client.clear();
});
