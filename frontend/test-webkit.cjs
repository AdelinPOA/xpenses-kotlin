const { webkit } = require('@playwright/test');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => { if (msg.type() === 'error') console.log(`[ERROR] ${msg.text()}`); });
  page.on('response', resp => console.log(`[${resp.status()}] ${resp.url().replace('http://localhost:3001','')}`));

  await page.context().addCookies([
    { name: "access_token", value: "mock-jwt-token", url: "http://localhost:3001" },
    { name: "refresh_token", value: "mock-refresh-token", url: "http://localhost:3001" },
  ]);

  await page.route("**/api/auth/me", route => route.fulfill({ json: { id: 4, username: "tech1", role: "technician" } }));
  await page.route("**/api/auth/refresh", route => route.fulfill({ json: { access_token: "new" } }));
  await page.route("**/api/expenses", route => route.fulfill({ json: [{ id: 1, merchant: "Lidl", amount: 85.5, currency: "EUR", category_id: 3, category_name: "Meals", status: "paid", date: "2026-07-14", description: "Team lunch", receipt_count: 1, report_id: null, reimbursable: true }] }));
  await page.route("**/api/categories", route => route.fulfill({ json: [] }));

  await page.goto("http://localhost:3001/expenses", { waitUntil: "load" });
  await page.waitForTimeout(5000);
  
  const html = await page.content();
  console.log("Has Lidl:", html.includes('Lidl'));
  console.log("On login:", html.includes('Sign in'));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
