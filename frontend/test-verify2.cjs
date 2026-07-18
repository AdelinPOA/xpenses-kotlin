const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Log ALL API requests
  page.on('request', req => {
    if (req.url().includes('/api/')) console.log(`REQ: ${req.method()} ${req.url().replace('http://localhost:3001','')}`);
  });
  page.on('response', resp => {
    if (resp.url().includes('/api/')) console.log(`RES: ${resp.status()} ${resp.url().replace('http://localhost:3001','')}`);
  });

  // Set up routes BEFORE cookies
  await page.route("**/api/auth/me", route => { console.log('INTERCEPT: /api/auth/me'); route.fulfill({ json: { id: 4, username: "tech1", role: "technician", display_name: "Tech One" } }); });
  await page.route("**/api/auth/refresh", route => { console.log('INTERCEPT: /api/auth/refresh'); route.fulfill({ json: { access_token: "new" } }); });
  await page.route("**/api/expenses", route => { console.log('INTERCEPT: /api/expenses'); route.fulfill({ json: [{ id: 1, category_id: 1, category_name: "Transport", report_id: null, amount_original: 85.5, currency_original: "EUR", amount_eur: 85.5, fx_rate: 1, fx_rate_manual: false, tax_amount: 0, tax_rate: null, tax_amount_eur: 0, date: "2026-07-14", description: "Test", merchant: "Lidl", receipt_path: null, receipts: [], status: "paid", raw_ocr_text: null, user_display_name: null, created_at: "2026-07-14T00:00:00Z", updated_at: "2026-07-14T00:00:00Z" }] }); });
  await page.route("**/api/reports", route => { console.log('INTERCEPT: /api/reports'); route.fulfill({ json: [] }); });
  await page.route("**/api/categories", route => { console.log('INTERCEPT: /api/categories'); route.fulfill({ json: [] }); });

  await page.context().addCookies([
    { name: "access_token", value: "mock", url: "http://localhost:3001" },
    { name: "refresh_token", value: "mock", url: "http://localhost:3001" },
  ]);

  await page.goto("http://localhost:3001/expenses", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  let html = await page.content();
  console.log("Expenses page:", html.includes('Lidl'), html.includes('Something went wrong'));

  console.log("\n--- Now navigating to reports ---");
  await page.goto("http://localhost:3001/reports", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  html = await page.content();
  console.log("Reports page:", html.includes('Something went wrong'));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
