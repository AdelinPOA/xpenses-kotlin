import { test, expect, type Page } from "@playwright/test";
import {
  setupAuthMocks,
  USERS, DASHBOARD_DATA, CATEGORIES, EXPENSES, REPORTS, REPORT_DETAIL,
  setupAdminMocks, setupInventoryMocks, setupInsuranceMocks,
} from "../shared/mocks";

const SCREENSHOT_DIR = "tests/ai-review/screenshots";

const VIEWPORTS = [
  { width: 1280, height: 800, name: "desktop" },
  { width: 375, height: 812, name: "mobile" },
] as const;

// ── mock setups ──────────────────────────────────────────────────────

async function setupListMocks(page: Page) {
  await page.route("**/api/expenses**", async (route) => {
    const url = route.request().url();
    const match = url.match(/\/api\/expenses\/(\d+)/);
    if (match) {
      const expense = EXPENSES.find(e => e.id === parseInt(match[1]));
      return route.fulfill({ json: expense ?? EXPENSES[0] });
    }
    return route.fulfill({ json: EXPENSES });
  });
  await page.route("**/api/categories**", (r) => r.fulfill({ json: CATEGORIES }));
  await page.route("**/api/dashboard**", (r) => r.fulfill({ json: DASHBOARD_DATA }));
  await page.route("**/api/reports**", async (route) => {
    const url = route.request().url();
    const match = url.match(/\/api\/reports\/(\d+)/);
    if (match) return route.fulfill({ json: REPORT_DETAIL });
    return route.fulfill({ json: REPORTS });
  });
  await setupAdminMocks(page);
}

async function setupApprovalsMocks(page: Page) {
  await page.route("**/api/reports**", async (route) => {
    const url = route.request().url();
    const match = url.match(/\/api\/reports\/(\d+)/);
    if (match) return route.fulfill({ json: REPORT_DETAIL });
    return route.fulfill({ json: REPORTS.filter(r => r.status === "submitted") });
  });
  await page.route("**/api/expenses**", (r) => r.fulfill({ json: EXPENSES }));
  await page.route("**/api/categories**", (r) => r.fulfill({ json: CATEGORIES }));
  await page.route("**/api/dashboard**", (r) => r.fulfill({ json: DASHBOARD_DATA }));
  await page.route("**/api/advances**", (r) => r.fulfill({ json: [] }));
}

async function setupPaymentsMocks(page: Page) {
  const paidReports = REPORTS.filter(r => r.status === "approved" || r.status === "paid");
  await page.route("**/api/reports**", async (route) => {
    const url = route.request().url();
    const match = url.match(/\/api\/reports\/(\d+)/);
    if (match) return route.fulfill({ json: { ...REPORT_DETAIL, status: "approved" } });
    return route.fulfill({ json: paidReports });
  });
  await page.route("**/api/expenses**", (r) => r.fulfill({ json: EXPENSES }));
  await page.route("**/api/categories**", (r) => r.fulfill({ json: CATEGORIES }));
  await page.route("**/api/dashboard**", (r) => r.fulfill({ json: DASHBOARD_DATA }));
}

async function setupAdvancesMocks(page: Page) {
  await page.route("**/api/advances**", (r) => r.fulfill({
    json: [{
      id: 1, report_id: 1, user_id: 4, user_display_name: "Technician One",
      report_title: "July Business Trip", status: "requested",
      amount_original: 500, currency_original: "EUR", amount_eur: 500,
      fx_rate: 1, requested_amount: 500, requested_currency: "EUR",
      date: "2026-07-14", description: "Travel advance",
      paid_by: null, paid_by_name: null, paid_at: null,
      rejected_by: null, rejected_by_name: null, rejected_at: null,
      created_at: "2026-07-14T00:00:00Z", updated_at: "2026-07-14T00:00:00Z",
    }],
  }));
  await page.route("**/api/reports**", (r) => r.fulfill({ json: REPORTS }));
  await page.route("**/api/expenses**", (r) => r.fulfill({ json: EXPENSES }));
  await page.route("**/api/categories**", (r) => r.fulfill({ json: CATEGORIES }));
}

async function setupReportDetailMocks(page: Page) {
  await page.route("**/api/reports**", async (route) => {
    const url = route.request().url();
    if (url.includes("/export") || url.includes("/receipts-zip") || url.includes("/export-csv") || url.includes("/mileage") || url.includes("/advances")) {
      return route.fulfill({ status: 200, json: [] });
    }
    const match = url.match(/\/api\/reports\/(\d+)/);
    if (match) return route.fulfill({ json: REPORT_DETAIL });
    return route.fulfill({ json: REPORTS });
  });
  await page.route("**/api/expenses**", (r) => r.fulfill({ json: EXPENSES }));
  await page.route("**/api/categories**", (r) => r.fulfill({ json: CATEGORIES }));
}

