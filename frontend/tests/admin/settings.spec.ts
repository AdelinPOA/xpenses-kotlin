import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupAdminMocks } from "../shared/mocks";

test.describe("Admin Settings (chef_finance)", () => {
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
});
