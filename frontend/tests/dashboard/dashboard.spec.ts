import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks, DASHBOARD_DATA } from "../shared/mocks";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads with stat cards visible", async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Total spent this month")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Draft reports")).toBeVisible();
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
    await expect(page.getByText("Lidl")).toBeVisible({ timeout: 15000 });
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

  test("company overview toggle shows My View option for mod", async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: "My View", exact: true })).toBeVisible({ timeout: 15000 });
  });

  test("my view / company overview toggle works for mod", async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const myViewBtn = page.getByRole("button", { name: "My View", exact: true });
    const companyViewBtn = page.getByRole("button", { name: "Company View", exact: true });
    await expect(companyViewBtn).toHaveClass(/bg-white/);
    await myViewBtn.evaluate((el) => (el as HTMLElement).click());
    await expect(myViewBtn).toHaveClass(/bg-white/);
  });

  test("mobile FAB button visible at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupCommonMocks(page);
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("link", { name: "Add expense" })).toBeVisible({ timeout: 15000 });
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
});
