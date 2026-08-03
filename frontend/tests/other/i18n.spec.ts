import { test, expect } from "@playwright/test";
import { USERS } from "../shared/mocks";

const TECH_USER = { ...USERS.user, language: "en" };
const TECH_USER_RO = { ...USERS.user, language: "ro" };

test.describe("i18n language packs", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("10.1 switch language to ro on profile and see Romanian on profile + dashboard", async ({ page }) => {
    let currentUser = { ...TECH_USER };

    await page.context().addCookies([
      { name: "access_token", value: "mock-jwt-token", url: "http://localhost:3001" },
      { name: "refresh_token", value: "mock-refresh-token", url: "http://localhost:3001" },
      { name: "lang", value: "en", url: "http://localhost:3001" },
    ]);
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: currentUser }));
    await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: { access_token: "new-mock-token" } }));
    await page.route("**/api/dashboard**", (route) =>
      route.fulfill({
        json: {
          expense_count_total: 1,
          expense_count_month: 1,
          total_month_eur: 10,
          draft_count: 0,
          submitted_count: 0,
          paid_count: 0,
          pending_approval_count: 0,
          pending_payment_count: 0,
          recent_expenses: [],
          spend_by_category: [],
          total_last_report_eur: 0,
        },
      })
    );
    await page.route("**/api/users/me", async (route) => {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        currentUser = { ...currentUser, ...body, language: body?.language ?? "ro" };
        await route.fulfill({ json: currentUser });
        return;
      }
      await route.fulfill({ json: currentUser });
    });

    await page.goto("/profile", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: /profile/i })).toBeVisible({ timeout: 15000 });

    await page.locator("select").first().selectOption("ro");
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByRole("heading", { name: /profil/i })).toBeVisible({ timeout: 10000 });

    await page.goto("/dashboard", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Panou" })).toBeVisible({ timeout: 15000 });
  });

  test("10.2 switch back to en and assert English rendering", async ({ page }) => {
    let currentUser = { ...TECH_USER_RO };

    await page.context().addCookies([
      { name: "access_token", value: "mock-jwt-token", url: "http://localhost:3001" },
      { name: "refresh_token", value: "mock-refresh-token", url: "http://localhost:3001" },
      { name: "lang", value: "ro", url: "http://localhost:3001" },
    ]);
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: currentUser }));
    await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: { access_token: "new-mock-token" } }));
    await page.route("**/api/users/me", async (route) => {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        currentUser = { ...currentUser, ...body, language: body?.language ?? "en" };
        await route.fulfill({ json: currentUser });
        return;
      }
      await route.fulfill({ json: currentUser });
    });

    await page.goto("/profile", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: /profil/i })).toBeVisible({ timeout: 15000 });

    await page.locator("select").first().selectOption("en");
    await page.getByRole("button", { name: /salveaz|save/i }).click();
    await expect(page.getByRole("heading", { name: /^profile$/i })).toBeVisible({ timeout: 10000 });
  });

  test("10.3 browser language ro on /login without lang cookie", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "language", { get: () => "ro-RO" });
      Object.defineProperty(navigator, "languages", { get: () => ["ro-RO", "ro"] });
    });
    await page.context().clearCookies();
    await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401 }));

    await page.goto("/login", { waitUntil: "load" });
    await expect(page.getByText("Nume de utilizator", { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /conectare/i })).toBeVisible();
  });

  test("10.4 logout keeps last-used language cookie", async ({ page }) => {
    await page.context().addCookies([
      { name: "access_token", value: "mock-jwt-token", url: "http://localhost:3001" },
      { name: "refresh_token", value: "mock-refresh-token", url: "http://localhost:3001" },
      { name: "lang", value: "ro", url: "http://localhost:3001" },
    ]);
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: TECH_USER_RO }));
    await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: { access_token: "new-mock-token" } }));
    await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 204 }));
    await page.route("**/api/dashboard**", (route) =>
      route.fulfill({
        json: {
          expense_count_total: 0,
          expense_count_month: 0,
          total_month_eur: 0,
          draft_count: 0,
          submitted_count: 0,
          paid_count: 0,
          pending_approval_count: 0,
          pending_payment_count: 0,
          recent_expenses: [],
          spend_by_category: [],
          total_last_report_eur: 0,
        },
      })
    );

    await page.goto("/dashboard", { waitUntil: "load" });
    await expect(page.getByText(/deconectare|sign out/i).first()).toBeVisible({ timeout: 15000 });

    await page.getByText(/deconectare|sign out/i).first().click();

    await page.waitForURL("**/login", { timeout: 15000 });
    const cookies = await page.context().cookies();
    const lang = cookies.find((c) => c.name === "lang");
    expect(lang?.value).toBe("ro");
    await expect(page.getByRole("button", { name: /conectare/i })).toBeVisible({ timeout: 10000 });
  });
});
