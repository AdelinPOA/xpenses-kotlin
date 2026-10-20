const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function harness() {
  const calls = [];
  const api = {
    get: async (...args) => { calls.push(["get", ...args]); return { data: [] }; },
    post: async (...args) => { calls.push(["post", ...args]); return { data: { job_id: 17, status: "processing" } }; },
  };
  const filename = path.resolve(__dirname, "../../lib/ocrRecovery.ts");
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({ default: api }) }, { filename });
  return { client: exports, calls };
}

test("recovery actions retain the same owner-authorized routes and idempotency keys", async () => {
  const { client, calls } = harness();
  await client.listRecoverableOcrJobs();
  await client.retryOcrJob(17, "retry-key");
  const body = { values: { amount: 12, currency: "EUR", date: "2026-10-20" } };
  await client.completeOcrJobManually(17, body, "manual-key");
  assert.equal(calls[0][1], "/ocr/jobs");
  assert.equal(calls[0][2].params.limit, 50);
  assert.equal(calls[1][1], "/ocr/jobs/17/retry");
  assert.equal(calls[1][2], null);
  assert.equal(calls[1][3].headers["Idempotency-Key"], "retry-key");
  assert.equal(calls[2][1], "/ocr/jobs/17/complete-manually");
  assert.deepEqual(calls[2][2], body);
  assert.equal(calls[2][3].headers["Idempotency-Key"], "manual-key");
});

test("recovery actions reject invalid IDs and missing keys before transport", async () => {
  const { client, calls } = harness();
  await assert.rejects(client.retryOcrJob(0, "key"), /Invalid OCR job ID/);
  await assert.rejects(client.completeOcrJobManually(17, { values: {} }, " "), /idempotency key required/);
  assert.equal(calls.length, 0);
});
