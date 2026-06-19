// ═══════════════════════════════════════════════════════════════════
// protocol.ts — the Trex SuperChart wire protocol (formal contract)
// ═══════════════════════════════════════════════════════════════════
// The terminal is a pure DISPLAY client: it never computes market data.
// Everything — candles, indicator values, drawings — arrives over this
// protocol from a data source (a real trading backend, or the bundled
// mock server). This file is the single source of truth for that
// contract: every message, in both directions, as a discriminated union.
//
// Design goals:
//   • Strong typing — `type` is the discriminant, so a `switch (msg.type)`
//     narrows each branch to exactly its payload (no more `any` bag).
//   • Versioning — PROTOCOL_VERSION lets a server and client negotiate.
//   • Validation — lightweight runtime guards for the untrusted boundary.
//   • Back-compat — legacy aliases (init/snapshot, bar/tick/update) are
//     preserved so existing servers keep working.
// ═══════════════════════════════════════════════════════════════════

import type {
  OHLC,
  PointData,
  SeriesDefinition,
  Drawing,
  ChartSettings,
  ChartType,
} from "./types";

/**
 * Wire-protocol version. Bump the MAJOR when a breaking change lands;
 * the MINOR for additive, backward-compatible message types/fields.
 * The client sends this in `hello`; a server may reject on MAJOR mismatch.
 */
export const PROTOCOL_VERSION = "2.0.0" as const;

/** Toast severities a server can raise on the client. */
export type ToastSeverity = "info" | "success" | "warning" | "error";

// ───────────────────────────────────────────────────────────────────
// CLIENT → SERVER
// ───────────────────────────────────────────────────────────────────

/** Handshake — first frame the client sends after the socket opens. */
export interface HelloMessage {
  type: "hello";
  client: string;          // e.g. "trex-terminal"
  version: string;         // client app version
  protocol: string;        // PROTOCOL_VERSION
}

/** Keep-alive; the server must answer with {@link PongMessage}. */
export interface PingMessage {
  type: "ping";
  /** client send-time (ms) — echoed in pong to derive RTT. */
  t?: number;
}

/** Request older candles when the view nears the left edge. */
export interface HistoryRequestMessage {
  type: "history";
  before: number;          // unix-seconds; return bars strictly older
  count: number;           // page size hint
}

/** User changed the symbol — server should answer with a fresh snapshot. */
export interface SymbolRequestMessage {
  type: "symbol";
  symbol: string;
}

/** User changed the timeframe — server should answer with a fresh snapshot. */
export interface TimeframeRequestMessage {
  type: "timeframe";
  timeframe: string;
}

/** Informational: the user switched chart type (candles/heikin/line/…). */
export interface ChartTypeRequestMessage {
  type: "chartType";
  chartType: ChartType;
}

/** A drawing was created or edited locally — sync to the server. */
export interface DrawingUpsertMessage {
  type: "drawing_upsert";
  drawing: Drawing;
}

/** A drawing was deleted locally. */
export interface DrawingDeleteMessage {
  type: "drawing_delete";
  drawingId: string;
}

/** All drawings were cleared locally. */
export interface DrawingsClearMessage {
  type: "drawings_clear";
}

/** Full drawings replacement (after undo/redo or bulk edits). */
export interface DrawingsSyncMessage {
  type: "drawings";
  drawings: Drawing[];
}

/** Every message the client may send to the server. */
export type ClientMessage =
  | HelloMessage
  | PingMessage
  | HistoryRequestMessage
  | SymbolRequestMessage
  | TimeframeRequestMessage
  | ChartTypeRequestMessage
  | DrawingUpsertMessage
  | DrawingDeleteMessage
  | DrawingsClearMessage
  | DrawingsSyncMessage;

// ───────────────────────────────────────────────────────────────────
// SERVER → CLIENT
// ───────────────────────────────────────────────────────────────────

