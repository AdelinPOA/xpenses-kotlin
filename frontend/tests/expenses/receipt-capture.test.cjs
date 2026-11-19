const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function harness(api) {
  const filename = path.resolve(__dirname, "../../lib/receiptCapture.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require: () => ({ default: api }),
    FormData, DOMException, Date, Promise,
    setTimeout: (fn) => setTimeout(fn, 0), clearTimeout, setInterval, clearInterval,
  }, { filename });
  return exports;
}
const file = () => new File(["%PDF-test"], "receipt.pdf", { type: "application/pdf" });
const complete = { data: { status: "completed", expense_id: 31, receipt_id: 32, result: { amount: 10 } } };

test("accepted job is durably acknowledged before polling and resumed without another upload", async () => {
  const calls = [];
  const scan = harness({
    post: async () => { calls.push("upload"); return { status: 202, data: { job_id: 17, status_url: "/ocr/status/17" } }; },
    get: async (url) => { calls.push(url); return complete; },
  });
  await scan.captureReceipt(file(), { onAccepted: async (id) => { calls.push(`persist:${id}`); } });
  assert.deepEqual(calls, ["upload", "persist:17", "/ocr/status/17"]);
  calls.length = 0;
  const capture = await scan.captureReceipt(file(), { resumeJobId: 17 });
  assert.deepEqual(calls, ["/ocr/status/17"]);
  assert.equal(capture.expenseId, 31);
  assert.equal(capture.receiptId, 32);
});

test("navigation abort stops observation but never cancels an accepted remote job", async () => {
  const deleted = [];
  const controller = new AbortController();
  const scan = harness({
    post: async () => ({ status: 202, data: { job_id: 17, status_url: "/ocr/status/17" } }),
    get: async () => { controller.abort(); throw new DOMException("Aborted", "AbortError"); },
    delete: async (url) => { deleted.push(url); },
  });
  await assert.rejects(scan.captureReceipt(file(), { signal: controller.signal }), scan.ScanCancelledError);
  assert.deepEqual(deleted, []);
});

test("failed acceptance persistence stops polling without deleting the server job", async () => {
  let polled = false;
  const scan = harness({
    post: async () => ({ status: 202, data: { job_id: 17, status_url: "/ocr/status/17" } }),
    get: async () => { polled = true; return complete; },
  });
  await assert.rejects(scan.captureReceipt(file(), {
    onAccepted: async () => { throw new Error("quota"); },
  }), /quota/);
  assert.equal(polled, false);
});

test("transport intent must commit before sending the source", async () => {
  let uploaded = false;
  const scan = harness({ post: async () => { uploaded = true; } });
  await assert.rejects(scan.captureReceipt(file(), {
    onUploading: async () => { throw new Error("quota"); },
  }), /quota/);
  assert.equal(uploaded, false);
});

test("single-capture acceptance binds stable idempotency and report context to upload", async () => {
  let sent;
  const scan = harness({
    post: async (...args) => {
      sent = args;
      return { status: 202, data: { job_id: 17 } };
    },
    get: async () => complete,
  });
  await scan.captureReceipt(file(), { idempotencyKey: "stable-capture-key", reportId: 6 });
  assert.equal(sent[0], "/ocr/scan");
  assert.equal(sent[1].get("report_id"), "6");
  assert.equal(sent[2].headers["Idempotency-Key"], "stable-capture-key");
});

test("upload rejection is distinct from ambiguous timeout/server failure", async () => {
  for (const status of [400, 413, 415, 408, 500]) {
    const scan = harness({ post: async () => { throw { response: { status } }; } });
    await assert.rejects(scan.captureReceipt(file()), error => {
      assert.ok(error instanceof scan.ScanUploadError);
      assert.equal(error.definitelyRejected, [400, 413, 415].includes(status));
      return true;
    });
  }
});

test("status polling uses progressive backoff starting at 250ms and capping at 1500ms", async () => {
  const filename = path.resolve(__dirname, "../../lib/receiptCapture.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const delays = [];
  let polls = 0;
  const api = {
    post: async () => ({ status: 202, data: { job_id: 22 } }),
    get: async () => {
      polls++;
      return polls >= 7 ? complete : { data: { status: "processing" } };
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({ default: api }),
    FormData,
    DOMException,
    Date,
    Promise,
    setTimeout: (fn, ms) => {
      delays.push(ms);
      return setTimeout(fn, 0);
    },
    clearTimeout,
    setInterval,
    clearInterval,
  }, { filename });

  await exports.captureReceipt(file());
  assert.deepEqual(delays, [250, 400, 600, 900, 1200, 1500, 1500]);
});
