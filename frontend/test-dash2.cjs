const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage({ viewport: { width: 1280, height: 800 } });

  let apiCalls = 0;
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      apiCalls++;
      console.log(`  REQ: ${req.method()} ${req.url().replace('http://localhost:3001','')}`);
    }
  });
  page.on('response', resp => {
    if (resp.url().includes('/api/')) {
      console.log(`  RES: ${resp.status()} ${resp.url().replace('http://localhost:3001','')}`);
    }
  });
  page.on('pageerror', err => console.log(`  PAGE ERROR: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  CONSOLE ERROR: ${msg.text()}`);
  });

  const { setupCommonMocks } = await import('/root/xpenses-kotlin/frontend/tests/shared/mocks.ts');
  console.log('Setting up mocks...');
  await setupCommonMocks(page);
  console.log('Mocks set up. Navigating to dashboard...');
  
  await page.goto('http://localhost:3001/dashboard', { waitUntil: 'load', timeout: 15000 });
  console.log('Page load event fired');
  await page.waitForTimeout(3000);
  
  const html = await page.content();
  console.log('\nPage state:');
  console.log('  Has "View Company Overview":', html.includes('View Company Overview'));
  console.log('  Has "Something went wrong":', html.includes('Something went wrong'));
  console.log('  Has "Loading...":', html.includes('Loading'));
  console.log('  Has "Moderator One":', html.includes('Moderator One'));
  console.log('  API calls:', apiCalls);
  
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
