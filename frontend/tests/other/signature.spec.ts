import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "../shared/mocks";

/**
 * Signature pad at high device pixel ratio (WIP Phase 0.1 regression):
 * strokes are captured in raw CSS pixels and mapped by the context
 * transform, so ink must land where the pointer moved — not at dpr² scale.
 */

test.use({ deviceScaleFactor: 2, viewport: { width: 500, height: 800 }, hasTouch: false });

test.describe("Signature pad", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/sw.js", (route) => route.abort());
    await setupAuthMocks(page, "user");
    await page.route("**/api/users/me/signature", (route) =>
      route.fulfill({ status: 404, json: { detail: "no signature" } })
    );
    await page.goto("/profile/signature", { waitUntil: "load" });
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("stroke follows the cursor at dpr=2", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Draw a horizontal stroke from ~(40, 50) to ~(120, 50) in CSS pixels.
    const startX = box!.x + 40;
    const y = box!.y + 50;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(startX + i * 10, y, { steps: 2 });
    }
    await page.mouse.up();

    // Scan the backing store and convert the ink bounding box back to CSS
    // units. With the old dpr² bug the stroke landed at 4× coordinates —
    // far right of the canvas (or fully clipped away).
    const inkBox = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const dpr = window.devicePixelRatio || 1;
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, inked = 0;
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          if (data[(py * width + px) * 4 + 3] > 0) {
            inked++;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
        }
      }
      return inked > 0 ? { minX: minX / dpr, maxX: maxX / dpr, minY: minY / dpr, maxY: maxY / dpr } : null;
    });

    expect(inkBox).not.toBeNull();
    expect(inkBox!.minX).toBeGreaterThan(25); // ink started where the pointer did
    expect(inkBox!.minX).toBeLessThan(60);
    expect(inkBox!.maxX).toBeGreaterThan(100); // full stroke length captured
    expect(inkBox!.maxY).toBeGreaterThan(35);
    expect(inkBox!.minY).toBeLessThan(65);
  });
});
