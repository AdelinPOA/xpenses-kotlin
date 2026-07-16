import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupAdminMocks } from "../shared/mocks";

test.describe("Visual regression screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  const pages = [
    { path: "/admin/email", role: "mod" as const },
    { path: "/admin/imap", role: "mod" as const },
    { path: "/admin/ldap", role: "mod" as const },
    { path: "/admin/ocr", role: "mod" as const },
    { path: "/admin/storage", role: "mod" as const },
    { path: "/admin/users", role: "mod" as const },
    { path: "/admin/settings", role: "cfo" as const },
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
