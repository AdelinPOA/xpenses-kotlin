import assert from "node:assert/strict";
import { test } from "node:test";
import { ESLint } from "eslint";

const eslint = new ESLint();
for (const extension of ["ts", "tsx", "mts", "cts"]) {
  test(`ESLint actually parses and checks ${extension} files`, async () => {
    const filePath = `tests/tooling/lint-probe.${extension}`;
    const config = await eslint.calculateConfigForFile(filePath);
    assert.ok(config, `${extension} files must not be ignored`);
    assert.equal(config.rules["@typescript-eslint/no-unused-vars"][0], 2);
    const source = extension === "tsx"
      ? "export const view = <div />; debugger;"
      : "export const value: number = 42; debugger;";
    const [result] = await eslint.lintText(source, { filePath });
    assert.equal(result.fatalErrorCount, 0);
    assert.ok(result.messages.some((message) => message.ruleId === "no-debugger" && message.severity === 2));
    assert.ok(!result.messages.some((message) => message.message.includes("File ignored")));
  });
}

test("JavaScript recommended checks remain active", async () => {
  const config = await eslint.calculateConfigForFile("tests/tooling/lint-probe.mjs");
  assert.equal(config.rules["no-unused-vars"][0], 2);
  const [result] = await eslint.lintText("const unusedValue = 42; debugger;", { filePath: "tests/tooling/lint-probe.mjs" });
  assert.ok(result.messages.some((message) => message.ruleId === "no-unused-vars"));
  assert.ok(result.messages.some((message) => message.ruleId === "no-debugger"));
});
