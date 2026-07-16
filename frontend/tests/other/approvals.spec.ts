import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

test.describe("/approvals page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads submitted reports with action buttons", async ({ page }) => {
    await setupAuthMocks(page, "manager");
    await page.route("**/api/reports", (route) => route.fulfill({ json: [{ id: 1, title: "July Business Trip", status: "submitted", total: 1250, currency: "EUR" }] }));
    await page.goto("/approvals", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("July Business Trip")).toBeVisible({ timeout: 15000 });
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "manager");
    await page.route("**/api/reports", (route) => route.fulfill({ json: [] }));
    await page.goto("/approvals", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
