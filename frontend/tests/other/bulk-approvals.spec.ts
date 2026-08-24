import { test, expect, type Page } from "@playwright/test";
import { setupAuthMocks, MANAGER_DASHBOARD_DATA } from "../shared/mocks";

const QUEUE = [
  { ...MANAGER_DASHBOARD_DATA.pending_reports[0], id: 1 },
  {
    ...MANAGER_DASHBOARD_DATA.pending_reports[0],
    id: 2,
    title: "August Field Work",
    total_amount_eur: 300,
  },
];

const MANAGER_STATS = {
  ...MANAGER_DASHBOARD_DATA,
  pending_reports: QUEUE,
};

function mockManagerDashboard(page: Page) {
  void page.route("**/api/dashboard**", (route) => route.fulfill({ json: MANAGER_DASHBOARD_DATA }));
  return page.route("**/api/dashboard/manager", (route) => route.fulfill({ json: MANAGER_STATS }));
}

test.describe("Batch approve / reject (Phase 3.2)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupAuthMocks(page, "manager");
    await mockManagerDashboard(page);
  });

  test("bulk approve selected reports and report the count", async ({ page }) => {
    const bulkCalls: { ids: number[]; action?: string; reason?: string }[] = [];
    await page.route("**/api/reports/bulk-status", async (route, request) => {
      bulkCalls.push(request.postDataJSON());
      return route.fulfill({ json: { succeeded: [1, 2], failed: [] } });
    });
    await page.goto("/dashboard", { waitUntil: "load" });
    await expect(page.getByText("July Business Trip").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("August Field Work")).toBeVisible();

    // Enter selection mode via header toggle, then pick both rows.
    await page.getByRole("button", { name: "Select" }).click();
    await page.getByText("July Business Trip").first().click();
    await page.getByText("August Field Work").click();

    await expect(page.getByText("2 selected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve (2)" })).toBeVisible();
    await page.getByRole("button", { name: "Approve (2)" }).click();

    await expect(page.getByText("2 report(s) approved")).toBeVisible({ timeout: 15000 });
    expect(bulkCalls).toHaveLength(1);
    expect(bulkCalls[0].action).toBe("approve");
    expect([...bulkCalls[0].ids].sort()).toEqual([1, 2]);
  });

  test("bulk reject requires a shared reason and surfaces partial failures", async ({ page }) => {
    await page.route("**/api/reports/bulk-status", (route) =>
      route.fulfill({ json: { succeeded: [1], failed: [{ id: 2, reason: "conflict" }] } })
    );
    await page.goto("/dashboard", { waitUntil: "load" });
    await expect(page.getByText("July Business Trip").first()).toBeVisible({ timeout: 15000 });

    // Long-press enters selection mode directly on mobile & desktop.
    const row = page.getByText("July Business Trip").first();
    const box = await row.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.getByText("August Field Work").click();

    await expect(page.getByText("2 selected")).toBeVisible();
    await page.getByRole("button", { name: "Reject (2)" }).click();

    // Shared reason is mandatory.
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Reject (2)" })).toBeDisabled();
    await page.getByRole("dialog").getByPlaceholder("Add optional notes").fill("Missing receipts");
    await page.getByRole("dialog").getByRole("button", { name: "Reject (2)" }).click();

    await expect(page.getByText("1 succeeded, 1 failed — retry the remaining rows")).toBeVisible({
      timeout: 15000,
    });
  });

  test("notification bell shows real pending count for managers", async ({ page, viewport }) => {
    test.skip(viewport!.width < 1024, "Bell lives in the desktop header");
    await page.goto("/dashboard", { waitUntil: "load" });
    const bell = page.getByRole("button", { name: "Notifications (3)" });
    await expect(bell).toBeVisible({ timeout: 15000 });
    await expect(bell.getByText("3")).toBeVisible();
    // Clicking navigates to the review desk.
    await bell.click();
    await expect(page).toHaveURL(/\/approvals/);
  });
});

test.describe("Inline receipt viewer (Phase 3.1)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupAuthMocks(page, "manager");
    await page.route("**/api/review-queue*", (route) => route.fulfill({ json: QUEUE }));
  });

  test("viewing receipts opens the drawer with preview without leaving the desk", async ({ page }) => {
    await page.route("**/api/reports/1", (route) =>
      route.fulfill({
        json: {
          id: 1,
          title: "July Business Trip",
          status: "submitted",
          user_id: 4,
          user_display_name: "Technician One",
          total_amount: 50,
          total_reimbursable: 50,
          expenses: [
            {
              id: 10,
              merchant: "Shell",
              description: null,
              category_name: "Fuel",
              date: "2026-07-02",
              amount_eur: 50,
              receipts: [
                { id: 100, expense_id: 10, file_path: "receipts/shell.jpg", original_name: "shell.jpg" },
              ],
            },
            {
              id: 11,
              merchant: "No receipt expense",
              category_name: "Meals",
              date: "2026-07-03",
              amount_eur: 12,
              receipts: [],
            },
          ],
        },
      })
    );

    await page.goto("/approvals", { waitUntil: "load" });
    await expect(page.getByText("July Business Trip").first()).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "View Receipts" }).first().click();
    // Drawer shows the report's receipts with line items beside the preview.
    await expect(page.getByText("Receipt Preview")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Shell").first()).toBeVisible();
    // Expenses without receipts are not listed.
    await expect(page.getByText("No receipt expense")).toHaveCount(0);
    // Still on the approvals desk.
    await expect(page.getByRole("button", { name: "View Receipts" }).first()).toBeVisible();

    // Escape closes the drawer.
    await page.keyboard.press("Escape");
    await expect(page.getByText("Receipt Preview")).not.toBeVisible();
  });

  test("pending-reports table receipt chip opens the drawer", async ({ page }) => {
    await mockManagerDashboard(page);
    await page.route("**/api/reports/1", (route) =>
      route.fulfill({
        json: {
          id: 1,
          title: "July Business Trip",
          status: "submitted",
          user_id: 4,
          total_amount: 1250,
          expenses: [
            {
              id: 10,
              merchant: "Shell",
              category_name: "Fuel",
              date: "2026-07-02",
              amount_eur: 50,
              receipts: [{ id: 100, expense_id: 10, file_path: "receipts/shell.jpg", original_name: null }],
            },
          ],
        },
      })
    );

    await page.goto("/dashboard", { waitUntil: "load" });
    await expect(page.getByText("July Business Trip").first()).toBeVisible({ timeout: 15000 });

    // The first row auto-expands, revealing itemized expenses.
    await expect(page.getByText("Itemized Expenses").first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /Receipt attached \(1\)/ }).click();

    await expect(page.getByText("Receipt Preview")).toBeVisible({ timeout: 15000 });
  });
});
