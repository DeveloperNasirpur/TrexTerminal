// ═══════════════════════════════════════════════════════════════════
// marketData.ts — shared, STATELESS market-data toolkit
// ═══════════════════════════════════════════════════════════════════
// This module holds pure, side-effect-free helpers used in three places:
//   • the mock server (mockServer.ts) to synthesise demo data,
//   • the unit-test suite (math correctness),
//   • the Indicator Builder's design-time PREVIEW (sample data only).
//
// IMPORTANT — architecture boundary:
//   The terminal core NEVER computes real display data. In server mode
//   every value arrives pre-computed from the data source. The math here
//   exists ONLY to power the demo's simulated server and the Builder
//   preview; it is never run against live server data.
// ═══════════════════════════════════════════════════════════════════


import type {
  OHLC,
  PointData,
  SeriesDefinition,
  CalcSpec,
  PriceSource,
} from "./types";
import type { Time } from "lightweight-charts";

export function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

const asTime = (n: number): Time => n as unknown as Time;
const tn = (t: Time): number => t as unknown as number;

export function generateDemoCandles(
  count: number = 500,
  basePrice: number = 42000,
  intervalSec: number = 60,
  endTime?: number
): OHLC[] {
  const candles: OHLC[] = [];
  let price = basePrice;
  const now = endTime ?? Math.floor(Date.now() / 1000);
  const interval = intervalSec;

  for (let i = 0; i < count; i++) {
    const time = asTime(now - (count - i) * interval);
    const volatility = price * 0.003;
    const drift = rand(-0.001, 0.001) * price;

    const open = price;
    const change1 = rand(-volatility, volatility) + drift;
    const close = open + change1;

    const high = Math.max(open, close) + Math.abs(rand(0, volatility * 0.5));
    const low = Math.min(open, close) - Math.abs(rand(0, volatility * 0.5));

    const volume = Math.round(rand(10, 500) * (1 + Math.abs(change1) / volatility));

    candles.push({ time, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

/**
 * Generates `count` candles strictly OLDER than `beforeTime`, walking the
 * random process backwards from `anchorPrice` so the seam is continuous.
 * Used by the cache when the user scrolls into uncached history.
 */
export function generateOlderCandles(
  beforeTime: number,
  count: number,
  anchorPrice: number,
  intervalSec: number
): OHLC[] {
  const out: OHLC[] = [];
  let close = anchorPrice;
  for (let i = 1; i <= count; i++) {
    const time = asTime(beforeTime - i * intervalSec);
    const volatility = close * 0.003;
    const drift = rand(-0.001, 0.001) * close;
    const open = close - (rand(-volatility, volatility) + drift);
    const high = Math.max(open, close) + Math.abs(rand(0, volatility * 0.5));
    const low = Math.min(open, close) - Math.abs(rand(0, volatility * 0.5));
    const volume = Math.round(rand(10, 500));
    out.push({ time, open, high, low, close, volume });
    close = open;
  }
  out.reverse();
  return out;
}

export function generateNextCandle(prev: OHLC, intervalSec: number = 60): OHLC {
  const prevClose = prev.close;
  const volatility = prevClose * 0.002;
  const drift = rand(-0.0005, 0.0005) * prevClose;
  const time = asTime(tn(prev.time) + intervalSec);

  const open = prevClose + rand(-volatility * 0.1, volatility * 0.1);
  const close = open + rand(-volatility, volatility) + drift;
  const high = Math.max(open, close) + Math.abs(rand(0, volatility * 0.4));
  const low = Math.min(open, close) - Math.abs(rand(0, volatility * 0.4));
  const volume = Math.round(rand(10, 500));

  return { time, open, high, low, close, volume };
}

export function updateLiveCandle(bar: OHLC): OHLC {
  const volatility = bar.close * 0.0005;
  const change = rand(-volatility, volatility);
  const newClose = bar.close + change;
  return {
    ...bar,
    close: newClose,
    high: Math.max(bar.high, newClose),
    low: Math.min(bar.low, newClose),
    volume: (bar.volume || 0) + Math.round(rand(1, 10)),
  };
}

// ── Price source extraction ─────────────────────────────────────

export function extractSource(candles: OHLC[], source: PriceSource): number[] {
  switch (source) {
    case "open": return candles.map((c) => c.open);
    case "high": return candles.map((c) => c.high);
    case "low": return candles.map((c) => c.low);
    case "hl2": return candles.map((c) => (c.high + c.low) / 2);
    case "hlc3": return candles.map((c) => (c.high + c.low + c.close) / 3);
    case "ohlc4": return candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
    case "volume": return candles.map((c) => c.volume ?? 0);
    case "close":
    default: return candles.map((c) => c.close);
  }
}

// ── Indicator Calculations ──────────────────────────────────────

export function calcSMA(candles: OHLC[], period: number): PointData[] {
  const result: PointData[] = [];
  // Rolling sum — O(n) instead of the naive O(n·period).
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) result.push({ time: candles[i].time, value: sum / period });
  }
  return result;
}

export function calcEMA(candles: OHLC[], period: number): PointData[] {
  const result: PointData[] = [];
  if (candles.length === 0) return result;

  const k = 2 / (period + 1);
  let ema = candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    if (i >= period - 1) {
      result.push({ time: candles[i].time, value: ema });
    }
  }
  return result;
}

export function calcWMA(candles: OHLC[], period: number): PointData[] {
  const result: PointData[] = [];
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < candles.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) acc += candles[i - j].close * (period - j);
    result.push({ time: candles[i].time, value: acc / denom });
  }
  return result;
}

