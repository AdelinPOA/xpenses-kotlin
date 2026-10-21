import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

// Mutating integration tests must run only with a disposable, loopback backend.
// No routes are intercepted: auth, uploads, recovery, review and replay use HTTP.
test.use({ serviceWorkers: "allow" });
test.describe("authenticated capture integration", () => {
  test.skip(process.env.PLAYWRIGHT_CAPTURE_INTEGRATION !== "true", "Requires an explicitly enabled disposable integration stack");

  test("real acceptance and recovery, offline cold-start and versioned confirmation", async ({ page, baseURL, browserName }) => {
    // Playwright's Service Worker automation is Chromium-only; this is not
    // physical Safari/PWA acceptance (tracked separately in issue #51).
    test.skip(browserName !== "chromium", "Service Worker automation requires Chromium");
    test.setTimeout(120_000);
    expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
    const username = process.env.PLAYWRIGHT_USER;
    const password = process.env.PLAYWRIGHT_PASSWORD;
    expect(username).toBeTruthy();
    expect(password).toBeTruthy();
    await page.context().setExtraHTTPHeaders({ Origin: baseURL! });
    await page.context().addCookies([{ name: "lang", value: "en", url: baseURL! }]);
    const login = await page.request.post("/api/auth/login", { data: { username, password } });
    expect(login.ok()).toBeTruthy();
    const owner = await page.request.get("/api/auth/me").then((response) => response.json());
    expect(owner.username).toBe(username);
    // Localhost can proxy production. Require the identity convention seeded
    // exclusively by CiTestFixtureInitializer before any business mutation.
    expect(username).toMatch(/^(ci-tech-|repair-)/);
    expect(owner.email).toBe(`${username}@ci.invalid`);
    expect(owner.display_name).toBe("CI Technician");

    const key = randomUUID();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7i0AAAAASUVORK5CYII=", "base64");
    const upload = () => page.request.post("/api/ocr/scan", {
      headers: { "Idempotency-Key": key },
      multipart: { file: { name: "isolated-receipt.png", mimeType: "image/png", buffer: png } },
    });
    const accepted = await upload();
    expect(accepted.status()).toBe(202);
    const { job_id: jobId } = await accepted.json();
    const replay = await upload();
    expect(replay.status()).toBe(202);
    expect((await replay.json()).job_id).toBe(jobId);
    const changed = await page.request.post("/api/ocr/scan", {
      headers: { "Idempotency-Key": key },
      multipart: { file: { name: "different.png", mimeType: "image/png", buffer: png } },
    });
    expect(changed.status()).toBe(409);
    // No external provider credentials are needed: a partial extraction can
    // promote a photo-only draft, or offer same-job manual completion.
    await expect.poll(async () => {
      const response = await page.request.get(`/api/ocr/jobs/${jobId}`);
      expect(response.ok()).toBeTruthy();
      const job = await response.json();
      return Boolean((job.expense_id && job.receipt_id) || job.allowed_actions.includes("complete_manually"));
    }, { timeout: 45_000 }).toBeTruthy();
    const job = await page.request.get(`/api/ocr/jobs/${jobId}`).then((response) => response.json());
    await page.goto("/expenses/capture", { waitUntil: "load" });
    if (job.expense_id && job.receipt_id) {
      await page.locator(`a[href^="/expenses/${job.expense_id}/edit?ocr_source_id="]`).first().click();
    } else {
      await page.getByRole("button", { name: "Complete Expense manually", exact: true }).first().click();
      const manual = page.getByRole("region", { name: "Complete Expense manually" });
      await manual.getByLabel(/Amount/i).fill("22.00");
      await manual.getByLabel(/Merchant/i).fill("Isolated receipt");
      await manual.getByRole("button", { name: "Complete Expense manually", exact: true }).click();
    }
    await expect(page).toHaveURL(/\/expenses\/\d+\/edit\?ocr_source_id=/, { timeout: 30_000 });
    const reviewUrl = page.url();
    const expenseId = Number(new URL(reviewUrl).pathname.split("/")[2]);
    const recovered = await page.request.get(`/api/ocr/jobs/${jobId}`).then((response) => response.json());
    expect(recovered.expense_id).toBe(expenseId);
    expect(recovered.receipt_id).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "Check the receipt details" })).toBeVisible();
    await page.getByRole("spinbutton", { name: "Amount *", exact: true }).fill("22.00");
    await page.getByLabel(/Merchant/i).fill("Retained offline correction");
    await expect(page.getByText(/Saved on this device — not saved on the server/i)).toBeVisible();

    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBeTruthy();
    await page.context().setOffline(true);
    await page.close();
    const coldPage = await page.context().newPage();
    await coldPage.goto(reviewUrl, { waitUntil: "load" });
    await expect(coldPage.locator('meta[name="xpenses-offline-shell"]')).toHaveAttribute("content", "v9");
    // The generic offline workspace is intentionally not a second OCR editor.
    // It must leave the owner-scoped pending review intact for online resume.
    await coldPage.context().setOffline(false);
    await coldPage.goto(reviewUrl, { waitUntil: "load" });
    await expect(coldPage.getByLabel(/Merchant/i)).toHaveValue("Retained offline correction");
    const confirmation = coldPage.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith(`/api/expenses/${expenseId}/review`));
    await coldPage.getByRole("button", { name: "Confirm Expense", exact: true }).click();
    const acknowledgement = await confirmation;
    expect(acknowledgement.ok()).toBeTruthy();
    const verified = await acknowledgement.json();
    expect(verified.verification_state).toBe("VERIFIED");
    expect(verified.merchant).toBe("Retained offline correction");
    await expect(coldPage).toHaveURL(new RegExp(`/expenses\\?highlight=${expenseId}$`));
    await expect(coldPage.locator('[data-expense-row][aria-current="true"]')).toBeVisible();
    const request = acknowledgement.request();
    const reviewReplay = await coldPage.request.put(`/api/expenses/${expenseId}/review`, {
      headers: { "Idempotency-Key": (await request.headerValue("idempotency-key"))! },
      data: request.postDataJSON(),
    });
    expect(reviewReplay.ok()).toBeTruthy();
    const replayed = await reviewReplay.json();
    expect(replayed.version).toBe(verified.version);
    // PostgreSQL rounds persisted timestamps to microseconds; the initial
    // response may still include JVM nanoseconds. Compare the same instant.
    expect(Date.parse(replayed.last_verified_at)).toBe(Date.parse(verified.last_verified_at));
  });
});
