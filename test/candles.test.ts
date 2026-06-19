// ═══════════════════════════════════════════════════════════════════
// candles.test.ts — data-generation invariants
// ═══════════════════════════════════════════════════════════════════
// These functions back the demo/mock server. The terminal renders
// whatever they produce, so their invariants (valid OHLC, strictly
// ordered times, a continuous seam when prepending history) are load-
// bearing: a violation here surfaces as a corrupted or scrambled chart.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  generateDemoCandles,
  generateOlderCandles,
  generateNextCandle,
  updateLiveCandle,
} from "@/marketData";
import type { OHLC } from "@/types";

const tn = (t: OHLC["time"]) => Number(t);

/** Assert one candle is internally consistent. */
function expectValidOHLC(c: OHLC) {
  expect(c.high).toBeGreaterThanOrEqual(c.open);
  expect(c.high).toBeGreaterThanOrEqual(c.close);
  expect(c.high).toBeGreaterThanOrEqual(c.low);
  expect(c.low).toBeLessThanOrEqual(c.open);
  expect(c.low).toBeLessThanOrEqual(c.close);
  expect(Number.isFinite(c.open)).toBe(true);
  expect(Number.isFinite(c.close)).toBe(true);
  expect(c.volume ?? 0).toBeGreaterThanOrEqual(0);
}

/** Assert an array's times are strictly increasing with no duplicates. */
function expectStrictlyIncreasing(candles: OHLC[]) {
  for (let i = 1; i < candles.length; i++) {
    expect(tn(candles[i].time)).toBeGreaterThan(tn(candles[i - 1].time));
  }
}

describe("generateDemoCandles", () => {
  it("returns the requested count", () => {
    expect(generateDemoCandles(250, 42000, 60).length).toBe(250);
    expect(generateDemoCandles(1, 100, 60).length).toBe(1);
    expect(generateDemoCandles(0, 100, 60).length).toBe(0);
  });

  it("produces valid OHLC for every candle", () => {
    for (const c of generateDemoCandles(500, 42000, 60)) expectValidOHLC(c);
  });

  it("emits strictly increasing, evenly-spaced times", () => {
    const candles = generateDemoCandles(300, 42000, 60);
    expectStrictlyIncreasing(candles);
    for (let i = 1; i < candles.length; i++) {
      expect(tn(candles[i].time) - tn(candles[i - 1].time)).toBe(60);
    }
  });

  it("honours a custom interval", () => {
    const c = generateDemoCandles(10, 100, 3600);
    expect(tn(c[1].time) - tn(c[0].time)).toBe(3600);
  });

  it("anchors the last candle near endTime", () => {
    const end = 1_700_000_000;
    const c = generateDemoCandles(100, 42000, 60, end);
    expect(tn(c[c.length - 1].time)).toBe(end - 60);
  });

  it("starts the walk at the requested base price", () => {
    const c = generateDemoCandles(50, 999, 60);
    expect(c[0].open).toBe(999);
  });
});

describe("generateOlderCandles", () => {
  it("returns the requested count, all strictly before beforeTime", () => {
    const before = 1_700_000_000;
    const older = generateOlderCandles(before, 120, 42000, 60);
    expect(older.length).toBe(120);
    for (const c of older) expect(tn(c.time)).toBeLessThan(before);
  });

  it("is internally ordered and valid", () => {
    const older = generateOlderCandles(1_700_000_000, 200, 42000, 60);
    expectStrictlyIncreasing(older);
    older.forEach(expectValidOHLC);
  });

  it("forms a continuous seam when prepended to existing candles", () => {
    // Mimics the engine's prependHistory: older bars must slot in just
    // before the current first candle with the correct spacing.
    const interval = 60;
    const main = generateDemoCandles(100, 42000, interval, 1_700_000_000);
    const firstTime = tn(main[0].time);
    const anchor = main[0].open;
    const older = generateOlderCandles(firstTime, 300, anchor, interval);

    const merged = [...older, ...main];
    expectStrictlyIncreasing(merged); // no dupes, no gaps in ordering
    // the seam spacing equals the interval
    expect(firstTime - tn(older[older.length - 1].time)).toBe(interval);
  });
});

describe("generateNextCandle", () => {
  it("advances time by exactly one interval", () => {
    const prev = generateDemoCandles(1, 42000, 60)[0];
    const next = generateNextCandle(prev, 60);
    expect(tn(next.time) - tn(prev.time)).toBe(60);
  });

  it("opens near the previous close and stays valid", () => {
    const prev = generateDemoCandles(1, 42000, 60)[0];
    const next = generateNextCandle(prev, 60);
    expectValidOHLC(next);
    // open within a small band of the prior close
    expect(Math.abs(next.open - prev.close)).toBeLessThan(prev.close * 0.01);
  });
});

describe("updateLiveCandle", () => {
  it("keeps the same timestamp", () => {
    const bar = generateDemoCandles(1, 42000, 60)[0];
    const updated = updateLiveCandle(bar);
    expect(updated.time).toBe(bar.time);
  });

  it("never shrinks the high/low envelope and stays valid", () => {
    let bar = generateDemoCandles(1, 42000, 60)[0];
    for (let i = 0; i < 200; i++) {
      const updated = updateLiveCandle(bar);
      expect(updated.high).toBeGreaterThanOrEqual(bar.high);
      expect(updated.low).toBeLessThanOrEqual(bar.low);
      expectValidOHLC(updated);
      bar = updated;
    }
  });

  it("accumulates volume", () => {
    const bar = { ...generateDemoCandles(1, 42000, 60)[0], volume: 100 };
    expect((updateLiveCandle(bar).volume ?? 0)).toBeGreaterThanOrEqual(100);
  });
});
