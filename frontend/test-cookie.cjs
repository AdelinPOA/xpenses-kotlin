const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Same setup as the dashboard test
  await page.context().addCookies([
    { name: "access_token", value: "mock-jwt-token", url: "http://localhost:3001" },
    { name: "refresh_token", value: "mock-refresh-token", url: "http://localhost:3001" },
  ]);

  const cookies = await page.context().cookies();
  console.log("Cookies after addCookies:", JSON.stringify(cookies.map(c => ({ name: c.name, domain: c.domain, path: c.path }))));

  await page.goto("http://localhost:3001/dashboard", { waitUntil: "load" });
  const html = await page.content();
  const onLoginPage = html.includes('Sign in to your account');
  console.log("On login page:", onLoginPage);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
