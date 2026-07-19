import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupAdminMocks } from "../shared/mocks";

test.describe("Visual regression screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  const pages: Array<{ path: string; role: "manager" | "mod" | "cfo" | "user" }> = [
    { path: "/admin/email", role: "mod" },
    { path: "/admin/imap", role: "mod" },
    { path: "/admin/ldap", role: "mod" },
    { path: "/admin/ocr", role: "mod" },
    { path: "/admin/storage", role: "mod" },
    { path: "/admin/users", role: "mod" },
    { path: "/admin/settings", role: "cfo" },
  ];

  for (const { path, role } of pages) {
    test(`screenshot ${path} desktop`, async ({ page }) => {
      await setupAuthMocks(page, role);
      await setupAdminMocks(page);
      await page.goto(path, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth, { timeout: 15000 });
    });
  }
});
