import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks, setupAdminMocks } from "../shared/mocks";

const VIEWPORTS = [
  { width: 375, height: 812, name: "mobile" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 1280, height: 800, name: "desktop" },
];

const ADMIN_PAGES = ["/admin/email", "/admin/imap", "/admin/ldap", "/admin/ocr", "/admin/storage", "/admin/receipts", "/admin/settings", "/admin/users"];

for (const pg of ADMIN_PAGES) {
  for (const vp of VIEWPORTS) {
    test(`[${vp.name}] ${pg} no overflow`, async ({ page }) => {
      await page.route("**/sw.js", (route) => route.abort());
      await page.setViewportSize({ width: vp.width, height: vp.height });
      if (pg === "/admin/settings") {
        await setupAuthMocks(page, "cfo");
      } else {
        await setupAuthMocks(page, "mod");
      }
      await setupAdminMocks(page);
      await page.goto(pg, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth, { timeout: 15000 });

      // Check Test Connection buttons are visible and in viewport
      const testBtns = page.getByRole("button", { name: /test connection/i });
      const count = await testBtns.count();
      for (let i = 0; i < count; i++) {
        await expect(testBtns.nth(i)).toBeVisible();
        await testBtns.nth(i).scrollIntoViewIfNeeded();
      }
    });
  }
}

const OTHER_PAGES = ["/dashboard", "/expenses", "/reports", "/categories", "/inventory", "/insurance", "/profile"];

for (const pg of OTHER_PAGES) {
  for (const vp of VIEWPORTS) {
    test(`[${vp.name}] ${pg} no overflow`, async ({ page }) => {
      await page.route("**/sw.js", (route) => route.abort());
      await page.setViewportSize({ width: vp.width, height: vp.height });
      if (pg === "/categories") {
        await setupAuthMocks(page, "mod");
      } else {
        await setupAuthMocks(page, "user");
      }
      // Mock common APIs
      await page.route("**/api/dashboard**", (route) => route.fulfill({ json: { expense_count_total: 0, expense_count_month: 0, total_month_eur: 0, draft_count: 0, submitted_count: 0, paid_count: 0, pending_approval_count: 0, pending_payment_count: 0, recent_expenses: [], spend_by_category: [] } }));
      await page.route("**/api/expenses**", (route) => route.fulfill({ json: [] }));
      await page.route("**/api/reports**", (route) => route.fulfill({ json: [] }));
      await page.route("**/api/categories**", (route) => route.fulfill({ json: [] }));
      await page.route("**/api/inventory**", (route) => route.fulfill({ json: [] }));
      await page.route("**/api/insurance**", (route) => route.fulfill({ json: [] }));
      await page.goto(pg, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth, { timeout: 15000 });
    });
  }
}
