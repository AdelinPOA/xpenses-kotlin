import { test, expect, type Route } from "@playwright/test";

test("login cannot accept and lose input before its handlers are hydrated", async ({ page }) => {
  const scripts: Route[] = [];
  let hydrated = false;
  await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, (route) => {
    if (hydrated) return route.continue();
    scripts.push(route);
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
  let submitted: { username: string; password: string } | null = null;
  await page.route("**/api/auth/login", (route, request) => {
    submitted = request.postDataJSON();
    return route.fulfill({ status: 401, json: { detail: "Synthetic credentials" } });
  });
  try {
    await page.goto("/login", { waitUntil: "commit" });
    const username = page.getByLabel("Username", { exact: true });
    await expect(username).toBeVisible();
    await expect(username).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();
    hydrated = true;
    await Promise.all(scripts.splice(0).map((route) => route.continue()));
    await expect(username).toBeEnabled();
    await username.fill("synthetic-technician");
    await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect.poll(() => submitted).toEqual({ username: "synthetic-technician", password: "synthetic-password" });
  } finally {
    hydrated = true;
    await Promise.all(scripts.splice(0).map((route) => route.continue().catch(() => undefined)));
  }
});
