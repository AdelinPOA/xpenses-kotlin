import { test, expect, type Page } from "@playwright/test";
import { setupAuthMocks, CATEGORIES, EXPENSES } from "../shared/mocks";

/**
 * Expenses list overhaul (WIP Phase 2): filter pills + URL search params,
 * text search wiring, clear-filters empty state, and the export date range.
 */

type RouteLog = { url: string; params: URLSearchParams };

async function mockExpensesApi(page: Page): Promise<RouteLog[]> {
  const log: RouteLog[] = [];
  await page.route("**/api/expenses**", (route, req) => {
    if (new URL(req.url()).pathname.endsWith("/export")) {
      return route.fulfill({ body: "csv", contentType: "text/csv" });
    }
    const url = new URL(req.url());
    log.push({ url: req.url(), params: url.searchParams });
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const rows = EXPENSES.filter(
      (e) =>
        (!status || e.status === status) &&
        (!q ||
          String(e.merchant ?? "").toLowerCase().includes(q) ||
          String(e.description ?? "").toLowerCase().includes(q))
    );
    return route.fulfill({
      json: { data: rows, total_elements: rows.length, total_pages: 1, page: 0, size: 20 },
    });
  });
  await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
  return log;
}

test.describe("Expenses list", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupAuthMocks(page, "user");
  });

  test("filter pills sync to URL, filter requests, and rejected shows no-results state", async ({ page }) => {
    const log = await mockExpensesApi(page);
    await page.goto("/expenses", { waitUntil: "load" });
    await expect(page.getByRole("button", { name: "Draft", exact: true })).toBeVisible();

    // Pill click → ?status=draft in the URL → server request carries it.
    await page.getByRole("button", { name: "Draft", exact: true }).click();
    await expect(page).toHaveURL(/\/expenses\?status=draft$/);
    await expect
      .poll(() => log.at(-1)?.params.get("status"), { timeout: 5000 })
      .toBe("draft");
    await expect(page.getByText("OMV Petrom").filter({ visible: true }).first()).toBeVisible(); // mocked draft expense

    // Rejected pill: no matching rows but data exists elsewhere →
    // filtered empty state with a working Clear filters action.
    await page.getByRole("button", { name: "Rejected", exact: true }).click();
    await expect(page).toHaveURL(/status=rejected/);
    await expect(page.getByText("No results match your filters.")).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /clear filters/i }).click();

    // Clear filters resets to a clean URL and restores all rows.
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(page.getByText("Lidl").filter({ visible: true }).first()).toBeVisible({ timeout: 8000 });
  });

  test("deep link with query params applies filters without extra state", async ({ page }) => {
    const log = await mockExpensesApi(page);
    await page.goto("/expenses?status=paid&q=lidl", { waitUntil: "load" });
    await expect(
      page.locator('input[type="search"]')
    ).toHaveValue("lidl");
    await expect
      .poll(() => log.at(-1)?.params.get("status"), { timeout: 5000 })
      .toBe("paid");
    expect(log.at(-1)?.params.get("q")).toBe("lidl");
    // Defaults are pruned — no explicit page/size noise.
    expect(log.at(-1)?.params.get("page")).toBe("0");
  });

  test("search box debounces into the q param", async ({ page }) => {
    const log = await mockExpensesApi(page);
    await page.goto("/expenses", { waitUntil: "load" });
    await page.locator('input[type="search"]').fill("omv");
    await expect(page).toHaveURL(/q=omv/, { timeout: 5000 });
    await expect
      .poll(() => log.at(-1)?.params.get("q"), { timeout: 5000 })
      .toBe("omv");
    await expect(page.getByText("OMV Petrom").filter({ visible: true }).first()).toBeVisible();
  });

  test("export honors the selected date range in the download URL", async ({ page }) => {
    const exportUrls: string[] = [];
    await mockExpensesApi(page);
    await page.route("**/api/expenses/export**", (route, req) => {
      exportUrls.push(req.url());
      return route.fulfill({ body: "id,merchant", contentType: "text/csv" });
    });

    await page.goto("/expenses", { waitUntil: "load" });
    await page.getByRole("button", { name: /export/i }).first().click();
    // Pick "This month" from the range popover, then trigger CSV download.
    await page.getByRole("menuitemradio", { name: /this month/i }).click();
    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.getByRole("button", { name: /download csv/i }).click();
    await downloadPromise;

    expect(exportUrls.length).toBeGreaterThan(0);
    const params = new URL(exportUrls[0]).searchParams;
    expect(params.get("format")).toBe("csv");

    // Same month math as exportRangeToParams().
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    expect(params.get("from")).toBe(iso(from));
    expect(params.get("to")).toBe(iso(to));
  });
});
