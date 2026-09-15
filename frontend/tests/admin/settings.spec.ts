import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupAdminMocks } from "../shared/mocks";

test.describe("Admin Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("page loads and shows mileage rate fields", async ({ page }) => {
    await setupAuthMocks(page, "cfo");
    await setupAdminMocks(page);
    await page.goto("/admin/settings", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("heading", { name: /mileage rates/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /daily allowance/i })).toBeVisible();
  });

  test("only mod can configure the mobile quick-add FAB", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/settings", { waitUntil: "load" });
    const fabToggle = page.getByRole("switch", { name: /mobile quick-add/i });
    await expect(fabToggle).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /mileage rates/i })).not.toBeVisible();
    await expect(fabToggle).not.toBeChecked();
    await fabToggle.check();
    await expect(fabToggle).toBeChecked();
  });

  test("chef_finance cannot configure the mobile quick-add FAB", async ({ page }) => {
    await setupAuthMocks(page, "cfo");
    await setupAdminMocks(page);
    await page.goto("/admin/settings", { waitUntil: "load" });
    await expect(page.getByRole("switch", { name: /mobile quick-add/i })).not.toBeVisible();
  });

  test("failed mobile FAB save rolls back the toggle", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page, { mobileUiPatchResponse: { status: 500, body: { detail: "Save failed" } } });
    await page.goto("/admin/settings", { waitUntil: "load" });
    const fabToggle = page.getByRole("switch", { name: /mobile quick-add/i });
    await expect(fabToggle).toBeVisible({ timeout: 15000 });
    await fabToggle.check();
    await expect(fabToggle).not.toBeChecked();
    await expect(page.getByText(/failed to save/i)).toBeVisible();
  });

  test("Save buttons are visible", async ({ page }) => {
    await setupAuthMocks(page, "cfo");
    await setupAdminMocks(page);
    await page.goto("/admin/settings", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const saveBtns = page.getByRole("button", { name: /save/i });
    await expect(saveBtns.first()).toBeVisible({ timeout: 15000 });
  });

  test("no horizontal overflow", async ({ page }) => {
    await setupAuthMocks(page, "cfo");
    await setupAdminMocks(page);
    await page.goto("/admin/settings", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });

  test("FX margin server validation renders the matching field and preserves edits", async ({ page }) => {
    await setupAuthMocks(page, "cfo");
    await setupAdminMocks(page, {
      fxMarginsPatchResponse: {
        status: 400,
        body: { detail: "Invalid FX margins", errors: { "margins.USD": "USD margin is invalid" } },
      },
    });
    await page.goto("/admin/settings", { waitUntil: "load" });
    await expect(page.locator("#fx-margin-USD")).toHaveValue("2.5", { timeout: 15000 });
    await page.locator("#fx-margin-USD").fill("3.5");
    await page.getByRole("button", { name: /save/i }).nth(2).click();
    await expect(page.locator("#fx-margin-USD-error")).toHaveText("USD margin is invalid");
    await expect(page.locator("#fx-margin-USD")).toHaveValue("3.5");
    await expect(page.locator("#fx-margin-USD")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#fx-margin-USD")).toHaveAttribute("aria-describedby", "fx-margin-USD-error");
  });

  test("FX margin client validation sends no request for mixed invalid values", async ({ page }) => {
    await setupAuthMocks(page, "cfo");
    await setupAdminMocks(page);
    let patchCount = 0;
    page.on("request", (request) => {
      if (request.method() === "PATCH" && request.url().includes("/api/settings/fx-margins")) patchCount++;
    });
    await page.goto("/admin/settings", { waitUntil: "load" });
    await expect(page.locator("#fx-margin-USD")).toBeVisible({ timeout: 15000 });
    await page.locator("#fx-margin-USD").fill("101");
    await page.locator("#fx-margin-RON").fill("1");
    await page.getByRole("button", { name: /save/i }).nth(2).click();
    await expect(page.locator("#fx-margin-USD-error")).toBeVisible();
    await expect(page.locator("#fx-margin-RON-error")).toBeVisible();
    expect(patchCount).toBe(0);
  });

  test("FX margin valid save sends one complete payload and shows canonical values", async ({ page }) => {
    await setupAuthMocks(page, "cfo");
    await setupAdminMocks(page);
    const payloads: unknown[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH" && request.url().includes("/api/settings/fx-margins")) payloads.push(request.postDataJSON());
    });
    await page.goto("/admin/settings", { waitUntil: "load" });
    await expect(page.locator("#fx-margin-USD")).toBeVisible({ timeout: 15000 });
    await page.locator("#fx-margin-USD").fill("3");
    await page.getByRole("button", { name: /save/i }).nth(2).click();
    await expect(page.getByRole("status")).toHaveText(/saved/i);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ margins: { USD: 3 }, default_margin: 2 });
  });
});
