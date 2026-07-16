import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

test.describe("/approvals page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads submitted reports with action buttons", async ({ page }) => {
    await setupAuthMocks(page, "manager");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: [{ id: 1, title: "July Business Trip", status: "submitted", total_amount: 1250, currency: "EUR", user_id: 2, user_display_name: "Manager One", date_from: "2026-07-01", date_to: "2026-07-15", submitted_at: "2026-07-16T10:00:00Z", expenses: [], advances: [], mileage_records: [], total_advances: 0, total_mileage_eur: 0, daily_allowance: 0, total_reimbursable: 1250, description: "Business trip", paid_at: null, approved_by: null, approved_at: null, rejected_reason: null, signer_id: null, signed_at: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-16T10:00:00Z" }] }));
    await page.goto("/approvals", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("July Business Trip")).toBeVisible({ timeout: 15000 });
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "manager");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: [] }));
    await page.goto("/approvals", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
