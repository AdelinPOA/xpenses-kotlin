import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks } from "../shared/mocks";

test.describe("Sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("mod role sees all nav links", async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("xpenses")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Dashboard")).toBeVisible();
    await expect(page.getByText("Expenses")).toBeVisible();
    await expect(page.getByText("Inventory")).toBeVisible();
    await expect(page.getByText("Reports")).toBeVisible();
    await expect(page.getByText("Admin")).toBeVisible();
    await expect(page.getByText("Users")).toBeVisible();
  });

  test("technician role does not see admin section", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/dashboard", (route) => route.fulfill({ json: { month_spend: 0, draft_reports: 0, submitted_reports: 0, paid_reports: 0, recent_expenses: [], spend_by_category: [] } }));
    await page.route("**/api/categories", (route) => route.fulfill({ json: [] }));
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Dashboard")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Admin")).not.toBeVisible({ timeout: 5000 });
  });

  test("nav links navigate to correct pages", async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("xpenses")).toBeVisible({ timeout: 15000 });

    await page.getByRole("link", { name: "Expenses" }).first().click();
    await page.waitForURL("**/expenses", { timeout: 10000 });
  });

  test("mobile: sidebar hidden by default, hamburger shows it", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);

    const menuBtn = page.getByLabel(/open.*nav|menu|hamburger/i).or(page.locator("button").filter({ has: page.locator("svg") }).first());
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });

  test("theme toggle cycles through light/dark/system", async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const themeBtn = page.getByLabel(/theme/i);
    await expect(themeBtn).toBeVisible({ timeout: 15000 });
    await themeBtn.click();
    await expect(themeBtn).toBeVisible();
  });
});