// ── page specs ────────────────────────────────────────────────────────

interface PageSpec {
  path: string;
  name: string;
  role: keyof typeof USERS;
  setup: (page: Page) => Promise<void>;
  waitFor?: string | RegExp;
}

const PAGES: PageSpec[] = [
  // ── Auth ──
  { path: "/login", name: "login", role: "user", setup: async () => {} },

  // ── Dashboard ──
  { path: "/dashboard", name: "dashboard", role: "user", setup: setupListMocks, waitFor: /total spent/i },

  // ── Expenses ──
  { path: "/expenses", name: "expenses", role: "user", setup: setupListMocks, waitFor: "Lidl" },
  { path: "/expenses/new", name: "expenses-new", role: "user", setup: setupListMocks, waitFor: "New Expense" },
  { path: "/expenses/1/edit", name: "expenses-edit", role: "user", setup: setupListMocks, waitFor: "Edit Expense" },

  // ── Reports ──
  { path: "/reports", name: "reports", role: "user", setup: setupListMocks, waitFor: "July Business Trip" },
  { path: "/reports/new", name: "reports-new", role: "user", setup: setupListMocks, waitFor: "New Report" },
  { path: "/reports/1", name: "reports-detail", role: "user", setup: setupReportDetailMocks, waitFor: "July Business Trip" },

  // ── Approvals ──
  { path: "/approvals", name: "approvals", role: "manager", setup: setupApprovalsMocks, waitFor: /approve|reject|pending/i },

  // ── Payments ──
  { path: "/payments", name: "payments", role: "cfo", setup: setupPaymentsMocks, waitFor: /pay|approve/i },

  // ── Advances ──
  { path: "/advances", name: "advances", role: "manager", setup: setupAdvancesMocks, waitFor: "Advance" },

  // ── Other ──
  { path: "/categories", name: "categories", role: "mod", setup: setupListMocks, waitFor: "Transport" },
  { path: "/inventory", name: "inventory", role: "user", setup: async (page) => { await setupListMocks(page); await setupInventoryMocks(page); }, waitFor: /inventory|asset/i },
  { path: "/insurance", name: "insurance", role: "user", setup: async (page) => { await setupListMocks(page); await setupInsuranceMocks(page); }, waitFor: /insurance|policy/i },
  { path: "/profile", name: "profile", role: "user", setup: setupListMocks, waitFor: /profile|display.*name|email/i },
  { path: "/profile/signature", name: "profile-signature", role: "user", setup: setupListMocks, waitFor: /signature|sign/i },

  // ── Admin ──
  { path: "/admin/email", name: "admin-email", role: "mod", setup: setupListMocks, waitFor: /smtp|email/i },
  { path: "/admin/imap", name: "admin-imap", role: "mod", setup: setupListMocks, waitFor: /imap|inbox/i },
  { path: "/admin/ldap", name: "admin-ldap", role: "mod", setup: setupListMocks, waitFor: /ldap|bind|base.*dn/i },
  { path: "/admin/ocr", name: "admin-ocr", role: "mod", setup: setupListMocks, waitFor: /gemini|ocr|api.*key/i },
  { path: "/admin/receipts", name: "admin-receipts", role: "mod", setup: setupListMocks, waitFor: /receipt|scan|import/i },
  { path: "/admin/settings", name: "admin-settings", role: "cfo", setup: setupListMocks, waitFor: /mileage|daily.*allowance|rate/i },
  { path: "/admin/storage", name: "admin-storage", role: "mod", setup: setupListMocks, waitFor: /storage|provider|local|s3/i },
  { path: "/admin/users", name: "admin-users", role: "mod", setup: setupListMocks, waitFor: /moderator|technician|manager/i },
];

// ── tests ─────────────────────────────────────────────────────────────

test.describe("AI visual review — full page screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  for (const spec of PAGES) {
    for (const vp of VIEWPORTS) {
      test(`[${vp.name}] ${spec.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });

        await setupAuthMocks(page, spec.role);
        await spec.setup(page);

        await page.goto(spec.path, { waitUntil: "load" });
        await page.waitForTimeout(2000);

        if (spec.waitFor) {
          try {
            await page.getByText(spec.waitFor).first().waitFor({ state: "visible", timeout: 10000 });
          } catch {
            // page may still be useful even if expected text not found
          }
        }

        await page.waitForTimeout(500);

        const hasOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );

        const filename = `${spec.name}--${vp.name}.png`;
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/${filename}`,
          fullPage: true,
        });

        expect.soft(hasOverflow, `${spec.name} at ${vp.name} should not overflow`).toBe(false);
      });
    }
  }
});
