import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupAdminMocks } from "../shared/mocks";

test.describe("Admin LDAP Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("page loads and shows form fields", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ldap", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Host", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Port", { exact: true })).toBeVisible();
    await expect(page.getByText("TLS")).toBeVisible();
    await expect(page.getByText(/bind dn/i)).toBeVisible();
    await expect(page.getByText(/base dn/i)).toBeVisible();
  });

  test("Test Connection button visible", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ldap", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: /test connection/i })).toBeVisible({ timeout: 15000 });
  });

  test("Sync Now and Save buttons visible", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ldap", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: /sync/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
  });

  test("no horizontal overflow", async ({ page }) => {
    await setupAuthMocks(page, "mod");
    await setupAdminMocks(page);
    await page.goto("/admin/ldap", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
