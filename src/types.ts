// ═══════════════════════════════════════════════════════════════════
// Trex Chart Types
// ═══════════════════════════════════════════════════════════════════

import type { Time } from "lightweight-charts";

export type SeriesKind = "line" | "histogram" | "area" | "baseline" | "scatter";
export type PaneType = "main" | "sub";

export interface LevelDef {
  value: number;
  color: string;
  lineStyle: number;
  label: string;
}

// ── Indicator Builder calc metadata ─────────────────────────────
// A SeriesDefinition can optionally carry a `meta.calc` block which
// tells the client how to compute the series from raw candles. Server
// supplied definitions usually omit it (the server streams the points
// itself); definitions exported from the Indicator Builder include it
// so the terminal can evaluate them locally in any mode.

export type PriceSource = "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "volume";
export type CalcTransform = "raw" | "sma" | "ema" | "wma" | "rsi" | "momentum" | "stddev";

export interface CalcSpec {
  source: PriceSource;
  transform: CalcTransform;
  period: number;
}

/**
 * SeriesDefinition — the authoritative DISPLAY contract.
 *
 * This is the heart of the display-first terminal: it tells the renderer
 * HOW to draw one data series that the data source streams. The terminal
 * never computes values — a definition only describes appearance, scale
 * and placement; the matching data arrives separately as PointData[]
 * keyed by `key`.
 *
 * A server (or the Indicator Builder export) sends an array of these in
 * the `definitions` field of a snapshot/definitions message.
 */
export interface SeriesDefinition {
  /** Unique id; the series' data arrives under this key in `points`. */
  key: string;
  /** Human label shown in the legend. */
  label: string;
  /** "main" overlays the price pane; "sub" gets its own pane below. */
  pane: PaneType;
  /** Series sharing a paneId render in the same pane (e.g. MACD trio). */
  paneId: string;
  /** Visual form: line | histogram | area | baseline | scatter. */
  type: SeriesKind;
  /** Primary color (line color / histogram bar / area line). */
  color: string;
  /** histogram & baseline: color for values ≥ 0 / above base. */
  colorPos?: string;
  /** histogram & baseline: color for values < 0 / below base. */
  colorNeg?: string;
  /** Line thickness in px (1–4). */
  lineWidth: number;
  /** 0 solid · 1 dotted · 2 dashed · 3 large-dashed · 4 sparse-dotted. */
  lineStyle: number;
  /** sub panes only: preferred pane height in px. */
  subPaneHeight: number;
  /** Vertical padding of this series' price scale (0–1 fractions). */
  scaleMargins: { top: number; bottom: number };
  /** Price precision (decimal places) for axis + legend formatting. */
  digits: number;
  /** Whether the series is drawn (toggled from the Indicators panel). */
  visible: boolean;
  /** Optional horizontal guide lines (e.g. RSI 30/70). */
  levels?: LevelDef[];
  /** Baseline series only: the price that splits top/bottom areas. */
  baseValue?: number;
  /** Baseline series only: line/fill colors above and below baseValue. */
  topColor?: string;
  bottomColor?: string;
  /** Show the dashed price line at the last value (default false). */
  priceLineVisible?: boolean;
  /** Show the last value tag on the price axis (default true). */
  lastValueVisible?: boolean;
  /** Optional client-side computation recipe (Indicator Builder). */
  meta?: { calc?: CalcSpec; builder?: string };
}

export interface OHLC {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * One data point of an indicator series, keyed by time.
 *
 * `color` is optional and enables SERVER-DRIVEN CONDITIONAL COLORING:
 * when present it overrides the series' base color for just this point.
 * The server can thus encode meaning per-point (e.g. a histogram bar
 * tinted by regime, or a line that shifts color across a threshold)
 * without the terminal computing anything — it simply renders the color
 * it was sent.
 */
export interface PointData {
  time: Time;
  value: number;
  /** Optional per-point color override (server-driven). */
  color?: string;
}

export type ChartType = "candles" | "heikin" | "line" | "area" | "bars";

export const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "candles", label: "Candles" },
  { value: "heikin", label: "Heikin Ashi" },
  { value: "bars", label: "Bars" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
];

export interface WSMessage {
  type: string;
  // Market data
  definitions?: SeriesDefinition[];
  data?: any;
  bar?: any;
  points?: Record<string, PointData[]>;
  // History paging (client → server request and server → client reply)
  before?: number;
  count?: number;
  noMoreHistory?: boolean;
  // Drawings
  drawings?: Drawing[];
  drawing?: Drawing;
  drawingId?: string;
  drawingIds?: string[];
  drawingStyle?: Partial<DrawingStyle>;
  drawingText?: string;
  drawingPoints?: DrawingPoint[];
  positionData?: Partial<PositionData>;
  // Chart control
  chartType?: string;
  timeframe?: string;
  symbol?: string;
  digits?: number;
  settings?: Partial<ChartSettings>;
  magnet?: boolean;
  // View control
  fitContent?: boolean;
  scrollToEnd?: boolean;
  zoomRange?: { from: number; to: number };
  // Toast / alerts
  message?: string;
  toastType?: string;
}

export type DrawingTool =
  | "cursor"
  | "crosshair"
  | "trendline"
  | "horizontal"
  | "vertical"
  | "ray"
  | "extended"
  | "fibRetracement"
  | "fibExtension"
  | "rectangle"
  | "ellipse"
  | "parallelChannel"
  | "text"
  | "arrow"
  | "measure"
  | "longPosition"
  | "shortPosition"
  | "polyline";

