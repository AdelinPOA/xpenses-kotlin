const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('request', req => {
    if (req.url().includes('/api/')) console.log(`REQ: ${req.url().replace('http://localhost:3001','')}`);
  });

  await page.route("**/api/auth/me", route => { console.log('INTERCEPT: /api/auth/me'); route.fulfill({ json: { id: 4, username: "tech1", role: "technician", display_name: "Tech One" } }); });
  await page.route("**/api/auth/refresh", route => { console.log('INTERCEPT: /api/auth/refresh'); route.fulfill({ json: { access_token: "new" } }); });
  await page.route("**/api/expenses", route => { console.log('INTERCEPT: /api/expenses'); route.fulfill({ json: [] }); });
  await page.route("**/api/reports**", route => { console.log(`INTERCEPT: /api/reports ${route.request().url()}`); route.fulfill({ json: [] }); });
  await page.route("**/api/categories", route => { console.log('INTERCEPT: /api/categories'); route.fulfill({ json: [] }); });

  await context.addCookies([
    { name: "access_token", value: "mock", url: "http://localhost:3001" },
    { name: "refresh_token", value: "mock", url: "http://localhost:3001" },
  ]);

  console.log("--- Navigating to reports ---");
  await page.goto("http://localhost:3001/reports", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const html = await page.content();
  console.log("Something went wrong:", html.includes('Something went wrong'));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
