const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const messages = require("../../messages/en.json");

// Exercise the actual drawer handlers without launching Next/browser processes on production.
function harness(uploadResult) {
  const slots = [];
  let cursor = 0;
  const effects = [];
  const react = {
    ...React,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots))
        slots[i] = typeof initial === "function" ? initial() : initial;
      return [
        slots[i],
        (value) => {
          slots[i] = typeof value === "function" ? value(slots[i]) : value;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((v, j) => !Object.is(v, slots[i][j]))) {
        slots[i] = deps;
        effects.push(fn);
      }
    },
    useCallback(fn) {
      cursor++;
      return fn;
    },
  };
  const listeners = new Map();
  const calls = [];
  const api = {
    get: async () => ({ data: uploadResult.created?.[0] }),
    post: async (url, body, config) => {
      calls.push({ method: "post", url, body, config });
      if (uploadResult instanceof Error) throw uploadResult;
      return { data: uploadResult };
    },
    patch: async (url, body) => {
      calls.push({ method: "patch", url, body });
      return { data: { ...uploadResult.created[0], merchant: body.merchant } };
    },
    delete: async (url) => {
      calls.push({ method: "delete", url });
    },
  };
  const mutation = {
    isPending: false,
    mutate() {
      mutation.isPending = true;
      api
        .post("/expenses/bulk-upload")
        .then(
          ({ data }) => mutation.options.onSuccess(data),
          (err) => mutation.options.onError?.(err),
        )
        .finally(() => {
          mutation.isPending = false;
        });
    },
  };
  const translations = (ns) => {
    const t = (key, args = {}) =>
      Object.entries(args).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, String(value)),
        messages[ns]?.[key] ?? key,
      );
    t.rich = (key) => t(key);
    return t;
  };
  const exports = {};
  const compiled = ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, "../../components/expenses/BulkReviewDrawer.tsx"),
      "utf8",
    ),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(
    compiled,
    {
      exports,
      require(name) {
        if (name === "react") return react;
        if (name === "@tanstack/react-query")
          return {
            useQuery: () => ({ data: [] }),
            useQueryClient: () => ({ invalidateQueries() {} }),
            useMutation(options) {
              mutation.options = options;
              return mutation;
            },
          };
        if (name === "next-intl") return { useTranslations: translations };
        if (name === "@/lib/api")
          return {
            __esModule: true,
            default: api,
            bulkUploadExpenses: async () =>
              (await api.post("/expenses/bulk-upload")).data,
          };
        if (name === "@/lib/queryKeys")
          return { categoryKeys: { list: () => [] }, expenseKeys: { all: [] } };
        if (name === "@/lib/useBodyScrollLock")
          return { useBodyScrollLock() {} };
        if (name === "@/lib/receiptCapture")
          return {
            compressImage: async (file) => file,
            compressedUploadName: (fileName) => fileName,
          };
        if (name === "./AuthorizedImage")
          return {
            __esModule: true,
            default: (props) => React.createElement("img", props),
          };
        if (name === "lucide-react")
          return new Proxy({}, { get: (_, name) => name });
        return require(name);
      },
      document: { addEventListener() {}, removeEventListener() {} },
      window: {
        addEventListener(name, listener) {
          listeners.set(name, listener);
        },
        removeEventListener(name) {
          listeners.delete(name);
        },
      },
      crypto: { randomUUID: () => "batch-1" },
      FormData,
      console,
      setTimeout,
      clearTimeout,
      Map,
      Set,
    },
    { filename: "BulkReviewDrawer.tsx" },
  );
  const props = {
    files: [new File(["photo"], "one.jpg", { type: "image/jpeg" })],
    isOpen: true,
    onClose() {
      h.closed = true;
    },
  };
  const h = {
    calls,
    api,
    listeners,
    closed: false,
    render() {
      cursor = 0;
      const tree = exports.default(props);
      const pending = effects.splice(0);
      for (const effect of pending) effect();
      return tree;
    },
    async settle() {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    },
  };
  return h;
}
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
}
function text(node) {
  if (typeof node === "string") return node;
  return React.Children.toArray(node?.props?.children).map(text).join(" ");
}
function row(h) {
  const element = nodes(h.render()).find(
    (n) => typeof n.type === "function" && n.type.name === "BulkExpenseRow",
  );
  assert.ok(element, "created row exists");
  return { element, tree: element.type(element.props) };
}
const expense = {
  id: 71,
  merchant: "Original",
  amount_original: 10,
  currency_original: "EUR",
  date: "2026-01-01",
  category_id: null,
  description: "",
  receipts: [],
};