export interface DrawingPoint {
  time: Time;
  price: number;
}

export interface DrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: number;
  fillColor: string;
  fillOpacity: number;
  fontSize: number;
  showLabels: boolean;
  extendLeft: boolean;
  extendRight: boolean;
}

export interface PositionData {
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  risk: number;
  reward: number;
}

export interface FibLevel {
  value: number;
  color: string;
  enabled: boolean;
}

export const DEFAULT_FIB_LEVELS: FibLevel[] = [
  { value: 0,     color: "#787B86", enabled: true },
  { value: 0.236, color: "#F44336", enabled: true },
  { value: 0.382, color: "#E91E63", enabled: true },
  { value: 0.5,   color: "#9C27B0", enabled: true },
  { value: 0.618, color: "#2196F3", enabled: true },
  { value: 0.786, color: "#00BCD4", enabled: true },
  { value: 1,     color: "#4CAF50", enabled: true },
  { value: 1.272, color: "#FF9800", enabled: false },
  { value: 1.618, color: "#FF5722", enabled: false },
  { value: 2.618, color: "#795548", enabled: false },
  { value: 3.618, color: "#607D8B", enabled: false },
];

export interface Drawing {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  style: DrawingStyle;
  text?: string;
  paneId: string;
  locked: boolean;
  visible: boolean;
  completed: boolean;
  selected: boolean;
  positionData?: PositionData;
  fibLevels?: FibLevel[];
  /**
   * Where this object came from. "local" = the user drew it (editable,
   * never sent anywhere). "server" = it arrived from the data source like
   * an indicator series and is rendered read-only — the user can't move
   * or delete it, because its data is owned by the server.
   */
  origin?: "local" | "server";
}

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: "#2962FF",
  lineWidth: 1,
  lineStyle: 0,
  fillColor: "#2962FF",
  fillOpacity: 0.12,
  fontSize: 13,
  showLabels: true,
  extendLeft: false,
  extendRight: false,
};

export type ConnectionMode = "demo" | "server";

export type CandleStyle = "solid" | "hollow" | "hollow-all";

export interface ChartSettings {
  wsUrl: string;
  mode: ConnectionMode;
  symbol: string;
  timeframe: string;
  showGrid: boolean;
  showVolume: boolean;
  showCrosshair: boolean;
  candleUpColor: string;
  candleDownColor: string;
  backgroundColor: string;
  gridColor: string;
  candleStyle: CandleStyle;
}

export const DEFAULT_SETTINGS: ChartSettings = {
  wsUrl: "ws://localhost:8765",
  mode: "demo",
  symbol: "BTCUSDT",
  timeframe: "1m",
  showGrid: true,
  showVolume: true,
  showCrosshair: true,
  candleUpColor: "#00C9A7",
  candleDownColor: "#FF6B8A",
  backgroundColor: "#0B0F1A",
  gridColor: "rgba(255,255,255,0.03)",
  candleStyle: "hollow",
};

export interface CandleTheme {
  label: string;
  up: string;
  down: string;
  bg: string;
  grid: string;
}

export const CANDLE_THEMES: CandleTheme[] = [
  { label: "Classic",  up: "#089981", down: "#F23645", bg: "#131722", grid: "rgba(42,46,57,0.55)" },
  { label: "Midnight", up: "#00C9A7", down: "#FF6B8A", bg: "#0B0F1A", grid: "rgba(30,40,65,0.7)" },
  { label: "Neon",     up: "#00FFB3", down: "#FF3366", bg: "#0D0D1A", grid: "rgba(0,255,179,0.08)" },
  { label: "Gold",     up: "#F5A623", down: "#8B5CF6", bg: "#0F1117", grid: "rgba(245,166,35,0.1)" },
  { label: "Ice",      up: "#60A5FA", down: "#F87171", bg: "#0A1628", grid: "rgba(96,165,250,0.12)" },
];

export const DRAWING_COLORS = [
  "#2962FF", "#F23645", "#089981", "#FF9800", "#9C27B0",
  "#00BCD4", "#E91E63", "#FF5722", "#84cc16", "#14b8a6",
  "#6366f1", "#d946ef", "#0ea5e9", "#22c55e", "#FCD535",
  "#a855f7", "#e11d48", "#0891b2", "#65a30d", "#c026d3",
  "#ffffff", "#B2B5BE", "#787B86", "#434651",
];

export const TIMEFRAMES = [
  { label: "1s", value: "1s" },
  { label: "1m", value: "1m" },
  { label: "3m", value: "3m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "30m", value: "30m" },
  { label: "1H", value: "1h" },
  { label: "2H", value: "2h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
  { label: "1M", value: "1M" },
];

/** Seconds per timeframe token, e.g. "1m" → 60. */
export function timeframeToSeconds(tf: string): number {
  const m = /^(\d+)([smhdwM])$/.exec(tf);
  if (!m) return 60;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 3600;
    case "d": return n * 86400;
    case "w": return n * 604800;
    case "M": return n * 2592000;
    default: return 60;
  }
}

export interface PaneState {
  /** logical index at the left edge of this pane's last view */
  from?: number;
  /** logical index at the right edge */
  to?: number;
  /** pane height in px, when detached from auto-stretch */
  height?: number;
}
