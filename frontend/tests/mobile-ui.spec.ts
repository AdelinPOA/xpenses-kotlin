import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const username = process.env.PLAYWRIGHT_USER;
const password = process.env.PLAYWRIGHT_PASSWORD;
const authenticatedUiEnabled = process.env.PLAYWRIGHT_AUTHENTICATED_UI === "true";

async function login(page: Page) {
  test.skip(!username || !password, "PLAYWRIGHT_USER and PLAYWRIGHT_PASSWORD are required");
  await page.goto("/login");
  await page.getByLabel("Username").fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectNoSeriousAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter(({ impact }) =>
    impact === "critical" || impact === "serious"
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test("login is accessible and does not overflow", async ({ page }) => {
  // The public login accessibility check must not depend on a running backend.
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      // A guest session keeps AuthProvider on /login without requiring a backend.
      body: JSON.stringify({ id: 0, username: "playwright-guest", role: "technician", language: "en" }),
    })
  );
  await page.goto("/login");
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);
});

test("mobile expense bundling toolbar appears on selection and navigates to new report", async ({ page }) => {
  await page.context().addCookies([
    {
      name: "access_token",
      value: "mock-valid-token",
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, username: "tech1", role: "technician", language: "en" }),
    })
  );
  await page.route("**/api/categories", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  );
  await page.route("**/api/expenses*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 42,
          merchant: "Metro Transit",
          amount_eur: 15.5,
          amount_original: 15.5,
          currency_original: "EUR",
          status: "draft",
          date: "2026-09-10",
        },
      ]),
    })
  );

  await page.goto("/expenses");
  const checkbox = page.getByRole("checkbox", { name: /Select expense Metro Transit/i }).first();
  await expect(checkbox).toBeVisible({ timeout: 15000 });
  await checkbox.click();

  const toolbar = page.getByRole("region", { name: /Expense bundling toolbar/i });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByText(/1 selected/i)).toBeVisible();

  await toolbar.getByRole("button", { name: /Create Report/i }).click();
  await expect(page).toHaveURL(/\/reports\/new\?expense_ids=42/);
});

test("mobile pre-flight submission drawer shows receipt audit and confirmation", async ({ page }) => {
  await page.context().addCookies([
    {
      name: "access_token",
      value: "mock-valid-token",
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, username: "tech1", role: "technician", language: "en" }),
    })
  );
  await page.route("**/api/reports/10", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 10,
        title: "Field Intervention Report",
        description: "Field mission",
        status: "draft",
        user_id: 1,
        currency: "EUR",
        created_at: "2026-09-10T10:00:00Z",
        updated_at: "2026-09-10T10:00:00Z",
        date_from: "2026-09-10",
        date_to: "2026-09-10",
        submitted_at: null,
        paid_at: null,
        approved_by: null,
        approved_at: null,
        rejected_reason: null,
        signer_id: null,
        signed_at: null,
        advances: [],
        total_advances: 0,
        mileage_records: [],
        total_mileage_eur: 0,
        daily_allowance: 0,
        expenses: [
          {
            id: 42,
            merchant: "Metro Transit",
            amount_eur: 15.5,
            amount_original: 15.5,
            currency_original: "EUR",
            date: "2026-09-10",
            status: "draft",
            receipts: [],
          },
        ],
        total_amount: 15.5,
        total_reimbursable: 15.5,
      }),
    })
  );
  await page.route("**/api/expenses*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  );

  await page.goto("/reports/10");
  const submitBtn = page.getByRole("button", { name: /Submit report/i });
  await expect(submitBtn).toBeVisible({ timeout: 15000 });
  await submitBtn.click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible({ timeout: 10000 });
  await expect(drawer.getByRole("heading", { name: /Submit Expense Report/i })).toBeVisible();
  await expect(drawer.getByText(/1 expense\(s\) have no receipt attached/i)).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Confirm & Submit/i })).toBeVisible();

  // Cancel/close drawer
  await drawer.getByRole("button", { name: /Review more/i }).click();
  await expect(drawer).not.toBeVisible();
});

