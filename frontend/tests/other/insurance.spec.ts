import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

test.describe("/insurance page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads insurance files and upload button", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await page.route("**/api/insurance", (route, req) => {
      if (req.method() === "GET") route.fulfill({ json: [{ id: 1, filename: "policy_2026.pdf", title: "Health Insurance 2026", uploaded_by: "mod1", uploaded_at: "2026-01-15T10:00:00Z" }] });
      else route.fulfill({ status: 201, json: { id: 99 } });
    });
    await page.goto("/insurance", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Health Insurance 2026")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/upload/i)).toBeVisible();
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "mod");
    await page.route("**/api/insurance", (route) => route.fulfill({ json: [] }));
    await page.goto("/insurance", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