test("HTTP 500 is visible and is never rendered as saved/empty success", async () => {
  const h = harness(new Error("lost response"));
  h.render();
  await h.settle();
  const output = text(h.render());
  assert.match(output, /could not be confirmed/i);
  assert.doesNotMatch(
    output,
    /All expenses are saved|Done reviewing|No expenses created/,
  );
  assert.equal(
    h.calls.filter((c) => c.url === "/expenses/bulk-upload").length,
    1,
  );
});

test("failed blur keeps attempted value unsaved, blocks close, and retries only the known ID", async () => {
  const h = harness({ created: [expense], errors: [] });
  h.render();
  await h.settle();
  h.api.patch = async (url, body) => {
    h.calls.push({ method: "patch", url, body });
    throw new Error("offline");
  };
  let r = row(h);
  const input = nodes(r.tree).find(
    (n) =>
      n.type === "input" &&
      (n.props.id?.endsWith("-merchant") ||
        n.props.defaultValue === "Original"),
  );
  input.props.onChange?.({ target: { value: "Attempted" } });
  r = row(h);
  const edited = nodes(r.tree).find(
    (n) =>
      n.type === "input" &&
      (n.props.id?.endsWith("-merchant") ||
        n.props.defaultValue === "Original"),
  );
  edited.props.onBlur({ target: { value: "Attempted" } });
  await h.settle();
  r = row(h);
  assert.match(text(r.tree), /Not saved/i);
  assert.equal(
    nodes(r.tree).find((n) => n.props.id?.endsWith("-merchant")).props.value,
    "Attempted",
  );
  nodes(h.render())
    .find((n) => n.type === "button" && n.props["aria-label"] === "Close")
    .props.onClick();
  assert.equal(h.closed, false);
  h.api.patch = async (url, body) => {
    h.calls.push({ method: "patch", url, body });
    return { data: { ...expense, merchant: body.merchant } };
  };
  const retry = nodes(r.tree).find(
    (n) => n.type === "button" && /Retry/.test(text(n)),
  );
  assert.ok(retry);
  retry.props.onClick();
  await h.settle();
  assert.match(text(row(h).tree), /Saved/);
  assert.equal(
    h.calls.filter((c) => c.url === "/expenses/bulk-upload").length,
    1,
  );
  assert.deepEqual(
    h.calls.filter((c) => c.method === "patch").map((c) => c.url),
    ["/expenses/71", "/expenses/71"],
  );
});

test("sequential edits wait for acknowledgement and older success never overwrites the latest input", async () => {
  const h = harness({ created: [expense], errors: [] });
  h.render();
  await h.settle();
  let release;
  h.api.patch = async (url, body) => {
    h.calls.push({ method: "patch", url, body });
    if (h.calls.filter((c) => c.method === "patch").length === 1)
      await new Promise((resolve) => {
        release = resolve;
      });
    return { data: { ...expense, merchant: body.merchant } };
  };
  function edit(value) {
    let r = row(h);
    nodes(r.tree)
      .find((n) => n.props.id?.endsWith("-merchant"))
      .props.onChange({ target: { value } });
    r = row(h);
    nodes(r.tree)
      .find((n) => n.props.id?.endsWith("-merchant"))
      .props.onBlur();
  }
  edit("First");
  edit("Latest");
  assert.equal(h.calls.filter((c) => c.method === "patch").length, 1);
  release();
  await h.settle();
  assert.deepEqual(
    h.calls.filter((c) => c.method === "patch").map((c) => c.body.merchant),
    ["First", "Latest"],
  );
  assert.equal(
    nodes(row(h).tree).find((n) => n.props.id?.endsWith("-merchant")).props
      .value,
    "Latest",
  );
});