test("mobile expense date field stays inside its card at narrow widths", async ({ page }) => {
  await page.context().addCookies([
    {
      name: "access_token",
      value: "mock-valid-token",
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        username: "tech1",
        role: "technician",
        language: "en",
      }),
    }),
  );
  await page.route("**/api/categories**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/expenses/new?mode=manual");
  const date = page.locator("#expense-date");
  await expect(date).toBeVisible();

  for (const width of [375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const edges = await page.evaluate(() => {
      const dateInput = document.querySelector<HTMLInputElement>("#expense-date");
      const form = document.querySelector<HTMLFormElement>("#panel-details");
      if (!dateInput || !form) throw new Error("Expense date field or form is missing");
      const formStyle = getComputedStyle(form);
      const formBox = form.getBoundingClientRect();
      return {
        dateRight: dateInput.getBoundingClientRect().right,
        contentRight:
          formBox.right -
          parseFloat(formStyle.borderRightWidth) -
          parseFloat(formStyle.paddingRight),
      };
    });

    expect(
      edges.dateRight,
      `date field should stay inside the form card at ${width}px`,
    ).toBeLessThanOrEqual(edges.contentRight + 1);
  }
});

test.describe("mobile authenticated UI", () => {
  test.skip(!authenticatedUiEnabled || !username || !password, "Set PLAYWRIGHT_AUTHENTICATED_UI=true with test credentials and a reachable API");

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const route of ["/dashboard", "/expenses", "/reports", "/profile"]) {
    test(`${route} has no overflow or serious accessibility violations`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousAxeViolations(page);
    });
  }

  test("bottom navigation exposes the current page and changes routes", async ({ page }) => {
    await page.goto("/expenses");
    await expect(page.locator('nav[aria-label="Primary mobile navigation"]')).toBeVisible();
    await expect(page.locator('a[href="/expenses"][aria-current="page"]')).toBeVisible();

    await page.locator('nav[aria-label="Primary mobile navigation"] a[href="/reports"]').click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.locator('a[href="/reports"][aria-current="page"]')).toBeVisible();
    await expect(page.locator('nav[aria-label="Primary mobile navigation"] a[href="/expenses/capture"]')).toBeVisible();
  });

  test("sidebar opens, closes with Escape and restores focus", async ({ page }) => {
    const menu = page.getByRole("button", { name: "Open sidebar" });
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#app-sidebar")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeFocused();
  });

  test("expense controls meet their mobile contract", async ({ page }) => {
    await page.goto("/expenses");
    const filterToggle = page.getByRole("button", { name: /^Filters(?: \(\d+\))?$/ });
    await expect(filterToggle).toBeVisible();
    await filterToggle.click();
    const filterRegion = page.getByRole("region", { name: "Filters" });
    for (const label of ["All", "Draft", "Submitted", "Paid"]) {
      const control = filterRegion.getByRole("button", { name: label, exact: true });
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const iconActions = page.locator(
      'button[aria-label^="Duplicate expense"], button[aria-label^="Delete expense"], a[aria-label^="Edit expense"]'
    );
    for (let index = 0; index < await iconActions.count(); index += 1) {
      const box = await iconActions.nth(index).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("new expense fields are addressable by their labels", async ({ page }) => {
    await page.goto("/expenses/new?mode=manual");
    for (const label of ["Amount", "Currency", "Date", "Merchant", "Category", "Receipts"]) {
      await expect(page.getByLabel(new RegExp(label, "i")).first()).toBeVisible();
    }
    const additionalDetails = page.getByText(/Additional details/i);
    await expect(additionalDetails).toBeVisible();
    await additionalDetails.click();
    await expect(page.getByLabel(/Description/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAxeViolations(page);
  });

  test("Technician can create an Expense without a Receipt", async ({ page }) => {
    await page.goto("/expenses/new?mode=manual");
    await page.locator("#expense-amount").fill("12.34");
    await page.getByLabel(/Merchant/i).fill("CI smoke test");
    await page.getByLabel(/Category/i).selectOption({ index: 1 });

    const createRequest = page.waitForResponse((response) =>
      response.url().endsWith("/api/expenses") && response.request().method() === "POST" && response.status() === 201
    );
    await page.getByRole("button", { name: "Create expense", exact: true }).click();
    await createRequest;
    await expect(page).toHaveURL(/\/expenses$/);
  });
});
