// ═══════════════════════════════════════════════════════════════════
// points.test.ts — series-point contract & conditional coloring
// ═══════════════════════════════════════════════════════════════════
// Indicator series data points carry an optional per-point `color` that
// enables server-driven conditional coloring (a histogram bar or line
// segment tinted by the server, with no client computation). These tests
// pin the validation and the color-preservation guarantee.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { isValidPoint, sanitizePoints } from "@/protocol";

describe("isValidPoint", () => {
  it("accepts a plain point", () => {
    expect(isValidPoint({ time: 1, value: 42 })).toBe(true);
  });

  it("accepts a point with a color", () => {
    expect(isValidPoint({ time: 1, value: 42, color: "#FF0000" })).toBe(true);
  });

  it("rejects NaN / infinite value", () => {
    expect(isValidPoint({ time: 1, value: NaN })).toBe(false);
    expect(isValidPoint({ time: 1, value: Infinity })).toBe(false);
  });

  it("rejects a non-finite time", () => {
    expect(isValidPoint({ time: NaN, value: 1 })).toBe(false);
  });

  it("rejects a non-string color", () => {
    expect(isValidPoint({ time: 1, value: 1, color: 123 })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidPoint(null)).toBe(false);
    expect(isValidPoint(5)).toBe(false);
  });
});

describe("sanitizePoints", () => {
  it("keeps valid points and drops invalid ones", () => {
    const out = sanitizePoints([
      { time: 1, value: 10 },
      { time: 2, value: NaN }, // dropped
      { time: 3, value: 30 },
    ]);
    expect(out.map((p) => p.value)).toEqual([10, 30]);
  });

  it("preserves the per-point color (conditional coloring)", () => {
    const out = sanitizePoints([
      { time: 1, value: 10, color: "#FF0000" },
      { time: 2, value: 20, color: "#00FF00" },
      { time: 3, value: 30 }, // no color
    ]);
    expect(out[0].color).toBe("#FF0000");
    expect(out[1].color).toBe("#00FF00");
    expect(out[2].color).toBeUndefined();
  });

  it("does NOT sort or dedupe (series may carry gaps)", () => {
    const out = sanitizePoints([
      { time: 5, value: 1 },
      { time: 2, value: 2 },
      { time: 9, value: 3 },
    ]);
    expect(out.map((p) => Number(p.time))).toEqual([5, 2, 9]);
  });

  it("returns [] for non-array input", () => {
    expect(sanitizePoints(null)).toEqual([]);
    expect(sanitizePoints("nope")).toEqual([]);
  });
});
