import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupAdminMocks, OCR_SETTINGS } from "../shared/mocks";

test.describe("Admin OCR Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("page loads and shows enable toggle and provider dropdown", async ({
    page,
  }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ocr", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    // The enable checkbox might say "Enable OCR scanning" or similar
    await expect(page.getByText(/enable.*ocr/i)).toBeVisible({
      timeout: 15000,
    });
    // Provider dropdown should be present
    await expect(page.getByRole("combobox").first()).toBeVisible();
  });

  test("model test action is visible", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ocr", { waitUntil: "load" });
    await expect(page.getByRole("button", { name: /test again/i })).toBeVisible(
      { timeout: 15000 },
    );
  });

  test("Save Configuration button visible", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ocr", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(
      page.getByRole("button", { name: /save changes/i }).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("moderator can add a provider and tested model, then order the receipt fallback chain", async ({
    page,
  }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    const savedConfigs: Array<{
      models: Array<{ id: string; model_id: string }>;
    }> = [];
    page.on("request", (request) => {
      if (
        request.url().endsWith("/api/settings/ocr") &&
        request.method() === "PATCH" &&
        request.postData()
      ) {
        savedConfigs.push(
          JSON.parse(request.postData()!) as {
            models: Array<{ id: string; model_id: string }>;
          },
        );
      }
    });

    await page.goto("/admin/ocr", { waitUntil: "load" });
    await page.getByLabel("Provider name").last().fill("Fast Vision Cloud");
    await page
      .getByLabel("API base URL")
      .last()
      .fill("https://vision.example.com/v1");
    await page.getByLabel("API key").last().fill("secret-for-test");
    await page.getByRole("button", { name: "Add provider" }).click();
    await page.getByRole("button", { name: "Save changes" }).first().click();
    await expect(page.locator('input[type="password"]').nth(1)).toHaveValue("");

    const addedProvider = page
      .getByRole("combobox", { name: "Provider" })
      .last();
    const providerOptions = await addedProvider
      .locator("option")
      .allTextContents();
    await addedProvider.selectOption({ label: "Fast Vision Cloud" });
    await page.getByLabel("Display name").last().fill("Fast Vision v2");
    await page.getByLabel("Provider model ID").last().fill("vision-v2");
    await page.getByRole("button", { name: "Add model" }).click();
    await page.getByRole("button", { name: "Save changes" }).first().click();

    const addedModelId = savedConfigs
      .at(-1)
      ?.models.find((model) => model.model_id === "vision-v2")?.id;
    expect(addedModelId).toBeTruthy();
    await page.getByRole("button", { name: "Test model" }).click();
    await expect(
      page.getByText("Synthetic receipt test passed").first(),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: "Active" }).last().check();
    await page.getByRole("button", { name: "Save changes" }).first().click();

    const receiptChain = page.getByRole("region", {
      name: "Receipt OCR fallback chain",
    });
    await receiptChain
      .getByRole("combobox", {
        name: "Add to chain Receipt OCR fallback chain",
      })
      .selectOption(addedModelId!);
    await receiptChain.getByRole("button", { name: "Add to chain" }).click();
    await receiptChain
      .getByRole("button", { name: "Move up Fast Vision v2" })
      .click();
    await expect(receiptChain.getByRole("listitem").first()).toContainText(
      "Fast Vision v2",
    );
    await page.getByRole("button", { name: "Save changes" }).first().click();

    const delegationChain = page.getByRole("region", {
      name: "Delegation email fallback chain",
    });
    await expect(delegationChain.getByRole("listitem").first()).toContainText(
      "Vision Model V1",
    );
    expect(providerOptions).toContain("Fast Vision Cloud");
  });

  test("save locks editing and keeps the submitted state without a second reset window", async ({
    page,
  }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    let releaseSave = () => {};
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await page.route("**/api/settings/ocr", async (route) => {
      if (route.request().method() === "PATCH") await saveGate;
      await route.fallback();
    });
    await page.goto("/admin/ocr");
    const providerName = page.getByLabel("Provider name").first();
    await providerName.fill("Saved provider name");
    const pendingSave = page.waitForRequest(
      (request) =>
        request.method() === "PATCH" && request.url().endsWith("/settings/ocr"),
    );
    await page.getByRole("button", { name: "Save changes" }).first().click();
    await pendingSave;
    await expect(providerName).toBeDisabled();
    await expect(
      page.getByRole("checkbox", { name: "Active" }).first(),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Add provider" }),
    ).toBeDisabled();
    releaseSave();
    await expect(providerName).toBeEnabled();
    await expect(providerName).toHaveValue("Saved provider name");
    await providerName.fill("Next unsaved edit");
    await expect(providerName).toHaveValue("Next unsaved edit");
    await expect(page.getByText("You have unsaved changes.")).toBeVisible();
  });

  test("failed retest locks edits through refresh and revokes activation", async ({
    page,
  }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page, {
      ocrTestResult: {
        success: false,
        message: "Synthetic receipt was invalid",
      },
    });
    await page.goto("/admin/ocr");
    const active = page.getByRole("checkbox", { name: "Active" }).first();
    await active.uncheck();
    await page.getByRole("button", { name: "Save changes" }).first().click();
    const retest = page.getByRole("button", { name: "Test again" });
    await expect(retest).toBeEnabled();

    let releaseTest = () => {};
    const testGate = new Promise<void>((resolve) => {
      releaseTest = resolve;
    });
    let releaseRefresh = () => {};
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    await page.route("**/api/settings/ocr/models/test", async (route) => {
      await testGate;
      await route.fallback();
    });
    await page.route("**/api/settings/ocr", async (route) => {
      if (route.request().method() === "GET") await refreshGate;
      await route.fallback();
    });
    await retest.click();
    const providerName = page.getByLabel("Provider name").first();
    await expect(providerName).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Save changes" }).first(),
    ).toBeDisabled();
    const refreshStarted = page.waitForRequest(
      (request) =>
        request.method() === "GET" && request.url().endsWith("/settings/ocr"),
    );
    releaseTest();
    await refreshStarted;
    await expect(providerName).toBeDisabled();
    releaseRefresh();
    await expect(providerName).toBeEnabled();
    await expect(
      page.getByText("Synthetic receipt was invalid").first(),
    ).toBeVisible();
    await expect(active).not.toBeChecked();
    await expect(active).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Test model" }),
    ).toBeEnabled();
  });

  test("a background configuration refresh preserves unsaved edits and entered secrets", async ({
    page,
  }) => {
    await page.clock.install();
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ocr");
    const providerName = page.getByLabel("Provider name").first();
    await providerName.fill("Local unsaved provider");
    const key = page.getByLabel("API key", { exact: true }).first();
    await key.fill("local-unsaved-secret");
    await page.route("**/api/settings/ocr", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          json: {
            ...OCR_SETTINGS,
            providers: [
              { ...OCR_SETTINGS.providers[0], name: "Remote provider change" },
            ],
          },
        });
      } else await route.fallback();
    });
    await page.clock.fastForward(300_001);
    const refresh = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().endsWith("/settings/ocr"),
    );
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    await refresh;
    await expect(providerName).toHaveValue("Local unsaved provider");
    await expect(key).toHaveValue("local-unsaved-secret");
    await expect(page.getByText("You have unsaved changes.")).toBeVisible();
  });

  test("no horizontal overflow", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ocr", { waitUntil: "load" });
    await page.waitForFunction(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
      { timeout: 15000 },
    );
  });
});
