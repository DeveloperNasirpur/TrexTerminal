// ═══════════════════════════════════════════════════════════════════
// Trex Terminal — Application Shell
// ═══════════════════════════════════════════════════════════════════
// Pixel-faithful TradingView-style layout:
//
//   ┌──────────────────── TopBar ─────────────────────┐
//   │ symbol · TF · type · indicators · … · status     │
//   ├───┬──────────────────────────────────────────────┤
//   │ L │                                              │
//   │ e │              Chart + overlay                 │
//   │ f │   (legend, floating toolbar, menus, toasts)  │
//   │ t │                                              │
//   ├───┴──────────────────────────────────────────────┤
//   │                   StatusBar                      │
//   └──────────────────────────────────────────────────┘
//
// Architectural rules enforced here:
//   • The ChartEngine lives in a ref — React NEVER re-renders on the
//     60 fps path. Crosshair legend values, the floating-toolbar
//     position and FPS are written to the DOM imperatively.
//   • Demo and Server feeds emit identical WSMessage objects into ONE
//     `handleMessage` pipeline, so switching modes can't race.
//   • Undo/redo is a snapshot stack fed by engine commit events; the
//     same events drive WebSocket drawing sync (remote ops never echo).
// ═══════════════════════════════════════════════════════════════════

import {
  Fragment,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
  type ReactNode,
  type CSSProperties,
} from "react";
import { jsPDF } from "jspdf";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  BaselineSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";

import {
  ChartEngine,
  type CrosshairPayload,
  type SelectionMeta,
  type SelectionBox,
  type DrawingsCommit,
  type PaneLayoutEntry,
} from "./chartEngine";
import { WSClient } from "./wsClient";
import { BtPanel, type BtState } from "./BtPanel";
import {
  makeHello,
  PROTOCOL_VERSION,
  sanitizeDefinitions,
  sanitizeCandles,
  sanitizeHistory,
  sanitizePoints,
  sanitizeDrawings,
  isValidBar,
  isValidPoint,
  isValidDrawing,
} from "./protocol";

/** This terminal's app version, advertised in the handshake. */
const APP_VERSION = PROTOCOL_VERSION;

/** Visible build marker in the status bar — lets you confirm at a glance
 *  that you've loaded the latest file (bump on each shipped change). */
const BUILD_TAG = "0613-DOCS8";
import { DemoFeed } from "./mockServer";
import { loadWorkspace, saveWorkspace, type WorkspaceState } from "./persistence";
import {
  DEMO_SYMBOLS,
  INDICATOR_REGISTRY,
  computeCalc,
  generateDemoCandles,
  type IndicatorSpec,
} from "./marketData";
import {
  type WSMessage,
  type ChartSettings,
  type ChartType,
  type DrawingTool,
  type DrawingStyle,
  type SeriesDefinition,
  type SeriesKind,
  type Drawing,
  type FibLevel,
  type CalcSpec,
  type PriceSource,
  type CalcTransform,
  type OHLC,
  type PointData,
  DEFAULT_SETTINGS,
  DRAWING_COLORS,
  TIMEFRAMES,
  CHART_TYPES,
  timeframeToSeconds,
} from "./types";
import {
  IconCursor, IconCrosshair, IconTrendline, IconHorizontal, IconVertical,
  IconRay, IconExtended, IconFibonacci, IconRectangle, IconText, IconArrow,
  IconMeasure, IconTrash, IconSettings, IconIndicator, IconFullscreen,
  IconCamera, IconUndo, IconRedo, IconZoomIn, IconZoomOut, IconFitContent, IconLayout,
  IconLock, IconUnlock, IconEye, IconEyeOff, IconX, IconCandle, IconMagnet, IconStar, IconEllipse, IconChannel, IconFibExtension, IconScatter,
  IconPolyline, IconPosition, IconLineChart, IconAreaChart, IconBarsChart,
  IconHeikin, IconBuilder, IconSearch, IconCopy, IconDownload, IconClone,
  IconChevronDown, IconCheck, IconArrowLeft, IconGrip, IconBaseline,
  IconHistogram, IconServer, IconPlay,
} from "./icons";

/* ═══════════════════════════ utilities ════════════════════════════ */

/** Tiny classnames combiner. */
const cn = (...xs: Array<string | false | null | undefined>) =>
  xs.filter(Boolean).join(" ");

/** Locale-proof "1,234.56" formatter — never throws inside chart callbacks. */
const fmtNum = (v: number, digits = 2) => {
  if (!Number.isFinite(v)) return "—";
  const neg = v < 0 ? "-" : "";
  const f = Math.abs(v).toFixed(digits);
  const [i, d] = f.split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d ? `${neg}${g}.${d}` : `${neg}${g}`;
};

/**
 * Detect the natural price precision from a sample of candles.
 * Finds the minimum number of decimal places that exactly represents
 * the prices (using floating-point tolerance), then returns the max
 * observed across the sample — giving the chart tick-accurate formatting.
 */
function detectPriceDigits(candles: { close: number; open?: number }[]): number {
  if (!candles.length) return 2;
  const sample = candles.slice(-50);
  let maxD = 0;
  for (const c of sample) {
    for (const price of [c.close, c.open ?? c.close]) {
      if (!price || !Number.isFinite(price) || price <= 0) continue;
      for (let d = 0; d <= 8; d++) {
        const scale = Math.pow(10, d);
        if (Math.abs(Math.round(price * scale) / scale - price) < price * 1e-9) {
          if (d > maxD) maxD = d;
          break;
        }
      }
    }
  }
  return Math.max(2, Math.min(8, maxD));
}

const fmtCompact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return v.toFixed(2);
};

const nowStamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/**
 * Close-on-outside-click for menus & popovers.
 *
 * The containment test runs against the menu's PARENT wrapper (which
 * also holds the toggle button). Without this, pressing the toggle of
 * an open menu fired the window-level close first and the click then
 * re-opened it — making menus impossible to dismiss from their own
 * button. Escape closes too (captured, so global shortcuts stay put).
 */
function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const root = ref.current ? ref.current.parentElement ?? ref.current : null;
      if (root && !root.contains(e.target as Node)) onClose();
    };
    // NOTE: Escape is handled centrally by the app-level keyboard handler,
    // NOT here. When several menus/popovers/modals are mounted at once,
    // each instance used to bind its own capture-phase Escape listener;
    // the first to fire called stopPropagation and swallowed the event,
    // so the component the user actually meant to close stayed open. One
    // authority for Escape removes that race entirely.
    window.addEventListener("pointerdown", down, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
    };
  }, [open, onClose]);
  return ref;
}

/* ═══════════════════════════ toasts ═══════════════════════════════ */
// Module-level pub/sub: any code (engine callbacks, WS handler, menus)
// can fire a toast without prop drilling or context re-renders.

type ToastKind = "info" | "success" | "error" | "warning";
interface ToastItem { id: number; text: string; kind: ToastKind }

let toastSeq = 1;
let toastPush: ((t: ToastItem) => void) | null = null;

export function showToast(text: string, kind: ToastKind = "info") {
  toastPush?.({ id: toastSeq++, text, kind });
}

function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    toastPush = (t) => {
      setItems((xs) => [...xs.slice(-4), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3200);
    };
    return () => { toastPush = null; };
  }, []);
  const colors: Record<ToastKind, string> = {
    info: "border-[#2962FF]",
    success: "border-[#089981]",
    error: "border-[#F23645]",
    warning: "border-[#FF9800]",
  };
  return (
    <div className="absolute top-3 right-3 z-[60] flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "trex-toast pointer-events-auto min-w-[200px] max-w-[340px] rounded-md border-l-[3px]",
            "bg-[#1E222D] px-3 py-2 text-[12px] text-[#D1D4DC] shadow-lg shadow-black/40",
            colors[t.kind]
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════ tool metadata ═══════════════════════════ */

interface ToolMeta { tool: DrawingTool; label: string; icon: ReactNode; shortcut?: string }

const TOOL_META: Record<DrawingTool, ToolMeta> = {
  cursor:        { tool: "cursor",        label: "Cursor",          icon: <IconCursor /> },
  crosshair:     { tool: "crosshair",     label: "Crosshair",       icon: <IconCrosshair /> },
  trendline:     { tool: "trendline",     label: "Trend Line",      icon: <IconTrendline />, shortcut: "Alt+T" },
  ray:           { tool: "ray",           label: "Ray",             icon: <IconRay /> },
  extended:      { tool: "extended",      label: "Extended Line",   icon: <IconExtended /> },
  horizontal:    { tool: "horizontal",    label: "Horizontal Line", icon: <IconHorizontal />, shortcut: "Alt+H" },
  vertical:      { tool: "vertical",      label: "Vertical Line",   icon: <IconVertical />, shortcut: "Alt+V" },
  polyline:      { tool: "polyline",      label: "Polyline",        icon: <IconPolyline /> },
  arrow:         { tool: "arrow",         label: "Arrow",           icon: <IconArrow /> },
  fibRetracement:{ tool: "fibRetracement",label: "Fib Retracement", icon: <IconFibonacci />, shortcut: "Alt+F" },
  fibExtension:  { tool: "fibExtension",  label: "Fib Extension",   icon: <IconFibExtension /> },
  rectangle:     { tool: "rectangle",     label: "Rectangle",       icon: <IconRectangle />, shortcut: "Alt+R" },
  ellipse:       { tool: "ellipse",       label: "Ellipse",         icon: <IconEllipse /> },
  parallelChannel:{ tool: "parallelChannel", label: "Parallel Channel", icon: <IconChannel /> },
  text:          { tool: "text",          label: "Text",            icon: <IconText /> },
  measure:       { tool: "measure",       label: "Measure",         icon: <IconMeasure /> },
  longPosition:  { tool: "longPosition",  label: "Long Position",   icon: <IconPosition /> },
  shortPosition: { tool: "shortPosition", label: "Short Position",  icon: <span className="rotate-180 inline-flex"><IconPosition /></span> },
};

/** Left-rail groups — each remembers the last-used tool (TV behavior). */
const TOOL_GROUPS: { id: string; tools: DrawingTool[] }[] = [
  { id: "pointer",  tools: ["cursor", "crosshair"] },
  { id: "lines",    tools: ["trendline", "ray", "extended", "horizontal", "vertical", "polyline", "arrow"] },
  { id: "fib",      tools: ["fibRetracement", "fibExtension"] },
  { id: "shapes",   tools: ["rectangle", "ellipse", "parallelChannel"] },
  { id: "annotate", tools: ["text", "measure"] },
  { id: "position", tools: ["longPosition", "shortPosition"] },
];

const CHART_TYPE_ICON: Record<ChartType, ReactNode> = {
  candles: <IconCandle />,
  heikin: <IconHeikin />,
  bars: <IconBarsChart />,
  line: <IconLineChart />,
  area: <IconAreaChart />,
};

const FAVORITE_TFS = ["1m", "5m", "15m", "1h", "4h", "1d"];

/* ═════════════════════ small UI primitives ════════════════════════ */

function IconBtn(props: {
  tip?: string;
  tipPos?: "bottom" | "right";
  active?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  children: ReactNode;
  className?: string;
  danger?: boolean;
}) {
  const { tip, tipPos, active, disabled, onClick, children, className, danger } = props;
  return (
    <button
      type="button"
      data-tip={tip}
      data-tip-pos={tipPos}
      aria-label={typeof tip === "string" ? tip : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative flex h-[34px] min-w-[34px] items-center justify-center rounded-[3px] px-1.5",
        "text-[#B2B5BE] transition-colors duration-100",
        "hover:bg-[#2A2E39] hover:text-[#D1D4DC]",
        active && "bg-[rgba(41,98,255,0.18)] text-[#2962FF] hover:bg-[rgba(41,98,255,0.24)] hover:text-[#2962FF]",
        danger && "hover:text-[#F23645]",
        disabled && "opacity-35 pointer-events-none",
        className
      )}
    >
      {children}
    </button>
  );
}

function VSep() { return <div className="mx-1.5 h-[18px] w-px bg-[#2A2E39]" />; }

function Menu(props: {
  open: boolean;
  onClose: () => void;
  anchor?: "left" | "right";
  width?: number;
  children: ReactNode;
  className?: string;
}) {
  const ref = useOutsideClose(props.open, props.onClose);
  if (!props.open) return null;
  return (
    <div
      ref={ref}
      style={{ width: props.width }}
      className={cn(
        "trex-menu absolute top-[calc(100%+6px)] z-50 overflow-hidden rounded-md",
        "border border-[#363A45] bg-[#1E222D] py-1 shadow-xl shadow-black/50",
        props.anchor === "right" ? "right-0" : "left-0",
        props.className
      )}
    >
      {props.children}
    </div>
  );
}

function MenuItem(props: {
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-[7px] text-left text-[12.5px]",
        "text-[#D1D4DC] transition-colors hover:bg-[#2A2E39]",
        props.active && "text-[#2962FF]",
        props.danger && "text-[#F23645] hover:bg-[rgba(242,54,69,0.12)]"
      )}
    >
      {props.icon && <span className="flex h-5 w-5 shrink-0 items-center justify-center opacity-80">{props.icon}</span>}
      <span className="flex-1 truncate">{props.children}</span>
      {props.right && <span className="ml-3 shrink-0 text-[11px] text-[#787B86]">{props.right}</span>}
    </button>
  );
}

function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[#787B86]">{children}</div>;
}

