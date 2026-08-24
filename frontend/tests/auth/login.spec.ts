import { test, expect } from "@playwright/test";
import { setupCommonMocks, REPORT_DETAIL } from "../shared/mocks";

const MOCK_USER = { id: 1, username: "mod1", role: "mod", display_name: "Moderator", email: "mod@x.com" };

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: MOCK_USER }));
  });

  test("displays login form", async ({ page }) => {
    await page.goto("/login", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("Username", { exact: true })).toBeVisible();
    await expect(page.getByText("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.route("**/api/auth/login", (route) => route.fulfill({ status: 401 }));
    await page.goto("/login", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.locator('input[type="text"]').fill("wrong");
    await page.locator('input[type="password"]').fill("wrong");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText("Invalid username or password")).toBeVisible({ timeout: 8000 });
  });

  test("redirects to dashboard on successful login", async ({ page }) => {
    await page.route("**/api/auth/login", (route) => route.fulfill({ json: MOCK_USER }));
    await page.context().addCookies([
      { name: "access_token", value: "mock-token", domain: "localhost", path: "/" },
      { name: "refresh_token", value: "mock-refresh", domain: "localhost", path: "/" },
    ]);
    await page.goto("/login", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.locator('input[type="text"]').fill("mod1");
    await page.locator('input[type="password"]').fill("pass");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/dashboard", { timeout: 15000 });
  });

  test("is responsive at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasOverflow).toBe(false);
  });

  test("show-password toggle reveals and hides the password", async ({ page }) => {
    await page.goto("/login", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const password = page.locator("#login-password");
    await expect(password).toHaveAttribute("type", "password");

    const show = page.getByRole("button", { name: "Show password" });
    await show.click();
    await expect(password).toHaveAttribute("type", "text");

    // The accessible name flips with the state — re-locate the button.
    const hide = page.getByRole("button", { name: "Hide password" });
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await hide.click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("preserves redirect context through login (?next=)", async ({ page }) => {
    let detailRequested = false;

    // Cookie-less visit to a protected page: middleware must forward the
    // original path as ?next= through the login bounce. /auth/me is already
    // mocked in beforeEach so the login page mounts cleanly.
    await page.goto("/reports/1", { waitUntil: "load" });
    await expect(page).toHaveURL(/\?next=%2Freports%2F1$/);

    // Full mock set (incl. cookies + refresh) only AFTER the bounce, then a
    // more-specific LIFO route for the detail endpoint itself.
    await setupCommonMocks(page, { role: "mod" });
    await page.route("**/api/auth/login", (route) => route.fulfill({ json: MOCK_USER }));
    await page.route("**/api/reports/1**", (route) => {
      detailRequested = true;
      return route.fulfill({ json: REPORT_DETAIL });
    });

    await page.locator('input[type="text"]').fill("mod1");
    await page.locator('input[type="password"]').fill("pass");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL("**/reports/1", { timeout: 15000 });
    await expect.poll(() => detailRequested, { timeout: 10000 }).toBe(true);
  });

  test("ignores protocol-relative off-site ?next targets", async ({ page }) => {
    // Full mock set so no stray 401 can yank the page around after login.
    await setupCommonMocks(page, { role: "mod" });
    await page.route("**/api/auth/login", (route) => route.fulfill({ json: MOCK_USER }));
    await page.goto("/login?next=%2F%2Fevil.example", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.locator('input[type="text"]').fill("mod1");
    await page.locator('input[type="password"]').fill("pass");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Open-redirect guard falls back to /dashboard.
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    expect(new URL(page.url()).hostname).not.toContain("evil.example");
  });
});
