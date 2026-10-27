import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import en from "../../messages/en.json";
import ro from "../../messages/ro.json";
import { APP_ORIGIN, CATEGORIES, setupAuthMocks, USERS } from "../shared/mocks";

const pendingExpense = {
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
  receipt_path: "receipts/31.pdf",
  receipts: [{ id: 32, expense_id: 31, file_path: "receipts/31.pdf", original_name: "receipt.pdf", created_at: "2026-10-20T10:00:00Z" }],
  status: "draft",
  raw_ocr_text: "OCR MARKET 12.34 EUR",
  created_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-10-20T10:00:00Z",
  version: 7,
  verification_state: "PENDING",
  last_verified_at: null,
  last_verified_by_user_id: null,
};

const verifiedExpense = {
  ...pendingExpense,
  version: 8,
  verification_state: "VERIFIED",
  last_verified_at: "2026-10-20T10:10:00Z",
  last_verified_by_user_id: USERS.user.id,
};

async function setup(page: Page) {
  await page.context().addCookies([{ name: "lang", value: "en", url: APP_ORIGIN }]);
  await setupAuthMocks(page, "user");
  await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
  await page.route("**/api/ocr/jobs**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/expenses/31/receipts/32", (route) => route.fulfill({ body: "%PDF-test", contentType: "application/pdf" }));
}

async function routeCompletedCapture(page: Page) {
  await page.route("**/api/ocr/scan", async (route, request) => {
    expect(request.method()).toBe("POST");
    expect(await request.headerValue("idempotency-key")).toBeTruthy();
    await route.fulfill({ status: 202, json: { job_id: 17 } });
  });
  await page.route("**/api/ocr/status/17", (route) => route.fulfill({
    json: {
      job_id: 17,
      status: "completed",
      expense_id: 31,
      receipt_id: 32,
      result: { amount: 12.34, currency: "EUR", merchant: "OCR Market", date: "2026-10-20", warnings: [] },
    },
  }));
  await page.route("**/api/expenses/31", (route, request) => {
    if (request.method() === "GET") return route.fulfill({ json: pendingExpense });
    return route.continue();
  });
}

async function captureReceipt(page: Page) {
  await page.goto("/expenses/capture?reportId=2", { waitUntil: "load" });
  await page.locator('input[type="file"][accept=".jpg,.jpeg,.png,.pdf,.webp"]').setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-test"),
  });
  await expect(page).toHaveURL(/\/expenses\/31\/edit\?ocr_source_id=/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Check the receipt details" })).toBeVisible();
}

