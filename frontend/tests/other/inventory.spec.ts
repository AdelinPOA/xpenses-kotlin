import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupInventoryMocks } from "../shared/mocks";

test.describe("/inventory page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads inventory items", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await setupInventoryMocks(page);
    await page.goto("/inventory", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Laptop Dell")).toBeVisible({ timeout: 15000 });
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "user");
    await setupInventoryMocks(page);
    await page.goto("/inventory", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
