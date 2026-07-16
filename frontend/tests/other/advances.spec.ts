import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

test.describe("/advances page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads pending advances for manager", async ({ page }) => {
    await setupAuthMocks(page, "manager");
    await page.route("**/api/advances/pending", (route) => route.fulfill({ json: [{ id: 1, report_id: 1, user_id: 4, user_display_name: "Technician One", report_title: "July Business Trip", status: "requested", amount_original: 500, currency_original: "EUR", amount_eur: 500, fx_rate: 1, requested_amount: 500, requested_currency: "EUR", date: "2026-07-14", description: "Travel advance", paid_by: null, paid_by_name: null, paid_at: null, rejected_by: null, rejected_by_name: null, rejected_at: null, created_at: "2026-07-14T00:00:00Z", updated_at: "2026-07-14T00:00:00Z" }] }));
    await page.goto("/advances", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("heading", { name: "Advance Requests" })).toBeVisible({ timeout: 15000 });
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
