import { test, expect } from "@playwright/test";
import { setupAuthMocks, CATEGORIES } from "../shared/mocks";

test.describe("/categories page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads categories list", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await page.route("**/api/categories**", (route, req) => {
      if (req.method() === "GET") route.fulfill({ json: CATEGORIES });
      else route.fulfill({ status: 200, json: { id: 99 } });
    });
    await page.goto("/categories", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    if ((page.viewportSize()?.width ?? 1280) >= 768) {
      const table = page.getByRole("table");
      await expect(table.getByText("Transport")).toBeVisible({ timeout: 15000 });
      await expect(table.getByText("Accommodation")).toBeVisible();
    } else {
      await expect(page.getByText("Transport").first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("Accommodation").first()).toBeVisible();
    }
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "mod");
    await page.route("**/api/categories**", (route, req) => {
      if (req.method() === "GET") route.fulfill({ json: CATEGORIES });
      else route.fulfill({ status: 200, json: { id: 99 } });
    });
    await page.goto("/categories", { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth, { timeout: 15000 });
  });
});
