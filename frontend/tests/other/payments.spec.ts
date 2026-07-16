import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

test.describe("/payments page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads approved reports for finance role", async ({ page }) => {
    await setupAuthMocks(page, "cfo");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: [{ id: 3, title: "Client Visit Berlin", status: "approved", total_amount: 3200, currency: "EUR", user_id: 2, user_display_name: "Manager One", date_from: "2026-05-10", date_to: "2026-05-14", approved_at: "2026-05-15T08:00:00Z", expenses: [], advances: [], mileage_records: [], total_advances: 0, total_mileage_eur: 0, daily_allowance: 0, total_reimbursable: 3200, submitted_at: "2026-05-15T08:00:00Z", description: null, paid_at: null, approved_by: null, rejected_reason: null, signer_id: null, signed_at: null, created_at: "2026-05-10T00:00:00Z", updated_at: "2026-05-15T08:00:00Z" }] }));
    await page.goto("/payments", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Client Visit Berlin")).toBeVisible({ timeout: 15000 });
  });

  test("shows access denied for non-finance role", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.goto("/payments", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Access Denied")).toBeVisible({ timeout: 15000 });
  });

  test("no horizontal overflow for finance role", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "cfo");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: [] }));
    await page.goto("/payments", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
