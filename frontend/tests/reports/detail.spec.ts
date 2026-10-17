import { test, expect, Page } from "@playwright/test";
import { setupAuthMocks, REPORT_DETAIL } from "../shared/mocks";

test.describe("Report detail page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  function setupReportMocks(
    page: Page,
    description = REPORT_DETAIL.description,
  ) {
    return page.route("**/api/reports/**", async (route, request) => {
      const url = request.url();
      if (
        url.includes("/export") ||
        url.includes("/receipts-zip") ||
        url.includes("/export-csv") ||
        url.includes("/mileage") ||
        url.includes("/advances")
      ) {
        return route.fulfill({ status: 200, json: [] });
      }
      const match = url.match(/\/api\/reports\/(\d+)/);
      if (match) {
        return route.fulfill({
          json: { ...REPORT_DETAIL, description, id: parseInt(match[1]) },
        });
      }
      return route.fulfill({ json: [REPORT_DETAIL] });
    });
  }

  test("summary stat cards visible", async ({ page }) => {
    await setupAuthMocks(page, "manager");
    await setupReportMocks(page);
    await page.goto("/reports/1", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(
      page.getByRole("heading", { name: "July Business Trip" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Total Expenses")).toBeVisible();
  });

  test("action buttons visible for submitted report with manager role", async ({
    page,
  }) => {
    await setupAuthMocks(page, "manager");
    await setupReportMocks(page);
    await page.goto("/reports/1", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    // Submitted report should show Approve/Reject buttons for manager
    await expect(page.getByText(/approve/i)).toBeVisible({ timeout: 15000 });
  });

  test("delegation section shows when report has delegation data", async ({
    page,
  }) => {
    await setupAuthMocks(page, "manager");
    await setupReportMocks(page);
    await page.goto("/reports/1", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    // Delegation fields should be visible
    await expect(page.getByText("Order nr", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Kundenauftrag", { exact: true })).toHaveCount(
      0,
    );
  });

  test("email description retains its line structure", async ({ page }) => {
    await setupAuthMocks(page, "manager");
    await setupReportMocks(
      page,
      "Order nr: 905652178\nTask: Cooling tower maintenance",
    );
    await page.goto("/reports/1");
    const description = page
      .locator("p")
      .filter({ hasText: "Task: Cooling tower maintenance" });
    await expect(description).toBeVisible();
    await expect(description).toHaveCSS("white-space", "pre-wrap");
  });

  test("back navigation present", async ({ page }) => {
    await setupAuthMocks(page, "manager");
    await setupReportMocks(page);
    await page.goto("/reports/1", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    // There should be a back link/button
    const backLink = page
      .getByRole("link")
      .filter({ hasText: /back|reports/i })
      .first();
    await expect(backLink).toBeVisible({ timeout: 15000 });
  });

  test("mobile viewport has no overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "manager");
    await setupReportMocks(page);
    await page.goto("/reports/1", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });
});
