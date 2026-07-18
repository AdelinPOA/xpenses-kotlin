async function testBrowser(browserType, label) {
  const { [browserType]: browserModule } = require('@playwright/test');
  const browser = await browserModule.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  let responses = [];
  page.on('response', resp => {
    if (resp.url().includes('/api/')) responses.push(`${resp.status()} ${resp.url().replace('http://localhost:3001','')}`);
  });

  // CORRECT field names matching backend API
  await page.context().addCookies([
    { name: "access_token", value: "mock-jwt-token", url: "http://localhost:3001" },
    { name: "refresh_token", value: "mock-refresh-token", url: "http://localhost:3001" },
  ]);
  await page.route("**/api/auth/me", route => route.fulfill({ json: { id: 4, username: "tech1", role: "technician", display_name: "Tech One" } }));
  await page.route("**/api/auth/refresh", route => route.fulfill({ json: { access_token: "new" } }));
  await page.route("**/api/expenses", route => route.fulfill({ json: [{ id: 1, category_id: 3, category_name: "Meals", report_id: null, amount_original: 85.5, currency_original: "EUR", amount_eur: 85.5, fx_rate: 1, fx_rate_manual: false, tax_amount: 0, tax_rate: null, tax_amount_eur: 0, date: "2026-07-14", description: "Team lunch", merchant: "Lidl", receipt_path: null, receipts: [], status: "paid", raw_ocr_text: null, user_display_name: null, created_at: "2026-07-14", updated_at: "2026-07-14" }] }));
  await page.route("**/api/categories", route => route.fulfill({ json: [{ id: 3, name: "Meals", spending_limit: 100, active: true }] }));

  await page.goto("http://localhost:3001/expenses", { waitUntil: "load" });
  await page.waitForTimeout(8000);
  
  const html = await page.content();
  console.log(`${label}: Has Lidl=${html.includes('Lidl')}, On error state=${html.includes('Something went wrong')}`);
  responses.forEach(r => console.log(`  ${label} ${r}`));
  
  await browser.close();
}

(async () => {
  await testBrowser('chromium', 'Chromium');
  await testBrowser('webkit', 'WebKit');
})().catch(e => { console.error(e); process.exit(1); });
