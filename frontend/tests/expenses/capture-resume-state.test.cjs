const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const messages = require('../../messages/en.json');

function compile(relative, requireModule, extra = {}) {
  const filename = path.resolve(__dirname, relative);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: requireModule, File, FormData, DOMException, AbortController, Date, Promise, console, setTimeout: fn => setTimeout(fn, 0), clearTimeout, setInterval: () => 1, clearInterval() {}, ...extra }, { filename });
  return exports;
}
function harness({ post, failAck = false, records = new Map() } = {}) {
  const calls = []; const intervals = []; let ackAttempts = 0;
  const api = {
    post: async (...args) => { calls.push(args[0]); return post ? post(...args) : { status: 202, data: { job_id: 17 } }; },
    get: async url => { calls.push(url); return { data: { status: 'completed', expense_id: 31, receipt_id: 32, result: { amount: 10 } } }; },
  };
  const scan = compile('../../lib/receiptCapture.ts', () => ({ default: api }));
  const queue = {
    async enqueueOcrSource(source) { records.set(source.id, { ...source, createdAt: 1 }); },
    async listOcrSources(owner) { return [...records.values()].filter(s => s.userId === owner); },
    async claimOcrSource(id, owner) { const item = records.get(id); if (!item || item.userId !== owner || item.leaseToken) return null; const claim = { ...item, leaseToken: 'lease' }; records.set(id, { ...claim }); return claim; },
    async acknowledgeOcrSource(source, remoteJobId) { ackAttempts++; if (failAck && ackAttempts === 1) throw new Error('quota'); records.set(source.id, { ...records.get(source.id), remoteJobId, uploadState: undefined }); },
    async markOcrSourceUpload(source, uploadState) { records.set(source.id, { ...records.get(source.id), uploadState }); },
    async renewOcrSource() {},
    async releaseOcrSource(source) { const current = records.get(source.id); if (current) records.set(source.id, { ...current, leaseToken: undefined }); },
    async removeOcrSource(id) { records.delete(id); },
  };
  const slots = []; const effects = []; let cursor = 0;
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, j) => !Object.is(v, slots[i][j]))) { slots[i] = deps; effects.push(fn); } },
  };
  const translate = ns => (key, args = {}) => Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), messages[ns]?.[key] ?? key);
  const page = compile('../../app/expenses/capture/page.tsx', name => {
    if (name === 'react') return react;
    if (name === '@/lib/receiptCapture') return scan;
    if (name === '@/lib/ocrSourceQueue') return queue;
    if (name === '@/components/AuthProvider') return { useAuth: () => ({ user: { id: 7 } }) };
    if (name === '@/components/ToastProvider') return { useToast: () => ({ error() {}, warning() {}, success() {} }) };
    if (name === '@tanstack/react-query') return { useQueryClient: () => ({ invalidateQueries() {} }) };
    if (name === 'next-intl') return { useTranslations: translate };
    if (name === '@/lib/queryKeys') return { expenseKeys: { all: [] }, dashboardKeys: { all: [] } };
    if (name === '@/lib/haptics') return { triggerHaptic() {} };
    if (name === '@/lib/format') return { formatEur: String };
    if (name === 'lucide-react') return new Proxy({}, { get: (_, n) => n });
    if (name === 'next/link' || name.startsWith('@/components/')) return { default: 'section' };
    return require(name);
  }, { navigator: { onLine: true }, window: { addEventListener() {}, removeEventListener() {} }, document: { addEventListener() {}, removeEventListener() {} }, URL: { createObjectURL: () => 'blob:preview', revokeObjectURL() {} }, crypto: { randomUUID: () => 'source-1' }, setInterval: fn => { intervals.push(fn); return intervals.length; } });
  const Session = page.default().type;
  return { calls, records, intervals, get ackAttempts() { return ackAttempts; },
    render() { cursor = 0; const tree = Session(); for (const fn of effects.splice(0)) fn(); return tree; },
    async settle() { for (let i = 0; i < 30; i++) await new Promise(resolve => setTimeout(resolve, 0)); },
    async select() { const input = nodes(this.render()).find(n => n.type === 'input'); await input.props.onChange({ target: { files: [new File(['%PDF-test'], 'receipt.pdf', { type: 'application/pdf' })], value: '' } }); await this.settle(); },
  };
}
function nodes(node) { if (!node || typeof node !== 'object') return []; return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
function text(node) { if (typeof node === 'string') return node; return React.Children.toArray(node?.props?.children).map(text).join(' '); }
function retry(h) { return nodes(h.render()).find(n => n.type === 'button' && /Retry/.test(text(n))); }
function discard(h) { return nodes(h.render()).find(n => n.type === 'button' && /^Cancel:/.test(n.props['aria-label'] ?? '')); }

test('received acceptance survives failed IndexedDB commit and retry persists the same job without POST', async () => {
  const h = harness({ failAck: true }); await h.select();
  const button = retry(h); assert.ok(button, 'known acceptance can retry persistence'); button.props.onClick(); await h.settle();
  assert.equal(h.calls.filter(url => url === '/ocr/scan').length, 1, 'must not re-upload acknowledged job');
  assert.equal(h.ackAttempts, 2); assert.equal(h.calls.filter(url => url === '/ocr/status/17').length, 1);
  assert.equal(h.records.size, 0, 'successful promotion removes source');
});

test('ambiguous upload failure is retained without auto-retry or local discard', async () => {
  const h = harness({ post: async () => { throw new Error('network lost'); } }); await h.select();
  assert.match(text(h.render()), /could not be confirmed/i); assert.equal(retry(h), undefined); assert.equal(discard(h), undefined);
  for (const fn of h.intervals) fn(); await h.settle();
  assert.equal(h.calls.filter(url => url === '/ocr/scan').length, 1);
  const restored = harness({ records: h.records }); restored.render(); await restored.settle();
  assert.match(text(restored.render()), /could not be confirmed/i); assert.equal(restored.calls.length, 0);
});

test('definitive pre-acceptance rejection offers explicit local discard and survives reload without auto-upload', async () => {
  const h = harness({ post: async () => { throw { response: { status: 415, data: { detail: 'Unsupported file' } } }; } }); await h.select();
  assert.ok(discard(h)); assert.ok(retry(h));
  const restored = harness({ records: h.records }); restored.render(); await restored.settle();
  assert.equal(restored.calls.length, 0); assert.ok(discard(restored));
  discard(restored).props.onClick(); await restored.settle(); assert.equal(restored.records.size, 0);
});
