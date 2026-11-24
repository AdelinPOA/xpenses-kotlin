import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "allow" });
test.skip(
  () => process.env.RUN_OFFLINE_DIAGNOSIS !== "1",
  "Manual local diagnosis harness; set RUN_OFFLINE_DIAGNOSIS=1 to run",
);

const APP_ORIGIN = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3100"}`;

const OWNER = {
  id: 4,
  username: "offline-owner",
  display_name: "Offline Owner",
  role: "technician",
  email: "offline-owner@example.test",
  active: true,
  auth_source: "local",
  created_at: "2025-01-01T00:00:00Z",
  email_notifications: false,
};

const DASHBOARD = {
  total_month_eur: 0,
  draft_count: 0,
  submitted_count: 0,
  paid_count: 0,
  expense_count_total: 0,
  expense_count_month: 0,
  pending_approval_count: 0,
  pending_payment_count: 0,
  recent_expenses: [],
  spend_by_category: [],
};

type AuthMode = "owner" | "unauthorized" | "network-error";
type RefreshMode = "success" | "unauthorized" | "network-error";

interface FixtureState {
  me: AuthMode;
  refresh: RefreshMode;
}

async function openAuthenticatedApp(page: Page, state: FixtureState) {
  const context = page.context();
  await context.addCookies([
    { name: "access_token", value: "fixture-access-token", url: APP_ORIGIN },
    { name: "refresh_token", value: "fixture-refresh-token", url: APP_ORIGIN },
  ]);

  await context.route("**/api/**", async (route, request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/me") {
      if (state.me === "owner") {
        await route.fulfill({ json: OWNER });
      } else if (state.me === "unauthorized") {
        await route.fulfill({ status: 401, json: { detail: "Unauthorized" } });
      } else {
        await route.abort("failed");
      }
      return;
    }

    if (pathname === "/api/auth/refresh") {
      if (state.refresh === "success") {
        await route.fulfill({
          json: { access_token: "fixture-refreshed-token" },
        });
      } else if (state.refresh === "unauthorized") {
        await route.fulfill({
          status: 401,
          json: { detail: "Refresh rejected" },
        });
      } else {
        // Model connectivity disappearing after the server says the access
        // credential is invalid but before refresh can be reached.
        await context.setOffline(true);
        await route.abort("failed");
      }
      return;
    }

    if (pathname === "/api/dashboard") {
      await route.fulfill({ json: DASHBOARD });
      return;
    }
    if (pathname === "/api/settings/ui") {
      await route.fulfill({ json: { mobile_quick_add_fab_enabled: false } });
      return;
    }
    if (pathname === "/api/fx/status") {
      await route.fulfill({
        json: {
          status: "HEALTHY",
          primary_provider: "BNR",
          active_source: "BNR",
          fallback_active: false,
          last_checked_at: "2026-11-20T18:00:00Z",
          primary_error: null,
          providers: [
            {
              provider: "BNR",
              priority: 1,
              healthy: true,
              active: true,
              is_primary: true,
              checked_at: "2026-11-20T18:00:00Z",
              source_date: "2026-11-20",
              ron_per_eur: 5.3482,
              latency_ms: 42,
              error: null,
            },
          ],
          last_db_rate: null,
        },
      });
      return;
    }
    if (pathname === "/api/fuel-prices/status") {
      await route.fulfill({
        json: {
          status: "HEALTHY",
          primary_provider: "PRETCARBURANT_LIVE",
          active_source: "PRETCARBURANT_LIVE",
          fallback_active: false,
          last_checked_at: "2026-11-20T20:00:00Z",
          primary_error: null,
          providers: [
            {
              provider: "PRETCARBURANT_LIVE",
              priority: 1,
              healthy: true,
              active: true,
              is_primary: true,
              checked_at: "2026-11-20T20:00:00Z",
              source_date: "2026-11-20",
              diesel_ron: 10.56,
              petrol_ron: 9.12,
              lpg_ron: 4.83,
              latency_ms: 45,
              error: null,
            },
          ],
          last_db_price: null,
        },
      });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.goto(`${APP_ORIGIN}/dashboard`);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("xpenses_user_profile");
    return raw !== null && JSON.parse(raw).id === 4;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

async function triggerAuthCheck(page: Page) {
  const nextCheck = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/auth/me",
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await nextCheck;
}

test("plain auth-check network failure preserves the owner's current route", async ({
  page,
}) => {
  const state: FixtureState = { me: "owner", refresh: "success" };
  await openAuthenticatedApp(page, state);

  state.me = "network-error";
  await page.context().setOffline(true);
  await triggerAuthCheck(page);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("xpenses_user_profile") ?? "null")
            ?.id,
      ),
    )
    .toBe(4);
});

test("refresh network failure after an auth 401 must not force the owner to login", async ({
  page,
}) => {
  const state: FixtureState = { me: "owner", refresh: "success" };
  await openAuthenticatedApp(page, state);

  state.me = "unauthorized";
  state.refresh = "network-error";
  await triggerAuthCheck(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Offline workspace" }),
  ).toHaveCount(0);
  expect(
    new URL(page.url()).pathname,
    `network loss during refresh navigated to ${page.url()}`,
  ).toBe("/dashboard");
});

test("a genuinely rejected refresh still routes to login", async ({ page }) => {
  const state: FixtureState = { me: "owner", refresh: "success" };
  await openAuthenticatedApp(page, state);

  state.me = "unauthorized";
  state.refresh = "unauthorized";
  await triggerAuthCheck(page);

  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("the installed application SW serves the generic offline workspace on navigation and cold start", async ({
  page,
}) => {
  const state: FixtureState = { me: "owner", refresh: "success" };
  await openAuthenticatedApp(page, state);

  await page.context().setOffline(true);
  const navigation = await page.goto(`${APP_ORIGIN}/expenses`);
  expect(navigation?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Offline workspace" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Offline Owner");

  const reload = await page.reload();
  expect(reload?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Offline workspace" }),
  ).toBeVisible();

  const coldStart = await page.context().newPage();
  const coldStartResponse = await coldStart.goto(`${APP_ORIGIN}/dashboard`);
  expect(coldStartResponse?.status()).toBe(200);
  await expect(
    coldStart.getByRole("heading", { name: "Offline workspace" }),
  ).toBeVisible();
  await expect(coldStart).not.toHaveURL(/\/login/);
  await expect(coldStart.locator("body")).not.toContainText("Offline Owner");
});
