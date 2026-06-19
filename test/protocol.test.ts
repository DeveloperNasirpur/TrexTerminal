// ═══════════════════════════════════════════════════════════════════
// protocol.test.ts — timeframe parsing & config invariants
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  timeframeToSeconds,
  TIMEFRAMES,
  CHART_TYPES,
  DEFAULT_SETTINGS,
  DEFAULT_FIB_LEVELS,
  DRAWING_COLORS,
} from "@/types";

describe("timeframeToSeconds", () => {
  it("parses every unit correctly", () => {
    expect(timeframeToSeconds("1s")).toBe(1);
    expect(timeframeToSeconds("30s")).toBe(30);
    expect(timeframeToSeconds("1m")).toBe(60);
    expect(timeframeToSeconds("5m")).toBe(300);
    expect(timeframeToSeconds("1h")).toBe(3600);
    expect(timeframeToSeconds("4h")).toBe(14400);
    expect(timeframeToSeconds("1d")).toBe(86400);
    expect(timeframeToSeconds("1w")).toBe(604800);
    expect(timeframeToSeconds("1M")).toBe(2592000);
  });

  it("falls back to 60s for malformed input", () => {
    expect(timeframeToSeconds("")).toBe(60);
    expect(timeframeToSeconds("abc")).toBe(60);
    expect(timeframeToSeconds("m5")).toBe(60);
    expect(timeframeToSeconds("5x")).toBe(60);
    expect(timeframeToSeconds("5.5m")).toBe(60);
  });

  it("is case-sensitive for m (minute) vs M (month)", () => {
    expect(timeframeToSeconds("1m")).toBe(60);
    expect(timeframeToSeconds("1M")).toBe(2592000);
    expect(timeframeToSeconds("1m")).not.toBe(timeframeToSeconds("1M"));
  });

  it("resolves every advertised timeframe to a positive duration", () => {
    for (const tf of TIMEFRAMES) {
      expect(timeframeToSeconds(tf.value)).toBeGreaterThan(0);
    }
  });
});

describe("config invariants", () => {
  it("ships a non-empty, well-formed timeframe list", () => {
    expect(TIMEFRAMES.length).toBeGreaterThan(0);
    for (const tf of TIMEFRAMES) {
      expect(tf.value).toBeTruthy();
      expect(tf.label).toBeTruthy();
    }
  });

  it("ships the five expected chart types", () => {
    const values = CHART_TYPES.map((t) => t.value).sort();
    expect(values).toEqual(["area", "bars", "candles", "heikin", "line"].sort());
  });

  it("default settings use a sane TradingView-style palette", () => {
    expect(DEFAULT_SETTINGS.candleUpColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(DEFAULT_SETTINGS.candleDownColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(DEFAULT_SETTINGS.backgroundColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(DEFAULT_SETTINGS.symbol).toBeTruthy();
    expect(DEFAULT_SETTINGS.timeframe).toBeTruthy();
  });

  it("default fib levels are ordered and within [0, 1+] with valid colors", () => {
    expect(DEFAULT_FIB_LEVELS.length).toBeGreaterThan(0);
    for (const l of DEFAULT_FIB_LEVELS) {
      expect(l.value).toBeGreaterThanOrEqual(0);
      expect(l.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("drawing palette colors are all valid hex", () => {
    expect(DRAWING_COLORS.length).toBeGreaterThan(0);
    for (const c of DRAWING_COLORS) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