test("failed delete keeps the row and retry deletes only that known Expense", async () => {
  const h = harness({ created: [expense], errors: [] });
  h.render();
  await h.settle();
  h.api.delete = async (url) => {
    h.calls.push({ method: "delete", url });
    throw new Error("failed delete");
  };
  row(h).element.props.onDelete();
  await h.settle();
  assert.match(text(row(h).tree), /Delete failed/);
  h.api.delete = async (url) => {
    h.calls.push({ method: "delete", url });
  };
  const retry = nodes(row(h).tree).find(
    (n) => n.type === "button" && /Retry delete/.test(text(n)),
  );
  retry.props.onClick();
  await h.settle();
  assert.equal(
    nodes(h.render()).filter(
      (n) => typeof n.type === "function" && n.type.name === "BulkExpenseRow",
    ).length,
    0,
  );
  assert.deepEqual(
    h.calls.filter((c) => c.method === "delete").map((c) => c.url),
    ["/expenses/71", "/expenses/71"],
  );
});

test("failed attachment retries reuse the known ID and the same idempotency key after response loss", async () => {
  const h = harness({
    created: [expense],
    errors: [
      {
        filename: "one.jpg",
        reason: "storage failed",
        expense_id: 71,
        file_index: 0,
      },
    ],
  });
  h.render();
  await h.settle();
  let attempts = 0;
  h.api.post = async (url, body, config) => {
    h.calls.push({ method: "post", url, body, config });
    if (++attempts === 1) throw new Error("lost receipt response");
    return { data: [] };
  };
  function retry() {
    const button = nodes(h.render()).find(
      (n) => n.type === "button" && /Retry attaching/.test(text(n)),
    );
    assert.ok(button);
    button.props.onClick();
  }
  retry();
  await h.settle();
  retry();
  await h.settle();
  const uploads = h.calls.filter((c) => c.url === "/expenses/71/receipts");
  assert.equal(uploads.length, 2);
  assert.deepEqual(
    uploads.map((c) => c.config.headers["Idempotency-Key"]),
    ["batch-1:receipt:0", "batch-1:receipt:0"],
  );
  assert.equal(
    h.calls.filter((c) => c.url === "/expenses/bulk-upload").length,
    1,
  );
});

test("legacy filename-only attachment errors never guess an Expense or replay the batch", async () => {
  const h = harness({
    created: [expense],
    errors: [{ filename: "one.jpg", reason: "storage failed" }],
  });
  h.render();
  await h.settle();
  assert.equal(
    nodes(h.render()).filter(
      (n) => n.type === "button" && /Retry attaching/.test(text(n)),
    ).length,
    0,
  );
  assert.match(text(h.render()), /Do not upload the whole batch again/);
});

function changeField(h, field, value) {
  let current = row(h);
  nodes(current.tree)
    .find((n) => n.props.id?.endsWith(`-${field}`))
    .props.onChange({ target: { value } });
}
function saveFields(h) {
  row(h).element.props.onSave();
}
function closeDrawer(h) {
  nodes(h.render())
    .find((n) => n.type === "button" && n.props["aria-label"] === "Close")
    .props.onClick();
}

test("clearing merchant description and category sends explicit clear operations and acknowledges response", async () => {
  const original = {
    ...expense,
    description: "Retained description",
    category_id: 4,
  };
  const h = harness({ created: [original], errors: [] });
  h.render();
  await h.settle();
  h.api.patch = async (url, body) => {
    h.calls.push({ method: "patch", url, body });
    return {
      data: {
        ...original,
        merchant: body.merchant,
        description: body.description,
        category_id: body.clear_category ? null : original.category_id,
      },
    };
  };
  changeField(h, "merchant", "");
  changeField(h, "description", "");
  changeField(h, "category_id", "");
  saveFields(h);
  await h.settle();
  const body = h.calls.find((call) => call.method === "patch").body;
  assert.equal(body.merchant, "");
  assert.equal(body.description, "");
  assert.equal(body.clear_category, true);
  assert.equal("category_id" in body, false);
  assert.equal(row(h).element.props.row.saved.category_id, "");
  assert.equal(row(h).element.props.row.error, false);
  assert.match(text(row(h).tree), /Saved/);
});

