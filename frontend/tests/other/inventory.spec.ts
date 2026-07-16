import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

test.describe("/inventory page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads inventory items", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/inventory", (route, req) => {
      const url = new URL(req.url());
      if (url.pathname.includes("/requests")) {
        route.fulfill({ json: [] });
      } else {
        route.fulfill({ json: [{ id: 1, name: "Laptop Dell", serial_number: "SN-001", category: "Electronics", status: "active", assigned_to: "tech1" }] });
      }
    });
    await page.route("**/api/inventory/requests", (route) => route.fulfill({ json: [] }));
    await page.goto("/inventory", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Laptop Dell")).toBeVisible({ timeout: 15000 });
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "user");
    await page.route("**/api/inventory", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/inventory/requests", (route) => route.fulfill({ json: [] }));
    await page.goto("/inventory", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
