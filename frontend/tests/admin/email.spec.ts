import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupAdminMocks } from "../shared/mocks";

test.describe("Admin Email / SMTP Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("page loads and shows key form elements", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/email", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Host", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Port", { exact: true })).toBeVisible();
    await expect(page.getByText("Username", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /save.*config|save.*setting/i })).toBeVisible();
  });

  test("Send Test Email section is visible", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/email", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("heading", { name: /send test email/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Send Test" })).toBeVisible();
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/email", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
