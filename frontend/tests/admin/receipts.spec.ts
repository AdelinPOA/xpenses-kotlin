import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

test.describe("Admin Receipts Cleanup", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("page loads and shows Scan Storage button", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await page.route("**/api/settings/receipts/scan", (route) => route.fulfill({ json: { orphans: [] } }));
    await page.goto("/admin/receipts", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: /scan/i })).toBeVisible({ timeout: 15000 });
  });

  test("cleanup section is visible", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await page.route("**/api/settings/receipts/scan", (route) => route.fulfill({ json: { orphans: [] } }));
    await page.goto("/admin/receipts", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("heading", { name: /receipts cleanup/i })).toBeVisible({ timeout: 15000 });
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "mod");
    await page.route("**/api/settings/receipts/scan", (route) => route.fulfill({ json: { orphans: [] } }));
    await page.goto("/admin/receipts", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
