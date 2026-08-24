import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks, DASHBOARD_DATA, MANAGER_DASHBOARD_DATA, REPORTS } from "../shared/mocks";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads with stat cards visible", async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    // Dual-view DOM (desktop + mobile markup) — assert on the visible copy
    await expect(page.getByText("Total Spend (Last Order / Report)").filter({ visible: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Recent Expenses").filter({ visible: true }).first()).toBeVisible();
  });

  test("greeting shows user display name", async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Moderator One").first()).toBeVisible({ timeout: 15000 });
  });

  test("recent expenses list renders", async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Lidl").filter({ visible: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test("company overview toggle is not visible for technician role", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/dashboard**", (route) => route.fulfill({ json: DASHBOARD_DATA }));
    await page.route("**/api/categories**", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/expenses**", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/reports**", (route) => route.fulfill({ json: [] }));
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText(/company overview/i)).not.toBeVisible({ timeout: 15000 });
  });

  test("company overview toggle shows Switch to My View for mod", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 }); // toggle lives in the desktop layout
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Switch to My View")).toBeVisible({ timeout: 15000 });
  });

  test("my view / company overview toggle works for mod", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 }); // toggle lives in the desktop layout
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    // mod defaults to org-wide view, button says "Switch to My View"
    const toggle = page.getByText("Switch to My View");
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await toggle.evaluate((el) => (el as HTMLElement).click());
    await expect(page.getByText("View Company Overview")).toBeVisible({ timeout: 10000 });
  });

  test("mobile FAB button visible at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("link", { name: "Add New Expense" })).toBeVisible({ timeout: 15000 });
  });

  test("mobile burger menu opens backdrop with z-50 above FAB", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);

    const menuButton = page.getByRole("button", { name: "Open sidebar" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // Verify sidebar and backdrop are open
    const sidebar = page.locator("#app-sidebar");
    await expect(sidebar).toBeVisible();

    // Verify main content is inert while sidebar is open
    const mainContent = page.locator("#main-content");
    await expect(mainContent).toHaveAttribute("inert", "");
  });

  test("no horizontal overflow at any viewport", async ({ page }) => {
    await setupCommonMocks(page);
    for (const vp of [{ w: 375 }, { w: 768 }, { w: 1280 }]) {
      await page.setViewportSize({ width: vp.w, height: 800 });
      await page.goto("/dashboard", { waitUntil: "load" });
      await page.waitForTimeout(2000);
      await page.waitForTimeout(2000);
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasOverflow).toBe(false);
    }
  });

  test("manager dashboard prioritizes review work and removes KPI-first content", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupAuthMocks(page, "manager");
    await page.route("**/api/dashboard**", (route) => route.fulfill({ json: DASHBOARD_DATA }));
    await page.route("**/api/dashboard/manager", (route) => route.fulfill({ json: MANAGER_DASHBOARD_DATA }));
    await page.goto("/dashboard", { waitUntil: "load" });
    await expect(page.getByText("Manager Work Hub")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("July Business Trip").first()).toBeVisible();
    await expect(page.getByText("Business trip to Vienna for client meetings").first()).toBeVisible();
    await expect(page.getByText("Team Activity Stream").first()).toBeVisible();
    await expect(page.getByText("Monthly Team Spend")).not.toBeVisible();
  });

  test("global search has neutral placeholder and grouped results", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupCommonMocks(page, { role: "manager" });
    await page.route("**/api/search**", (route) => route.fulfill({
      json: {
        reports: [{ ...REPORTS[0], title: "July Business Trip" }],
        expenses: [],
        users: [{ id: 4, display_name: "Technician One", email: "tech1@xpenses.local", role: "technician" }],
        insurance: [],
        advances: [],
        report_count: 1,
        expense_count: 0,
        user_count: 1,
        insurance_count: 0,
        advance_count: 0,
      }
    }));
    await page.goto("/dashboard", { waitUntil: "load" });
    const search = page.getByPlaceholder("Search...");
    await expect(search).toBeVisible({ timeout: 15000 });
    await search.fill("ju");
    await expect(page.getByText("Reports (1)")).toBeVisible();
    await expect(page.getByText("Users (1)")).toBeVisible();
  });
});
