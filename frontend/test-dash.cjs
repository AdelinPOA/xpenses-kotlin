const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[CONSOLE ERROR] ${msg.text()}`);
  });
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

  const { setupCommonMocks } = require('./tests/shared/mocks');
  await setupCommonMocks(page);

  await page.goto("http://localhost:3001/dashboard", { waitUntil: "load" });
  await page.waitForTimeout(5000);

  const html = await page.content();
  console.log("Has 'View Company Overview':", html.includes('View Company Overview'));
  console.log("Has 'Something went wrong':", html.includes('Something went wrong'));
  console.log("Has 'Loading...':", html.includes('Loading'));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
