const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  let errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('response', resp => {
    if (resp.status() >= 400 && resp.url().includes('/api/')) console.log(`ERROR RESPONSE: ${resp.status()} ${resp.url()}`);
  });

  await page.context().addCookies([
    { name: "access_token", value: "mock", url: "http://localhost:3001" },
    { name: "refresh_token", value: "mock", url: "http://localhost:3001" },
  ]);
  await page.route("**/api/auth/me", route => route.fulfill({ json: { id: 4, username: "tech1", role: "technician", display_name: "Tech One" } }));
  await page.route("**/api/auth/refresh", route => route.fulfill({ json: { access_token: "new" } }));
  await page.route("**/api/categories", route => route.fulfill({ json: [{ id: 1, name: "Transport", spending_limit: 5000, active: true }] }));
  await page.route("**/api/expenses", route => route.fulfill({ json: [{ id: 1, category_id: 1, category_name: "Transport", report_id: null, amount_original: 85.5, currency_original: "EUR", amount_eur: 85.5, fx_rate: 1, fx_rate_manual: false, tax_amount: 0, tax_rate: null, tax_amount_eur: 0, date: "2026-07-14", description: "Test", merchant: "Lidl", receipt_path: null, receipts: [], status: "paid", raw_ocr_text: null, user_display_name: null, created_at: "2026-07-14T00:00:00Z", updated_at: "2026-07-14T00:00:00Z" }] }));
  await page.route("**/api/dashboard", route => route.fulfill({ json: { expense_count_total: 10, expense_count_month: 5, total_month_eur: 12500.5, draft_count: 3, submitted_count: 5, paid_count: 12, pending_approval_count: 2, pending_payment_count: 4, recent_expenses: [], spend_by_category: [] } }));
  await page.route("**/api/reports", route => route.fulfill({ json: [{ id: 1, title: "Test Report", status: "draft", total_amount: 100, currency: "EUR", user_id: 4, user_display_name: "Tech One", expenses: [], advances: [], mileage_records: [], total_advances: 0, total_mileage_eur: 0, daily_allowance: 0, total_reimbursable: 0, submitted_at: null, description: null, paid_at: null, approved_by: null, approved_at: null, rejected_reason: null, signer_id: null, signed_at: null, date_from: null, date_to: null, created_at: "2026-07-14T00:00:00Z", updated_at: "2026-07-14T00:00:00Z" }] }));

  await page.goto("http://localhost:3001/expenses", { waitUntil: "load" });
  await page.waitForTimeout(5000);
  let html = await page.content();
  console.log("Expenses:", html.includes('Lidl'), html.includes('Something went wrong'));

  await page.goto("http://localhost:3001/dashboard", { waitUntil: "load" });
  await page.waitForTimeout(5000);
  html = await page.content();
  console.log("Dashboard:", html.includes('Spent this month'), html.includes('Something went wrong'));

  await page.goto("http://localhost:3001/reports", { waitUntil: "load" });
  await page.waitForTimeout(5000);
  html = await page.content();
  console.log("Reports:", html.includes('Test Report'), html.includes('Something went wrong'));

  console.log("Errors:", errors);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
