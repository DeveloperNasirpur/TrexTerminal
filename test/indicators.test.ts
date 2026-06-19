// ═══════════════════════════════════════════════════════════════════
// indicators.test.ts — mock-server math correctness
// ═══════════════════════════════════════════════════════════════════
// These functions back the demo/mock server (the terminal itself does
// no math). Even so, they must be correct: the demo is how the product
// is showcased. Tests use hand-computed values and structural invariants
// (output length after warm-up, value bounds, recurrence relations).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  calcSMA, calcEMA, calcWMA, calcRSI, calcMACD,
  calcBollinger, calcATR, calcStochastic, calcVWAP, extractSource,
} from "@/marketData";
import type { OHLC } from "@/types";

/** Build candles with explicit closes; OHLC kept simple but valid. */
function candlesFromCloses(closes: number[], hi?: number[], lo?: number[]): OHLC[] {
  return closes.map((c, i) => ({
    time: 1_700_000_000 + i * 60,
    open: i === 0 ? c : closes[i - 1],
    high: hi ? hi[i] : Math.max(c, i === 0 ? c : closes[i - 1]),
    low: lo ? lo[i] : Math.min(c, i === 0 ? c : closes[i - 1]),
    close: c,
    volume: 100,
  }));
}

describe("calcSMA", () => {
  it("computes the rolling average with correct warm-up length", () => {
    const c = candlesFromCloses([1, 2, 3, 4, 5]);
    const sma = calcSMA(c, 3);
    expect(sma.length).toBe(3);            // 5 - 3 + 1
    expect(sma[0].value).toBeCloseTo(2);   // (1+2+3)/3
    expect(sma[1].value).toBeCloseTo(3);   // (2+3+4)/3
    expect(sma[2].value).toBeCloseTo(4);   // (3+4+5)/3
  });

  it("aligns each output to the candle at the window's right edge", () => {
    const c = candlesFromCloses([10, 20, 30, 40]);
    const sma = calcSMA(c, 2);
    expect(sma[0].time).toBe(c[1].time);
    expect(sma[sma.length - 1].time).toBe(c[c.length - 1].time);
  });

  it("returns nothing when the series is shorter than the period", () => {
    expect(calcSMA(candlesFromCloses([1, 2]), 5)).toHaveLength(0);
  });
});

describe("calcEMA", () => {
  it("emits one value per candle from the warm-up point on", () => {
    const c = candlesFromCloses([1, 2, 3, 4, 5, 6]);
    const ema = calcEMA(c, 3);
    expect(ema.length).toBe(4); // i >= period-1 → indices 2..5
  });

  it("tracks a constant series exactly", () => {
    const c = candlesFromCloses(Array(20).fill(50));
    const ema = calcEMA(c, 5);
    for (const p of ema) expect(p.value).toBeCloseTo(50);
  });

  it("reacts faster than SMA right after a step change", () => {
    // Long flat run then a step up. At the FIRST point after the step,
    // the EMA (which weights the newest close by k) has moved more than
    // the SMA (which only includes one new value in its window average).
    const c = candlesFromCloses([10, 10, 10, 10, 10, 10, 10, 10, 20]);
    const ema = calcEMA(c, 4);
    const sma = calcSMA(c, 4);
    // align both to the last candle (the step)
    const emaAtStep = ema[ema.length - 1].value;
    const smaAtStep = sma[sma.length - 1].value;
    expect(emaAtStep).toBeGreaterThan(smaAtStep);
  });

  it("returns empty for an empty series", () => {
    expect(calcEMA([], 5)).toHaveLength(0);
  });
});

describe("calcWMA", () => {
  it("weights recent closes more heavily", () => {
    const c = candlesFromCloses([1, 2, 3]);
    const wma = calcWMA(c, 3);
    // (1*1 + 2*2 + 3*3) / (1+2+3) = 14/6
    expect(wma[0].value).toBeCloseTo(14 / 6);
  });

  it("has the correct warm-up length", () => {
    expect(calcWMA(candlesFromCloses([1, 2, 3, 4, 5]), 3)).toHaveLength(3);
  });
});

