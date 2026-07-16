import { test, expect } from "@playwright/test";
import { setupAuthMocks, CATEGORIES, EXPENSES } from "../shared/mocks";

test.describe("Create report page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("form fields visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/categories", (route) => route.fulfill({ json: CATEGORIES }));
    await page.route("**/api/expenses", (route) => route.fulfill({ json: EXPENSES }));
    await page.goto("/reports/new", { waitUntil: "load" });
    await page.waitForTimeout(2000);
// The page should have a heading like "New Report" and form fields
    await expect(page.getByText(/new report|create report/i)).toBeVisible({ timeout: 15000 });
    // Look for title input, date fields, description
    const titleInput = page.locator('input[type="text"]').first();
    await expect(titleInput).toBeVisible();
  });

  test("submit button present", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/categories", (route) => route.fulfill({ json: CATEGORIES }));
    await page.route("**/api/expenses", (route) => route.fulfill({ json: EXPENSES }));
    await page.goto("/reports/new", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: /create|save|submit/i })).toBeVisible({ timeout: 15000 });
  });

  test("mobile viewport has no overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "user");
    await page.route("**/api/categories", (route) => route.fulfill({ json: CATEGORIES }));
    await page.route("**/api/expenses", (route) => route.fulfill({ json: EXPENSES }));
    await page.goto("/reports/new", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
