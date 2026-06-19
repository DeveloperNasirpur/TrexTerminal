// ═══════════════════════════════════════════════════════════════════
// mockServer.ts — the simulated trading-data SERVER
// ═══════════════════════════════════════════════════════════════════
// DemoFeed plays the exact role a real backend would: it emits WSMessage
// objects into the very same handleMessage pipeline the WebSocket client
// feeds. Switching between "demo" and "server" modes simply swaps which
// producer is plugged into that pipe — the terminal core is identical
// either way and is unaware of how the data was produced.
//
// This file is the ONLY place in the demo path that "computes" data, and
// it does so AS A SERVER WOULD, not as the terminal. The terminal core
// must never import from here except at the App's data-source wiring.
// ═══════════════════════════════════════════════════════════════════

import type {
  OHLC,
  PointData,
  SeriesDefinition,
  WSMessage,
} from "./types";
import { timeframeToSeconds } from "./types";
import {
  generateDemoCandles,
  generateOlderCandles,
  generateNextCandle,
  updateLiveCandle,
  INDICATOR_REGISTRY,
  computeCalc,
  DEMO_SYMBOLS,
  rand,
  type IndicatorSpec,
} from "./marketData";


export interface DemoFeedConfig {
  symbol: string;
  timeframe: string;
  indicatorIds: string[];
  /** Indicator-Builder definitions to evaluate client-side. */
  customDefs: SeriesDefinition[];
}

export class DemoFeed {
  private onMsg: (msg: WSMessage) => void;
  private candles: OHLC[] = [];
  private intervalSec = 60;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private closeTimer: ReturnType<typeof setInterval> | null = null;
  private epoch = 0;
  private cfg: DemoFeedConfig;
  private digits = 2;
  private historyInFlight = false;

  constructor(onMsg: (msg: WSMessage) => void) {
    this.onMsg = onMsg;
    this.cfg = { symbol: "BTCUSDT", timeframe: "1m", indicatorIds: ["sma", "ema", "bb", "rsi", "macd"], customDefs: [] };
  }

  /** (Re)start the simulation and emit a full snapshot. */
  start(cfg: Partial<DemoFeedConfig> = {}): void {
    this.stop();
    this.cfg = { ...this.cfg, ...cfg };
    const myEpoch = ++this.epoch;

    const sym = DEMO_SYMBOLS.find((s) => s.symbol === this.cfg.symbol) ?? DEMO_SYMBOLS[0];
    this.digits = sym.digits;
    this.intervalSec = timeframeToSeconds(this.cfg.timeframe);
    this.candles = generateDemoCandles(600, sym.base * rand(0.97, 1.03), this.intervalSec);

    this.onMsg({
      type: "snapshot",
      symbol: this.cfg.symbol,
      timeframe: this.cfg.timeframe,
      digits: this.digits,
      data: this.candles,
      definitions: this.activeDefs(),
      points: this.computeAll(),
    });

    // Live tick — mutates the in-progress candle 4×/second.
    this.tickTimer = setInterval(() => {
      if (myEpoch !== this.epoch || this.candles.length === 0) return;
      const last = updateLiveCandle(this.candles[this.candles.length - 1]);
      this.candles[this.candles.length - 1] = last;
      this.onMsg({ type: "bar", bar: last });
    }, 250);

    // Bar close — accelerated wall clock so big TFs stay lively.
    const closeEvery = Math.max(1200, Math.min(this.intervalSec * 1000, 4000));
    this.closeTimer = setInterval(() => {
      if (myEpoch !== this.epoch || this.candles.length === 0) return;
      const next = generateNextCandle(this.candles[this.candles.length - 1], this.intervalSec);
      this.candles.push(next);
      if (this.candles.length > 7000) this.candles.splice(0, this.candles.length - 7000);
      this.onMsg({ type: "bar", bar: next });
      this.emitIndicatorTails();
    }, closeEvery);
  }

  stop(): void {
    this.epoch++;
    this.historyInFlight = false;
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.closeTimer) { clearInterval(this.closeTimer); this.closeTimer = null; }
  }

  setIndicators(ids: string[], customDefs: SeriesDefinition[]): void {
    this.cfg.indicatorIds = ids;
    this.cfg.customDefs = customDefs;
    this.onMsg({ type: "definitions", definitions: this.activeDefs() });
    this.onMsg({ type: "indicators", points: this.computeAll() });
  }

  /** Serve a history page (called when the cache hits its left edge). */
  requestHistory(beforeTime: number, count: number): void {
    // Ignore overlapping history requests — the client already guards
    // with historyPending, but a mode/symbol switch could still race.
    if (this.historyInFlight) return;
    this.historyInFlight = true;
    const myEpoch = this.epoch;
    // Simulate a tiny network delay so the UX matches server mode.
    setTimeout(() => {
      if (myEpoch !== this.epoch) { this.historyInFlight = false; return; }
      const anchor = this.candles[0]?.open ?? 1000;
      const older = generateOlderCandles(beforeTime, count, anchor, this.intervalSec);
      this.candles = [...older, ...this.candles];
      // Emit only the history candles. The client re-anchors every
      // indicator from the engine's own (now longer) candle array, so a
      // second "indicators" message here would be redundant and could
      // race the realign with a stale single-point tail.
      this.onMsg({ type: "history", data: older });
      this.historyInFlight = false;
    }, 120);
  }

  private activeDefs(): SeriesDefinition[] {
    const builtIn = this.cfg.indicatorIds
      .map((id) => INDICATOR_REGISTRY.find((s) => s.id === id))
      .filter((s): s is IndicatorSpec => !!s)
      .flatMap((s) => s.makeDefs());
    return [...builtIn, ...this.cfg.customDefs];
  }

  private computeAll(): Record<string, PointData[]> {
    const out: Record<string, PointData[]> = {};
    for (const id of this.cfg.indicatorIds) {
      const spec = INDICATOR_REGISTRY.find((s) => s.id === id);
      if (spec) Object.assign(out, spec.compute(this.candles));
    }
    for (const def of this.cfg.customDefs) {
      if (def.meta?.calc) out[def.key] = computeCalc(this.candles, def.meta.calc);
    }
    return out;
  }

  /** After a bar closes, push just the freshest point of every series. */
  private emitIndicatorTails(): void {
    // Don't interleave a tail update between a history prepend and its
    // full recompute — that ordering is what desynced the series.
    if (this.historyInFlight) return;
    const all = this.computeAll();
    const tails: Record<string, PointData[]> = {};
    for (const [key, pts] of Object.entries(all)) {
      if (pts.length > 0) tails[key] = [pts[pts.length - 1]];
    }
    this.onMsg({ type: "indicators", points: tails });
  }
}
