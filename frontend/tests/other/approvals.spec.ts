import { test, expect } from "@playwright/test";
import { setupAuthMocks, REVIEW_QUEUE } from "../shared/mocks";

test.describe("/approvals page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
  });

  test("loads submitted reports with action buttons", async ({ page }) => {
    await setupAuthMocks(page, "manager");
    await page.route("**/api/review-queue*", (route) => route.fulfill({ json: REVIEW_QUEUE.map((item) => ({ ...item, description: "Business trip" })) }));
    await page.goto("/approvals", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await expect(page.getByText("July Business Trip")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Business trip", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View Details" })).toBeVisible();
    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByPlaceholder("Explain why this report is being rejected...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm rejection" })).toBeDisabled();
  });

  test("approve refreshes the queue after server confirmation", async ({ page }) => {
    await setupAuthMocks(page, "manager");
    let queueReads = 0;
    await page.route("**/api/review-queue*", (route, request) => {
      if (request.method() === "GET") {
        queueReads += 1;
        return route.fulfill({ json: queueReads === 1 ? REVIEW_QUEUE : [] });
      }
      return route.continue();
    });
    await page.route("**/api/reports**", (route, request) => {
      if (request.method() === "GET") return route.fulfill({ json: [] });
      return route.continue();
    });
    await page.route("**/api/reports/1/approve", (route) => route.fulfill({ status: 200, json: {} }));
    await page.goto("/approvals", { waitUntil: "load" });
    await expect(page.getByText("July Business Trip")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("No reports pending approval")).toBeVisible({ timeout: 15000 });
    expect(queueReads).toBeGreaterThanOrEqual(2);
  });

  test("stale approval displays the server error and refreshes", async ({ page }) => {
    await setupAuthMocks(page, "manager");
    let queueReads = 0;
    await page.route("**/api/review-queue*", (route, request) => {
      if (request.method() === "GET") {
        queueReads += 1;
        return route.fulfill({ json: REVIEW_QUEUE });
      }
      return route.continue();
    });
    await page.route("**/api/reports**", (route, request) => {
      if (request.method() === "GET") return route.fulfill({ json: [] });
      return route.continue();
    });
    await page.route("**/api/reports/1/approve*", (route) => route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Only submitted reports can be approved" }),
    }));
    await page.goto("/approvals", { waitUntil: "load" });
    await expect(page.getByText("July Business Trip")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Only submitted reports can be approved").first()).toBeVisible({ timeout: 15000 });
    expect(queueReads).toBeGreaterThanOrEqual(2);
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuthMocks(page, "manager");
    await page.route("**/api/review-queue*", (route) => route.fulfill({ json: [] }));
    await page.goto("/approvals", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });
});
