import { test, expect } from "@playwright/test";
import { CATEGORIES, setupCommonMocks } from "../shared/mocks";

test.describe("Axios session refresh", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupCommonMocks(page, { role: "mod" });
  });

  test("refreshes the session and retries a request after HTTP 401", async ({ page }) => {
    let requests = 0;
    let refreshes = 0;
    await page.route("**/api/categories**", async (route) => {
      requests += 1;
      await route.fulfill(requests === 1
        ? { status: 401, json: { detail: "Session expired" } }
        : { status: 200, json: CATEGORIES });
    });
    await page.route("**/api/auth/refresh", async (route) => {
      refreshes += 1;
      await route.fulfill({ status: 200, json: { access_token: "synthetic-refreshed-token" } });
    });

    await page.goto("/categories");

    await expect(page.getByText("Transport", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    expect(refreshes).toBe(1);
    expect(requests).toBe(2);
    await expect(page).toHaveURL(/\/categories$/);
  });

  test("redirects to login when session refresh is rejected", async ({ page }) => {
    let refreshes = 0;
    await page.route("**/api/categories**", (route) => route.fulfill({
      status: 401,
      json: { detail: "Session expired" },
    }));
    await page.route("**/api/auth/refresh", async (route) => {
      refreshes += 1;
      await route.fulfill({ status: 401, json: { detail: "Refresh expired" } });
    });

    await page.goto("/categories");

    await expect(page).toHaveURL(/\/login\?next=%2Fcategories$/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    expect(refreshes).toBe(1);
  });
});
