import { defineConfig, devices } from "@playwright/test";

const VIEWPORTS = {
  mobile: { width: 412, height: 849 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
};
const PORT = process.env.PLAYWRIGHT_PORT ?? "3100";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
  ],
  snapshotDir: "tests/__snapshots__",
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 100,
      threshold: 0.3,
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], viewport: VIEWPORTS.mobile },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"], viewport: VIEWPORTS.mobile },
    },
    {
      name: "tablet",
      use: { ...devices["iPad Mini"], viewport: VIEWPORTS.tablet },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: VIEWPORTS.desktop },
    },
  ],
  webServer: {
    command: `NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED=${process.env.NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED ?? "true"} npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
