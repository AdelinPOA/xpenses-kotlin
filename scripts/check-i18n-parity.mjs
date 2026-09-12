import { readFileSync } from "fs";
import { resolve } from "path";

const messagesDir = resolve(import.meta.dirname, "../frontend/messages");

function getKeys(obj, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...getKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

try {
  const en = JSON.parse(readFileSync(resolve(messagesDir, "en.json"), "utf-8"));
  const ro = JSON.parse(readFileSync(resolve(messagesDir, "ro.json"), "utf-8"));

  const enKeys = getKeys(en);
  const roKeys = getKeys(ro);

  const roKeySet = new Set(roKeys);
  const enKeySet = new Set(enKeys);
  const missingInRo = enKeys.filter((k) => !roKeySet.has(k));
  const missingInEn = roKeys.filter((k) => !enKeySet.has(k));

  if (missingInRo.length > 0 || missingInEn.length > 0) {
    if (missingInRo.length > 0) {
      console.error(`\x1b[31mi18n parity check failed: ${missingInRo.length} missing key(s) in ro.json:\x1b[0m`);
      for (const key of missingInRo) {
        console.error(`  - ${key}`);
      }
    }
    if (missingInEn.length > 0) {
      console.error(`\x1b[31mi18n parity check failed: ${missingInEn.length} missing key(s) in en.json:\x1b[0m`);
      for (const key of missingInEn) {
        console.error(`  - ${key}`);
      }
    }
    process.exit(1);
  }

  console.log(`\x1b[32mi18n parity check passed: all ${enKeys.length} keys present in both locales.\x1b[0m`);
  process.exit(0);
} catch (err) {
  console.error(`\x1b[31mi18n parity check error: ${err.message}\x1b[0m`);
  process.exit(1);
}
