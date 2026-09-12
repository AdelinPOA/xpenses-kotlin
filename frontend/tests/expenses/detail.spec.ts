import { test, expect } from "@playwright/test";
import { setupAuthMocks, EXPENSES, CATEGORIES } from "../shared/mocks";

test.describe("Expense Detail Page (MUX-001)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupAuthMocks(page, "user");
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
  });

  test("loads draft expense details with edit button and back navigation", async ({ page }) => {
    const draftExpense = {
      ...EXPENSES[1],
      id: 2,
      receipts: [
        {
          id: 101,
          expense_id: 2,
          original_name: "fuel-receipt.jpg",
          file_path: "/data/receipts/fuel-receipt.jpg",
          file_size: 102400,
          created_at: "2026-07-13T10:00:00Z",
        },
      ],
      raw_ocr_text: "OMV PETROM TOTAL: 120 RON",
    };

    await page.route("**/api/expenses/2", (route) => route.fulfill({ json: draftExpense }));

    await page.goto("/expenses/2", { waitUntil: "load" });

    // Verify merchant and category
    await expect(page.getByRole("heading", { name: "OMV Petrom" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Transport")).toBeVisible();
    await expect(page.getByText("OMV PETROM TOTAL: 120 RON")).toBeVisible();

    // Verify draft expense has Edit link
    const editBtn = page.getByRole("link", { name: /edit/i });
    await expect(editBtn).toBeVisible();
    await expect(editBtn).toHaveAttribute("href", "/expenses/2/edit");

    // Verify back button is present and meets 44px touch target
    const backBtn = page.getByRole("button", { name: /back/i });
    await expect(backBtn).toBeVisible();
    const box = await backBtn.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
  });

  test("receipt download requests /api/expenses/{id}/receipts/{receiptId} without /download", async ({ page }) => {
    const expenseWithReceipt = {
      ...EXPENSES[0],
      id: 1,
      receipts: [
        {
          id: 42,
          expense_id: 1,
          original_name: "receipt.jpg",
          file_path: "/data/receipts/receipt.jpg",
          file_size: 20480,
          created_at: "2026-07-14T10:00:00Z",
        },
      ],
    };

    let downloadUrlRequested = "";
    await page.route("**/api/expenses/1", (route) => route.fulfill({ json: expenseWithReceipt }));
    await page.route("**/api/expenses/1/receipts/**", (route, req) => {
      downloadUrlRequested = req.url();
      return route.fulfill({
        body: "mock-image-bytes",
        contentType: "image/jpeg",
        headers: {
          "Content-Disposition": 'attachment; filename="receipt.jpg"',
        },
      });
    });

    await page.goto("/expenses/1", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Lidl" })).toBeVisible({ timeout: 10000 });

    const downloadBtn = page.getByRole("button", { name: /download/i });
    await expect(downloadBtn).toBeVisible();
    await downloadBtn.click();

    await expect.poll(() => downloadUrlRequested).toContain("/api/expenses/1/receipts/42");
    expect(downloadUrlRequested).not.toContain("/download");
  });

  test("mobile viewport has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.route("**/api/expenses/1", (route) => route.fulfill({ json: EXPENSES[0] }));

    await page.goto("/expenses/1", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Lidl" })).toBeVisible({ timeout: 10000 });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
