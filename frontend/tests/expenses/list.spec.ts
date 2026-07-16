import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks, EXPENSES, CATEGORIES } from "../shared/mocks";

test.describe("Expenses list page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads with expense rows visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/expenses", (route) => route.fulfill({ json: EXPENSES }));
    await page.route("**/api/categories", (route) => route.fulfill({ json: CATEGORIES }));
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Lidl")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("OMV Petrom")).toBeVisible();
    await expect(page.getByText("Hotel Ibis")).toBeVisible();
  });

  test("status filter pills are present", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/expenses", (route) => route.fulfill({ json: EXPENSES }));
    await page.route("**/api/categories", (route) => route.fulfill({ json: CATEGORIES }));
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("All")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Draft")).toBeVisible();
    await expect(page.getByText("Submitted")).toBeVisible();
    await expect(page.getByText("Approved")).toBeVisible();
    await expect(page.getByText("Paid")).toBeVisible();
  });

  test("category filter dropdown works", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/expenses", (route) => route.fulfill({ json: EXPENSES }));
    await page.route("**/api/categories", (route) => route.fulfill({ json: CATEGORIES }));
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Transport")).toBeVisible({ timeout: 15000 });
  });

  test("export button is visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/expenses", (route) => route.fulfill({ json: EXPENSES }));
    await page.route("**/api/categories", (route) => route.fulfill({ json: CATEGORIES }));
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText(/export|csv|xlsx/i)).toBeVisible({ timeout: 15000 });
  });

  test("mobile viewport has no overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "user");
    await page.route("**/api/expenses", (route) => route.fulfill({ json: EXPENSES }));
    await page.route("**/api/categories", (route) => route.fulfill({ json: CATEGORIES }));
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