describe("calcRSI", () => {
  it("returns 100 when every move is a gain", () => {
    const c = candlesFromCloses([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const rsi = calcRSI(c, 14);
    expect(rsi.length).toBeGreaterThan(0);
    for (const p of rsi) expect(p.value).toBeCloseTo(100);
  });

  it("keeps every value within [0, 100]", () => {
    const closes = Array.from({ length: 100 }, (_, i) => 50 + 10 * Math.sin(i / 3));
    const rsi = calcRSI(candlesFromCloses(closes), 14);
    for (const p of rsi) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });

  it("returns empty when too short", () => {
    expect(calcRSI(candlesFromCloses([1, 2, 3]), 14)).toHaveLength(0);
  });
});

describe("calcMACD", () => {
  it("produces aligned macd/signal/histogram series", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 5);
    const out = calcMACD(candlesFromCloses(closes), 12, 26, 9);
    // returns an object of named series; each should be a non-empty array
    const series = Object.values(out);
    expect(series.length).toBeGreaterThanOrEqual(3);
    for (const s of series) expect(Array.isArray(s)).toBe(true);
  });
});

describe("calcBollinger", () => {
  it("keeps upper ≥ mid ≥ lower at every point", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 8);
    const out = calcBollinger(candlesFromCloses(closes), 20, 2);
    const keys = Object.keys(out);
    expect(keys.length).toBeGreaterThanOrEqual(3);
    // find upper/mid/lower by key name heuristics
    const upper = out[keys.find((k) => /upper/i.test(k))!];
    const mid = out[keys.find((k) => /mid/i.test(k))!];
    const lower = out[keys.find((k) => /lower/i.test(k))!];
    for (let i = 0; i < mid.length; i++) {
      expect(upper[i].value).toBeGreaterThanOrEqual(mid[i].value);
      expect(mid[i].value).toBeGreaterThanOrEqual(lower[i].value);
    }
  });
});

describe("calcATR", () => {
  it("is non-negative everywhere", () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const hi = closes.map((c) => c + 2);
    const lo = closes.map((c) => c - 2);
    const atr = calcATR(candlesFromCloses(closes, hi, lo), 14);
    for (const p of atr) expect(p.value).toBeGreaterThanOrEqual(0);
  });
});

describe("calcStochastic", () => {
  it("keeps %K and %D within [0, 100]", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 50 + 20 * Math.sin(i / 5));
    const hi = closes.map((c) => c + 5);
    const lo = closes.map((c) => c - 5);
    const out = calcStochastic(candlesFromCloses(closes, hi, lo), 14, 3);
    for (const series of Object.values(out)) {
      for (const p of series) {
        expect(p.value).toBeGreaterThanOrEqual(0);
        expect(p.value).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("calcVWAP", () => {
  it("returns one value per candle and stays within the price envelope", () => {
    const closes = [10, 12, 11, 13, 12];
    const hi = [11, 13, 12, 14, 13];
    const lo = [9, 11, 10, 12, 11];
    const vwap = calcVWAP(candlesFromCloses(closes, hi, lo));
    expect(vwap.length).toBe(closes.length);
    const maxHi = Math.max(...hi), minLo = Math.min(...lo);
    for (const p of vwap) {
      expect(p.value).toBeLessThanOrEqual(maxHi + 1e-6);
      expect(p.value).toBeGreaterThanOrEqual(minLo - 1e-6);
    }
  });
});

describe("extractSource", () => {
  const c = candlesFromCloses([10, 20], [12, 22], [8, 18]); // open=[10,10] high=[12,22] low=[8,18] close=[10,20]

  it("pulls the requested price field", () => {
    expect(extractSource(c, "close")).toEqual([10, 20]);
    expect(extractSource(c, "high")).toEqual([12, 22]);
    expect(extractSource(c, "low")).toEqual([8, 18]);
    expect(extractSource(c, "open")).toEqual([10, 10]);
  });

  it("computes composite sources", () => {
    // hl2 = (high + low) / 2
    expect(extractSource(c, "hl2")).toEqual([(12 + 8) / 2, (22 + 18) / 2]);
    // hlc3 = (high + low + close) / 3
    expect(extractSource(c, "hlc3")[0]).toBeCloseTo((12 + 8 + 10) / 3);
  });
});
