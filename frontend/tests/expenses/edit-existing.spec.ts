import { test, expect } from "@playwright/test";
import {
  APP_ORIGIN,
  CATEGORIES,
  REPORT_DETAIL,
  USERS,
  setupAuthMocks,
} from "../shared/mocks";

const initialExpense = {
  id: 31,
  user_id: USERS.user.id,
  category_id: 3,
  category_name: "Meals",
  report_id: 2,
  amount_original: 12.34,
  currency_original: "EUR",
  amount_eur: 12.34,
  fx_rate: 1,
  fx_rate_manual: false,
  tax_amount: 0,
  tax_rate: null,
  tax_amount_eur: 0,
  date: "2026-10-20",
  description: "Lunch",
  merchant: "OCR Market",
  receipt_path: null,
  receipts: [],
  status: "draft",
  raw_ocr_text: null,
  created_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-10-20T10:00:00Z",
  version: 7,
  verification_state: "PENDING",
  last_verified_at: null,
  last_verified_by_user_id: null,
};

test.describe("existing Expense editing", () => {
  test("pending existing Expense uses the form and report-origin edit saves then returns without reassociation", async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await page.context().addCookies([{ name: "lang", value: "en", url: APP_ORIGIN }]);
    await setupAuthMocks(page, "user");
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));

    let savedExpense = initialExpense;
    let patchBody: Record<string, unknown> | null = null;
    await page.route("**/api/expenses/31", async (route, request) => {
      if (request.method() === "PATCH") {
        const update = request.postDataJSON() as Partial<typeof initialExpense>;
        patchBody = update;
        savedExpense = { ...savedExpense, ...update, updated_at: "2026-10-21T10:00:00Z" };
        return route.fulfill({ json: savedExpense });
      }
      return route.fulfill({ json: savedExpense });
    });
    await page.route("**/api/reports/2", (route) => route.fulfill({
      json: { ...REPORT_DETAIL, id: 2, status: "draft", expenses: [savedExpense] },
    }));

    await page.goto("/expenses/31/edit?return_report_id=2", { waitUntil: "load" });
    await expect(page.getByLabel(/Merchant/i)).toHaveValue("OCR Market");
    await expect(page.getByRole("heading", { name: "Check the receipt details" })).toHaveCount(0);

    await page.getByLabel(/Merchant/i).fill("Updated Merchant");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(/\/reports\/2$/);
    await expect(page.getByRole("cell", { name: "Updated Merchant", exact: true })).toBeVisible();
    expect(savedExpense.report_id).toBe(2);
    expect(patchBody).not.toHaveProperty("report_id");
    expect(savedExpense.verification_state).toBe("PENDING");
  });

  test("a failed receipt delete stays on the form and retries only the unfinished receipt operation", async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await page.context().addCookies([{ name: "lang", value: "en", url: APP_ORIGIN }]);
    await setupAuthMocks(page, "user");
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));

    let savedExpense = {
      ...initialExpense,
      receipts: [{ id: 32, expense_id: 31, file_path: "receipts/31.pdf", original_name: "receipt.pdf", created_at: "2026-10-20T10:00:00Z" }],
    };
    let deleteAttempts = 0;
    await page.route("**/api/expenses/31", async (route, request) => {
      if (request.method() === "PATCH") {
        savedExpense = { ...savedExpense, ...request.postDataJSON() };
        return route.fulfill({ json: savedExpense });
      }
      return route.fulfill({ json: savedExpense });
    });
    await page.route("**/api/expenses/31/receipts/32", (route, request) => {
      if (request.method() !== "DELETE") {
        return route.fulfill({ body: "%PDF-test", contentType: "application/pdf" });
      }
      deleteAttempts += 1;
      if (deleteAttempts === 1) {
        return route.fulfill({ status: 500, json: { detail: "Temporary receipt delete failure" } });
      }
      savedExpense = { ...savedExpense, receipts: [] };
      return route.fulfill({ status: 204, body: "" });
    });
    await page.route("**/api/reports/2", (route) => route.fulfill({
      json: { ...REPORT_DETAIL, id: 2, status: "draft", expenses: [savedExpense] },
    }));

    await page.goto("/expenses/31/edit?return_report_id=2", { waitUntil: "load" });
    await page.getByRole("button", { name: "Remove receipt" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator('[role="alert"]').filter({ hasText: "Expense saved, but some receipt changes could not be completed" })).toBeVisible();
    await expect(page).toHaveURL(/\/expenses\/31\/edit/);
    expect(deleteAttempts).toBe(1);

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/reports\/2$/);
    expect(deleteAttempts).toBe(2);
  });

  test("report refresh failure returns to a retryable state without presenting stale data as fresh", async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await page.context().addCookies([{ name: "lang", value: "en", url: APP_ORIGIN }]);
    await setupAuthMocks(page, "user");
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
    await page.route("**/api/expenses/31", (route, request) =>
      request.method() === "PATCH"
        ? route.fulfill({ json: { ...initialExpense, merchant: "Updated Merchant" } })
        : route.fulfill({ json: initialExpense }),
    );
    await page.route("**/api/reports/2", (route) => route.fulfill({
      status: 503,
      json: { detail: "Report refresh unavailable" },
    }));

    await page.goto("/expenses/31/edit?return_report_id=2", { waitUntil: "load" });
    await page.getByLabel(/Merchant/i).fill("Updated Merchant");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(/\/reports\/2$/);
    await expect(page.locator("#main-content").getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Updated Merchant")).toHaveCount(0);
  });

  test("mismatched report return context falls back to Expenses without changing membership", async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await page.context().addCookies([{ name: "lang", value: "en", url: APP_ORIGIN }]);
    await setupAuthMocks(page, "user");
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
    await page.route("**/api/expenses/31", (route) => route.fulfill({ json: initialExpense }));

    await page.goto("/expenses/31/edit?return_report_id=99", { waitUntil: "load" });
    await expect(page.getByLabel(/Merchant/i)).toHaveValue("OCR Market");
    await page.getByLabel(/Merchant/i).fill("Updated Merchant");
    await page.route("**/api/expenses/31", (route, request) =>
      request.method() === "PATCH"
        ? route.fulfill({ json: { ...initialExpense, merchant: "Updated Merchant" } })
        : route.fulfill({ json: initialExpense }),
    );
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/expenses$/);
  });
});
