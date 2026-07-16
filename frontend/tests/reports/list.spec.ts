import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks, REPORTS } from "../shared/mocks";

test.describe("Reports list page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads with report rows", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("July Business Trip")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Office Supplies June")).toBeVisible();
  });

  test("status filter pills visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("All")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Draft")).toBeVisible();
    await expect(page.getByText("Submitted")).toBeVisible();
  });

  test("export button visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText(/export|csv|xlsx/i)).toBeVisible({ timeout: 15000 });
  });

  test("create new report button visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("link", { name: /new|create/i })).toBeVisible({ timeout: 15000 });
  });

  test("mobile viewport has no overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
