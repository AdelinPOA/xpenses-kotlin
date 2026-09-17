import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  APP_ORIGIN,
  CATEGORIES,
  DASHBOARD_DATA,
  EXPENSES,
  setupAuthMocks,
  USERS,
} from "../shared/mocks";

const EVIDENCE_DIR = "../docs/ux/mobile-ios-review/issue-47/after";

async function prepareLocaleTheme(
  page: Page,
  locale: "en" | "ro",
  theme: "light" | "dark",
) {
  await page
    .context()
    .addCookies([{ name: "lang", value: locale, url: APP_ORIGIN }]);
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
  await page.route("**/api/categories**", (route) =>
    route.fulfill({ json: CATEGORIES }),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
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
    content:
      "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter(
    ({ impact }) => impact === "critical" || impact === "serious",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe("Mobile expense layout (#47)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupAuthMocks(page, "user");
  });

  test("authenticated mobile routes hydrate without React mismatch errors", async ({
    page,
  }) => {
    await mockExpenses(page);
    const hydrationErrors: string[] = [];
    const isHydrationError = (message: string) =>
      /hydration failed|hydration mismatch/i.test(message);

    page.on("pageerror", (error) => {
      if (isHydrationError(error.message)) hydrationErrors.push(error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error" && isHydrationError(message.text())) {
        hydrationErrors.push(message.text());
      }
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForTimeout(300);

    expect(hydrationErrors).toEqual([]);
  });

  test("admin-disabled quick-add FAB leaves the bottom-bar Capture action available", async ({
    page,
  }) => {
    await page.route("**/api/settings/ui", (route) =>
      route.fulfill({ json: { mobile_quick_add_fab_enabled: false } }),
    );
    await page.route("**/api/dashboard**", (route) =>
      route.fulfill({ json: DASHBOARD_DATA }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard", { waitUntil: "load" });

    await expect(
      page.locator('a[aria-label="Add New Expense"]'),
    ).not.toBeVisible();
    await expect(
      page.locator("#mobile-bottom-nav").getByRole("link", { name: "Capture" }),
    ).toBeVisible();
  });

  test("admin-enabled quick-add FAB is visible and opens a new Expense", async ({
    page,
  }) => {
    await page.route("**/api/settings/ui", (route) =>
      route.fulfill({ json: { mobile_quick_add_fab_enabled: true } }),
    );
    await page.route("**/api/dashboard**", (route) =>
      route.fulfill({ json: DASHBOARD_DATA }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard", { waitUntil: "load" });

    const fab = page.locator('a[aria-label="Add New Expense"]:visible');
    await expect(fab).toHaveCount(1);
    await expect(fab).toHaveAttribute("href", "/expenses/new");
    await fab.click();
    await expect(page).toHaveURL(/\/expenses\/new$/);
  });

  test("expense list is compact, preserves filter URLs, and fits two rows above navigation", async ({
    page,
  }) => {
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
        const bottomNav = await page
          .locator("#mobile-bottom-nav")
          .boundingBox();
        expect(first?.y).toBeLessThanOrEqual(300);
        expect(second).not.toBeNull();
        if (second && bottomNav)
          expect(second.y + second.height).toBeLessThanOrEqual(bottomNav.y + 1);
      }
      await expectNoHorizontalOverflow(page);
    }
  });

  test("filter disclosure retains URL filtering and has an accessible reset/close path", async ({
    page,
  }) => {
    await mockExpenses(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/expenses", { waitUntil: "load" });

    const filterButton = page.getByRole("button", { name: /^Filters/ });
    await expect(filterButton).toHaveAttribute("aria-expanded", "false");
    await filterButton.click();
    await expect(page.getByRole("region", { name: "Filters" })).toBeVisible();
    await page.getByRole("button", { name: "Draft", exact: true }).click();
    await expect(page).toHaveURL(/status=draft/);
    await expect(
      page.getByRole("button", { name: "Filters (1)" }),
    ).toBeVisible();

    await page
      .getByRole("region", { name: "Filters" })
      .getByRole("button", { name: "Close" })
      .click();
    await expect(
      page.getByRole("region", { name: "Filters" }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page
      .getByRole("region", { name: "Filters" })
      .getByRole("button", { name: "Clear filters" })
      .click();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(
      page.getByRole("button", { name: /^Filters$/ }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("new expense puts amount first, keeps mobile fields at 16px, and blocks overlapping scans", async ({
    page,
  }) => {
    await page.route("**/api/categories**", (route) =>
      route.fulfill({ json: CATEGORIES }),
    );
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
          expense_id: 77,
          receipt_id: 88,
        },
      });
    });
    await page.route("**/api/expenses/77", (route) =>
      route.fulfill({
        json: {
          id: 77,
          amount_original: 12.34,
          currency_original: "EUR",
          date: "2026-07-15",
          merchant: "Field Market",
          receipts: [],
          report_id: null,
          fx_rate: 1,
          fx_rate_manual: false,
        },
      }),
    );
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
    const scanner = page.getByRole("group", {
      name: /Add a receipt|Adaugă un bon/i,
    });
    const scannerBox = await scanner.boundingBox();
    expect(scannerBox?.height).toBeLessThan(110);
    await expect(
      page.getByText(/Additional details|Detalii suplimentare/i),
    ).toBeVisible();
    await expect(page.getByLabel(/Description|Descriere/i)).not.toBeVisible();
    await page.getByText(/Additional details|Detalii suplimentare/i).click();
    await expect(page.getByLabel(/Description|Descriere/i)).toBeVisible();

    const scanInput = page.locator("#receipt-scan-input");
    const receipt = {
      name: "receipt.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("receipt"),
    };
    await scanInput.setInputFiles(receipt);
    await expect(scanner).toHaveAttribute("aria-busy", "true");
    await scanner.evaluate((element) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(
        new File(["receipt"], "receipt.txt", { type: "text/plain" }),
      );
      element.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
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
      expect(landscapeAmount.y + landscapeAmount.height).toBeLessThanOrEqual(
        landscapeNav.y,
      );
    }
    await expect(page.locator(".expense-form-actions")).toHaveCSS(
      "position",
      "static",
    );
    await expectNoSeriousAxeViolations(page);
  });

  test("new expense cannot submit while receipt OCR is scanning", async ({
    page,
  }) => {
    await page.route("**/api/categories**", (route) =>
      route.fulfill({ json: CATEGORIES }),
    );
    let releaseScan: () => void = () => {};
    const scanRelease = new Promise<void>((resolve) => {
      releaseScan = resolve;
    });
    await page.route("**/api/ocr/scan", async (route) => {
      await scanRelease;
      try {
        await route.fulfill({
          json: {
            amount: 12.34,
            currency: "EUR",
            date: "2026-07-15",
            merchant: "Field Market",
          },
        });
      } catch {
        // The page may be closed after the assertion releases the request.
      }
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/expenses/new", { waitUntil: "load" });
    await page
      .getByLabel(/Amount|Sumă/i)
      .first()
      .fill("12.34");

    const scanner = page.getByRole("group", {
      name: /Add a receipt|Adaugă un bon/i,
    });
    await page.locator("#receipt-scan-input").setInputFiles({
      name: "pending-receipt.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("pending receipt"),
    });
    await expect(scanner).toHaveAttribute("aria-busy", "true");

    try {
      await expect(
        page.getByRole("button", {
          name: /Create expense|Creează cheltuială/i,
        }),
      ).toBeDisabled();
    } finally {
      releaseScan();
    }
  });

  test("new expense aborts receipt OCR when navigating away", async ({
    page,
  }) => {
    await page.route("**/api/categories**", (route) =>
      route.fulfill({ json: CATEGORIES }),
    );
    let scanWasAborted = false;
    page.on("requestfailed", (request) => {
      if (request.url().includes("/api/ocr/scan")) scanWasAborted = true;
    });
    let releaseScan: () => void = () => {};
    const scanRelease = new Promise<void>((resolve) => {
      releaseScan = resolve;
    });
    await page.route("**/api/ocr/scan", async (route) => {
      await scanRelease;
      try {
        await route.fulfill({
          json: {
            amount: 12.34,
            currency: "EUR",
            date: "2026-07-15",
            merchant: "Field Market",
          },
        });
      } catch {
        scanWasAborted = true;
      }
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/expenses/new", { waitUntil: "load" });
    await page.locator("#receipt-scan-input").setInputFiles({
      name: "unmounted-receipt.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("unmounted receipt"),
    });
    await expect(
      page.getByRole("group", { name: /Add a receipt|Adaugă un bon/i }),
    ).toHaveAttribute("aria-busy", "true");

    await page.getByRole("link", { name: "Expenses", exact: true }).click();
    await expect(page).toHaveURL(/\/expenses$/);
    releaseScan();
    await expect.poll(() => scanWasAborted).toBe(true);
  });

  test("batch capture can cancel one OCR source and continue with another", async ({
    page,
  }) => {
    await page.route("**/api/settings/ui", (route) =>
      route.fulfill({ json: { mobile_quick_add_fab_enabled: false } }),
    );
    await page.addInitScript(() => {
      const revokedObjectUrls: string[] = [];
      Object.defineProperty(window, "__revokedObjectUrls", {
        value: revokedObjectUrls,
        configurable: true,
      });
      const revokeObjectURL = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url: string) => {
        revokedObjectUrls.push(url);
        revokeObjectURL(url);
      };
    });
    let scanCount = 0;
    let cancelRequests = 0;
    await page.route("**/api/ocr/jobs/101", async (route, request) => {
      if (request.method() === "DELETE") cancelRequests += 1;
      await route.fulfill({ status: 204 });
    });
    await page.route("**/api/ocr/status/first", (route) =>
      route.fulfill({ json: { status: "processing" } }),
    );
    await page.route("**/api/ocr/scan", async (route) => {
      scanCount += 1;
      if (scanCount === 1) {
        await route.fulfill({
          status: 202,
          json: { status_url: "/ocr/status/first", job_id: 101 },
        });
        return;
      }
      await route.fulfill({
        json: {
          amount: 12.34,
          currency: "EUR",
          tax_amount: 0,
          tax_rate: null,
          date: "2026-07-15",
          merchant: "Field Market",
          category_id: 3,
          description: "Supplies",
          raw_text: "FIELD MARKET 12.34 EUR",
          confidence: 1,
          warnings: [],
          expense_id: 77,
          receipt_id: 88,
        },
      });
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/expenses/capture", { waitUntil: "load" });

    const cameraInput = page.locator('input[type="file"][accept="image/*"]');
    await cameraInput.setInputFiles({
      name: "first-receipt.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("first receipt"),
    });
    const firstItem = page.getByText("first-receipt.txt").first();
    await expect(firstItem).toBeVisible();

    const cancel = page.getByRole("button", {
      name: /^(Cancel|Anulează)(:|$)/,
    });
    await expect(cancel).toBeVisible();
    await cancel.click();
    await expect(firstItem).not.toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __revokedObjectUrls: string[] })
            .__revokedObjectUrls.length,
      ),
    ).toBe(1);
    await expect.poll(() => cancelRequests).toBe(1);

    await cameraInput.setInputFiles({
      name: "second-receipt.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("second receipt"),
    });
    await expect(page.getByText("Field Market")).toBeVisible({ timeout: 5000 });
    const thumbnail = page.getByRole("button", {
      name: /View: Field Market|Vezi: Field Market/i,
    });
    await expect(thumbnail).toBeVisible();
    await thumbnail.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(scanCount).toBe(2);
  });

  test("batch capture cancellation during upload removes the item without an error", async ({
    page,
  }) => {
    let scanStarted = false;
    let releaseScan: () => void = () => {};
    const scanRelease = new Promise<void>((resolve) => {
      releaseScan = resolve;
    });
    await page.route("**/api/ocr/scan", async (route) => {
      scanStarted = true;
      await scanRelease;
      try {
        await route.fulfill({
          json: {
            amount: 12.34,
            currency: "EUR",
            date: "2026-07-15",
            merchant: "Field Market",
            expense_id: 77,
            receipt_id: 88,
          },
        });
      } catch {
        // The request is expected to be aborted by the cancellation under test.
      }
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/expenses/capture", { waitUntil: "load" });

    const cameraInput = page.locator('input[type="file"][accept="image/*"]');
    await cameraInput.setInputFiles({
      name: "upload-cancelled.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("upload cancelled"),
    });
    const item = page.getByText("upload-cancelled.txt").first();
    await expect(item).toBeVisible();
    await expect.poll(() => scanStarted).toBe(true);

    await page.getByRole("button", { name: /^(Cancel|Anulează)(:|$)/ }).click();
    await expect(item).not.toBeVisible();
    releaseScan();
  });

  test("offline capture survives reload and resumes when connection returns", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      let online = false;
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => online,
      });
      Object.defineProperty(window, "__goOnline", {
        configurable: true,
        value: () => {
          online = true;
          window.dispatchEvent(new Event("online"));
        },
      });
    });

    let scanCount = 0;
    await page.route("**/api/ocr/scan", async (route) => {
      scanCount += 1;
      await route.fulfill({
        json: {
          amount: 12.34,
          currency: "EUR",
          date: "2026-07-15",
          merchant: "Field Market",
          expense_id: 77,
          receipt_id: 88,
        },
      });
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/expenses/capture", { waitUntil: "load" });

    const cameraInput = page.locator('input[type="file"][accept="image/*"]');
    await cameraInput.setInputFiles({
      name: "offline-receipt.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("offline receipt"),
    });
    const item = page.getByText("offline-receipt.txt").first();
    await expect(item).toBeVisible();
    await expect(page.getByText("Waiting for connection…")).toBeVisible();
    expect(scanCount).toBe(0);

    await page.reload({ waitUntil: "load" });
    await expect(page.getByText("offline-receipt.txt").first()).toBeVisible();
    await expect(page.getByText("Waiting for connection…")).toBeVisible();
    expect(scanCount).toBe(0);

    await page.evaluate(() => {
      (window as unknown as { __goOnline: () => void }).__goOnline();
    });
    await expect(page.getByText("Field Market")).toBeVisible({
      timeout: 5000,
    });
    await expect.poll(() => scanCount).toBe(1);
  });

  test("batch capture surfaces OCR job failures", async ({ page }) => {
    await page.route("**/api/ocr/status/failure", (route) =>
      route.fulfill({
        json: { status: "failed", error: "OCR provider unavailable" },
      }),
    );
    await page.route("**/api/ocr/scan", (route) =>
      route.fulfill({
        status: 202,
        json: { status_url: "/ocr/status/failure" },
      }),
    );

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/expenses/capture", { waitUntil: "load" });

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "failed-receipt.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("failed receipt"),
    });
    await expect(
      page
        .locator('[role="alert"]')
        .filter({ hasText: "OCR provider unavailable" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("unpromoted OCR results do not trigger a second Receipt upload", async ({
    page,
  }) => {
    let expenseCreates = 0;
    let receiptUploads = 0;
    await page.route("**/api/ocr/scan", (route) =>
      route.fulfill({
        json: {
          amount: 12.34,
          currency: "EUR",
          date: "2026-07-15",
          merchant: "Field Market",
          raw_text: "FIELD MARKET 12.34 EUR",
        },
      }),
    );
    await page.route("**/api/expenses", async (route, request) => {
      if (request.method() === "POST") {
        expenseCreates += 1;
        await route.fulfill({
          json: {
            id: 77,
            amount_original: 12.34,
            currency_original: "EUR",
            amount_eur: 12.34,
            fx_rate: 1,
            fx_rate_manual: false,
            tax_amount: 0,
            tax_rate: null,
            date: "2026-07-15",
            merchant: "Field Market",
            description: null,
            category_id: null,
            report_id: null,
            status: "draft",
            receipts: [],
          },
        });
        return;
      }
      await route.fulfill({ json: [] });
    });
    await page.route("**/api/expenses/77/receipts", async (route, request) => {
      if (request.method() === "POST") receiptUploads += 1;
      await route.fulfill({ json: [] });
    });

    await page.goto("/expenses/new", { waitUntil: "load" });
    await page.locator("#receipt-scan-input").setInputFiles({
      name: "unpromoted-receipt.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("receipt"),
    });

    await expect(page.locator("#expense-form-error")).toContainText(
      "OCR job failed",
    );
    await page.locator("#expense-amount").fill("12.34");
    await page
      .getByRole("button", { name: /Create expense|Creează cheltuiala/i })
      .click();
    await expect.poll(() => expenseCreates).toBe(1);
    expect(receiptUploads).toBe(0);
  });

  test("OCR-created Expense is updated instead of recreated", async ({
    page,
  }) => {
    await page.route("**/api/categories**", (route) =>
      route.fulfill({ json: CATEGORIES }),
    );
    const requests: Array<{
      method: string;
      url: string;
      postData?: string | null;
    }> = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/expenses")) {
        requests.push({
          method: request.method(),
          url: request.url(),
          postData: request.postData(),
        });
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
      receipts: [
        {
          id: 88,
          expense_id: 77,
          original_name: "receipt.jpg",
          file_path: "receipts/77.jpg",
          created_at: "2026-07-15T10:00:00Z",
        },
      ],
      status: "draft",
      raw_ocr_text: "FIELD MARKET 12.34 EUR",
      created_at: "2026-07-15T10:00:00Z",
      updated_at: "2026-07-15T10:00:00Z",
    };
    await page.route("**/api/ocr/scan", (route) =>
      route.fulfill({
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
      }),
    );
    await page.route("**/api/expenses/77", async (route, request) => {
      if (request.method() === "GET") {
        await route.fulfill({ json: scannedExpense });
        return;
      }
      if (request.method() === "PATCH") {
        const body = JSON.parse(request.postData() ?? "{}");
        await route.fulfill({
          json: {
            ...scannedExpense,
            ...body,
            report_id: body.report_id ?? null,
          },
        });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/expenses/77/receipts/88", (route) =>
      route.fulfill({ body: "receipt", contentType: "image/jpeg" }),
    );
    await page.route("**/api/expenses/77/receipts", (route) =>
      route.fulfill({
        status: 500,
        json: { detail: "unexpected source upload" },
      }),
    );

    await page.goto("/expenses/new?reportId=2", { waitUntil: "load" });
    await page.locator("#receipt-scan-input").setInputFiles({
      name: "receipt.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("receipt"),
    });

    await expect(page.getByText("receipt.jpg").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Save changes|Salvează modificările/i }),
    ).toBeVisible();
    await page.getByLabel(/Merchant|Comerciant/i).fill("Reviewed Market");
    await page
      .getByRole("button", { name: /Save changes|Salvează modificările/i })
      .click();
    await expect(page).toHaveURL(/\/reports\/2$/);

    const creates = requests.filter(
      (request) =>
        request.method === "POST" && request.url.endsWith("/api/expenses"),
    );
    const sourceUploads = requests.filter(
      (request) =>
        request.method === "POST" &&
        request.url.includes("/api/expenses/77/receipts"),
    );
    const patch = requests.find(
      (request) =>
        request.method === "PATCH" && request.url.endsWith("/api/expenses/77"),
    );
    expect(creates).toHaveLength(0);
    expect(sourceUploads).toHaveLength(0);
    expect(patch).toBeDefined();
    expect(JSON.parse(patch?.postData ?? "{}")).toMatchObject({
      merchant: "Reviewed Market",
      report_id: 2,
    });
  });

  test("receipt download inside the form does not submit or navigate", async ({
    page,
  }) => {
    const expense = {
      ...EXPENSES[1],
      id: 22,
      receipts: [
        {
          id: 42,
          expense_id: 22,
          original_name: "receipt.jpg",
          file_path: "receipt.jpg",
          file_size: 10,
          created_at: "2026-07-15T10:00:00Z",
        },
      ],
    };
    await page.route("**/api/categories**", (route) =>
      route.fulfill({ json: CATEGORIES }),
    );
    await page.route("**/api/expenses/22", (route) =>
      route.fulfill({ json: expense }),
    );
    await page.route("**/api/expenses/22/receipts/42", (route) =>
      route.fulfill({ body: "receipt", contentType: "image/jpeg" }),
    );
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/expenses/22/edit", { waitUntil: "load" });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "receipt.jpg" }).click();
    await download;
    expect(page.url()).toContain("/expenses/22/edit");
    await expect(
      page.getByRole("button", { name: /Save changes|Salvează modificările/i }),
    ).toBeVisible();
  });

  test("active bottom navigation remains readable in both themes", async ({
    page,
  }) => {
    await mockExpenses(page);
    await page.setViewportSize({ width: 375, height: 667 });
    for (const theme of ["light", "dark"] as const) {
      await prepareLocaleTheme(page, "ro", theme);
      await page.goto("/expenses", { waitUntil: "load" });
      const active = page.locator('#mobile-bottom-nav a[aria-current="page"]');
      await expect(active).toBeVisible();
      await page.waitForTimeout(300);
      expect(
        await active.evaluate((element) => getComputedStyle(element).fontSize),
      ).toBe("11px");
      const activeColor = await active.evaluate(
        (element) => getComputedStyle(element).color,
      );
      expect(activeColor).not.toBe("rgb(194, 65, 12)");
      await expectNoSeriousAxeViolations(page);
    }
  });

  test("captures comparable EN/RO light/dark list and form evidence", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(
      testInfo.project.name !== "mobile-webkit",
      "Evidence is captured once with the WebKit mobile profile.",
    );
    await mockExpenses(page);
    await page.unroute("**/api/auth/me");
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ json: { ...USERS.user, language: "en" } }),
    );
    let evidencePage = page;
    for (const locale of ["en", "ro"] as const) {
      if (locale === "ro") {
        await page.evaluate(() =>
          localStorage.removeItem("xpenses_user_profile"),
        );
        evidencePage = await page.context().newPage();
        await evidencePage.route("**/sw.js", (route) => route.abort());
        await setupAuthMocks(evidencePage, "user");
        await mockExpenses(evidencePage);
        await evidencePage.unroute("**/api/auth/me");
        await evidencePage.route("**/api/auth/me", (route) =>
          route.fulfill({ json: { ...USERS.user, language: "ro" } }),
        );
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
          const expenseData =
            viewport.width < 768 ? "[data-expense-row]" : "table tbody tr";
          await expect(evidencePage.locator(expenseData).first()).toBeVisible();
          await expect(evidencePage.locator("html")).toHaveAttribute(
            "lang",
            locale,
          );
          await hideNextDevOverlay(evidencePage);
          await evidencePage.screenshot({
            path: `${EVIDENCE_DIR}/list-${locale}-${theme}-${viewport.name}.png`,
          });

          await evidencePage.goto("/expenses/new", { waitUntil: "load" });
          if (viewport.width < 1024) {
            await expect(
              evidencePage.getByRole("tab", {
                name: locale === "ro" ? /Detalii/ : /Details/,
              }),
            ).toBeVisible();
          }
          await expect(
            evidencePage.getByLabel(/Amount|Sumă/i).first(),
          ).toBeVisible();
          await hideNextDevOverlay(evidencePage);
          await evidencePage.screenshot({
            path: `${EVIDENCE_DIR}/new-expense-${locale}-${theme}-${viewport.name}.png`,
          });
        }
      }
    }
  });
});