/**
 * Initial payload for a symbol/timeframe. `snapshot` and `init` are
 * synonyms (init is the legacy name) and carry identical shapes.
 */
export interface SnapshotMessage {
  type: "snapshot" | "init";
  data: OHLC[];                                   // candle history
  symbol?: string;
  timeframe?: string;
  digits?: number;                                // price precision
  definitions?: SeriesDefinition[];               // indicator series shapes
  points?: Record<string, PointData[]>;           // series data keyed by def.key
  drawings?: Drawing[];                           // server-persisted drawings
}

/** Full candle replacement (rare; e.g. a server-side correction). */
export interface CandlesMessage {
  type: "candles";
  data: OHLC[];
}

/**
 * Reply to a history request. An empty array OR `noMoreHistory: true`
 * means there is nothing older to load.
 */
export interface HistoryReplyMessage {
  type: "history";
  data: OHLC[];
  noMoreHistory?: boolean;
}

/**
 * Realtime bar. `bar` / `tick` / `update` are synonyms. If `bar.time`
 * equals the last candle it updates in place; a newer time appends.
 */
export interface BarMessage {
  type: "bar" | "tick" | "update";
  bar: OHLC;
}

/** Define / redefine the indicator series the chart should show. */
export interface DefinitionsMessage {
  type: "definitions";
  definitions: SeriesDefinition[];
}

/**
 * Indicator series data. A single-element array updates only the tail
 * (the O(1) realtime fast path); a longer array replaces the series.
 */
export interface IndicatorsMessage {
  type: "indicators";
  points: Record<string, PointData[]>;
}

/** Remotely patch the symbol / timeframe label shown in the UI. */
export interface SymbolUpdateMessage { type: "symbol"; symbol: string }
export interface TimeframeUpdateMessage { type: "timeframe"; timeframe: string }

/** Remotely switch the chart type. */
export interface ChartTypeUpdateMessage { type: "chartType"; chartType: ChartType }

/** Remotely patch appearance settings. */
export interface SettingsMessage {
  type: "settings";
  settings: Partial<ChartSettings>;
}

/** Remotely toggle magnet mode. */
export interface MagnetMessage { type: "magnet"; magnet: boolean }

/** View controls the server can drive. */
export interface FitContentMessage { type: "fitContent" }
export interface ScrollToEndMessage { type: "scrollToEnd" }
export interface ZoomRangeMessage {
  type: "zoomRange";
  zoomRange: { from: number; to: number };       // unix-second bounds
}

/** Drawing sync from the server (never echoed back to it). */
export interface DrawingsSetMessage {
  type: "drawings" | "drawing_set";
  drawings: Drawing[];
}
export interface DrawingUpsertFromServer {
  type: "drawing" | "drawing_upsert";
  drawing: Drawing;
}
export interface DrawingDeleteFromServer {
  type: "drawing_delete";
  drawingId?: string;
  drawingIds?: string[];
}
export interface DrawingsClearFromServer { type: "drawings_clear" }

/** A toast notification raised by the server. */
export interface ToastMessage {
  type: "toast";
  message: string;
  toastType?: ToastSeverity;
}

/** An error the server wants surfaced to the user. */
export interface ErrorMessage {
  type: "error";
  message: string;
}

/** Keep-alive reply; carries back the client's ping timestamp. */
export interface PongMessage {
  type: "pong";
  t?: number;
}

/** Every message the server may send to the client. */
export type ServerMessage =
  | SnapshotMessage
  | CandlesMessage
  | HistoryReplyMessage
  | BarMessage
  | DefinitionsMessage
  | IndicatorsMessage
  | SymbolUpdateMessage
  | TimeframeUpdateMessage
  | ChartTypeUpdateMessage
  | SettingsMessage
  | MagnetMessage
  | FitContentMessage
  | ScrollToEndMessage
  | ZoomRangeMessage
  | DrawingsSetMessage
  | DrawingUpsertFromServer
  | DrawingDeleteFromServer
  | DrawingsClearFromServer
  | ToastMessage
  | ErrorMessage
  | PongMessage;