test("HTTP success that ignores clearing keeps actual acknowledged baseline and remains unsaved", async () => {
  const original = { ...expense, description: "Kept by server" };
  const h = harness({ created: [original], errors: [] });
  h.render();
  await h.settle();
  h.api.patch = async (url, body) => {
    h.calls.push({ method: "patch", url, body });
    return { data: original };
  };
  changeField(h, "description", "");
  saveFields(h);
  await h.settle();
  const state = row(h).element.props.row;
  assert.equal(state.values.description, "");
  assert.equal(state.saved.description, "Kept by server");
  assert.equal(state.error, true);
  assert.match(text(row(h).tree), /Not saved/);
  assert.equal(
    h.calls.filter((call) => call.method === "patch").length,
    1,
    "No retry loop for a non-acknowledging success",
  );
  closeDrawer(h);
  assert.equal(h.closed, false);
});

test("lost committed PATCH followed by reverting input stays uncertain until current value is resent and acknowledged", async () => {
  const h = harness({ created: [expense], errors: [] });
  h.render();
  await h.settle();
  let serverMerchant = expense.merchant;
  h.api.patch = async (url, body) => {
    h.calls.push({ method: "patch", url, body });
    serverMerchant = body.merchant;
    throw new Error("committed, response lost");
  };
  changeField(h, "merchant", "Committed remotely");
  saveFields(h);
  await h.settle();
  assert.equal(serverMerchant, "Committed remotely");
  changeField(h, "merchant", "Original");
  closeDrawer(h);
  assert.equal(
    h.closed,
    false,
    "Equal local baseline does not resolve a lost response",
  );
  let prevented = false;
  h.listeners.get("beforeunload")({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(
    nodes(h.render()).some(
      (n) => n.type === "button" && text(n) === "Done reviewing",
    ),
    false,
  );
  h.api.patch = async (url, body) => {
    h.calls.push({ method: "patch", url, body });
    serverMerchant = body.merchant;
    return { data: { ...expense, merchant: serverMerchant } };
  };
  saveFields(h);
  await h.settle();
  assert.deepEqual(
    h.calls
      .filter((call) => call.method === "patch")
      .map((call) => call.body.merchant),
    ["Committed remotely", "Original"],
  );
  assert.equal(serverMerchant, "Original");
  assert.equal(row(h).element.props.row.error, false);
  closeDrawer(h);
  assert.equal(h.closed, true);
});

test("normalized numeric acknowledgement does not leave an acknowledged amount falsely dirty", async () => {
  const h = harness({ created: [expense], errors: [] });
  h.render();
  await h.settle();
  h.api.patch = async (url, body) => {
    h.calls.push({ method: "patch", url, body });
    return { data: { ...expense, amount_original: body.amount } };
  };
  changeField(h, "amount", "20.00");
  saveFields(h);
  await h.settle();
  assert.equal(row(h).element.props.row.saved.amount, "20");
  assert.equal(row(h).element.props.row.values.amount, "20");
  assert.equal(row(h).element.props.row.error, false);
  closeDrawer(h);
  assert.equal(h.closed, true);
});

test("file validation rejects unsupported MIME, HEIC, oversized files and oversized batches explicitly", () => {
  const exports = {};
  const source = fs.readFileSync(
    path.join(__dirname, "../../components/expenses/BulkUploadZone.tsx"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    TextEncoder,
    require(name) {
      if (name === "lucide-react") return {};
      if (name === "next-intl") return {};
      return require(name);
    },
  });
  const valid = { name: "valid.jpg", type: "image/jpeg", size: 10 };
  const result = exports.filterFiles([
    valid,
    { name: "photo.heic", type: "image/jpeg", size: 10 },
    { name: "wrong.jpg", type: "application/msword", size: 10 },
    { name: "large.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1 },
  ]);
  assert.equal(result.valid.length, 1);
  assert.deepEqual(
    Array.from(result.rejected, (item) => item.reason),
    ["type", "type", "size"],
  );
  const tooMany = exports.filterFiles(Array.from({ length: 21 }, () => valid));
  assert.equal(tooMany.valid.length, 0);
  assert.equal(tooMany.rejected[0].reason, "count");
});