function Modal(props: { open: boolean; onClose: () => void; title: string; width?: number; children: ReactNode; footer?: ReactNode }) {
  if (!props.open) return null;
  return (
    <div
      className="trex-fade absolute inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-[1px]"
      onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div
        className="trex-menu flex max-h-[85%] flex-col overflow-hidden rounded-lg border border-[#363A45] bg-[#1E222D] shadow-2xl shadow-black/60"
        style={{ width: props.width ?? 440 }}
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#2A2E39] px-4">
          <span className="text-[13px] font-semibold text-[#D1D4DC]">{props.title}</span>
          <IconBtn tip="Close" onClick={props.onClose}><IconX /></IconBtn>
        </div>
        <div className="trex-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">{props.children}</div>
        {props.footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#2A2E39] px-4 py-3">{props.footer}</div>}
      </div>
    </div>
  );
}

function Btn(props: { onClick?: () => void; primary?: boolean; danger?: boolean; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        "h-8 rounded px-3.5 text-[12.5px] font-medium transition-colors",
        props.primary
          ? "bg-[#2962FF] text-white hover:bg-[#1E53E5]"
          : props.danger
          ? "bg-[rgba(242,54,69,0.14)] text-[#F23645] hover:bg-[rgba(242,54,69,0.22)]"
          : "bg-[#2A2E39] text-[#D1D4DC] hover:bg-[#363A45]",
        props.disabled && "opacity-40 pointer-events-none",
        props.className
      )}
    >
      {props.children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[11px] font-medium text-[#787B86]">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-8 w-full rounded border border-[#363A45] bg-[#131722] px-2.5 text-[12.5px] text-[#D1D4DC] " +
  "outline-none transition-colors focus:border-[#2962FF] font-mono";

function ColorSwatchGrid({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1.5 p-1">
      {DRAWING_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          className={cn(
            "h-5 w-5 rounded-[4px] border transition-transform hover:scale-110",
            value.toLowerCase() === c.toLowerCase() ? "border-white" : "border-black/30"
          )}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-1.5 text-[12.5px] text-[#D1D4DC]"
    >
      <span>{label}</span>
      <span className={cn(
        "relative h-[18px] w-[32px] rounded-full transition-colors",
        checked ? "bg-[#2962FF]" : "bg-[#363A45]"
      )}>
        <span className={cn(
          "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all",
          checked ? "left-[16px]" : "left-[2px]"
        )} />
      </span>
    </button>
  );
}

/* ═══════════════════════════ Top Bar ══════════════════════════════ */

interface TopBarProps {
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  magnet: boolean;
  canUndo: boolean;
  canRedo: boolean;
  connLabel: string;
  connColor: string;
  latency: number | null;
  mode: "demo" | "server";
  wsUrl: string;
  serverSymbols: Array<{ symbol: string; name?: string }>;
  onSymbol: (s: string) => void;
  onTimeframe: (tf: string) => void;
  onChartType: (t: ChartType) => void;
  onToggleMagnet: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenIndicators: () => void;
  onOpenBuilder: () => void;
  onOpenSettings: () => void;
  onScreenshot: (kind: "copy" | "png" | "pdf") => void;
  onFullscreen: () => void;
  layout: "single" | "split2" | "grid4";
  onLayout: (l: "single" | "split2" | "grid4") => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onSwitchMode: (mode: "demo" | "server", url?: string) => void;
}

function TopBar(p: TopBarProps) {
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [shotOpen, setShotOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const [symQuery, setSymQuery] = useState("");
  const [urlDraft, setUrlDraft] = useState(p.wsUrl);

  useEffect(() => setUrlDraft(p.wsUrl), [p.wsUrl]);

  // In server mode use symbols received from server; fall back to demo symbols
  const symbolPool = p.mode === "server" && p.serverSymbols.length > 0
    ? p.serverSymbols
    : DEMO_SYMBOLS;
  const filteredSyms = symbolPool.filter((s) =>
    s.symbol.toLowerCase().includes(symQuery.trim().toLowerCase())
  );

  return (
    <div className="nb-topbar relative z-40 flex h-[40px] shrink-0 items-center gap-0.5 border-b border-[#2A2E39] bg-[#131722] px-1.5">
      {/* ── Trex brand logo ── */}
      <div className="mr-1 flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-br from-[#f0b90b] to-[#fcd535] shadow-[0_4px_12px_rgba(240,185,11,0.35)]">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="#0b0e11" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3,17 9,11 13,15 21,7" />
          <polyline points="17,7 21,7 21,11" />
        </svg>
      </div>
      {/* ── symbol ── */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setSymbolOpen((v) => !v)}
          className="flex h-[34px] items-center gap-1.5 rounded-[3px] px-2.5 text-[13px] font-bold text-[#D1D4DC] hover:bg-[#2A2E39]"
        >
          <IconSearch />
          {p.symbol}
        </button>
        <Menu open={symbolOpen} onClose={() => setSymbolOpen(false)} width={240}>
          <div className="px-2 pb-1 pt-1.5">
            <input
              autoFocus
              value={symQuery}
              onChange={(e) => setSymQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && symQuery.trim()) {
                  p.onSymbol(symQuery.trim().toUpperCase());
                  setSymbolOpen(false); setSymQuery("");
                }
              }}
              placeholder="Search symbol…"
              className={inputCls}
            />
          </div>
          <MenuLabel>{p.mode === "demo" ? "Demo symbols" : "Symbols"}</MenuLabel>
          {filteredSyms.map((s) => (
            <MenuItem
              key={s.symbol}
              active={s.symbol === p.symbol}
              onClick={() => { p.onSymbol(s.symbol); setSymbolOpen(false); setSymQuery(""); }}
              right={s.symbol === p.symbol ? <IconCheck /> : undefined}
            >
              <span className="flex-1">{s.symbol}</span>
              {(s as any).name && <span className="ml-2 text-[10px] text-[#787B86] truncate max-w-[80px]">{(s as any).name}</span>}
            </MenuItem>
          ))}
          {symQuery.trim() && !filteredSyms.some((s) => s.symbol === symQuery.trim().toUpperCase()) && (
            <MenuItem onClick={() => { p.onSymbol(symQuery.trim().toUpperCase()); setSymbolOpen(false); setSymQuery(""); }}>
              Use “{symQuery.trim().toUpperCase()}”
            </MenuItem>
          )}
        </Menu>
      </div>

      <VSep />

      {/* ── timeframes: favorites inline + full dropdown ── */}
      <div className="flex items-center gap-px">
        {FAVORITE_TFS.map((tf) => {
          const meta = TIMEFRAMES.find((t) => t.value === tf)!;
          return (
            <button
              key={tf}
              type="button"
              onClick={() => p.onTimeframe(tf)}
              className={cn(
                "h-[34px] min-w-[30px] rounded-[3px] px-2 text-[12px] font-semibold transition-colors",
                p.timeframe === tf
                  ? "bg-[rgba(41,98,255,0.18)] text-[#2962FF]"
                  : "text-[#B2B5BE] hover:bg-[#2A2E39] hover:text-[#D1D4DC]"
              )}
            >
              {meta.label}
            </button>
          );
        })}
        <div className="relative">
          <button
            type="button"
            onClick={() => setTfOpen((v) => !v)}
            className={cn(
              "flex h-[34px] items-center gap-0.5 rounded-[3px] px-1.5 text-[12px] font-semibold",
              !FAVORITE_TFS.includes(p.timeframe)
                ? "bg-[rgba(41,98,255,0.18)] text-[#2962FF]"
                : "text-[#787B86] hover:bg-[#2A2E39] hover:text-[#D1D4DC]"
            )}
          >
            {!FAVORITE_TFS.includes(p.timeframe)
              ? TIMEFRAMES.find((t) => t.value === p.timeframe)?.label ?? p.timeframe
              : ""}
            <IconChevronDown />
          </button>
          <Menu open={tfOpen} onClose={() => setTfOpen(false)} width={150}>
            <MenuLabel>Timeframe</MenuLabel>
            {TIMEFRAMES.map((t) => (
              <MenuItem
                key={t.value}
                active={t.value === p.timeframe}
                onClick={() => { p.onTimeframe(t.value); setTfOpen(false); }}
                right={t.value === p.timeframe ? <IconCheck /> : undefined}
              >
                {t.label}
              </MenuItem>
            ))}
          </Menu>
        </div>
      </div>

      <VSep />

      {/* ── chart type ── */}
      <div className="relative">
        <IconBtn tip="Chart type" onClick={() => setTypeOpen((v) => !v)} active={typeOpen}>
          {CHART_TYPE_ICON[p.chartType]}
          <span className="ml-1"><IconChevronDown /></span>
        </IconBtn>
        <Menu open={typeOpen} onClose={() => setTypeOpen(false)} width={170}>
          {CHART_TYPES.map((t) => (
            <MenuItem
              key={t.value}
              active={t.value === p.chartType}
              icon={CHART_TYPE_ICON[t.value]}
              onClick={() => { p.onChartType(t.value); setTypeOpen(false); }}
              right={t.value === p.chartType ? <IconCheck /> : undefined}
            >
              {t.label}
            </MenuItem>
          ))}
        </Menu>
      </div>

      {/* ── indicators ── */}
      <button
        type="button"
        onClick={p.onOpenIndicators}
        className="flex h-[34px] items-center gap-1.5 rounded-[3px] px-2.5 text-[12.5px] font-medium text-[#B2B5BE] hover:bg-[#2A2E39] hover:text-[#D1D4DC]"
      >
        <IconIndicator />
        Indicators
      </button>

      <IconBtn tip="Indicator Builder" onClick={p.onOpenBuilder}><IconBuilder /></IconBtn>

      <VSep />

      <IconBtn tip="Magnet mode (M)" active={p.magnet} onClick={p.onToggleMagnet}><IconMagnet /></IconBtn>
      <IconBtn tip="Undo (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo}><IconUndo /></IconBtn>
      <IconBtn tip="Redo (Ctrl+Y)" disabled={!p.canRedo} onClick={p.onRedo}><IconRedo /></IconBtn>

      <div className="flex-1" />

      {/* ── right cluster ── */}
      <IconBtn tip="Zoom in" onClick={p.onZoomIn}><IconZoomIn /></IconBtn>
      <IconBtn tip="Zoom out" onClick={p.onZoomOut}><IconZoomOut /></IconBtn>
      <IconBtn tip="Fit content" onClick={p.onFit}><IconFitContent /></IconBtn>

      <VSep />

      <div className="relative">
        <IconBtn tip="Screenshot" onClick={() => setShotOpen((v) => !v)} active={shotOpen}><IconCamera /></IconBtn>
        <Menu open={shotOpen} onClose={() => setShotOpen(false)} anchor="right" width={210}>
          <MenuItem icon={<IconCopy />} onClick={() => { p.onScreenshot("copy"); setShotOpen(false); }}>Copy image</MenuItem>
          <MenuItem icon={<IconDownload />} onClick={() => { p.onScreenshot("png"); setShotOpen(false); }}>Save PNG</MenuItem>
          <MenuItem icon={<IconDownload />} onClick={() => { p.onScreenshot("pdf"); setShotOpen(false); }}>Export PDF</MenuItem>
        </Menu>
      </div>

      <div className="relative">
        <IconBtn tip="Chart layout" onClick={() => setLayoutOpen((v) => !v)} active={p.layout !== "single" || layoutOpen}><IconLayout /></IconBtn>
        <Menu open={layoutOpen} onClose={() => setLayoutOpen(false)} anchor="right" width={180}>
          <MenuItem active={p.layout === "single"} onClick={() => { p.onLayout("single"); setLayoutOpen(false); }}>Single chart</MenuItem>
          <MenuItem active={p.layout === "split2"} onClick={() => { p.onLayout("split2"); setLayoutOpen(false); }}>Two charts (side by side)</MenuItem>
          <MenuItem active={p.layout === "grid4"} onClick={() => { p.onLayout("grid4"); setLayoutOpen(false); }}>Four charts (2×2 grid)</MenuItem>
        </Menu>
      </div>

      <IconBtn tip="Fullscreen (double-click chart)" onClick={p.onFullscreen}><IconFullscreen /></IconBtn>
      <IconBtn tip="Chart settings" onClick={p.onOpenSettings}><IconSettings /></IconBtn>

      <VSep />

      {/* ── connection pill ── */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setConnOpen((v) => !v)}
          className="flex h-[30px] items-center gap-1.5 rounded-full border border-[#2A2E39] bg-[#1E222D] px-2.5 text-[11px] font-semibold text-[#B2B5BE] hover:border-[#363A45]"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: p.connColor, boxShadow: `0 0 6px ${p.connColor}` }} />
          {p.connLabel}
          {p.latency !== null && <span className="font-mono text-[#787B86]">{p.latency}ms</span>}
          <IconChevronDown />
        </button>
        <Menu open={connOpen} onClose={() => setConnOpen(false)} anchor="right" width={272}>
          <MenuLabel>Data source</MenuLabel>
          <MenuItem
            icon={<IconPlay />}
            active={p.mode === "demo"}
            right={p.mode === "demo" ? <IconCheck /> : undefined}
            onClick={() => { p.onSwitchMode("demo"); setConnOpen(false); }}
          >
            Demo simulation
          </MenuItem>
          <div className="px-3 pb-2 pt-1.5">
            <div className="mb-1 flex items-center gap-1.5 text-[12.5px] text-[#D1D4DC]">
              <span className="flex w-[18px] justify-center opacity-80"><IconServer /></span>
              WebSocket server
              {p.mode === "server" && <span className="ml-auto text-[#2962FF]"><IconCheck /></span>}
            </div>
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="ws://localhost:8765"
              className={inputCls}
              onKeyDown={(e) => { if (e.key === "Enter") { p.onSwitchMode("server", urlDraft.trim()); setConnOpen(false); } }}
            />
            <Btn primary className="mt-2 w-full" onClick={() => { p.onSwitchMode("server", urlDraft.trim()); setConnOpen(false); }}>
              Connect
            </Btn>
          </div>
        </Menu>
      </div>
    </div>
  );
}

/* ═══════════════════ Floating favorites toolbar ═══════════════════ */

/**
 * A draggable horizontal toolbar that floats over the chart and shows the
 * user's starred drawing tools — the way TradingView surfaces favorites.
 * It only appears when at least one tool is starred, and can be dragged
 * anywhere over the chart by its grip handle.
 */
function FloatingFavorites(props: {
  favorites: DrawingTool[];
  tool: DrawingTool;
  onTool: (t: DrawingTool) => void;
  onUnstar: (t: DrawingTool) => void;
}) {
  const [pos, setPos] = useState({ x: 64, y: 64 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  if (props.favorites.length === 0) return null;

  const onGripDown = (e: React.MouseEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      setPos({ x: Math.max(8, ev.clientX - drag.current.dx), y: Math.max(8, ev.clientY - drag.current.dy) });
    };
    const up = () => { drag.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      className="trex-menu nb-floating absolute z-30 flex items-center gap-0.5 rounded-md border border-[#363A45] bg-[#1E222D] p-1"
      style={{ left: pos.x, top: pos.y }}
    >
      <span
        onMouseDown={onGripDown}
        className="flex h-[30px] w-4 cursor-grab items-center justify-center text-[#56585f] hover:text-[#9598A1] active:cursor-grabbing"
        title="Drag to move"
      >
        <IconGrip />
      </span>
      {props.favorites.map((t) => {
        const m = TOOL_META[t];
        return (
          <button
            key={`ff-${t}`}
            type="button"
            data-tip={m.label + (m.shortcut ? ` (${m.shortcut})` : "")}
            data-tip-pos="bottom"
            aria-label={m.label}
            onClick={() => props.onTool(t)}
            onContextMenu={(e) => { e.preventDefault(); props.onUnstar(t); }}
            className={cn(
              "flex h-[30px] w-[30px] items-center justify-center rounded-[4px] transition-colors duration-100",
              props.tool === t
                ? "bg-[rgba(41,98,255,0.16)] text-[#2962FF]"
                : "text-[#B2B5BE] hover:bg-[#2A2E39] hover:text-[#D1D4DC]"
            )}
          >
            {m.icon}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════ Left Bar ═════════════════════════════ */

function LeftBar(props: {
  tool: DrawingTool;
  magnet: boolean;
  hasDrawings: boolean;
  allLocked: boolean;
  allHidden: boolean;
  favorites: DrawingTool[];
  onToggleFavorite: (t: DrawingTool) => void;
  onTool: (t: DrawingTool) => void;
  onToggleMagnet: () => void;
  onLockAll: () => void;
  onHideAll: () => void;
  onClearAll: () => void;
}) {
  const [lastUsed, setLastUsed] = useState<Record<string, DrawingTool>>(
    () => Object.fromEntries(TOOL_GROUPS.map((g) => [g.id, g.tools[0]]))
  );
  const [flyout, setFlyout] = useState<string | null>(null);
  const flyoutRef = useOutsideClose(flyout !== null, () => setFlyout(null));

  // Favorites are owned by the App so a floating toolbar can show them too.
  const favorites = props.favorites;
  const toggleFavorite = props.onToggleFavorite;

  const pick = (groupId: string, tool: DrawingTool) => {
    setLastUsed((m) => ({ ...m, [groupId]: tool }));
    props.onTool(tool);
    setFlyout(null);
  };

  return (
    <div className="nb-leftbar relative z-30 flex w-[44px] shrink-0 flex-col items-center border-r border-[#2A2E39] bg-[#131722] py-1">
      {TOOL_GROUPS.map((g, gi) => {
        const current = lastUsed[g.id];
        const meta = TOOL_META[current];
        const activeInGroup = g.tools.includes(props.tool);
        // TradingView separates the cursor group from the drawing tools
        // (and forecasting/position tools) with thin dividers; draw one
        // before each group that opens a new logical section.
        const dividerBefore = g.id === "lines" || g.id === "fib" || g.id === "position";
        return (
          <Fragment key={g.id}>
            {dividerBefore && <div className="my-1 h-px w-6 bg-[#2A2E39]" />}
            <div className="relative">
            <button
              type="button"
              data-tip={meta.label + (meta.shortcut ? ` (${meta.shortcut})` : "")}
              data-tip-pos="right"
              aria-label={meta.label}
              onClick={() => { props.onTool(current); setFlyout(null); }}
              onContextMenu={(e) => { e.preventDefault(); if (g.tools.length > 1) setFlyout(g.id); }}
              className={cn(
                "relative flex h-[34px] w-[34px] items-center justify-center rounded-[4px] transition-colors duration-100",
                activeInGroup
                  ? "bg-[rgba(41,98,255,0.16)] text-[#2962FF]"
                  : "text-[#B2B5BE] hover:bg-[#2A2E39] hover:text-[#D1D4DC]"
              )}
            >
              {meta.icon}
              {g.tools.length > 1 && (
                <span
                  role="button"
                  aria-label={`More ${g.id} tools`}
                  onClick={(e) => { e.stopPropagation(); setFlyout(flyout === g.id ? null : g.id); }}
                  className="absolute bottom-0 right-0 flex h-[13px] w-[13px] items-end justify-end rounded-tl-[3px] hover:bg-[rgba(255,255,255,0.08)]"
                >
                  <span className="mb-[2px] mr-[2px] h-0 w-0 border-b-[5px] border-l-[5px] border-b-[#9598A1] border-l-transparent" />
                </span>
              )}
            </button>

            {flyout === g.id && (
              <div
                ref={flyoutRef}
                className="trex-menu absolute left-[40px] z-50 min-w-[200px] rounded-md border border-[#363A45] bg-[#1E222D] py-1 shadow-xl shadow-black/50"
                style={{ top: Math.min(0, -gi * 4) }}
              >
                {g.tools.map((t) => {
                  const m = TOOL_META[t];
                  const isFav = favorites.includes(t);
                  return (
                    <div key={t} className="group/mi flex items-center">
                      <button
                        type="button"
                        onClick={() => pick(g.id, t)}
                        className={cn(
                          "flex flex-1 items-center gap-3 px-3 py-[7px] text-left text-[12.5px]",
                          "text-[#D1D4DC] transition-colors hover:bg-[#2A2E39]",
                          props.tool === t && "text-[#2962FF]"
                        )}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center opacity-80">{m.icon}</span>
                        <span className="flex-1 truncate">{m.label}</span>
                        {m.shortcut && <span className="text-[11px] text-[#787B86]">{m.shortcut}</span>}
                      </button>
                      <button
                        type="button"
                        aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(t); }}
                        className={cn(
                          "mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-[#363A45]",
                          isFav ? "text-[#FCD535] opacity-100" : "text-[#787B86] opacity-50 hover:opacity-100"
                        )}
                      >
                        <span className="h-3.5 w-3.5"><IconStar filled={isFav} /></span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </Fragment>
        );
      })}

      <div className="my-1 h-px w-6 bg-[#2A2E39]" />

      <div>
        <IconBtn tip="Magnet mode (M)" tipPos="right" active={props.magnet} onClick={props.onToggleMagnet} className="h-[34px] w-[34px]">
          <IconMagnet />
        </IconBtn>
      </div>

      <div className="flex-1" />

      <div className="mb-1">
        <IconBtn
          tip={props.allLocked ? "Unlock all drawings" : "Lock all drawings"}
          tipPos="right"
          disabled={!props.hasDrawings}
          onClick={props.onLockAll}
          className="h-[34px] w-[34px]"
        >
          {props.allLocked ? <IconLock /> : <IconUnlock />}
        </IconBtn>
      </div>
      <div className="mb-1">
        <IconBtn
          tip={props.allHidden ? "Show all drawings" : "Hide all drawings"}
          tipPos="right"
          disabled={!props.hasDrawings}
          onClick={props.onHideAll}
          className="h-[34px] w-[34px]"
        >
          {props.allHidden ? <IconEyeOff /> : <IconEye />}
        </IconBtn>
      </div>
      <IconBtn
        tip="Remove all drawings"
        tipPos="right"
        danger
        disabled={!props.hasDrawings}
        onClick={props.onClearAll}
        className="h-[34px] w-[34px]"
      >
        <IconTrash />
      </IconBtn>
    </div>
  );
}

/* ═══════════════════════════ Status Bar ═══════════════════════════ */

function StatusBar(props: {
  connLabel: string;
  connColor: string;
  latency: number | null;
  symbol: string;
  timeframe: string;
  hint: string;
  fpsRef: React.RefObject<HTMLSpanElement | null>;
  clockRef: React.RefObject<HTMLSpanElement | null>;
  bars: number;
}) {
  return (
    <div className="nb-statusbar flex h-[28px] shrink-0 items-center gap-3 border-t border-[#2A2E39] bg-[#131722] px-3 text-[11px] text-[#787B86]">
      <span className="flex items-center gap-1.5 font-medium" style={{ color: props.connColor }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: props.connColor }} />
        {props.connLabel}
      </span>
      {props.latency !== null && <span className="font-mono">{props.latency} ms</span>}
      <span className="font-semibold text-[#B2B5BE]">{props.symbol} · {props.timeframe}</span>

      <span className="min-w-0 flex-1 truncate text-center text-[#9598A1]">{props.hint}</span>

      <span className="font-mono">{fmtNum(props.bars, 0)} bars</span>
      <span className="font-mono"><span ref={props.fpsRef}>60</span> fps</span>
      <span className="font-mono text-[#B2B5BE]" ref={props.clockRef} />
      <span className="rounded bg-[#2A2E39] px-1.5 py-px text-[10px] font-semibold tracking-wide text-[#9598A1]">UTC</span>
      <span className="rounded bg-[rgba(41,98,255,0.18)] px-1.5 py-px text-[10px] font-semibold tracking-wide text-[#2962FF]">build {BUILD_TAG}</span>
    </div>
  );
}

/* ═════════════════════════ Legend Overlay ═════════════════════════ */
// All numeric values are written imperatively (refs) from the engine's
// crosshair callback — zero React renders while the mouse moves.

interface LegendRefs {
  o: HTMLSpanElement | null; h: HTMLSpanElement | null;
  l: HTMLSpanElement | null; c: HTMLSpanElement | null;
  chg: HTMLSpanElement | null; vol: HTMLSpanElement | null;
}

function LegendOverlay(props: {
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  defs: SeriesDefinition[];
  paneLayout: PaneLayoutEntry[];
  legendRefs: React.MutableRefObject<LegendRefs>;
  indicatorRefs: React.MutableRefObject<Map<string, HTMLSpanElement>>;
  onRemoveDef: (def: SeriesDefinition) => void;
}) {
  const setIndRef = (key: string) => (el: HTMLSpanElement | null) => {
    if (el) props.indicatorRefs.current.set(key, el);
    else props.indicatorRefs.current.delete(key);
  };
  const mainDefs = props.defs.filter((d) => d.pane === "main");
  const subDefs = props.defs.filter((d) => d.pane === "sub");
  const typeLabel = CHART_TYPES.find((t) => t.value === props.chartType)?.label ?? "";

  /* group sub defs per paneId for per-pane chips */
  const subGroups = new Map<string, SeriesDefinition[]>();
  for (const d of subDefs) {
    const arr = subGroups.get(d.paneId) ?? [];
    arr.push(d);
    subGroups.set(d.paneId, arr);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] select-none">
      {/* ── main pane legend ── */}
      <div className="absolute left-2 top-1.5 flex flex-col gap-[3px]">
        <div className="flex items-baseline gap-2 text-[12px]">
          <span className="text-[13px] font-bold text-[#D1D4DC]">{props.symbol}</span>
          <span className="text-[#787B86]">{props.timeframe}</span>
          <span className="text-[#787B86]">{typeLabel}</span>
          <span className="ml-1 flex gap-2 font-mono text-[11.5px]">
            <span className="text-[#787B86]">O <span ref={(el) => { props.legendRefs.current.o = el; }} className="text-[#D1D4DC]">—</span></span>
            <span className="text-[#787B86]">H <span ref={(el) => { props.legendRefs.current.h = el; }} className="text-[#D1D4DC]">—</span></span>
            <span className="text-[#787B86]">L <span ref={(el) => { props.legendRefs.current.l = el; }} className="text-[#D1D4DC]">—</span></span>
            <span className="text-[#787B86]">C <span ref={(el) => { props.legendRefs.current.c = el; }} className="text-[#D1D4DC]">—</span></span>
            <span ref={(el) => { props.legendRefs.current.chg = el; }} />
            <span className="text-[#787B86]">Vol <span ref={(el) => { props.legendRefs.current.vol = el; }} className="text-[#B2B5BE]">—</span></span>
          </span>
        </div>

        {mainDefs.map((d) => (
          <div key={d.key} className="group pointer-events-auto flex w-fit items-center gap-1.5 rounded px-1 py-px text-[11px] hover:bg-[rgba(30,34,45,0.85)]">
            <span className="h-[3px] w-3 rounded-full" style={{ background: d.color }} />
            <span className="text-[#B2B5BE]">{d.label}</span>
            <span ref={setIndRef(d.key)} className="font-mono text-[#D1D4DC]">—</span>
            <button
              type="button"
              data-tip="Remove"
              onClick={() => props.onRemoveDef(d)}
              className="ml-0.5 hidden h-4 w-4 items-center justify-center rounded text-[#787B86] hover:bg-[#363A45] hover:text-[#F23645] group-hover:flex"
            >
              <IconX />
            </button>
          </div>
        ))}
      </div>

      {/* ── sub-pane legends, pinned to each pane's top edge ── */}
      {[...subGroups.entries()].map(([paneId, defs]) => {
        const entry = props.paneLayout.find((pl) => pl.paneId === paneId);
        if (!entry) return null;
        return (
          <div key={paneId} className="absolute left-2 flex flex-wrap items-center gap-x-3 gap-y-px" style={{ top: entry.top + 4 }}>
            {defs.map((d) => (
              <div key={d.key} className="group pointer-events-auto flex items-center gap-1.5 rounded px-1 py-px text-[11px] hover:bg-[rgba(30,34,45,0.85)]">
                <span className="h-[3px] w-3 rounded-full" style={{ background: d.color }} />
                <span className="text-[#B2B5BE]">{d.label}</span>
                <span ref={setIndRef(d.key)} className="font-mono text-[#D1D4DC]">—</span>
                <button
                  type="button"
                  onClick={() => props.onRemoveDef(d)}
                  className="ml-0.5 hidden h-4 w-4 items-center justify-center rounded text-[#787B86] hover:bg-[#363A45] hover:text-[#F23645] group-hover:flex"
                >
                  <IconX />
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════ Floating drawing toolbar ═════════════════════ */

const LINE_STYLES = [
  { value: 0, label: "Solid",  preview: "————" },
  { value: 2, label: "Dashed", preview: "— — —" },
  { value: 1, label: "Dotted", preview: "· · · ·" },
];

function FloatingToolbar(props: {
  meta: SelectionMeta;
  onStyle: (patch: Partial<DrawingStyle>) => void;
  onClone: () => void;
  onLockToggle: () => void;
  onSettings: () => void;
  onDelete: () => void;
  barRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [pop, setPop] = useState<"color" | "width" | "style" | null>(null);
  const popRef = useOutsideClose(pop !== null, () => setPop(null));
  const m = props.meta;

  return (
    <div
      ref={props.barRef}
      className="trex-menu pointer-events-auto absolute z-40 flex items-center gap-0.5 rounded-md border border-[#363A45] bg-[#1E222D] p-0.5 shadow-xl shadow-black/50 [&_button]:h-7 [&_button]:min-w-[28px]"
      style={{ left: 0, top: 0, visibility: "hidden" }}
    >
      {/* color */}
      <div className="relative">
        <button
          type="button"
          data-tip="Color"
          onClick={() => setPop(pop === "color" ? null : "color")}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#2A2E39]"
        >
          <span className="h-4 w-4 rounded-[4px] border border-black/30" style={{ background: m.style.color }} />
        </button>
        {pop === "color" && (
          <div ref={popRef} className="trex-menu absolute left-0 top-[calc(100%+6px)] w-[196px] rounded-md border border-[#363A45] bg-[#1E222D] p-1 shadow-xl">
            <ColorSwatchGrid value={m.style.color} onPick={(c) => { props.onStyle({ color: c, fillColor: c }); setPop(null); }} />
          </div>
        )}
      </div>

      {/* width */}
      <div className="relative">
        <button
          type="button"
          data-tip="Line width"
          onClick={() => setPop(pop === "width" ? null : "width")}
          className="flex h-7 w-9 items-center justify-center rounded text-[11px] font-semibold text-[#B2B5BE] hover:bg-[#2A2E39]"
        >
          {m.style.lineWidth}px
        </button>
        {pop === "width" && (
          <div ref={popRef} className="trex-menu absolute left-0 top-[calc(100%+6px)] w-[120px] rounded-md border border-[#363A45] bg-[#1E222D] py-1 shadow-xl">
            {[1, 2, 3, 4].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => { props.onStyle({ lineWidth: w }); setPop(null); }}
                className={cn("flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[#2A2E39]", m.style.lineWidth === w && "text-[#2962FF]")}
              >
                <span className="block w-12 rounded bg-current" style={{ height: w }} />
                <span className="text-[11px]">{w}px</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* line style */}
      <div className="relative">
        <button
          type="button"
          data-tip="Line style"
          onClick={() => setPop(pop === "style" ? null : "style")}
          className="flex h-7 w-12 items-center justify-center rounded font-mono text-[10px] tracking-tighter text-[#B2B5BE] hover:bg-[#2A2E39]"
        >
          {LINE_STYLES.find((s) => s.value === m.style.lineStyle)?.preview ?? "————"}
        </button>
        {pop === "style" && (
          <div ref={popRef} className="trex-menu absolute left-0 top-[calc(100%+6px)] w-[130px] rounded-md border border-[#363A45] bg-[#1E222D] py-1 shadow-xl">
            {LINE_STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => { props.onStyle({ lineStyle: s.value }); setPop(null); }}
                className={cn("flex w-full items-center justify-between px-3 py-1.5 text-[11px] hover:bg-[#2A2E39]", m.style.lineStyle === s.value ? "text-[#2962FF]" : "text-[#D1D4DC]")}
              >
                <span>{s.label}</span>
                <span className="font-mono tracking-tighter">{s.preview}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mx-1 h-5 w-px bg-[#2A2E39]" />
      <IconBtn tip="Clone" onClick={props.onClone}><IconClone /></IconBtn>
      <IconBtn tip={m.locked ? "Unlock" : "Lock"} active={m.locked} onClick={props.onLockToggle}>
        {m.locked ? <IconLock /> : <IconUnlock />}
      </IconBtn>
      <IconBtn tip="Settings" onClick={props.onSettings}><IconSettings /></IconBtn>
      <IconBtn tip="Delete (Del)" danger onClick={props.onDelete}><IconTrash /></IconBtn>
    </div>
  );
}

/* ═════════════════════════ Context Menu ═══════════════════════════ */

interface CtxState { x: number; y: number; drawingId: string | null }

function ContextMenu(props: {
  ctx: CtxState;
  locked: boolean;
  hidden: boolean;
  settings: ChartSettings;
  onClose: () => void;
  onEdit: () => void;
  onClone: () => void;
  onLock: () => void;
  onHide: () => void;
  onDelete: () => void;
  onAddHLine: () => void;
  onFit: () => void;
  onResetScale: () => void;
  onToggleGrid: () => void;
  onToggleVolume: () => void;
  onScreenshot: () => void;
  onClearAll: () => void;
}) {
  const ref = useOutsideClose(true, props.onClose);
  const { x, y, drawingId } = props.ctx;
  return (
    <div
      ref={ref}
      className="trex-menu absolute z-50 w-[210px] rounded-md border border-[#363A45] bg-[#1E222D] py-1 shadow-xl shadow-black/50"
      style={{ left: Math.min(x, window.innerWidth - 260), top: y }}
    >
      {drawingId ? (
        <>
          <MenuItem icon={<IconSettings />} onClick={props.onEdit}>Settings…</MenuItem>
          <MenuItem icon={<IconClone />} onClick={props.onClone}>Clone</MenuItem>
          <MenuItem icon={props.locked ? <IconUnlock /> : <IconLock />} onClick={props.onLock}>
            {props.locked ? "Unlock" : "Lock"}
          </MenuItem>
          <MenuItem icon={props.hidden ? <IconEye /> : <IconEyeOff />} onClick={props.onHide}>
            {props.hidden ? "Show" : "Hide"}
          </MenuItem>
          <div className="my-1 h-px bg-[#2A2E39]" />
          <MenuItem icon={<IconTrash />} danger onClick={props.onDelete}>Delete</MenuItem>
        </>
      ) : (
        <>
          <MenuItem icon={<IconHorizontal />} onClick={props.onAddHLine}>Add horizontal line here</MenuItem>
          <div className="my-1 h-px bg-[#2A2E39]" />
          <MenuItem icon={<IconFitContent />} onClick={props.onFit}>Fit content</MenuItem>
          <MenuItem icon={<IconZoomOut />} onClick={props.onResetScale}>Reset price scale</MenuItem>
          <div className="my-1 h-px bg-[#2A2E39]" />
          <MenuItem icon={<IconCheck />} onClick={props.onToggleGrid}>
            {props.settings.showGrid ? "Hide grid" : "Show grid"}
          </MenuItem>
          <MenuItem icon={<IconHistogram />} onClick={props.onToggleVolume}>
            {props.settings.showVolume ? "Hide volume" : "Show volume"}
          </MenuItem>
          <div className="my-1 h-px bg-[#2A2E39]" />
          <MenuItem icon={<IconCamera />} onClick={props.onScreenshot}>Save screenshot</MenuItem>
          <MenuItem icon={<IconTrash />} danger onClick={props.onClearAll}>Remove all drawings</MenuItem>
        </>
      )}
    </div>
  );
}

/* ═════════════════════════ Dialogs ════════════════════════════════ */

function ChartSettingsDialog(props: {
  open: boolean;
  settings: ChartSettings;
  onClose: () => void;
  onChange: (s: ChartSettings) => void;
}) {
  const s = props.settings;
  const set = (patch: Partial<ChartSettings>) => props.onChange({ ...s, ...patch });
  return (
    <Modal open={props.open} onClose={props.onClose} title="Chart settings" width={420}>
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Up color">
          <div className="flex items-center gap-2">
            <input type="color" value={s.candleUpColor} onChange={(e) => set({ candleUpColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-[#363A45] bg-transparent" />
            <input className={inputCls} value={s.candleUpColor} onChange={(e) => set({ candleUpColor: e.target.value })} />
          </div>
        </Field>
        <Field label="Down color">
          <div className="flex items-center gap-2">
            <input type="color" value={s.candleDownColor} onChange={(e) => set({ candleDownColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-[#363A45] bg-transparent" />
            <input className={inputCls} value={s.candleDownColor} onChange={(e) => set({ candleDownColor: e.target.value })} />
          </div>
        </Field>
        <Field label="Background">
          <div className="flex items-center gap-2">
            <input type="color" value={s.backgroundColor} onChange={(e) => set({ backgroundColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-[#363A45] bg-transparent" />
            <input className={inputCls} value={s.backgroundColor} onChange={(e) => set({ backgroundColor: e.target.value })} />
          </div>
        </Field>
        <Field label="Grid color">
          <input className={inputCls} value={s.gridColor} onChange={(e) => set({ gridColor: e.target.value })} />
        </Field>
      </div>
      <div className="mt-1 border-t border-[#2A2E39] pt-2">
        <Toggle label="Show grid" checked={s.showGrid} onChange={(v) => set({ showGrid: v })} />
        <Toggle label="Show volume" checked={s.showVolume} onChange={(v) => set({ showVolume: v })} />
        <Toggle label="Show crosshair" checked={s.showCrosshair} onChange={(v) => set({ showCrosshair: v })} />
      </div>
    </Modal>
  );
}

function FibLevelsEditor({ levels, onChange }: { levels: FibLevel[]; onChange: (l: FibLevel[]) => void }) {
  const update = (i: number, patch: Partial<FibLevel>) => {
    const next = levels.map((l, j) => (j === i ? { ...l, ...patch } : l));
    onChange(next);
  };
  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] font-medium text-[#787B86]">Fibonacci levels</div>
      <div className="trex-scroll max-h-[220px] overflow-y-auto rounded border border-[#2A2E39]">
        {levels.map((l, i) => (
          <div key={i} className="flex items-center gap-2 border-b border-[#2A2E39] px-2 py-1.5 last:border-b-0">
            <input
              type="checkbox"
              checked={l.enabled}
              onChange={(e) => update(i, { enabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-[#2962FF]"
            />
            <input
              type="number"
              step="0.001"
              value={l.value}
              onChange={(e) => update(i, { value: parseFloat(e.target.value) || 0 })}
              className={cn(inputCls, "h-7 w-20")}
            />
            <input
              type="color"
              value={l.color}
              onChange={(e) => update(i, { color: e.target.value })}
              className="h-7 w-9 cursor-pointer rounded border border-[#363A45] bg-transparent"
            />
            <span className="flex-1 text-right font-mono text-[11px] text-[#787B86]">{(l.value * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawingSettingsDialog(props: {
  open: boolean;
  meta: SelectionMeta | null;
  digits: number;
  onClose: () => void;
  onStyle: (patch: Partial<DrawingStyle>) => void;
  onProps: (patch: { text?: string; fibLevels?: FibLevel[]; positionData?: SelectionMeta["positionData"] }) => void;
}) {
  const m = props.meta;
  if (!props.open || !m) return null;
  const st = m.style;
  const isFill = m.tool === "rectangle";
  const isText = m.tool === "text";
  const isLineLike = ["trendline", "ray", "extended", "horizontal", "vertical", "polyline", "arrow"].includes(m.tool);
  const pos = m.positionData;

  return (
    <Modal open onClose={props.onClose} title={`${TOOL_META[m.tool].label} settings`} width={420}>
      <Field label="Color">
        <div className="rounded border border-[#2A2E39] bg-[#131722]">
          <ColorSwatchGrid value={st.color} onPick={(c) => props.onStyle({ color: c, fillColor: c })} />
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Line width">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((w) => (
              <button key={w} type="button" onClick={() => props.onStyle({ lineWidth: w })}
                className={cn("flex h-8 flex-1 items-center justify-center rounded border text-[11px]",
                  st.lineWidth === w ? "border-[#2962FF] text-[#2962FF]" : "border-[#363A45] text-[#B2B5BE] hover:border-[#787B86]")}>
                {w}px
              </button>
            ))}
          </div>
        </Field>
        <Field label="Line style">
          <div className="flex gap-1">
            {LINE_STYLES.map((s) => (
              <button key={s.value} type="button" onClick={() => props.onStyle({ lineStyle: s.value })}
                className={cn("flex h-8 flex-1 items-center justify-center rounded border font-mono text-[10px]",
                  st.lineStyle === s.value ? "border-[#2962FF] text-[#2962FF]" : "border-[#363A45] text-[#B2B5BE] hover:border-[#787B86]")}>
                {s.preview}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {isFill && (
        <Field label={`Fill opacity — ${(st.fillOpacity * 100).toFixed(0)}%`}>
          <input
            type="range" min={0} max={0.6} step={0.02} value={st.fillOpacity}
            onChange={(e) => props.onStyle({ fillOpacity: parseFloat(e.target.value) })}
            className="w-full accent-[#2962FF]"
          />
        </Field>
      )}

      {isText && (
        <>
          <Field label="Text">
            <textarea
              value={m.text ?? ""}
              onChange={(e) => props.onProps({ text: e.target.value })}
              rows={3}
              className={cn(inputCls, "h-auto resize-none py-2 font-sans")}
            />
          </Field>
          <Field label={`Font size — ${st.fontSize}px`}>
            <input type="range" min={9} max={32} step={1} value={st.fontSize}
              onChange={(e) => props.onStyle({ fontSize: parseInt(e.target.value, 10) })}
              className="w-full accent-[#2962FF]" />
          </Field>
        </>
      )}

      {m.tool === "trendline" && (
        <div className="border-t border-[#2A2E39] pt-1">
          <Toggle label="Extend left" checked={st.extendLeft} onChange={(v) => props.onStyle({ extendLeft: v })} />
          <Toggle label="Extend right" checked={st.extendRight} onChange={(v) => props.onStyle({ extendRight: v })} />
        </div>
      )}

      {isLineLike && m.tool === "horizontal" && (
        <Toggle label="Show price label" checked={st.showLabels} onChange={(v) => props.onStyle({ showLabels: v })} />
      )}

      {m.tool === "fibRetracement" && m.fibLevels && (
        <>
          <Toggle label="Show level labels" checked={st.showLabels} onChange={(v) => props.onStyle({ showLabels: v })} />
          <FibLevelsEditor levels={m.fibLevels} onChange={(l) => props.onProps({ fibLevels: l })} />
        </>
      )}

      {(m.tool === "longPosition" || m.tool === "shortPosition") && pos && (
        <div className="grid grid-cols-2 gap-x-4 border-t border-[#2A2E39] pt-3">
          <Field label="Entry price">
            <input type="number" step="any" className={inputCls} value={pos.entryPrice}
              onChange={(e) => props.onProps({ positionData: { ...pos, entryPrice: parseFloat(e.target.value) || pos.entryPrice } })} />
          </Field>
          <Field label="Quantity">
            <input type="number" step="any" className={inputCls} value={pos.quantity}
              onChange={(e) => props.onProps({ positionData: { ...pos, quantity: parseFloat(e.target.value) || 0 } })} />
          </Field>
          <Field label="Take profit">
            <input type="number" step="any" className={inputCls} value={pos.takeProfit}
              onChange={(e) => props.onProps({ positionData: { ...pos, takeProfit: parseFloat(e.target.value) || pos.takeProfit } })} />
          </Field>
          <Field label="Stop loss">
            <input type="number" step="any" className={inputCls} value={pos.stopLoss}
              onChange={(e) => props.onProps({ positionData: { ...pos, stopLoss: parseFloat(e.target.value) || pos.stopLoss } })} />
          </Field>
          <div className="col-span-2 -mt-1 text-[11px] text-[#787B86]">
            Risk {fmtNum(Math.abs(pos.entryPrice - pos.stopLoss), props.digits)} · Reward {fmtNum(Math.abs(pos.takeProfit - pos.entryPrice), props.digits)} · RR{" "}
            <span className="font-mono text-[#D1D4DC]">
              {(Math.abs(pos.takeProfit - pos.entryPrice) / Math.max(1e-9, Math.abs(pos.entryPrice - pos.stopLoss))).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ═════════════════════ Indicators modal ═══════════════════════════ */

function IndicatorsModal(props: {
  open: boolean;
  mode: "demo" | "server";
  activeIds: string[];
  serverDefs: SeriesDefinition[];
  serverVis: Record<string, boolean>;
  serverAvailableIndicators: SeriesDefinition[];
  customDefs: SeriesDefinition[];
  onClose: () => void;
  onToggleId: (id: string) => void;
  onToggleServer: (key: string) => void;
  onToggleAvailable: (def: SeriesDefinition) => void;
  onRemoveCustom: (key: string) => void;
  onToggleCustom: (key: string) => void;
  onOpenBuilder: () => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => { if (props.open) setQ(""); }, [props.open]);
  const query = q.trim().toLowerCase();

  const groups: IndicatorSpec["group"][] = ["Overlay", "Oscillator", "Volatility", "Volume"];
  const matches = (s: IndicatorSpec) => !query || s.search.includes(query) || s.label.toLowerCase().includes(query);
  const serverMatches = props.serverDefs.filter((d) => !query || d.label.toLowerCase().includes(query) || d.key.toLowerCase().includes(query));
  const customMatches = props.customDefs.filter((d) => !query || d.label.toLowerCase().includes(query));

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Indicators"
      width={460}
      footer={
        <Btn onClick={props.onOpenBuilder} className="mr-auto flex items-center gap-1.5">
          <IconBuilder /> Open Indicator Builder
        </Btn>
      }
    >
      <div className="relative mb-3">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#787B86]"><IconSearch /></span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search indicators…"
          className={cn(inputCls, "pl-9 font-sans")}
        />
      </div>

      {groups.map((g) => {
        const specs = INDICATOR_REGISTRY.filter((s) => s.group === g && matches(s));
        if (!specs.length) return null;
        return (
          <div key={g} className="mb-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#787B86]">{g}</div>
            {specs.map((s) => {
              const on = props.activeIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => props.onToggleId(s.id)}
                  className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[12.5px] text-[#D1D4DC] hover:bg-[#2A2E39]"
                >
                  <span className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-[4px] border",
                    on ? "border-[#2962FF] bg-[#2962FF] text-white" : "border-[#4a4e59]"
                  )}>
                    {on && <IconCheck />}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </div>
        );
      })}

      {props.mode === "server" && props.serverAvailableIndicators.length > 0 && (
        <div className="mb-2 border-t border-[#2A2E39] pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#787B86]">Available from server</div>
          {props.serverAvailableIndicators
            .filter((d) => !query || d.label.toLowerCase().includes(query) || d.key.toLowerCase().includes(query))
            .map((d) => {
              const isActive = props.serverDefs.some((sd) => sd.key === d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => props.onToggleAvailable(d)}
                  className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[12.5px] text-[#D1D4DC] hover:bg-[#2A2E39]"
                >
                  <span className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-[4px] border",
                    isActive ? "border-[#2962FF] bg-[#2962FF] text-white" : "border-[#4a4e59]"
                  )}>
                    {isActive && <IconCheck />}
                  </span>
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="flex-1 truncate">{d.label}</span>
                </button>
              );
            })
          }
        </div>
      )}

      {props.mode === "server" && serverMatches.length > 0 && (
        <div className="mb-2 border-t border-[#2A2E39] pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#787B86]">Active from server</div>
          {serverMatches.map((d) => {
            const vis = props.serverVis[d.key] ?? d.visible;
            return (
              <div key={d.key} className="flex items-center gap-2.5 rounded px-2 py-1.5 text-[12.5px] text-[#D1D4DC] hover:bg-[#2A2E39]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                <span className="flex-1 truncate">{d.label}</span>
                <IconBtn tip={vis ? "Hide" : "Show"} onClick={() => props.onToggleServer(d.key)}>
                  {vis ? <IconEye /> : <IconEyeOff />}
                </IconBtn>
              </div>
            );
          })}
        </div>
      )}

      {customMatches.length > 0 && (
        <div className="border-t border-[#2A2E39] pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#787B86]">Custom (Builder)</div>
          {customMatches.map((d) => (
            <div key={d.key} className="flex items-center gap-2.5 rounded px-2 py-1.5 text-[12.5px] text-[#D1D4DC] hover:bg-[#2A2E39]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
              <span className="flex-1 truncate">{d.label}</span>
              <IconBtn tip={d.visible ? "Hide" : "Show"} onClick={() => props.onToggleCustom(d.key)}>
                {d.visible ? <IconEye /> : <IconEyeOff />}
              </IconBtn>
              <IconBtn tip="Remove" danger onClick={() => props.onRemoveCustom(d.key)}><IconTrash /></IconBtn>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ═══════════════════ Indicator Builder page ═══════════════════════ */

interface BuilderComp {
  uid: string;
  label: string;
  kind: SeriesKind;
  pane: "main" | "sub";
  color: string;
  colorPos: string;
  colorNeg: string;
  lineWidth: number;
  lineStyle: number;
  baseValue: number;
  digits: number;
  priceLineVisible: boolean;
  lastValueVisible: boolean;
  calc: CalcSpec;
}

const PALETTE: { kind: SeriesKind; label: string; icon: ReactNode; blurb: string }[] = [
  { kind: "line",      label: "Line",      icon: <IconLineChart />, blurb: "Single value line — MAs, RSI…" },
  { kind: "area",      label: "Area",      icon: <IconAreaChart />, blurb: "Line with a gradient fill" },
  { kind: "baseline",  label: "Baseline",  icon: <IconBaseline />,  blurb: "Split colors above / below a base" },
  { kind: "histogram", label: "Histogram", icon: <IconHistogram />, blurb: "Bars from zero — MACD, volume…" },
  { kind: "scatter",   label: "Scatter",   icon: <IconScatter />,   blurb: "Discrete dots — signals, markers…" },
];

/**
 * Ready-made indicator presets — drop a fully-configured component onto a
 * pane instead of building it from a raw series. Like a design tool's
 * component library, these encode sensible defaults (type, pane, source,
 * transform, period, colors) the user can then tweak.
 */
const PRESETS: {
  id: string; label: string; blurb: string; icon: ReactNode;
  make: () => Omit<BuilderComp, "uid">;
}[] = [
  {
    id: "sma", label: "Moving Average", blurb: "SMA overlay on price", icon: <IconLineChart />,
    make: () => ({ label: "SMA 20", kind: "line", pane: "main", color: "#2962FF",
      colorPos: "#089981", colorNeg: "#F23645", lineWidth: 2, lineStyle: 0, baseValue: 0, digits: 2, priceLineVisible: false, lastValueVisible: true,
      calc: { source: "close", transform: "sma", period: 20 } }),
  },
  {
    id: "ema", label: "EMA", blurb: "Exponential MA overlay", icon: <IconLineChart />,
    make: () => ({ label: "EMA 50", kind: "line", pane: "main", color: "#FF9800",
      colorPos: "#089981", colorNeg: "#F23645", lineWidth: 2, lineStyle: 0, baseValue: 0, digits: 2, priceLineVisible: false, lastValueVisible: true,
      calc: { source: "close", transform: "ema", period: 50 } }),
  },
  {
    id: "rsi", label: "RSI", blurb: "Momentum oscillator (sub-pane)", icon: <IconLineChart />,
    make: () => ({ label: "RSI 14", kind: "line", pane: "sub", color: "#AB47BC",
      colorPos: "#089981", colorNeg: "#F23645", lineWidth: 2, lineStyle: 0, baseValue: 0, digits: 2, priceLineVisible: false, lastValueVisible: true,
      calc: { source: "close", transform: "rsi", period: 14 } }),
  },
  {
    id: "mom", label: "Momentum", blurb: "Histogram from zero (sub-pane)", icon: <IconHistogram />,
    make: () => ({ label: "Momentum", kind: "histogram", pane: "sub", color: "#42A5F5",
      colorPos: "#089981", colorNeg: "#F23645", lineWidth: 2, lineStyle: 0, baseValue: 0, digits: 2, priceLineVisible: false, lastValueVisible: true,
      calc: { source: "close", transform: "momentum", period: 10 } }),
  },
];

const SOURCES: PriceSource[] = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4", "volume"];
const TRANSFORMS: { value: CalcTransform; label: string; hasPeriod: boolean }[] = [
  { value: "raw",      label: "Raw value",  hasPeriod: false },
  { value: "sma",      label: "SMA",        hasPeriod: true },
  { value: "ema",      label: "EMA",        hasPeriod: true },
  { value: "wma",      label: "WMA",        hasPeriod: true },
  { value: "rsi",      label: "RSI",        hasPeriod: true },
  { value: "momentum", label: "Momentum",   hasPeriod: true },
  { value: "stddev",   label: "Std. Dev.",  hasPeriod: true },
];

let builderSeq = 1;
const newComp = (kind: SeriesKind, pane: "main" | "sub"): BuilderComp => ({
  uid: `c${builderSeq++}_${Math.random().toString(36).slice(2, 6)}`,
  label: `${kind === "line" ? "SMA" : kind === "histogram" ? "Momentum" : kind.charAt(0).toUpperCase() + kind.slice(1)} ${builderSeq}`,
  kind,
  pane,
  color: DRAWING_COLORS[(builderSeq * 3) % 12],
  colorPos: "#089981",
  colorNeg: "#F23645",
  lineWidth: 2,
  lineStyle: 0,
  baseValue: 0,
  digits: 2,
  priceLineVisible: false,
  lastValueVisible: true,
  calc: {
    source: kind === "histogram" ? "close" : "close",
    transform: kind === "histogram" ? "momentum" : kind === "line" ? "sma" : "ema",
    period: 14,
  },
});

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom";

/** Convert builder components into exportable SeriesDefinitions. */
function compsToDefs(comps: BuilderComp[]): SeriesDefinition[] {
  const used = new Set<string>();
  return comps.map((c) => {
    let key = slug(c.label);
    while (used.has(key)) key += "_";
    used.add(key);
    return {
      key,
      label: c.label,
      pane: c.pane,
      paneId: c.pane === "main" ? key : `pane_${key}`,
      type: c.kind,
      color: c.color,
      colorPos: c.kind === "histogram" || c.kind === "baseline" ? c.colorPos : undefined,
      colorNeg: c.kind === "histogram" || c.kind === "baseline" ? c.colorNeg : undefined,
      lineWidth: c.lineWidth,
      lineStyle: c.lineStyle,
      subPaneHeight: 120,
      scaleMargins: { top: 0.1, bottom: 0.1 },
      digits: c.digits,
      visible: true,
      priceLineVisible: c.priceLineVisible,
      lastValueVisible: c.lastValueVisible,
      baseValue: c.kind === "baseline" ? c.baseValue : undefined,
      meta: { calc: { ...c.calc }, builder: "trex-builder@1" },
    };
  });
}


/**
 * Drop zone for the Indicator Builder.
 *
 * MUST live at module scope: an earlier version declared this inside
 * BuilderPage, so every `dragover` re-render created a brand-new
 * component type, React remounted the zone mid-drag, the node under
 * the cursor vanished and drag-and-drop never completed. Hoisting it
 * gives the zone a stable identity for the whole drag gesture.
 */
function BuilderZone(props: {
  pane: "main" | "sub";
  title: string;
  comps: BuilderComp[];
  selUid: string | null;
  isOver: boolean;
  overCard: string | null;
  onSelect: (uid: string) => void;
  onDropZone: (pane: "main" | "sub", e: React.DragEvent) => void;
  onOverZone: (pane: "main" | "sub" | null) => void;
  onOverCard: (uid: string | null) => void;
  onReorder: (dragUid: string, targetUid: string) => void;
  onDuplicate: (c: BuilderComp) => void;
  onDelete: (uid: string) => void;
}) {
  const items = props.comps.filter((c) => c.pane === props.pane);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        // correct cursor: palette adds a copy, an existing card moves
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes("trex/palette") ? "copy" : "move";
        props.onOverZone(props.pane);
      }}
      onDragLeave={(e) => {
        // dragleave fires when entering CHILD nodes too — ignore those
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        props.onOverZone(null);
      }}
      onDrop={(e) => props.onDropZone(props.pane, e)}
      className={cn(
        "mb-3 rounded-lg border p-2 transition-colors",
        props.isOver ? "border-[#2962FF] bg-[rgba(41,98,255,0.06)]" : "border-dashed border-[#363A45]"
      )}
    >
      <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-[#787B86]">{props.title}</div>
      {items.length === 0 && (
        <div className="px-1 pb-1 text-[11.5px] text-[#56585f]">Drag a component here…</div>
      )}
      {items.map((c) => (
        <div
          key={c.uid}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("trex/comp", c.uid);
            e.dataTransfer.setData("text/plain", c.uid); // Firefox quirk
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            // allow dropping ONTO a card to reorder/insert before it
            const dragUid = e.dataTransfer.types.includes("trex/comp");
            if (dragUid) {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
              if (props.overCard !== c.uid) props.onOverCard(c.uid);
            }
          }}
          onDrop={(e) => {
            const dragUid = e.dataTransfer.getData("trex/comp");
            if (dragUid) {
              e.preventDefault();
              e.stopPropagation();
              props.onReorder(dragUid, c.uid);
              props.onOverCard(null);
            }
          }}
          onClick={() => props.onSelect(c.uid)}
          className={cn(
            "mb-1 flex cursor-pointer items-center gap-2 rounded-md border bg-[#1E222D] px-2 py-1.5 transition-all",
            props.overCard === c.uid && "border-t-2 border-t-[#2962FF]",
            props.selUid === c.uid ? "border-[#2962FF]" : "border-[#2A2E39] hover:border-[#4a4e59]"
          )}
        >
          <span className="cursor-grab text-[#56585f]"><IconGrip /></span>
          <span className="h-3 w-3 rounded-[3px]" style={{ background: c.color }} />
          <span className="flex-1 truncate text-[12px] text-[#D1D4DC]">{c.label}</span>
          <span className="rounded bg-[#2A2E39] px-1.5 py-px text-[10px] uppercase text-[#9598A1]">{c.kind}</span>
          <span className="font-mono text-[10px] text-[#787B86]">
            {c.calc.transform}{TRANSFORMS.find((t) => t.value === c.calc.transform)?.hasPeriod ? `(${c.calc.period})` : ""}·{c.calc.source}
          </span>
          <IconBtn tip="Duplicate" onClick={(e) => { e.stopPropagation(); props.onDuplicate(c); }}>
            <IconClone />
          </IconBtn>
          <IconBtn tip="Delete" danger onClick={(e) => { e.stopPropagation(); props.onDelete(c.uid); }}>
            <IconTrash />
          </IconBtn>
        </div>
      ))}
    </div>
  );
}

function BuilderPage(props: {
  initial: SeriesDefinition[];
  onApply: (defs: SeriesDefinition[]) => void;
  onBack: () => void;
}) {
  /* hydrate components from previously applied custom defs */
  const [comps, setComps] = useState<BuilderComp[]>(() =>
    props.initial
      .filter((d) => d.meta?.calc)
      .map((d) => ({
        uid: `c${builderSeq++}_${Math.random().toString(36).slice(2, 6)}`,
        label: d.label,
        kind: d.type,
        pane: d.pane,
        color: d.color,
        colorPos: d.colorPos ?? "#089981",
        colorNeg: d.colorNeg ?? "#F23645",
        lineWidth: d.lineWidth,
        lineStyle: d.lineStyle,
        baseValue: d.baseValue ?? 0,
        digits: d.digits ?? 2,
        priceLineVisible: d.priceLineVisible ?? false,
        lastValueVisible: d.lastValueVisible ?? true,
        calc: { ...(d.meta!.calc as CalcSpec) },
      }))
  );
  const [selUid, setSelUid] = useState<string | null>(comps[0]?.uid ?? null);
  const [dragOver, setDragOver] = useState<"main" | "sub" | null>(null);
  const [overCard, setOverCard] = useState<string | null>(null);
  const sel = comps.find((c) => c.uid === selUid) ?? null;

  const update = (uid: string, patch: Partial<BuilderComp>) =>
    setComps((xs) => xs.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));
  const updateCalc = (uid: string, patch: Partial<CalcSpec>) =>
    setComps((xs) => xs.map((c) => (c.uid === uid ? { ...c, calc: { ...c.calc, ...patch } } : c)));

  const onOverZone = useCallback(
    (p: "main" | "sub" | null) => setDragOver((prev) => (prev === p ? prev : p)),
    []
  );
  const duplicateComp = useCallback((c: BuilderComp) => {
    const d = { ...c, uid: `c${builderSeq++}_${Math.random().toString(36).slice(2, 6)}`, label: c.label + " copy" };
    setComps((xs) => [...xs, d]);
    setSelUid(d.uid);
  }, []);
  const deleteComp = useCallback((uid: string) => {
    setComps((xs) => xs.filter((x) => x.uid !== uid));
    setSelUid((s) => (s === uid ? null : s));
  }, []);

  // Reorder: drop a dragged component before `targetUid` (and adopt the
  // target's pane), so the user can both reorder within a pane and move
  // across panes by dropping onto a specific card.
  const reorderComp = useCallback((dragUid: string, targetUid: string) => {
    if (dragUid === targetUid) return;
    setComps((xs) => {
      const from = xs.findIndex((c) => c.uid === dragUid);
      const to = xs.findIndex((c) => c.uid === targetUid);
      if (from < 0 || to < 0) return xs;
      const next = [...xs];
      const [moved] = next.splice(from, 1);
      const movedToPane = { ...moved, pane: xs[to].pane };
      const insertAt = next.findIndex((c) => c.uid === targetUid);
      next.splice(insertAt, 0, movedToPane);
      return next;
    });
  }, []);

  const drop = (pane: "main" | "sub", e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const kind = e.dataTransfer.getData("trex/palette") as SeriesKind;
    const presetId = e.dataTransfer.getData("trex/preset");
    const moveUid = e.dataTransfer.getData("trex/comp");
    if (presetId) {
      const preset = PRESETS.find((p) => p.id === presetId);
      if (preset) {
        const c: BuilderComp = { ...preset.make(), uid: `c${builderSeq++}_${Math.random().toString(36).slice(2, 6)}`, pane };
        setComps((xs) => [...xs, c]);
        setSelUid(c.uid);
      }
    } else if (kind) {
      const c = newComp(kind, pane);
      setComps((xs) => [...xs, c]);
      setSelUid(c.uid);
    } else if (moveUid) {
      update(moveUid, { pane });
    }
  };

  /* ── preview chart (own tiny lightweight-charts instance) ── */
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewChart = useRef<IChartApi | null>(null);
  const previewSeries = useRef<ISeriesApi<any>[]>([]);
  const previewCandles = useMemo<OHLC[]>(() => generateDemoCandles(180, 30000, 60), []);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#787B86", fontSize: 10,
        panes: { enableResize: false, separatorColor: "#2A2E39", separatorHoverColor: "#2A2E39" },
      },
      grid: { vertLines: { color: "rgba(42,46,57,0.4)" }, horzLines: { color: "rgba(42,46,57,0.4)" } },
      rightPriceScale: { borderColor: "#2A2E39" },
      timeScale: { borderColor: "#2A2E39", timeVisible: true, barSpacing: 5 },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      handleScroll: false, handleScale: false,
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#089981", downColor: "#F23645",
      wickUpColor: "#089981", wickDownColor: "#F23645",
      borderVisible: false, lastValueVisible: false, priceLineVisible: false,
    }, 0);
    candle.setData(previewCandles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    chart.timeScale().fitContent();
    previewChart.current = chart;
    return () => { previewChart.current = null; chart.remove(); };
  }, [previewCandles]);

  /* rebuild preview series (debounced) whenever components change */
  const compsJson = JSON.stringify(comps);
  useEffect(() => {
    const t = setTimeout(() => {
      const chart = previewChart.current;
      if (!chart) return;
      for (const s of previewSeries.current) { try { chart.removeSeries(s); } catch { /* gone */ } }
      previewSeries.current = [];
      try {
        for (let i = chart.panes().length - 1; i >= 1; i--) chart.removePane(i);
      } catch { /* pane API hiccup — harmless for a preview */ }
      let subUsed = false;
      for (const c of comps) {
        const pts = computeCalc(previewCandles, c.calc);
        const paneIdx = c.pane === "main" ? 0 : 1;
        if (paneIdx === 1) subUsed = true;
        let s: ISeriesApi<any>;
        if (c.kind === "histogram") {
          s = chart.addSeries(HistogramSeries, { color: c.color, priceLineVisible: false, lastValueVisible: false }, paneIdx);
          s.setData(pts.map((p) => ({ time: p.time, value: p.value, color: p.value >= 0 ? c.colorPos : c.colorNeg })));
        } else if (c.kind === "area") {
          s = chart.addSeries(AreaSeries, {
            lineColor: c.color, lineWidth: c.lineWidth as any,
            topColor: c.color + "44", bottomColor: c.color + "05",
            priceLineVisible: false, lastValueVisible: false,
          }, paneIdx);
          s.setData(pts.map((p) => ({ time: p.time, value: p.value })));
        } else if (c.kind === "baseline") {
          s = chart.addSeries(BaselineSeries, {
            baseValue: { type: "price", price: c.baseValue },
            topLineColor: c.colorPos, bottomLineColor: c.colorNeg,
            topFillColor1: c.colorPos + "33", topFillColor2: c.colorPos + "08",
            bottomFillColor1: c.colorNeg + "08", bottomFillColor2: c.colorNeg + "33",
            lineWidth: c.lineWidth as any, priceLineVisible: false, lastValueVisible: false,
          }, paneIdx);
          s.setData(pts.map((p) => ({ time: p.time, value: p.value })));
        } else {
          s = chart.addSeries(LineSeries, {
            color: c.color, lineWidth: c.lineWidth as any, lineStyle: c.lineStyle as any,
            priceLineVisible: false, lastValueVisible: false,
            pointMarkersVisible: c.kind === "scatter", lineVisible: c.kind !== "scatter",
          }, paneIdx);
          s.setData(pts.map((p) => ({ time: p.time, value: p.value })));
        }
        previewSeries.current.push(s);
      }
      if (subUsed && chart.panes().length > 1) chart.panes()[1].setHeight(90);
      chart.timeScale().fitContent();
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compsJson, previewCandles]);

  /**
   * Build the full server-contract template. Beyond the display
   * definitions, it lists a `dataRequest` per series describing exactly
   * what the server must stream back (the source, transform and period
   * the user designed). The terminal computes nothing — this template is
   * the instruction the data source fulfils.
   */
  const buildTemplate = () => {
    const defs = compsToDefs(comps);
    return {
      type: "definitions" as const,
      protocol: PROTOCOL_VERSION,
      generator: "trex-indicator-designer@1",
      definitions: defs,
      // What the server should send for each series key.
      dataRequest: defs.map((d) => ({
        key: d.key,
        pane: d.pane,
        seriesType: d.type,
        // the recipe the user designed; the SERVER computes this, not us
        calc: d.meta?.calc ?? null,
      })),
    };
  };
  const exportJson = () => JSON.stringify(buildTemplate(), null, 2);

  const copyJson = async () => {
    try { await navigator.clipboard.writeText(exportJson()); showToast("Template JSON copied", "success"); }
    catch { showToast("Clipboard unavailable", "error"); }
  };
  const downloadJson = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trex_indicator_template_${nowStamp()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("template.json downloaded", "success");
  };

  return (
    <div className="trex-fade absolute inset-0 z-[80] flex flex-col bg-[#131722]">
      {/* header */}
      <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-[#2A2E39] px-3">
        <IconBtn tip="Back to chart" onClick={props.onBack}><IconArrowLeft /></IconBtn>
        <span className="flex items-center gap-2 text-[14px] font-bold text-[#D1D4DC]"><IconBuilder /> Indicator Builder</span>
        <span className="ml-2 text-[11.5px] text-[#787B86]">Drag components onto a pane, tune them, then export or apply.</span>
        <div className="flex-1" />
        <Btn onClick={copyJson} className="flex items-center gap-1.5"><IconCopy /> Copy JSON</Btn>
        <Btn onClick={downloadJson} className="flex items-center gap-1.5"><IconDownload /> Download</Btn>
        <Btn primary disabled={!comps.length} onClick={() => props.onApply(compsToDefs(comps))} className="flex items-center gap-1.5">
          <IconCheck /> Apply to chart
        </Btn>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* palette */}
        <div className="trex-scroll w-[230px] shrink-0 overflow-y-auto border-r border-[#2A2E39] p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#787B86]">Presets</div>
          {PRESETS.map((p) => (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("trex/preset", p.id);
                e.dataTransfer.setData("text/plain", p.id);
                e.dataTransfer.effectAllowed = "copyMove";
              }}
              className="mb-2 cursor-grab rounded-md border border-[#2A2E39] bg-[#1E222D] p-2.5 transition-colors hover:border-[#2962FF] active:cursor-grabbing"
            >
              <div className="mb-0.5 flex items-center gap-2 text-[12.5px] font-semibold text-[#D1D4DC]">
                <span className="text-[#FCD535]">{p.icon}</span>{p.label}
              </div>
              <div className="text-[11px] leading-snug text-[#787B86]">{p.blurb}</div>
            </div>
          ))}

          <div className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-[#787B86]">Components</div>
          {PALETTE.map((p) => (
            <div
              key={p.kind}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("trex/palette", p.kind);
                e.dataTransfer.setData("text/plain", p.kind); // Firefox quirk
                e.dataTransfer.effectAllowed = "copyMove";
              }}
              className="mb-2 cursor-grab rounded-md border border-[#2A2E39] bg-[#1E222D] p-2.5 transition-colors hover:border-[#2962FF] active:cursor-grabbing"
            >
              <div className="mb-0.5 flex items-center gap-2 text-[12.5px] font-semibold text-[#D1D4DC]">
                <span className="text-[#2962FF]">{p.icon}</span>{p.label}
              </div>
              <div className="text-[11px] leading-snug text-[#787B86]">{p.blurb}</div>
            </div>
          ))}
          <div className="mt-3 rounded-md border border-[#2A2E39] bg-[rgba(41,98,255,0.05)] p-2.5 text-[11px] leading-relaxed text-[#9598A1]">
            Exported JSON uses the exact <span className="font-mono text-[#B2B5BE]">SeriesDefinition</span> schema the
            WebSocket server sends — drop it straight into your backend.
          </div>
        </div>

        {/* canvas */}
        <div className="trex-scroll min-w-0 flex-1 overflow-y-auto p-3">
          <BuilderZone
            pane="main" title="Main pane (price overlay)"
            comps={comps} selUid={selUid} isOver={dragOver === "main"}
            overCard={overCard}
            onSelect={setSelUid} onDropZone={drop} onOverZone={onOverZone}
            onOverCard={setOverCard} onReorder={reorderComp}
            onDuplicate={duplicateComp} onDelete={deleteComp}
          />
          <BuilderZone
            pane="sub" title="Sub pane (own scale below price)"
            comps={comps} selUid={selUid} isOver={dragOver === "sub"}
            overCard={overCard}
            onSelect={setSelUid} onDropZone={drop} onOverZone={onOverZone}
            onOverCard={setOverCard} onReorder={reorderComp}
            onDuplicate={duplicateComp} onDelete={deleteComp}
          />

          <div className="mb-1.5 mt-4 px-1 text-[10px] font-semibold uppercase tracking-wider text-[#787B86]">Live preview</div>
          <div ref={previewRef} className="h-[260px] w-full overflow-hidden rounded-lg border border-[#2A2E39]" />
        </div>

        {/* properties */}
        <div className="trex-scroll w-[280px] shrink-0 overflow-y-auto border-l border-[#2A2E39] p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#787B86]">Properties</div>
          {!sel && <div className="text-[12px] text-[#56585f]">Select a component to edit it.</div>}
          {sel && (
            <>
              <Field label="Label">
                <input className={cn(inputCls, "font-sans")} value={sel.label} onChange={(e) => update(sel.uid, { label: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="Pane">
                  <select className={inputCls} value={sel.pane} onChange={(e) => update(sel.uid, { pane: e.target.value as "main" | "sub" })}>
                    <option value="main">Main</option>
                    <option value="sub">Sub</option>
                  </select>
                </Field>
                <Field label="Type">
                  <select className={inputCls} value={sel.kind} onChange={(e) => update(sel.uid, { kind: e.target.value as SeriesKind })}>
                    {PALETTE.map((p) => <option key={p.kind} value={p.kind}>{p.label}</option>)}
                    <option value="scatter">Scatter</option>
                  </select>
                </Field>
              </div>
              <Field label="Color">
                <div className="rounded border border-[#2A2E39] bg-[#131722]">
                  <ColorSwatchGrid value={sel.color} onPick={(c) => update(sel.uid, { color: c })} />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="Width">
                  <select className={inputCls} value={sel.lineWidth} onChange={(e) => update(sel.uid, { lineWidth: parseInt(e.target.value, 10) })}>
                    {[1, 2, 3, 4].map((w) => <option key={w} value={w}>{w}px</option>)}
                  </select>
                </Field>
                <Field label="Style">
                  <select className={inputCls} value={sel.lineStyle} onChange={(e) => update(sel.uid, { lineStyle: parseInt(e.target.value, 10) })}>
                    {LINE_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
              </div>

              <div className="mb-2 mt-1 border-t border-[#2A2E39] pt-2 text-[10px] font-semibold uppercase tracking-wider text-[#787B86]">Calculation</div>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="Source">
                  <select className={inputCls} value={sel.calc.source} onChange={(e) => updateCalc(sel.uid, { source: e.target.value as PriceSource })}>
                    {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Transform">
                  <select className={inputCls} value={sel.calc.transform} onChange={(e) => updateCalc(sel.uid, { transform: e.target.value as CalcTransform })}>
                    {TRANSFORMS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
              </div>
              {TRANSFORMS.find((t) => t.value === sel.calc.transform)?.hasPeriod && (
                <Field label="Period">
                  <input type="number" min={1} max={500} className={inputCls} value={sel.calc.period}
                    onChange={(e) => updateCalc(sel.uid, { period: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
                </Field>
              )}

              {(sel.kind === "histogram" || sel.kind === "baseline") && (
                <div className="grid grid-cols-2 gap-x-3">
                  <Field label="Positive color">
                    <input type="color" value={sel.colorPos} onChange={(e) => update(sel.uid, { colorPos: e.target.value })}
                      className="h-8 w-full cursor-pointer rounded border border-[#363A45] bg-transparent" />
                  </Field>
                  <Field label="Negative color">
                    <input type="color" value={sel.colorNeg} onChange={(e) => update(sel.uid, { colorNeg: e.target.value })}
                      className="h-8 w-full cursor-pointer rounded border border-[#363A45] bg-transparent" />
                  </Field>
                </div>
              )}
              {sel.kind === "baseline" && (
                <Field label="Base value">
                  <input type="number" step="any" className={inputCls} value={sel.baseValue}
                    onChange={(e) => update(sel.uid, { baseValue: parseFloat(e.target.value) || 0 })} />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="Decimals">
                  <input type="number" min={0} max={8} className={inputCls} value={sel.digits}
                    onChange={(e) => update(sel.uid, { digits: Math.max(0, Math.min(8, parseInt(e.target.value) || 0)) })} />
                </Field>
              </div>
              <label className="mt-1 flex items-center gap-2 text-[12px] text-[#D1D4DC]">
                <input type="checkbox" checked={sel.priceLineVisible}
                  onChange={(e) => update(sel.uid, { priceLineVisible: e.target.checked })} />
                Show price line
              </label>
              <label className="mt-1.5 flex items-center gap-2 text-[12px] text-[#D1D4DC]">
                <input type="checkbox" checked={sel.lastValueVisible}
                  onChange={(e) => update(sel.uid, { lastValueVisible: e.target.checked })} />
                Show last-value label
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ Compare panel (multi-chart) ══════════════════ */

const NOOP = () => {};

/**
 * Stable event bus for cross-chart drawing synchronization.
 * Each chart registers a handler; when it commits local drawings it
 * broadcasts to all other handlers that are currently showing the same symbol.
 */
class DrawingsSyncBus {
  private handlers = new Map<string, (sym: string, drawings: Drawing[]) => void>();

  register(chartId: string, handler: (sym: string, drawings: Drawing[]) => void) {
    this.handlers.set(chartId, handler);
  }

  unregister(chartId: string) {
    this.handlers.delete(chartId);
  }

  broadcast(sourceChartId: string, sym: string, drawings: Drawing[]) {
    for (const [id, handler] of this.handlers) {
      if (id !== sourceChartId) handler(sym, drawings);
    }
  }
}

/**
 * A secondary chart panel for multi-chart layouts. In demo mode it runs
 * an independent DemoFeed. In server mode its ChartEngine is registered
 * with the parent App so incoming `chart_snapshot` / `chart_bar` messages
 * can be routed to it by chartId. It has its own crosshair, time axis,
 * and symbol picker.
 */
/**
 * Fully independent secondary chart panel — each one behaves exactly
 * like the main chart: own symbol, timeframe, active indicators, full
 * LeftBar drawing toolbar, magnet, lock/hide/clear, and cross-chart
 * drawing sync (drawings propagate to every other chart showing the
 * same symbol).
 */
const ComparePanel = memo(function ComparePanel(props: {
  index: number;
  chartId: string;
  symbol: string;
  timeframe: string;
  mode: "demo" | "server";
  serverSymbols: Array<{ symbol: string; name?: string }>;
  serverAvailableIndicators: SeriesDefinition[];
  onRegisterEngine: (chartId: string, engine: ChartEngine) => void;
  onUnregisterEngine: (chartId: string) => void;
  onNeedHistory: (chartId: string, before: number, count: number, fromTime?: number) => void;
  onSendToServer: (chartId: string, symbol: string, timeframe: string, indicators: string[]) => void;
  drawingsBus: DrawingsSyncBus;
}) {
  const hostRef   = useRef<HTMLDivElement | null>(null);
  const cEngineRef = useRef<ChartEngine | null>(null);
  const feedRef   = useRef<DemoFeed | null>(null);

  // Independent state
  const [sym,  setSym]  = useState(props.symbol);
  const [tf,   setTf]   = useState(props.timeframe);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [magnet,     setMagnet]     = useState(false);
  const [drawTick,   setDrawTick]   = useState(0); // triggers re-render for hasDrawings
  const [favorites,  setFavorites]  = useState<DrawingTool[]>([]);

  const [symOpen, setSymOpen] = useState(false);
  const [tfOpen,  setTfOpen]  = useState(false);
  const [indOpen, setIndOpen] = useState(false);

  const symMenuRef = useOutsideClose(symOpen, () => setSymOpen(false));
  const tfMenuRef  = useOutsideClose(tfOpen,  () => setTfOpen(false));
  const indMenuRef = useOutsideClose(indOpen, () => setIndOpen(false));
  const legendRef  = useRef<HTMLDivElement | null>(null);

  // Keep refs in sync for use inside callbacks
  const symRef2       = useRef(sym);       symRef2.current       = sym;
  const tfRef2        = useRef(tf);        tfRef2.current        = tf;
  const activeKeysRef = useRef(activeKeys);activeKeysRef.current = activeKeys;

  const syncServer = useCallback((s: string, t: string, keys: string[]) => {
    if (props.mode === "server") props.onSendToServer(props.chartId, s, t, keys);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.chartId, props.mode]);

  const changeSym = useCallback((s: string) => {
    setSym(s); symRef2.current = s;
    setSymOpen(false);
    if (props.mode === "demo") feedRef.current?.start({ symbol: s, timeframe: tfRef2.current });
    else syncServer(s, tfRef2.current, activeKeysRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, syncServer]);

  const changeTf = useCallback((t: string) => {
    setTf(t); tfRef2.current = t;
    setTfOpen(false);
    if (props.mode === "demo") feedRef.current?.start({ symbol: symRef2.current, timeframe: t });
    else syncServer(symRef2.current, t, activeKeysRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, syncServer]);

  const toggleIndicator = useCallback((key: string) => {
    setActiveKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      activeKeysRef.current = next;
      if (props.mode === "server") syncServer(symRef2.current, tfRef2.current, next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, syncServer]);

  const pickTool = useCallback((t: DrawingTool) => {
    setActiveTool(t);
    cEngineRef.current?.setTool(t);
  }, []);

  const toggleMagnet = useCallback(() => {
    setMagnet((m) => { cEngineRef.current?.setMagnet(!m); return !m; });
  }, []);

  const toggleFav = useCallback((t: DrawingTool) => {
    setFavorites((f) => f.includes(t) ? f.filter((x) => x !== t) : [...f, t]);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const engine = new ChartEngine(host, { ...DEFAULT_SETTINGS }, {
      onCrosshair: (p: CrosshairPayload) => {
        if (!legendRef.current) return;
        if (p.bar) {
          const up = p.bar.close >= p.bar.open;
          legendRef.current.style.color = up ? "#089981" : "#F23645";
          legendRef.current.textContent =
            `O:${p.bar.open.toFixed(2)} H:${p.bar.high.toFixed(2)} L:${p.bar.low.toFixed(2)} C:${p.bar.close.toFixed(2)}`;
        } else if (!p.hovering) {
          legendRef.current.textContent = "";
        }
      },
      onDrawingsCommit: (e) => {
        const snap = engine.getDrawingsSnapshot();
        if (e.source === "local") {
          props.drawingsBus.broadcast(props.chartId, symRef2.current, snap);
        }
        setDrawTick((t) => t + 1);
      },
      onSelectionChange: NOOP, onSelectionBox: NOOP,
      onNeedHistory: (before, count, fromTime) => {
        if (props.mode === "demo") feedRef.current?.requestHistory(before, count);
        else props.onNeedHistory(props.chartId, before, count, fromTime);
      },
      onToolDone: () => { setActiveTool("cursor"); engine.setTool("cursor"); },
      onPaneLayout: NOOP, onRealtimeGapChange: NOOP,
      onContextMenu: NOOP, onDblClickEmpty: NOOP, onEditDrawing: NOOP, onHint: NOOP,
    });

    cEngineRef.current = engine;
    props.onRegisterEngine(props.chartId, engine);

    // Register with the drawing sync bus so this chart receives and sends drawings
    props.drawingsBus.register(props.chartId, (incomingSym, drawings) => {
      if (incomingSym === symRef2.current && cEngineRef.current) {
        cEngineRef.current.restoreDrawings(drawings);
      }
    });

    if (props.mode === "demo") {
      const feed = new DemoFeed((msg) => {
        if (msg.type === "snapshot" || msg.type === "init") {
          if (Array.isArray(msg.data)) engine.setCandles(sanitizeCandles(msg.data));
          if (msg.definitions) engine.setDefinitions(sanitizeDefinitions(msg.definitions as SeriesDefinition[]));
          if (msg.points) {
            for (const [k, raw] of Object.entries(msg.points as Record<string, unknown>))
              engine.setSeriesData(k, sanitizePoints(raw));
          }
        } else if (msg.type === "bar" || msg.type === "tick" || msg.type === "update") {
          if (msg.bar && isValidBar(msg.bar)) engine.applyBar(msg.bar as OHLC);
        }
      });
      feedRef.current = feed;
      feed.start({ symbol: symRef2.current, timeframe: tfRef2.current });
    } else {
      syncServer(symRef2.current, tfRef2.current, activeKeysRef.current);
    }

    return () => {
      props.drawingsBus.unregister(props.chartId);
      feedRef.current?.stop();
      feedRef.current = null;
      engine.dispose();
      cEngineRef.current = null;
      props.onUnregisterEngine(props.chartId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const symbolPool = props.mode === "server" && props.serverSymbols.length > 0
    ? props.serverSymbols : DEMO_SYMBOLS;

  const eng = cEngineRef.current;
  // drawTick is read so that hasDrawings/allLocked/allHidden recompute after each commit
  void drawTick;
  const hasDrawings = eng?.hasDrawings() ?? false;
  const allLocked   = eng?.allLocked()   ?? false;
  const allHidden   = eng?.allHidden()   ?? false;

  return (
    <div className="flex min-w-0 overflow-hidden rounded-[2px] bg-[#131722] ring-1 ring-[#2A2E39]">
      {/* ── Full LeftBar (identical to main chart) ── */}
      <LeftBar
        tool={activeTool}
        magnet={magnet}
        hasDrawings={hasDrawings}
        allLocked={allLocked}
        allHidden={allHidden}
        favorites={favorites}
        onToggleFavorite={toggleFav}
        onTool={pickTool}
        onToggleMagnet={toggleMagnet}
        onLockAll={() => { eng?.setAllLocked(!allLocked); setDrawTick((t) => t + 1); }}
        onHideAll={() => { eng?.setAllHidden(!allHidden); setDrawTick((t) => t + 1); }}
        onClearAll={() => eng?.clearDrawings()}
      />

      {/* ── Chart area ── */}
      <div className="relative flex-1 overflow-hidden">
        <div ref={hostRef} className="absolute inset-0" />

        {/* Top bar: symbol / timeframe / indicators */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-8 items-center gap-1 px-1">

          <div className="pointer-events-auto relative" ref={symMenuRef}>
            <button type="button" onClick={() => setSymOpen((v) => !v)}
              className="flex items-center gap-1 rounded bg-[rgba(19,23,34,0.85)] px-2 py-0.5 text-[11px] font-bold text-[#D1D4DC] hover:bg-[#2A2E39]">
              {sym}<IconChevronDown />
            </button>
            {symOpen && (
              <div className="absolute left-0 top-7 z-20 max-h-[220px] w-[180px] overflow-y-auto rounded border border-[#363A45] bg-[#1E222D] py-1 shadow-xl">
                {symbolPool.map((s) => (
                  <button key={s.symbol} type="button" onClick={() => changeSym(s.symbol)}
                    className={cn("flex w-full items-center justify-between px-3 py-1 text-left text-[11px] hover:bg-[#2A2E39]",
                      s.symbol === sym ? "text-[#2962FF]" : "text-[#D1D4DC]")}>
                    <span className="font-semibold">{s.symbol}</span>
                    {(s as any).name && <span className="text-[10px] text-[#787B86]">{(s as any).name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pointer-events-auto relative" ref={tfMenuRef}>
            <button type="button" onClick={() => setTfOpen((v) => !v)}
              className="flex items-center gap-1 rounded bg-[rgba(19,23,34,0.85)] px-2 py-0.5 text-[11px] text-[#787B86] hover:bg-[#2A2E39] hover:text-[#D1D4DC]">
              {tf}<IconChevronDown />
            </button>
            {tfOpen && (
              <div className="absolute left-0 top-7 z-20 w-[100px] rounded border border-[#363A45] bg-[#1E222D] py-1 shadow-xl">
                {TIMEFRAMES.map((t) => (
                  <button key={t.value} type="button" onClick={() => changeTf(t.value)}
                    className={cn("flex w-full px-3 py-1 text-left text-[11px] hover:bg-[#2A2E39]",
                      t.value === tf ? "text-[#2962FF]" : "text-[#D1D4DC]")}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {props.serverAvailableIndicators.length > 0 && (
            <div className="pointer-events-auto relative" ref={indMenuRef}>
              <button type="button" onClick={() => setIndOpen((v) => !v)}
                className={cn("flex items-center gap-1 rounded px-2 py-0.5 text-[11px] hover:bg-[#2A2E39]",
                  activeKeys.length > 0 ? "bg-[rgba(41,98,255,0.2)] text-[#2962FF]"
                                        : "bg-[rgba(19,23,34,0.85)] text-[#787B86] hover:text-[#D1D4DC]")}>
                {activeKeys.length > 0 ? `Indicators (${activeKeys.length})` : "Indicators"}
              </button>
              {indOpen && (
                <div className="absolute left-0 top-7 z-20 max-h-[260px] w-[220px] overflow-y-auto rounded border border-[#363A45] bg-[#1E222D] py-1 shadow-xl">
                  {props.serverAvailableIndicators.map((def) => (
                    <label key={def.key}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] text-[#D1D4DC] hover:bg-[#2A2E39]">
                      <input type="checkbox" checked={activeKeys.includes(def.key)}
                        onChange={() => toggleIndicator(def.key)} className="accent-[#2962FF]" />
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.color ?? "#2962FF" }} />
                      {def.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Crosshair OHLC legend */}
        <div ref={legendRef}
          className="pointer-events-none absolute left-1 top-9 z-10 font-mono text-[10px] text-[#D1D4DC] select-none"
        />

        {/* Floating favorites toolbar */}
        <FloatingFavorites
          favorites={favorites}
          tool={activeTool}
          onTool={pickTool}
          onUnstar={(t) => setFavorites((f) => f.filter((x) => x !== t))}
        />
      </div>
    </div>
  );
});

/* ═══════════════════════════ The App ══════════════════════════════ */

type ConnStatus = "demo" | "connecting" | "online" | "offline";

export default function App({ initialMode }: { initialMode: string | null }) {
  /* ── refs that never trigger renders ── */
  const appRef = useRef<HTMLDivElement | null>(null);
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const feedRef = useRef<DemoFeed | null>(null);
  const wsRef = useRef<WSClient | null>(null);
  const startedRef = useRef(false);
  const lastBarTimeRef = useRef<number>(0);
  const pointsCacheRef = useRef<Record<string, { time: any; value: number }[]>>({});
  const undoStackRef = useRef<Drawing[][]>([]);
  const redoStackRef = useRef<Drawing[][]>([]);
  const prevSnapRef = useRef<Drawing[]>([]);
  const legendRefs = useRef<LegendRefs>({ o: null, h: null, l: null, c: null, chg: null, vol: null });
  const indicatorRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const fpsRef = useRef<HTMLSpanElement | null>(null);
  const clockRef = useRef<HTMLSpanElement | null>(null);
  const floatBarRef = useRef<HTMLDivElement | null>(null);
  const selBoxRef = useRef<SelectionBox | null>(null);

  /* ── UI state ── */
  const [page, setPage] = useState<"chart" | "builder">("chart");
  const [mode, setMode] = useState<"demo" | "server">(initialMode === "server" ? "server" : "demo");
  const [connStatus, setConnStatus] = useState<ConnStatus>(initialMode === "server" ? "connecting" : "demo");
  const [latency, setLatency] = useState<number | null>(null);
  const [btPlayback, setBtPlayback] = useState<{ active: boolean; paused: boolean; speed: number } | null>(null);
  const [btState, setBtState] = useState<BtState | null>(null);
  // One-time load of the saved workspace (UI prefs only — never market data).
  const savedRef = useRef<Partial<WorkspaceState> | null>(null);
  if (savedRef.current === null) savedRef.current = loadWorkspace() ?? {};
  const saved = savedRef.current;

  const [settings, setSettings] = useState<ChartSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...(saved.settings ?? {}),
    mode: initialMode === "server" ? "server" : "demo",
    wsUrl: (typeof window !== "undefined" && window.__trexWsUrl) || DEFAULT_SETTINGS.wsUrl,
  }));
  const [symbol, setSymbol] = useState(saved.symbol ?? DEFAULT_SETTINGS.symbol);
  const [timeframe, setTimeframe] = useState(saved.timeframe ?? DEFAULT_SETTINGS.timeframe);
  const [chartType, setChartTypeState] = useState<ChartType>(saved.chartType ?? "candles");
  const [tool, setToolState] = useState<DrawingTool>("cursor");
  const [magnet, setMagnetState] = useState(false);
  // Favorite drawing tools — shown in a floating toolbar over the chart
  // (like TradingView). Starred from the left-rail group menus.
  const [favorites, setFavorites] = useState<DrawingTool[]>(saved.favorites ?? []);
  const toggleFavorite = useCallback((t: DrawingTool) => {
    setFavorites((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));
  }, []);

  // Workspace layout — "single" (just the main chart) or multi-chart grids.
  // Secondary panels are independent compare charts; the main chart stays
  // the editable one with all the drawing tools.
  const [layout, setLayout] = useState<"single" | "split2" | "grid4">(saved.layout ?? "single");
  const [compareSymbols] = useState<string[]>(saved.compareSymbols ?? ["ETHUSDT", "SOLUSDT", "BNBUSDT"]);

  // Persist workspace preferences (debounced) whenever they change. UI
  // state only — never market data, which always comes fresh from the feed.
  useEffect(() => {
    const id = window.setTimeout(() => {
      saveWorkspace({ symbol, timeframe, chartType, settings, favorites, layout, compareSymbols });
    }, 400);
    return () => window.clearTimeout(id);
  }, [symbol, timeframe, chartType, settings, favorites, layout, compareSymbols]);

  const [hint, setHint] = useState("");
  const [selection, setSelection] = useState<SelectionMeta | null>(null);
  const [paneLayout, setPaneLayout] = useState<PaneLayoutEntry[]>([]);
  const [behind, setBehind] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxState | null>(null);
  const [bars, setBars] = useState(0);
  const [drawTick, setDrawTick] = useState(0); // refreshes undo/lock-all button states

  const [activeIds, setActiveIds] = useState<string[]>(["sma", "ema", "bb", "rsi", "macd"]);
  const [serverDefs, setServerDefs] = useState<SeriesDefinition[]>([]);
  const [serverVis, setServerVis] = useState<Record<string, boolean>>({});
  const [customDefs, setCustomDefs] = useState<SeriesDefinition[]>([]);
  const [appliedDefs, setAppliedDefs] = useState<SeriesDefinition[]>([]);

  // Symbols and indicator definitions fetched from the server on connect
  const [serverSymbols, setServerSymbols] = useState<Array<{ symbol: string; name?: string; type?: string }>>([]);
  const [serverAvailableIndicators, setServerAvailableIndicators] = useState<SeriesDefinition[]>([]);
  // Per-chart data for multi-chart server mode (keyed by chartId)
  const chartEnginesRef = useRef<Map<string, ChartEngine>>(new Map());
  const chartTimeframesRef = useRef<Map<string, string>>(new Map());

  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawSettingsOpen, setDrawSettingsOpen] = useState(false);

  /* render-time ref mirrors so the stable message handler never goes stale */
  const modeRef = useRef(mode); modeRef.current = mode;
  const symbolRef = useRef(symbol); symbolRef.current = symbol;
  const tfRef = useRef(timeframe); tfRef.current = timeframe;
  const activeIdsRef = useRef(activeIds); activeIdsRef.current = activeIds;
  const customDefsRef = useRef(customDefs); customDefsRef.current = customDefs;
  const serverDefsRef = useRef(serverDefs); serverDefsRef.current = serverDefs;
  const serverVisRef = useRef(serverVis); serverVisRef.current = serverVis;
  const settingsRef = useRef(settings); settingsRef.current = settings;

  // Precomputed per-key legend metadata (digits + color), rebuilt only
  // when the applied definitions change. The crosshair fires on every
  // mousemove, so resolving a series' digits via an O(n) defs.find() each
  // time was wasteful; this Map makes the lookup O(1) on the hot path.
  const legendMetaRef = useRef<Map<string, { digits: number; color: string }>>(new Map());
  useEffect(() => {
    const m = new Map<string, { digits: number; color: string }>();
    for (const d of appliedDefs) m.set(d.key, { digits: d.digits ?? 2, color: d.color });
    legendMetaRef.current = m;
  }, [appliedDefs]);

  /* ════════════ derived: indicator definitions to apply ════════════ */

  const registryDefs = useCallback((ids: string[]): SeriesDefinition[] =>
    ids
      .map((id) => INDICATOR_REGISTRY.find((s) => s.id === id))
      .filter((s): s is IndicatorSpec => !!s)
      .flatMap((s) => s.makeDefs()),
  []);

  /** Flush any cached full-series points for keys that now exist. */
  const flushPoints = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    for (const [key, pts] of Object.entries(pointsCacheRef.current)) {
      eng.setSeriesData(key, pts);
    }
  }, []);

  /**
   * Re-anchor server-streamed indicator series after a history prepend.
   *
   * The terminal performs NO indicator math of its own — every value
   * arrives pre-computed from the data source. When older candles are
   * prepended, the already-cached series points still describe the right
   * bars (they're keyed by time), so we simply re-push them so the
   * renderer re-seats them against the now-longer candle domain. This is
   * a pure render operation, not a computation.
   *
   * In demo mode the mock server additionally streams a fresh
   * `indicators` message after each history page, which flows through the
   * same render path — so this stays correct in both modes.
   */
  const reanchorServerSeries = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    for (const [key, pts] of Object.entries(pointsCacheRef.current)) {
      eng.setSeriesData(key, pts);
    }
  }, []);

  /* ═══════════════════ unified message pipeline ════════════════════ */

  const handleMessage = useCallback((msg: WSMessage) => {
    const eng = engineRef.current;
    if (!eng) return;

    switch (msg.type) {
      case "snapshot":
      case "init": {
        if (Array.isArray(msg.data)) {
          // Validate at the boundary: drop malformed bars, sort ascending,
          // collapse duplicate timestamps. The engine can then assume a
          // clean, strictly-increasing time domain.
          const candles = sanitizeCandles(msg.data);
          eng.setCandles(candles);
          const last = candles[candles.length - 1];
          lastBarTimeRef.current = last ? Number(last.time) : 0;
          const digits = msg.digits ?? detectPriceDigits(candles);
          eng.setPrecision(digits);
        }
        if (msg.symbol) setSymbol(msg.symbol);
        if (msg.timeframe) {
          setTimeframe(msg.timeframe);
          eng.setTimeframeSeconds(timeframeToSeconds(msg.timeframe));
        }
        pointsCacheRef.current = {};
        if (msg.definitions) {
          // Validate + fill defaults before the renderer sees them.
          const defs = sanitizeDefinitions(msg.definitions);
          if (modeRef.current === "demo") {
            eng.setDefinitions(defs);
            setAppliedDefs(defs);
          } else {
            eng.setDefinitions(defs);   // apply immediately so setSeriesData below finds the series
            setServerDefs(defs);
          }
        }
        if (msg.points) {
          for (const [key, raw] of Object.entries(msg.points)) {
            // Validate points (drops NaN/garbage, keeps per-point color).
            const pts = sanitizePoints(raw);
            pointsCacheRef.current[key] = pts;
            eng.setSeriesData(key, pts);
          }
        }
        if (msg.drawings) eng.remoteSet(sanitizeDrawings(msg.drawings));
        // No client-side math: the data source streams indicator points.
        setDrawTick((t) => t + 1);
        break;
      }

      case "candles": {
        if (Array.isArray(msg.data)) {
          const candles = sanitizeCandles(msg.data);
          eng.setCandles(candles);
          const last = candles[candles.length - 1];
          lastBarTimeRef.current = last ? Number(last.time) : 0;
        }
        break;
      }

      case "history": {
        // Validate the page: clean candles + a definitive end-of-history
        // flag (empty reply ⇒ nothing older exists).
        const page = sanitizeHistory(msg.data, msg.noMoreHistory);
        // ONE prepend — an empty page latches the "no older data" flag
        // inside the engine so it stops requesting.
        eng.prependHistory(page.noMoreHistory ? [] : page.data);
        // Re-seat the already-cached server series against the now-longer
        // candle domain (pure render, no math). In demo mode the mock
        // server also streams a fresh "indicators" page right after.
        if (page.data.length) reanchorServerSeries();
        break;
      }

      case "bar":
      case "tick":
      case "update": {
        // Validate the bar before it touches the series. A malformed bar
        // (NaN price, high<low, missing field) is dropped rather than
        // corrupting the candle domain and the indicators anchored to it.
        if (msg.bar && isValidBar(msg.bar)) {
          const t = Number(msg.bar.time);
          lastBarTimeRef.current = Math.max(lastBarTimeRef.current, t);
          eng.applyBar(msg.bar as OHLC);
          // If the server sends `digits` alongside the bar, re-apply precision.
          // Otherwise auto-detect from the bar's close price when no candles
          // have been loaded yet (e.g. symbol switch before snapshot arrives).
          if (msg.digits != null) {
            eng.setPrecision(msg.digits);
          } else if (eng.getDigits() === 2) {
            const d = detectPriceDigits([msg.bar]);
            if (d !== 2) eng.setPrecision(d);
          }
        }
        break;
      }

      case "definitions": {
        if (!msg.definitions) break;
        const defs = sanitizeDefinitions(msg.definitions);
        if (modeRef.current === "demo") {
          eng.setDefinitions(defs);
          setAppliedDefs(defs);
          flushPoints();
        } else {
          eng.setDefinitions(defs);   // apply immediately so subsequent indicator updates find the series
          setServerDefs(defs);
        }
        break;
      }

      case "indicators": {
        if (!msg.points) break;
        for (const [key, raw] of Object.entries(msg.points)) {
          if (!Array.isArray(raw) || raw.length === 0) continue;
          if (raw.length === 1) {
            if (!isValidPoint(raw[0])) continue;        // drop a bad tail point
            const pt = raw[0] as PointData;
            eng.updateSeriesLast(key, pt);
            // keep the cache's tail in sync without aliasing the engine copy
            const cached = pointsCacheRef.current[key];
            if (cached && cached.length) {
              const last = cached[cached.length - 1];
              if (Number(last.time) === Number(pt.time)) cached[cached.length - 1] = pt;
              else if (Number(pt.time) > Number(last.time)) cached.push(pt);
            } else {
              pointsCacheRef.current[key] = [pt];
            }
          } else {
            const pts = sanitizePoints(raw);
            pointsCacheRef.current[key] = pts;
            eng.setSeriesData(key, pts);
          }
        }
        break;
      }

      case "chartType": {
        const t = msg.chartType as ChartType;
        if (t && CHART_TYPES.some((c) => c.value === t)) {
          eng.setChartType(t);
          setChartTypeState(t);
        }
        break;
      }

      case "symbol":
        if (msg.symbol) setSymbol(msg.symbol);
        break;

      case "timeframe":
        if (msg.timeframe) {
          setTimeframe(msg.timeframe);
          eng.setTimeframeSeconds(timeframeToSeconds(msg.timeframe));
        }
        break;

      case "settings":
        if (msg.settings) {
          const next = { ...settingsRef.current, ...msg.settings };
          setSettings(next);
          eng.setSettings(next);
        }
        break;

      case "magnet":
        if (typeof msg.magnet === "boolean") {
          setMagnetState(msg.magnet);
          eng.setMagnet(msg.magnet);
        }
        break;

      case "fitContent": eng.fitContent(); break;
      case "scrollToEnd": eng.scrollToRealTime(); break;
      case "zoomRange":
        if (msg.zoomRange && Number.isFinite(msg.zoomRange.from) && Number.isFinite(msg.zoomRange.to))
          eng.setZoomRangeTimes(msg.zoomRange.from, msg.zoomRange.to);
        break;

      /* ── remote drawing sync (never echoes back) ── */
      case "drawings":
      case "drawing_set":
        eng.remoteSet(sanitizeDrawings(msg.drawings ?? []));
        setDrawTick((t) => t + 1);
        break;
      case "drawing":
      case "drawing_upsert":
        if (msg.drawing && isValidDrawing(msg.drawing)) { eng.remoteUpsert(msg.drawing); setDrawTick((t) => t + 1); }
        break;
      case "drawing_delete":
        eng.remoteDelete(msg.drawingIds ?? (msg.drawingId ? [msg.drawingId] : []));
        setDrawTick((t) => t + 1);
        break;
      case "drawings_clear":
        eng.remoteSet([]);
        setDrawTick((t) => t + 1);
        break;

      case "toast":
        if (msg.message) {
          const validKinds: ToastKind[] = ["info", "success", "error", "warning"];
          const kind: ToastKind = validKinds.includes(msg.toastType) ? msg.toastType : "info";
          showToast(msg.message, kind);
        }
        break;

      case "bt_playback_state": {
        const m = msg as any;
        if (m.active === false) {
          setBtPlayback(null);
          setBtState(null);
        } else {
          setBtPlayback({ active: true, paused: !!m.paused, speed: typeof m.speed === "number" ? m.speed : 1 });
        }
        break;
      }

      case "bt_state": {
        const m = msg as any;
        setBtState({
          balance:        m.balance        ?? 0,
          margin_used:    m.margin_used    ?? 0,
          unrealized_pnl: m.unrealized_pnl ?? 0,
          equity:         m.equity         ?? 0,
          positions:      m.positions      ?? [],
          orders:         m.orders         ?? [],
          trade_history:  m.trade_history  ?? [],
        });
        break;
      }

      case "error":
        if (msg.message) showToast(msg.message, "error");
        break;

      /* ── server symbol / indicator catalogues ── */
      case "symbols_list":
        if (Array.isArray((msg as any).symbols)) {
          setServerSymbols((msg as any).symbols);
        }
        break;

      case "indicators_list":
        if (Array.isArray((msg as any).indicators)) {
          const defs = sanitizeDefinitions((msg as any).indicators);
          setServerAvailableIndicators(defs);
        }
        break;

      /* ── secondary-chart messages for multi-chart layouts ── */
      case "chart_snapshot": {
        const cm = msg as any;
        const childEng = chartEnginesRef.current.get(cm.chartId);
        if (!childEng) break;
        if (Array.isArray(cm.data)) childEng.setCandles(sanitizeCandles(cm.data));
        if (cm.timeframe) {
          chartTimeframesRef.current.set(cm.chartId, cm.timeframe);
          childEng.setTimeframeSeconds(timeframeToSeconds(cm.timeframe));
        }
        if (cm.definitions) childEng.setDefinitions(sanitizeDefinitions(cm.definitions));
        if (cm.points) {
          for (const [key, raw] of Object.entries(cm.points as Record<string, unknown>)) {
            childEng.setSeriesData(key, sanitizePoints(raw));
          }
        }
        break;
      }

      case "chart_bar": {
        const cm = msg as any;
        const childEng = chartEnginesRef.current.get(cm.chartId);
        if (childEng && cm.bar && isValidBar(cm.bar)) {
          childEng.applyBar(cm.bar as OHLC);
          // optional realtime indicator points bundled with bar
          if (cm.points && typeof cm.points === "object") {
            for (const [key, raw] of Object.entries(cm.points as Record<string, unknown>)) {
              childEng.setSeriesData(key, sanitizePoints(raw));
            }
          }
        }
        break;
      }

      case "chart_history": {
        const cm = msg as any;
        const childEng = chartEnginesRef.current.get(cm.chartId);
        if (childEng && Array.isArray(cm.data)) {
          const page = sanitizeHistory(cm.data, cm.noMoreHistory);
          childEng.prependHistory(page.noMoreHistory ? [] : page.data);
        }
        break;
      }

      default:
        break;
    }
  }, [flushPoints, reanchorServerSeries]);

  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  /* ═════════════════════ feed orchestration ════════════════════════ */

  const stopFeeds = useCallback(() => {
    feedRef.current?.stop();
    wsRef.current?.disconnect();
    wsRef.current = null;
  }, []);

  const startDemo = useCallback(() => {
    stopFeeds();
    setMode("demo");
    setConnStatus("demo");
    setLatency(null);
    setBtPlayback(null);
    setBtState(null);
    setServerDefs([]);
    lastBarTimeRef.current = 0;
    if (!feedRef.current) feedRef.current = new DemoFeed((m) => handleMessageRef.current(m));
    feedRef.current.start({
      symbol: symbolRef.current,
      timeframe: tfRef.current,
      indicatorIds: activeIdsRef.current,
      customDefs: customDefsRef.current.filter((d) => d.visible !== false),
    });
  }, [stopFeeds]);

  const startServer = useCallback((url: string) => {
    stopFeeds();
    setMode("server");
    setConnStatus("connecting");
    setSettings((s) => ({ ...s, wsUrl: url, mode: "server" }));
    lastBarTimeRef.current = 0;
    const ws = new WSClient(
      url,
      (m) => handleMessageRef.current(m),
      (ok) => {
        setConnStatus(ok ? "online" : "offline");
        if (!ok) { setBtPlayback(null); setBtState(null); }
        if (ok) {
          // Re-send handshake on every (re)connect so the server session gets
          // the current symbol/timeframe even after a reconnect.
          ws.send(makeHello("trex-terminal", APP_VERSION, 5000));
          ws.send({ type: "symbol", symbol: symbolRef.current });
          ws.send({ type: "timeframe", timeframe: tfRef.current });
          ws.send({ type: "get_symbols" });
          ws.send({ type: "get_indicators" });
        }
      },
      (rtt) => setLatency(rtt)
    );
    wsRef.current = ws;
    ws.connect();
  }, [stopFeeds]);

  /* ═══════════════════════ engine bootstrap ════════════════════════ */

  useEffect(() => {
    const host = chartHostRef.current;
    if (!host) return;

    const engine = new ChartEngine(host, settingsRef.current, {
      onCrosshair: (p: CrosshairPayload) => {
        const r = legendRefs.current;
        const d = engineRef.current?.getDigits() ?? 2;
        if (p.bar) {
          const up = p.bar.close >= p.bar.open;
          const col = up ? "#089981" : "#F23645";
          if (r.o) { r.o.textContent = fmtNum(p.bar.open, d); r.o.style.color = col; }
          if (r.h) { r.h.textContent = fmtNum(p.bar.high, d); r.h.style.color = col; }
          if (r.l) { r.l.textContent = fmtNum(p.bar.low, d); r.l.style.color = col; }
          if (r.c) { r.c.textContent = fmtNum(p.bar.close, d); r.c.style.color = col; }
          if (r.chg) {
            const cc = p.changeAbs >= 0 ? "#089981" : "#F23645";
            r.chg.textContent = `${p.changeAbs >= 0 ? "+" : ""}${fmtNum(p.changeAbs, d)} (${p.changePct >= 0 ? "+" : ""}${p.changePct.toFixed(2)}%)`;
            r.chg.style.color = cc;
          }
          if (r.vol) r.vol.textContent = p.volume !== null ? fmtCompact(p.volume) : "—";
        }
        const meta = legendMetaRef.current;
        for (const [key, el] of indicatorRefs.current) {
          const v = p.indicatorValues[key];
          const m = meta.get(key);
          el.textContent = v === null || v === undefined ? "—" : fmtNum(v, m?.digits ?? 2);
        }
      },
      onSelectionChange: (meta) => {
        setSelection(meta);
        if (!meta) setDrawSettingsOpen(false);
      },
      onSelectionBox: (box) => {
        selBoxRef.current = box;
        const el = floatBarRef.current;
        const host2 = chartHostRef.current;
        if (!el) return;
        if (!box || !host2) { el.style.visibility = "hidden"; return; }
        const bw = el.offsetWidth || 260;
        const left = Math.max(6, Math.min(box.x + box.w / 2 - bw / 2, host2.clientWidth - bw - 6));
        let top = box.y - 44;
        if (top < 6) top = Math.min(box.y + box.h + 10, host2.clientHeight - 44);
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.visibility = "visible";
      },
      onDrawingsCommit: (e: DrawingsCommit) => {
        const eng = engineRef.current!;
        const snap = eng.getDrawingsSnapshot();
        if (e.source === "local") {
          undoStackRef.current.push(prevSnapRef.current);
          if (undoStackRef.current.length > 100) undoStackRef.current.shift();
          redoStackRef.current = [];
          prevSnapRef.current = snap;
          // Sync to all other charts showing the same symbol
          drawingsBusRef.current.broadcast("main", symbolRef.current, snap);
        } else {
          prevSnapRef.current = snap;
        }
        setDrawTick((t) => t + 1);
      },
      onNeedHistory: (before, count, fromTime) => {
        if (modeRef.current === "demo") feedRef.current?.requestHistory(before, count);
        else {
          // Send from/to range so server can serve exact window of 5000 candles
          const msg: { type: "history"; before: number; count: number; from?: number; to?: number } = {
            type: "history", before, count,
          };
          if (fromTime !== undefined) msg.from = fromTime;
          msg.to = before;
          wsRef.current?.send(msg);
        }
      },
      onPaneLayout: (layout) => setPaneLayout(layout),
      onRealtimeGapChange: (b) => setBehind(b),
      onContextMenu: (x, y, drawingId) => setCtxMenu({ x, y, drawingId }),
      onDblClickEmpty: () => toggleFullscreen(),
      onEditDrawing: () => setDrawSettingsOpen(true),
      onHint: (h) => setHint(h),
      onToolDone: () => {
        setToolState("cursor");
        engineRef.current?.setTool("cursor");
      },
    });
    engineRef.current = engine;

    // Register main chart with the drawing sync bus
    drawingsBusRef.current.register("main", (incomingSym, drawings) => {
      if (incomingSym === symbolRef.current && engineRef.current) {
        engineRef.current.restoreDrawings(drawings);
      }
    });

    // E2E test hook — only when explicitly enabled via ?e2e=1. Exposes
    // read-only diagnostics for Playwright assertions; never present in
    // a normal production session.
    if (typeof window !== "undefined" && window.location.search.includes("e2e=1")) {
      (window as unknown as { __trexTest?: unknown }).__trexTest = {
        candleDomain: () => {
          const c = engine.getCandles();
          return { n: c.length, last: c.length ? Number(c[c.length - 1].time) : 0 };
        },
        indicatorDomains: () => engine.indicatorDomains(),
        drawings: () => engine.getDrawingsSnapshot().map((d) => d.tool),
      };
    }

    /* kick off the data source exactly once */
    if (!startedRef.current) {
      startedRef.current = true;
      if (initialMode === "server" && window.__trexWsUrl) startServer(window.__trexWsUrl);
      else startDemo();
    }

    return () => {
      drawingsBusRef.current.unregister("main");
      stopFeeds();
      engine.dispose();
      engineRef.current = null;
      startedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ═════════════ apply indicator selections to the feed ════════════ */

  useEffect(() => {
    if (!startedRef.current) return;
    if (mode === "demo") {
      feedRef.current?.setIndicators(activeIds, customDefs.filter((d) => d.visible !== false));
    } else {
      const eng = engineRef.current;
      if (!eng) return;
      const merged: SeriesDefinition[] = [
        ...serverDefs.map((d) => ({ ...d, visible: serverVis[d.key] ?? d.visible })),
        ...registryDefs(activeIds),
        ...customDefs,
      ];
      eng.setDefinitions(merged);
      setAppliedDefs(merged);
      flushPoints();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds, customDefs, serverDefs, serverVis, mode]);

  /* ════════════════════ FPS / clock / bars (1 Hz) ═══════════════════ */

  useEffect(() => {
    let frames = 0;
    let raf = 0;
    const loop = () => { frames++; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const tick = setInterval(() => {
      if (fpsRef.current) fpsRef.current.textContent = String(Math.min(frames, 144));
      frames = 0;
      if (clockRef.current) {
        clockRef.current.textContent = new Date().toISOString().slice(11, 19);
      }
      setBars(engineRef.current?.barCount() ?? 0);
    }, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(tick); };
  }, []);

  /* ═════════════════════════ actions ═══════════════════════════════ */

  const setTool = useCallback((t: DrawingTool) => {
    setToolState(t);
    engineRef.current?.setTool(t);
    if (t === "cursor" || t === "crosshair") setHint("");
  }, []);

  const toggleMagnet = useCallback(() => {
    setMagnetState((m) => {
      engineRef.current?.setMagnet(!m);
      showToast(`Magnet ${!m ? "on" : "off"}`, "info");
      return !m;
    });
  }, []);

  const undo = useCallback(() => {
    const eng = engineRef.current;
    if (!eng || !undoStackRef.current.length) return;
    redoStackRef.current.push(eng.getDrawingsSnapshot());
    const snap = undoStackRef.current.pop()!;
    eng.restoreDrawings(snap);
  }, []);

  const redo = useCallback(() => {
    const eng = engineRef.current;
    if (!eng || !redoStackRef.current.length) return;
    undoStackRef.current.push(eng.getDrawingsSnapshot());
    const snap = redoStackRef.current.pop()!;
    eng.restoreDrawings(snap);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = appRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => showToast("Fullscreen blocked by the browser", "warning"));
  }, []);

  const changeSymbol = useCallback((s: string) => {
    pointsCacheRef.current = {};   // stale indicator data must not leak to new symbol
    setSymbol(s);
    if (modeRef.current === "demo") {
      feedRef.current?.start({
        symbol: s, timeframe: tfRef.current,
        indicatorIds: activeIdsRef.current,
        customDefs: customDefsRef.current.filter((d) => d.visible !== false),
      });
    } else {
      wsRef.current?.send({ type: "symbol", symbol: s });
    }
  }, []);

  const changeTimeframe = useCallback((tf: string) => {
    pointsCacheRef.current = {};   // stale indicator data must not leak to new timeframe
    setTimeframe(tf);
    engineRef.current?.setTimeframeSeconds(timeframeToSeconds(tf));
    if (modeRef.current === "demo") {
      feedRef.current?.start({
        symbol: symbolRef.current, timeframe: tf,
        indicatorIds: activeIdsRef.current,
        customDefs: customDefsRef.current.filter((d) => d.visible !== false),
      });
    } else {
      wsRef.current?.send({ type: "timeframe", timeframe: tf });
    }
  }, []);

  const changeChartType = useCallback((t: ChartType) => {
    setChartTypeState(t);
    engineRef.current?.setChartType(t);
    if (modeRef.current === "server") wsRef.current?.send({ type: "chartType", chartType: t });
  }, []);

  const applySettings = useCallback((s: ChartSettings) => {
    setSettings(s);
    engineRef.current?.setSettings(s);
  }, []);

  const doScreenshot = useCallback(async (kind: "copy" | "png" | "pdf") => {
    const eng = engineRef.current;
    if (!eng) return;
    const canvas = eng.screenshotCanvas();
    const name = `Trex_${symbolRef.current}_${tfRef.current}_${nowStamp()}`;
    if (kind === "pdf") {
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: canvas.width >= canvas.height ? "landscape" : "portrait", unit: "px", format: [canvas.width, canvas.height] });
      pdf.addImage(img, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`${name}.pdf`);
      showToast("PDF exported", "success");
      return;
    }
    canvas.toBlob(async (blob) => {
      if (!blob) { showToast("Screenshot failed", "error"); return; }
      if (kind === "copy") {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          showToast("Chart image copied to clipboard", "success");
          return;
        } catch {
          showToast("Clipboard blocked — saving PNG instead", "warning");
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      if (kind === "png") showToast("PNG saved", "success");
    }, "image/png");
  }, []);

  const removeDef = useCallback((def: SeriesDefinition) => {
    /* figure out where this definition came from and remove/hide it there */
    const spec = INDICATOR_REGISTRY.find((s) => s.makeDefs().some((d) => d.key === def.key));
    if (spec && activeIdsRef.current.includes(spec.id)) {
      setActiveIds((ids) => ids.filter((i) => i !== spec.id));
      return;
    }
    if (customDefsRef.current.some((d) => d.key === def.key)) {
      setCustomDefs((ds) => ds.filter((d) => d.key !== def.key));
      return;
    }
    setServerVis((v) => ({ ...v, [def.key]: false }));
  }, []);

  const layoutRef = useRef(layout); layoutRef.current = layout;
  const compareSymbolsRef = useRef(compareSymbols); compareSymbolsRef.current = compareSymbols;

  // Stable bus for cross-chart drawing synchronization.
  // All charts (main + secondary) register handlers here; broadcasting
  // to the bus propagates drawings to every other chart showing the same symbol.
  const drawingsBusRef = useRef(new DrawingsSyncBus());

  const changeLayout = useCallback((newLayout: "single" | "split2" | "grid4") => {
    setLayout(newLayout);
    if (modeRef.current === "server" && wsRef.current) {
      const count = newLayout === "split2" ? 1 : newLayout === "grid4" ? 3 : 0;
      const syms = compareSymbolsRef.current;
      const charts = [
        { chartId: "main", symbol: symbolRef.current, timeframe: tfRef.current, indicators: serverDefsRef.current.map((d) => d.key) },
        ...Array.from({ length: count }, (_, i) => ({
          chartId: `chart_${i}`,
          symbol: syms[i] ?? symbolRef.current,
          timeframe: "1m",
          indicators: [] as string[],
        })),
      ];
      wsRef.current.send({ type: "layout", layout: newLayout, charts });
    }
  }, []);

  // Called by each ComparePanel whenever symbol/timeframe/indicators change.
  const sendChartSymbol = useCallback((chartId: string, symbol: string, timeframe: string, indicators: string[]) => {
    if (modeRef.current === "server" && wsRef.current) {
      wsRef.current.send({ type: "chart_symbol", chartId, symbol, timeframe, indicators });
    }
  }, []);

  const switchMode = useCallback((m: "demo" | "server", url?: string) => {
    if (m === "demo") { startDemo(); showToast("Switched to demo simulation", "info"); }
    else {
      const u = url || settingsRef.current.wsUrl;
      if (!/^wss?:\/\//.test(u)) { showToast("URL must start with ws:// or wss://", "error"); return; }
      startServer(u);
      showToast(`Connecting to ${u}…`, "info");
    }
  }, [startDemo, startServer]);

  /* ═══════════════════ keyboard shortcuts ═══════════════════════════ */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

      if (e.key === "Escape") {
        // Escape should always dismiss the topmost overlay, even when a
        // field inside it is focused (e.g. the Indicators search box,
        // which autofocuses). Blur first so the keystroke can't get
        // swallowed by the input, then close in priority order.
        if (typing && t) t.blur();
        if (drawSettingsOpen) { setDrawSettingsOpen(false); return; }
        if (settingsOpen) { setSettingsOpen(false); return; }
        if (indicatorsOpen) { setIndicatorsOpen(false); return; }
        if (ctxMenu) { setCtxMenu(null); return; }
        if (typing) return; // a stray field with nothing to close — leave it
        const eng = engineRef.current;
        if (eng?.cancelPlacement()) { setTool("cursor"); return; }
        if (eng?.hasSelection()) { eng.selectDrawing(null); return; }
        if (tool !== "cursor") setTool("cursor");
        return;
      }
      if (typing) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        engineRef.current?.deleteSelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); return; }
      if (e.key === "Enter") { engineRef.current?.finishPolyline(); return; }
      if (e.key.toLowerCase() === "m" && !e.ctrlKey && !e.metaKey && !e.altKey) { toggleMagnet(); return; }
      if (e.altKey) {
        const map: Record<string, DrawingTool> = { t: "trendline", h: "horizontal", v: "vertical", f: "fibRetracement", r: "rectangle" };
        const tl = map[e.key.toLowerCase()];
        if (tl) { e.preventDefault(); setTool(tl); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, ctxMenu, drawSettingsOpen, settingsOpen, indicatorsOpen, setTool, toggleMagnet, undo, redo]);

  /* ═══════════════════ render helpers / status ═════════════════════ */

  const connMeta: Record<ConnStatus, { label: string; color: string }> = {
    demo: { label: "DEMO", color: "#FF9800" },
    connecting: { label: "CONNECTING", color: "#FCD535" },
    online: { label: "LIVE", color: "#089981" },
    offline: { label: "RECONNECTING", color: "#F23645" },
  };
  const conn = connMeta[connStatus];
  const eng = engineRef.current;
  void drawTick; // state exists purely to refresh the booleans below
  const hasDrawings = eng?.hasDrawings() ?? false;
  const allLocked = eng?.allLocked() ?? false;
  const allHidden = eng?.allHidden() ?? false;
  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  const ctxDrawing = ctxMenu?.drawingId ? eng?.getDrawing(ctxMenu.drawingId) : null;

  const defaultHint = tool !== "cursor" && tool !== "crosshair"
    ? `${TOOL_META[tool].label} active`
    : "Scroll to zoom · Drag to pan · Shift+drag to box-zoom · Double-click for fullscreen";

  /* ═══════════════════════════ render ═══════════════════════════════ */

  return (
    <div ref={appRef} className="flex h-full min-h-0 flex-col bg-[#131722] text-[#D1D4DC]">
      <TopBar
        symbol={symbol}
        timeframe={timeframe}
        chartType={chartType}
        magnet={magnet}
        canUndo={canUndo}
        canRedo={canRedo}
        connLabel={conn.label}
        connColor={conn.color}
        latency={mode === "server" ? latency : null}
        mode={mode}
        wsUrl={settings.wsUrl}
        serverSymbols={serverSymbols}
        onSymbol={changeSymbol}
        onTimeframe={changeTimeframe}
        onChartType={changeChartType}
        onToggleMagnet={toggleMagnet}
        onUndo={undo}
        onRedo={redo}
        onOpenIndicators={() => setIndicatorsOpen(true)}
        onOpenBuilder={() => setPage("builder")}
        onOpenSettings={() => setSettingsOpen(true)}
        onScreenshot={doScreenshot}
        onFullscreen={toggleFullscreen}
        layout={layout}
        onLayout={changeLayout}
        onZoomIn={() => engineRef.current?.zoomIn()}
        onZoomOut={() => engineRef.current?.zoomOut()}
        onFit={() => engineRef.current?.fitContent()}
        onSwitchMode={switchMode}
      />

      {/* ── Backtest Playback Bar ── */}
      {btPlayback && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 14px", background: "#1a1d27", borderBottom: "1px solid #2a2d3a", height: 36, flexShrink: 0 }}>
          {/* badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: 4, padding: "2px 8px", fontSize: 10.5, fontWeight: 700, color: "#f5a623", letterSpacing: "0.04em" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: btPlayback.paused ? "#6b7280" : "#22c55e", display: "inline-block" }} />
            BACKTEST
          </div>
          {/* play / pause */}
          <button
            type="button"
            onClick={() => wsRef.current?.send({ type: "bt_playback", action: btPlayback.paused ? "play" : "pause" })}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 4, border: "1px solid #3a3f4b", background: "#22252d", cursor: "pointer", color: "#e2e4eb", flexShrink: 0 }}
            title={btPlayback.paused ? "Resume" : "Pause"}
          >
            {btPlayback.paused
              ? <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><path d="M0 0l10 6-10 6z"/></svg>
              : <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="0" y="0" width="3.5" height="12"/><rect x="6.5" y="0" width="3.5" height="12"/></svg>
            }
          </button>
          {/* speed buttons */}
          <div style={{ display: "flex", gap: 3 }}>
            {[0.5, 1, 2, 5, 10, 30, 0].map(s => {
              const label = s === 0 ? "MAX" : `${s}×`;
              const active = Math.abs(btPlayback.speed - s) < 0.01;
              return (
                <button key={s} type="button"
                  onClick={() => wsRef.current?.send({ type: "bt_playback", action: "speed", value: s })}
                  style={{ padding: "1px 7px", fontSize: 11, fontWeight: active ? 700 : 500, borderRadius: 3, border: `1px solid ${active ? "#f5a623" : "#3a3f4b"}`, background: active ? "rgba(245,166,35,0.15)" : "#22252d", color: active ? "#f5a623" : "#9da3b0", cursor: "pointer", lineHeight: "20px" }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {/* status text */}
          <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 4 }}>
            {btPlayback.paused ? "Paused" : btPlayback.speed === 0 ? "Max speed" : `${btPlayback.speed}× speed`}
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <LeftBar
          tool={tool}
          magnet={magnet}
          hasDrawings={hasDrawings}
          allLocked={allLocked}
          allHidden={allHidden}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onTool={setTool}
          onToggleMagnet={toggleMagnet}
          onLockAll={() => engineRef.current?.setAllLocked(!allLocked)}
          onHideAll={() => engineRef.current?.setAllHidden(!allHidden)}
          onClearAll={() => { engineRef.current?.clearDrawings(); showToast("All drawings removed (Ctrl+Z to undo)", "info"); }}
        />

        {/* ── workspace: main chart + optional compare panels ── */}
        <div
          className={cn(
            "grid min-w-0 flex-1 gap-px bg-[#2A2E39]",
            layout === "single" && "grid-cols-1 grid-rows-1",
            layout === "split2" && "grid-cols-2 grid-rows-1",
            layout === "grid4" && "grid-cols-2 grid-rows-2"
          )}
        >
          {/* main (editable) chart */}
          <div className="relative min-w-0 bg-[#131722]">
            <div ref={chartHostRef} className="absolute inset-0" />

            <FloatingFavorites
              favorites={favorites}
              tool={tool}
              onTool={setTool}
              onUnstar={toggleFavorite}
            />

          <LegendOverlay
            symbol={symbol}
            timeframe={TIMEFRAMES.find((t) => t.value === timeframe)?.label ?? timeframe}
            chartType={chartType}
            defs={appliedDefs.filter((d) => d.visible !== false)}
            paneLayout={paneLayout}
            legendRefs={legendRefs}
            indicatorRefs={indicatorRefs}
            onRemoveDef={removeDef}
          />

          {/* floating drawing toolbar (positioned imperatively) */}
          {selection && (
            <FloatingToolbar
              meta={selection}
              barRef={floatBarRef}
              onStyle={(patch) => engineRef.current?.updateDrawingStyle(selection.id, patch)}
              onClone={() => engineRef.current?.cloneDrawing(selection.id)}
              onLockToggle={() => engineRef.current?.updateDrawingProps(selection.id, { locked: !selection.locked })}
              onSettings={() => setDrawSettingsOpen(true)}
              onDelete={() => engineRef.current?.deleteDrawing(selection.id)}
            />
          )}

          {/* go-to-realtime */}
          {behind && (
            <button
              type="button"
              data-tip="Go to realtime"
              onClick={() => engineRef.current?.scrollToRealTime()}
              className="trex-fade absolute bottom-10 right-[76px] z-30 flex h-8 w-8 items-center justify-center rounded-full border border-[#363A45] bg-[#1E222D] text-[#2962FF] shadow-lg shadow-black/40 hover:bg-[#2A2E39]"
            >
              <span className="rotate-180 inline-flex"><IconArrowLeft /></span>
            </button>
          )}

          {ctxMenu && (
            <ContextMenu
              ctx={ctxMenu}
              locked={ctxDrawing?.locked ?? false}
              hidden={ctxDrawing ? !ctxDrawing.visible : false}
              settings={settings}
              onClose={() => setCtxMenu(null)}
              onEdit={() => { setCtxMenu(null); setDrawSettingsOpen(true); }}
              onClone={() => { if (ctxMenu.drawingId) engineRef.current?.cloneDrawing(ctxMenu.drawingId); setCtxMenu(null); }}
              onLock={() => { if (ctxDrawing) engineRef.current?.updateDrawingProps(ctxDrawing.id, { locked: !ctxDrawing.locked }); setCtxMenu(null); }}
              onHide={() => { if (ctxDrawing) engineRef.current?.updateDrawingProps(ctxDrawing.id, { visible: !ctxDrawing.visible }); setCtxMenu(null); }}
              onDelete={() => { if (ctxMenu.drawingId) engineRef.current?.deleteDrawing(ctxMenu.drawingId); setCtxMenu(null); }}
              onAddHLine={() => { engineRef.current?.addHorizontalAt(ctxMenu.y); setCtxMenu(null); }}
              onFit={() => { engineRef.current?.fitContent(); setCtxMenu(null); }}
              onResetScale={() => { engineRef.current?.resetPriceScale(); setCtxMenu(null); }}
              onToggleGrid={() => { applySettings({ ...settings, showGrid: !settings.showGrid }); setCtxMenu(null); }}
              onToggleVolume={() => { applySettings({ ...settings, showVolume: !settings.showVolume }); setCtxMenu(null); }}
              onScreenshot={() => { doScreenshot("png"); setCtxMenu(null); }}
              onClearAll={() => { engineRef.current?.clearDrawings(); setCtxMenu(null); }}
            />
          )}

          <ToastHost />
          </div>

          {/* secondary compare panels (multi-chart layouts) */}
          {layout !== "single" && compareSymbols.slice(0, layout === "split2" ? 1 : 3).map((sym, i) => (
            <ComparePanel
              key={`cmp-${i}`}
              index={i}
              chartId={`chart_${i}`}
              symbol={sym}
              timeframe="1m"
              mode={mode}
              serverSymbols={serverSymbols}
              serverAvailableIndicators={serverAvailableIndicators}
              onRegisterEngine={(chartId, engine) => { chartEnginesRef.current.set(chartId, engine); }}
              onUnregisterEngine={(chartId) => { chartEnginesRef.current.delete(chartId); }}
              onNeedHistory={(chartId, before, count, fromTime) => {
                if (mode === "server" && wsRef.current) {
                  wsRef.current.send({ type: "history", before, count, from: fromTime, to: before, chartId });
                }
              }}
              onSendToServer={sendChartSymbol}
              drawingsBus={drawingsBusRef.current}
            />
          ))}
        </div>
      </div>

      {btState && <BtPanel state={btState} />}

      <StatusBar
        connLabel={conn.label}
        connColor={conn.color}
        latency={mode === "server" ? latency : null}
        symbol={symbol}
        timeframe={TIMEFRAMES.find((t) => t.value === timeframe)?.label ?? timeframe}
        hint={hint || defaultHint}
        fpsRef={fpsRef}
        clockRef={clockRef}
        bars={bars}
      />

      {/* ── dialogs ── */}
      <ChartSettingsDialog open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onChange={applySettings} />
      <DrawingSettingsDialog
        open={drawSettingsOpen && !!selection}
        meta={selection}
        digits={engineRef.current?.getDigits() ?? 2}
        onClose={() => setDrawSettingsOpen(false)}
        onStyle={(patch) => selection && engineRef.current?.updateDrawingStyle(selection.id, patch)}
        onProps={(patch) => selection && engineRef.current?.updateDrawingProps(selection.id, patch)}
      />
      <IndicatorsModal
        open={indicatorsOpen}
        mode={mode}
        activeIds={activeIds}
        serverDefs={serverDefs}
        serverVis={serverVis}
        serverAvailableIndicators={serverAvailableIndicators}
        customDefs={customDefs}
        onClose={() => setIndicatorsOpen(false)}
        onToggleId={(id) => setActiveIds((ids) => ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id])}
        onToggleServer={(key) => setServerVis((v) => ({ ...v, [key]: !(v[key] ?? true) }))}
        onToggleAvailable={(def) => {
          // If this def is already active (in serverDefs), remove it; otherwise request it
          const isActive = serverDefs.some((d) => d.key === def.key);
          if (isActive) {
            setServerDefs((ds) => ds.filter((d) => d.key !== def.key));
          } else {
            const newDefs = [...serverDefs, def];
            setServerDefs(newDefs);
            // Notify server that we want this indicator's data
            if (wsRef.current) {
              wsRef.current.send({ type: "chart_symbol", chartId: "main", symbol: symbolRef.current, timeframe: tfRef.current, indicators: newDefs.map((d) => d.key) });
            }
          }
        }}
        onRemoveCustom={(key) => setCustomDefs((ds) => ds.filter((d) => d.key !== key))}
        onToggleCustom={(key) => setCustomDefs((ds) => ds.map((d) => d.key === key ? { ...d, visible: !(d.visible !== false) } : d))}
        onOpenBuilder={() => { setIndicatorsOpen(false); setPage("builder"); }}
      />

      {/* ── Indicator Builder (full-screen overlay; chart stays mounted) ── */}
      {page === "builder" && (
        <BuilderPage
          initial={customDefs}
          onBack={() => setPage("chart")}
          onApply={(defs) => {
            setCustomDefs(defs);
            setPage("chart");
            showToast(`${defs.length} custom indicator${defs.length === 1 ? "" : "s"} applied`, "success");
          }}
        />
      )}
    </div>
  );
}

/* keep TS happy about the CSSProperties import used by styled spots */
export type { CSSProperties as _TrexCSS };
