import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupAdminMocks } from "../shared/mocks";

test.describe("Admin Users", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("page loads and shows user list", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/users", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    if ((page.viewportSize()?.width ?? 1280) >= 768) {
      await expect(page.getByRole("cell", { name: /^mod1$/ })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("cell", { name: /^manager1$/ })).toBeVisible();
    } else {
      await expect(page.getByText("mod1").first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("manager1").first()).toBeVisible();
    }
  });

  test("Create User button is visible", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/users", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: /create|new.*user/i })).toBeVisible({ timeout: 15000 });
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/users", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
