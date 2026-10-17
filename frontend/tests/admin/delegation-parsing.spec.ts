import { test, expect, type Page } from "@playwright/test";
import { setupAuthMocks, setupAdminMocks, OCR_SETTINGS, DELEGATION_PARSING_SETTINGS } from "../shared/mocks";
import type { OcrConfig, OcrConfigUpdate } from "../../lib/types/admin";
import type { DelegationPreviewRequest } from "../../lib/types/delegationParsing";

const SAMPLE_EMAIL = `Auftrag 905652178
Starttermin 18.10.2026
Endtermin 19.10.2026
Kunde Example Brewery`;

async function setupModels(page: Page) {
  let config: OcrConfig = {
    ...structuredClone(OCR_SETTINGS),
    models: [
      ...OCR_SETTINGS.models,
      { ...OCR_SETTINGS.models[0], id: "model-2", model_id: "email-v2", display_name: "Email Model V2" },
      { ...OCR_SETTINGS.models[0], id: "inactive", display_name: "Inactive Model", active: false },
      { ...OCR_SETTINGS.models[0], id: "untested", display_name: "Untested Model", tested: false },
    ],
  };
  await page.route("**/api/settings/ocr", async (route, request) => {
    if (request.method() === "PATCH") {
      const payload: OcrConfigUpdate = request.postDataJSON();
      config = { ...config, delegation_model_chain: payload.delegation_model_chain ?? config.delegation_model_chain };
    }
    await route.fulfill({ json: config });
  });
}

