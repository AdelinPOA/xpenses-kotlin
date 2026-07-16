import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks, EXPENSES, CATEGORIES } from "../shared/mocks";

test.describe("Expenses list page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  function isDesktop(page: import("@playwright/test").Page) {
    return (page.viewportSize()?.width ?? 1280) >= 768;
  }

  test("loads with expense rows visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/expenses**", (route) => route.fulfill({ json: EXPENSES }));
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    if (isDesktop(page)) {
      const table = page.getByRole("table");
      await expect(table.getByText("Lidl")).toBeVisible({ timeout: 15000 });
      await expect(table.getByText("OMV Petrom")).toBeVisible();
      await expect(table.getByText("Hotel Ibis")).toBeVisible();
    } else {
      await expect(page.getByText("Lidl").first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("OMV Petrom").first()).toBeVisible();
      await expect(page.getByText("Hotel Ibis").first()).toBeVisible();
    }
  });

  test("status filter pills are present", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/expenses**", (route) => route.fulfill({ json: EXPENSES }));
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: "All" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submitted" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Paid" })).toBeVisible();
  });

  test("category filter dropdown works", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/expenses**", (route) => route.fulfill({ json: EXPENSES }));
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    if (isDesktop(page)) {
      await expect(page.getByRole("table").getByText("Transport")).toBeVisible({ timeout: 15000 });
    } else {
      await expect(page.locator(".md\\:hidden").getByText("Transport").first()).toBeVisible({ timeout: 15000 });
    }
  });

  test("export button is visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/expenses**", (route) => route.fulfill({ json: EXPENSES }));
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText(/export|csv|xlsx/i)).toBeVisible({ timeout: 15000 });
  });

  test("mobile viewport has no overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "user");
    await page.route("**/api/expenses**", (route) => route.fulfill({ json: EXPENSES }));
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth, { timeout: 15000 });
  });
});
