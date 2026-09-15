import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { APP_ORIGIN, CATEGORIES, DASHBOARD_DATA, EXPENSES, setupAuthMocks, USERS } from "../shared/mocks";

const EVIDENCE_DIR = "../docs/ux/mobile-ios-review/issue-47/after";

async function prepareLocaleTheme(page: Page, locale: "en" | "ro", theme: "light" | "dark") {
  await page.context().addCookies([
    { name: "lang", value: locale, url: APP_ORIGIN },
  ]);
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("theme", selectedTheme);
  }, theme);
}

async function mockExpenses(page: Page) {
  await page.route("**/api/expenses**", (route, request) => {
    if (new URL(request.url()).pathname.endsWith("/export")) {
      return route.fulfill({ body: "csv", contentType: "text/csv" });
    }
    return route.fulfill({
      json: {
        data: EXPENSES,
        total_elements: EXPENSES.length,
        total_pages: 1,
        page: 0,
        size: 20,
      },
    });
  });
  await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function hideNextDevOverlay(page: Page) {
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
}

async function expectNoSeriousAxeViolations(page: Page) {
  // Theme and status-badge transitions can leave axe sampling an in-between
  // composited color. Freeze motion so the check evaluates the settled UI.
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter(({ impact }) => impact === "critical" || impact === "serious");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe("Mobile expense layout (#47)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupAuthMocks(page, "user");
  });

  test("admin-disabled quick-add FAB leaves the bottom-bar Capture action available", async ({ page }) => {
    await page.route("**/api/settings/ui", (route) => route.fulfill({ json: { mobile_quick_add_fab_enabled: false } }));
    await page.route("**/api/dashboard**", (route) => route.fulfill({ json: DASHBOARD_DATA }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard", { waitUntil: "load" });

    await expect(page.locator('a[aria-label="Add New Expense"]')).not.toBeVisible();
    await expect(page.locator("#mobile-bottom-nav").getByRole("link", { name: "Capture" })).toBeVisible();
  });

  test("expense list is compact, preserves filter URLs, and fits two rows above navigation", async ({ page }) => {
    await mockExpenses(page);

    for (const viewport of [
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/expenses", { waitUntil: "load" });
      const rows = page.locator("[data-expense-row]");
      await expect(rows).toHaveCount(3);
      if (viewport.width < 768) {
        const first = await rows.nth(0).boundingBox();
        const second = await rows.nth(1).boundingBox();
        const bottomNav = await page.locator("#mobile-bottom-nav").boundingBox();
        expect(first?.y).toBeLessThanOrEqual(300);
        expect(second).not.toBeNull();
        if (second && bottomNav) expect(second.y + second.height).toBeLessThanOrEqual(bottomNav.y + 1);
      }
      await expectNoHorizontalOverflow(page);
    }
  });

  test("filter disclosure retains URL filtering and has an accessible reset/close path", async ({ page }) => {
    await mockExpenses(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/expenses", { waitUntil: "load" });

    const filterButton = page.getByRole("button", { name: /^Filters/ });
    await expect(filterButton).toHaveAttribute("aria-expanded", "false");
    await filterButton.click();
    await expect(page.getByRole("region", { name: "Filters" })).toBeVisible();
    await page.getByRole("button", { name: "Draft", exact: true }).click();
    await expect(page).toHaveURL(/status=draft/);
    await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();

    await page.getByRole("region", { name: "Filters" }).getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("region", { name: "Filters" })).not.toBeVisible();
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("region", { name: "Filters" }).getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(page.getByRole("button", { name: /^Filters$/ })).toHaveAttribute("aria-expanded", "true");
  });

  test("new expense puts amount first, keeps mobile fields at 16px, and blocks overlapping scans", async ({ page }) => {
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
    let scanRequests = 0;
    await page.route("**/api/ocr/scan", async (route) => {
      scanRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        json: {
          amount: 12.34,
          currency: "EUR",
          date: "2026-07-15",
          merchant: "Field Market",
          category_id: 3,
          raw_text: "FIELD MARKET 12.34 EUR",
        },
      });
    });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/expenses/new", { waitUntil: "load" });

    const amount = page.getByLabel(/Amount|Sumă/i).first();
    const currency = page.getByLabel(/Currency|Monedă/i).first();
    const merchant = page.getByLabel(/Merchant|Comerciant/i).first();
    const date = page.getByLabel(/Date|Data/i).first();
    const category = page.getByLabel(/Category|Categorie/i).first();
    await expect(amount).toBeVisible();
    const amountBox = await amount.boundingBox();
    expect(amountBox?.y).toBeLessThanOrEqual(300);

    for (const field of [amount, currency, merchant, date, category]) {
      await expect(field).toHaveCSS("font-size", "16px");
      const box = await field.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    const scanner = page.getByRole("group", { name: /Add a receipt|Adaugă un bon/i });
    const scannerBox = await scanner.boundingBox();
    expect(scannerBox?.height).toBeLessThan(110);
    await expect(page.getByText(/Additional details|Detalii suplimentare/i)).toBeVisible();
    await expect(page.getByLabel(/Description|Descriere/i)).not.toBeVisible();
    await page.getByText(/Additional details|Detalii suplimentare/i).click();
    await expect(page.getByLabel(/Description|Descriere/i)).toBeVisible();

    const scanInput = page.locator("#receipt-scan-input");
    const receipt = { name: "receipt.txt", mimeType: "text/plain", buffer: Buffer.from("receipt") };
    await scanInput.setInputFiles(receipt);
    await expect(scanner).toHaveAttribute("aria-busy", "true");
    await scanner.evaluate((element) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(["receipt"], "receipt.txt", { type: "text/plain" }));
      element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    });
    await scanInput.setInputFiles(receipt);
    await expect(amount).toHaveValue("12.34", { timeout: 5000 });
    expect(scanRequests).toBe(1);

    await page.setViewportSize({ width: 844, height: 390 });
    await expectNoHorizontalOverflow(page);
    for (const field of [amount, currency, merchant, date, category]) {
      await expect(field).toHaveCSS("font-size", "16px");
    }
    const landscapeNav = await page.locator("#mobile-bottom-nav").boundingBox();
    const landscapeAmount = await amount.boundingBox();
    expect(landscapeNav).not.toBeNull();
    expect(landscapeAmount).not.toBeNull();
    if (landscapeNav && landscapeAmount) {
      expect(landscapeAmount.y + landscapeAmount.height).toBeLessThanOrEqual(landscapeNav.y);
    }
    await expect(page.locator(".expense-form-actions")).toHaveCSS("position", "static");
    await expectNoSeriousAxeViolations(page);
  });

  test("OCR-created Expense is updated instead of recreated", async ({ page }) => {
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
    const requests: Array<{ method: string; url: string; postData?: string | null }> = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/expenses")) {
        requests.push({ method: request.method(), url: request.url(), postData: request.postData() });
      }
    });

    const scannedExpense = {
      id: 77,
      category_id: 3,
      category_name: "Meals",
      report_id: null,
      amount_original: 12.34,
      currency_original: "EUR",
      amount_eur: 12.34,
      fx_rate: 1,
      fx_rate_manual: false,
      tax_amount: 0,
      tax_rate: null,
      tax_amount_eur: 0,
      date: "2026-07-15",
      description: null,
      merchant: "Field Market",
      receipt_path: "receipts/77.jpg",
      receipts: [{ id: 88, expense_id: 77, original_name: "receipt.jpg", file_path: "receipts/77.jpg", created_at: "2026-07-15T10:00:00Z" }],
      status: "draft",
      raw_ocr_text: "FIELD MARKET 12.34 EUR",
      created_at: "2026-07-15T10:00:00Z",
      updated_at: "2026-07-15T10:00:00Z",
    };
    await page.route("**/api/ocr/scan", (route) => route.fulfill({
      json: {
        amount: 12.34,
        currency: "EUR",
        date: "2026-07-15",
        merchant: "Field Market",
        category_id: 3,
        raw_text: "FIELD MARKET 12.34 EUR",
        comparison_id: 9,
        expense_id: 77,
        receipt_id: 88,
      },
    }));
    await page.route("**/api/expenses/77", async (route, request) => {
      if (request.method() === "GET") {
        await route.fulfill({ json: scannedExpense });
        return;
      }
      if (request.method() === "PATCH") {
        const body = JSON.parse(request.postData() ?? "{}");
        await route.fulfill({ json: { ...scannedExpense, ...body, report_id: body.report_id ?? null } });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/expenses/77/receipts/88", (route) => route.fulfill({ body: "receipt", contentType: "image/jpeg" }));
    await page.route("**/api/expenses/77/receipts", (route) => route.fulfill({ status: 500, json: { detail: "unexpected source upload" } }));

    await page.goto("/expenses/new?reportId=2", { waitUntil: "load" });
    await page.locator("#receipt-scan-input").setInputFiles({
      name: "receipt.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("receipt"),
    });

    await expect(page.getByText("receipt.jpg").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Save changes|Salvează modificările/i })).toBeVisible();
    await page.getByLabel(/Merchant|Comerciant/i).fill("Reviewed Market");
    await page.getByRole("button", { name: /Save changes|Salvează modificările/i }).click();
    await expect(page).toHaveURL(/\/reports\/2$/);

    const creates = requests.filter((request) => request.method === "POST" && request.url.endsWith("/api/expenses"));
    const sourceUploads = requests.filter((request) => request.method === "POST" && request.url.includes("/api/expenses/77/receipts"));
    const patch = requests.find((request) => request.method === "PATCH" && request.url.endsWith("/api/expenses/77"));
    expect(creates).toHaveLength(0);
    expect(sourceUploads).toHaveLength(0);
    expect(patch).toBeDefined();
    expect(JSON.parse(patch?.postData ?? "{}")).toMatchObject({ merchant: "Reviewed Market", report_id: 2 });
  });

  test("receipt download inside the form does not submit or navigate", async ({ page }) => {
    const expense = {
      ...EXPENSES[1],
      id: 22,
      receipts: [{ id: 42, expense_id: 22, original_name: "receipt.jpg", file_path: "receipt.jpg", file_size: 10, created_at: "2026-07-15T10:00:00Z" }],
    };
    await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
    await page.route("**/api/expenses/22", (route) => route.fulfill({ json: expense }));
    await page.route("**/api/expenses/22/receipts/42", (route) => route.fulfill({ body: "receipt", contentType: "image/jpeg" }));
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/expenses/22/edit", { waitUntil: "load" });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "receipt.jpg" }).click();
    await download;
    expect(page.url()).toContain("/expenses/22/edit");
    await expect(page.getByRole("button", { name: /Save changes|Salvează modificările/i })).toBeVisible();
  });

  test("active bottom navigation remains readable in both themes", async ({ page }) => {
    await mockExpenses(page);
    await page.setViewportSize({ width: 375, height: 667 });
    for (const theme of ["light", "dark"] as const) {
      await prepareLocaleTheme(page, "ro", theme);
      await page.goto("/expenses", { waitUntil: "load" });
      const active = page.locator('#mobile-bottom-nav a[aria-current="page"]');
      await expect(active).toBeVisible();
      await page.waitForTimeout(300);
      expect(await active.evaluate((element) => getComputedStyle(element).fontSize)).toBe("11px");
      const activeColor = await active.evaluate((element) => getComputedStyle(element).color);
      expect(activeColor).not.toBe("rgb(194, 65, 12)");
      await expectNoSeriousAxeViolations(page);
    }
  });

  test("captures comparable EN/RO light/dark list and form evidence", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name !== "mobile-webkit", "Evidence is captured once with the WebKit mobile profile.");
    await mockExpenses(page);
    await page.unroute("**/api/auth/me");
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...USERS.user, language: "en" } }));
    let evidencePage = page;
    for (const locale of ["en", "ro"] as const) {
      if (locale === "ro") {
        await page.evaluate(() => localStorage.removeItem("xpenses_user_profile"));
        evidencePage = await page.context().newPage();
        await evidencePage.route("**/sw.js", (route) => route.abort());
        await setupAuthMocks(evidencePage, "user");
        await mockExpenses(evidencePage);
        await evidencePage.unroute("**/api/auth/me");
        await evidencePage.route("**/api/auth/me", (route) => route.fulfill({ json: { ...USERS.user, language: "ro" } }));
      }
      for (const theme of ["light", "dark"] as const) {
        for (const viewport of [
          { width: 375, height: 667, name: "375x667" },
          { width: 390, height: 844, name: "390x844" },
          { width: 844, height: 390, name: "844x390" },
          { width: 1280, height: 800, name: "1280x800" },
        ]) {
          await evidencePage.setViewportSize(viewport);
          await prepareLocaleTheme(evidencePage, locale, theme);
          await evidencePage.goto("/expenses", { waitUntil: "load" });
          const expenseData = viewport.width < 768 ? "[data-expense-row]" : "table tbody tr";
          await expect(evidencePage.locator(expenseData).first()).toBeVisible();
          await expect(evidencePage.locator("html")).toHaveAttribute("lang", locale);
          await hideNextDevOverlay(evidencePage);
          await evidencePage.screenshot({ path: `${EVIDENCE_DIR}/list-${locale}-${theme}-${viewport.name}.png` });

          await evidencePage.goto("/expenses/new", { waitUntil: "load" });
          if (viewport.width < 1024) {
            await expect(evidencePage.getByRole("tab", { name: locale === "ro" ? /Detalii/ : /Details/ })).toBeVisible();
          }
          await expect(evidencePage.getByLabel(/Amount|Sumă/i).first()).toBeVisible();
          await hideNextDevOverlay(evidencePage);
          await evidencePage.screenshot({ path: `${EVIDENCE_DIR}/new-expense-${locale}-${theme}-${viewport.name}.png` });
        }
      }
    }
  });
});
