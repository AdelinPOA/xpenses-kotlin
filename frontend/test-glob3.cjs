const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage({ viewport: { width: 1280, height: 800 } });

  let matches = [];
  let requests = [];

  page.on('request', req => {
    if (req.url().includes('/api/'))
      requests.push(`${req.url().replace('http://localhost:3001','')}`);
  });

  // Pattern WITHOUT trailing **
  await page.route("**/api/reports", (route) => { matches.push('reports'); route.fulfill({ json: [] }); });
  await page.route("**/api/categories", (route) => { matches.push('categories'); route.fulfill({ json: [] }); });
  await page.route("**/api/expenses", (route) => { matches.push('expenses'); route.fulfill({ json: [] }); });

  await context.addCookies([{ name: "access_token", value: "mock", url: "http://localhost:3001" }, { name: "refresh_token", value: "mock", url: "http://localhost:3001" }]);
  await page.route("**/api/auth/me", route => route.fulfill({ json: { id: 4, username: "test", role: "technician", display_name: "Test" } }));

  // Navigate to reports list (which calls /api/reports?all=false)
  await page.goto("http://localhost:3001/reports", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  console.log('Reports page requests:', requests.filter(r => r.includes('/api/repo')));
  console.log('Reports matches:', matches.filter(m => m === 'reports').length);

  // Navigate to categories (which calls /api/categories?active_only=false)
  requests = []; matches = [];
  await page.goto("http://localhost:3001/categories", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  console.log('Categories page requests:', requests.filter(r => r.includes('/api/cat')));
  console.log('Categories matches:', matches.filter(m => m === 'categories').length);

  // Navigate to expenses (which calls /api/expenses)
  requests = []; matches = [];
  await page.goto("http://localhost:3001/expenses", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  console.log('Expenses page requests:', requests.filter(r => r.includes('/api/exp')));
  console.log('Expenses matches:', matches.filter(m => m === 'expenses').length);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
