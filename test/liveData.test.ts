// ═══════════════════════════════════════════════════════════════════
// liveData.test.ts — live-data & history contract guarantees
// ═══════════════════════════════════════════════════════════════════
// Candles stream from an untrusted source. These tests pin the boundary
// guarantees the engine relies on: every ingested bar is structurally
// valid, the time domain is strictly increasing and unique, and the
// end-of-history flag is unambiguous.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { isValidBar, sanitizeCandles, sanitizeHistory } from "@/protocol";
import type { OHLC } from "@/types";

const bar = (time: number, o: number, h: number, l: number, c: number, v = 10): OHLC =>
  ({ time, open: o, high: h, low: l, close: c, volume: v } as unknown as OHLC);

describe("isValidBar", () => {
  it("accepts a well-formed bar", () => {
    expect(isValidBar(bar(1, 10, 12, 9, 11))).toBe(true);
  });

  it("accepts a bar without volume", () => {
    expect(isValidBar({ time: 1, open: 1, high: 2, low: 0.5, close: 1.5 })).toBe(true);
  });

  it("rejects NaN / infinite prices", () => {
    expect(isValidBar({ time: 1, open: NaN, high: 2, low: 0, close: 1 })).toBe(false);
    expect(isValidBar({ time: 1, open: 1, high: Infinity, low: 0, close: 1 })).toBe(false);
  });

  it("rejects a missing field", () => {
    expect(isValidBar({ time: 1, open: 1, high: 2, low: 0 })).toBe(false);
  });

  it("rejects a non-finite time", () => {
    expect(isValidBar({ time: NaN, open: 1, high: 2, low: 0, close: 1 })).toBe(false);
  });

  it("rejects inverted high/low (high below body)", () => {
    // high (1.2) is below close (1.5) → invalid
    expect(isValidBar({ time: 1, open: 1, high: 1.2, low: 0.5, close: 1.5 })).toBe(false);
  });

  it("rejects low above the body", () => {
    // low (1.1) is above open (1.0) → invalid
    expect(isValidBar({ time: 1, open: 1.0, high: 2, low: 1.1, close: 1.5 })).toBe(false);
  });

  it("rejects negative volume", () => {
    expect(isValidBar({ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: -5 })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidBar(null)).toBe(false);
    expect(isValidBar(42)).toBe(false);
    expect(isValidBar("bar")).toBe(false);
  });
});

describe("sanitizeCandles", () => {
  it("drops malformed bars and keeps valid ones", () => {
    const input = [
      bar(3, 1, 2, 0.5, 1.5),
      { time: 2, open: NaN, high: 2, low: 0, close: 1 }, // dropped
      bar(1, 1, 2, 0.5, 1.5),
    ];
    const out = sanitizeCandles(input);
    expect(out.map((c) => Number(c.time))).toEqual([1, 3]);
  });

  it("sorts ascending by time", () => {
    const out = sanitizeCandles([bar(5, 1, 2, 0, 1), bar(2, 1, 2, 0, 1), bar(9, 1, 2, 0, 1)]);
    expect(out.map((c) => Number(c.time))).toEqual([2, 5, 9]);
  });

  it("collapses duplicate timestamps (last wins)", () => {
    // both bars valid (high ≥ body); same time → the later one wins
    const out = sanitizeCandles([bar(1, 1, 2, 0, 1.1), bar(1, 8, 10, 7, 9.9)]);
    expect(out).toHaveLength(1);
    expect(out[0].close).toBe(9.9);
  });

  it("guarantees a strictly increasing unique domain", () => {
    const out = sanitizeCandles([bar(3, 1, 2, 0, 1), bar(1, 1, 2, 0, 1), bar(3, 1, 2, 0, 2), bar(2, 1, 2, 0, 1)]);
    const times = out.map((c) => Number(c.time));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it("returns [] for non-array input", () => {
    expect(sanitizeCandles(null)).toEqual([]);
    expect(sanitizeCandles("nope")).toEqual([]);
  });
});

describe("sanitizeHistory", () => {
  it("treats an empty page as end-of-history", () => {
    expect(sanitizeHistory([]).noMoreHistory).toBe(true);
    expect(sanitizeHistory([]).data).toEqual([]);
  });

  it("honours an explicit noMoreHistory flag even with data", () => {
    const page = sanitizeHistory([bar(1, 1, 2, 0, 1)], true);
    expect(page.noMoreHistory).toBe(true);
    expect(page.data).toHaveLength(1);
  });

  it("reports more history available when a non-empty page arrives", () => {
    const page = sanitizeHistory([bar(1, 1, 2, 0, 1), bar(2, 1, 2, 0, 1)]);
    expect(page.noMoreHistory).toBe(false);
    expect(page.data).toHaveLength(2);
  });

  it("sanitizes the page's candles too", () => {
    const page = sanitizeHistory([bar(2, 1, 2, 0, 1), { time: 1, open: NaN, high: 1, low: 0, close: 1 }]);
    expect(page.data).toHaveLength(1);
    expect(Number(page.data[0].time)).toBe(2);
  });
});
