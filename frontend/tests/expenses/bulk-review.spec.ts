import { test, expect, type Page } from "@playwright/test";
import { APP_ORIGIN, setupCommonMocks, EXPENSES, USERS } from "../shared/mocks";

const draft = {
  ...EXPENSES[0],
  id: 71,
  merchant: "Original",
  amount_original: 1234.56,
  currency_original: "EUR",
  status: "draft",
  receipts: [],
};
const photo = {
  name: "one.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
};
const visualDraft = {
  ...draft,
  merchant: "OMV Petrom",
  date: "2026-07-13",
  receipts: [{ id: 42, filename: "receipt.svg" }],
};
const receiptSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="128" viewBox="0 0 96 128"><rect width="96" height="128" rx="6" fill="#fff"/><rect width="96" height="24" rx="6" fill="#c2410c"/><text x="48" y="16" fill="#fff" font-size="10" text-anchor="middle">RECEIPT</text><path d="M16 42h64M16 56h52M16 70h60M16 84h42M16 104h64" stroke="#64748b" stroke-width="3"/></svg>`;
async function dismissIosInstallHint(page: Page) {
  const shouldDismiss = await page.evaluate(() => {
    const isIos =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return (
      isIos &&
      !isStandalone &&
      !localStorage.getItem("xpenses_ios_install_dismissed")
    );
  });
  if (!shouldDismiss) return;
  const hint = page
    .getByRole("status")
    .filter({ hasText: /Install the app|Instalează aplicația/ });
  await expect(hint).toBeVisible();
  await hint.getByRole("button", { name: /Dismiss|Închide/ }).click();
  await expect(hint).toHaveCount(0);
}
async function prepareLocaleTheme(
  page: Page,
  locale: "en" | "ro",
  theme: "light" | "dark",
) {
  await page
    .context()
    .addCookies([{ name: "lang", value: locale, url: APP_ORIGIN }]);
  await page.unroute("**/api/auth/me");
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { ...USERS.user, language: locale } }),
  );
  await page.goto("/expenses", { waitUntil: "load" });
  await page.evaluate((selectedTheme) => {
    localStorage.setItem("theme", selectedTheme);
  }, theme);
  await page.reload({ waitUntil: "load" });
  await dismissIosInstallHint(page);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect
    .poll(() =>
      page
        .locator("html")
        .evaluate((element) => element.classList.contains("dark")),
    )
    .toBe(theme === "dark");
}
async function openBatch(page: Page) {
  await page.goto("/expenses", { waitUntil: "load" });
  await dismissIosInstallHint(page);
  await page
    .locator('input[type="file"][multiple]')
    .first()
    .setInputFiles(photo);
  return page.getByRole("dialog", { name: "Review bulk upload" });
}

test.describe("Bulk review failure recovery", () => {
  test.beforeEach(async ({ page }) => {
    // Registered first: later specific mocks handle expected API calls; anything
    // else is blocked rather than reaching even the isolated backend destination.
    await page.route("**/api/**", (route) => route.abort("blockedbyclient"));
    await page.route("**/sw.js", (route) => route.abort());
    await setupCommonMocks(page, { role: "user" });
  });

  test("HTTP 500 is not a fake empty/saved result and never auto-replays a batch", async ({
    page,
  }) => {
    let uploads = 0;
    await page.route("**/api/expenses/bulk-upload", (route) => {
      uploads++;
      return route.fulfill({ status: 500, json: { message: "lost response" } });
    });
    const dialog = await openBatch(page);
    await expect(
      dialog.getByText("Upload could not be confirmed"),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Check existing expenses" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Done reviewing" }),
    ).toBeHidden();
    await expect(dialog.getByText("No expenses created")).toBeHidden();
    expect(uploads).toBe(1);
  });

  test("failed edits retain values, block closing and retry the known Expense; delete failure retains row", async ({
    page,
  }) => {
    let patches = 0;
    let uploads = 0;
    let allowSave = false;
    await page.route("**/api/expenses/bulk-upload", (route) => {
      uploads++;
      return route.fulfill({ json: { created: [draft], errors: [] } });
    });
    await page.route("**/api/expenses/71", (route) => {
      if (route.request().method() === "DELETE")
        return route.fulfill({ status: 500, json: {} });
      patches++;
      return route.fulfill(
        !allowSave
          ? { status: 500, json: {} }
          : {
              json: {
                ...draft,
                merchant: route.request().postDataJSON().merchant,
              },
            },
      );
    });
    const dialog = await openBatch(page);
    await dialog.getByLabel("Merchant", { exact: true }).fill("Attempted");
    await dialog.getByLabel("Date", { exact: true }).focus();
    await expect(
      dialog.getByText("Not saved — your changes are still here"),
    ).toBeVisible();
    await expect(dialog.getByLabel("Merchant", { exact: true })).toHaveValue(
      "Attempted",
    );
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await expect(
      dialog.getByText(/Processing or unsaved changes remain/),
    ).toBeVisible();
    // Clicking Close blurs Date, which may retry the still-dirty row. Keep the
    // transport failing until the explicit retry step rather than succeeding
    // merely because that additional blur dispatched a second PATCH.
    await expect(
      dialog.getByText("Not saved — your changes are still here"),
    ).toBeVisible();
    allowSave = true;
    await dialog.getByRole("button", { name: "Retry saving changes" }).click();
    await expect(dialog.getByText("Saved", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Delete this expense" }).click();
    await expect(
      dialog.getByText(/Delete failed. The expense was kept./),
    ).toBeVisible();
    await expect(dialog.getByLabel("Merchant", { exact: true })).toHaveValue(
      "Attempted",
    );
    expect(uploads).toBe(1);
    expect(patches).toBeGreaterThanOrEqual(2);
  });

  test("400 update failures retain the attempted value until retry is acknowledged", async ({
    page,
  }) => {
    let allowSave = false;
    await page.route("**/api/expenses/bulk-upload", (route) =>
      route.fulfill({ json: { created: [draft], errors: [] } }),
    );
    await page.route("**/api/expenses/71", (route) => {
      const merchant = route.request().postDataJSON().merchant;
      return allowSave
        ? route.fulfill({ json: { ...draft, merchant } })
        : route.fulfill({ status: 400, json: { message: "Invalid value" } });
    });
    const dialog = await openBatch(page);
    await dialog.getByLabel("Merchant", { exact: true }).fill("Attempted");
    await dialog.getByLabel("Date", { exact: true }).focus();
    await expect(
      dialog.getByText("Not saved — your changes are still here"),
    ).toBeVisible();
    await expect(dialog.getByLabel("Merchant", { exact: true })).toHaveValue(
      "Attempted",
    );
    allowSave = true;
    await dialog.getByRole("button", { name: "Retry saving changes" }).click();
    await expect(dialog.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("new edits are serialized behind the older response, without overwriting the latest value", async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bodies: Array<{ merchant?: string }> = [];
    await page.route("**/api/expenses/bulk-upload", (route) =>
      route.fulfill({ json: { created: [draft], errors: [] } }),
    );
    await page.route("**/api/expenses/71", async (route) => {
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (bodies.length === 1) await gate;
      await route.fulfill({ json: { ...draft, ...body } });
    });
    const dialog = await openBatch(page);
    await dialog.getByLabel("Merchant", { exact: true }).fill("First");
    await dialog.getByLabel("Date", { exact: true }).focus();
    await expect.poll(() => bodies.length).toBe(1);
    await dialog.getByLabel("Merchant", { exact: true }).fill("Latest");
    await dialog.getByLabel("Date", { exact: true }).focus();
    expect(bodies).toEqual([{ merchant: "First" }]);
    release();
    await expect.poll(() => bodies.length).toBe(2);
    await expect(dialog.getByLabel("Merchant", { exact: true })).toHaveValue(
      "Latest",
    );
    await expect(dialog.getByText("Saved", { exact: true })).toBeVisible();
    expect(bodies).toEqual([{ merchant: "First" }, { merchant: "Latest" }]);
  });

  test("clearing text and category waits for the server's acknowledged values", async ({
    page,
  }) => {
    const original = {
      ...draft,
      description: "Description to clear",
      category_id: 1,
    };
    let current: Omit<typeof original, "category_id"> & {
      category_id: number | null;
    } = original;
    const bodies: Record<string, unknown>[] = [];
    await page.route("**/api/expenses/bulk-upload", (route) =>
      route.fulfill({ json: { created: [original], errors: [] } }),
    );
    await page.route("**/api/expenses/71", (route) => {
      const body = route.request().postDataJSON();
      bodies.push(body);
      current = {
        ...current,
        ...body,
        category_id: body.clear_category ? null : current.category_id,
      };
      return route.fulfill({ json: current });
    });
    const dialog = await openBatch(page);
    await dialog.getByLabel("Merchant", { exact: true }).fill("");
    await dialog.getByLabel("Description", { exact: true }).fill("");
    await dialog.getByLabel("Category", { exact: true }).selectOption("");
    await dialog.getByLabel("Date", { exact: true }).focus();
    await expect(dialog.getByText("Saved", { exact: true })).toBeVisible();
    await expect.poll(() => current.merchant).toBe("");
    await expect.poll(() => current.description).toBe("");
    await expect.poll(() => current.category_id).toBeNull();
    expect(bodies.some((body) => body.merchant === "")).toBe(true);
    expect(bodies.some((body) => body.description === "")).toBe(true);
    expect(bodies.some((body) => body.clear_category === true)).toBe(true);
  });

  test("reverting after a committed response loss remains guarded until the current value is acknowledged", async ({
    page,
  }) => {
    let serverMerchant = draft.merchant;
    let allowAcknowledgement = false;
    const bodies: Array<{ merchant?: string }> = [];
    await page.route("**/api/expenses/bulk-upload", (route) =>
      route.fulfill({ json: { created: [draft], errors: [] } }),
    );
    await page.route("**/api/expenses/71", (route) => {
      const body = route.request().postDataJSON();
      bodies.push(body);
      serverMerchant = body.merchant ?? serverMerchant;
      return allowAcknowledgement
        ? route.fulfill({ json: { ...draft, merchant: serverMerchant } })
        : route.abort("failed");
    });
    const dialog = await openBatch(page);
    await dialog
      .getByLabel("Merchant", { exact: true })
      .fill("Committed remotely");
    await dialog.getByLabel("Date", { exact: true }).focus();
    await expect(
      dialog.getByText("Not saved — your changes are still here"),
    ).toBeVisible();
    expect(serverMerchant).toBe("Committed remotely");
    await dialog.getByLabel("Merchant", { exact: true }).fill("Original");
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await expect(
      dialog.getByText(/Processing or unsaved changes remain/),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Done reviewing" }),
    ).toBeHidden();
    await expect(
      dialog.getByText("Not saved — your changes are still here"),
    ).toBeVisible();
    allowAcknowledgement = true;
    await dialog.getByRole("button", { name: "Retry saving changes" }).click();
    await expect(dialog.getByText("Saved", { exact: true })).toBeVisible();
    expect(serverMerchant).toBe("Original");
    expect(bodies.at(-1)).toEqual({ merchant: "Original" });
  });

  test("mixed upload retries the failed Receipt on its existing Expense only", async ({
    page,
  }) => {
    let uploads = 0;
    const receiptIds: string[] = [];
    await page.route("**/api/expenses/bulk-upload", (route) => {
      uploads++;
      return route.fulfill({
        json: {
          created: [draft],
          errors: [
            {
              filename: "one.jpg",
              reason: "Storage unavailable",
              expense_id: 71,
              file_index: 0,
            },
          ],
        },
      });
    });
    await page.route("**/api/expenses/71/receipts", (route) => {
      receiptIds.push(route.request().headers()["idempotency-key"]);
      return route.fulfill({ json: [] });
    });
    const dialog = await openBatch(page);
    await expect(
      dialog.getByText("Storage unavailable", { exact: false }),
    ).toBeVisible();
    await dialog
      .getByRole("button", {
        name: "Retry attaching receipt to the existing expense",
      })
      .click();
    await expect(
      dialog.getByRole("button", {
        name: "Retry attaching receipt to the existing expense",
      }),
    ).toBeHidden();
    expect(uploads).toBe(1);
    expect(receiptIds).toHaveLength(1);
    expect(receiptIds[0]).toMatch(/:receipt:0$/);
  });

  for (const width of [375, 390]) {
    test(`readable controls at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.route("**/api/expenses/bulk-upload", (route) =>
        route.fulfill({ json: { created: [draft], errors: [] } }),
      );
      const dialog = await openBatch(page);
      const amount = dialog.getByLabel("Amount", { exact: true });
      const currency = dialog.getByLabel("Currency", { exact: true });
      await expect(amount).toHaveValue("1234.56");
      expect((await amount.boundingBox())!.width).toBeGreaterThanOrEqual(96);
      expect((await currency.boundingBox())!.width).toBeGreaterThanOrEqual(80);
      await expect(dialog.getByLabel("Date", { exact: true })).toBeVisible();
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
    });
  }

  test("captures the locale, theme, and viewport review matrix", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const viewports =
      testInfo.project.name === "mobile-webkit"
        ? [
            { width: 375, height: 667, name: "375x667" },
            { width: 390, height: 844, name: "390x844" },
          ]
        : testInfo.project.name === "desktop"
          ? [{ width: 1280, height: 800, name: "1280x800" }]
          : null;
    test.skip(!viewports, "Capture only mobile WebKit and desktop evidence.");
    const captureViewports = viewports ?? [];

    await page.route("**/api/expenses/bulk-upload", (route) =>
      route.fulfill({ json: { created: [visualDraft], errors: [] } }),
    );
    await page.route("**/api/expenses/71/receipts/42", (route) =>
      route.fulfill({ body: receiptSvg, contentType: "image/svg+xml" }),
    );

    for (const locale of ["en", "ro"] as const) {
      for (const theme of ["light", "dark"] as const) {
        for (const viewport of captureViewports) {
          await page.setViewportSize(viewport);
          await prepareLocaleTheme(page, locale, theme);
          await page
            .locator('input[type="file"][multiple]')
            .first()
            .setInputFiles(photo);
          const dialog = page.locator(
            '[role="dialog"][aria-labelledby="bulk-review-title"]',
          );
          await expect(dialog).toBeVisible();
          await expect(dialog.locator("#bulk-71-merchant")).toHaveValue(
            "OMV Petrom",
          );
          await expect(dialog.locator("#bulk-71-amount")).toHaveValue(
            "1234.56",
          );
          await expect(dialog.locator("#bulk-71-currency")).toHaveValue("EUR");
          await expect(dialog.locator("#bulk-71-date")).toHaveValue(
            visualDraft.date,
          );
          await expect
            .poll(() =>
              dialog
                .locator("img")
                .evaluate((image) => (image as HTMLImageElement).naturalWidth),
            )
            .toBe(96);
          await expect(
            dialog.getByRole("status").filter({ hasText: /Saved|Salvat/ }),
          ).toBeVisible();
          if (viewport.width < 768) {
            expect(
              (await dialog.locator("#bulk-71-amount").boundingBox())!.width,
            ).toBeGreaterThanOrEqual(96);
            expect(
              (await dialog.locator("#bulk-71-currency").boundingBox())!.width,
            ).toBeGreaterThanOrEqual(80);
          }
          expect(
            await dialog.evaluate(
              (element) => element.scrollWidth <= element.clientWidth,
            ),
          ).toBe(true);
          await page.addStyleTag({
            content: "nextjs-portal { display: none !important; }",
          });
          await page.screenshot({
            path: `../docs/ux/mobile-ios-review/issue-48/after/bulk-${locale}-${theme}-${viewport.name}.png`,
          });
          await dialog
            .getByRole("button", {
              name: locale === "en" ? "Done reviewing" : "Revizuire finalizată",
            })
            .click();
          await expect(dialog).toHaveCount(0);
        }
      }
    }
  });
});
