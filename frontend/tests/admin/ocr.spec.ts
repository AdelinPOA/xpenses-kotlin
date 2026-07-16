import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupAdminMocks } from "../shared/mocks";

test.describe("Admin OCR Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("page loads and shows enable toggle and provider dropdown", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ocr", { waitUntil: "load" });
    await page.waitForTimeout(2000);
// The enable checkbox might say "Enable OCR scanning" or similar
    await expect(page.getByText(/enable.*ocr/i)).toBeVisible({ timeout: 15000 });
    // Provider dropdown should be present
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("Test Connection button visible", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ocr", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: /test connection/i })).toBeVisible({ timeout: 15000 });
  });

  test("Save Configuration button visible", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ocr", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible({ timeout: 15000 });
  });

  test("no horizontal overflow", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ocr", { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth, { timeout: 15000 });
  });
});
