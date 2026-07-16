import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

test.describe("/advances page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads pending advances for manager", async ({ page }) => {
    await setupAuthMocks(page, "manager");
    await page.route("**/api/advances/pending", (route) => route.fulfill({ json: [{ id: 1, amount: 500, currency: "EUR", status: "pending", report_id: 1 }] }));
    await page.goto("/advances", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText(/500|pending|advance/i)).toBeVisible({ timeout: 15000 });
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "manager");
    await page.route("**/api/advances/pending", (route) => route.fulfill({ json: [] }));
    await page.goto("/advances", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
