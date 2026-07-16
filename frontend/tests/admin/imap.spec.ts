import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupAdminMocks } from "../shared/mocks";

test.describe("Admin IMAP Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("page loads and shows form fields", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/imap", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("IMAP Host")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("IMAP Port")).toBeVisible();
    await expect(page.getByText("Username / Email")).toBeVisible();
    await expect(page.getByText("Folder to poll")).toBeVisible();
  });

  test("Test Connection and Save Configuration buttons visible", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/imap", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Test Connection")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /save.*config|save.*setting/i })).toBeVisible();
  });

  test("Test Connection button visible at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/imap", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const testBtn = page.getByRole("button", { name: /test connection/i });
    await expect(testBtn).toBeVisible();
    await testBtn.scrollIntoViewIfNeeded();
  });

  test("Simulate Email Ingestion section visible", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/imap", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("heading", { name: /simulate|ingestion/i }).first()).toBeVisible({ timeout: 15000 });
  });

  test("no horizontal overflow", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/imap", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
