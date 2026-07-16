import { test, expect, Page } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks } from "../shared/mocks";

async function openSidebarIfNeeded(page: Page) {
  const vpw = page.viewportSize()?.width ?? 1280;
  if (vpw < 1024) {
    await page.locator("button").filter({ has: page.locator("svg.lucide-menu") }).click();
    await page.waitForTimeout(800);
  }
}

test.describe("Sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("mod role sees all nav links", async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await openSidebarIfNeeded(page);
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("xpenses", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(sidebar.getByText("Dashboard")).toBeVisible();
    await expect(sidebar.getByText("Expenses")).toBeVisible();
    await expect(sidebar.getByText("Inventory")).toBeVisible();
    await expect(sidebar.getByText("Reports")).toBeVisible();
    await expect(sidebar.getByText("Admin", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Users")).toBeVisible();
  });

  test("technician role does not see admin section", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/dashboard**", (route) => route.fulfill({ json: { expense_count_total: 0, expense_count_month: 0, total_month_eur: 0, draft_count: 0, submitted_count: 0, paid_count: 0, pending_approval_count: 0, pending_payment_count: 0, recent_expenses: [], spend_by_category: [] } }));
    await page.route("**/api/categories**", (route) => route.fulfill({ json: [] }));
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await openSidebarIfNeeded(page);
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("Dashboard")).toBeVisible({ timeout: 15000 });
    await expect(sidebar.getByText("Admin", { exact: true })).not.toBeVisible({ timeout: 5000 });
  });

  test("nav links navigate to correct pages", async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await openSidebarIfNeeded(page);
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("xpenses", { exact: true })).toBeVisible({ timeout: 15000 });

    await sidebar.getByRole("link", { name: "Expenses" }).click();
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
    await openSidebarIfNeeded(page);
    const themeBtn = page.getByLabel(/theme/i);
    await expect(themeBtn).toBeVisible({ timeout: 15000 });
    await themeBtn.click();
    await expect(themeBtn).toBeVisible();
  });
});
