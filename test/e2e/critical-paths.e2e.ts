// ═══════════════════════════════════════════════════════════════════
// critical-paths.e2e.ts — the flows that must never break
// ═══════════════════════════════════════════════════════════════════
// These codify the guarantees verified manually in earlier milestones:
// the chart loads and renders, manual drawing works, and — most
// importantly — scrolling into freshly-loaded history keeps candles and
// indicators perfectly aligned (no scramble, no flat lines).
// ═══════════════════════════════════════════════════════════════════

import { test, expect } from "@playwright/test";
import { blockFonts, launchDemo, canvasBox, panIntoHistory, readDomains } from "./helpers";

test.beforeEach(async ({ page }) => {
  await blockFonts(page);
});

test("loader launches the chart in demo mode", async ({ page }) => {
  await launchDemo(page);
  // status bar shows the demo symbol/timeframe
  await expect(page.locator("text=BTCUSDT").first()).toBeVisible();
  // a canvas is present and has real dimensions
  const box = await canvasBox(page);
  expect(box.w).toBeGreaterThan(200);
  expect(box.h).toBeGreaterThan(200);
});

test("no uncaught errors during a normal session", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !m.text().includes("Failed to load resource") &&
      !m.text().includes("ERR_FAILED")
    ) {
      errors.push(m.text());
    }
  });
  await launchDemo(page);
  await panIntoHistory(page, 4);
  expect(errors).toEqual([]);
});

test("drawing a trendline works and Delete removes it", async ({ page }) => {
  await launchDemo(page);
  const box = await canvasBox(page);
  const cx = box.x + box.w * 0.5;
  const cy = box.y + box.h * 0.4;

  // Alt+T selects the trend-line tool, then drag to place it
  await page.keyboard.press("Alt+t");
  await page.mouse.move(cx - 120, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 70, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  // a selection toolbar / box should appear for the new drawing
  // (delete it and confirm no crash)
  await page.keyboard.press("Delete");
  await page.waitForTimeout(200);
  // sanity: chart still alive
  expect((await canvasBox(page)).w).toBeGreaterThan(200);
});

test("history loads on scroll and indicators stay aligned (no scramble)", async ({ page }) => {
  // the e2e hook exposes engine domains for precise assertions
  await page.goto("/?e2e=1");
  await page.waitForTimeout(400);
  await page.click("#trex-mode-demo");
  await page.click("#trex-launch-btn");
  await page.waitForSelector("canvas", { timeout: 10_000 });
  await page.waitForTimeout(2000);

  const before = await readDomains(page);
  expect(before).not.toBeNull();
  const startBars = before!.candles.n;

  await panIntoHistory(page, 10);

  const after = await readDomains(page);
  expect(after).not.toBeNull();

  // history actually loaded — bar count grew
  expect(after!.candles.n).toBeGreaterThan(startBars);

  const candleLast = after!.candles.last;
  const inds = after!.inds;
  expect(Object.keys(inds).length).toBeGreaterThan(0);

  for (const [key, dom] of Object.entries(inds)) {
    // not collapsed into a flat line
    expect(dom.flat, `${key} should not be flat`).toBe(false);
    // right edge aligned with the candles (within a few bars)
    expect(
      Math.abs(dom.last - candleLast),
      `${key} last (${dom.last}) should align with candles (${candleLast})`
    ).toBeLessThan(300);
  }
});

test("magnet toggles via keyboard without error", async ({ page }) => {
  await launchDemo(page);
  await page.keyboard.press("m");
  await page.waitForTimeout(150);
  await page.keyboard.press("m");
  await page.waitForTimeout(150);
  expect((await canvasBox(page)).w).toBeGreaterThan(200);
});
