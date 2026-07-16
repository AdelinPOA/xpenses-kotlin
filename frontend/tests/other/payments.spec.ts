import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

test.describe("/payments page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads approved reports for finance role", async ({ page }) => {
    await setupAuthMocks(page, "cfo");
    await page.route("**/api/reports", (route) => route.fulfill({ json: [{ id: 3, title: "Client Visit Berlin", status: "approved", total: 3200, currency: "EUR" }] }));
    await page.goto("/payments", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Client Visit Berlin")).toBeVisible({ timeout: 15000 });
  });

  test("shows access denied for non-finance role", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.goto("/payments", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).not.toContain("/payments");
  });

  test("no horizontal overflow for finance role", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "cfo");
    await page.route("**/api/reports", (route) => route.fulfill({ json: [] }));
    await page.goto("/payments", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