export function calcRSI(candles: OHLC[], period: number = 14): PointData[] {
  const result: PointData[] = [];
  if (candles.length < period + 1) return result;

  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ time: candles[period].time, value: rsi0 });

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: candles[i].time, value: rsi });
  }
  return result;
}

export function calcMACD(
  candles: OHLC[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9
): { line: PointData[]; signal: PointData[]; hist: PointData[] } {
  if (candles.length < slow) {
    return { line: [], signal: [], hist: [] };
  }

  const kFast = 2 / (fast + 1);
  const kSlow = 2 / (slow + 1);
  const kSig = 2 / (signal + 1);

  let emaFast = candles[0].close;
  let emaSlow = candles[0].close;

  const macdLine: PointData[] = [];

  for (let i = 0; i < candles.length; i++) {
    emaFast = candles[i].close * kFast + emaFast * (1 - kFast);
    emaSlow = candles[i].close * kSlow + emaSlow * (1 - kSlow);

    if (i >= slow - 1) {
      macdLine.push({
        time: candles[i].time,
        value: emaFast - emaSlow,
      });
    }
  }

  const signalLine: PointData[] = [];
  if (macdLine.length === 0) return { line: [], signal: [], hist: [] };

  let sigEma = macdLine[0].value;
  for (let i = 0; i < macdLine.length; i++) {
    sigEma = macdLine[i].value * kSig + sigEma * (1 - kSig);
    if (i >= signal - 1) {
      signalLine.push({ time: macdLine[i].time, value: sigEma });
    }
  }

  const hist: PointData[] = [];
  const offset = macdLine.length - signalLine.length;
  for (let i = 0; i < signalLine.length; i++) {
    hist.push({
      time: signalLine[i].time,
      value: macdLine[i + offset].value - signalLine[i].value,
    });
  }

  return { line: macdLine, signal: signalLine, hist };
}

export function calcBollinger(
  candles: OHLC[],
  period: number = 20,
  stdDev: number = 2
): { upper: PointData[]; mid: PointData[]; lower: PointData[] } {
  const upper: PointData[] = [];
  const mid: PointData[] = [];
  const lower: PointData[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const mean = sum / period;

    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sqSum += (candles[j].close - mean) ** 2;
    }
    const std = Math.sqrt(sqSum / period);

    mid.push({ time: candles[i].time, value: mean });
    upper.push({ time: candles[i].time, value: mean + stdDev * std });
    lower.push({ time: candles[i].time, value: mean - stdDev * std });
  }
  return { upper, mid, lower };
}

export function calcATR(candles: OHLC[], period: number = 14): PointData[] {
  const result: PointData[] = [];
  if (candles.length < period + 1) return result;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push({ time: candles[period].time, value: atr });
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result.push({ time: candles[i + 1].time, value: atr });
  }
  return result;
}

export function calcStochastic(
  candles: OHLC[],
  kPeriod: number = 14,
  dPeriod: number = 3,
  smooth: number = 3
): { k: PointData[]; d: PointData[] } {
  const rawK: PointData[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    rawK.push({ time: candles[i].time, value: range === 0 ? 50 : ((candles[i].close - ll) / range) * 100 });
  }
  const smaOf = (pts: PointData[], p: number): PointData[] => {
    const out: PointData[] = [];
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      sum += pts[i].value;
      if (i >= p) sum -= pts[i - p].value;
      if (i >= p - 1) out.push({ time: pts[i].time, value: sum / p });
    }
    return out;
  };
  const k = smaOf(rawK, smooth);
  const d = smaOf(k, dPeriod);
  return { k, d };
}

