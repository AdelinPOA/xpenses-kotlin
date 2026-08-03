import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, copyFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = resolve(__dirname, "check-i18n-parity.mjs");
const realMessages = resolve(__dirname, "../frontend/messages");

function runWithMessages(en, ro) {
  const dir = mkdtempSync(join(tmpdir(), "i18n-parity-"));
  const messagesDir = join(dir, "frontend", "messages");
  mkdirSync(messagesDir, { recursive: true });
  writeFileSync(join(messagesDir, "en.json"), JSON.stringify(en));
  writeFileSync(join(messagesDir, "ro.json"), JSON.stringify(ro));

  // Patch: run script with cwd so import.meta.dirname still points at scripts/
  // The script resolves messages relative to scripts/, so we temporarily swap files.
  const enPath = join(realMessages, "en.json");
  const roPath = join(realMessages, "ro.json");
  const enBak = join(dir, "en.bak.json");
  const roBak = join(dir, "ro.bak.json");
  copyFileSync(enPath, enBak);
  copyFileSync(roPath, roBak);
  try {
    writeFileSync(enPath, JSON.stringify(en));
    writeFileSync(roPath, JSON.stringify(ro));
    const result = spawnSync(process.execPath, [script], { encoding: "utf-8" });
    return result;
  } finally {
    copyFileSync(enBak, enPath);
    copyFileSync(roBak, roPath);
    rmSync(dir, { recursive: true, force: true });
  }
}

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed += 1;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

// parity → exit 0
{
  const r = runWithMessages({ a: { b: "x" } }, { a: { b: "y" } });
  assert(r.status === 0, "parity exits 0");
}

// missing key → exit 1
{
  const r = runWithMessages({ a: { b: "x", c: "z" } }, { a: { b: "y" } });
  assert(r.status === 1, "missing key exits 1");
  assert((r.stderr || r.stdout || "").includes("a.c") || (r.stderr || "").includes("missing"), "reports missing key");
}

// real catalogs should pass
{
  const r = spawnSync(process.execPath, [script], { encoding: "utf-8" });
  assert(r.status === 0, "real en/ro catalogs pass");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll parity unit tests passed");
process.exit(0);
