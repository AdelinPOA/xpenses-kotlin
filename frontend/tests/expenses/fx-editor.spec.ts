import { test, expect } from "@playwright/test";
import { setupAuthMocks, setupCommonMocks, CATEGORIES } from "../shared/mocks";

test.describe("Expense form manual FX editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupAuthMocks(page, "user");
    await setupCommonMocks(page);
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
  });

  async function openManualEditor(page: import("@playwright/test").Page, amount: string, currency: string) {
    await page.goto("/expenses/new?mode=manual", { waitUntil: "load" });
    await page.locator("#expense-amount").fill(amount);
    await page.getByLabel("Currency").selectOption(currency);
    // The pencil toggle only shows for non-EUR currencies.
    await page.getByTitle("Edit rate manually").click();
  }

  test("defaults to debited-amount mode with EUR preselected", async ({ page }) => {
    await openManualEditor(page, "550", "UAH");
    const debitTab = page.getByRole("tab", { name: "Debited amount" });
    await expect(debitTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "FX rate" })).toHaveAttribute("aria-selected", "false");
    await expect(page.getByLabel("Debit currency")).toHaveValue("EUR");
    await expect(page.getByLabel("Final amount debited")).toBeVisible();
  });

  test("derives the FX rate from the final EUR amount and previews it", async ({ page }) => {
    await page.route("**/api/fx/quote**", (route) => route.fulfill({ json: { from_currency: "EUR", date: "2026-08-24", rate: 1 } }));
    await openManualEditor(page, "550", "UAH");
    await page.getByLabel("Final amount debited").fill("12.34");
    await expect(page.getByText("1 UAH = 0.022436 EUR · ≈ 12.34 EUR recorded")).toBeVisible();
  });

  test("converts a non-EUR debit via the quote endpoint", async ({ page }) => {
    // RON→EUR effective rate 0.2 → 61.70 RON ≈ 12.34 EUR → rate 12.34 / 550 = 0.022436
    await page.route("**/api/fx/quote?from=RON**", (route) => route.fulfill({ json: { from_currency: "RON", date: "2026-08-24", rate: 0.2 } }));
    await page.route("**/api/fx/quote?from=UAH**", (route) => route.fulfill({ json: { from_currency: "UAH", date: "2026-08-24", rate: 0.0225 } }));
    await openManualEditor(page, "550", "UAH");
    await page.getByLabel("Debit currency").selectOption("RON");
    await page.getByLabel("Final amount debited").fill("61.70");
    await expect(page.getByText("1 UAH = 0.022436 EUR · ≈ 12.34 EUR recorded")).toBeVisible();
    // The auto estimate would be 550 × 0.0225 = 12.375 EUR — well within 25%, so no warning.
    await expect(page.getByText(/differs strongly from the automatic estimate/)).toBeHidden();
  });

  test("original currency is not selectable as debit currency", async ({ page }) => {
    await openManualEditor(page, "550", "UAH");
    const values = await page.getByLabel("Debit currency").locator("option").allTextContents();
    expect(values).not.toContain("UAH");
    expect(values).toContain("EUR");
  });

  test("warns when the entered amount deviates more than 25% from the auto estimate", async ({ page }) => {
    await page.route("**/api/fx/quote**", (route) => route.fulfill({ json: { from_currency: "EUR", date: "2026-08-24", rate: 1 } }));
    await openManualEditor(page, "550", "UAH");
    await page.getByLabel("Final amount debited").fill("120");
    await expect(page.getByText(/differs strongly from the automatic estimate/)).toBeVisible();
  });

  test("raw-rate mode still works alongside", async ({ page }) => {
    await page.route("**/api/fx/quote**", (route) => route.fulfill({ json: { from_currency: "EUR", date: "2026-08-24", rate: 1 } }));
    await openManualEditor(page, "550", "UAH");
    await page.getByRole("tab", { name: "FX rate" }).click();
    const rateInput = page.getByLabel("FX Rate");
    await rateInput.fill("0.0223");
    await expect(page.getByText("1 UAH = 0.022300 EUR · ≈ 12.27 EUR recorded")).toBeVisible();
  });
});
