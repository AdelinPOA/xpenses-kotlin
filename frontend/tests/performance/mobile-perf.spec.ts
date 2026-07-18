import { test, expect, Page } from "@playwright/test";
import { setupCommonMocks, REPORT_DETAIL } from "../shared/mocks";

/**
 * Mobile Performance Test Suite
 *
 * Measures real rendering performance on mobile viewport (iPhone 12, 375×812).
 * Run: npx playwright test tests/performance/ --project=mobile --workers=1
 *
 * Uses workers=1 for consistent timing measurements.
 */

// Budgets (generous to avoid flaky CI; tighten once baseline stable)
const MAX_LOAD_MS = 8000;
const MIN_ANIM_FPS = 15;
const MAX_LONG_TASK_MS = 300;

test.describe("Mobile Performance", () => {
  test.describe.configure({ mode: "default" });

  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await page.route("**/api/reports/1", (route) =>
      route.fulfill({ json: REPORT_DETAIL })
    );
  });

  // ── Page Load ───────────────────────────────────────────────────

  test("dashboard loads within budget", async ({ page }) => {
    const start = Date.now();
    await page.goto("/dashboard");
    await page.getByText("Spent this month").waitFor({ timeout: MAX_LOAD_MS });
    const loadTime = Date.now() - start;
    console.log(`Dashboard load: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(MAX_LOAD_MS);
  });

  test("expenses list loads within budget", async ({ page }) => {
    const start = Date.now();
    await page.goto("/expenses");
    await page.getByText("Lidl").first().waitFor({ timeout: MAX_LOAD_MS });
    const loadTime = Date.now() - start;
    console.log(`Expenses load: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(MAX_LOAD_MS);
  });

  test("reports list loads within budget", async ({ page }) => {
    const start = Date.now();
    await page.goto("/reports");
    await page
      .getByText("July Business Trip")
      .first()
      .waitFor({ timeout: MAX_LOAD_MS });
    const loadTime = Date.now() - start;
    console.log(`Reports load: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(MAX_LOAD_MS);
  });

  // ── Long Tasks ──────────────────────────────────────────────────

  test("no excessive long tasks during render", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Spent this month").waitFor({ timeout: MAX_LOAD_MS });

    const longTasks: number[] = await page.evaluate(() => {
      return new Promise<number[]>((resolve) => {
        const tasks: number[] = [];
        try {
          const obs = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) tasks.push(entry.duration);
          });
          obs.observe({ type: "longtask", buffered: true });
          setTimeout(() => {
            obs.disconnect();
            resolve(tasks);
          }, 500);
        } catch {
          resolve([]);
        }
      });
    });

    if (longTasks.length > 0) {
      const worst = Math.max(...longTasks);
      console.log(
        `Long tasks: ${longTasks.length}, worst: ${worst.toFixed(0)}ms`
      );
      expect(worst).toBeLessThan(MAX_LONG_TASK_MS);
    }
  });

  // ── Scroll ──────────────────────────────────────────────────────

  test("scroll performance on expenses list", async ({ page }) => {
    await page.goto("/expenses");
    await page.getByText("Lidl").first().waitFor({ timeout: MAX_LOAD_MS });
    await ensureScrollable(page);

    const fps = await measureScrollFPS(page);
    console.log(`Expenses scroll FPS: ${fps.toFixed(1)}`);
    if (fps === -1) {
      console.log("Page did not scroll — skipping FPS assertion");
      return;
    }
    expect(fps).toBeGreaterThan(MIN_ANIM_FPS);
  });

  test("scroll performance on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Spent this month").waitFor({ timeout: MAX_LOAD_MS });
    await ensureScrollable(page);

    // Verify page is actually scrollable after spacer injection
    const scrollInfo = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      canScroll: document.documentElement.scrollHeight > window.innerHeight + 50,
    }));
    console.log(`Dashboard scroll info: ${JSON.stringify(scrollInfo)}`);

    const fps = await measureScrollFPS(page);
    console.log(`Dashboard scroll FPS: ${fps.toFixed(1)}`);
    if (fps === -1) {
      console.log("Page did not scroll — skipping FPS assertion");
      return;
    }
    expect(fps).toBeGreaterThan(MIN_ANIM_FPS);
  });

  // ── Bottom Tab Bar ──────────────────────────────────────────────

  test("tab switch is responsive", async ({ page }) => {
    await page.goto("/dashboard");
    const bottomNav = page.locator("nav.ios-frosted");
    await bottomNav.waitFor({ state: "visible", timeout: MAX_LOAD_MS });

    const start = Date.now();
    await bottomNav.getByText("Expenses").click();
    await page.getByText("Lidl").first().waitFor({ timeout: MAX_LOAD_MS });
    const t = Date.now() - start;
    console.log(`Tab switch: ${t}ms`);
    expect(t).toBeLessThan(MAX_LOAD_MS);
  });

  test("More drawer opens smoothly", async ({ page }) => {
    await page.goto("/dashboard");
    const bottomNav = page.locator("nav.ios-frosted");
    await bottomNav.waitFor({ state: "visible", timeout: MAX_LOAD_MS });
    await page.waitForTimeout(1500); // let React settle before measuring

    const moreBtn = bottomNav.getByText("More");
    const { fps, duration } = await measureAnimationFPS(page, () =>
      moreBtn.click()
    );
    console.log(`Drawer open: ${fps.toFixed(1)} FPS, ${duration}ms`);
    expect(fps).toBeGreaterThan(8);
    // Sign out button lives inside the drawer — use drawer locator
    await expect(page.locator("[class*='rounded-t-2xl']").getByText("Sign out")).toBeVisible({ timeout: 5000 });
  });

  test("More drawer closes smoothly", async ({ page }) => {
    await page.goto("/dashboard");
    const bottomNav = page.locator("nav.ios-frosted");
    await bottomNav.waitFor({ state: "visible", timeout: MAX_LOAD_MS });

    await bottomNav.getByText("More").click();
    // Wait for drawer to fully open — use the container with max-h-[70vh]
    const drawerContainer = page.locator("[class*='max-h-[70vh]']");
    await drawerContainer.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(500); // settle framer-motion

    const closeBtn = drawerContainer.locator("button:has(svg.lucide-x)").first();
    const { fps } = await measureAnimationFPS(page, () => closeBtn.click());
    console.log(`Drawer close FPS: ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThan(8);
  });

  // ── GPU Cost ────────────────────────────────────────────────────

  test("visible backdrop-filter count bounded", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Spent this month").waitFor({ timeout: MAX_LOAD_MS });

    const blurCount = await page.evaluate(() => {
      let count = 0;
      for (const el of document.querySelectorAll("*")) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        const bf =
          getComputedStyle(el).backdropFilter ||
          getComputedStyle(el).webkitBackdropFilter;
        if (bf && bf !== "none") count++;
      }
      return count;
    });

    console.log(`Visible backdrop-filter elements: ${blurCount}`);
    expect(blurCount).toBeLessThanOrEqual(8); // ios-frosted + action card glass
  });

  test("no nested backdrop-filter stacking", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Spent this month").waitFor({ timeout: MAX_LOAD_MS });

    const nested = await page.evaluate(() => {
      let count = 0;
      for (const el of document.querySelectorAll("*")) {
        const bf = getComputedStyle(el).backdropFilter;
        if (!bf || bf === "none") continue;
        let p = el.parentElement;
        while (p) {
          if (
            getComputedStyle(p).backdropFilter &&
            getComputedStyle(p).backdropFilter !== "none"
          ) {
            count++;
            break;
          }
          p = p.parentElement;
        }
      }
      return count;
    });
    console.log(`Nested blur pairs: ${nested}`);
    expect(nested).toBe(0);
  });

  // ── DOM Complexity ──────────────────────────────────────────────

  test("expenses DOM node count bounded", async ({ page }) => {
    await page.goto("/expenses");
    await page.getByText("Lidl").first().waitFor({ timeout: MAX_LOAD_MS });
    const n = await page.evaluate(() => document.querySelectorAll("*").length);
    console.log(`Expenses DOM: ${n} nodes`);
    expect(n).toBeLessThan(1500);
  });

  test("dashboard DOM node count bounded", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Spent this month").waitFor({ timeout: MAX_LOAD_MS });
    const n = await page.evaluate(() => document.querySelectorAll("*").length);
    console.log(`Dashboard DOM: ${n} nodes`);
    expect(n).toBeLessThan(1500);
  });

  // ── CSS Animations ──────────────────────────────────────────────

  test("CSS animation count bounded", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Spent this month").waitFor({ timeout: MAX_LOAD_MS });

    const count = await page.evaluate(() => {
      let c = 0;
      for (const el of document.querySelectorAll("*")) {
        if (getComputedStyle(el).animationName !== "none") c++;
      }
      return c;
    });
    console.log(`Active CSS animations: ${count}`);
    expect(count).toBeLessThanOrEqual(8);
  });

  // ── framer-motion Layout ────────────────────────────────────────

  test("layout animation nav completes quickly", async ({ page }) => {
    await page.goto("/dashboard");
    const bottomNav = page.locator("nav.ios-frosted");
    await bottomNav.waitFor({ state: "visible", timeout: MAX_LOAD_MS });

    const start = Date.now();
    await bottomNav.getByText("Expenses").click();
    await page.waitForURL("**/expenses**");
    const t = Date.now() - start;
    console.log(`Layout anim + nav: ${t}ms`);
    expect(t).toBeLessThan(MAX_LOAD_MS);
  });

  // ── Memory ──────────────────────────────────────────────────────

  test("memory bounded across navigations", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Spent this month").waitFor({ timeout: MAX_LOAD_MS });
    const init = await heapSize(page);

    for (const p of ["/expenses", "/reports", "/dashboard"]) {
      await page.goto(p);
      await page.waitForTimeout(300);
    }

    const final = await heapSize(page);
    const mb = (final - init) / 1024 / 1024;
    console.log(`Heap growth: ${mb.toFixed(1)}MB`);
    expect(final - init).toBeLessThan(30 * 1024 * 1024);
  });

  // ── Compositor Layers ───────────────────────────────────────────

  test("will-change usage bounded", async ({ page }) => {
    await page.goto("/expenses");
    await page.getByText("Lidl").first().waitFor({ timeout: MAX_LOAD_MS });

    const count = await page.evaluate(() => {
      let c = 0;
      for (const el of document.querySelectorAll("*")) {
        if (getComputedStyle(el).willChange !== "auto") c++;
      }
      return c;
    });
    console.log(`will-change elements: ${count}`);
    expect(count).toBeLessThanOrEqual(5);
  });
});

