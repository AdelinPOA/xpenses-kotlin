import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks, REPORTS } from "../shared/mocks";

test.describe("Reports list page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads with report rows", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    if ((page.viewportSize()?.width ?? 1280) >= 768) {
      const table = page.getByRole("table");
      await expect(table.getByText("July Business Trip")).toBeVisible({ timeout: 15000 });
      await expect(table.getByText("Office Supplies June")).toBeVisible();
    } else {
      await expect(page.getByText("July Business Trip").first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("Office Supplies June").first()).toBeVisible();
    }
  });

  test("status filter pills visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: "All" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submitted" })).toBeVisible();
  });

  test("export button visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText(/export|csv|xlsx/i)).toBeVisible({ timeout: 15000 });
  });

  test("create new report button visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("link", { name: /new|create/i })).toBeVisible({ timeout: 15000 });
  });

  test("mobile viewport has no overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth, { timeout: 15000 });
  });
});
