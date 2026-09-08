import { readFileSync } from "fs";

const reportPath = process.argv[2] ?? "npm-audit.json";

function hasFix(vulnerability) {
  return vulnerability.fixAvailable === true || (
    vulnerability.fixAvailable !== false &&
    vulnerability.fixAvailable !== null &&
    typeof vulnerability.fixAvailable === "object"
  );
}

try {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (!report || typeof report.vulnerabilities !== "object" || report.vulnerabilities === null) {
    throw new Error("audit report has no vulnerabilities map");
  }

  const blocking = Object.entries(report.vulnerabilities)
    .filter(([, vulnerability]) =>
      ["high", "critical"].includes(vulnerability.severity) && hasFix(vulnerability)
    )
    .map(([name, vulnerability]) => `${name} (${vulnerability.severity})`);

  if (blocking.length > 0) {
    console.error(`npm audit policy failed: ${blocking.length} fixable HIGH/CRITICAL vulnerability(s)`);
    for (const item of blocking) console.error(`  - ${item}`);
    process.exit(1);
  }

  console.log("npm audit policy passed: no fixable HIGH/CRITICAL vulnerabilities");
} catch (error) {
  console.error(`npm audit policy error: ${error.message}`);
  process.exit(1);
}
