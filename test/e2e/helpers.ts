// ═══════════════════════════════════════════════════════════════════
// helpers.ts — shared e2e utilities
// ═══════════════════════════════════════════════════════════════════

import type { Page } from "@playwright/test";

/** Block Google Fonts so a sandboxed run doesn't log noisy 403s. */
export async function blockFonts(page: Page) {
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
}

/** Launch the terminal in demo mode from the loader. */
export async function launchDemo(page: Page) {
  await page.goto("/");
  await page.waitForTimeout(400);
  await page.click("#trex-mode-demo");
  await page.click("#trex-launch-btn");
  // wait for the chart canvas to mount and the feed to deliver candles
  await page.waitForSelector("canvas", { timeout: 10_000 });
  await page.waitForTimeout(2000);
}

/** Bounding box of the main chart canvas. */
export async function canvasBox(page: Page) {
  const box = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (!box) throw new Error("chart canvas not found");
  return box;
}

/** Drag the chart to the right `times`, revealing (and loading) older bars. */
export async function panIntoHistory(page: Page, times = 8) {
  const box = await canvasBox(page);
  const cx = box.x + box.w * 0.5;
  const cy = box.y + box.h * 0.4;
  for (let i = 0; i < times; i++) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 320, cy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(800);
}

/** Read the engine's candle + indicator domains (test hook on window). */
export async function readDomains(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __trexTest?: {
        candleDomain(): { n: number; last: number };
        indicatorDomains(): Record<string, { n: number; last: number; flat: boolean }>;
      };
    };
    if (!w.__trexTest) return null;
    return { candles: w.__trexTest.candleDomain(), inds: w.__trexTest.indicatorDomains() };
  });
}
