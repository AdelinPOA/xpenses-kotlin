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
    for (const label of ["All", "Draft", "Submitted", "Paid"]) {
      const control = page.getByRole("button", { name: label, exact: true });
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
    await page.goto("/expenses/new");
    for (const label of ["Amount", "Currency", "Date", "Merchant", "Category", "Description", "Receipts"]) {
      await expect(page.getByLabel(new RegExp(label, "i")).first()).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAxeViolations(page);
  });
});
