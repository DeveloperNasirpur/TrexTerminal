// ═══════════════════════════════════════════════════════════════════
// Trex Chart Engine
// ═══════════════════════════════════════════════════════════════════
// A complete TradingView-style charting engine built on top of
// lightweight-charts v5.  Responsibilities:
//
//   1. Chart + series lifecycle (candles, volume, indicator series,
//      multi-pane management, chart-type switching, Heikin Ashi).
//   2. High-performance candle cache (up to ~7000 bars) with lazy
//      history loading: when the user scrolls near the left edge we
//      raise `onNeedHistory` exactly once and merge the response with
//      `prependHistory()` while preserving the visual viewport.
//   3. A full vector drawing system rendered on a DPR-aware <canvas>
//      overlay: trendline, ray, extended, horizontal, vertical,
//      polyline, fibonacci, rectangle, arrow, text, measure and
//      long/short positions — with hit-testing, dragging, magnet
//      snapping, selection handles, lock/hide and per-pane clipping.
//   4. Interaction state machine (idle / placing / dragging /
//      rectZoom) wired through capture-phase pointer events so the
//      underlying chart never fights with drawing interactions.
//   5. Imperative callbacks (crosshair legend, selection box, pane
//      layout, commits, hints…) so React stays OUT of the 60 fps
//      path — the app only re-renders for actual UI chrome changes.
//
// Everything mutable lives inside this class; React holds it in a ref.
// ═══════════════════════════════════════════════════════════════════

import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  BaselineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type MouseEventParams,
} from "lightweight-charts";

import type {
  OHLC,
  PointData,
  SeriesDefinition,
  Drawing,
  DrawingPoint,
  DrawingStyle,
  DrawingTool,
  ChartSettings,
  CandleStyle,
  ChartType,
  FibLevel,
  PositionData,
} from "./types";
import { DEFAULT_DRAWING_STYLE, DEFAULT_FIB_LEVELS } from "./types";

/* ─────────────────────────── helper types ─────────────────────────── */

// lightweight-charts uses branded nominal types (Logical, Coordinate…).
// We funnel the small number of unavoidable casts through these helpers
// so the rest of the engine stays strictly typed.
type AnySeries = ISeriesApi<any>;
const asTime = (n: number): Time => n as unknown as Time;
const num = (t: Time): number => t as unknown as number;

/** Crosshair legend payload pushed to the app on every pointer move. */
export interface CrosshairPayload {
  bar: OHLC | null;            // displayed bar under the cursor (or last bar)
  prevClose: number | null;    // close of the previous displayed bar
  changeAbs: number;
  changePct: number;
  volume: number | null;
  hovering: boolean;           // false ⇒ values describe the latest bar
  indicatorValues: Record<string, number | null>; // def.key → value
}

/** Geometry of the currently selected drawing (container-relative px). */
export interface SelectionBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SelectionMeta {
  id: string;
  tool: DrawingTool;
  locked: boolean;
  visible: boolean;
  style: DrawingStyle;
  text?: string;
  fibLevels?: FibLevel[];
  positionData?: PositionData;
}

export type CommitKind = "upsert" | "delete" | "clear" | "set";
export interface DrawingsCommit {
  kind: CommitKind;
  drawing?: Drawing;     // for upsert
  drawingId?: string;    // for delete
  /** origin of the change — remote ops must not echo back to the server */
  source: "local" | "remote" | "restore";
}

export interface PaneLayoutEntry {
  paneId: string;
  top: number;
  height: number;
}

export interface EngineCallbacks {
  onCrosshair: (p: CrosshairPayload) => void;
  onSelectionChange: (meta: SelectionMeta | null) => void;
  onSelectionBox: (box: SelectionBox | null) => void;
  onDrawingsCommit: (e: DrawingsCommit) => void;
  onNeedHistory: (beforeTime: number, count: number, fromTime?: number) => void;
  onPaneLayout: (layout: PaneLayoutEntry[]) => void;
  onRealtimeGapChange: (behind: boolean) => void;
  onContextMenu: (x: number, y: number, drawingId: string | null) => void;
  onDblClickEmpty: () => void;
  onEditDrawing: (id: string) => void;
  onHint: (hint: string) => void;
  onToolDone: () => void; // placement finished → app resets active tool
}

/* what part of a drawing the pointer grabbed */
type HitPart =
  | { kind: "point"; index: number }
  | { kind: "body" }
  | { kind: "entry" }
  | { kind: "sl" }
  | { kind: "tp" };

interface HitResult {
  id: string;
  part: HitPart;
}

/* interaction state machine */
type InteractionState =
  | { mode: "idle" }
  | { mode: "placing"; tool: DrawingTool; points: DrawingPoint[]; paneId: string }
  | {
      mode: "dragging";
      id: string;
      part: HitPart;
      startLogical: number;
      startPrice: number;
      origPoints: DrawingPoint[];
      origLogicals: number[];
      origPosition?: PositionData;
      moved: boolean;
    }
  | { mode: "rectZoom"; x0: number; y0: number; x1: number; y1: number };

interface IndicatorEntry {
  points: PointData[];
  lastTime: number;
  def: SeriesDefinition;
  series: AnySeries;
  lines: IPriceLine[];
}

interface PaneInfo {
  paneId: string;
  index: number;
  top: number;     // container-relative px
  height: number;
  refSeries: AnySeries | null; // used for price⇄coordinate in this pane
}

const HIT_TOLERANCE = 6;   // px distance for line hit
const HANDLE_RADIUS = 8;   // px distance for grabbing a point handle
const MAGNET_RANGE = 18;   // px — snap radius for OHLC magnet
const HISTORY_TRIGGER = 500; // bars from the left edge that trigger lazy load
const HISTORY_CHUNK = 5000;
const MAX_CACHE = 12000;   // hard cap of in-memory candles
const TRIM_TO = 10000;     // trim down to this when cap exceeded

