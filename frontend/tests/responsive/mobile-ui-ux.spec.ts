import { test, expect } from "@playwright/test";
import { setupCommonMocks } from "../shared/mocks";

test.describe("Mobile UI/UX and Segmented Controls (mod)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupCommonMocks(page, { role: "mod" });
  });

  test("dashboard has mobile segmented control and toggles correctly", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(1000);

    // Verify segmented control is present
    const myViewBtn = page.getByRole("button", { name: "My View", exact: true });
    const companyViewBtn = page.getByRole("button", { name: "Company View", exact: true });

    await expect(myViewBtn).toBeVisible();
    await expect(companyViewBtn).toBeVisible();

    // Mod defaults to company view
    await expect(companyViewBtn).toHaveClass(/bg-white/);

    // Click My View
    await myViewBtn.evaluate((el) => (el as HTMLElement).click());
    await expect(myViewBtn).toHaveClass(/bg-white/);
    await expect(companyViewBtn).not.toHaveClass(/bg-white/);

    // Click Company View back
    await companyViewBtn.evaluate((el) => (el as HTMLElement).click());
    await expect(companyViewBtn).toHaveClass(/bg-white/);
    await expect(myViewBtn).not.toHaveClass(/bg-white/);
  });

  test("expenses has mobile segmented control and toggles correctly", async ({ page }) => {
    await page.goto("/expenses", { waitUntil: "load" });
    await page.waitForTimeout(1000);

    const myExpBtn = page.getByRole("button", { name: "My Expenses", exact: true });
    const companyExpBtn = page.getByRole("button", { name: "Company Expenses", exact: true });

    await expect(myExpBtn).toBeVisible();
    await expect(companyExpBtn).toBeVisible();

    // Mod defaults to company expenses
    await expect(companyExpBtn).toHaveClass(/bg-white/);

    // Verify mobile cards or desktop table are visible based on viewport
    const width = page.viewportSize()?.width ?? 375;
    if (width < 768) {
      const cards = page.locator(".md\\:hidden > div");
      await expect(cards.first()).toBeVisible();
    } else {
      const table = page.locator("table");
      await expect(table).toBeVisible();
    }

    // Toggle to My Expenses
    await myExpBtn.evaluate((el) => (el as HTMLElement).click());
    await expect(myExpBtn).toHaveClass(/bg-white/);
    await expect(companyExpBtn).not.toHaveClass(/bg-white/);
  });

  test("reports has mobile segmented control and toggles correctly", async ({ page }) => {
    await page.goto("/reports", { waitUntil: "load" });
    await page.waitForTimeout(1000);

    const myReportsBtn = page.getByRole("button", { name: "My Reports", exact: true });
    const companyReportsBtn = page.getByRole("button", { name: "Company Reports", exact: true });

    await expect(myReportsBtn).toBeVisible();
    await expect(companyReportsBtn).toBeVisible();

    // Toggle works
    await myReportsBtn.evaluate((el) => (el as HTMLElement).click());
    await expect(myReportsBtn).toHaveClass(/bg-white/);
    await expect(companyReportsBtn).not.toHaveClass(/bg-white/);
  });

  test("inventory has mobile segmented control and toggles correctly", async ({ page }) => {
    await page.goto("/inventory", { waitUntil: "load" });
    await page.waitForTimeout(1000);

    const myItemsBtn = page.getByRole("button", { name: "My Items", exact: true });
    const companyItemsBtn = page.getByRole("button", { name: "Company Items", exact: true });

    await expect(myItemsBtn).toBeVisible();
    await expect(companyItemsBtn).toBeVisible();

    // Toggle works
    await companyItemsBtn.evaluate((el) => (el as HTMLElement).click());
    await expect(companyItemsBtn).toHaveClass(/bg-white/);
    await expect(myItemsBtn).not.toHaveClass(/bg-white/);
  });

  test("insurance has mobile segmented control and toggles correctly", async ({ page }) => {
    await page.goto("/insurance", { waitUntil: "load" });
    await page.waitForTimeout(1000);

    const myFilesBtn = page.getByRole("button", { name: "My Files", exact: true });
    const companyFilesBtn = page.getByRole("button", { name: "Company Files", exact: true });

    await expect(myFilesBtn).toBeVisible();
    await expect(companyFilesBtn).toBeVisible();

    // Toggle works
    await companyFilesBtn.evaluate((el) => (el as HTMLElement).click());
    await expect(companyFilesBtn).toHaveClass(/bg-white/);
    await expect(myFilesBtn).not.toHaveClass(/bg-white/);
  });
});
