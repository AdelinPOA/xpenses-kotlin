import { test, expect } from "@playwright/test";
import { setupAuthMocks, CATEGORIES } from "../shared/mocks";

test.describe("/categories page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads categories list", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await page.route("**/api/categories", (route, req) => {
      if (req.method() === "GET") route.fulfill({ json: CATEGORIES });
      else route.fulfill({ status: 200, json: { id: 99 } });
    });
    await page.goto("/categories", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Transport")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Accommodation")).toBeVisible();
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "mod");
    await page.route("**/api/categories", (route, req) => {
      if (req.method() === "GET") route.fulfill({ json: CATEGORIES });
      else route.fulfill({ status: 200, json: { id: 99 } });
    });
    await page.goto("/categories", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
