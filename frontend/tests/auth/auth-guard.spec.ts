import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

test.describe("Auth guard", () => {
  test("redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForURL("**/login", { timeout: 10000 });
  });

  test("allows access when authenticated", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/dashboard", (route) =>
      route.fulfill({
        json: {
          month_spend: 1000,
          draft_reports: 1,
          submitted_reports: 2,
          paid_reports: 5,
          recent_expenses: [],
          spend_by_category: [],
        },
      })
    );
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText(/good/i)).toBeVisible({ timeout: 15000 });
  });

  test("non-mod role cannot access admin", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.goto("/admin/email", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).not.toContain("/admin/email");
  });
});
