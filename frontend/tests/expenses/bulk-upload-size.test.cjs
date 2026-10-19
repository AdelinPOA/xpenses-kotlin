const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const exportsObject = {};
const source = fs.readFileSync(path.join(__dirname, '../../components/expenses/BulkUploadZone.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, { exports: exportsObject, TextEncoder, require(name) {
  if (name === 'lucide-react' || name === 'next-intl') return {};
  return require(name);
} });
const filterFiles = exportsObject.filterFiles;
const MiB = 1024 * 1024;
const file = (size, name = 'receipt.jpg', type = 'image/jpeg') => ({ size, name, type });

test('aggregate supported payload above 9 MiB rejects the entire batch, not a subset', () => {
  const result = filterFiles([file(5 * MiB), file(4 * MiB + 1, 'two.jpg')]);
  assert.equal(result.valid.length, 0);
  assert.deepEqual(Array.from(result.rejected, item => item.reason), ['total']);
});

test('exact 9 MiB payload remains within the conservative multipart budget', () => {
  const selected = [file(5 * MiB, 'bon-șantier-🧾.jpg'), file(4 * MiB, 'two.jpg')];
  const result = filterFiles(selected);
  assert.equal(result.valid.length, 2);
  assert.equal(result.rejected.length, 0);
});

test('unsupported and individually oversized files do not consume the supported batch budget', () => {
  const good = file(8 * MiB);
  const result = filterFiles([good, file(4 * MiB, 'unsupported.heic', 'image/heic'), file(10 * MiB + 1, 'large.pdf', 'application/pdf')]);
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0], good);
  assert.deepEqual(Array.from(result.rejected, item => item.reason), ['type', 'size']);
});

test('aggregate rejection retains individual invalid-file feedback', () => {
  const result = filterFiles([file(5 * MiB), file(5 * MiB, 'two.jpg'), file(1, 'unsupported.heic', 'image/heic')]);
  assert.equal(result.valid.length, 0);
  assert.deepEqual(Array.from(result.rejected, item => item.reason), ['type', 'total']);
});

test('unusually long Unicode and escaped filenames cannot consume the multipart headroom', () => {
  const name = `${'🧾"\r\n'.repeat(100000)}.jpg`;
  const result = filterFiles([file(9 * MiB, name)]);
  assert.equal(result.valid.length, 0);
  assert.equal(result.rejected[0].reason, 'total');
});
