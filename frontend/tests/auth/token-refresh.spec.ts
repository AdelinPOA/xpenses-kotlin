import { test, expect } from "@playwright/test";
import { CATEGORIES, setupCommonMocks, USERS } from "../shared/mocks";

test.describe("Axios session refresh", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupCommonMocks(page, { role: "mod" });
  });

  test("refreshes the session and retries a request after HTTP 401", async ({
    page,
  }) => {
    let requests = 0;
    let refreshes = 0;
    await page.route("**/api/categories**", async (route) => {
      requests += 1;
      await route.fulfill(
        requests === 1
          ? { status: 401, json: { detail: "Session expired" } }
          : { status: 200, json: CATEGORIES },
      );
    });
    await page.route("**/api/auth/refresh", async (route) => {
      refreshes += 1;
      await route.fulfill({
        status: 200,
        json: { access_token: "synthetic-refreshed-token" },
      });
    });

    await page.goto("/categories");

    await expect(
      page
        .getByText("Transport", { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    expect(refreshes).toBe(1);
    expect(requests).toBe(2);
    await expect(page).toHaveURL(/\/categories$/);
  });

  test("keeps the current route and cached owner when a 401 is followed by refresh network failure", async ({
    page,
  }) => {
    await page.goto("/categories");
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("xpenses_user_profile");
          return raw ? JSON.parse(raw).id : null;
        }),
      )
      .toBe(1);

    let refreshes = 0;
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { detail: "Session expired" } }),
    );
    await page.route("**/api/auth/refresh", async (route) => {
      refreshes += 1;
      await route.abort("failed");
    });
    const authCheck = page.waitForRequest((request) =>
      request.url().includes("/api/auth/me"),
    );
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await authCheck;

    await expect(page).toHaveURL(/\/categories$/);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("xpenses_user_profile");
          return raw ? JSON.parse(raw).id : null;
        }),
      )
      .toBe(1);
    expect(refreshes).toBe(1);
  });

  test("keeps the current route when refresh returns a server failure", async ({
    page,
  }) => {
    await page.route("**/api/categories**", (route) =>
      route.fulfill({ status: 401, json: { detail: "Session expired" } }),
    );
    await page.route("**/api/auth/refresh", (route) =>
      route.fulfill({
        status: 503,
        json: { detail: "Temporarily unavailable" },
      }),
    );

    await page.goto("/categories");

    await expect(page).toHaveURL(/\/categories$/);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("xpenses_user_profile");
          return raw ? JSON.parse(raw).id : null;
        }),
      )
      .toBe(1);
  });

  test("a transient /auth/me server failure preserves the current local owner", async ({
    page,
  }) => {
    await page.goto("/categories");
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("xpenses_user_profile");
          return raw ? JSON.parse(raw).id : null;
        }),
      )
      .toBe(1);

    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 503,
        json: { detail: "Temporarily unavailable" },
      }),
    );
    const authCheck = page.waitForRequest((request) =>
      request.url().includes("/api/auth/me"),
    );
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await authCheck;

    await expect(page).toHaveURL(/\/categories$/);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("xpenses_user_profile");
          return raw ? JSON.parse(raw).id : null;
        }),
      )
      .toBe(1);
  });

  test("an ordinary resource 403 does not refresh or clear the cached owner", async ({
    page,
  }) => {
    let refreshes = 0;
    await page.route("**/api/categories**", (route) =>
      route.fulfill({ status: 403, json: { detail: "Forbidden" } }),
    );
    await page.route("**/api/auth/refresh", async (route) => {
      refreshes += 1;
      await route.fulfill({ json: { status: "refreshed" } });
    });

    await page.goto("/categories");

    await expect(page).toHaveURL(/\/categories$/);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("xpenses_user_profile");
          return raw ? JSON.parse(raw).id : null;
        }),
      )
      .toBe(1);
    expect(refreshes).toBe(0);
  });

  test("redirects to login when session refresh is rejected", async ({
    page,
  }) => {
    let refreshes = 0;
    await page.route("**/api/categories**", (route) =>
      route.fulfill({
        status: 401,
        json: { detail: "Session expired" },
      }),
    );
    await page.route("**/api/auth/refresh", async (route) => {
      refreshes += 1;
      await route.fulfill({ status: 401, json: { detail: "Refresh expired" } });
    });

    await page.goto("/categories");

    await expect(page).toHaveURL(/\/login\?next=%2Fcategories$/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    expect(refreshes).toBe(1);
  });

  test("a successful login clears a terminal refresh rejection for later 401s", async ({
    page,
  }) => {
    let meRequests = 0;
    let authenticatedMeRequests = 0;
    let refreshes = 0;
    let loggedIn = false;
    let failNextAuthenticatedMe = false;
    await page.route("**/api/auth/me", async (route) => {
      meRequests += 1;
      if (!loggedIn) {
        await route.fulfill({ status: 401, json: { detail: "Session expired" } });
        return;
      }
      if (failNextAuthenticatedMe) {
        failNextAuthenticatedMe = false;
        await route.fulfill({ status: 401, json: { detail: "Session expired" } });
        return;
      }
      authenticatedMeRequests += 1;
      await route.fulfill({ status: 200, json: USERS.mod });
    });
    await page.route("**/api/auth/refresh", async (route) => {
      refreshes += 1;
      await route.fulfill(
        refreshes === 1
          ? { status: 401, json: { detail: "Refresh expired" } }
          : { status: 200, json: { access_token: "new-session-token" } },
      );
    });
    await page.route("**/api/auth/login", (route) => {
      loggedIn = true;
      failNextAuthenticatedMe = false;
      return route.fulfill({ status: 200, json: USERS.mod });
    });

    await page.goto("/login");
    await expect.poll(() => refreshes).toBe(1);
    await page.getByLabel(/username/i).fill("mod1");
    await page
      .getByRole("textbox", { name: "Password", exact: true })
      .fill("password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect.poll(() => authenticatedMeRequests).toBeGreaterThanOrEqual(1);

    failNextAuthenticatedMe = true;
    const nextMeCheck = page.waitForRequest((request) =>
      request.url().includes("/api/auth/me"),
    );
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await nextMeCheck;
    await expect.poll(() => refreshes).toBe(2);
    expect(meRequests).toBeGreaterThanOrEqual(4);
  });

  test("a deactivated account refresh rejection routes to login", async ({
    page,
  }) => {
    await page.route("**/api/categories**", (route) =>
      route.fulfill({ status: 401, json: { detail: "Session expired" } }),
    );
    await page.route("**/api/auth/refresh", (route) =>
      route.fulfill({ status: 403, json: { detail: "Account deactivated" } }),
    );

    await page.goto("/categories");

    await expect(page).toHaveURL(/\/login\?next=%2Fcategories$/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});
