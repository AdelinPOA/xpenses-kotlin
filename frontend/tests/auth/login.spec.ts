import { test, expect } from "@playwright/test";

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
});