/** Any protocol frame, either direction. */
export type ProtocolMessage = ClientMessage | ServerMessage;

// ───────────────────────────────────────────────────────────────────
// Runtime validation — the WebSocket boundary is untrusted, so a single
// cheap guard rejects malformed frames before they reach the pipeline.
// ───────────────────────────────────────────────────────────────────

/** True when `x` is a non-null object with a string `type` field. */
export function isProtocolMessage(x: unknown): x is ProtocolMessage {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { type?: unknown }).type === "string" &&
    (x as { type: string }).type.length > 0
  );
}

/** The complete set of server→client message type strings. */
export const SERVER_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "snapshot", "init", "candles", "history", "bar", "tick", "update",
  "definitions", "indicators", "symbol", "timeframe", "chartType",
  "settings", "magnet", "fitContent", "scrollToEnd", "zoomRange",
  "drawings", "drawing_set", "drawing", "drawing_upsert", "drawing_delete",
  "drawings_clear", "toast", "error", "pong",
]);

/** The complete set of client→server message type strings. */
export const CLIENT_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "hello", "ping", "history", "symbol", "timeframe", "chartType",
  "drawing_upsert", "drawing_delete", "drawings_clear", "drawings",
]);

/** True when `type` is a recognised server→client message. */
export function isKnownServerType(type: string): boolean {
  return SERVER_MESSAGE_TYPES.has(type);
}

/** Build the standard handshake frame. */
export function makeHello(client: string, version: string): HelloMessage {
  return { type: "hello", client, version, protocol: PROTOCOL_VERSION };
}

/**
 * Parse + validate a raw text frame from the socket. Returns the typed
 * message on success, or null if the frame is not valid JSON or not a
 * recognisable protocol message. Never throws.
 */
export function parseServerFrame(raw: string): ServerMessage | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isProtocolMessage(obj)) return null;
  if (!isKnownServerType(obj.type)) return null;
  return obj as ServerMessage;
}

// ───────────────────────────────────────────────────────────────────
// SeriesDefinition — display-contract validation & normalization
// ───────────────────────────────────────────────────────────────────
// A definition describes HOW to render one data series. Servers vary in
// how completely they fill it out, so we validate the essentials and
// normalize the rest to safe defaults before the renderer sees it. This
// keeps the engine simple (it can assume every field is present and sane)
// and protects against a server omitting or mistyping fields.

/** The series kinds the renderer can draw. */
export const VALID_SERIES_KINDS: ReadonlySet<string> = new Set([
  "line", "histogram", "area", "baseline", "scatter",
]);

/** Defaults applied to any missing/invalid SeriesDefinition field. */
export const SERIES_DEFINITION_DEFAULTS = {
  lineWidth: 2,
  lineStyle: 0,
  subPaneHeight: 120,
  scaleMargins: { top: 0.1, bottom: 0.1 },
  digits: 2,
  visible: true,
  color: "#2962FF",
} as const;

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * True when `d` has the minimum fields a definition needs to be usable:
 * a key, a label, a known series kind, and a pane placement. Everything
 * else can be defaulted by {@link normalizeSeriesDefinition}.
 */
export function isValidSeriesDefinition(d: unknown): d is SeriesDefinition {
  if (typeof d !== "object" || d === null) return false;
  const o = d as Record<string, unknown>;
  return (
    isStr(o.key) &&
    isStr(o.label) &&
    isStr(o.type) &&
    VALID_SERIES_KINDS.has(o.type as string) &&
    (o.pane === "main" || o.pane === "sub")
  );
}

/**
 * Fill every optional/missing field of a (already-valid) definition with
 * a sane default, so the renderer can treat all fields as present. Pure;
 * returns a new object. `paneId` defaults to the key for main-pane series
 * and `pane_<key>` for sub-pane series (the convention the engine uses).
 */
