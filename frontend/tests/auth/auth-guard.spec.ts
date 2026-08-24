import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

test.describe("Auth guard", () => {
  test("redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    // Middleware forwards the attempted path as ?next= for post-login restore.
    await page.waitForURL(/\/login\?next=%2Fdashboard$/, { timeout: 10000 });
  });

  test("allows access when authenticated", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/dashboard", (route) =>
      route.fulfill({
        json: {
          total_month_eur: 1000,
          draft_count: 1,
          submitted_count: 2,
          paid_count: 5,
          expense_count_total: 42,
          expense_count_month: 15,
          pending_approval_count: 0,
          pending_payment_count: 0,
          recent_expenses: [],
          spend_by_category: [],
        },
      })
    );
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    // Assert an element present in both desktop and mobile dashboard views
    await expect(page.getByText("Total Spend (Last Order / Report)").filter({ visible: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test("non-mod role cannot access admin", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.goto("/admin/email", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).not.toContain("/admin/email");
  });
});
