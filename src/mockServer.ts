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

// ═══════════════════════════════════════════════════════════════════
// DemoBt — simulated backtest lifecycle for demo mode
// ═══════════════════════════════════════════════════════════════════
// Emits the same bt_* WSMessage types the real server sends so the
// App's handleMessage pipeline is exercised identically.
// ═══════════════════════════════════════════════════════════════════

interface SimPosition {
  id: number;
  symbol: string;
  side: "LONG" | "SHORT";
  entry: number;
  mark: number;
  margin: number;
  leverage: number;
  pnl: number;
  pnl_usdt: number;
  pnl_pct: number;
  stop_price: number | null;
  take_profit: number | null;
  liquidy: number | null;
  open_time: string;
  bars: number;
}

interface SimOrder {
  id: number;
  symbol: string;
  side: "LONG" | "SHORT";
  type: "LIMIT" | "MARKET";
  entry: number;
  usdt: number;
  leverage: number;
  stop_price: number | null;
  take_profit: number | null;
  placed_time: string;
}

interface SimHistory {
  id: number;
  symbol: string;
  side: "LONG" | "SHORT";
  entry: number;
  exit_price: number;
  margin: number;
  leverage: number;
  pnl_usdt: number;
  pnl_pct: number;
  state: string;
  open_time: string;
  close_time: string;
  bars: number;
}