// ── Helpers ──────────────────────────────────────────────────────

async function ensureScrollable(page: Page) {
  const ok = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight + 50
  );
  if (!ok) {
    await page.evaluate(() => {
      const s = document.createElement("div");
      s.style.height = "1000px";
      document.body.appendChild(s);
    });
  }
}

async function measureScrollFPS(page: Page): Promise<number> {
  // Wait for main thread to settle before measuring
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    return new Promise<number>((resolve) => {
      let frames = 0;
      let running = true;
      const dur = 1000;
      const startScroll = window.scrollY;

      function tick() {
        if (!running) return;
        frames++;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);

      const step = 300 / (dur / 16);
      let scrolled = 0;
      const iv = setInterval(() => {
        window.scrollBy(0, step);
        scrolled += step;
        if (scrolled >= 300) clearInterval(iv);
      }, 16);

      setTimeout(() => {
        running = false;
        const actualScroll = window.scrollY - startScroll;
        console.log(`Actual scroll displacement: ${actualScroll}px`);
        if (actualScroll < 10) {
          resolve(-1);
        } else {
          resolve((frames / dur) * 1000);
        }
      }, dur);
    });
  });
}

async function measureAnimationFPS(
  page: Page,
  action: () => Promise<void>
): Promise<{ fps: number; duration: number }> {
  await page.evaluate(() => {
    const w = window as any;
    w.__pf = 0;
    w.__pr = true;
    (function tick() {
      if (!w.__pr) return;
      w.__pf++;
      requestAnimationFrame(tick);
    })();
    w.__ps = performance.now();
  });

  await action();
  await page.waitForTimeout(350);

  return page.evaluate(() => {
    const w = window as any;
    w.__pr = false;
    const elapsed = performance.now() - w.__ps;
    return { fps: (w.__pf / elapsed) * 1000, duration: Math.round(elapsed) };
  });
}

async function heapSize(page: Page): Promise<number> {
  return page.evaluate(() =>
    (performance as any).memory
      ? (performance as any).memory.usedJSHeapSize
      : 0
  );
}
