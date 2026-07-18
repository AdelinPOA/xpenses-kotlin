const { webkit } = require('@playwright/test');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning')
      console.log(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

  await page.context().addCookies([
    { name: "access_token", value: "mock-jwt-token", url: "http://localhost:3001" },
    { name: "refresh_token", value: "mock-refresh-token", url: "http://localhost:3001" },
  ]);

  await page.route("**/api/auth/me", route => route.fulfill({ json: { id: 4, username: "tech1", role: "technician" } }));
  await page.route("**/api/auth/refresh", route => route.fulfill({ json: { access_token: "new" } }));

  await page.goto("http://localhost:3001/expenses", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  
  console.log("Page loaded without route interception for expenses");
  
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