test.describe("Delegation email recognition tuning", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await setupModels(page);
  });

  test("loads saved guidance and saves email-only instructions", async ({ page }) => {
    await page.goto("/admin/imap");
    const tuning = page.getByRole("region", { name: "Email recognition tuning" });
    await expect(tuning.getByLabel("Extraction instructions")).toHaveValue(DELEGATION_PARSING_SETTINGS.instructions);
    await expect(tuning.getByLabel("Examples and expected results")).toHaveAttribute("maxlength", "20000");
    await expect(tuning.getByLabel("Output formatting instructions")).toHaveAttribute("maxlength", "6000");
    await tuning.getByLabel("Extraction instructions").fill("Translate task descriptions to English; preserve identifiers.");
    await tuning.getByLabel("Examples and expected results").fill("Kundenauftrag 42 → Order nr: 42");
    const save = page.waitForRequest((request) => request.method() === "PATCH" && request.url().endsWith("/settings/imap/parsing"));
    await tuning.getByRole("button", { name: "Save email instructions", exact: true }).click();
    expect((await save).postDataJSON()).toEqual({
      ...DELEGATION_PARSING_SETTINGS,
      instructions: "Translate task descriptions to English; preserve identifiers.",
      examples: "Kundenauftrag 42 → Order nr: 42",
    });
    await expect(tuning.getByText("Email instructions saved.", { exact: true })).toBeVisible();
    await expect(tuning.getByRole("button", { name: "Save email instructions", exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Simulate ingestion — creates a draft report" })).toBeVisible();
    // Tuning is not nested in the mailbox settings form.
    expect(await tuning.locator("xpath=ancestor::form").count()).toBe(0);
  });

  test("preview uses unsaved guidance and draft chain without saving or creating a report", async ({ page }) => {
    const writes: string[] = [];
    page.on("request", (request) => {
      if (["PATCH", "POST", "PUT", "DELETE"].includes(request.method()) && !request.url().includes("/auth/")) {
        writes.push(new URL(request.url()).pathname);
      }
    });
    await page.goto("/admin/imap");
    const tuning = page.getByRole("region", { name: "Email recognition tuning" });
    await tuning.getByLabel("Extraction instructions").fill("Always describe the task in English.");
    await tuning.getByLabel("Model to add to email chain").selectOption("model-2");
    await tuning.getByRole("button", { name: "Add email model", exact: true }).click();
    await tuning.getByRole("button", { name: "Move up Email Model V2", exact: true }).click();
    await tuning.getByLabel("Sample delegation email").fill(SAMPLE_EMAIL);
    const preview = page.waitForRequest((request) => request.url().endsWith("/settings/imap/preview"));
    await tuning.getByRole("button", { name: "Preview email", exact: true }).click();
    const payload: DelegationPreviewRequest = (await preview).postDataJSON();
    expect(payload).toEqual({
      body_text: SAMPLE_EMAIL,
      parser: "ai",
      settings: { ...DELEGATION_PARSING_SETTINGS, instructions: "Always describe the task in English." },
      model_chain: ["model-2", "model-1"],
    });
    await expect(tuning.getByText("Order nr", { exact: true })).toBeVisible();
    await expect(tuning.getByText("905652178", { exact: true })).toBeVisible();
    await expect(tuning.getByText("Instructions have unsaved changes. Preview uses these edits.")).toBeVisible();
    expect(writes).toEqual(["/api/settings/imap/preview"]);
  });

  test("AI preview failure is visible and does not silently call local parsing", async ({ page }) => {
    let previews = 0;
    await page.route("**/api/settings/imap/preview", async (route) => {
      previews += 1;
      await route.fulfill({ json: {
        success: false, parsed: null, active_parser: "ai", warnings: [],
        error: "No email AI model returned valid output",
      } });
    });
    await page.goto("/admin/imap");
    const tuning = page.getByRole("region", { name: "Email recognition tuning" });
    await tuning.getByLabel("Sample delegation email").fill(SAMPLE_EMAIL);
    await tuning.getByRole("button", { name: "Preview email", exact: true }).click();
    await expect(tuning.getByRole("alert")).toHaveText("No email AI model returned valid output");
    await expect(tuning.getByText("Preview parser used: AI email model chain", { exact: true })).toBeVisible();
    expect(previews).toBe(1);
  });

  test("late preview is marked stale when inputs change while the request is running", async ({ page }) => {
    let releasePreview = () => {};
    const gate = new Promise<void>((resolve) => { releasePreview = resolve; });
    await page.route("**/api/settings/imap/preview", async (route) => {
      await gate;
      await route.fallback();
    });
    await page.goto("/admin/imap");
    const tuning = page.getByRole("region", { name: "Email recognition tuning" });
    await tuning.getByLabel("Sample delegation email").fill(SAMPLE_EMAIL);
    const pending = page.waitForRequest((request) => request.url().endsWith("/settings/imap/preview"));
    await tuning.getByRole("button", { name: "Preview email", exact: true }).click();
    await pending;
    await tuning.getByLabel("Output formatting instructions").fill("Use English labels, one detail per line.");
    releasePreview();
    await expect(tuning.getByText("Inputs changed since this result was requested. Run preview again to see the current result.")).toBeVisible();
  });

  test("only active tested models can be added and chain save patches no receipt settings", async ({ page }) => {
    const patches: unknown[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH" && request.url().endsWith("/settings/ocr")) patches.push(request.postDataJSON());
    });
    await page.goto("/admin/imap");
    const tuning = page.getByRole("region", { name: "Email recognition tuning" });
    const selector = tuning.getByLabel("Model to add to email chain");
    await expect(selector.locator("option")).toHaveText(["Select a tested model", "Email Model V2"]);
    await selector.selectOption("model-2");
    await tuning.getByRole("button", { name: "Add email model", exact: true }).click();
    await tuning.getByRole("button", { name: "Move up Email Model V2", exact: true }).click();
    await tuning.getByRole("button", { name: "Save email model chain", exact: true }).click();
    await expect(tuning.getByText("Email model chain saved. Receipt settings are unchanged.", { exact: true })).toBeVisible();
    expect(patches).toEqual([{ delegation_model_chain: ["model-2", "model-1"] }]);
    await expect(tuning.getByRole("list", { name: "Email model chain" }).getByRole("listitem").first()).toContainText("Email Model V2");
  });

  test("background refetch preserves unsaved instructions and chain", async ({ page }) => {
    await page.clock.install();
    await page.goto("/admin/imap");
    const tuning = page.getByRole("region", { name: "Email recognition tuning" });
    await tuning.getByLabel("Extraction instructions").fill("Local unsaved instructions");
    await tuning.getByRole("button", { name: "Remove Vision Model V1 from email chain" }).click();
    await page.route("**/api/settings/imap/parsing", (route) => route.fulfill({
      json: { ...DELEGATION_PARSING_SETTINGS, instructions: "Remote instructions" },
    }));
    await page.clock.fastForward(60_001);
    const refresh = page.waitForResponse((response) => response.request().method() === "GET" && response.url().endsWith("/settings/imap/parsing"));
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    await refresh;
    await expect(tuning.getByLabel("Extraction instructions")).toHaveValue("Local unsaved instructions");
    await expect(tuning.getByText("No email AI models selected. Ingestion will use local parsing.")).toBeVisible();
  });

  test("save failure keeps the draft and displays the backend validation error", async ({ page }) => {
    await page.route("**/api/settings/imap/parsing", async (route, request) => {
      if (request.method() !== "PATCH") return route.fallback();
      await route.fulfill({ status: 400, json: { detail: "Invalid email output instructions" } });
    });
    await page.goto("/admin/imap");
    const tuning = page.getByRole("region", { name: "Email recognition tuning" });
    await tuning.getByLabel("Output formatting instructions").fill("Keep this unsaved draft");
    await tuning.getByRole("button", { name: "Save email instructions", exact: true }).click();
    await expect(tuning.getByRole("alert")).toHaveText("Invalid email output instructions");
    await expect(tuning.getByLabel("Output formatting instructions")).toHaveValue("Keep this unsaved draft");
    await expect(tuning.getByRole("button", { name: "Save email instructions", exact: true })).toBeEnabled();
  });
});