export function normalizeSeriesDefinition(d: SeriesDefinition): SeriesDefinition {
  const D = SERIES_DEFINITION_DEFAULTS;
  const pane = d.pane === "sub" ? "sub" : "main";
  return {
    key: d.key,
    label: d.label,
    pane,
    paneId: isStr(d.paneId) ? d.paneId : pane === "main" ? d.key : `pane_${d.key}`,
    type: d.type,
    color: isStr(d.color) ? d.color : D.color,
    colorPos: d.colorPos,
    colorNeg: d.colorNeg,
    lineWidth: isNum(d.lineWidth) ? d.lineWidth : D.lineWidth,
    lineStyle: isNum(d.lineStyle) ? d.lineStyle : D.lineStyle,
    subPaneHeight: isNum(d.subPaneHeight) ? d.subPaneHeight : D.subPaneHeight,
    scaleMargins:
      d.scaleMargins && isNum(d.scaleMargins.top) && isNum(d.scaleMargins.bottom)
        ? d.scaleMargins
        : { ...D.scaleMargins },
    digits: isNum(d.digits) ? d.digits : D.digits,
    visible: d.visible !== false,
    levels: Array.isArray(d.levels) ? d.levels : undefined,
    baseValue: d.baseValue,
    topColor: d.topColor,
    bottomColor: d.bottomColor,
    priceLineVisible: d.priceLineVisible,
    lastValueVisible: d.lastValueVisible,
    meta: d.meta,
  };
}

/**
 * Validate + normalize an array of incoming definitions, silently
 * dropping any that fail the minimum-fields check. This is the single
 * entry point the app should use for server-supplied definitions.
 */