const SIM_SYMBOLS = [
  { sym: "BTCUSDT", price: 42000, vol: 0.012 },
  { sym: "ETHUSDT", price: 2480,  vol: 0.015 },
  { sym: "SOLUSDT", price: 96.4,  vol: 0.020 },
  { sym: "BNBUSDT", price: 312,   vol: 0.014 },
];

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export class DemoBt {
  private onMsg: (msg: WSMessage) => void;
  private intervals: ReturnType<typeof setInterval>[] = [];
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private stopped = false;

  // sim state — available_balance tracks free capital (balance minus open margins)
  private balance = 10000;
  private available_balance = 10000;
  private positions: SimPosition[] = [];
  private orders: SimOrder[] = [];
  private history: SimHistory[] = [];
  private idSeq = 1;
  private equityCurve: number[] = [10000];

  constructor(onMsg: (msg: WSMessage) => void) {
    this.onMsg = onMsg;
  }

  start(): void {
    this.stopped = false;
    // Phase 1: progress bar (0→100 over ~8s)
    this.runProgress();
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.intervals) { try { clearInterval(t); } catch {} }
    for (const t of this.timeouts) { try { clearTimeout(t); } catch {} }
    this.intervals = [];
    this.timeouts = [];
  }

  private send(msg: WSMessage) {
    if (!this.stopped) this.onMsg(msg);
  }

  private after(ms: number, fn: () => void) {
    if (this.stopped) return;
    const t = setTimeout(() => { if (!this.stopped) fn(); }, ms);
    this.timeouts.push(t);
  }

  private every(ms: number, fn: () => void): ReturnType<typeof setInterval> {
    const t = setInterval(() => { if (!this.stopped) fn(); }, ms);
    this.intervals.push(t);
    return t;
  }

  private runProgress(): void {
    const total = 5000;
    let current = 0;
    const step = 80;

    // Signal backtest starting
    this.send({ type: "bt_playback_state", active: true, paused: false, speed: 1 } as any);
    this.emitState();

    const ticker = this.every(step, () => {
      current = Math.min(current + rand(40, 120), total);
      const pct = (current / total) * 100;
      this.send({ type: "bt_progress", current: Math.round(current), total, pct } as any);

      // Occasionally place/fill/close trades during progress
      if (Math.random() < 0.18) this.placePendingOrder();
      if (this.orders.length > 0 && Math.random() < 0.40) this.fillOrder();
      if (this.positions.length > 0 && Math.random() < 0.20) this.closePosition();

      this.tickPrices();
      this.emitState();

      if (current >= total) {
        clearInterval(ticker);
        this.after(300, () => this.finishBacktest());
      }
    });
  }

  private tickPrices(): void {
    for (const p of this.positions) {
      const sym = SIM_SYMBOLS.find(s => s.sym === p.symbol);
      if (!sym) continue;
      p.mark = p.mark * (1 + rand(-sym.vol * 0.15, sym.vol * 0.15));
      const dir = p.side === "LONG" ? 1 : -1;
      const rawPnl = (p.mark - p.entry) * dir * (p.margin * p.leverage / p.entry);
      p.pnl_usdt = rawPnl;
      p.pnl_pct  = (rawPnl / p.margin) * 100;
      p.pnl      = rawPnl;
      p.bars++;
    }
  }

  private placePendingOrder(): void {
    const sym = SIM_SYMBOLS[Math.floor(Math.random() * SIM_SYMBOLS.length)];
    const side: "LONG" | "SHORT" = Math.random() < 0.6 ? "LONG" : "SHORT";
    const type: "LIMIT" | "MARKET" = Math.random() < 0.5 ? "LIMIT" : "MARKET";
    const price = sym.price * rand(0.99, 1.01);
    const margin = [200, 300, 500, 800][Math.floor(Math.random() * 4)];
    const leverage = [5, 10, 15, 20][Math.floor(Math.random() * 4)];

    this.orders.push({
      id: this.idSeq++,
      symbol: sym.sym,
      side,
      type,
      entry: price,
      usdt: margin,
      leverage,
      stop_price: side === "LONG" ? price * rand(0.95, 0.98) : price * rand(1.02, 1.05),
      take_profit: side === "LONG" ? price * rand(1.03, 1.08) : price * rand(0.92, 0.97),
      placed_time: fmtDate(new Date()),
    });

    // cap orders list
    if (this.orders.length > 4) this.orders.shift();
  }

  private fillOrder(): void {
    const ord = this.orders.shift();
    if (!ord) return;
    const sym = SIM_SYMBOLS.find(s => s.sym === ord.symbol);
    if (!sym) return;
    // Don't open if insufficient available balance
    if (ord.usdt > this.available_balance) return;
    const leverage = ord.leverage;
    const margin = Math.min(ord.usdt, this.available_balance);
    const entry = ord.entry * rand(0.999, 1.001);

    // Deduct margin from available balance when position opens
    this.available_balance -= margin;

    this.positions.push({
      id: this.idSeq++,
      symbol: ord.symbol,
      side: ord.side,
      entry,
      mark: entry,
      margin,
      leverage,
      pnl: 0,
      pnl_usdt: 0,
      pnl_pct: 0,
      stop_price: ord.stop_price,
      take_profit: ord.take_profit,
      liquidy: ord.side === "LONG" ? entry * (1 - 1 / leverage * 0.9) : entry * (1 + 1 / leverage * 0.9),
      open_time: fmtDate(new Date()),
      bars: 1,
    });

    if (this.positions.length > 3) this.closePosition();
  }

  private closePosition(forced?: SimPosition): void {
    const pos = forced ?? this.positions.shift();
    if (!pos) return;
    const idx = forced ? this.positions.indexOf(forced) : -1;
    if (idx !== -1) this.positions.splice(idx, 1);

    const pnl = pos.pnl_usdt;
    // Restore margin + realized PnL to both available and total balance
    this.available_balance += pos.margin + pnl;
    this.balance += pnl;
    this.equityCurve.push(this.balance);

    const state = pnl > 0
      ? (Math.random() < 0.7 ? "TP" : "TRIGGERED")
      : (Math.random() < 0.5 ? "STOPPED" : "SL");

    this.history.unshift({
      id: this.idSeq++,
      symbol: pos.symbol,
      side: pos.side,
      entry: pos.entry,
      exit_price: pos.mark,
      margin: pos.margin,
      leverage: pos.leverage,
      pnl_usdt: pnl,
      pnl_pct: pos.pnl_pct,
      state,
      open_time: pos.open_time,
      close_time: fmtDate(new Date()),
      bars: pos.bars,
    });

    if (this.history.length > 20) this.history.pop();
  }

  private emitState(): void {
    const unrealized = this.positions.reduce((s, p) => s + p.pnl_usdt, 0);
    const marginUsed = this.positions.reduce((s, p) => s + p.margin, 0);
    this.send({
      type: "bt_state",
      balance: this.available_balance,
      margin_used: marginUsed,
      unrealized_pnl: unrealized,
      equity: this.balance + unrealized,
      positions: this.positions.map(p => ({ ...p })),
      orders: this.orders.map(o => ({ ...o })),
      trade_history: this.history.map(h => ({ ...h })),
    } as any);
  }

  private finishBacktest(): void {
    // Close all open positions and cancel pending orders
    for (const p of [...this.positions]) this.closePosition(p);
    this.positions = [];
    // Cancel pending orders — return reserved margin
    this.orders = [];
    // available_balance should now equal balance (all positions closed)
    this.available_balance = this.balance;
    this.emitState();

    // Emit final progress
    this.send({ type: "bt_progress", current: 5000, total: 5000, pct: 100 } as any);

    // Build result
    const wins  = this.history.filter(h => h.pnl_usdt > 0);
    const losses = this.history.filter(h => h.pnl_usdt <= 0);
    const grossProfit = wins.reduce((s, h) => s + h.pnl_usdt, 0);
    const grossLoss   = Math.abs(losses.reduce((s, h) => s + h.pnl_usdt, 0));
    const totalTrades = this.history.length;
    const winRate = totalTrades > 0 ? wins.length / totalTrades : 0;

    // Generate a smooth equity curve (200 points) ending at final balance
    const curve = this.buildEquityCurve();

    this.send({
      type: "bt_result",
      initial_balance: 10000,
      final_balance: this.balance,
      return_pct: ((this.balance - 10000) / 10000) * 100,
      total_trades: totalTrades,
      winning_trades: wins.length,
      losing_trades: losses.length,
      win_rate: winRate,
      profit_factor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0,
      risk_reward: losses.length > 0 && wins.length > 0
        ? (grossProfit / wins.length) / (grossLoss / losses.length) : 0,
      total_pnl_usdt: this.balance - 10000,
      gross_profit: grossProfit,
      gross_loss: grossLoss,
      largest_win: wins.length > 0 ? Math.max(...wins.map(h => h.pnl_usdt)) : 0,
      largest_loss: losses.length > 0 ? Math.min(...losses.map(h => h.pnl_usdt)) : 0,
      avg_win: wins.length > 0 ? grossProfit / wins.length : 0,
      avg_loss: losses.length > 0 ? grossLoss / losses.length : 0,
      max_drawdown_usdt: this.computeMaxDrawdown(curve),
      max_drawdown_pct:  this.computeMaxDrawdown(curve) / 10000 * 100,
      equity_curve: curve,
    } as any);

    // Signal playback ended (keeps result visible)
    this.send({ type: "bt_playback_state", active: false } as any);
  }

  private buildEquityCurve(): number[] {
    const raw = [...this.equityCurve];
    if (raw.length < 2) return [10000, this.balance];
    // Resample to ~120 points for a smooth chart
    const N = 120;
    const out: number[] = [];
    for (let i = 0; i < N; i++) {
      const idx = (i / (N - 1)) * (raw.length - 1);
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      const t = idx - lo;
      out.push(raw[lo] + (raw[hi] - raw[lo]) * t);
    }
    return out;
  }

  private computeMaxDrawdown(curve: number[]): number {
    let peak = -Infinity, maxDD = 0;
    for (const v of curve) {
      if (v > peak) peak = v;
      const dd = peak - v;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }
}
