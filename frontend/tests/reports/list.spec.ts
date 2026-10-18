import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks, REPORTS, REPORT_DETAIL } from "../shared/mocks";

test.describe("Reports list page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads with report rows", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    if ((page.viewportSize()?.width ?? 1280) >= 768) {
      const table = page.getByRole("table");
      await expect(table.getByText("July Business Trip")).toBeVisible({ timeout: 15000 });
      await expect(table.getByText("Office Supplies June")).toBeVisible();
    } else {
      await expect(page.getByText("July Business Trip").first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("Office Supplies June").first()).toBeVisible();
    }
  });

  test("shows a retryable load error instead of the empty state", async ({ page }) => {
    await setupAuthMocks(page, "user");
    let requests = 0;
    await page.route("**/api/reports**", (route) => {
      requests += 1;
      return requests <= 2
        ? route.fulfill({ status: 503, json: { message: "Unavailable" } })
        : route.fulfill({ json: REPORTS });
    });

    await page.goto("/reports", { waitUntil: "load" });
    await expect(page.locator("#main-content").getByRole("alert").filter({ hasText: "Couldn't load data." })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("No reports found")).not.toBeVisible();
    await page.locator("#main-content").getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("July Business Trip").first()).toBeVisible({ timeout: 15000 });
  });

  test("keeps cached report rows visible with a persistent notice after refresh fails", async ({ page }) => {
    await setupAuthMocks(page, "user");
    let listRequests = 0;
    let refetchFinished!: () => void;
    const refetchRequest = new Promise<void>((resolve) => { refetchFinished = resolve; });
    await page.route("**/api/reports**", async (route, request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname.endsWith("/submit")) {
        return route.fulfill({ json: {} });
      }

      listRequests += 1;
      if (listRequests === 1) return route.fulfill({ json: REPORTS });
      await route.fulfill({ status: 503, json: { message: "Unavailable" } });
      if (listRequests === 3) refetchFinished();
    });

    await page.goto("/reports", { waitUntil: "load" });
    await expect(page.getByText("July Business Trip").first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Submit report Office Supplies June" }).click();
    await refetchRequest;
    await expect(page.locator("#main-content").getByRole("alert").filter({ hasText: "Couldn't load data." })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("July Business Trip").first()).toBeVisible();
    await expect(page.getByText("No reports found")).not.toBeVisible();
  });

  test("status filter pills visible on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: "All" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submitted" })).toBeVisible();
  });

  test("mobile filters are compact until opened", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "manager");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await expect(page.getByRole("button", { name: "Filters" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Draft" })).not.toBeVisible();
    await page.getByRole("button", { name: "Filters" }).click();
    await expect(page.getByRole("button", { name: "Draft" })).toBeVisible();
    await page.getByRole("button", { name: "Submitted" }).click();
    await expect(page.getByRole("button", { name: "Submitted" }).first()).toBeVisible();
  });

  test("export button visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText(/export|csv|xlsx/i)).toBeVisible({ timeout: 15000 });
  });

  test("create new report button visible", async ({ page }) => {
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("link", { name: "New report" })).toBeVisible({ timeout: 15000 });
  });

  test("desktop row click opens report", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupAuthMocks(page, "user");
    await setupCommonMocks(page);
    await page.route("**/api/reports**", (route) => {
      if (route.request().url().includes("/api/reports/")) {
        return route.fulfill({ json: REPORT_DETAIL });
      }
      return route.fulfill({ json: REPORTS });
    });
    await page.goto("/reports", { waitUntil: "load" });
    await page.getByRole("cell", { name: "July Business Trip" }).click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "July Business Trip" })).toBeVisible({ timeout: 15000 });
  });

  test("mobile viewport has no overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "user");
    await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth, { timeout: 15000 });
  });
});