export function sanitizeDefinitions(defs: unknown): SeriesDefinition[] {
  if (!Array.isArray(defs)) return [];
  const out: SeriesDefinition[] = [];
  for (const d of defs) {
    if (isValidSeriesDefinition(d)) out.push(normalizeSeriesDefinition(d));
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────
// OHLC + history — live-data contract validation
// ───────────────────────────────────────────────────────────────────
// Candles arrive continuously from an untrusted source. One malformed
// bar (NaN price, missing field, high < low) would corrupt the series
// and the indicator alignment that depends on it, so every bar is
// validated at the boundary before it reaches the engine.

/**
 * True when `b` is a structurally valid OHLC bar:
 *   • a finite numeric time and OHLC prices,
 *   • high ≥ max(open, close) and low ≤ min(open, close),
 *   • volume, when present, finite and non-negative.
 * Note: `time` may be a number (unix-seconds) or a lightweight-charts
 * business-day/time object; we only require a finite numeric coercion.
 */
export function isValidBar(b: unknown): b is OHLC {
  if (typeof b !== "object" || b === null) return false;
  const o = b as Record<string, unknown>;
  const t = Number(o.time);
  if (!Number.isFinite(t)) return false;
  const { open, high, low, close } = o as Record<string, number>;
  if (![open, high, low, close].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return false;
  }
  if (high < Math.max(open, close) || low > Math.min(open, close)) return false;
  if (o.volume !== undefined && (typeof o.volume !== "number" || !Number.isFinite(o.volume) || o.volume < 0)) {
    return false;
  }
  return true;
}

/**
 * Filter a candle array to structurally valid bars, sorted ascending by
 * time with duplicate timestamps collapsed (last-write-wins). This is
 * what snapshot/candles/history payloads should pass through before the
 * engine ingests them — guaranteeing the strictly-increasing, unique
 * time domain the renderer and drawing anchors rely on.
 */
export function sanitizeCandles(data: unknown): OHLC[] {
  if (!Array.isArray(data)) return [];
  const valid = data.filter(isValidBar) as OHLC[];
  valid.sort((a, b) => Number(a.time) - Number(b.time));
  // collapse duplicate timestamps (keep the latest occurrence)
  const out: OHLC[] = [];
  for (const bar of valid) {
    const last = out[out.length - 1];
    if (last && Number(last.time) === Number(bar.time)) out[out.length - 1] = bar;
    else out.push(bar);
  }
  return out;
}

/** A history page reply; `noMoreHistory` (or an empty array) ends paging. */
export interface HistoryPage {
  data: OHLC[];
  noMoreHistory: boolean;
}

/**
 * Normalize a history reply into a clean page: sanitized candles plus a
 * definitive `noMoreHistory` flag. An empty/whitespace reply is treated
 * as "nothing older exists", which the engine latches so it stops asking.
 */
export function sanitizeHistory(data: unknown, noMoreHistory?: boolean): HistoryPage {
  const candles = sanitizeCandles(data);
  return { data: candles, noMoreHistory: noMoreHistory === true || candles.length === 0 };
}

/** True when `p` is a usable indicator point: finite time + value. */
export function isValidPoint(p: unknown): p is PointData {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    Number.isFinite(Number(o.time)) &&
    typeof o.value === "number" &&
    Number.isFinite(o.value) &&
    (o.color === undefined || typeof o.color === "string")
  );
}

/**
 * Filter an indicator-series point array to valid points, preserving the
 * optional per-point `color` (server-driven conditional coloring). Unlike
 * candles, points are NOT sorted/deduped here: a series may legitimately
 * carry gaps, and the engine keys them by time on ingest.
 */
export function sanitizePoints(points: unknown): PointData[] {
  if (!Array.isArray(points)) return [];
  const out: PointData[] = [];
  for (const p of points) {
    if (isValidPoint(p)) {
      const o = p as PointData;
      out.push(o.color ? { time: o.time, value: o.value, color: o.color } : { time: o.time, value: o.value });
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────
// Drawing validation — drawings sync both ways with the server, so an
// incoming drawing (remoteSet / remoteUpsert) is validated before it
// reaches the renderer. A drawing with an unknown tool or too few points
// would render nothing (or throw), so it's dropped at the boundary.
// ───────────────────────────────────────────────────────────────────

/** Every drawing tool the engine can render, with its required point count. */
export const DRAWING_MIN_POINTS: Record<string, number> = {
  trendline: 2, ray: 2, extended: 2, horizontal: 1, vertical: 1,
  fibRetracement: 2, fibExtension: 3, rectangle: 2, ellipse: 2, parallelChannel: 3,
  text: 1, arrow: 2, measure: 2, longPosition: 2, shortPosition: 2,
  polyline: 2,
};

/** The set of tool names a drawing may legitimately carry. */
export const VALID_DRAWING_TOOLS: ReadonlySet<string> = new Set(
  Object.keys(DRAWING_MIN_POINTS)
);

/**
 * True when `d` is a renderable drawing: a string id, a known tool, and at
 * least the minimum number of points that tool needs. Other fields (style,
 * paneId, flags) are normalized later by the engine, so they're optional
 * here.
 */
export function isValidDrawing(d: unknown): d is Drawing {
  if (typeof d !== "object" || d === null) return false;
  const o = d as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id.length === 0) return false;
  if (typeof o.tool !== "string" || !VALID_DRAWING_TOOLS.has(o.tool)) return false;
  if (!Array.isArray(o.points)) return false;
  const min = DRAWING_MIN_POINTS[o.tool] ?? 1;
  if (o.points.length < min) return false;
  // each point must have a finite time and price
  for (const p of o.points as Array<Record<string, unknown>>) {
    if (typeof p !== "object" || p === null) return false;
    if (!Number.isFinite(Number(p.time))) return false;
    if (typeof p.price !== "number" || !Number.isFinite(p.price)) return false;
  }
  return true;
}

/** Validate an array of incoming drawings, dropping any that fail. */
export function sanitizeDrawings(drawings: unknown): Drawing[] {
  if (!Array.isArray(drawings)) return [];
  return drawings.filter(isValidDrawing) as Drawing[];
}
