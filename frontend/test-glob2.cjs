const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage({ viewport: { width: 1280, height: 800 } });

  let matches = [];
  let requests = [];

  page.on('request', req => {
    if (req.url().includes('/api/reports') || req.url().includes('/api/categories'))
      requests.push(req.url().replace('http://localhost:3001',''));
  });

  await page.route("**/api/reports", (route) => { matches.push('reports'); route.fulfill({ json: [] }); });
  await page.route("**/api/categories", (route) => { matches.push('categories'); route.fulfill({ json: [] }); });

  await context.addCookies([{ name: "access_token", value: "mock", url: "http://localhost:3001" }]);

  // Use fetch from page
  await page.goto("http://localhost:3001/expenses", { waitUntil: "load" });
  await page.waitForTimeout(2000);

  console.log('Requests:', requests);
  console.log('Matches:', matches);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