test.describe("single receipt capture and immediate review (#49)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setup(page);
  });

  test("a pending expense without its matching local and server OCR source stays on the edit form", async ({ page }) => {
    await page.route("**/api/expenses/31", (route) => route.fulfill({ json: pendingExpense }));
    await page.goto("/expenses/31/edit?ocr_source_id=spoofed-source", { waitUntil: "load" });
    await expect(page.getByLabel(/Amount/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Check the receipt details" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm Expense", exact: true })).toHaveCount(0);
  });

  test("historical and unrecoverable OCR jobs do not block a new capture", async ({ page }) => {
    await page.route("**/api/ocr/jobs**", (route) => route.fulfill({ json: [
      { job_id: 11, status: "COMPLETED", stage: "RECEIPT", expense_id: 31, receipt_id: 32, allowed_actions: ["view_expense"] },
      { job_id: 12, status: "UNRECOVERABLE", stage: "OCR", expense_id: null, receipt_id: null, allowed_actions: [] },
    ] }));
    await page.route("**/api/expenses/31", (route) => route.fulfill({ json: { ...pendingExpense, verification_state: "NOT_REQUIRED" } }));
    const historyRead = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/expenses/31");
    await page.goto("/expenses/capture", { waitUntil: "load" });
    await historyRead;
    await expect(page.getByRole("button", { name: /Refresh/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Take photo", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Choose file", exact: true })).toBeEnabled();
    await expect(page.getByRole("link", { name: /Resume review/i })).toHaveCount(0);
  });

  test("a rejected upload can be discarded locally so another file can be chosen", async ({ page }) => {
    await page.route("**/api/ocr/scan", (route) => route.fulfill({ status: 413, json: { detail: "File too large" } }));
    await page.goto("/expenses/capture", { waitUntil: "load" });
    await page.locator('input[type="file"][accept=".jpg,.jpeg,.png,.pdf,.webp"]').setInputFiles({
      name: "oversize.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-test"),
    });
    await expect(page.getByRole("button", { name: "Resume this receipt", exact: true })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Discard local file", exact: true }).click();
    await expect(page.getByRole("button", { name: "Choose file", exact: true })).toBeEnabled();
    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("button", { name: "Choose file", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Resume this receipt", exact: true })).toHaveCount(0);
  });

  for (const locale of ["en", "ro"] as const) {
    for (const theme of ["light", "dark"] as const) {
      for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
        test(`visual capture flow ${locale} ${theme} ${viewport.width}`, async ({ page }) => {
          test.skip(!process.env.CAPTURE_EVIDENCE_DIR, "Explicit visual evidence run only");
          const messages = locale === "ro" ? ro : en;
          await mkdir(process.env.CAPTURE_EVIDENCE_DIR!, { recursive: true });
          await page.setViewportSize(viewport);
          await page.context().addCookies([{ name: "lang", value: locale, url: APP_ORIGIN }]);
          await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...USERS.user, language: locale } }));
          await page.addInitScript((selectedTheme) => localStorage.setItem("theme", selectedTheme), theme);
          await page.emulateMedia({ colorScheme: theme });
          await routeCompletedCapture(page);
          await page.route("**/api/expenses/31/review", (route) => route.fulfill({ json: verifiedExpense }));
          await page.route("**/api/expenses**", (route, request) => new URL(request.url()).pathname === "/api/expenses"
            ? route.fulfill({ json: [verifiedExpense] }) : route.fallback());
          const shot = async (stage: string) => {
            await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
            await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
            // Exclude only the Next development-tools overlay, never product UI.
            await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
            await page.screenshot({ path: `${process.env.CAPTURE_EVIDENCE_DIR}/${stage}-${locale}-${theme}-${viewport.width}x${viewport.height}.png`, fullPage: true });
          };
          await page.goto("/expenses/capture", { waitUntil: "load" });
          const installHint = page.getByRole("button", { name: messages.pwa.ios_install_dismiss });
          if (await installHint.isVisible()) await installHint.click();
          await shot("capture");
          if (process.env.CAPTURE_BASELINE_EVIDENCE === "1") {
            await page.goto("/expenses/31/edit", { waitUntil: "load" });
            await expect(page.getByLabel(/Merchant|Comerciant/i).first()).toBeVisible();
          } else {
            await page.locator('input[type="file"][accept=".jpg,.jpeg,.png,.pdf,.webp"]').setInputFiles({ name: "receipt.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-test") });
            await expect(page.getByRole("heading", { name: messages.expenseReview.heading })).toBeVisible();
          }
          await shot("review");
          if (process.env.CAPTURE_BASELINE_EVIDENCE === "1") {
            await page.goto("/expenses?highlight=31", { waitUntil: "load" });
          } else {
            await page.getByRole("button", { name: messages.expenseReview.confirm_expense, exact: true }).click();
            await expect(page).toHaveURL(/\/expenses\?highlight=31$/);
          }
          await expect(page.locator("[data-expense-row]").first()).toBeVisible();
          await shot("list");
        });
      }
    }
  }

  test("new Expense choices keep receipt capture and manual entry distinct", async ({ page }) => {
    await page.goto("/expenses/new", { waitUntil: "load" });
    await expect(page.getByRole("link", { name: /Capture and review a receipt/i })).toHaveAttribute("href", "/expenses/capture");
    await page.getByRole("link", { name: /Enter details manually/i }).click();
    await expect(page).toHaveURL(/\/expenses\/new\?mode=manual/);
    await expect(page.getByLabel(/Amount/i).first()).toBeVisible();
    await expect(page.locator("#receipt-scan-input")).toHaveCount(0);
  });

  test("capture creates one durable draft, restores local corrections, and verifies only online", async ({ page }) => {
    await routeCompletedCapture(page);
    const reviewRequests: Array<{ key: string | null; body: Record<string, unknown> }> = [];
    await page.route("**/api/expenses/31/review", async (route, request) => {
      reviewRequests.push({
        key: await request.headerValue("idempotency-key"),
        body: request.postDataJSON() as Record<string, unknown>,
      });
      await route.fulfill({ json: verifiedExpense });
    });
    await page.route("**/api/expenses**", (route, request) => {
      if (new URL(request.url()).pathname === "/api/expenses" && request.method() === "GET") {
        return route.fulfill({ json: [verifiedExpense] });
      }
      return route.fallback();
    });

    await captureReceipt(page);
    await expect(page.getByLabel(/Merchant/i)).toHaveValue("OCR Market");
    await page.getByLabel(/Merchant/i).fill("Corrected Market");
    await expect(page.getByText(/Saved on this device — not saved on the server/i)).toBeVisible();

    await page.reload({ waitUntil: "load" });
    await expect(page.getByLabel(/Merchant/i)).toHaveValue("Corrected Market");

    await page.context().setOffline(true);
    await expect(page.getByRole("button", { name: "Confirm Expense" })).toBeDisabled();
    expect(reviewRequests).toHaveLength(0);
    await page.context().setOffline(false);
    await expect(page.getByRole("button", { name: "Confirm Expense" })).toBeEnabled();
    await page.getByRole("button", { name: "Confirm Expense" }).click();

    await expect(page).toHaveURL(/\/expenses\?highlight=31$/);
    await expect(page.locator('[data-expense-row][aria-current="true"]')).toBeVisible();
    expect(reviewRequests[0]?.key).toBeTruthy();
    expect(reviewRequests[0]?.body).toMatchObject({ expected_version: 7, confirm: true, values: { merchant: "Corrected Market" } });
  });

  test("the secondary destination opens the next capture only after server acknowledgement", async ({ page }) => {
    let acknowledged = false;
    await routeCompletedCapture(page);
    await page.route("**/api/expenses/31/review", async (route) => {
      acknowledged = true;
      await route.fulfill({ json: verifiedExpense });
    });

    await captureReceipt(page);
    await page.getByRole("button", { name: "Confirm and scan another" }).click();
    await expect(page).toHaveURL(/\/expenses\/capture\?reportId=2$/);
    expect(acknowledged).toBe(true);
    await expect(page.getByRole("heading", { name: "Capture a receipt" })).toBeVisible();
  });

  test("reload cannot rebase local corrections silently onto a newer server version", async ({ page }) => {
    await routeCompletedCapture(page);
    let changedElsewhere = false;
    let reviewWrites = 0;
    await page.route("**/api/expenses/31", (route) => route.fulfill({ json: changedElsewhere
      ? { ...pendingExpense, version: 9, merchant: "New server merchant" }
      : pendingExpense }));
    await page.route("**/api/expenses/31/review", (route) => { reviewWrites += 1; return route.fulfill({ json: verifiedExpense }); });
    await captureReceipt(page);
    await page.getByLabel(/Merchant/i).fill("Older local correction");
    await expect(page.getByText(/Saved on this device — not saved on the server/i)).toBeVisible();
    changedElsewhere = true;
    await page.reload({ waitUntil: "load" });
    await expect(page.getByLabel(/Merchant/i)).toHaveValue("Older local correction");
    await expect(page.getByRole("button", { name: "Reload server version" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm Expense", exact: true })).toHaveCount(0);
    expect(reviewWrites).toBe(0);
    await page.getByRole("button", { name: "Reload server version" }).click();
    await expect(page.getByLabel(/Merchant/i)).toHaveValue("New server merchant");
  });

  test("a stale review preserves local edits until the user reloads the server version", async ({ page }) => {
    const latestExpense = { ...pendingExpense, version: 8, merchant: "Server Market" };
    let conflict = false;
    await routeCompletedCapture(page);
    await page.route("**/api/expenses/31", (route, request) => {
      if (request.method() === "GET") return route.fulfill({ json: conflict ? latestExpense : pendingExpense });
      return route.fallback();
    });
    await page.route("**/api/expenses/31/review", async (route) => {
      conflict = true;
      await route.fulfill({ status: 409, json: { detail: "Expense changed elsewhere.", current: latestExpense } });
    });

    await captureReceipt(page);
    await page.getByLabel(/Merchant/i).fill("My local correction");
    await page.getByRole("button", { name: "Confirm Expense" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Expense changed elsewhere/i })).toBeVisible();
    await expect(page.getByLabel(/Merchant/i)).toHaveValue("My local correction");
    await page.getByRole("button", { name: "Reload server version" }).click();
    await expect(page.getByLabel(/Merchant/i)).toHaveValue("Server Market");
  });

  test("a report-link conflict preserves the Expense as unattached and visible", async ({ page }) => {
    await routeCompletedCapture(page);
    await page.route("**/api/expenses/31", (route, request) => request.method() === "GET"
      ? route.fulfill({ json: { ...pendingExpense, report_id: null } })
      : route.fallback());

    await captureReceipt(page);
    await expect(page.getByText(/kept unattached because the requested Report is no longer available/i)).toBeVisible();
  });

  test("ambiguous review response retries the exact versioned request with its original key", async ({ page }) => {
    await routeCompletedCapture(page);
    const attempts: Array<{ key: string | null; body: unknown }> = [];
    await page.route("**/api/expenses/31/review", async (route, request) => {
      attempts.push({ key: await request.headerValue("idempotency-key"), body: request.postDataJSON() });
      if (attempts.length === 1) return route.abort("connectionreset");
      await route.fulfill({ json: verifiedExpense });
    });
    await page.route("**/api/expenses**", (route, request) => {
      if (new URL(request.url()).pathname === "/api/expenses" && request.method() === "GET") {
        return route.fulfill({ json: [verifiedExpense] });
      }
      return route.fallback();
    });

    await captureReceipt(page);
    await page.getByRole("button", { name: "Confirm Expense" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /server response could not be confirmed/i })).toBeVisible();
    const retry = page.getByRole("button", { name: "Retry the same saved request" });
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(page).toHaveURL(/\/expenses\?highlight=31$/);
    expect(attempts).toHaveLength(2);
    expect(attempts[1].key).toBe(attempts[0].key);
    expect(attempts[1].body).toEqual(attempts[0].body);
  });

  test("a confirmed server write with a lost response remains resolvable after reload", async ({ page }) => {
    await routeCompletedCapture(page);
    let committed = false;
    const attempts: Array<{ key: string | null; body: unknown }> = [];
    await page.route("**/api/expenses/31", (route) => route.fulfill({ json: committed ? verifiedExpense : pendingExpense }));
    await page.route("**/api/expenses/31/review", async (route, request) => {
      attempts.push({ key: await request.headerValue("idempotency-key"), body: request.postDataJSON() });
      committed = true;
      if (attempts.length === 1) return route.abort("connectionreset");
      return route.fulfill({ json: verifiedExpense });
    });
    await captureReceipt(page);
    await page.getByRole("button", { name: "Confirm Expense", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry the same saved request" })).toBeVisible();
    await page.reload({ waitUntil: "load" });
    await page.getByRole("button", { name: "Retry the same saved request" }).click();
    await expect(page).toHaveURL(/\/expenses\?highlight=31$/);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
  });

  test("a confirmation replay returning PENDING never navigates as verified", async ({ page }) => {
    await routeCompletedCapture(page);
    let attempts = 0;
    await page.route("**/api/expenses/31/review", async (route) => {
      attempts += 1;
      if (attempts === 1) return route.abort("connectionreset");
      await route.fulfill({ json: { ...pendingExpense, version: 9, merchant: "Changed after confirmation" } });
    });
    await captureReceipt(page);
    await page.getByRole("button", { name: "Confirm Expense", exact: true }).click();
    await page.getByRole("button", { name: "Retry the same saved request" }).click();
    await expect(page.getByRole("button", { name: "Reload server version" })).toBeVisible();
    await expect(page).toHaveURL(/\/expenses\/31\/edit\?ocr_source_id=/);
    expect(attempts).toBe(2);
  });

  test("the confirmed Expense is pinned even outside the current page and filters", async ({ page }) => {
    const pageRows = Array.from({ length: 20 }, (_, index) => ({ ...verifiedExpense, id: 100 + index, merchant: `Newer expense ${index}` }));
    await page.route("**/api/expenses**", (route, request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/expenses/31") return route.fulfill({ json: { ...verifiedExpense, merchant: "Older confirmed receipt" } });
      if (pathname === "/api/expenses") return route.fulfill({ json: { data: pageRows, page: 0, size: 20, total_pages: 4, total_elements: 80 } });
      return route.fallback();
    });
    await page.goto("/expenses?highlight=31&status=paid&page=2", { waitUntil: "load" });
    await expect(page.locator('[data-expense-row][aria-current="true"]')).toContainText("Older confirmed receipt");
    await expect(page.locator('[data-expense-row][aria-current="true"]')).toBeInViewport();
  });

  test("a same-owner source ID from another Expense never restores or deletes its corrections", async ({ page }) => {
    await routeCompletedCapture(page);
    await page.route("**/api/expenses/32", (route) => route.fulfill({ json: { ...pendingExpense, id: 32, merchant: "Other server merchant" } }));
    await page.route("**/api/expenses/32/review", (route) => route.fulfill({ json: { ...verifiedExpense, id: 32, merchant: "Other server merchant" } }));
    await captureReceipt(page);
    const originalUrl = page.url();
    const sourceId = new URL(originalUrl).searchParams.get("ocr_source_id");
    await page.getByLabel(/Merchant/i).fill("Retain first Expense correction");
    await expect(page.getByText(/Saved on this device — not saved on the server/i)).toBeVisible();
    await page.goto(`/expenses/32/edit?ocr_source_id=${sourceId}`, { waitUntil: "load" });
    await expect(page.getByLabel(/Merchant/i)).toHaveValue("Other server merchant");
    await page.getByRole("button", { name: "Confirm Expense", exact: true }).click();
    await expect(page).toHaveURL(/\/expenses\?highlight=32$/);
    await page.goto(originalUrl, { waitUntil: "load" });
    await expect(page.getByLabel(/Merchant/i)).toHaveValue("Retain first Expense correction");
  });

  test("partial promotion completes the same Receipt without replacing its Expense", async ({ page }) => {
    let completed = false;
    await page.route("**/api/ocr/jobs**", (route) => route.fulfill({ json: completed ? [] : [{
      job_id: 17, status: "PERMANENT_FAILURE", stage: "RECEIPT", expense_id: 31, receipt_id: null,
      allowed_actions: ["complete_manually", "view_expense"], report_link_status: "NOT_REQUESTED",
    }] }));
    await page.route("**/api/expenses/31", (route) => route.fulfill({ json: completed ? pendingExpense : { ...pendingExpense, receipts: [] } }));
    await page.route("**/api/ocr/jobs/17/complete-manually", (route, request) => {
      expect(request.postDataJSON()).toEqual({});
      completed = true;
      return route.fulfill({ status: 202, json: { job_id: 17, status: "PROCESSING" } });
    });
    await page.route("**/api/ocr/status/17", (route) => route.fulfill({ json: { job_id: 17, status: "completed", expense_id: 31, receipt_id: 32, result: { amount: 12.34, currency: "EUR" } } }));
    await page.goto("/expenses/capture", { waitUntil: "load" });
    await page.getByRole("button", { name: "Complete Expense manually", exact: true }).click();
    const region = page.getByRole("region", { name: "Complete Expense manually" });
    await expect(region.getByLabel(/Amount/i)).toHaveCount(0);
    await region.getByRole("button", { name: "Complete Expense manually", exact: true }).click();
    await expect(page).toHaveURL(/\/expenses\/31\/edit\?ocr_source_id=/);
  });

  test("server recovery manually completes the same OCR job without another scan", async ({ page }) => {
    let jobsRead = 0;
    let jobStatus = "PERMANENT_FAILURE";
    let scanRequests = 0;
    const completions: Array<{ key: string | null; body: unknown }> = [];
    await page.route("**/api/ocr/jobs**", (route) => {
      jobsRead += 1;
      route.fulfill({ json: jobStatus === "PERMANENT_FAILURE" ? [{
        job_id: 17,
        status: "PERMANENT_FAILURE",
        stage: "OCR",
        error_code: "OCR_PROCESSING_FAILED",
        error_message: "OCR processing failed. You can retry or enter the Expense manually.",
        retryable: true,
        allowed_actions: ["retry", "complete_manually"],
        expires_at: "2026-11-20T00:00:00Z",
        expense_id: null,
        receipt_id: null,
        report_id: 2,
        report_link_status: "PENDING",
      }] : [] });
    });
    await page.route("**/api/ocr/scan", async (route) => { scanRequests += 1; await route.fulfill({ status: 500 }); });
    await page.route("**/api/ocr/jobs/17/complete-manually", async (route, request) => {
      completions.push({ key: await request.headerValue("idempotency-key"), body: request.postDataJSON() });
      jobStatus = "PROCESSING";
      await route.fulfill({ status: 202, json: { job_id: 17, status: "PROCESSING", retryable: false, allowed_actions: [] } });
    });
    await page.route("**/api/ocr/status/17", (route) => route.fulfill({ json: jobStatus === "PERMANENT_FAILURE" ? {
      job_id: 17, status: "failed", error: "OCR processing failed",
    } : {
      job_id: 17, status: "completed", expense_id: 31, receipt_id: 32,
      result: { amount: 22, currency: "EUR", date: "2026-10-20", merchant: "Manual Recovery", warnings: [] },
    } }));
    await page.route("**/api/expenses/31", (route, request) => request.method() === "GET" ? route.fulfill({ json: pendingExpense }) : route.continue());

    await page.goto("/expenses/capture", { waitUntil: "load" });
    await page.getByRole("button", { name: "Complete Expense manually" }).first().click();
    const form = page.getByRole("region", { name: "Complete Expense manually" });
    await form.getByLabel(/Amount/i).fill("22.00");
    await form.getByLabel(/Merchant/i).fill("Manual Recovery");
    await form.getByRole("button", { name: "Complete Expense manually" }).click();
    await expect(page).toHaveURL(/\/expenses\/31\/edit\?ocr_source_id=/, { timeout: 15_000 });
    expect(scanRequests).toBe(0);
    expect(completions[0]?.key).toBeTruthy();
    expect(completions[0]?.body).toMatchObject({ values: { amount: 22, currency: "EUR", merchant: "Manual Recovery" } });
    expect(jobsRead).toBeGreaterThan(0);
  });
});