export function calcVWAP(candles: OHLC[]): PointData[] {
  const result: PointData[] = [];
  let cumPV = 0;
  let cumV = 0;
  let sessionDay = -1;
  for (const c of candles) {
    const day = Math.floor(tn(c.time) / 86400);
    if (day !== sessionDay) {
      sessionDay = day;
      cumPV = 0;
      cumV = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    const v = c.volume ?? 0;
    cumPV += typical * v;
    cumV += v;
    result.push({ time: c.time, value: cumV === 0 ? typical : cumPV / cumV });
  }
  return result;
}

// ── Generic calc engine (Indicator Builder recipes) ─────────────

function smaArr(src: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(src.length).fill(null);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= period) sum -= src[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function emaArr(src: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(src.length).fill(null);
  if (src.length === 0) return out;
  const k = 2 / (period + 1);
  let ema = src[0];
  for (let i = 0; i < src.length; i++) {
    ema = src[i] * k + ema * (1 - k);
    if (i >= period - 1) out[i] = ema;
  }
  return out;
}

function wmaArr(src: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(src.length).fill(null);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < src.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) acc += src[i - j] * (period - j);
    out[i] = acc / denom;
  }
  return out;
}

function rsiArr(src: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(src.length).fill(null);
  if (src.length < period + 1) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = src[i] - src[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < src.length; i++) {
    const d = src[i] - src[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function momentumArr(src: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(src.length).fill(null);
  for (let i = period; i < src.length; i++) out[i] = src[i] - src[i - period];
  return out;
}

function stddevArr(src: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(src.length).fill(null);
  for (let i = period - 1; i < src.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += src[j];
    const mean = sum / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (src[j] - mean) ** 2;
    out[i] = Math.sqrt(sq / period);
  }
  return out;
}

/** Evaluates one CalcSpec against candles → PointData[] (nulls skipped). */
export function computeCalc(candles: OHLC[], calc: CalcSpec): PointData[] {
  const src = extractSource(candles, calc.source);
  const period = Math.max(1, Math.round(calc.period || 1));
  let values: (number | null)[];
  switch (calc.transform) {
    case "sma": values = smaArr(src, period); break;
    case "ema": values = emaArr(src, period); break;
    case "wma": values = wmaArr(src, period); break;
    case "rsi": values = rsiArr(src, period); break;
    case "momentum": values = momentumArr(src, period); break;
    case "stddev": values = stddevArr(src, period); break;
    case "raw":
    default: values = src; break;
  }
  const out: PointData[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) out.push({ time: candles[i].time, value: v });
  }
  return out;
}

// ── Built-in indicator registry ─────────────────────────────────
// Each entry knows how to produce its SeriesDefinitions and compute
// its data from a candle array. The terminal toggles these on/off via
// the Indicators panel (with search) in BOTH demo and server modes.

export interface IndicatorSpec {
  id: string;
  label: string;
  group: "Overlay" | "Oscillator" | "Volatility" | "Volume";
  search: string;
  makeDefs: () => SeriesDefinition[];
  compute: (candles: OHLC[]) => Record<string, PointData[]>;
}

const mainOverlay = (key: string, label: string, color: string, extra?: Partial<SeriesDefinition>): SeriesDefinition => ({
  key, label, pane: "main", paneId: key,
  type: "line", color, lineWidth: 1, lineStyle: 0,
  subPaneHeight: 150, scaleMargins: { top: 0.08, bottom: 0.08 }, digits: 2, visible: true,
  ...extra,
});

const subLine = (key: string, label: string, paneId: string, color: string, extra?: Partial<SeriesDefinition>): SeriesDefinition => ({
  key, label, pane: "sub", paneId,
  type: "line", color, lineWidth: 1, lineStyle: 0,
  subPaneHeight: 120, scaleMargins: { top: 0.1, bottom: 0.1 }, digits: 2, visible: true,
  ...extra,
});

export const INDICATOR_REGISTRY: IndicatorSpec[] = [
  {
    id: "sma", label: "SMA 20", group: "Overlay", search: "sma simple moving average 20",
    makeDefs: () => [mainOverlay("sma20", "SMA 20", "#26A69A")],
    compute: (c) => ({ sma20: calcSMA(c, 20) }),
  },
  {
    id: "ema", label: "EMA 50", group: "Overlay", search: "ema exponential moving average 50",
    makeDefs: () => [mainOverlay("ema50", "EMA 50", "#FF9800")],
    compute: (c) => ({ ema50: calcEMA(c, 50) }),
  },
  {
    id: "wma", label: "WMA 30", group: "Overlay", search: "wma weighted moving average 30",
    makeDefs: () => [mainOverlay("wma30", "WMA 30", "#E91E63")],
    compute: (c) => ({ wma30: calcWMA(c, 30) }),
  },
  {
    id: "vwap", label: "VWAP", group: "Overlay", search: "vwap volume weighted average price session",
    makeDefs: () => [mainOverlay("vwap", "VWAP", "#FCD535", { lineWidth: 2 })],
    compute: (c) => ({ vwap: calcVWAP(c) }),
  },
  {
    id: "bb", label: "Bollinger Bands (20, 2)", group: "Overlay", search: "bollinger bands bb volatility 20 2",
    makeDefs: () => [
      mainOverlay("bb_upper", "BB Upper", "rgba(100,120,220,0.55)", { paneId: "bb", lineStyle: 2 }),
      mainOverlay("bb_mid", "BB Mid", "rgba(100,120,220,0.55)", { paneId: "bb", lineStyle: 2 }),
      mainOverlay("bb_lower", "BB Lower", "rgba(100,120,220,0.55)", { paneId: "bb", lineStyle: 2 }),
    ],
    compute: (c) => {
      const bb = calcBollinger(c, 20, 2);
      return { bb_upper: bb.upper, bb_mid: bb.mid, bb_lower: bb.lower };
    },
  },
  {
    id: "rsi", label: "RSI (14)", group: "Oscillator", search: "rsi relative strength index 14 oscillator",
    makeDefs: () => [
      subLine("rsi", "RSI (14)", "rsi_pane", "#AB47BC", {
        lineWidth: 2,
        levels: [
          { value: 70, color: "#EF5350", lineStyle: 2, label: "OB" },
          { value: 50, color: "#454560", lineStyle: 2, label: "" },
          { value: 30, color: "#26A69A", lineStyle: 2, label: "OS" },
        ],
      }),
    ],
    compute: (c) => ({ rsi: calcRSI(c, 14) }),
  },
  {
    id: "macd", label: "MACD (12, 26, 9)", group: "Oscillator", search: "macd moving average convergence divergence 12 26 9",
    makeDefs: () => [
      subLine("macd_line", "MACD", "macd_pane", "#42A5F5", { scaleMargins: { top: 0.2, bottom: 0.2 } }),
      subLine("macd_signal", "Signal", "macd_pane", "#FFA726", { scaleMargins: { top: 0.2, bottom: 0.2 } }),
      {
        key: "macd_hist", label: "MACD Hist", pane: "sub", paneId: "macd_pane",
        type: "histogram", color: "#26A69A", colorPos: "#26A69A", colorNeg: "#EF5350",
        lineWidth: 1, lineStyle: 0, subPaneHeight: 120,
        scaleMargins: { top: 0.2, bottom: 0.2 }, digits: 2, visible: true,
      },
    ],
    compute: (c) => {
      const m = calcMACD(c, 12, 26, 9);
      return { macd_line: m.line, macd_signal: m.signal, macd_hist: m.hist };
    },
  },
  {
    id: "stoch", label: "Stochastic (14, 3, 3)", group: "Oscillator", search: "stochastic stoch oscillator k d 14 3",
    makeDefs: () => [
      subLine("stoch_k", "%K", "stoch_pane", "#2962FF", {
        levels: [
          { value: 80, color: "#EF5350", lineStyle: 2, label: "" },
          { value: 20, color: "#26A69A", lineStyle: 2, label: "" },
        ],
      }),
      subLine("stoch_d", "%D", "stoch_pane", "#FF6D00"),
    ],
    compute: (c) => {
      const s = calcStochastic(c, 14, 3, 3);
      return { stoch_k: s.k, stoch_d: s.d };
    },
  },
  {
    id: "atr", label: "ATR (14)", group: "Volatility", search: "atr average true range volatility 14",
    makeDefs: () => [subLine("atr", "ATR (14)", "atr_pane", "#B71C1C", { lineWidth: 2, digits: 4 })],
    compute: (c) => ({ atr: calcATR(c, 14) }),
  },
];

// ── Original demo default set (kept for back-compat) ────────────

export function getDemoDefinitions(): SeriesDefinition[] {
  return ["sma", "ema", "bb", "rsi", "macd"]
    .flatMap((id) => INDICATOR_REGISTRY.find((s) => s.id === id)!.makeDefs());
}

export function computeDemoIndicators(candles: OHLC[]): Record<string, PointData[]> {
  const out: Record<string, PointData[]> = {};
  for (const id of ["sma", "ema", "bb", "rsi", "macd"]) {
    const spec = INDICATOR_REGISTRY.find((s) => s.id === id)!;
    Object.assign(out, spec.compute(candles));
  }
  return out;
}

// ── Demo symbols ────────────────────────────────────────────────

export const DEMO_SYMBOLS: { symbol: string; base: number; digits: number }[] = [
  { symbol: "BTCUSDT", base: 42000, digits: 2 },
  { symbol: "ETHUSDT", base: 2480, digits: 2 },
  { symbol: "SOLUSDT", base: 96.4, digits: 3 },
  { symbol: "BNBUSDT", base: 312, digits: 2 },
  { symbol: "XAUUSD", base: 2384, digits: 2 },
  { symbol: "EURUSD", base: 1.0852, digits: 5 },
];
