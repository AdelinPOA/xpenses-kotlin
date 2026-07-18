const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage({ viewport: { width: 1280, height: 800 } });

  let matches = [];

  // Test 1: **/api/reports
  await page.route("**/api/reports", (route) => { matches.push('reports'); route.fulfill({ json: [] }); });
  // Test 2: **/api/categories
  await page.route("**/api/categories", (route) => { matches.push('categories'); route.fulfill({ json: [] }); });

  await context.addCookies([{ name: "access_token", value: "mock", url: "http://localhost:3001" }]);

  // Make requests directly with fetch
  await page.evaluate(() => fetch('/api/reports?all=false').then(r => r.json()));
  await page.evaluate(() => fetch('/api/categories?active_only=false').then(r => r.json()));

  await new Promise(r => setTimeout(r, 1000));
  console.log('Matches:', matches);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
