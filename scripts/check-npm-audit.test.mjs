import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const script = join(import.meta.dirname, "check-npm-audit.mjs");
const dir = mkdtempSync(join(tmpdir(), "npm-audit-check-"));

function run(vulnerabilities) {
  const path = join(dir, `${Math.random()}.json`);
  writeFileSync(path, JSON.stringify({ vulnerabilities }));
  return spawnSync(process.execPath, [script, path], { encoding: "utf-8" });
}

let failed = 0;
function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failed += 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

try {
  assert(
    run({ lodash: { severity: "high", fixAvailable: false } }).status === 0,
    "high vulnerability without a fix does not block",
  );
  assert(
    run({ lodash: { severity: "high", fixAvailable: true } }).status === 1,
    "high vulnerability with a fix blocks",
  );
  assert(
    run({ axios: { severity: "critical", fixAvailable: { name: "axios", version: "1.2.3" } } }).status === 1,
    "critical vulnerability with a fix blocks",
  );
  assert(
    run({ postcss: { severity: "moderate", fixAvailable: true } }).status === 0,
    "moderate vulnerability does not block",
  );

  const malformed = join(dir, "malformed.json");
  writeFileSync(malformed, "not json");
  assert(
    spawnSync(process.execPath, [script, malformed], { encoding: "utf-8" }).status === 1,
    "malformed audit output fails closed",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll npm audit policy tests passed");