const genId = () =>
  `dw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/* ───────────────────────────── the engine ─────────────────────────── */

export class ChartEngine {
  private container: HTMLElement;
  private chart: IChartApi;
  private overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: EngineCallbacks;

  /* data */
  private candles: OHLC[] = [];          // raw (authoritative) candles
  private displayed: OHLC[] = [];        // candles after chart-type transform
  private timeIndex = new Map<number, number>(); // unix → array index
  private intervalSec = 60;
  private digits = 2;
  private noMoreHistory = false;
  private historyPending = false;
  private viewGuardToken = 0;
  private historyTimeout: ReturnType<typeof setTimeout> | null = null;

  /* series */
  private chartType: ChartType = "candles";
  private mainSeries: AnySeries;
  private volumeSeries: AnySeries | null = null;
  private indicators = new Map<string, IndicatorEntry>();
  private subPaneOrder: string[] = []; // paneId order → pane index = i + 1

  /* settings */
  private settings: ChartSettings;

  /* backtest overlay */
  private btPriceLines: IPriceLine[] = [];
  private btMarkersPlugin: ISeriesMarkersPluginApi<Time> | null = null;
  private btMarkersCache: SeriesMarker<Time>[] = [];
  private btPositionsData: Array<{
    entry: number; side: "LONG" | "SHORT"; symbol: string;
    take_profit: number | null; stop_price: number | null; liquidy: number | null;
  }> = [];

  /* drawings */
  private drawings: Drawing[] = [];
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private tool: DrawingTool = "cursor";
  private magnet = false;
  private state: InteractionState = { mode: "idle" };
  private hoverPos: { x: number; y: number } | null = null;
  private lastSnap: { x: number; y: number } | null = null; // magnet feedback
  private measure: { p0: DrawingPoint; p1: DrawingPoint | null; paneId: string } | null = null;

  /* render loop */
  private raf = 0;
  private dirty = true;
  private disposed = false;
  /** cached overlay CSS-px size so the redraw hot path avoids reflow */
  private cssW = 0;
  private cssH = 0;
  /** set by the ResizeObserver; triggers a one-off canvas re-measure */
  private overlayDirty = true;
  private resizeObserver: ResizeObserver;
  /** debounce timer for re-applying pane stretch after container resize */
  private stretchDebounce: ReturnType<typeof setTimeout> | null = null;
  private paneLayoutJson = "";
  private behindRealtime = false;
  private lastSelectionBoxJson = "";

  /* bound handlers (kept for clean removeEventListener) */
  private hPointerDown = (e: PointerEvent) => this.onPointerDown(e);
  private hPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private hPointerUp = (e: PointerEvent) => this.onPointerUp(e);
  private hDblClick = (e: MouseEvent) => this.onDblClick(e);
  private hContextMenu = (e: MouseEvent) => this.onContextMenuEvt(e);
  private hCrosshair = (p: MouseEventParams) => this.onCrosshairMove(p);
  private hRange = () => this.onVisibleRangeChange();

  constructor(container: HTMLElement, settings: ChartSettings, callbacks: EngineCallbacks) {
    this.container = container;
    this.settings = { ...settings };
    this.cb = callbacks;

    /* ── chart ───────────────────────────────────────────────────── */
    this.chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.VerticalGradient, topColor: this.bgTop(settings.backgroundColor), bottomColor: settings.backgroundColor },
        textColor: "#8A8FA8",
        fontFamily: "'Inter', -apple-system, sans-serif",
        fontSize: 11,
        attributionLogo: false,
        panes: {
          enableResize: true,
          separatorColor: "rgba(255,255,255,0.06)",
          separatorHoverColor: "rgba(41, 98, 255, 0.3)",
        },
      },
      grid: {
        vertLines: { color: settings.gridColor, visible: settings.showGrid },
        horzLines: { color: settings.gridColor, visible: settings.showGrid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(255,255,255,0.18)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1E2640",
          visible: settings.showCrosshair,
          labelVisible: settings.showCrosshair,
        },
        horzLine: {
          color: "rgba(255,255,255,0.18)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1E2640",
          visible: settings.showCrosshair,
          labelVisible: settings.showCrosshair,
        },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        scaleMargins: { top: 0.07, bottom: 0.25 },
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 12,
        minBarSpacing: 1,
        shiftVisibleRangeOnNewBar: true,
        rightBarStaysOnScroll: true,
      },
      handleScroll: true,
      handleScale: true,
      // Momentum glide on release — matches TradingView's smooth feel.
      // (Disabled automatically while a drawing tool drag is active via
      //  setInteractive(), so it never fights tool placement.)
      kineticScroll: { mouse: true, touch: true },
    });

    /* main price series (candlestick by default) */
    this.mainSeries = this.createMainSeries("candles");

    /* volume overlay (bottom 18 % of the main pane, own price scale) */
    this.createVolumeSeries();

    /* ── overlay canvas for drawings ─────────────────────────────── */
    this.overlay = document.createElement("canvas");
    Object.assign(this.overlay.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "3",
    } as CSSStyleDeclaration);
    container.style.position = "relative";
    container.appendChild(this.overlay);
    const ctx = this.overlay.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;

    /* ── events ──────────────────────────────────────────────────── */
    container.addEventListener("pointerdown", this.hPointerDown, true);
    container.addEventListener("pointermove", this.hPointerMove);
    container.addEventListener("pointerup", this.hPointerUp);
    container.addEventListener("dblclick", this.hDblClick, true);
    container.addEventListener("contextmenu", this.hContextMenu, true);
    this.chart.subscribeCrosshairMove(this.hCrosshair);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.hRange);

    this.resizeObserver = new ResizeObserver(() => {
      this.overlayDirty = true;   // next frame re-measures + resizes
      this.requestRedraw();
      // Re-apply pane stretch after any container resize (layout change,
      // fullscreen, window resize). Debounced so it fires once after the
      // resize animation settles rather than on every intermediate frame.
      if (this.stretchDebounce !== null) clearTimeout(this.stretchDebounce);
      this.stretchDebounce = setTimeout(() => {
        this.stretchDebounce = null;
        this.refreshPaneLayout();
      }, 120);
    });
    this.resizeObserver.observe(container);
    this.syncOverlaySize();       // prime cssW/cssH for the first frame

    /* persistent rAF loop with dirty flag — redraw only when needed */
    const loop = () => {
      if (this.disposed) return;
      if (this.dirty) {
        this.dirty = false;
        this.redraw();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ════════════════════════ series creation ═══════════════════════ */

  /** Lighten the background slightly for the gradient top edge. */
  private bgTop(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const lift = 18;
    return `rgb(${Math.min(255, r + lift)},${Math.min(255, g + lift)},${Math.min(255, b + lift)})`;
  }

  private candleOpts(up: string, down: string, style: CandleStyle) {
    const wickUp = this.hexA(up, 0.65);
    const wickDown = this.hexA(down, 0.65);
    switch (style) {
      case "hollow":
        return { upColor: "rgba(0,0,0,0)", downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: wickUp, wickDownColor: wickDown, borderVisible: true };
      case "hollow-all":
        return { upColor: "rgba(0,0,0,0)", downColor: "rgba(0,0,0,0)", borderUpColor: up, borderDownColor: down, wickUpColor: wickUp, wickDownColor: wickDown, borderVisible: true };
      case "solid":
      default:
        return { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: wickUp, wickDownColor: wickDown, borderVisible: false };
    }
  }

  private createMainSeries(type: ChartType): AnySeries {
    const s = this.settings;
    const up = s.candleUpColor;
    const down = s.candleDownColor;
    const style: CandleStyle = s.candleStyle ?? "solid";
    let series: AnySeries;
    switch (type) {
      case "bars":
        series = this.chart.addSeries(BarSeries, {
          upColor: up, downColor: down, thinBars: false,
        }, 0);
        break;
      case "line":
        series = this.chart.addSeries(LineSeries, {
          color: "#2962FF", lineWidth: 2,
          priceLineVisible: true, lastValueVisible: true,
        }, 0);
        break;
      case "area":
        series = this.chart.addSeries(AreaSeries, {
          lineColor: "#2962FF", lineWidth: 2,
          topColor: "rgba(41, 98, 255, 0.35)",
          bottomColor: "rgba(41, 98, 255, 0.02)",
        }, 0);
        break;
      case "heikin":
      case "candles":
      default:
        series = this.chart.addSeries(CandlestickSeries, this.candleOpts(up, down, style), 0);
        break;
    }
    series.applyOptions({
      priceFormat: { type: "price", precision: this.digits, minMove: Math.pow(10, -this.digits) },
    });
    return series;
  }

  private createVolumeSeries(): void {
    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
      visible: this.settings.showVolume,
    }, 0);
    this.chart.priceScale("vol", 0).applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
  }

  /* ═══════════════════════ data: candles ══════════════════════════ */

  /** Replace the entire candle cache (snapshot). */
  private invalidateViewGuard(): void { this.viewGuardToken++; }

  setCandles(raw: OHLC[]): void {
    // sort + dedupe defensively — server snapshots are not always clean
    const sorted = [...raw].sort((a, b) => num(a.time) - num(b.time));
    const out: OHLC[] = [];
    for (const c of sorted) {
      if (out.length && num(out[out.length - 1].time) === num(c.time)) out[out.length - 1] = c;
      else out.push(c);
    }
    this.candles = out;
    this.noMoreHistory = false;
    this.historyPending = false;
    this.invalidateViewGuard();
    this.rebuildIndex();
    this.applyAllData();
    this.requestRedraw();
  }

  /**
   * Merge an older history chunk in front of the cache.
   * The current viewport is preserved by shifting the logical range by
   * exactly the number of bars that were prepended.
   */
  prependHistory(older: OHLC[]): void {
    this.clearHistoryPending();
    if (!older.length) { this.noMoreHistory = true; return; }
    const firstTime = this.candles.length ? num(this.candles[0].time) : Infinity;
    const add = older
      .filter((c) => num(c.time) < firstTime)
      .sort((a, b) => num(a.time) - num(b.time));
    if (!add.length) { this.noMoreHistory = true; return; }

    const ts = this.chart.timeScale();

    // ── Preserve the viewport across a prepend ──────────────────────
    // The reliable invariants are (1) the current bar-spacing (zoom)
    // and (2) which logical index sits at the RIGHT edge. setData()
    // re-bases indices by +addedN, so we recompute the right edge and
    // re-seat it, keeping bar-spacing fixed. Earlier attempts rebuilt
    // the whole range from fractional from/to, which drifted and
    // eventually compressed every bar into a single column.
    const beforeRange = ts.getVisibleLogicalRange();
    const beforeSpacing = ts.options().barSpacing;
    const addedN = add.length;

    this.candles = [...add, ...this.candles];
    this.rebuildIndex();

    const prevAuto = this.suspendAutoScroll();
    this.applyAllData();

    // Re-pin bar-spacing first (setData can nudge it), then re-seat the
    // identical window shifted up by the number of prepended bars.
    ts.applyOptions({ barSpacing: beforeSpacing });
    if (beforeRange) {
      const span = beforeRange.to - beforeRange.from; // bars on screen
      const newTo = beforeRange.to + addedN;          // same right-edge bar
      const target = { from: newTo - span, to: newTo };
      ts.setVisibleLogicalRange(target);

      // ── view guard ────────────────────────────────────────────────
      // For ~8 frames, clamp any drift away from the restored window.
      // This neutralises queued kinetic/animation tasks that captured
      // PRE-prepend logical coordinates and would otherwise yank the
      // view far past the data the instant we hand control back.
      const tok = ++this.viewGuardToken;
      const enforce = (left: number) => {
        if (tok !== this.viewGuardToken || this.disposed) return;
        const r = ts.getVisibleLogicalRange();
        if (!r || Math.abs(r.from - target.from) > 0.5 || Math.abs(r.to - target.to) > 0.5) {
          ts.applyOptions({ barSpacing: beforeSpacing });
          ts.setVisibleLogicalRange(target);
        }
        if (left > 0) requestAnimationFrame(() => enforce(left - 1));
      };
      requestAnimationFrame(() => enforce(8));
    }
    this.restoreAutoScroll(prevAuto);
    this.requestRedraw();
  }

  /** Freeze autoscroll/shift; returns prior option values to restore. */
  private suspendAutoScroll(): { shift: boolean } {
    const opts = (this.chart.timeScale().options() as unknown) as {
      shiftVisibleRangeOnNewBar: boolean;
    };
    const prev = { shift: opts.shiftVisibleRangeOnNewBar };
    this.chart.timeScale().applyOptions({ shiftVisibleRangeOnNewBar: false });
    return prev;
  }
  private restoreAutoScroll(prev: { shift: boolean }): void {
    this.chart.timeScale().applyOptions({ shiftVisibleRangeOnNewBar: prev.shift });
  }

  /** True when there is at least one bar cached. */
  hasData(): boolean { return this.candles.length > 0; }

  /**
   * Read-only access to the raw candle cache. The app uses this to
   * evaluate client-side indicators (registry / Indicator Builder) in
   * server mode where the server only streams its own series.
   */
  getCandles(): OHLC[] { return this.candles; }

  /** Number of cached bars (status bar metric). */
  barCount(): number { return this.candles.length; }

  /**
   * Per-series diagnostics: how many points each indicator holds, the
   * time of its last point, and whether it degenerated into a flat line.
   * Used by e2e tests to assert candle/indicator alignment after a
   * history load, and handy for debugging a desync in the field.
   */
  indicatorDomains(): Record<string, { n: number; last: number; flat: boolean }> {
    const out: Record<string, { n: number; last: number; flat: boolean }> = {};
    for (const [key, entry] of this.indicators) {
      const pts = entry.points;
      const vals = pts.map((p) => p.value);
      const flat = vals.length > 2 && vals.every((v) => v === vals[0]);
      out[key] = {
        n: pts.length,
        last: pts.length ? num(pts[pts.length - 1].time) : 0,
        flat,
      };
    }
    return out;
  }

  /**
   * Apply a realtime bar — either an in-place update of the last bar
   * (same timestamp) or a brand-new bar (next interval). O(1).
   */
  applyBar(bar: OHLC): void {
    const t = num(bar.time);
    const n = this.candles.length;
    if (n && num(this.candles[n - 1].time) === t) {
      this.candles[n - 1] = bar;
      const disp = this.transformLast();
      this.mainSeries.update(disp);
      this.updateVolumeBar(bar);
    } else if (!n || t > num(this.candles[n - 1].time)) {
      this.candles.push(bar);
      this.timeIndex.set(t, this.candles.length - 1);
      const disp = this.transformLast();
      this.mainSeries.update(disp);
      this.updateVolumeBar(bar);
      this.maybeTrimCache();
    } else {
      // out-of-order bar — locate and patch, then resync displayed data
      const idx = this.timeIndex.get(t);
      if (idx !== undefined) {
        this.candles[idx] = bar;
        this.applyAllData();
      }
    }
    this.requestRedraw();
  }

  /**
   * Cache guard: never let memory grow unbounded.  We only trim when the
   * user is near the right edge so we never delete bars they're viewing.
   */
  private maybeTrimCache(): void {
    if (this.candles.length <= MAX_CACHE) return;
    const ts = this.chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    const lastIdx = this.candles.length - 1;
    if (!range || lastIdx - range.to > 200) return; // user is far left — keep
    const trim = this.candles.length - TRIM_TO;
    const spacing = ts.options().barSpacing;

    this.candles = this.candles.slice(trim);
    this.rebuildIndex();
    const prevAuto = this.suspendAutoScroll();
    this.applyAllData();

    // Drop indicator points older than the new first candle so every
    // series stays in lockstep with the trimmed cache (orphan points
    // used to stretch the time scale leftwards past the candles).
    const cutoff = num(this.candles[0].time);
    for (const entry of this.indicators.values()) {
      if (entry.points.length && num(entry.points[0].time) < cutoff) {
        this.applyEntryData(entry, entry.points.filter((p) => num(p.time) >= cutoff));
      }
    }

    ts.applyOptions({ barSpacing: spacing });
    const span = range.to - range.from;
    const newTo = range.to - trim;
    ts.setVisibleLogicalRange({ from: newTo - span, to: newTo });
    this.restoreAutoScroll(prevAuto);
  }

  private rebuildIndex(): void {
    this.timeIndex.clear();
    for (let i = 0; i < this.candles.length; i++) {
      this.timeIndex.set(num(this.candles[i].time), i);
    }
  }

  /* ── chart-type transforms ───────────────────────────────────── */

  /** Recompute `displayed` from raw candles for the active chart type. */
  private transformAll(): void {
    if (this.chartType === "heikin") {
      const out: OHLC[] = [];
      let prevO = 0, prevC = 0;
      for (let i = 0; i < this.candles.length; i++) {
        const c = this.candles[i];
        const haC = (c.open + c.high + c.low + c.close) / 4;
        const haO = i === 0 ? (c.open + c.close) / 2 : (prevO + prevC) / 2;
        out.push({
          time: c.time,
          open: haO,
          high: Math.max(c.high, haO, haC),
          low: Math.min(c.low, haO, haC),
          close: haC,
          volume: c.volume,
        });
        prevO = haO; prevC = haC;
      }
      this.displayed = out;
    } else {
      this.displayed = this.candles;
    }
  }

  /** Transform just the last bar (cheap path for live ticks). */
  private transformLast(): any {
    const i = this.candles.length - 1;
    const c = this.candles[i];
    if (this.chartType === "heikin") {
      // Must ensure the HA array is built before reading prev, otherwise
      // displayed===candles and prev would be a raw bar — producing wrong haO.
      if (this.displayed === this.candles) this.transformAll();
      const prev = this.displayed[i - 1];
      const haC = (c.open + c.high + c.low + c.close) / 4;
      const haO = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
      const ha: OHLC = {
        time: c.time, open: haO,
        high: Math.max(c.high, haO, haC),
        low: Math.min(c.low, haO, haC),
        close: haC, volume: c.volume,
      };
      if (i < this.displayed.length) this.displayed[i] = ha;
      else this.displayed.push(ha);
      return this.toSeriesBar(ha);
    }
    this.displayed = this.candles;
    return this.toSeriesBar(c);
  }

  /** Map a displayed candle into the active series' data shape. */
  private toSeriesBar(c: OHLC): any {
    if (this.chartType === "line" || this.chartType === "area") {
      return { time: c.time, value: c.close };
    }
    return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
  }

  /** Push the full candle + volume arrays into the chart series. */
  private applyAllData(): void {
    this.transformAll();
    this.mainSeries.setData(this.displayed.map((c) => this.toSeriesBar(c)));
    if (this.volumeSeries) {
      const up = this.hexA(this.settings.candleUpColor, 0.28);
      const dn = this.hexA(this.settings.candleDownColor, 0.22);
      this.volumeSeries.setData(
        this.candles.map((c) => ({
          time: c.time,
          value: c.volume ?? 0,
          color: c.close >= c.open ? up : dn,
        }))
      );
    }
  }

  private updateVolumeBar(c: OHLC): void {
    if (!this.volumeSeries) return;
    this.volumeSeries.update({
      time: c.time,
      value: c.volume ?? 0,
      color: c.close >= c.open
        ? this.hexA(this.settings.candleUpColor, 0.28)
        : this.hexA(this.settings.candleDownColor, 0.22),
    });
  }

  /* ════════════════════ public configuration ══════════════════════ */

  setPrecision(digits: number): void {
    this.digits = Math.max(0, Math.min(8, digits));
    this.mainSeries.applyOptions({
      priceFormat: { type: "price", precision: this.digits, minMove: Math.pow(10, -this.digits) },
    });
  }

  getDigits(): number { return this.digits; }

  setTimeframeSeconds(sec: number): void {
    this.intervalSec = Math.max(1, sec);
    this.chart.timeScale().applyOptions({ secondsVisible: sec < 60 });
  }

  setChartType(type: ChartType): void {
    if (type === this.chartType) return;
    // Detach bt markers plugin before the series it's attached to is removed
    if (this.btMarkersPlugin) {
      try { this.btMarkersPlugin.detach(); } catch {}
      this.btMarkersPlugin = null;
    }
    this.btPriceLines = []; // old series is gone; price lines go with it
    this.chart.removeSeries(this.mainSeries as ISeriesApi<any>);
    this.chartType = type;
    this.mainSeries = this.createMainSeries(type);
    // Re-apply price lines on the new series
    if (this.btPositionsData.length) this._applyBtPriceLines();
    // Re-attach markers if any were active
    if (this.btMarkersCache.length) {
      this.btMarkersPlugin = createSeriesMarkers(this.mainSeries);
      this.btMarkersPlugin.setMarkers(this.btMarkersCache);
    }
    this.applyAllData();
    this.requestRedraw();
  }

  getChartType(): ChartType { return this.chartType; }

  setSettings(next: ChartSettings): void {
    this.settings = { ...next };
    this.chart.applyOptions({
      layout: { background: { type: ColorType.VerticalGradient, topColor: this.bgTop(next.backgroundColor), bottomColor: next.backgroundColor } },
      grid: {
        vertLines: { color: next.gridColor, visible: next.showGrid },
        horzLines: { color: next.gridColor, visible: next.showGrid },
      },
      crosshair: {
        vertLine: { visible: next.showCrosshair, labelVisible: next.showCrosshair },
        horzLine: { visible: next.showCrosshair, labelVisible: next.showCrosshair },
      },
    });
    if (this.chartType === "candles" || this.chartType === "heikin") {
      this.mainSeries.applyOptions(this.candleOpts(next.candleUpColor, next.candleDownColor, next.candleStyle ?? "solid"));
    } else if (this.chartType === "bars") {
      this.mainSeries.applyOptions({ upColor: next.candleUpColor, downColor: next.candleDownColor });
    }
    if (this.volumeSeries) {
      this.volumeSeries.applyOptions({ visible: next.showVolume });
      // re-tint cached volume bars
      this.applyAllData();
    }
    this.requestRedraw();
  }

  /* ═══════════════════ indicator definitions ══════════════════════ */

  /**
   * Diff-apply a complete list of series definitions.  Pane bookkeeping:
   * sub-panes are created lazily in definition order; when the last
   * series of a sub-pane disappears the pane itself is removed and the
   * paneId → index map is rebuilt from the live chart state.
   */
  setDefinitions(defs: SeriesDefinition[]): void {
    const incoming = new Map(defs.map((d) => [d.key, d]));

    /* remove series whose key vanished */
    for (const [key, entry] of [...this.indicators]) {
      if (!incoming.has(key)) {
        for (const l of entry.lines) entry.series.removePriceLine(l);
        this.chart.removeSeries(entry.series as ISeriesApi<any>);
        this.indicators.delete(key);
      }
    }

    /* prune empty sub-panes (iterate from the end so indices stay valid) */
    const usedPaneIds = new Set(
      defs.filter((d) => d.pane === "sub").map((d) => d.paneId)
    );
    for (let i = this.subPaneOrder.length - 1; i >= 0; i--) {
      const pid = this.subPaneOrder[i];
      if (!usedPaneIds.has(pid)) {
        const stillHas = [...this.indicators.values()].some(
          (e) => e.def.pane === "sub" && e.def.paneId === pid
        );
        if (!stillHas) {
          const paneIdx = i + 1;
          if (paneIdx < this.chart.panes().length) {
            try { this.chart.removePane(paneIdx); } catch { /* already gone */ }
          }
          this.subPaneOrder.splice(i, 1);
        }
      }
    }

    /* add / update in definition order so sub-pane indices are stable */
    for (const def of defs) {
      const existing = this.indicators.get(def.key);
      if (existing) {
        this.applyDefOptions(existing, def);
        existing.def = def;
        continue;
      }
      let paneIndex = 0;
      if (def.pane === "sub") {
        let i = this.subPaneOrder.indexOf(def.paneId);
        if (i === -1) {
          this.subPaneOrder.push(def.paneId);
          i = this.subPaneOrder.length - 1;
        }
        paneIndex = i + 1;
      }
      const series = this.createIndicatorSeries(def, paneIndex);
      const entry: IndicatorEntry = { def, series, lines: [], points: [], lastTime: 0 };
      this.applyLevels(entry, def);
      this.indicators.set(def.key, entry);
      // Pane sizing is handled holistically by applyPaneStretch() below
      // (stretch factors), so we don't set a fixed height per series here
      // — a fixed height would fight the stretch ratios.
    }
    this.applyPaneStretch(defs);
    this.requestRedraw();
  }

  /**
   * Distribute pane heights by their requested sizes. The main (price)
   * pane stays dominant; each sub-pane gets a stretch factor proportional
   * to the largest `subPaneHeight` requested by a series living in it, so
   * a tall pane (e.g. a 150px volume profile) renders taller than a
   * compact one (e.g. an 80px oscillator) instead of all sub-panes being
   * forced to equal height.
   */
  private applyPaneStretch(defs: SeriesDefinition[]): void {
    // Defer one frame: a pane added this tick hasn't settled its layout
    // yet, so setStretchFactor would apply against a stale pane list.
    requestAnimationFrame(() => {
      if (this.disposed) return;
      const panes = this.chart.panes();
      if (panes.length <= 1) return; // only the main pane — nothing to balance

      // largest requested height per sub-pane id
      const reqByPane = new Map<string, number>();
      for (const d of defs) {
        if (d.pane !== "sub") continue;
        const h = Math.max(60, d.subPaneHeight || 120);
        reqByPane.set(d.paneId, Math.max(reqByPane.get(d.paneId) ?? 0, h));
      }

      // Main pane keeps the lion's share; sub-panes split the rest by ratio.
      const MAIN_STRETCH = 4;
      try {
        panes[0].setStretchFactor(MAIN_STRETCH);
        for (let i = 1; i < panes.length; i++) {
          const pid = this.subPaneOrder[i - 1];
          const reqPx = reqByPane.get(pid) ?? 120;
          // map ~120px → factor 1; taller panes scale up proportionally
          const factor = Math.max(0.5, reqPx / 120);
          panes[i].setStretchFactor(factor);
        }
      } catch {
        /* stretch API unavailable on this build — default heights apply */
      }
    });
  }

  private createIndicatorSeries(def: SeriesDefinition, paneIndex: number): AnySeries {
    const common = {
      priceLineVisible: def.priceLineVisible ?? false,
      lastValueVisible: def.lastValueVisible ?? true,
      visible: def.visible !== false,
      priceFormat: {
        type: "price" as const,
        precision: def.digits ?? 2,
        minMove: Math.pow(10, -(def.digits ?? 2)),
      },
    };
    let s: AnySeries;
    switch (def.type) {
      case "histogram":
        s = this.chart.addSeries(HistogramSeries, { ...common, color: def.color }, paneIndex);
        break;
      case "area":
        s = this.chart.addSeries(AreaSeries, {
          ...common,
          lineColor: def.color,
          lineWidth: (def.lineWidth || 1) as any,
          topColor: def.topColor ?? this.hexA(def.color, 0.3),
          bottomColor: def.bottomColor ?? this.hexA(def.color, 0.02),
        }, paneIndex);
        break;
      case "baseline":
        s = this.chart.addSeries(BaselineSeries, {
          ...common,
          baseValue: { type: "price", price: def.baseValue ?? 0 },
          topLineColor: def.colorPos ?? "#089981",
          bottomLineColor: def.colorNeg ?? "#F23645",
          topFillColor1: this.hexA(def.colorPos ?? "#089981", 0.25),
          topFillColor2: this.hexA(def.colorPos ?? "#089981", 0.03),
          bottomFillColor1: this.hexA(def.colorNeg ?? "#F23645", 0.03),
          bottomFillColor2: this.hexA(def.colorNeg ?? "#F23645", 0.25),
          lineWidth: (def.lineWidth || 1) as any,
        }, paneIndex);
        break;
      case "scatter":
        s = this.chart.addSeries(LineSeries, {
          ...common,
          color: def.color,
          lineVisible: false,
          pointMarkersVisible: true,
          pointMarkersRadius: 2.5,
        }, paneIndex);
        break;
      case "line":
      default:
        s = this.chart.addSeries(LineSeries, {
          ...common,
          color: def.color,
          lineWidth: (def.lineWidth || 1) as any,
          lineStyle: (def.lineStyle ?? 0) as any,
        }, paneIndex);
        break;
    }
    if (def.pane === "sub") {
      // The whole sub-pane shares one price scale, so applying margins
      // once (from the first series placed in the pane) is enough.
      // Re-applying per series just overwrites the same scale; we keep
      // the FIRST series' margins as the pane's setting so a multi-series
      // pane (e.g. MACD) has stable, predictable padding.
      const firstInPane = ![...this.indicators.values()].some(
        (e) => e.def.pane === "sub" && e.def.paneId === def.paneId
      );
      if (firstInPane) {
        s.priceScale().applyOptions({ scaleMargins: def.scaleMargins });
      }
    }
    return s;
  }

  private applyDefOptions(entry: IndicatorEntry, def: SeriesDefinition): void {
    const base: Record<string, unknown> = { visible: def.visible !== false };
    if (def.type === "line" || def.type === "scatter") {
      base.color = def.color;
      base.lineWidth = def.lineWidth || 1;
      base.lineStyle = def.lineStyle ?? 0;
    } else if (def.type === "histogram") {
      base.color = def.color;
    } else if (def.type === "area") {
      base.lineColor = def.color;
      base.lineWidth = def.lineWidth || 1;
    }
    entry.series.applyOptions(base);
    /* refresh levels */
    this.applyLevels(entry, def);
  }

  private applyLevels(entry: IndicatorEntry, def: SeriesDefinition): void {
    for (const l of entry.lines) entry.series.removePriceLine(l);
    entry.lines = [];
    for (const lvl of def.levels ?? []) {
      entry.lines.push(
        entry.series.createPriceLine({
          price: lvl.value,
          color: lvl.color,
          lineWidth: 1,
          lineStyle: lvl.lineStyle as any,
          axisLabelVisible: true,
          title: lvl.label,
        })
      );
    }
  }

  /** Full data replacement for one indicator series. */
  setSeriesData(key: string, points: PointData[]): void {
    const entry = this.indicators.get(key);
    if (!entry) return;
    this.applyEntryData(entry, points);
  }

  /** Shared writer: records bookkeeping + pushes data into the series. */
  private applyEntryData(entry: IndicatorEntry, points: PointData[]): void {
    // Store a COPY, never the caller's array. The live-tick path below
    // does entry.points.push(...), so aliasing the App's points cache
    // would mutate it underneath us — that corruption is what collapsed
    // indicators into a flat line after repeated history loads.
    entry.points = points.slice();
    entry.lastTime = points.length ? num(points[points.length - 1].time) : 0;
    if (entry.def.type === "histogram") {
      // Per-point color wins (server-driven conditional coloring); else
      // fall back to the sign-based pos/neg palette from the definition.
      const pos = entry.def.colorPos ?? entry.def.color;
      const neg = entry.def.colorNeg ?? entry.def.color;
      entry.series.setData(points.map((p) => ({
        time: p.time,
        value: p.value,
        color: p.color ?? (p.value >= 0 ? pos : neg),
      })));
    } else if (entry.def.type === "line" || entry.def.type === "scatter") {
      // Line/scatter accept an optional per-point color too; lightweight-
      // charts colors the segment leading INTO each colored point.
      const hasColors = points.some((p) => p.color);
      entry.series.setData(points.map((p) =>
        hasColors && p.color
          ? { time: p.time, value: p.value, color: p.color }
          : { time: p.time, value: p.value }
      ));
    } else {
      entry.series.setData(points.map((p) => ({ time: p.time, value: p.value })));
    }
  }

  /** Incremental tail update for one indicator series (live path). */
  updateSeriesLast(key: string, point: PointData): void {
    const entry = this.indicators.get(key);
    if (!entry) return;
    const t = num(point.time);
    // Guard: lightweight-charts corrupts a series if update() is called
    // with a timestamp older than its newest point. This happens when a
    // live tick races a just-completed history prepend. Ignore the stale
    // tick — the next full recompute will reconcile it.
    if (entry.lastTime && t < entry.lastTime) return;
    if (entry.points.length && t === entry.lastTime) {
      entry.points[entry.points.length - 1] = point; // in-place patch
    } else if (!entry.points.length || t > entry.lastTime) {
      entry.points.push(point);                      // genuine new bar
    }
    entry.lastTime = Math.max(entry.lastTime, t);
    if (entry.def.type === "histogram") {
      const pos = entry.def.colorPos ?? entry.def.color;
      const neg = entry.def.colorNeg ?? entry.def.color;
      entry.series.update({
        time: point.time,
        value: point.value,
        color: point.color ?? (point.value >= 0 ? pos : neg),
      });
    } else if ((entry.def.type === "line" || entry.def.type === "scatter") && point.color) {
      entry.series.update({ time: point.time, value: point.value, color: point.color });
    } else {
      entry.series.update({ time: point.time, value: point.value });
    }
  }

  /* ═════════════════════════ view controls ════════════════════════ */

  fitContent(): void { this.chart.timeScale().fitContent(); this.requestRedraw(); }

  /** Re-apply pane stretch factors — call after the chart container resizes (e.g. layout/fullscreen change). */
  refreshPaneLayout(): void {
    const defs = [...this.indicators.values()].map((e) => e.def);
    if (defs.filter(d => d.pane === "sub").length === 0) return;

    const reqByPane = new Map<string, number>();
    for (const d of defs) {
      if (d.pane !== "sub") continue;
      const h = Math.max(60, d.subPaneHeight || 120);
      reqByPane.set(d.paneId, Math.max(reqByPane.get(d.paneId) ?? 0, h));
    }
    const MAIN_STRETCH = 4;
    const applyNow = () => {
      if (this.disposed) return;
      const panes = this.chart.panes();
      if (panes.length <= 1) return;
      try {
        panes[0].setStretchFactor(MAIN_STRETCH);
        for (let i = 1; i < panes.length; i++) {
          const pid = this.subPaneOrder[i - 1];
          const reqPx = reqByPane.get(pid) ?? 120;
          panes[i].setStretchFactor(Math.max(0.5, reqPx / 120));
        }
      } catch { /* stretch API unavailable */ }
    };
    // Apply immediately, then again after two more frames to catch any
    // post-resize reset that lightweight-charts may do internally.
    applyNow();
    requestAnimationFrame(() => { applyNow(); requestAnimationFrame(applyNow); });
    this.overlayDirty = true;
    this.requestRedraw();
  }

  scrollToRealTime(): void { this.chart.timeScale().scrollToRealTime(); this.requestRedraw(); }

  resetPriceScale(): void {
    this.chart.priceScale("right", 0).applyOptions({ autoScale: true });
    this.requestRedraw();
  }

  zoomIn(): void { this.zoomBy(0.7); }
  zoomOut(): void { this.zoomBy(1 / 0.7); }

  private zoomBy(factor: number): void {
    const ts = this.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    if (!r) return;
    const center = (r.from + r.to) / 2;
    const half = ((r.to - r.from) / 2) * factor;
    ts.setVisibleLogicalRange({ from: center - half, to: center + half });
    this.requestRedraw();
  }

  /** Zoom to an explicit unix-seconds window (WS `zoomRange`). */
  setZoomRangeTimes(fromSec: number, toSec: number): void {
    const from = this.timeToLogical(fromSec);
    const to = this.timeToLogical(toSec);
    if (from === null || to === null || to <= from) return;
    this.chart.timeScale().setVisibleLogicalRange({ from, to });
    this.requestRedraw();
  }

  /* ═════════════════════ coordinate mapping ═══════════════════════ */
  /*
   * lightweight-charts can only resolve times that exist in the data, so
   * we convert through *fractional logical indices* using the candle
   * array: this lets drawings live between bars and extend into the
   * future or past beyond loaded history.
   */

  private timeToLogical(t: number): number | null {
    const n = this.candles.length;
    if (!n) return null;
    const first = num(this.candles[0].time);
    const last = num(this.candles[n - 1].time);
    if (t <= first) return (t - first) / this.intervalSec;
    if (t >= last) return n - 1 + (t - last) / this.intervalSec;
    const exact = this.timeIndex.get(t);
    if (exact !== undefined) return exact;
    /* binary search for surrounding bars, interpolate fractionally */
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (num(this.candles[mid].time) <= t) lo = mid; else hi = mid;
    }
    const tl = num(this.candles[lo].time);
    const th = num(this.candles[hi].time);
    return lo + (t - tl) / Math.max(1, th - tl);
  }

  private logicalToTime(l: number): number {
    const n = this.candles.length;
    if (!n) return 0;
    if (l <= 0) return num(this.candles[0].time) + l * this.intervalSec;
    if (l >= n - 1) return num(this.candles[n - 1].time) + (l - (n - 1)) * this.intervalSec;
    const lo = Math.floor(l), hi = Math.min(n - 1, lo + 1);
    const tl = num(this.candles[lo].time);
    const th = num(this.candles[hi].time);
    return tl + (l - lo) * (th - tl);
  }

  private timeToX(t: number): number | null {
    const l = this.timeToLogical(t);
    if (l === null) return null;
    const x = this.chart.timeScale().logicalToCoordinate(l as any);
    return x === null ? null : (x as unknown as number);
  }

  private xToTime(x: number): number | null {
    const l = this.chart.timeScale().coordinateToLogical(x);
    if (l === null) return null;
    return this.logicalToTime(l as unknown as number);
  }

  private xToLogical(x: number): number | null {
    const l = this.chart.timeScale().coordinateToLogical(x);
    return l === null ? null : (l as unknown as number);
  }

  /** price → container-relative y, within the given pane. */
  private priceToY(price: number, pane: PaneInfo): number | null {
    const ref = pane.refSeries;
    if (!ref) return null;
    const y = ref.priceToCoordinate(price);
    return y === null ? null : (y as unknown as number) + pane.top;
  }

  /** container-relative y → price, within the given pane. */
  private yToPrice(y: number, pane: PaneInfo): number | null {
    const ref = pane.refSeries;
    if (!ref) return null;
    const p = ref.coordinateToPrice(y - pane.top);
    return p === null ? null : (p as unknown as number);
  }

  /* compute pane geometry (container-relative) + reference series */
  private getPaneInfos(): PaneInfo[] {
    const infos: PaneInfo[] = [];
    const panes = this.chart.panes();
    const contRect = this.container.getBoundingClientRect();
    let acc = 0;
    for (let i = 0; i < panes.length; i++) {
      const pane = panes[i];
      const el = pane.getHTMLElement();
      let top = acc;
      let height = pane.getHeight();
      if (el) {
        const r = el.getBoundingClientRect();
        top = r.top - contRect.top;
        height = r.height;
      }
      acc = top + height + 1;
      const paneId = i === 0 ? "main" : this.subPaneOrder[i - 1] ?? `pane_${i}`;
      let refSeries: AnySeries | null = i === 0 ? this.mainSeries : null;
      if (i > 0) {
        for (const e of this.indicators.values()) {
          if (e.def.pane === "sub" && e.def.paneId === paneId) { refSeries = e.series; break; }
        }
      }
      infos.push({ paneId, index: i, top, height, refSeries });
    }
    return infos;
  }

  private paneById(infos: PaneInfo[], paneId: string): PaneInfo {
    return infos.find((p) => p.paneId === paneId) ?? infos[0];
  }

  private paneAtY(infos: PaneInfo[], y: number): PaneInfo {
    for (const p of infos) if (y >= p.top && y <= p.top + p.height) return p;
    return infos[0];
  }

  /* ════════════════════════ tools / magnet ════════════════════════ */

  setTool(tool: DrawingTool): void {
    if (this.tool === tool) return;
    this.tool = tool;
    /* abandon any half-finished placement */
    if (this.state.mode === "placing") this.state = { mode: "idle" };
    this.measure = null;
    const placing = tool !== "cursor" && tool !== "crosshair";
    this.setChartInputEnabled(!placing);
    this.container.style.cursor = placing ? "crosshair" : "";
    this.cb.onHint(placing ? this.placementHint(tool, 0) : "");
    this.requestRedraw();
  }

  getTool(): DrawingTool { return this.tool; }

  setMagnet(on: boolean): void {
    this.magnet = on;
    this.lastSnap = null;
    this.requestRedraw();
  }

  private setChartInputEnabled(on: boolean): void {
    this.chart.applyOptions({ handleScroll: on, handleScale: on });
  }

  private placementHint(tool: DrawingTool, placed: number): string {
    switch (tool) {
      case "trendline": case "ray": case "extended": case "rectangle": case "ellipse":
      case "fibRetracement": case "arrow": case "measure":
        return placed === 0 ? "Click to set the first point" : "Click to set the second point — Esc cancels";
      case "polyline":
        return placed === 0 ? "Click to start the polyline" : "Click to add points — double-click or Enter to finish";
      case "horizontal": return "Click to place a horizontal line";
      case "vertical": return "Click to place a vertical line";
      case "text": return "Click to place text";
      case "longPosition": return "Click to place a long position";
      case "shortPosition": return "Click to place a short position";
      default: return "";
    }
  }

  /**
   * Magnet snapping: pull (time, price) to the nearest OHLC of the bar
   * under the cursor when within MAGNET_RANGE pixels.
   */
  private snapPoint(x: number, y: number, pane: PaneInfo): DrawingPoint | null {
    const tRaw = this.xToTime(x);
    const pRaw = this.yToPrice(y, pane);
    if (tRaw === null || pRaw === null) return null;

    /* time is always snapped to bar centres — drawings between bars look broken */
    const l = this.xToLogical(x);
    let snappedTime = tRaw;
    if (l !== null && this.candles.length) {
      const idx = Math.max(0, Math.min(this.candles.length - 1, Math.round(l)));
      // only snap time when the rounded logical is within the data span;
      // beyond the last bar keep extrapolated continuous time
      if (l <= this.candles.length - 1 + 0.5 && l >= -0.5) {
        snappedTime = num(this.candles[idx].time);
      } else {
        snappedTime = Math.round(tRaw / this.intervalSec) * this.intervalSec;
      }
    }

    let price = pRaw;
    this.lastSnap = null;
    if (this.magnet && pane.paneId === "main" && this.candles.length) {
      const idx = this.timeIndex.get(snappedTime);
      if (idx !== undefined) {
        const c = this.candles[idx];
        let best = price, bestD = Infinity;
        for (const v of [c.open, c.high, c.low, c.close]) {
          const vy = this.priceToY(v, pane);
          if (vy === null) continue;
          const d = Math.abs(vy - y);
          if (d < bestD) { bestD = d; best = v; }
        }
        if (bestD <= MAGNET_RANGE) {
          price = best;
          const sx = this.timeToX(snappedTime);
          const sy = this.priceToY(price, pane);
          if (sx !== null && sy !== null) this.lastSnap = { x: sx, y: sy };
        }
      }
    }
    return { time: asTime(snappedTime), price };
  }

  /* ════════════════════ drawings: public API ══════════════════════ */

  getDrawingsSnapshot(): Drawing[] {
    return structuredClone(this.drawings);
  }

  /** Restore from an undo/redo snapshot (no echo to the server is wrong —
   *  the app decides; we tag the commit with source "restore"). */
  restoreDrawings(snapshot: Drawing[]): void {
    this.drawings = structuredClone(snapshot);
    if (this.selectedId && !this.drawings.some((d) => d.id === this.selectedId)) {
      this.setSelected(null);
    } else if (this.selectedId) {
      this.emitSelection();
    }
    this.cb.onDrawingsCommit({ kind: "set", source: "restore" });
    this.requestRedraw();
  }

  /* remote (WebSocket) drawing ops — never echo back */
  remoteSet(drawings: Drawing[]): void {
    // Objects from the data source are read-only: tagged server-origin and
    // locked, exactly like an indicator series the client only renders.
    this.drawings = structuredClone(drawings).map((d) => ({
      ...d, selected: false, origin: "server" as const, locked: true,
    }));
    this.setSelected(null);
    this.requestRedraw();
  }

  remoteUpsert(drawing: Drawing): void {
    const i = this.drawings.findIndex((d) => d.id === drawing.id);
    const clean = { ...structuredClone(drawing), selected: false, origin: "server" as const, locked: true };
    if (i >= 0) this.drawings[i] = { ...clean, selected: this.drawings[i].selected };
    else this.drawings.push(clean);
    if (this.selectedId === drawing.id) this.emitSelection();
    this.requestRedraw();
  }

  remoteDelete(ids: string[]): void {
    this.drawings = this.drawings.filter((d) => !ids.includes(d.id));
    if (this.selectedId && ids.includes(this.selectedId)) this.setSelected(null);
    this.requestRedraw();
  }

  selectDrawing(id: string | null): void { this.setSelected(id); this.requestRedraw(); }

  getDrawing(id: string): Drawing | null {
    return this.drawings.find((d) => d.id === id) ?? null;
  }

  updateDrawingStyle(id: string, patch: Partial<DrawingStyle>): void {
    const d = this.drawings.find((x) => x.id === id);
    if (!d) return;
    d.style = { ...d.style, ...patch };
    this.commitUpsert(d);
  }

  /** Generic property patch (text, fibLevels, positionData, lock, hide). */
  updateDrawingProps(
    id: string,
    patch: Partial<Pick<Drawing, "text" | "fibLevels" | "positionData" | "locked" | "visible">>
  ): void {
    const d = this.drawings.find((x) => x.id === id);
    if (!d) return;
    Object.assign(d, patch);
    this.commitUpsert(d);
  }

  cloneDrawing(id: string): void {
    const src = this.drawings.find((x) => x.id === id);
    if (!src) return;
    const copy: Drawing = structuredClone(src);
    copy.id = genId();
    copy.selected = false;
    copy.locked = false;
    /* offset the clone by ~12 bars so it doesn't sit exactly on top */
    const dt = this.intervalSec * 4;
    copy.points = copy.points.map((p) => ({ time: asTime(num(p.time) + dt), price: p.price }));
    this.drawings.push(copy);
    this.commitUpsert(copy);
    this.setSelected(copy.id);
  }

  deleteDrawing(id: string): void {
    const i = this.drawings.findIndex((x) => x.id === id);
    if (i === -1) return;
    this.drawings.splice(i, 1);
    if (this.selectedId === id) this.setSelected(null);
    this.cb.onDrawingsCommit({ kind: "delete", drawingId: id, source: "local" });
    this.requestRedraw();
  }

  deleteSelected(): void { if (this.selectedId) this.deleteDrawing(this.selectedId); }

  clearDrawings(): void {
    if (!this.drawings.length) return;
    this.drawings = [];
    this.setSelected(null);
    this.cb.onDrawingsCommit({ kind: "clear", source: "local" });
    this.requestRedraw();
  }

  setAllLocked(locked: boolean): void {
    for (const d of this.drawings) d.locked = locked;
    if (this.selectedId) this.emitSelection();
    this.cb.onDrawingsCommit({ kind: "set", source: "local" });
    this.requestRedraw();
  }

  setAllHidden(hidden: boolean): void {
    for (const d of this.drawings) d.visible = !hidden;
    if (this.selectedId) this.emitSelection();
    this.cb.onDrawingsCommit({ kind: "set", source: "local" });
    this.requestRedraw();
  }

  hasDrawings(): boolean { return this.drawings.length > 0; }
  allLocked(): boolean { return this.drawings.length > 0 && this.drawings.every((d) => d.locked); }
  allHidden(): boolean { return this.drawings.length > 0 && this.drawings.every((d) => !d.visible); }

  // ── Backtest chart overlay ─────────────────────────────────────────

  /** Show entry / TP / SL / liquidation price lines for open positions. */
  setBtPriceLines(positions: Array<{
    entry: number; side: "LONG" | "SHORT"; symbol: string;
    take_profit: number | null; stop_price: number | null; liquidy: number | null;
  }>): void {
    this.btPositionsData = positions;
    this._applyBtPriceLines();
  }

  private _applyBtPriceLines(): void {
    for (const pl of this.btPriceLines) { try { this.mainSeries.removePriceLine(pl); } catch {} }
    this.btPriceLines = [];
    for (const pos of this.btPositionsData) {
      const long = pos.side === "LONG";
      const sym  = pos.symbol ? ` ${pos.symbol}` : "";
      this.btPriceLines.push(this.mainSeries.createPriceLine({
        price: pos.entry, color: long ? "#00d4a3" : "#ff4d6d",
        lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true,
        title: long ? `▲ LONG${sym}` : `▼ SHORT${sym}`,
      }));
      if (pos.take_profit != null)
        this.btPriceLines.push(this.mainSeries.createPriceLine({
          price: pos.take_profit, color: "#22d3ee",
          lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,
          title: `TP${sym}`,
        }));
      if (pos.stop_price != null)
        this.btPriceLines.push(this.mainSeries.createPriceLine({
          price: pos.stop_price, color: "#fb923c",
          lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,
          title: `SL${sym}`,
        }));
      if (pos.liquidy != null)
        this.btPriceLines.push(this.mainSeries.createPriceLine({
          price: pos.liquidy, color: "#ef4444",
          lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true,
          title: `LIQ${sym}`,
        }));
    }
  }

  /** Place buy/sell arrow markers for closed backtest trades. */
  setBtMarkers(history: Array<{
    side: string; pnl_usdt: number; entry: number; exit_price?: number;
  }>): void {
    if (!this.btMarkersPlugin) {
      this.btMarkersPlugin = createSeriesMarkers(this.mainSeries);
    }
    if (!history.length || !this.candles.length) {
      this.btMarkersPlugin.setMarkers([]);
      this.btMarkersCache = [];
      return;
    }

    // history arrives newest-first; reverse to chronological for placement
    const chrono = [...history].reverse();
    const n = chrono.length;
    const span = Math.min(this.candles.length - 1, Math.max(n * 4, 60));
    const startIdx = Math.max(0, this.candles.length - 1 - span);

    // Assign each trade an ideal candle index, then resolve collisions by
    // nudging duplicates to the nearest free adjacent candle index.
    const usedIdx = new Set<number>();
    const assignments: Array<{ idx: number; trade: (typeof chrono)[0] }> = [];
    for (let i = 0; i < n; i++) {
      let ideal = Math.min(this.candles.length - 1, Math.round(startIdx + (i / Math.max(n - 1, 1)) * span));
      // Search outward for a free slot (max ±n steps)
      let offset = 0;
      while (usedIdx.has(ideal + offset) || usedIdx.has(ideal - offset)) {
        offset++;
        if (offset > n) break;
      }
      const resolved = usedIdx.has(ideal)
        ? (ideal + offset < this.candles.length ? ideal + offset : ideal - offset)
        : ideal;
      const clamped = Math.max(0, Math.min(this.candles.length - 1, resolved));
      usedIdx.add(clamped);
      assignments.push({ idx: clamped, trade: chrono[i] });
    }

    const markers: SeriesMarker<Time>[] = [];
    for (const { idx, trade: t } of assignments) {
      const candle = this.candles[idx];
      const long   = t.side === "LONG";
      const win    = t.pnl_usdt >= 0;
      const absP   = Math.abs(t.pnl_usdt);
      const size   = absP > 500 ? 2 : absP > 150 ? 1.5 : 1;
      const sign   = win ? "+" : "-";
      markers.push({
        time:     candle.time,
        position: long ? "belowBar" : "aboveBar",
        color:    win ? "#00d4a3" : "#ff4d6d",
        shape:    long ? "arrowUp" : "arrowDown",
        text:     `${sign}$${absP.toFixed(0)}`,
        size,
      } as SeriesMarker<Time>);
    }
    markers.sort((a, b) => num(a.time) - num(b.time));
    this.btMarkersCache = markers;
    this.btMarkersPlugin.setMarkers(markers);
  }

  /** Remove all backtest price lines and trade markers. */
  clearBtOverlay(): void {
    for (const pl of this.btPriceLines) { try { this.mainSeries.removePriceLine(pl); } catch {} }
    this.btPriceLines = [];
    this.btPositionsData = [];
    if (this.btMarkersPlugin) {
      try { this.btMarkersPlugin.setMarkers([]); } catch {}
    }
    this.btMarkersCache = [];
  }

  /** Place a horizontal line at an explicit container y (context menu). */
  addHorizontalAt(y: number): void {
    const infos = this.getPaneInfos();
    const pane = this.paneAtY(infos, y);
    const price = this.yToPrice(y, pane);
    if (price === null) return;
    const d = this.makeDrawing("horizontal", [{ time: asTime(this.nowTime()), price }], pane.paneId);
    this.drawings.push(d);
    this.commitUpsert(d);
    this.setSelected(d.id);
  }

  cancelPlacement(): boolean {
    let acted = false;
    if (this.state.mode === "placing") {
      this.state = { mode: "idle" };
      this.cb.onHint("");
      acted = true;
    }
    if (this.measure) { this.measure = null; acted = true; }
    if (acted) this.requestRedraw();
    return acted;
  }

  /** Finish an in-progress polyline (Enter key / dbl-click). */
  finishPolyline(): boolean {
    if (this.state.mode === "placing" && this.state.tool === "polyline" && this.state.points.length >= 2) {
      const d = this.makeDrawing("polyline", this.state.points, this.state.paneId);
      this.drawings.push(d);
      this.state = { mode: "idle" };
      this.commitUpsert(d);
      this.setSelected(d.id);
      this.cb.onToolDone();
      this.cb.onHint("");
      return true;
    }
    return false;
  }

  hasSelection(): boolean { return this.selectedId !== null; }

  private nowTime(): number {
    return this.candles.length ? num(this.candles[this.candles.length - 1].time) : Math.floor(Date.now() / 1000);
  }

  private makeDrawing(tool: DrawingTool, points: DrawingPoint[], paneId: string): Drawing {
    const d: Drawing = {
      id: genId(),
      tool,
      points: structuredClone(points),
      style: { ...DEFAULT_DRAWING_STYLE },
      paneId,
      locked: false,
      visible: true,
      completed: true,
      selected: false,
      origin: "local",
    };
    if (tool === "fibRetracement" || tool === "fibExtension") d.fibLevels = structuredClone(DEFAULT_FIB_LEVELS);
    if (tool === "longPosition" || tool === "shortPosition") {
      const entry = points[0].price;
      const long = tool === "longPosition";
      const risk = entry * 0.01;
      d.positionData = {
        entryPrice: entry,
        stopLoss: long ? entry - risk : entry + risk,
        takeProfit: long ? entry + risk * 2 : entry - risk * 2,
        quantity: 1,
        risk: 1,
        reward: 2,
      };
      /* points[1] marks the right edge of the position box */
      const span = this.intervalSec * 30;
      d.points = [points[0], { time: asTime(num(points[0].time) + span), price: entry }];
    }
    if (tool === "text") d.text = "Text";
    return d;
  }

  private commitUpsert(d: Drawing): void {
    this.cb.onDrawingsCommit({ kind: "upsert", drawing: structuredClone(d), source: "local" });
    if (this.selectedId === d.id) this.emitSelection();
    this.requestRedraw();
  }

  private setSelected(id: string | null): void {
    if (this.selectedId === id) return;
    for (const d of this.drawings) d.selected = d.id === id;
    this.selectedId = id;
    this.emitSelection();
    this.requestRedraw();
  }

  private emitSelection(): void {
    const d = this.selectedId ? this.drawings.find((x) => x.id === this.selectedId) : null;
    if (!d) {
      this.cb.onSelectionChange(null);
      this.cb.onSelectionBox(null);
      this.lastSelectionBoxJson = "";
      return;
    }
    this.cb.onSelectionChange({
      id: d.id, tool: d.tool, locked: d.locked, visible: d.visible,
      style: { ...d.style }, text: d.text,
      fibLevels: d.fibLevels ? structuredClone(d.fibLevels) : undefined,
      positionData: d.positionData ? { ...d.positionData } : undefined,
    });
  }

  /* ═══════════════════ pointer interactions ═══════════════════════ */

  private localPos(e: MouseEvent | PointerEvent): { x: number; y: number } {
    const r = this.container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Is the position inside the plotting area (not over the scales)? */
  private inPlotArea(x: number, y: number): boolean {
    const tsW = this.chart.timeScale().width();
    const tsH = this.chart.timeScale().height();
    return x >= 0 && x <= tsW && y >= 0 && y <= this.container.clientHeight - tsH;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button === 2) return; // context-menu handled separately
    const pos = this.localPos(e);
    if (!this.inPlotArea(pos.x, pos.y)) return; // let axis drags through

    const infos = this.getPaneInfos();
    const pane = this.paneAtY(infos, pos.y);

    /* a fresh interaction clears any persisted measurement */
    if (this.measure && this.measure.p1) { this.measure = null; this.requestRedraw(); }

    /* Shift + drag in cursor mode → rectangle zoom */
    if (e.shiftKey && (this.tool === "cursor" || this.tool === "crosshair")) {
      this.state = { mode: "rectZoom", x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y };
      this.setChartInputEnabled(false);
      this.container.setPointerCapture(e.pointerId);
      e.preventDefault();
      this.requestRedraw();
      return;
    }

    /* placement mode */
    if (this.tool !== "cursor" && this.tool !== "crosshair") {
      e.preventDefault();
      this.handlePlacementClick(pos, pane, infos);
      return;
    }

    /* cursor mode → hit test drawings */
    const hit = this.hitTest(pos.x, pos.y, infos);
    if (hit) {
      e.preventDefault(); // never pan while interacting with a drawing
      const d = this.drawings.find((x) => x.id === hit.id)!;
      this.setSelected(hit.id);
      if (d.locked) return; // locked → select only

      const startLogical = this.xToLogical(pos.x);
      const startPrice = this.yToPrice(pos.y, this.paneById(infos, d.paneId));
      if (startLogical === null || startPrice === null) return;
      this.state = {
        mode: "dragging",
        id: d.id,
        part: hit.part,
        startLogical,
        startPrice,
        origPoints: structuredClone(d.points),
        origLogicals: d.points.map((p) => this.timeToLogical(num(p.time)) ?? 0),
        origPosition: d.positionData ? { ...d.positionData } : undefined,
        moved: false,
      };
      this.setChartInputEnabled(false);
      this.container.setPointerCapture(e.pointerId);
      return;
    }

    /* clicked empty chart → deselect; allow native panning */
    if (this.selectedId) this.setSelected(null);
  }

  private handlePlacementClick(pos: { x: number; y: number }, pane: PaneInfo, infos: PaneInfo[]): void {
    const pt = this.snapPoint(pos.x, pos.y, pane);
    if (!pt) return;
    const tool = this.tool;

    /* measure is ephemeral — it never enters this.drawings */
    if (tool === "measure") {
      if (!this.measure || this.measure.p1) {
        this.measure = { p0: pt, p1: null, paneId: pane.paneId };
        this.cb.onHint("Click to set the second point — Esc clears");
      } else {
        this.measure.p1 = pt;
        this.cb.onHint("Esc or click to clear the measurement");
        this.cb.onToolDone();
      }
      this.requestRedraw();
      return;
    }

    /* single-click tools complete immediately */
    if (tool === "horizontal" || tool === "vertical" || tool === "text" ||
        tool === "longPosition" || tool === "shortPosition") {
      const d = this.makeDrawing(tool, [pt], pane.paneId);
      this.drawings.push(d);
      this.commitUpsert(d);
      this.setSelected(d.id);
      this.cb.onToolDone();
      this.cb.onHint("");
      if (tool === "text") this.cb.onEditDrawing(d.id);
      return;
    }

    /* multi-point tools */
    if (this.state.mode !== "placing" || this.state.tool !== tool) {
      this.state = { mode: "placing", tool, points: [pt], paneId: pane.paneId };
      this.cb.onHint(this.placementHint(tool, 1));
      this.requestRedraw();
      return;
    }

    /* continuing an in-progress placement — pin to the original pane */
    const fixedPane = this.paneById(infos, this.state.paneId);
    const pinned = this.snapPoint(pos.x, pos.y, fixedPane) ?? pt;
    this.state.points.push(pinned);

    if (tool === "polyline") {
      this.cb.onHint(this.placementHint(tool, this.state.points.length));
      this.requestRedraw();
      return;
    }

    /* most tools finish on the 2nd click; the parallel channel needs a
       3rd click to set the channel width (offset of the parallel line) */
    const needed = (tool === "parallelChannel" || tool === "fibExtension") ? 3 : 2;
    if ((tool === "parallelChannel" || tool === "fibExtension") && this.state.points.length < needed) {
      this.cb.onHint(tool === "fibExtension" ? "Click to set the projection origin" : "Click to set the channel width");
      this.requestRedraw();
      return;
    }
    if (this.state.points.length >= needed) {
      const d = this.makeDrawing(tool, this.state.points.slice(0, needed), this.state.paneId);
      this.drawings.push(d);
      this.state = { mode: "idle" };
      this.commitUpsert(d);
      this.setSelected(d.id);
      this.cb.onToolDone();
      this.cb.onHint("");
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const pos = this.localPos(e);
    this.hoverPos = pos;
    const infos = this.getPaneInfos();

    if (this.state.mode === "rectZoom") {
      this.state.x1 = pos.x; this.state.y1 = pos.y;
      this.requestRedraw();
      return;
    }

    if (this.state.mode === "dragging") {
      this.applyDrag(pos, infos);
      return;
    }

    if (this.state.mode === "placing" || (this.measure && !this.measure.p1)) {
      /* live preview follows the cursor (with magnet feedback) */
      const pane = this.state.mode === "placing"
        ? this.paneById(infos, this.state.paneId)
        : this.paneById(infos, this.measure!.paneId);
      this.snapPoint(pos.x, pos.y, pane); // refresh lastSnap marker
      this.requestRedraw();
      return;
    }

    /* idle cursor mode → hover highlight */
    if (this.tool === "cursor" || this.tool === "crosshair") {
      const hit = this.hitTest(pos.x, pos.y, infos);
      const id = hit?.id ?? null;
      if (id !== this.hoveredId) {
        this.hoveredId = id;
        this.container.style.cursor = id ? "pointer" : "";
        this.requestRedraw();
      }
    }
  }

  /** Core drag math — uses logical-bar deltas for time so shapes never skew. */
  private applyDrag(pos: { x: number; y: number }, infos: PaneInfo[]): void {
    if (this.state.mode !== "dragging") return;
    const st = this.state;
    const d = this.drawings.find((x) => x.id === st.id);
    if (!d) { this.state = { mode: "idle" }; return; }
    const pane = this.paneById(infos, d.paneId);

    const curLogical = this.xToLogical(pos.x);
    const curPrice = this.yToPrice(pos.y, pane);
    if (curLogical === null || curPrice === null) return;

    const dLogical = curLogical - st.startLogical;
    const dPrice = curPrice - st.startPrice;
    if (Math.abs(dLogical) > 0.05 || Math.abs(dPrice) > 0) st.moved = true;

    const part = st.part;
    if (part.kind === "point") {
      /* drag one anchor — magnet applies here */
      const snapped = this.snapPoint(pos.x, pos.y, pane);
      if (!snapped) return;
      if (d.tool === "horizontal") {
        d.points[0] = { time: d.points[0].time, price: snapped.price };
      } else if (d.tool === "vertical") {
        d.points[0] = { time: snapped.time, price: d.points[0].price };
      } else {
        d.points[part.index] = snapped;
        /* keep position entry price glued to points[0] */
        if ((d.tool === "longPosition" || d.tool === "shortPosition") && d.positionData) {
          if (part.index === 0) d.positionData.entryPrice = snapped.price;
          else d.points[1] = { time: snapped.time, price: d.points[0].price };
          this.recalcPosition(d);
        }
      }
    } else if (part.kind === "body") {
      const barShift = Math.round(dLogical);
      for (let i = 0; i < d.points.length; i++) {
        const t = this.logicalToTime(st.origLogicals[i] + barShift);
        const p = d.tool === "vertical" ? st.origPoints[i].price : st.origPoints[i].price + dPrice;
        d.points[i] = {
          time: asTime(d.tool === "horizontal" ? num(st.origPoints[i].time) : t),
          price: p,
        };
      }
      if ((d.tool === "longPosition" || d.tool === "shortPosition") && d.positionData && st.origPosition) {
        d.positionData.entryPrice = st.origPosition.entryPrice + dPrice;
        d.positionData.stopLoss = st.origPosition.stopLoss + dPrice;
        d.positionData.takeProfit = st.origPosition.takeProfit + dPrice;
      }
    } else if (d.positionData) {
      /* entry / sl / tp line drags */
      if (part.kind === "entry") {
        d.positionData.entryPrice = curPrice;
        d.points[0] = { ...d.points[0], price: curPrice };
        d.points[1] = { ...d.points[1], price: curPrice };
      } else if (part.kind === "sl") d.positionData.stopLoss = curPrice;
      else if (part.kind === "tp") d.positionData.takeProfit = curPrice;
      this.recalcPosition(d);
    }
    this.requestRedraw();
  }

  private recalcPosition(d: Drawing): void {
    const p = d.positionData;
    if (!p) return;
    const risk = Math.abs(p.entryPrice - p.stopLoss);
    const reward = Math.abs(p.takeProfit - p.entryPrice);
    p.risk = risk;
    p.reward = reward;
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.state.mode === "rectZoom") {
      const { x0, x1 } = this.state;
      this.state = { mode: "idle" };
      this.setChartInputEnabled(true);
      try { this.container.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      if (Math.abs(x1 - x0) > 8) {
        const l0 = this.xToLogical(Math.min(x0, x1));
        const l1 = this.xToLogical(Math.max(x0, x1));
        if (l0 !== null && l1 !== null && l1 - l0 > 0.5) {
          this.chart.timeScale().setVisibleLogicalRange({ from: l0, to: l1 });
        }
      }
      this.requestRedraw();
      return;
    }

    if (this.state.mode === "dragging") {
      const st = this.state;
      this.state = { mode: "idle" };
      this.setChartInputEnabled(true);
      try { this.container.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      const d = this.drawings.find((x) => x.id === st.id);
      if (d && st.moved) this.commitUpsert(d); // one commit per gesture → one undo step
      this.requestRedraw();
    }
  }

  private onDblClick(e: MouseEvent): void {
    const pos = this.localPos(e);
    if (!this.inPlotArea(pos.x, pos.y)) return;
    /* finishing a polyline takes priority over fullscreen */
    if (this.finishPolyline()) { e.preventDefault(); e.stopPropagation(); return; }
    const infos = this.getPaneInfos();
    const hit = this.hitTest(pos.x, pos.y, infos);
    if (hit) {
      e.preventDefault(); e.stopPropagation();
      this.setSelected(hit.id);
      this.cb.onEditDrawing(hit.id);
      return;
    }
    this.cb.onDblClickEmpty();
  }

  private onContextMenuEvt(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const pos = this.localPos(e);
    const infos = this.getPaneInfos();
    const hit = this.inPlotArea(pos.x, pos.y) ? this.hitTest(pos.x, pos.y, infos) : null;
    if (hit) this.setSelected(hit.id);
    this.cb.onContextMenu(pos.x, pos.y, hit?.id ?? null);
  }

  /* ═════════════════════════ hit testing ══════════════════════════ */

  private hitTest(x: number, y: number, infos: PaneInfo[]): HitResult | null {
    /* iterate topmost-first so the most recently drawn wins */
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      if (!d.visible) continue;
      const pane = this.paneById(infos, d.paneId);
      if (y < pane.top - 2 || y > pane.top + pane.height + 2) {
        // horizontal/vertical lines still respond only inside their pane
        continue;
      }
      const hit = this.hitDrawing(d, x, y, pane);
      if (hit) return { id: d.id, part: hit };
    }
    return null;
  }

  private screenPoints(d: Drawing, pane: PaneInfo): Array<{ x: number; y: number } | null> {
    return d.points.map((p) => {
      const px = this.timeToX(num(p.time));
      const py = this.priceToY(p.price, pane);
      return px === null || py === null ? null : { x: px, y: py };
    });
  }

  private hitDrawing(d: Drawing, x: number, y: number, pane: PaneInfo): HitPart | null {
    const pts = this.screenPoints(d, pane);
    const width = this.chart.timeScale().width();

    /* point handles take priority (selected drawings only) */
    if (d.selected && !d.locked) {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p && Math.hypot(p.x - x, p.y - y) <= HANDLE_RADIUS) return { kind: "point", index: i };
      }
    }

    switch (d.tool) {
      case "horizontal": {
        const py = this.priceToY(d.points[0].price, pane);
        if (py !== null && Math.abs(py - y) <= HIT_TOLERANCE) return { kind: "point", index: 0 };
        return null;
      }
      case "vertical": {
        const px = this.timeToX(num(d.points[0].time));
        if (px !== null && Math.abs(px - x) <= HIT_TOLERANCE) return { kind: "point", index: 0 };
        return null;
      }
      case "trendline": case "arrow": {
        const [a, b] = pts;
        if (!a || !b) return null;
        let A = a, B = b;
        if (d.style.extendLeft || d.style.extendRight) {
          const ext = this.extendSegment(a, b, d.style.extendLeft, d.style.extendRight, width);
          A = ext.a; B = ext.b;
        }
        if (this.distToSegment(x, y, A, B) <= HIT_TOLERANCE) {
          return d.selected ? { kind: "body" } : { kind: "body" };
        }
        return null;
      }
      case "ray": {
        const [a, b] = pts;
        if (!a || !b) return null;
        const ext = this.extendSegment(a, b, false, true, width);
        return this.distToSegment(x, y, a, ext.b) <= HIT_TOLERANCE ? { kind: "body" } : null;
      }
      case "extended": {
        const [a, b] = pts;
        if (!a || !b) return null;
        const ext = this.extendSegment(a, b, true, true, width);
        return this.distToSegment(x, y, ext.a, ext.b) <= HIT_TOLERANCE ? { kind: "body" } : null;
      }
      case "polyline": {
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1];
          if (a && b && this.distToSegment(x, y, a, b) <= HIT_TOLERANCE) return { kind: "body" };
        }
        return null;
      }
      case "rectangle": {
        const [a, b] = pts;
        if (!a || !b) return null;
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
        const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
        const nearEdge =
          (Math.abs(x - x0) <= HIT_TOLERANCE || Math.abs(x - x1) <= HIT_TOLERANCE) && y >= y0 - HIT_TOLERANCE && y <= y1 + HIT_TOLERANCE ||
          (Math.abs(y - y0) <= HIT_TOLERANCE || Math.abs(y - y1) <= HIT_TOLERANCE) && x >= x0 - HIT_TOLERANCE && x <= x1 + HIT_TOLERANCE;
        if (nearEdge) return { kind: "body" };
        if (x > x0 && x < x1 && y > y0 && y < y1) return { kind: "body" };
        return null;
      }
      case "ellipse": {
        const [a, b] = pts;
        if (!a || !b) return null;
        const cxp = (a.x + b.x) / 2, cyp = (a.y + b.y) / 2;
        const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
        if (rx < 1 || ry < 1) return null;
        // Normalized ellipse equation: =1 on the perimeter, <1 inside.
        const nx = (x - cxp) / rx, ny = (y - cyp) / ry;
        const v = nx * nx + ny * ny;
        // accept a band around the perimeter, plus the filled interior
        if (v <= 1.15) return { kind: "body" };
        return null;
      }
      case "parallelChannel": {
        const [a, b, c] = pts;
        if (!a || !b) return null;
        if (this.distToSegment(x, y, a, b) <= HIT_TOLERANCE) return { kind: "body" };
        if (c) {
          const dy = c.y - b.y;
          if (this.distToSegment(x, y, { x: a.x, y: a.y + dy }, { x: b.x, y: b.y + dy }) <= HIT_TOLERANCE) {
            return { kind: "body" };
          }
        }
        return null;
      }
      case "fibExtension": {
        const [a, b, c] = pts;
        if (!a || !b) return null;
        if (this.distToSegment(x, y, a, b) <= HIT_TOLERANCE) return { kind: "body" };
        if (c && this.distToSegment(x, y, b, c) <= HIT_TOLERANCE) return { kind: "body" };
        return null;
      }
      case "fibRetracement": {
        const [a, b] = pts;
        if (!a || !b) return null;
        if (this.distToSegment(x, y, a, b) <= HIT_TOLERANCE) return { kind: "body" };
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
        if (x >= x0 - 4 && x <= x1 + 4) {
          const p0 = d.points[0].price, p1 = d.points[1].price;
          for (const lvl of d.fibLevels ?? DEFAULT_FIB_LEVELS) {
            if (!lvl.enabled) continue;
            const ly = this.priceToY(p1 + (p0 - p1) * lvl.value, pane);
            if (ly !== null && Math.abs(ly - y) <= HIT_TOLERANCE) return { kind: "body" };
          }
        }
        return null;
      }
      case "text": {
        const a = pts[0];
        if (!a) return null;
        const fs = d.style.fontSize || 12;
        const w = Math.max(40, (d.text?.length ?? 4) * fs * 0.62) + 16;
        const h = fs * ((d.text?.split("\n").length ?? 1)) + 14;
        if (x >= a.x - 4 && x <= a.x + w && y >= a.y - h / 2 - 4 && y <= a.y + h / 2 + 4) return { kind: "body" };
        return null;
      }
      case "longPosition": case "shortPosition": {
        const [a, b] = pts;
        const p = d.positionData;
        if (!a || !b || !p) return null;
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
        if (x < x0 - HANDLE_RADIUS || x > x1 + HANDLE_RADIUS) return null;
        const yE = this.priceToY(p.entryPrice, pane);
        const ySL = this.priceToY(p.stopLoss, pane);
        const yTP = this.priceToY(p.takeProfit, pane);
        if (yE !== null && Math.abs(yE - y) <= HIT_TOLERANCE) return { kind: "entry" };
        if (ySL !== null && Math.abs(ySL - y) <= HIT_TOLERANCE) return { kind: "sl" };
        if (yTP !== null && Math.abs(yTP - y) <= HIT_TOLERANCE) return { kind: "tp" };
        if (yE !== null && ySL !== null && yTP !== null) {
          const top = Math.min(yE, ySL, yTP), bot = Math.max(yE, ySL, yTP);
          if (y >= top && y <= bot) return { kind: "body" };
        }
        return null;
      }
      default:
        return null;
    }
  }

  private distToSegment(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - a.x, py - a.y);
    let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }

  private extendSegment(
    a: { x: number; y: number },
    b: { x: number; y: number },
    left: boolean,
    right: boolean,
    width: number
  ): { a: { x: number; y: number }; b: { x: number; y: number } } {
    let A = { ...a }, B = { ...b };
    if (A.x > B.x) { const t = A; A = B; B = t; }
    const dx = B.x - A.x, dy = B.y - A.y;
    if (Math.abs(dx) < 1e-6) {
      // vertical-ish segment: extend along y instead
      if (left) A = { x: A.x, y: dy >= 0 ? -10 : this.container.clientHeight + 10 };
      if (right) B = { x: B.x, y: dy >= 0 ? this.container.clientHeight + 10 : -10 };
      return { a: A, b: B };
    }
    const slope = dy / dx;
    if (left) A = { x: -10, y: A.y + slope * (-10 - A.x) };
    if (right) B = { x: width + 10, y: B.y + slope * (width + 10 - B.x) };
    return { a: A, b: B };
  }

  /* ════════════════════ crosshair / range subs ════════════════════ */

  private onCrosshairMove(p: MouseEventParams): void {
    let bar: OHLC | null = null;
    let prevClose: number | null = null;
    let volume: number | null = null;
    let hovering = false;
    const indicatorValues: Record<string, number | null> = {};

    if (p.time !== undefined && p.point) {
      hovering = true;
      const t = num(p.time as Time);
      const idx = this.timeIndex.get(t);
      if (idx !== undefined) {
        bar = this.displayed[idx] ?? this.candles[idx];
        prevClose = idx > 0 ? (this.displayed[idx - 1] ?? this.candles[idx - 1]).close : null;
        volume = this.candles[idx].volume ?? null;
      }
      for (const [key, entry] of this.indicators) {
        const v = p.seriesData.get(entry.series as ISeriesApi<any>) as { value?: number; close?: number } | undefined;
        indicatorValues[key] = v ? (v.value ?? v.close ?? null) : null;
      }
    } else {
      /* pointer left the chart — fall back to the latest bar */
      const n = this.displayed.length;
      if (n) {
        bar = this.displayed[n - 1];
        prevClose = n > 1 ? this.displayed[n - 2].close : null;
        volume = this.candles[n - 1].volume ?? null;
      }
      for (const [key, entry] of this.indicators) {
        const data = entry.series.data();
        const last = data.length ? (data[data.length - 1] as { value?: number }) : undefined;
        indicatorValues[key] = last?.value ?? null;
      }
    }

    const changeAbs = bar && prevClose !== null ? bar.close - prevClose : 0;
    const changePct = bar && prevClose ? (changeAbs / prevClose) * 100 : 0;
    this.cb.onCrosshair({ bar, prevClose, changeAbs, changePct, volume, hovering, indicatorValues });
    this.requestRedraw(); // crosshair shares the frame with magnet markers
  }

  private onVisibleRangeChange(): void {
    const r = this.chart.timeScale().getVisibleLogicalRange();
    if (!r) return;

    /* lazy history loading near the left edge */
    if (!this.historyPending && !this.noMoreHistory && this.candles.length > 0 && r.from < HISTORY_TRIGGER) {
      this.historyPending = true;
      const before = num(this.candles[0].time);
      // Defer to the next frame so the heavy prepend (setData + indicator
      // recompute) runs AFTER the current pan frame has painted, instead
      // of blocking it. This removes the visible hitch when scrolling
      // into history while keeping the load eager.
      requestAnimationFrame(() => {
        if (this.disposed) return;
        // pass oldest candle time so caller can send a proper [from, before] range to server
        const oldest = this.candles.length > 0 ? num(this.candles[0].time) : undefined;
        this.cb.onNeedHistory(before, HISTORY_CHUNK, oldest);
      });
      /* safety valve — don't deadlock if the server never answers */
      this.historyTimeout = setTimeout(() => { this.historyPending = false; }, 8000);
    }

    /* "go to realtime" affordance */
    const behind = this.candles.length > 0 && r.to < this.candles.length - 3;
    if (behind !== this.behindRealtime) {
      this.behindRealtime = behind;
      this.cb.onRealtimeGapChange(behind);
    }
    this.requestRedraw();
  }

  private clearHistoryPending(): void {
    this.historyPending = false;
    if (this.historyTimeout) { clearTimeout(this.historyTimeout); this.historyTimeout = null; }
  }

  /* ══════════════════════ overlay rendering ═══════════════════════ */

  requestRedraw(): void { this.dirty = true; }

  private syncOverlaySize(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    // Cache CSS-px size so the redraw hot path doesn't re-read layout
    // (clientWidth/Height force a reflow). Refreshed here, which only
    // runs from the ResizeObserver and the first frame.
    this.cssW = w;
    this.cssH = h;
    if (this.overlay.width !== Math.round(w * dpr) || this.overlay.height !== Math.round(h * dpr)) {
      this.overlay.width = Math.round(w * dpr);
      this.overlay.height = Math.round(h * dpr);
      this.overlay.style.width = `${w}px`;
      this.overlay.style.height = `${h}px`;
    }
  }

  private redraw(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    // Only re-measure/resize the canvas when the ResizeObserver flagged
    // a geometry change. During a pan the size is constant, so we skip
    // the layout-reflowing clientWidth/Height reads every frame.
    if (this.overlayDirty) { this.syncOverlaySize(); this.overlayDirty = false; }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    const infos = this.getPaneInfos();
    this.publishPaneLayout(infos);
    const plotW = this.chart.timeScale().width();

    /* completed drawings */
    for (const d of this.drawings) {
      if (!d.visible) continue;
      const pane = this.paneById(infos, d.paneId);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, pane.top, plotW, pane.height);
      ctx.clip();
      this.renderDrawing(ctx, d, pane, plotW, d.id === this.hoveredId);
      ctx.restore();
    }

    /* in-progress placement preview */
    if (this.state.mode === "placing" && this.hoverPos) {
      const pane = this.paneById(infos, this.state.paneId);
      const preview = this.snapPreviewPoint(pane);
      if (preview) {
        const ghost: Drawing = this.makePreviewDrawing(this.state.tool, [...this.state.points, preview], this.state.paneId);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, pane.top, plotW, pane.height);
        ctx.clip();
        ctx.globalAlpha = 0.85;
        this.renderDrawing(ctx, ghost, pane, plotW, false);
        ctx.restore();
      }
    }

    /* measurement overlay */
    if (this.measure) {
      const pane = this.paneById(infos, this.measure.paneId);
      const p1 = this.measure.p1 ?? this.snapPreviewPoint(pane);
      if (p1) this.renderMeasure(ctx, this.measure.p0, p1, pane);
    }

    /* rectangle-zoom marquee */
    if (this.state.mode === "rectZoom") {
      const { x0, y0, x1, y1 } = this.state;
      ctx.save();
      ctx.fillStyle = "rgba(41, 98, 255, 0.12)";
      ctx.strokeStyle = "rgba(41, 98, 255, 0.8)";
      ctx.lineWidth = 1;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.restore();
    }

    /* magnet snap marker */
    if (this.lastSnap && this.magnet) {
      ctx.save();
      ctx.strokeStyle = "#2962FF";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.lastSnap.x, this.lastSnap.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = "#2962FF";
      ctx.arc(this.lastSnap.x, this.lastSnap.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    this.publishSelectionBox(infos);
  }

  private snapPreviewPoint(pane: PaneInfo): DrawingPoint | null {
    if (!this.hoverPos) return null;
    return this.snapPoint(this.hoverPos.x, this.hoverPos.y, pane);
  }

  private makePreviewDrawing(tool: DrawingTool, points: DrawingPoint[], paneId: string): Drawing {
    return {
      id: "__preview__", tool, points, style: { ...DEFAULT_DRAWING_STYLE },
      paneId, locked: false, visible: true, completed: false, selected: false,
      fibLevels: tool === "fibRetracement" ? DEFAULT_FIB_LEVELS : undefined,
    };
  }

  private publishPaneLayout(infos: PaneInfo[]): void {
    const layout: PaneLayoutEntry[] = infos.map((p) => ({ paneId: p.paneId, top: p.top, height: p.height }));
    const json = JSON.stringify(layout);
    if (json !== this.paneLayoutJson) {
      this.paneLayoutJson = json;
      this.cb.onPaneLayout(layout);
    }
  }

  private publishSelectionBox(infos: PaneInfo[]): void {
    if (!this.selectedId) return;
    const d = this.drawings.find((x) => x.id === this.selectedId);
    if (!d || !d.visible) { this.cb.onSelectionBox(null); this.lastSelectionBoxJson = ""; return; }
    const pane = this.paneById(infos, d.paneId);
    const pts = this.screenPoints(d, pane).filter((p): p is { x: number; y: number } => p !== null);
    if (!pts.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    if (d.tool === "horizontal") { x0 = 0; x1 = this.chart.timeScale().width(); }
    if (d.tool === "vertical") { y0 = pane.top; y1 = pane.top + pane.height; }
    if (d.positionData) {
      const ys = [d.positionData.stopLoss, d.positionData.takeProfit, d.positionData.entryPrice]
        .map((v) => this.priceToY(v, pane))
        .filter((v): v is number => v !== null);
      for (const v of ys) { y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    }
    const box: SelectionBox = { id: d.id, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const json = JSON.stringify(box);
    if (json !== this.lastSelectionBoxJson) {
      this.lastSelectionBoxJson = json;
      this.cb.onSelectionBox(box);
    }
  }

  /* ── per-tool renderers ──────────────────────────────────────── */

  private renderDrawing(
    ctx: CanvasRenderingContext2D,
    d: Drawing,
    pane: PaneInfo,
    plotW: number,
    hovered: boolean
  ): void {
    const pts = this.screenPoints(d, pane);
    const st = d.style;
    const lw = st.lineWidth + (hovered && !d.selected ? 0.75 : 0);
    ctx.lineWidth = lw;
    ctx.strokeStyle = st.color;
    ctx.fillStyle = st.color;
    this.applyDash(ctx, st.lineStyle, lw);
    ctx.font = `${st.fontSize || 12}px Inter, sans-serif`;

    switch (d.tool) {
      case "trendline": {
        const [a, b] = pts;
        if (!a || !b) break;
        let A = a, B = b;
        if (st.extendLeft || st.extendRight) {
          const e = this.extendSegment(a, b, st.extendLeft, st.extendRight, plotW);
          A = e.a; B = e.b;
        }
        this.line(ctx, A, B);
        break;
      }
      case "ray": {
        const [a, b] = pts;
        if (!a || !b) break;
        const e = this.extendSegment(a, b, false, true, plotW);
        this.line(ctx, a, e.b);
        break;
      }
      case "extended": {
        const [a, b] = pts;
        if (!a || !b) break;
        const e = this.extendSegment(a, b, true, true, plotW);
        this.line(ctx, e.a, e.b);
        break;
      }
      case "horizontal": {
        const y = this.priceToY(d.points[0].price, pane);
        if (y === null) break;
        this.line(ctx, { x: 0, y }, { x: plotW, y });
        if (st.showLabels) {
          this.priceTag(ctx, plotW, y, this.fmt(d.points[0].price), st.color);
        }
        break;
      }
      case "vertical": {
        const x = this.timeToX(num(d.points[0].time));
        if (x === null) break;
        this.line(ctx, { x, y: pane.top }, { x, y: pane.top + pane.height });
        break;
      }
      case "polyline": {
        ctx.beginPath();
        let started = false;
        for (const p of pts) {
          if (!p) continue;
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        break;
      }
      case "rectangle": {
        const [a, b] = pts;
        if (!a || !b) break;
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
        ctx.save();
        ctx.globalAlpha = st.fillOpacity;
        ctx.fillStyle = st.fillColor;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        break;
      }
      case "ellipse": {
        const [a, b] = pts;
        if (!a || !b) break;
        // Ellipse inscribed in the bounding box of the two points.
        const cxp = (a.x + b.x) / 2, cyp = (a.y + b.y) / 2;
        const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cxp, cyp, rx, ry, 0, 0, Math.PI * 2);
        ctx.globalAlpha = st.fillOpacity;
        ctx.fillStyle = st.fillColor;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.ellipse(cxp, cyp, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "parallelChannel": {
        const [a, b, c] = pts;
        if (!a || !b) break;
        // main line a→b; the parallel line is offset vertically by the
        // distance from the 3rd point to the main line.
        const dy = c ? c.y - b.y : 0;
        const a2 = { x: a.x, y: a.y + dy };
        const b2 = { x: b.x, y: b.y + dy };
        // filled band between the two parallels
        if (c) {
          ctx.save();
          ctx.globalAlpha = st.fillOpacity;
          ctx.fillStyle = st.fillColor;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(b2.x, b2.y);
          ctx.lineTo(a2.x, a2.y);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        this.line(ctx, a, b);
        if (c) this.line(ctx, a2, b2);
        break;
      }
      case "arrow": {
        const [a, b] = pts;
        if (!a || !b) break;
        this.line(ctx, a, b);
        this.arrowHead(ctx, a, b, Math.max(8, lw * 4));
        break;
      }
      case "text": {
        const a = pts[0];
        if (!a) break;
        const lines = (d.text ?? "").split("\n");
        const fs = st.fontSize || 12;
        const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width), 24);
        const boxW = wMax + 16, boxH = lines.length * (fs + 4) + 10;
        ctx.save();
        ctx.fillStyle = "rgba(30, 34, 45, 0.85)";
        this.roundRect(ctx, a.x, a.y - boxH / 2, boxW, boxH, 4);
        ctx.fill();
        ctx.strokeStyle = d.selected ? st.color : "rgba(42, 46, 57, 0.9)";
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        this.roundRect(ctx, a.x, a.y - boxH / 2, boxW, boxH, 4);
        ctx.stroke();
        ctx.fillStyle = st.color;
        ctx.textBaseline = "top";
        lines.forEach((l, i) => ctx.fillText(l, a.x + 8, a.y - boxH / 2 + 6 + i * (fs + 4)));
        ctx.restore();
        break;
      }
      case "fibRetracement": {
        const [a, b] = pts;
        if (!a || !b) break;
        /* the diagonal "trend" line */
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = this.hexA(st.color, 0.7);
        this.line(ctx, a, b);
        ctx.restore();

        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
        const p0 = d.points[0].price, p1 = d.points[1].price;
        const levels = (d.fibLevels ?? DEFAULT_FIB_LEVELS).filter((l) => l.enabled);
        const sorted = [...levels].sort((m, n) => m.value - n.value);

        /* translucent bands between consecutive levels */
        for (let i = 0; i + 1 < sorted.length; i++) {
          const yA = this.priceToY(p1 + (p0 - p1) * sorted[i].value, pane);
          const yB = this.priceToY(p1 + (p0 - p1) * sorted[i + 1].value, pane);
          if (yA === null || yB === null) continue;
          ctx.save();
          ctx.fillStyle = this.hexA(sorted[i + 1].color, 0.08);
          ctx.fillRect(x0, Math.min(yA, yB), x1 - x0, Math.abs(yB - yA));
          ctx.restore();
        }
        /* level lines + labels */
        ctx.save();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.textBaseline = "middle";
        for (const lvl of sorted) {
          const price = p1 + (p0 - p1) * lvl.value;
          const ly = this.priceToY(price, pane);
          if (ly === null) continue;
          ctx.strokeStyle = lvl.color;
          ctx.beginPath();
          ctx.moveTo(x0, ly + 0.5);
          ctx.lineTo(x1, ly + 0.5);
          ctx.stroke();
          if (st.showLabels) {
            ctx.fillStyle = lvl.color;
            const label = `${lvl.value} — ${this.fmt(price)}`;
            ctx.fillText(label, x0 - ctx.measureText(label).width - 8, ly);
          }
        }
        ctx.restore();
        break;
      }
      case "longPosition": case "shortPosition": {
        this.renderPosition(ctx, d, pts, pane);
        break;
      }
      case "fibExtension": {
        const [a, b, c] = pts;
        if (!a || !b) break;
        // legs: a→b is the measured move; projections start at c (or b).
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = this.hexA(st.color, 0.7);
        this.line(ctx, a, b);
        if (c) this.line(ctx, b, c);
        ctx.restore();

        const origin = c ?? b;
        const move = d.points[1].price - d.points[0].price;
        const op = d.points[c ? 2 : 1].price;
        const x0 = Math.min(a.x, b.x, origin.x), x1 = Math.max(a.x, b.x, origin.x);
        const levels = (d.fibLevels ?? DEFAULT_FIB_LEVELS).filter((l) => l.enabled);
        ctx.save();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.textBaseline = "middle";
        for (const lvl of levels) {
          const price = op + move * lvl.value;
          const ly = this.priceToY(price, pane);
          if (ly === null) continue;
          ctx.strokeStyle = lvl.color;
          ctx.beginPath();
          ctx.moveTo(x0, ly + 0.5);
          ctx.lineTo(x1, ly + 0.5);
          ctx.stroke();
          if (st.showLabels) {
            ctx.fillStyle = lvl.color;
            const label = `${lvl.value} — ${this.fmt(price)}`;
            ctx.fillText(label, x1 + 8, ly);
          }
        }
        ctx.restore();
        break;
      }
      default:
        break;
    }

    /* selection / hover handles */
    if ((d.selected || hovered) && !d.locked) {
      ctx.setLineDash([]);
      for (const p of pts) {
        if (!p) continue;
        this.handle(ctx, p.x, p.y, st.color);
      }
    }
    /* lock badge */
    if (d.selected && d.locked) {
      const p = pts.find((q) => q !== null);
      if (p) this.lockBadge(ctx, p.x + 10, p.y - 12);
    }
    ctx.setLineDash([]);
  }

  private renderPosition(
    ctx: CanvasRenderingContext2D,
    d: Drawing,
    pts: Array<{ x: number; y: number } | null>,
    pane: PaneInfo
  ): void {
    const p = d.positionData;
    const [a, b] = pts;
    if (!p || !a || !b) return;
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    const yE = this.priceToY(p.entryPrice, pane);
    const ySL = this.priceToY(p.stopLoss, pane);
    const yTP = this.priceToY(p.takeProfit, pane);
    if (yE === null || ySL === null || yTP === null) return;

    const green = "#089981", red = "#F23645";
    ctx.save();
    /* profit zone */
    ctx.fillStyle = this.hexA(green, 0.14);
    ctx.fillRect(x0, Math.min(yE, yTP), x1 - x0, Math.abs(yTP - yE));
    /* loss zone */
    ctx.fillStyle = this.hexA(red, 0.14);
    ctx.fillRect(x0, Math.min(yE, ySL), x1 - x0, Math.abs(ySL - yE));
    /* boundary lines */
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#B2B5BE";
    ctx.beginPath(); ctx.moveTo(x0, yE + 0.5); ctx.lineTo(x1, yE + 0.5); ctx.stroke();
    ctx.strokeStyle = green;
    ctx.beginPath(); ctx.moveTo(x0, yTP + 0.5); ctx.lineTo(x1, yTP + 0.5); ctx.stroke();
    ctx.strokeStyle = red;
    ctx.beginPath(); ctx.moveTo(x0, ySL + 0.5); ctx.lineTo(x1, ySL + 0.5); ctx.stroke();

    /* info chips */
    const rr = p.risk > 0 ? (p.reward / p.risk) : 0;
    const long = d.tool === "longPosition";
    const dirLabel = long ? "Long" : "Short";
    this.chipLabel(ctx, x0 + 4, yE, `${dirLabel} · ${this.fmt(p.entryPrice)}${p.quantity != null ? ` · Qty ${this.fmt(p.quantity)}` : ""}`, "#1E222D", "#D1D4DC");
    this.chipLabel(ctx, x0 + 4, yTP, `Target ${this.fmt(p.takeProfit)} (+${this.fmt(p.reward)}) · RR ${rr.toFixed(2)}`, this.hexA(green, 0.9), "#FFFFFF");
    this.chipLabel(ctx, x0 + 4, ySL, `Stop ${this.fmt(p.stopLoss)} (−${this.fmt(p.risk)})`, this.hexA(red, 0.9), "#FFFFFF");
    ctx.restore();
  }

  private renderMeasure(
    ctx: CanvasRenderingContext2D,
    p0: DrawingPoint,
    p1: DrawingPoint,
    pane: PaneInfo
  ): void {
    const a = { x: this.timeToX(num(p0.time)), y: this.priceToY(p0.price, pane) };
    const b = { x: this.timeToX(num(p1.time)), y: this.priceToY(p1.price, pane) };
    if (a.x === null || a.y === null || b.x === null || b.y === null) return;
    const up = p1.price >= p0.price;
    const col = up ? "#089981" : "#F23645";
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);

    ctx.save();
    ctx.fillStyle = this.hexA(col, 0.14);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
    /* center arrow */
    const cx = (a.x + b.x) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, a.y); ctx.lineTo(cx, b.y);
    ctx.stroke();
    this.arrowHead(ctx, { x: cx, y: a.y }, { x: cx, y: b.y }, 7, col);

    /* stats box */
    const dPrice = p1.price - p0.price;
    const pct = p0.price !== 0 ? (dPrice / p0.price) * 100 : 0;
    const bars = Math.round((num(p1.time) - num(p0.time)) / this.intervalSec);
    const dur = this.fmtDuration(Math.abs(num(p1.time) - num(p0.time)));
    const lines = [
      `${dPrice >= 0 ? "+" : ""}${this.fmt(dPrice)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`,
      `${bars} bars · ${dur}`,
    ];
    ctx.font = "11px 'JetBrains Mono', monospace";
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
    const h = lines.length * 16 + 10;
    const bx = Math.min(Math.max(4, (x0 + x1) / 2 - w / 2), this.container.clientWidth - w - 4);
    const by = (up ? y0 - h - 8 : y1 + 8);
    ctx.fillStyle = col;
    this.roundRect(ctx, bx, Math.max(pane.top + 2, by), w, h, 4);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "top";
    lines.forEach((l, i) => ctx.fillText(l, bx + 8, Math.max(pane.top + 2, by) + 6 + i * 16));
    ctx.restore();
  }

  /* ── canvas micro-helpers ────────────────────────────────────── */

  private line(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }): void {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  private applyDash(ctx: CanvasRenderingContext2D, style: number, lw: number): void {
    if (style === 1) ctx.setLineDash([lw, lw * 1.5]);        // dotted
    else if (style === 2) ctx.setLineDash([lw * 4, lw * 3]); // dashed
    else if (style === 3) ctx.setLineDash([lw * 8, lw * 3]); // large dashed
    else ctx.setLineDash([]);
  }

  private handle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  private lockBadge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.fillStyle = "#363A45";
    this.roundRect(ctx, x - 2, y - 2, 14, 14, 3);
    ctx.fill();
    ctx.strokeStyle = "#D1D4DC";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([]);
    ctx.strokeRect(x + 2, y + 5, 6, 4);
    ctx.beginPath();
    ctx.arc(x + 5, y + 5, 2.2, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
  }

  private arrowHead(
    ctx: CanvasRenderingContext2D,
    a: { x: number; y: number },
    b: { x: number; y: number },
    size: number,
    color?: string
  ): void {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.save();
    if (color) ctx.fillStyle = color;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - size * Math.cos(ang - 0.45), b.y - size * Math.sin(ang - 0.45));
    ctx.lineTo(b.x - size * Math.cos(ang + 0.45), b.y - size * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private chipLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    bg: string,
    fg: string
  ): void {
    ctx.save();
    ctx.font = "10px 'JetBrains Mono', monospace";
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = bg;
    this.roundRect(ctx, x, y - 8, w, 16, 3);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 6, y + 0.5);
    ctx.restore();
  }

  private priceTag(ctx: CanvasRenderingContext2D, plotW: number, y: number, text: string, color: string): void {
    ctx.save();
    ctx.font = "10px 'JetBrains Mono', monospace";
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = color;
    this.roundRect(ctx, plotW - w - 4, y - 8, w, 16, 2);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "middle";
    ctx.fillText(text, plotW - w + 1, y + 0.5);
    ctx.restore();
  }

  private hexA(hex: string, alpha: number): string {
    if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex;
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** Locale-proof formatter — toLocaleString can throw on exotic system
   *  locales and this runs inside overlay paint + crosshair callbacks. */
  private fmt(v: number): string {
    if (!Number.isFinite(v)) return "—";
    const neg = v < 0 ? "-" : "";
    const f = Math.abs(v).toFixed(this.digits);
    const [i, d] = f.split(".");
    const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return d ? `${neg}${g}.${d}` : `${neg}${g}`;
  }

  private fmtDuration(sec: number): string {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}m`;
    if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
    return `${(sec / 86400).toFixed(1)}d`;
  }

  /* ═══════════════════════ screenshot ═════════════════════════════ */

  /** Chart bitmap + drawing overlay composited into one canvas. */
  screenshotCanvas(): HTMLCanvasElement {
    const shot = this.chart.takeScreenshot();
    const out = document.createElement("canvas");
    out.width = shot.width;
    out.height = shot.height;
    const c = out.getContext("2d")!;
    c.fillStyle = this.settings.backgroundColor;
    c.fillRect(0, 0, out.width, out.height);
    c.drawImage(shot, 0, 0);
    c.drawImage(this.overlay, 0, 0, out.width, out.height);
    return out;
  }

  /* ═════════════════════════ teardown ═════════════════════════════ */

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clearHistoryPending();
    if (this.stretchDebounce !== null) clearTimeout(this.stretchDebounce);
    this.resizeObserver.disconnect();
    this.container.removeEventListener("pointerdown", this.hPointerDown, true);
    this.container.removeEventListener("pointermove", this.hPointerMove);
    this.container.removeEventListener("pointerup", this.hPointerUp);
    this.container.removeEventListener("dblclick", this.hDblClick, true);
    this.container.removeEventListener("contextmenu", this.hContextMenu, true);
    try { this.chart.unsubscribeCrosshairMove(this.hCrosshair); } catch { /* already gone */ }
    try { this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.hRange); } catch { /* already gone */ }
    if (this.btMarkersPlugin) { try { this.btMarkersPlugin.detach(); } catch {} }
    try { this.overlay.remove(); } catch { /* noop */ }
    try { this.chart.remove(); } catch { /* already removed */ }
  }
}
