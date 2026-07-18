const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage({ viewport: { width: 1280, height: 800 } });

  const { setupCommonMocks } = await import('/root/xpenses-kotlin/frontend/tests/shared/mocks.ts');
  await setupCommonMocks(page);
  await page.goto('http://localhost:3001/dashboard', { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(5000);
  
  const html = await page.content();
  // Search for specific phrases
  const phrases = ['View Company Overview', 'Company Overview', 'Show company', 'canToggle', 'Switch to My View', 'expenses'];
  for (const p of phrases) {
    console.log(`  "${p}": ${html.includes(p)}`);
  }
  
  // Count buttons
  const buttons = await page.locator('button').count();
  console.log(`  Total buttons: ${buttons}`);
  
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
