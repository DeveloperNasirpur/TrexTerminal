import { useState, useEffect, useRef, type ReactNode } from "react";
import { IconArrowLeft } from "./icons";

type Lang = "fa" | "en";

function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div dir="ltr" className="my-4 overflow-hidden" style={{ background: "#141720", border: "1px solid #2a2d36", borderRadius: 8 }}>
      {lang && (
        <div className="flex items-center gap-1.5 px-3.5 py-2" style={{ borderBottom: "1px solid #2a2d36", background: "#141720" }}>
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          <span className="ms-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "#5c6070" }}>{lang}</span>
        </div>
      )}
      <pre className="trex-scroll overflow-x-auto p-4 text-left font-mono text-[11.5px] leading-relaxed" style={{ color: "#c8d0dc" }}>{children}</pre>
    </div>
  );
}

function K({ children }: { children: ReactNode }) {
  return (
    <code dir="ltr" className="rounded-[5px] px-1.5 py-px font-mono text-[12px]"
      style={{ border: "1px solid #3a3f4b", background: "#1c1f26", color: "#f5a623" }}>
      {children}
    </code>
  );
}

function Note({ kind = "note", children }: { kind?: "note" | "warn" | "tip"; children: ReactNode }) {
  const tone = {
    note: { bar: "#3b82f6", bg: "rgba(59,130,246,0.1)", text: "#93c5fd" },
    warn: { bar: "#ef4444", bg: "rgba(239,68,68,0.1)", text: "#fca5a5" },
    tip:  { bar: "#22c55e", bg: "rgba(34,197,94,0.1)", text: "#86efac" },
  }[kind];
  return (
    <div className="my-4 rounded-[6px] px-4 py-3 text-[13.5px] leading-relaxed"
      style={{ borderInlineStart: `4px solid ${tone.bar}`, background: tone.bg, color: tone.text }}>
      {children}
    </div>
  );
}

function Section({ id, title, hidden, children }: { id: string; title: string; hidden?: boolean; children: ReactNode }) {
  return (
    <div style={{ display: hidden ? "none" : "" }}>
      <section id={id} className="scroll-mt-[68px]">
        <h2 style={{ fontSize: 21, fontWeight: 700, color: "#e2e4eb", paddingTop: 40, marginBottom: 14, lineHeight: 1.3 }} dir="auto">{title}</h2>
        <div className="space-y-3 text-start leading-[1.85]" style={{ fontSize: 14.5, color: "#cdd2db" }}>{children}</div>
      </section>
      <hr style={{ borderColor: "#2e3340", margin: "32px 0 0 0" }} />
    </div>
  );
}

interface MsgRow { type: string; payload: string; desc: string }

function MsgTable({ rows, headers, fa }: { rows: MsgRow[]; headers: [string, string, string]; fa: boolean }) {
  return (
    <div dir="ltr" className="trex-scroll my-4 overflow-x-auto" style={{ borderRadius: 8, border: "1px solid #2e3340" }}>
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider" style={{ borderBottom: "1px solid #2e3340", background: "#1c1f26", color: "#8c959f" }}>
            <th className="px-3.5 py-2.5 font-semibold">{headers[0]}</th>
            <th className="px-3.5 py-2.5 font-semibold">{headers[1]}</th>
            <th className="px-3.5 py-2.5 font-semibold">{headers[2]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.type + i} className="align-top" style={{ borderTop: "1px solid #2e3340", background: i % 2 ? "#22252d" : "#1c1f26" }}>
              <td className="whitespace-nowrap px-3.5 py-2.5 font-mono font-medium" style={{ color: "#60a5fa" }}>{r.type}</td>
              <td className="px-3.5 py-2.5 font-mono text-[12px]" style={{ color: "#8c959f" }}>{r.payload}</td>
              <td className="px-3.5 py-2.5" style={{ color: "#cdd2db" }} dir={fa ? "rtl" : "ltr"}>{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KVTable({ rows, fa }: { rows: [string, string][]; fa: boolean }) {
  return (
    <div dir="ltr" className="trex-scroll my-4 overflow-x-auto" style={{ borderRadius: 8, border: "1px solid #2e3340" }}>
      <table className="w-full border-collapse text-left text-[13px]">
        <tbody>
          {rows.map(([k, d], i) => (
            <tr key={k + i} style={{ borderTop: i === 0 ? "none" : "1px solid #2e3340", background: i % 2 ? "#22252d" : "#1c1f26" }}>
              <td className="whitespace-nowrap px-3.5 py-2.5 font-mono font-medium" style={{ color: "#60a5fa", minWidth: 200 }}>{k}</td>
              <td className="px-3.5 py-2.5" style={{ color: "#cdd2db" }} dir={fa ? "rtl" : "ltr"}>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════ data ═══════════════════════ */

const clientRows = (fa: boolean): MsgRow[] => [
  { type: "hello",         payload: `{ client, version, protocol, initialCount? }`, desc: fa ? "هندشیک اولیه — بلافاصله پس از اتصال ارسال می‌شود. initialCount تعداد کندل‌های اولیه را مشخص می‌کند (پیش‌فرض ۵۰۰۰)." : "Opening handshake — sent immediately after the socket opens. initialCount sets how many initial candles to receive (default 5000)." },
  { type: "ping",          payload: `{ t? }`,                       desc: fa ? "هر ۱۵ ثانیه؛ t زمان ارسال کلاینت (ms) است تا RTT محاسبه شود." : "Every 15 s; t is the client send-time in ms so RTT can be computed." },
  { type: "symbol",        payload: `{ symbol }`,                   desc: fa ? "کاربر نماد را عوض کرد؛ سرور snapshot تازه می‌فرستد." : "User changed the symbol; server replies with a fresh snapshot." },
  { type: "timeframe",     payload: `{ timeframe }`,                desc: fa ? "کاربر تایم‌فریم را عوض کرد." : "User changed the timeframe." },
  { type: "history",       payload: `{ before, count, from?, to? }`,desc: fa ? "لیزی‌لود هنگام پن به چپ. before unix-seconds اکلوسیو است." : "Lazy-load when panning left. before is an exclusive unix-second lower bound." },
  { type: "chartType",     payload: `{ chartType }`,                desc: fa ? "اطلاع‌رسانی: نوع نمایش عوض شد (candles/heikin/line/area/bars)." : "Informational: display type changed (candles/heikin/line/area/bars)." },
  { type: "get_symbols",   payload: `{}`,                           desc: fa ? "درخواست لیست نمادهای موجود." : "Request the list of available symbols." },
  { type: "get_indicators",payload: `{}`,                           desc: fa ? "درخواست لیست اندیکاتورهای موجود." : "Request the list of available indicators." },
  { type: "layout",        payload: `{ layout, charts[] }`,         desc: fa ? "تغییر چیدمان چند-نموداری: single | split2 | grid4." : "Multi-chart layout change: single | split2 | grid4." },
  { type: "chart_symbol",  payload: `{ chartId, symbol, timeframe?, indicators }`, desc: fa ? "تغییر نماد یک نمودار در چیدمان چند-نموداری." : "Change the symbol for one chart in a multi-chart layout." },
  { type: "drawing_upsert",payload: `{ drawing }`,                  desc: fa ? "افزودن یا به‌روزرسانی یک ترسیم (کاربر ← سرور)." : "Create or update a drawing (client → server sync)." },
  { type: "drawing_delete",payload: `{ drawingId }`,                desc: fa ? "حذف یک ترسیم." : "Delete a drawing." },
  { type: "drawings_clear",payload: `{}`,                           desc: fa ? "پاک‌کردن همه ترسیم‌ها." : "Clear all drawings." },
  { type: "drawings",      payload: `{ drawings[] }`,               desc: fa ? "جایگزینی کامل همه ترسیم‌ها." : "Full replacement of all drawings." },
];

const serverRows = (fa: boolean): MsgRow[] => [
  { type: "snapshot / init",          payload: `{ data, definitions?, points?, drawings?, symbol?, timeframe?, digits? }`, desc: fa ? "بار اولیه: کندل‌ها + سری‌های اندیکاتور + داده + ترسیم‌های سرور." : "Initial load: candles + indicator series + their data + server drawings." },
  { type: "candles",                  payload: `{ data: OHLC[] }`,              desc: fa ? "جایگزینی کامل کندل‌ها." : "Full candle replacement." },
  { type: "bar / tick / update",      payload: `{ bar: OHLC }`,                 desc: fa ? "آپدیت ریل‌تایم: time برابر آخرین کندل → آپدیت درجا؛ time جدیدتر → کندل تازه." : "Realtime: matching time updates last candle in-place; newer time appends a fresh one." },
  { type: "history",                  payload: `{ data: OHLC[], noMoreHistory? }`, desc: fa ? "پاسخ به درخواست history." : "Reply to a history request." },
  { type: "definitions",              payload: `{ definitions: SeriesDefinition[] }`, desc: fa ? "تعریف/به‌روزرسانی سری‌های اندیکاتور." : "Define / update indicator series." },
  { type: "indicators",               payload: `{ points: { [key]: PointData[] } }`, desc: fa ? "داده سری‌ها. آرایه تک‌عضوی → آپدیت سریع O(1) آخرین نقطه." : "Series data. Single-element array → O(1) fast-path for realtime last-point update." },
  { type: "drawings / drawing_set",   payload: `{ drawings: Drawing[] }`,       desc: fa ? "جایگزینی کامل اشیای سرور روی نمودار — فقط‌خواندنی." : "Replace all server objects on the chart — read-only." },
  { type: "drawing / drawing_upsert", payload: `{ drawing: Drawing }`,          desc: fa ? "افزودن/به‌روزرسانی یک شیء سرور." : "Add / update a single server object." },
  { type: "drawing_delete",           payload: `{ drawingId? / drawingIds? }`,  desc: fa ? "حذف اشیای سرور مشخص." : "Remove specific server objects." },
  { type: "drawings_clear",           payload: `{}`,                            desc: fa ? "پاک‌کردن همه اشیای سرور." : "Clear all server objects." },
  { type: "settings",                 payload: `{ settings: Partial<ChartSettings> }`, desc: fa ? "پچ ریموت تنظیمات ظاهری." : "Remotely patch chart appearance settings." },
  { type: "magnet",                   payload: `{ magnet: boolean }`,           desc: fa ? "روشن/خاموش مگنت از سرور." : "Toggle magnet mode from server." },
  { type: "chartType",                payload: `{ chartType }`,                 desc: fa ? "تغییر نوع نمایش از سرور." : "Switch display type from server." },
  { type: "symbol / timeframe",       payload: `{ symbol } / { timeframe }`,   desc: fa ? "به‌روزرسانی لیبل در UI." : "Update the label in the UI." },
  { type: "fitContent",               payload: `{}`,                            desc: fa ? "فیت همه داده در دید." : "Fit all data into view." },
  { type: "scrollToEnd",              payload: `{}`,                            desc: fa ? "پرش به آخرین کندل." : "Jump to the latest candle." },
  { type: "zoomRange",                payload: `{ zoomRange: { from, to } }`,   desc: fa ? "زوم روی بازه زمانی (unix-seconds)." : "Zoom to a time range (unix-second timestamps)." },
  { type: "symbols_list",             payload: `{ symbols: [{symbol,name?,type?}] }`, desc: fa ? "پاسخ به get_symbols." : "Reply to get_symbols." },
  { type: "indicators_list",          payload: `{ indicators: SeriesDefinition[] }`, desc: fa ? "پاسخ به get_indicators." : "Reply to get_indicators." },
  { type: "chart_snapshot",           payload: `{ chartId, data, definitions?, points? }`, desc: fa ? "اسنپ‌شات برای یک نمودار در چیدمان چند-نموداری." : "Snapshot for one chart in a multi-chart layout." },
  { type: "chart_bar",                payload: `{ chartId, bar: OHLC }`,        desc: fa ? "آپدیت ریل‌تایم برای نمودار مشخص." : "Realtime update for a specific chart." },
  { type: "chart_history",            payload: `{ chartId, data, noMoreHistory? }`, desc: fa ? "تاریخچه برای نمودار مشخص." : "History for a specific chart." },
  { type: "toast",                    payload: `{ message, toastType? }`,       desc: fa ? "اعلان (info|success|error|warning)." : "Toast notification (info|success|error|warning)." },
  { type: "error",                    payload: `{ message }`,                   desc: fa ? "خطای سرور." : "Server error notification." },
  { type: "pong",                     payload: `{ t? }`,                        desc: fa ? "پاسخ ping؛ کلاینت RTT را از آن محاسبه می‌کند." : "Reply to ping; client computes RTT from it." },
];

const OHLC_SCHEMA = `// A single candle — time is unix SECONDS (not ms)
{
  "time":   1718100000,   // unix seconds, strictly increasing & unique
  "open":   42010.5,
  "high":   42120.0,
  "low":    41980.2,
  "close":  42095.7,
  "volume": 18.42         // optional
}

// PointData — one value of an indicator series, keyed by SeriesDefinition.key
{
  "time":  1718100000,
  "value": 42050.3,
  "color": "#089981"      // optional per-point color override (histogram/scatter)
}`;

const DEF_SCHEMA = `{
  "key":              "rsi_14",         // unique series id — points arrive under this key
  "label":            "RSI (14)",       // legend text
  "pane":             "sub",            // "main" overlays price · "sub" gets its own pane
  "paneId":           "rsi_pane",       // sub-series sharing a paneId share one pane
  "type":             "line",           // line | histogram | area | baseline | scatter
  "color":            "#AB47BC",        // primary color
  "colorPos":         "#089981",        // histogram/baseline: value >= 0
  "colorNeg":         "#F23645",        // histogram/baseline: value < 0
  "lineWidth":        2,                // 1–4
  "lineStyle":        0,                // 0 solid · 1 dotted · 2 dashed · 3 large-dashed
  "subPaneHeight":    120,              // px, sub-panes only
  "scaleMargins":     { "top": 0.1, "bottom": 0.1 },
  "digits":           2,                // price precision in the legend
  "priceLineVisible": false,
  "lastValueVisible": true,
  "visible":          true,
  "levels": [                           // optional horizontal guide lines
    { "value": 70, "color": "#787B86", "lineStyle": 2, "label": "70" },
    { "value": 30, "color": "#787B86", "lineStyle": 2, "label": "30" }
  ],
  "baseValue": 0,                       // baseline type only
  "topColor":    "#089981",             // baseline series only
  "bottomColor": "#F23645",             // baseline series only
  "meta": {
    "calc": { "source": "close", "transform": "rsi", "period": 14 }
  }
}`;

const DRAWING_SCHEMA = `{
  "id":        "srv_8f3k2",            // any unique string
  "tool":      "fibRetracement",       // see drawing-tools list
  "points":    [ { "time": 1718100000, "price": 42850.5 }, ... ],
  "style": {
    "color":        "#2962FF",
    "lineWidth":    1,
    "lineStyle":    0,
    "fillColor":    "#2962FF",
    "fillOpacity":  0.12,
    "fontSize":     13,
    "showLabels":   true,
    "extendLeft":   false,
    "extendRight":  false
  },
  "text":        "breakout",           // text tool only
  "paneId":      "main",
  "locked":      true,
  "visible":     true,
  "completed":   true,
  "selected":    false,
  "positionData": {                    // long/short position tools only
    "entryPrice": 42000,
    "stopLoss":   41500,
    "takeProfit": 43500,
    "quantity":   1,
    "risk":       500,
    "reward":     1500
  },
  "fibLevels": [                       // fib tools only
    { "value": 0.236, "color": "#2196F3", "enabled": true },
    { "value": 0.382, "color": "#2196F3", "enabled": true },
    { "value": 0.618, "color": "#2196F3", "enabled": true }
  ]
}`;

const TEMPLATE_SCHEMA = `{
  "type":      "definitions",
  "protocol":  "2.0.0",
  "generator": "trex-indicator-designer@1",
  "definitions": [ /* SeriesDefinition[] — the visual spec */ ],
  "dataRequest": [
    {
      "key":        "sma20",
      "pane":       "main",
      "seriesType": "line",
      "calc":       { "source": "close", "transform": "sma", "period": 20 }
    }
  ]
}`;

const PY_RAW = `# pip install websockets
import asyncio, json, time, random
import websockets

CANDLES = []
def seed(n=600, price=42000.0, step=60):
    t = int(time.time()) // step * step - n * step
    for i in range(n):
        o = price
        c = price * (1 + random.uniform(-0.004, 0.004))
        h = max(o, c) * (1 + random.uniform(0, 0.002))
        l = min(o, c) * (1 - random.uniform(0, 0.002))
        CANDLES.append({"time": t + i * step,
                        "open": o, "high": h, "low": l, "close": c,
                        "volume": random.uniform(5, 50)})
        price = c
seed()

async def handler(ws):
    # Send initial snapshot
    await ws.send(json.dumps({
        "type": "snapshot",
        "symbol": "BTCUSDT", "timeframe": "1m", "digits": 2,
        "data": CANDLES,
        "definitions": [{
            "key": "sma20", "label": "SMA 20", "pane": "main",
            "paneId": "sma20", "type": "line", "color": "#26A69A",
            "lineWidth": 2, "lineStyle": 0, "digits": 2, "visible": True
        }],
        "points": {"sma20": [
            {"time": c["time"],
             "value": sum(x["close"] for x in CANDLES[max(0,i-19):i+1]) / min(i+1,20)}
            for i, c in enumerate(CANDLES)
        ]},
    }))

    async def stream():
        while True:
            await asyncio.sleep(0.25)
            last = CANDLES[-1]
            last["close"] *= 1 + random.uniform(-0.0008, 0.0008)
            last["high"] = max(last["high"], last["close"])
            last["low"]  = min(last["low"],  last["close"])
            await ws.send(json.dumps({"type": "bar", "bar": last}))

    task = asyncio.create_task(stream())
    try:
        async for raw in ws:
            msg = json.loads(raw)
            if msg["type"] == "ping":
                await ws.send(json.dumps({"type": "pong"}))
            elif msg["type"] == "history":
                await ws.send(json.dumps({"type": "history",
                                          "data": [], "noMoreHistory": True}))
            elif msg["type"] == "symbol":
                await ws.send(json.dumps({"type": "toast",
                                          "message": f"Symbol: {msg['symbol']}",
                                          "toastType": "info"}))
    finally:
        task.cancel()

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        print("ws://localhost:8765  — open trex-terminal.html and click Connect")
        await asyncio.Future()

asyncio.run(main())`;

/* ── Trex Engine ─────────────────────────────── */

const TREX_INSTALL = `pip install trex-engine`;

const TREX_QUICKSTART = `import trex
from trex.base.ohlcv import OHLCV
from datetime import datetime

# 1. Initialize — starts WebSocket server + scheduler
trex.init(port=8765, source_timeframe="1m")

# 2. Register indicators
def on_rsi(val: float):
    if val < 30:
        print(f"Oversold! RSI={val:.1f}")

trex.rsi("BTCUSDT", "1h", period=14, listener=on_rsi)
trex.ema("BTCUSDT", "1h", period=20, listener=lambda v: print("EMA:", v))
trex.macd("BTCUSDT", "1h", fast=12, slow=26, signal=9,
          listener=lambda v: print(f"MACD={v.macd:.2f} Signal={v.signal:.2f}"))

# 3. Feed candles
bar = OHLCV(time=datetime.utcnow(),
            open=42000, high=42100, low=41950, close=42050, volume=10.5)
trex.push(bar, symbol="BTCUSDT")

# 4. Shutdown
trex.stop()`;

const TREX_INIT_API = `# trex.init — full signature
trex.init(
    timezone="Asia/Tehran",   # display timezone
    source_timeframe="1m",    # raw candle timeframe you feed
    port=8765,                # WebSocket broadcast port
    host="0.0.0.0",           # listen address
    max_bars=10_000,          # ring-buffer size per context
    snapshot_size=500,        # candles sent on initial connection
    db_config=None,           # DbConfig for PostgreSQL persistence
)

# Feed one candle → recomputes all registered indicators
trex.push(bar, symbol="BTCUSDT")

# Bulk-load history without firing listeners (warm-up)
trex.seed(symbol="BTCUSDT", timeframe="1m")

# Remove a listener
key = trex.rsi("BTCUSDT", "1h", period=14, listener=cb)
trex.de_attach(key)

# Broadcast a server drawing to all connected clients
trex.broadcast_drawing({"id":"d1","tool":"horizontal","points":[{"time":1718100000,"price":42000}],...})
trex.delete_drawing("d1")

# Graceful shutdown
trex.stop()
print(trex.client_count())  # connected TrexTerminal clients`;

const TREX_TREND = `# ── Trend / Moving Averages ──────────────────────────────────────
# All return: float

trex.sma("BTCUSDT", "1h", period=20, listener=cb)           # Simple MA
trex.ema("BTCUSDT", "1h", period=20, listener=cb)           # Exponential MA
trex.wma("BTCUSDT", "1h", period=20, listener=cb)           # Weighted MA
trex.hma("BTCUSDT", "1h", period=9,  listener=cb)           # Hull MA
trex.dema("BTCUSDT", "1h", period=20, listener=cb)          # Double EMA
trex.tema("BTCUSDT", "1h", period=20, listener=cb)          # Triple EMA
trex.zlema("BTCUSDT", "1h", period=20, listener=cb)         # Zero-Lag EMA
trex.vwma("BTCUSDT", "1h", period=20, listener=cb)          # Volume-Weighted MA
trex.vwap("BTCUSDT", "1h", listener=cb)                     # VWAP (resets daily)
trex.kama("BTCUSDT", "1h", er_period=10, fastest=2,
          slowest=30, listener=cb)                           # Kaufman Adaptive MA

# ── Overlay / Price ───────────────────────────────────────────────
# supertrend returns SupertrendVal(trend: float, direction: int)  # 1=up, -1=down
trex.supertrend("BTCUSDT", "1h", period=10, mult=3.0, listener=cb)

# ichimoku returns IchimokuVal(tenkan, kijun, senkou_a, senkou_b, chikou)
trex.ichimoku("BTCUSDT", "1h", tenkan=9, kijun=26, senkou=52, listener=cb)

# psar returns PsarVal(sar: float, af: float)
trex.psar("BTCUSDT", "1h", start=0.02, increment=0.02, max_af=0.2, listener=cb)

# donchian returns DonchianVal(upper: float, lower: float)
trex.donchian("BTCUSDT", "1h", period=20, listener=cb)

# zigzag_base returns ZigzagVal(level: float, direction: int)
trex.zigzag_base("BTCUSDT", "1h", threshold=5.0, listener=cb)`;

const TREX_VOLATILITY = `# ── Volatility ───────────────────────────────────────────────────
# tr → float (True Range)
trex.tr("BTCUSDT", "1h", listener=cb)

# atr → float
trex.atr("BTCUSDT", "1h", period=14, listener=cb)

# natr → float (Normalized ATR as %)
trex.natr("BTCUSDT", "1h", period=14, listener=cb)

# stddev → float
trex.stddev("BTCUSDT", "1h", period=20, listener=cb)

# hv → float (Historical Volatility)
trex.hv("BTCUSDT", "1h", period=20, listener=cb)

# ui → float (Ulcer Index)
trex.ui("BTCUSDT", "1h", period=14, listener=cb)

# bbands → BBVal(upper: float, middle: float, lower: float)
trex.bbands("BTCUSDT", "1h", period=20, mult=2.0, listener=cb)
# usage: val.upper, val.middle, val.lower

# keltner → KeltnerVal(upper: float, middle: float, lower: float)
trex.keltner("BTCUSDT", "1h", period=20, atr_mult=2.0, listener=cb)

# chandelier → ChandelierVal(long_stop: float, short_stop: float)
trex.chandelier("BTCUSDT", "1h", period=22, mult=3.0, listener=cb)`;

const TREX_MOMENTUM = `# ── Momentum ─────────────────────────────────────────────────────
# rsi → float [0–100]
trex.rsi("BTCUSDT", "1h", period=14, listener=cb)

# stochrsi → StochRsiVal(k: float, d: float)
trex.stochrsi("BTCUSDT", "1h", rsi_period=14, k=14, d=3, listener=cb)

# macd → MacdVal(macd: float, signal: float, histogram: float)
trex.macd("BTCUSDT", "1h", fast=12, slow=26, signal=9, listener=cb)

# adx → AdxVal(di_plus: float, di_minus: float, adx: float)
trex.adx("BTCUSDT", "1h", period=14, listener=cb)

# aroon → AroonVal(up: float, down: float)
trex.aroon("BTCUSDT", "1h", period=14, listener=cb)

# vortex → VortexVal(vi_plus: float, vi_minus: float)
trex.vortex("BTCUSDT", "1h", period=14, listener=cb)

# rvi → RviVal(rvi: float, signal: float)
trex.rvi("BTCUSDT", "1h", period=10, listener=cb)

# fisher → FisherVal(fisher: float, signal: float)
trex.fisher("BTCUSDT", "1h", period=10, listener=cb)

# ppo → float  (Percentage Price Oscillator)
trex.ppo("BTCUSDT", "1h", fast=12, slow=26, signal=9, listener=cb)
trex.apo("BTCUSDT", "1h", fast=12, slow=26, listener=cb)  # Absolute PO

# Misc momentum — all return float
trex.trix("BTCUSDT", "1h", period=15, listener=cb)    # Triple Smoothed ROC
trex.roc("BTCUSDT", "1h", period=12, listener=cb)     # Rate of Change
trex.momentum("BTCUSDT", "1h", period=10, listener=cb)
trex.cmo("BTCUSDT", "1h", period=9, listener=cb)      # Chande Momentum Osc.
trex.uo("BTCUSDT", "1h", fast=7, medium=14, slow=28, listener=cb)  # Ultimate Osc.
trex.chop("BTCUSDT", "1h", period=14, listener=cb)    # Choppiness Index
trex.ao("BTCUSDT", "1h", fast=5, slow=34, listener=cb)  # Awesome Oscillator
trex.ac("BTCUSDT", "1h", listener=cb)                 # Acceleration/Deceleration
trex.tsi("BTCUSDT", "1h", fast=25, slow=13, listener=cb)  # True Strength Index
trex.dpo("BTCUSDT", "1h", period=21, listener=cb)     # Detrended Price Osc.
trex.kst("BTCUSDT", "1h", listener=cb)                # KST Oscillator
trex.coppock("BTCUSDT", "1h", roc1=11, roc2=14, wma=10, listener=cb)
trex.force_index("BTCUSDT", "1h", period=13, listener=cb)`;

const TREX_OSCILLATORS = `# ── Oscillators ──────────────────────────────────────────────────
# stochastic → StochVal(k: float, d: float)
trex.stochastic("BTCUSDT", "1h", k_period=14, d_period=3, smooth=3, listener=cb)

# cci → float
trex.cci("BTCUSDT", "1h", period=20, listener=cb)

# williams_r → float [-100 to 0]
trex.williams_r("BTCUSDT", "1h", period=14, listener=cb)

# mfi → float [0–100]  (Money Flow Index)
trex.mfi("BTCUSDT", "1h", period=14, listener=cb)`;

const TREX_VOLUME = `# ── Volume ───────────────────────────────────────────────────────
trex.obv("BTCUSDT", "1h", listener=cb)                  # On-Balance Volume → float
trex.ad("BTCUSDT", "1h", listener=cb)                   # Accumulation/Distribution → float
trex.adosc("BTCUSDT", "1h", fast=3, slow=10, listener=cb)  # Chaikin A/D Osc → float
trex.cmf("BTCUSDT", "1h", period=20, listener=cb)       # Chaikin Money Flow → float
trex.eom("BTCUSDT", "1h", period=14, listener=cb)       # Ease of Movement → float
trex.nvi("BTCUSDT", "1h", listener=cb)                  # Negative Volume Index → float
trex.pvi("BTCUSDT", "1h", listener=cb)                  # Positive Volume Index → float
trex.pvt("BTCUSDT", "1h", listener=cb)                  # Price-Volume Trend → float
trex.vo("BTCUSDT", "1h", fast=12, slow=26, listener=cb) # Volume Oscillator → float
trex.vroc("BTCUSDT", "1h", period=14, listener=cb)      # Volume ROC → float`;

const TREX_STATISTICS = `# ── Statistics ───────────────────────────────────────────────────
trex.zscore("BTCUSDT", "1h", period=20, listener=cb)        # Z-Score → float
trex.variance("BTCUSDT", "1h", period=20, listener=cb)      # Variance → float
trex.linreg_slope("BTCUSDT", "1h", period=20, listener=cb)  # Linear Reg Slope → float
trex.correl("BTCUSDT", "1h", period=20, listener=cb)        # Correlation → float
trex.percentrank("BTCUSDT", "1h", period=20, listener=cb)   # Percentile Rank → float`;

const TREX_PATTERNS = `# ── Candlestick Patterns ─────────────────────────────────────────
# All pattern functions return bool (True = pattern detected on this bar)

# Single-candle patterns
trex.doji(symbol, tf, listener=cb)
trex.dragonfly_doji(symbol, tf, listener=cb)
trex.gravestone_doji(symbol, tf, listener=cb)
trex.hammer(symbol, tf, listener=cb)
trex.inverted_hammer(symbol, tf, listener=cb)
trex.hanging_man(symbol, tf, listener=cb)
trex.shooting_star(symbol, tf, listener=cb)
trex.marubozu(symbol, tf, listener=cb)
trex.spinning_top(symbol, tf, listener=cb)
trex.long_legged_doji(symbol, tf, listener=cb)
trex.bullish_belt(symbol, tf, listener=cb)
trex.bearish_belt(symbol, tf, listener=cb)
trex.high_wave(symbol, tf, listener=cb)
trex.rickshaw_man(symbol, tf, listener=cb)
trex.umbrella_line(symbol, tf, listener=cb)

# Two-candle patterns
trex.bullish_engulfing(symbol, tf, listener=cb)
trex.bearish_engulfing(symbol, tf, listener=cb)
trex.bullish_harami(symbol, tf, listener=cb)
trex.bearish_harami(symbol, tf, listener=cb)
trex.piercing(symbol, tf, listener=cb)
trex.dark_cloud_cover(symbol, tf, listener=cb)
trex.tweezer(symbol, tf, listener=cb)
trex.kicking(symbol, tf, listener=cb)
trex.on_neck(symbol, tf, listener=cb)
trex.matching_low(symbol, tf, listener=cb)

# Three-candle patterns
trex.morning_star(symbol, tf, listener=cb)
trex.evening_star(symbol, tf, listener=cb)
trex.morning_doji_star(symbol, tf, listener=cb)
trex.evening_doji_star(symbol, tf, listener=cb)
trex.three_white_soldiers(symbol, tf, listener=cb)
trex.three_black_crows(symbol, tf, listener=cb)
trex.three_inside_up(symbol, tf, listener=cb)
trex.three_inside_down(symbol, tf, listener=cb)
trex.deliberation(symbol, tf, listener=cb)
trex.identical_three_crows(symbol, tf, listener=cb)`;

const TREX_MULTISYM = `# Each (symbol × timeframe) pair is an independent context.
# CTF (ConvertTimeFrame) activates automatically when requested tf > source_timeframe.

trex.init(port=8765, source_timeframe="1m")  # feed 1m bars

trex.ema("BTCUSDT", "1h",  period=14, listener=on_btc_1h)  # auto-aggregates 1m→1h
trex.ema("BTCUSDT", "4h",  period=14, listener=on_btc_4h)  # auto-aggregates 1m→4h
trex.rsi("ETHUSDT", "1h",  period=14, listener=on_eth_rsi)

# Push 1m candle → engine routes to ALL registered symbol/tf contexts
trex.push(bar_1m, symbol="BTCUSDT")
trex.push(bar_1m, symbol="ETHUSDT")

# Remove a listener when no longer needed
key = trex.rsi("BTCUSDT", "1h", period=14, listener=cb)
trex.de_attach(key)

# Inspect all registered indicators
info = trex.indicators()
# { "BTCUSDT": { "ema|sym=BTCUSDT|tf=1h|period=14": IndicatorInfo(...) } }`;

const TREX_OUTPUT_TYPES = `# Multi-value indicators return dataclass instances (slots=True for speed):
from trex.indic import BBVal, MacdVal, AdxVal, StochVal, KeltnerVal
from trex.indic import AroonVal, RviVal, FisherVal, VortexVal, StochRsiVal
from trex.indic import IchimokuVal, PsarVal, SupertrendVal, ZigzagVal
from trex.indic import DonchianVal, ChandelierVal

def on_bb(val: BBVal):
    spread = val.upper - val.lower
    print(f"BB: {val.lower:.2f} / {val.middle:.2f} / {val.upper:.2f}  width={spread:.2f}")

def on_macd(val: MacdVal):
    print(f"MACD={val.macd:.4f}  Signal={val.signal:.4f}  Hist={val.histogram:.4f}")

def on_adx(val: AdxVal):
    print(f"ADX={val.adx:.1f}  +DI={val.di_plus:.1f}  -DI={val.di_minus:.1f}")
    if val.adx > 25:
        direction = "BULL" if val.di_plus > val.di_minus else "BEAR"
        print(f"  Strong trend: {direction}")

def on_stochrsi(val: StochRsiVal):
    print(f"StochRSI  K={val.k:.2f}  D={val.d:.2f}")
    if val.k < 20 and val.d < 20:
        print("  Oversold zone")

def on_ichimoku(val: IchimokuVal):
    print(f"Tenkan={val.tenkan:.2f}  Kijun={val.kijun:.2f}")
    print(f"Cloud A={val.senkou_a:.2f}  Cloud B={val.senkou_b:.2f}")
    cloud_bull = val.senkou_a > val.senkou_b
    print(f"Cloud: {'bullish' if cloud_bull else 'bearish'}")`;

const TREX_DB = `from trex.db.config import DbConfig

cfg = DbConfig(
    host="localhost", port=5432,
    database="trex_db",
    user="postgres", password="secret",
)
trex.init(port=8765, source_timeframe="1m", db_config=cfg)

# Fast restart — restore all indicator states from DB:
trex.seed(symbol="BTCUSDT")   # loads stored state, indicators ready immediately

# Or async version:
from trex.db.store import AsyncTrexStore
store = AsyncTrexStore(cfg)
await store.load_state("BTCUSDT", "1h")`;

const TREX_PLUGIN = `from trex import plugin
from trex.engine.indicator import Indicator
from trex.base.ohlcv import ValueExtractor

@plugin.register
class VWEMA(Indicator):
    """Volume-Weighted EMA — custom indicator example."""
    _ind_name   = "VWEMA"
    _key_params = ("period",)

    def __init__(self, period=14, value_extractor=ValueExtractor.extract_close):
        super().__init__(value_extractor=value_extractor)
        self.period = period
        self._ve    = value_extractor
        self._num   = 0.0
        self._den   = 0.0
        self._k     = 2.0 / (period + 1.0)
        self._k1    = 1.0 - self._k
        self._buf   = []

    def init_depends(self): pass

    def _first_calculate(self, ohlcv, prev):
        self._buf.append(ohlcv)
        if len(self._buf) < self.period:
            return None
        prices  = [self._ve(b) for b in self._buf]
        volumes = [b.volume for b in self._buf]
        total_v = sum(volumes) or 1.0
        self._num = sum(p * v for p, v in zip(prices, volumes)) / total_v
        self._buf = None
        return self._num

    def _calculate_new_value(self, ohlcv, prev):
        price     = self._ve(ohlcv)
        vol       = ohlcv.volume or 0.0
        self._num = self._k1 * self._num + self._k * price * vol
        self._den = self._k1 * self._den + self._k * vol
        return self._num / self._den if self._den else price

# After import, available as first-class citizen:
import trex
trex.vwema("BTCUSDT", "1h", period=14, listener=on_vwema)`;

const TREX_PLUGIN_COMPOSITE = `@plugin.register(name="my_macd")
class CustomMACD(Indicator):
    _ind_name   = "MyMACD"
    _key_params = ("fast", "slow", "signal")

    def __init__(self, fast=12, slow=26, signal=9,
                 value_extractor=ValueExtractor.extract_close):
        super().__init__(value_extractor=value_extractor)
        self.fast = fast; self.slow = slow; self.signal = signal
        self._ve  = value_extractor
        self._fast_val = self._slow_val = None
        self._sig_k  = 2.0 / (signal + 1.0)
        self._sig_k1 = 1.0 - self._sig_k
        self._sig_buf: list       = []
        self._sig:    float|None  = None
        self._fast_key = self._slow_key = None

    def init_depends(self):
        api = self._ctx.api          # ← always use ctx.api, never instantiate directly
        self._fast_key = api.ema(self.context_symbol, self.tf, self.fast,
                                 self._ve, self._on_fast)
        self._slow_key = api.ema(self.context_symbol, self.tf, self.slow,
                                 self._ve, self._on_slow)

    def dispatch(self):
        api = self._ctx.api
        if self._fast_key: api.de_attach_by_key(self._fast_key)
        if self._slow_key: api.de_attach_by_key(self._slow_key)

    def _on_fast(self, val): self._fast_val = val
    def _on_slow(self, val):
        self._slow_val = val
        if self._fast_val is None: return
        macd = self._fast_val - self._slow_val
        if self._sig is None:
            self._sig_buf.append(macd)
            if len(self._sig_buf) < self.signal: return
            self._sig = sum(self._sig_buf) / self.signal
        else:
            self._sig = self._sig_k1 * self._sig + self._sig_k * macd
        self.emit({"macd": macd, "signal": self._sig,
                   "histogram": macd - self._sig})

    def add_input_value(self, raw): pass
    def _first_calculate(self, value, prev): return True
    def _calculate_new_value(self, value, prev): pass`;

/* ── BackTest ──────────────────────────────────── */

const BT_INSTALL = `pip install backtest-engine`;

const BT_QUICKSTART = `from backtest.runner import Backtest
from backtest.strategy import Strategy
from backtest.candles import load_csv
import trex

class EMACrossStrategy(Strategy):
    symbol    = "BTCUSDT"
    timeframe = "1h"
    deposit   = 10_000
    leverage  = 5
    fee       = 0.0004
    slippage  = 0.0001

    def indicators(self):
        trex.ema(self.symbol, self.timeframe, period=14, listener=self._on_fast)
        trex.ema(self.symbol, self.timeframe, period=50, listener=self._on_slow)
        trex.rsi(self.symbol, self.timeframe, period=14, listener=self._on_rsi)

    def _on_fast(self, v): self._fast = v
    def _on_slow(self, v): self._slow = v
    def _on_rsi(self,  v): self._rsi  = v

    def on_kline(self, bar):
        if not (hasattr(self, "_fast") and hasattr(self, "_slow")): return
        has_pos = len(self.positions) > 0

        if self._fast > self._slow and not has_pos:
            # Enter long only when RSI is not overbought
            if getattr(self, "_rsi", 50) < 70:
                self.buy(usdt=500, sl=bar.close * 0.98, tp=bar.close * 1.04)

        elif self._fast < self._slow and has_pos:
            self.close()

    def on_position_opened(self, pos):
        print(f"+ LONG @ {pos.entry_price:.2f}  margin={pos.pnl_usdt:.2f}")

    def on_position_closed(self, pos):
        sign = "✓" if pos.pnl_usdt > 0 else "✗"
        print(f"{sign} Closed  PnL={pos.pnl_usdt:+.2f} USDT ({pos.pnl_pct:+.2f}%)")

candles = load_csv("BTCUSDT_1h.csv")
result  = Backtest(EMACrossStrategy).run(candles)
print(result)`;

const BT_STRATEGY_ATTRS = `class MyStrategy(Strategy):
    # ── Required ──────────────────────────────────────────────
    symbol    : str   = "BTCUSDT"
    timeframe : str   = "1h"

    # ── Optional (with defaults) ──────────────────────────────
    deposit   : float = 1_000.0    # starting balance in USDT
    leverage  : int   = 10         # position leverage
    fee       : float = 0.0004     # taker fee (0.04%)
    slippage  : float = 0.0001     # 0.01% price slippage on market orders
    broadcast : bool  = True       # stream bars to TrexTerminal
    port      : int   = 8765       # WebSocket port (when broadcast=True)

# Runtime override — overrides any class attribute:
result = Backtest(MyStrategy, deposit=50_000, leverage=10, fee=0.0002).run(candles)`;

const BT_COMMANDS = `# ── Inside on_kline(bar) ─────────────────────────────────────────

# Market order — executes at current bar's close
order_id, msg = self.buy(usdt=500)                   # LONG market
order_id, msg = self.sell(usdt=500)                  # SHORT market

# Market order with Stop-Loss and Take-Profit
order_id, msg = self.buy(usdt=500, sl=41000, tp=43500)
order_id, msg = self.sell(usdt=500, sl=43500, tp=41000)

# Limit order — price= triggers limit instead of market
#   Evaluated from the NEXT bar onward
order_id, msg = self.buy(usdt=500, price=41000, sl=40500, tp=43000)
order_id, msg = self.sell(usdt=500, price=43000, sl=43500, tp=41000)

# Close all open positions immediately (market)
self.close()

# Close a specific position by its ID
self.close(position_id=order_id)

# Modify SL/TP of an open position
ok, msg = self.set_sl_tp(position_id=order_id, sl=41000, tp=44000)

# Cancel a pending limit order
ok, msg = self.cancel(order_id)

# Change leverage on the fly
self.set_leverage(20)

# ── Read state ───────────────────────────────────────────────────
balance   = self.balance          # float — available USDT
positions = self.positions        # list[Position] — open positions
orders    = self.orders           # list[Order] — pending limit orders
history   = self.history          # list[Position] — closed positions`;

const BT_EVENTS = `class MyStrategy(Strategy):
    def on_kline(self, bar):
        """Called every bar AFTER indicators fire and limit orders execute."""

    # ── Position events ────────────────────────────────────────────
    def on_position_opened(self, pos):
        """Position entered (market fill or limit trigger)."""
        print(f"Opened {pos.side} @ {pos.entry_price}")

    def on_position_closed(self, pos):
        """Position closed by self.close() or TP/SL hit."""
        print(f"Closed  pnl={pos.pnl_usdt:+.2f}")

    def on_position_profit(self, pos):
        """Take-profit price hit — position is closed with profit."""

    def on_position_loss(self, pos):
        """Stop-loss price hit — position is closed with loss."""

    def on_position_liquidated(self, pos):
        """Price reached the liquidation level."""

    # ── Order events ───────────────────────────────────────────────
    def on_order_placed(self, order):
        """Limit order accepted."""
        print(f"Limit placed: {order.side} @ {order.entry}")

    def on_order_cancelled(self, order):
        """Limit order cancelled via self.cancel()."""`;

const BT_POSITION = `# Position fields available inside event hooks and self.positions / self.history
pos.id            # int   — unique position ID
pos.symbol        # str
pos.side          # str   — "LONG" or "SHORT"
pos.entry_price   # float — fill price
pos.close_price   # float — close price (set after closing)
pos.quantity      # float — contracts/coins held
pos.pnl_usdt      # float — P&L in USDT (after fees)
pos.pnl_pct       # float — P&L as fraction (e.g. 0.05 = 5%)
pos.open_time     # datetime
pos.close_time    # datetime | None
pos.status        # str   — "OPEN" | "CLOSED" | "STOPPED" | "LIQUIDATED"`;

const BT_ORDER = `# Order fields available in on_order_placed / on_order_cancelled / self.orders
order.id           # int   — unique order ID
order.symbol       # str
order.side         # str   — "LONG" or "SHORT"
order.order_type   # str   — "MARKET" or "LIMIT"
order.usdt         # float — margin in USDT
order.entry        # float | None — limit trigger price
order.stop_price   # float | None — stop-loss price
order.take_profit  # float | None — take-profit price
order.placed_time  # datetime
order.status       # str   — "PENDING" | "FILLED" | "CANCELLED"`;

const BT_RESULT = `result = Backtest(MyStrategy).run(candles)
print(result)
# ┌──────────────────────────────────────────────┐
# │  BacktestResult                              │
# │  initial_balance  =  10 000.00 USDT         │
# │  final_balance    =  13 241.50 USDT         │
# │  return_pct       =  +32.4 %                │
# │  total_trades     =  47                     │
# │  winning_trades   =  27   losing=20         │
# │  win_rate         =  57.4 %                 │
# │  profit_factor    =  1.83                   │
# │  gross_profit     =  5 111.1                │
# │  gross_loss       =  -2 869.6               │
# │  largest_win      =   821.0 USDT            │
# │  largest_loss     =  -412.3 USDT            │
# │  avg_win          =   189.3 USDT            │
# │  avg_loss         =   -93.7 USDT (risk_reward=2.02)
# │  max_drawdown_pct =  12.4 %                 │
# └──────────────────────────────────────────────┘

# Access individual fields:
result.return_pct        # float  (final-initial)/initial*100
result.win_rate          # float  winning/total
result.profit_factor     # float  gross_profit / abs(gross_loss)
result.avg_win           # float  gross_profit / winning_trades
result.avg_loss          # float  gross_loss / losing_trades
result.risk_reward       # float  abs(avg_win / avg_loss)
result.max_drawdown_pct  # float  peak-to-trough %
result.positions         # list[Position]  — all closed positions

print(result.summary())  # full formatted text report`;

const BT_CANDLES = `from backtest.candles import load_csv, load_dicts, demo_candles

# CSV  (columns: time, open, high, low, close, volume)
candles = load_csv("BTCUSDT_1h.csv")

# From a list of dicts (e.g. exchange API response)
candles = load_dicts([
    {"time": 1718100000, "open": 42000, "high": 42100,
     "low": 41950, "close": 42050, "volume": 10.5},
    ...
])

# Built-in random demo candles (quick testing)
candles = demo_candles(n=1000, symbol="BTCUSDT", timeframe="1h")

# From pandas DataFrame
import pandas as pd
df = pd.read_csv("data.csv", parse_dates=["time"])
candles = load_dicts(df.to_dict("records"))`;

const BT_BROADCAST = `class MyStrategy(Strategy):
    symbol    = "BTCUSDT"
    timeframe = "1h"
    broadcast = True      # ← stream bars to TrexTerminal
    port      = 8765

    def indicators(self):
        import trex
        trex.ema(self.symbol, self.timeframe, period=14, listener=self._on_ema)

    def on_kline(self, bar): ...

# Run → open TrexTerminal → Connect to ws://localhost:8765
# You'll see the backtest replay live on the chart.
result = Backtest(MyStrategy).run(candles)`;

const INTEGRATION_EXAMPLE = `# Full integration: Trex Engine + BackTest + TrexTerminal
#
# 1. Strategy detects signals via Trex Engine indicators
# 2. BackTest simulates trades on Exchange
# 3. TrexTerminal shows the replay live (broadcast=True)

import trex
from backtest.runner import Backtest
from backtest.strategy import Strategy
from backtest.candles import load_csv

class MultiSignalStrategy(Strategy):
    symbol    = "BTCUSDT"
    timeframe = "1h"
    deposit   = 20_000
    leverage  = 3
    broadcast = True    # ← visualize in TrexTerminal
    port      = 8765

    def indicators(self):
        # Trend
        trex.ema(self.symbol, self.timeframe, period=20,  listener=self._e20)
        trex.ema(self.symbol, self.timeframe, period=100, listener=self._e100)
        # Momentum
        trex.rsi(self.symbol, self.timeframe, period=14, listener=self._rsi)
        # Volatility
        trex.bbands(self.symbol, self.timeframe, period=20, mult=2.0, listener=self._bb)
        # Volume
        trex.obv(self.symbol, self.timeframe, listener=self._obv)

    def _e20(self, v):  self._fast = v
    def _e100(self, v): self._slow = v
    def _rsi(self, v):  self._rsi_v = v
    def _bb(self, v):   self._bb_v  = v
    def _obv(self, v):  self._obv_v = v

    def on_kline(self, bar):
        if not all(hasattr(self, a) for a in ["_fast","_slow","_rsi_v","_bb_v"]):
            return
        has_pos = len(self.positions) > 0
        close   = bar.close

        # Entry: EMA cross UP + RSI not overbought + price above BB middle
        if (self._fast > self._slow
                and self._rsi_v < 65
                and close > self._bb_v.middle
                and not has_pos):
            sl = self._bb_v.lower           # BB lower as stop
            tp = close + 2 * (close - sl)  # 2:1 RR
            self.buy(usdt=1000, sl=sl, tp=tp)

        # Exit: EMA cross DOWN or price breaks BB lower
        elif has_pos and (self._fast < self._slow or close < self._bb_v.lower):
            self.close()

result = Backtest(MultiSignalStrategy).run(load_csv("BTCUSDT_1h.csv"))
print(f"Return: {result.return_pct:+.1f}%  WR: {result.win_rate*100:.1f}%  PF: {result.profit_factor:.2f}")`;

const MULTICHART_EXAMPLE = `// Multi-chart layout — server sends chart_snapshot per chartId
await ws.send(JSON.stringify({
    "type": "layout",
    "layout": "split2",          // "single" | "split2" | "grid4"
    "charts": [
        { "chartId": "left",  "symbol": "BTCUSDT", "timeframe": "1h", "indicators": [] },
        { "chartId": "right", "symbol": "ETHUSDT", "timeframe": "1h", "indicators": [] },
    ]
}));

// Server responds with chart_snapshot for each chart:
// { "type": "chart_snapshot", "chartId": "left",  "data": [...], ... }
// { "type": "chart_snapshot", "chartId": "right", "data": [...], ... }

// Realtime updates per chart:
// { "type": "chart_bar", "chartId": "left", "bar": { "time":..., "close":... } }`;

const drawingTools = (fa: boolean): [string, string][] => [
  ["trendline",       fa ? "خط روند بین دو نقطه." : "Trend line between two points."],
  ["ray",             fa ? "نیم‌خط؛ از نقطه دوم ادامه می‌یابد." : "Ray extending past the second point."],
  ["extended",        fa ? "خط بی‌نهایت در هر دو جهت." : "Line extended infinitely both ways."],
  ["horizontal",      fa ? "خط افقی روی یک قیمت (۱ نقطه)." : "Horizontal line at a price (1 point)."],
  ["vertical",        fa ? "خط عمودی روی یک زمان (۱ نقطه)." : "Vertical line at a time (1 point)."],
  ["polyline",        fa ? "چندخطی؛ با دابل‌کلیک یا Enter تمام می‌شود." : "Multi-segment line; finish with double-click or Enter."],
  ["arrow",           fa ? "پیکان جهت‌دار بین دو نقطه." : "Directional arrow between two points."],
  ["rectangle",       fa ? "مستطیل (۲ نقطه قطری)." : "Rectangle (2 diagonal points)."],
  ["ellipse",         fa ? "بیضی محاط در کادر دو نقطه." : "Ellipse inscribed in the 2-point box."],
  ["parallelChannel", fa ? "کانال موازی (۳ نقطه: خط + عرض)." : "Parallel channel (3 points: line + width)."],
  ["fibRetracement",  fa ? "فیبوناچی بازگشتی با سطوح قابل‌ویرایش (۲ نقطه)." : "Fibonacci retracement with editable levels (2 points)."],
  ["fibExtension",    fa ? "فیبوناچی گسترشی (۳ نقطه)." : "Fibonacci extension (3 points)."],
  ["text",            fa ? "برچسب متنی (۱ نقطه)." : "Text label (1 point)."],
  ["measure",         fa ? "ابزار اندازه‌گیری موقت — هرگز ذخیره نمی‌شود." : "Ephemeral measuring tool — never persisted."],
  ["longPosition",    fa ? "ابزار موقعیت خرید (entry/SL/TP، نسبت R/R)." : "Long-position tool (entry/SL/TP, R/R ratio)."],
  ["shortPosition",   fa ? "ابزار موقعیت فروش." : "Short-position tool."],
];

const shortcuts = (fa: boolean): [string, string][] => [
  ["Delete / Backspace",           fa ? "حذف ترسیم انتخاب‌شده" : "Delete selected drawing"],
  ["Ctrl+Z",                       fa ? "واگرد" : "Undo"],
  ["Ctrl+Y / Ctrl+Shift+Z",        fa ? "ازنو" : "Redo"],
  ["Escape",                       fa ? "لغو ترسیم ← لغو انتخاب ← نشانگر" : "Cancel placement → deselect → cursor"],
  ["Enter",                        fa ? "پایان Polyline" : "Finish polyline"],
  ["M",                            fa ? "مگنت (چسبیدن به OHLC کندل‌ها)" : "Magnet mode (snap to candle OHLC)"],
  ["Alt+T",                        fa ? "ابزار خط روند" : "Trendline tool"],
  ["Alt+H",                        fa ? "خط افقی" : "Horizontal line"],
  ["Alt+V",                        fa ? "خط عمودی" : "Vertical line"],
  ["Alt+F",                        fa ? "فیبوناچی بازگشتی" : "Fibonacci retracement"],
  ["Alt+R",                        fa ? "مستطیل" : "Rectangle"],
  ["Shift+Drag",                   fa ? "زوم مستطیلی روی ناحیه" : "Rectangle zoom on a region"],
  [fa ? "دابل‌کلیک نمودار" : "Double-click chart", fa ? "تمام‌صفحه" : "Toggle fullscreen"],
  [fa ? "اسکرول / درگ" : "Scroll / Drag", fa ? "زوم / جابه‌جایی (لیزی‌لود تاریخچه در لبه چپ)" : "Zoom / pan (history lazy-loads at left edge)"],
];

// depth=0: top-level item, depth=1: sub-item, id="" means non-clickable sub-folder label
interface TocItem { id: string; label: string; depth?: number }
interface TocGroup { group: string; icon: string; items: TocItem[] }

const TOC_GROUPS = (fa: boolean): TocGroup[] => [
  {
    group: fa ? "شروع" : "Getting started",
    icon: "🚀",
    items: [
      { id: "intro",        label: fa ? "معرفی" : "Introduction" },
      { id: "architecture", label: fa ? "معماری" : "Architecture" },
      { id: "quickstart",   label: fa ? "شروع سریع" : "Quick start" },
      { id: "connection",   label: fa ? "اتصال و پایداری" : "Connection & resilience" },
    ],
  },
  {
    group: fa ? "پروتکل WebSocket" : "WebSocket Protocol",
    icon: "⚡",
    items: [
      { id: "c2s",       label: fa ? "کلاینت ← سرور" : "Client → server" },
      { id: "s2c",       label: fa ? "سرور ← کلاینت" : "Server → client" },
      { id: "ohlc",      label: fa ? "OHLC و PointData" : "OHLC & PointData" },
      { id: "defschema", label: "SeriesDefinition" },
      { id: "drawschema",label: fa ? "اشیای ترسیمی" : "Drawing schema" },
      { id: "multichart",label: fa ? "چند نمودار" : "Multi-chart" },
    ],
  },
  {
    group: fa ? "قابلیت‌ها" : "Features",
    icon: "✦",
    items: [
      { id: "tools",     label: fa ? "ابزارهای ترسیم" : "Drawing tools" },
      { id: "builder",   label: fa ? "طراح اندیکاتور" : "Indicator Builder" },
      { id: "workspace", label: fa ? "میزکار و ماندگاری" : "Workspace & persistence" },
      { id: "keys",      label: fa ? "میان‌برها" : "Keyboard shortcuts" },
    ],
  },
  {
    group: fa ? "موتور اندیکاتور" : "Trex Engine",
    icon: "⚙",
    items: [
      { id: "eng-intro",      label: fa ? "معرفی" : "Overview" },
      { id: "eng-install",    label: fa ? "نصب" : "Installation" },
      { id: "eng-quickstart", label: fa ? "شروع سریع" : "Quick start" },
      { id: "eng-api",        label: fa ? "API اصلی" : "Core API" },
      // sub-folder label — not clickable
      { id: "", label: fa ? "اندیکاتورها" : "Indicators" },
      { id: "eng-trend",      label: fa ? "روند" : "Trend", depth: 1 },
      { id: "eng-volatility", label: fa ? "نوسان" : "Volatility", depth: 1 },
      { id: "eng-momentum",   label: fa ? "مومنتوم" : "Momentum", depth: 1 },
      { id: "eng-oscillators",label: fa ? "اسیلاتور" : "Oscillators", depth: 1 },
      { id: "eng-volume",     label: fa ? "حجم" : "Volume", depth: 1 },
      { id: "eng-statistics", label: fa ? "آمار" : "Statistics", depth: 1 },
      { id: "eng-patterns",   label: fa ? "الگو (۳۵)" : "Patterns (35)", depth: 1 },
      { id: "eng-output",     label: fa ? "انواع خروجی" : "Output types", depth: 1 },
      { id: "eng-multisym",   label: fa ? "چند نماد / CTF" : "Multi-symbol & CTF" },
      { id: "eng-db",         label: "PostgreSQL" },
      // sub-folder label — not clickable
      { id: "", label: fa ? "پلاگین‌ها" : "Plugins" },
      { id: "eng-plugin",           label: fa ? "اندیکاتور اختصاصی" : "Custom indicator", depth: 1 },
      { id: "eng-plugin-composite", label: fa ? "ترکیبی" : "Composite plugin", depth: 1 },
    ],
  },
  {
    group: fa ? "بک‌تست" : "BackTest",
    icon: "📊",
    items: [
      { id: "bt-intro",     label: fa ? "معرفی" : "Overview" },
      { id: "bt-install",   label: fa ? "نصب" : "Installation" },
      { id: "bt-quickstart",label: fa ? "شروع سریع" : "Quick start" },
      // sub-folder label — not clickable
      { id: "", label: fa ? "Strategy" : "Strategy" },
      { id: "bt-strategy",  label: fa ? "کلاس Strategy" : "Strategy class", depth: 1 },
      { id: "bt-commands",  label: fa ? "دستورات" : "Trading commands", depth: 1 },
      { id: "bt-events",    label: fa ? "رویدادها" : "Event hooks", depth: 1 },
      // sub-folder label — not clickable
      { id: "", label: fa ? "داده‌ها" : "Data" },
      { id: "bt-position",  label: fa ? "Position" : "Position fields", depth: 1 },
      { id: "bt-order",     label: fa ? "Order" : "Order fields", depth: 1 },
      { id: "bt-candles",   label: fa ? "بارگذاری کندل" : "Loading candles", depth: 1 },
      { id: "bt-result",    label: "BacktestResult", depth: 1 },
      { id: "bt-broadcast", label: fa ? "پخش زنده" : "Live chart replay" },
    ],
  },
  {
    group: fa ? "یکپارچه‌سازی" : "Integration",
    icon: "🔗",
    items: [
      { id: "integration", label: fa ? "هر سه پکیج با هم" : "All 3 packages together" },
      { id: "python",      label: fa ? "سرور خام (بدون SDK)" : "Raw server (no SDK)" },
    ],
  },
];

const NAVBAR_H = 56;
const SIDEBAR_W = 272;

export default function DocsPage({ lang = "fa", onBack }: { lang?: Lang; onBack: () => void }) {
  const [l, setL] = useState<Lang>(lang);
  const fa = l === "fa";
  const [active, setActive] = useState<string>("intro");
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [active]);

  const go = (id: string) => setActive(id);

  const navItemStyle = (id: string) =>
    active === id
      ? { borderInlineStartWidth: 3, borderInlineStartStyle: "solid" as const, borderInlineStartColor: "#f5a623", background: "rgba(245,166,35,0.12)", color: "#f5a623", fontWeight: 600, paddingInlineStart: 13 }
      : { borderInlineStartWidth: 3, borderInlineStartStyle: "solid" as const, borderInlineStartColor: "transparent", color: "#9da3b0", paddingInlineStart: 13 };

  return (
    <div style={{ background: "#1c1f26", color: "#cdd2db", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", height: "100vh", overflow: "hidden" }} dir={fa ? "rtl" : "ltr"}>

      {/* ══ Navbar ══ */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, height: NAVBAR_H, background: "#22252d", borderBottom: "1px solid #2e3340", display: "flex", alignItems: "center", gap: 12, padding: "0 20px", zIndex: 50 }}>
        <button type="button" onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #2e3340", cursor: "pointer", color: "#9da3b0", fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 6 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#2e3340"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}>
          <IconArrowLeft />{fa ? "بازگشت" : "Back"}
        </button>
        <div style={{ width: 1, height: 20, background: "#2e3340", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg,#FFB733,#FF7847)", fontWeight: 900, fontSize: 14, color: "#1a1206" }}>T</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#e2e4eb" }}>Trex</span>
          <span style={{ background: "rgba(245,166,35,0.15)", color: "#f5a623", fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, border: "1px solid rgba(245,166,35,0.3)" }}>Docs</span>
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1c1f26", border: "1px solid #2e3340", borderRadius: 8, padding: "0 12px", height: 34, width: "min(320px,40vw)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5c6070" strokeWidth="2"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <span style={{ fontSize: 12.5, color: "#5c6070" }}>{fa ? "جستجو…" : "Search..."}</span>
            <div style={{ flex: 1 }} />
            <kbd style={{ fontSize: 10, color: "#5c6070", background: "#22252d", border: "1px solid #2e3340", borderRadius: 4, padding: "1px 5px" }}>/</kbd>
          </div>
        </div>
        <div style={{ display: "flex", border: "1px solid #2e3340", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
          {(["fa","en"] as Lang[]).map(x => (
            <button key={x} type="button" onClick={() => setL(x)}
              style={{ padding: "5px 14px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: l === x ? "#f5a623" : "transparent", color: l === x ? "#1a1206" : "#9da3b0" }}>
              {x === "fa" ? "فارسی" : "English"}
            </button>
          ))}
        </div>
      </header>

      {/* ══ Sidebar ══ */}
      <aside className="trex-scroll" style={{ position: "fixed", top: NAVBAR_H, [fa ? "right" : "left"]: 0, width: SIDEBAR_W, height: `calc(100vh - ${NAVBAR_H}px)`, background: "#22252d", borderInlineEnd: "1px solid #2e3340", overflowY: "auto", zIndex: 40, paddingBottom: 32 }}>
        <nav style={{ paddingTop: 8 }}>
          {TOC_GROUPS(fa).map(grp => (
            <div key={grp.group} style={{ marginBottom: 4 }}>
              {/* Group header — acts as parent folder */}
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#6b7280", padding: fa ? "10px 16px 4px 8px" : "10px 8px 4px 16px" }}>
                <span style={{ fontSize: 12, opacity: 0.85 }}>{grp.icon}</span>
                {grp.group}
              </div>

              {/* Tree items — left/right border line acts as connector */}
              <div style={{ position: "relative", [fa ? "marginRight" : "marginLeft"]: 22, [fa ? "borderRight" : "borderLeft"]: "1px solid #2e3340" }}>
                {grp.items.map((t, idx) => {
                  // non-clickable sub-folder label
                  if (t.id === "") {
                    return (
                      <div key={t.label + idx} style={{
                        display: "flex", alignItems: "center", gap: 5,
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                        color: "#4b5263",
                        padding: fa ? "8px 16px 3px 8px" : "8px 8px 3px 16px",
                        position: "relative",
                      }}>
                        {/* horizontal connector */}
                        <span style={{ position: "absolute", [fa ? "right" : "left"]: -12, top: "50%", width: 8, height: 1, background: "#2e3340", marginTop: 4 }} />
                        <span style={{ color: "#f5a623", opacity: 0.5 }}>▸</span>
                        {t.label}
                      </div>
                    );
                  }

                  const depth = t.depth ?? 0;
                  const isActive = active === t.id;
                  const baseInlineStart = depth === 1 ? (fa ? 10 : 22) : (fa ? 10 : 10);
                  const baseInlineEnd = fa ? 22 : 10;

                  return (
                    <button key={t.id} type="button" onClick={() => go(t.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        width: "100%", textAlign: fa ? "right" : "left",
                        background: isActive ? "rgba(245,166,35,0.1)" : "none",
                        border: "none", cursor: "pointer",
                        fontSize: depth === 1 ? 12.5 : 13,
                        height: depth === 1 ? 28 : 30, lineHeight: depth === 1 ? "28px" : "30px",
                        paddingInlineStart: baseInlineStart, paddingInlineEnd: baseInlineEnd,
                        position: "relative",
                        color: isActive ? "#f5a623" : depth === 1 ? "#7a8292" : "#9da3b0",
                        transition: "color 0.12s, background 0.12s",
                        borderInlineStart: isActive ? "2px solid #f5a623" : "2px solid transparent",
                      }}
                      onMouseEnter={e => { if (!isActive) { const b = e.currentTarget as HTMLButtonElement; b.style.color = "#cdd2db"; b.style.background = "rgba(255,255,255,0.05)"; } }}
                      onMouseLeave={e => { if (!isActive) { const b = e.currentTarget as HTMLButtonElement; b.style.color = depth === 1 ? "#7a8292" : "#9da3b0"; b.style.background = "none"; } }}>
                      {/* horizontal connector tick */}
                      <span style={{ position: "absolute", [fa ? "right" : "left"]: -12, top: "50%", width: depth === 1 ? 10 : 7, height: 1, background: isActive ? "#f5a623" : "#2e3340", marginTop: 0.5, flexShrink: 0 }} />
                      {depth === 1 && <span style={{ width: 3, height: 3, borderRadius: "50%", background: isActive ? "#f5a623" : "#4b5263", flexShrink: 0 }} />}
                      <span dir="auto" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* ══ Main ══ */}
      <main ref={scrollerRef} className="trex-scroll" style={{ position: "fixed", top: NAVBAR_H, [fa ? "right" : "left"]: SIDEBAR_W, [fa ? "left" : "right"]: 0, height: `calc(100vh - ${NAVBAR_H}px)`, overflowY: "auto", background: "#1c1f26" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 48px 80px" }}>

          {/* Hero */}
          {active === "intro" && (
            <div style={{ marginBottom: 48, paddingBottom: 32, borderBottom: "1px solid #2e3340" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 600, color: "#f5a623", marginBottom: 16 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f5a623", display: "inline-block" }} />
                {fa ? "نسخه ۲.۰ · سه پکیج یکپارچه" : "v2.0 · Three integrated packages"}
              </div>
              <h1 style={{ fontSize: 34, fontWeight: 800, color: "#e2e4eb", lineHeight: 1.15, marginBottom: 12, letterSpacing: "-0.02em" }} dir="auto">
                {fa ? "مستندات Trex" : "Trex Docs"}
              </h1>
              <p style={{ fontSize: 15, color: "#9da3b0", lineHeight: 1.75, maxWidth: 560 }}>
                {fa ? "مستندات کامل سه پکیج Trex: ترمینال نموداری ریل‌تایم، موتور اندیکاتور با ۷۰+ اندیکاتور و ۳۵ الگوی کندل، و فریم‌ورک بک‌تست حرفه‌ای." : "Complete reference for all three Trex packages: the realtime charting terminal, a 70+ indicator engine with 35 candlestick patterns, and a professional backtesting framework."}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
                {[["quickstart", fa ? "شروع سریع ترمینال" : "Terminal quick start", true], ["eng-quickstart", fa ? "موتور اندیکاتور" : "Indicator Engine", false], ["bt-quickstart", fa ? "بک‌تست" : "BackTest", false], ["integration", fa ? "یکپارچه‌سازی" : "Integration", false]].map(([id, label, primary]) => (
                  <button key={id as string} type="button" onClick={() => go(id as string)}
                    style={{ borderRadius: 6, padding: "8px 18px", fontSize: 13, fontWeight: 600, border: primary ? "none" : "1px solid #3a3f4b", cursor: "pointer", background: primary ? "#f5a623" : "#22252d", color: primary ? "#1a1206" : "#cdd2db" }}>
                    {label as string}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ══ TrexTerminal ══ */}
          <Section id="intro" hidden={active !== "intro"} title={fa ? "معرفی" : "Introduction"}>
            <p>{fa ? "Trex Terminal یک ترمینال نموداری ریل‌تایم در سبک TradingView است که در یک فایل HTML مستقل بسته‌بندی می‌شود. دیتا یا از شبیه‌ساز داخلی (Demo) می‌آید یا از سرور WebSocket شما — هر دو دقیقاً از یک پروتکل استفاده می‌کنند." : "Trex Terminal is a realtime, TradingView-style charting terminal packaged as a single self-contained HTML file. Data comes either from the built-in simulator (Demo mode) or from your own WebSocket server — both speak the same protocol."}</p>
            <p className="mt-2">{fa ? "هر پیام یک JSON با فیلد " : "Every message is a JSON object carrying a "}<K>type</K>{fa ? " است. بقیه فیلدها به نوع پیام بستگی دارند." : " field; remaining fields depend on the message type."}</p>
            <Note kind="tip">{fa ? "Trex Engine و BackTest از همین پروتکل برای ارسال لایو اندیکاتورها و بار کندل به ترمینال استفاده می‌کنند. هیچ تنظیم اضافه‌ای لازم نیست — فقط broadcast=True." : "Trex Engine and BackTest use this same protocol to stream live indicators and candle bars to the terminal. No extra setup needed — just set broadcast=True."}</Note>
          </Section>

          <Section id="architecture" hidden={active !== "architecture"} title={fa ? "معماری (مهم)" : "Architecture (important)"}>
            <p>{fa ? "Trex یک کلاینت «فقط‌نمایشی» است. هیچ محاسبه‌ای انجام نمی‌دهد و جز درخواست داده هیچ‌چیز به سرور ارسال نمی‌کند." : "Trex is a display-only client. It performs no computation and sends nothing to the server except data requests."}</p>
            <Note kind="warn">{fa ? "ترسیم‌های کاربر هرگز به سرور ارسال نمی‌شوند (مگر از طریق drawing_upsert که سرور باید آن را مدیریت کند). دو مسیر مستقل: (۱) ترسیم‌های محلی کاربر و (۲) اشیای سروری که با پیام‌های drawing می‌آیند و فقط‌خواندنی رندر می‌شوند." : "User drawings are never pushed to the server unless your server handles drawing_upsert. Two separate paths: (1) user's local drawings — editable, and (2) server objects — arrive via drawing messages, render read-only exactly like indicators."}</Note>
            <p>{fa ? "جریان معمول یک سشن:" : "Typical session flow:"}</p>
            <ol className="list-decimal ps-5 space-y-1 mt-1">
              <li>{fa ? "کلاینت " : "Client sends "}<K>hello</K>{fa ? " می‌فرستد (هندشیک)" : " (handshake)"}</li>
              <li>{fa ? "سرور " : "Server replies with "}<K>snapshot</K>{fa ? " می‌فرستد (کندل‌ها + اندیکاتورها)" : " (candles + indicators)"}</li>
              <li>{fa ? "سرور با " : "Server streams realtime updates via "}<K>bar</K>{fa ? " استریم می‌کند" : ""}</li>
              <li>{fa ? "کلاینت هنگام پن به چپ " : "Client requests "}<K>history</K>{fa ? " درخواست می‌کند" : " when panning left"}</li>
            </ol>
          </Section>

          <Section id="quickstart" hidden={active !== "quickstart"} title={fa ? "شروع سریع" : "Quick start"}>
            <p>{fa ? 'فایل trex-terminal.html را در مرورگر باز کنید. در صفحه لودر، «Demo» شبیه‌ساز داخلی را اجرا می‌کند و «Connect» به آدرس WebSocket وارد‌شده وصل می‌شود (پیش‌فرض: ' : 'Open trex-terminal.html in a browser. On the loader screen, "Demo" runs the built-in simulator and "Connect" attaches to the WebSocket URL you enter (default: '}<K>ws://localhost:8765</K>{fa ? ")." : ")."}</p>
            <Note kind="tip">{fa ? "اگر از Trex Engine یا BackTest استفاده می‌کنید، فقط broadcast=True قرار دهید تا ترمینال به‌طور خودکار به پورت تنظیم‌شده وصل شود." : "If you're using Trex Engine or BackTest, just set broadcast=True and the terminal will connect automatically to the configured port."}</Note>
          </Section>

          <Section id="connection" hidden={active !== "connection"} title={fa ? "اتصال و پایداری" : "Connection & resilience"}>
            <ul className="list-disc space-y-1 ps-5">
              <li>{fa ? "اتصال مجدد خودکار با backoff نمایی (حداکثر ۱۰ ثانیه)." : "Automatic reconnect with exponential backoff (max 10 s delay)."}</li>
              <li>{fa ? "keepalive با ping/pong هر ۱۵ ثانیه؛ تأخیر RTT در نوار وضعیت نمایش داده می‌شود." : "ping/pong keepalive every 15 s; RTT shown in the status bar."}</li>
              <li>{fa ? "پیام‌ها هنگام قطعی در صف می‌مانند (حداکثر ۱۰۰ پیام)." : "Messages queued while disconnected, flushed on reconnect (max 100 messages)."}</li>
              <li>{fa ? "فریم‌های ناشناخته/نامعتبر بی‌صدا دور انداخته می‌شوند." : "Unknown or malformed frames dropped silently."}</li>
              <li>{fa ? "کندل‌های ورودی مرتب‌سازی و یکتاسازی می‌شوند." : "Inbound candles are sorted and de-duplicated automatically."}</li>
            </ul>
          </Section>

          <Section id="c2s" hidden={active !== "c2s"} title={fa ? "پیام‌ها: کلاینت ← سرور" : "Messages: client → server"}>
            <p>{fa ? "کلاینت فقط درخواست و رویداد UI می‌فرستد — هرگز داده بازار push نمی‌کند." : "The client only sends requests and UI events — it never pushes market data."}</p>
            <MsgTable fa={fa} headers={["type", "payload", fa ? "توضیح" : "Description"]} rows={clientRows(fa)} />
          </Section>

          <Section id="s2c" hidden={active !== "s2c"} title={fa ? "پیام‌ها: سرور ← کلاینت" : "Messages: server → client"}>
            <MsgTable fa={fa} headers={["type", "payload", fa ? "توضیح" : "Description"]} rows={serverRows(fa)} />
            <Note kind="tip">{fa ? "برای آپدیت ریل‌تایم اندیکاتور، در indicators فقط یک نقطه per key بفرستید تا مسیر سریع O(1) فعال شود. آرایه‌های بلندتر کل سری را جایگزین می‌کنند." : "For realtime indicator updates, send a single point per key in indicators to hit the O(1) fast path. Longer arrays replace the whole series."}</Note>
          </Section>

          <Section id="ohlc" hidden={active !== "ohlc"} title={fa ? "OHLC و PointData" : "OHLC & PointData"}>
            <p>{fa ? "واحد زمان همه‌جا «ثانیه یونیکس» است (نه میلی‌ثانیه). کندل‌ها باید دامنه زمانی اکیداً صعودی و یکتا داشته باشند." : "Time is unix SECONDS everywhere (not milliseconds). Candles must form a strictly-increasing, unique time domain."}</p>
            <Code lang="json">{OHLC_SCHEMA}</Code>
          </Section>

          <Section id="defschema" hidden={active !== "defschema"} title={fa ? "اسکیمای SeriesDefinition" : "SeriesDefinition schema"}>
            <p>{fa ? "هر سری اندیکاتور با این آبجکت تعریف می‌شود. سری‌های pane:\"sub\" به‌صورت خودکار پنل جداگانه با اسکیل مستقل می‌گیرند." : "Every indicator series is described by this object. Series with pane:\"sub\" automatically get their own pane with an independent scale."}</p>
            <Code lang="json">{DEF_SCHEMA}</Code>
          </Section>

          <Section id="drawschema" hidden={active !== "drawschema"} title={fa ? "اشیای ترسیمی (سروری)" : "Drawing objects (server-side)"}>
            <p>{fa ? "اشیا با مختصات داده (time, price) ذخیره می‌شوند، پس با زوم/پن لنگر می‌مانند. اشیایی که از سرور می‌آیند با locked:true فقط‌خواندنی رندر می‌شوند." : "Objects are stored in data coordinates (time, price), anchored through zoom/pan. Server objects render read-only with locked:true."}</p>
            <Code lang="json">{DRAWING_SCHEMA}</Code>
          </Section>

          <Section id="multichart" hidden={active !== "multichart"} title={fa ? "چیدمان چند نمودار" : "Multi-chart layouts"}>
            <p>{fa ? "ترمینال از سه چیدمان پشتیبانی می‌کند: single (یک نمودار)، split2 (دو نمودار کنار هم)، و grid4 (شبکه ۲×۲). هر نمودار chartId مستقل دارد." : "The terminal supports three layouts: single, split2 (side by side), and grid4 (2×2 grid). Each chart has its own independent chartId."}</p>
            <Code lang="javascript">{MULTICHART_EXAMPLE}</Code>
            <Note>{fa ? "پیام‌های chart_snapshot، chart_bar، و chart_history هر کدام chartId دارند تا ترمینال بداند کدام نمودار را آپدیت کند." : "The chart_snapshot, chart_bar, and chart_history messages all include a chartId so the terminal knows which chart to update."}</Note>
          </Section>

          <Section id="tools" hidden={active !== "tools"} title={fa ? "ابزارهای ترسیم" : "Drawing tools"}>
            <p>{fa ? "۱۶ ابزار ترسیم پشتیبانی می‌شود:" : "Sixteen drawing tools are supported:"}</p>
            <KVTable rows={drawingTools(fa)} fa={fa} />
          </Section>

          <Section id="builder" hidden={active !== "builder"} title={fa ? "طراح اندیکاتور" : "Indicator Builder"}>
            <p>{fa ? "محیط drag & drop برای طراحی ظاهر اندیکاتور (نه محاسبه). خروجی یک قالب JSON است که به سرور می‌گوید چه داده‌ای بفرستد:" : "A drag-and-drop environment for designing indicator appearance (not its math). Output is a JSON template telling the server what data to send:"}</p>
            <Code lang="json">{TEMPLATE_SCHEMA}</Code>
            <Note>{fa ? "بخش definitions ظاهر را تعریف می‌کند و dataRequest به سرور می‌گوید برای هر کلید چه چیزی محاسبه و ارسال کند. کلاینت هیچ محاسبه‌ای نمی‌کند." : "definitions defines appearance; dataRequest tells the server what to compute per key. The client performs no computation."}</Note>
          </Section>

          <Section id="workspace" hidden={active !== "workspace"} title={fa ? "میزکار و ماندگاری" : "Workspace & persistence"}>
            <ul className="list-disc space-y-1 ps-5">
              <li>{fa ? "چیدمان چند‌نموداری: single، split2 (دو نمودار)، یا grid4 (شبکه ۲×۲)." : "Multi-chart layouts: single, split2, or grid4."}</li>
              <li>{fa ? "نوار شناور علاقه‌مندی‌ها: ابزارهای ستاره‌دار." : "Floating favorites bar: starred tools."}</li>
              <li>{fa ? "ماندگاری در localStorage: نماد، تایم‌فریم، نوع نمایش، تنظیمات ظاهری، چیدمان." : "localStorage persistence: symbol, timeframe, display type, appearance, layout."}</li>
            </ul>
            <Note kind="warn">{fa ? "فقط ترجیحات UI ذخیره می‌شوند — هیچ داده بازاری کش نمی‌شود." : "Only UI preferences are stored — no market data is cached."}</Note>
          </Section>

          <Section id="keys" hidden={active !== "keys"} title={fa ? "میان‌برهای صفحه‌کلید" : "Keyboard shortcuts"}>
            <KVTable rows={shortcuts(fa)} fa={fa} />
          </Section>

          {/* ══ Trex Engine ══ */}
          <Section id="eng-intro" hidden={active !== "eng-intro"} title={fa ? "Trex Engine — موتور اندیکاتور" : "Trex Engine — Indicator Engine"}>
            <p>{fa ? "Trex Engine یک موتور اندیکاتور ریل‌تایم برای پایتون است. هر اندیکاتور در یک context (نماد × تایم‌فریم) زندگی می‌کند. موتور CTF (تبدیل تایم‌فریم) خودکار، ذخیره/بازیابی وضعیت در PostgreSQL، پخش زنده به TrexTerminal، و سیستم Plugin برای اندیکاتورهای اختصاصی را پشتیبانی می‌کند." : "Trex Engine is a realtime Python indicator engine. Each indicator lives in a context (symbol × timeframe). The engine supports automatic CTF (ConvertTimeFrame) aggregation, state save/restore via PostgreSQL, live broadcast to TrexTerminal, and a Plugin system for custom indicators."}</p>
            <KVTable fa={fa} rows={[
              [fa ? "Trend / MA" : "Trend / MA",         fa ? "SMA, EMA, WMA, HMA, DEMA, TEMA, ZLEMA, VWMA, VWAP, KAMA, SuperTrend, Ichimoku, PSAR, Donchian, ZigZag" : "SMA, EMA, WMA, HMA, DEMA, TEMA, ZLEMA, VWMA, VWAP, KAMA, SuperTrend, Ichimoku, PSAR, Donchian, ZigZag"],
              [fa ? "Volatility" : "Volatility",         "ATR, NATR, StdDev, HV, BB, Keltner, Chandelier, Ulcer Index"],
              [fa ? "Momentum" : "Momentum",             "RSI, StochRSI, MACD, ADX, Aroon, Vortex, RVI, Fisher, PPO, APO, TRIX, ROC, CMO, UO, Choppiness, AO, AC, TSI, DPO, KST, Coppock, Force Index"],
              [fa ? "Oscillators" : "Oscillators",       "Stochastic, CCI, Williams %R, MFI"],
              [fa ? "Volume" : "Volume",                 "OBV, A/D, ADOSC, CMF, EOM, NVI, PVI, PVT, Volume Osc., VROC"],
              [fa ? "Statistics" : "Statistics",         "Z-Score, Variance, LinReg Slope, Correlation, PercentRank"],
              [fa ? "الگوهای کندل" : "Candlestick",     fa ? "۳۵ الگو — تک‌کندل، دو‌کندل، سه‌کندل" : "35 patterns — single, two-candle, three-candle"],
            ]} />
          </Section>

          <Section id="eng-install" hidden={active !== "eng-install"} title={fa ? "نصب Trex Engine" : "Installing Trex Engine"}>
            <Code lang="bash">{TREX_INSTALL}</Code>
          </Section>

          <Section id="eng-quickstart" hidden={active !== "eng-quickstart"} title={fa ? "شروع سریع — Trex Engine" : "Trex Engine quick start"}>
            <Code lang="python">{TREX_QUICKSTART}</Code>
          </Section>

          <Section id="eng-api" hidden={active !== "eng-api"} title={fa ? "API اصلی" : "Core API"}>
            <Code lang="python">{TREX_INIT_API}</Code>
            <Note kind="tip">{fa ? "هر فراخوانی اندیکاتور یک ListenerKey برمی‌گرداند که با de_attach() می‌توانید listener را حذف کنید." : "Each indicator call returns a ListenerKey you can use with de_attach() to remove the listener."}</Note>
          </Section>

          <Section id="eng-trend" hidden={active !== "eng-trend"} title={fa ? "اندیکاتورهای روند و MA" : "Trend & Moving Average indicators"}>
            <Code lang="python">{TREX_TREND}</Code>
          </Section>

          <Section id="eng-volatility" hidden={active !== "eng-volatility"} title={fa ? "اندیکاتورهای نوسان" : "Volatility indicators"}>
            <Code lang="python">{TREX_VOLATILITY}</Code>
          </Section>

          <Section id="eng-momentum" hidden={active !== "eng-momentum"} title={fa ? "اندیکاتورهای مومنتوم" : "Momentum indicators"}>
            <Code lang="python">{TREX_MOMENTUM}</Code>
          </Section>

          <Section id="eng-oscillators" hidden={active !== "eng-oscillators"} title={fa ? "اسیلاتورها" : "Oscillator indicators"}>
            <Code lang="python">{TREX_OSCILLATORS}</Code>
          </Section>

          <Section id="eng-volume" hidden={active !== "eng-volume"} title={fa ? "اندیکاتورهای حجم" : "Volume indicators"}>
            <Code lang="python">{TREX_VOLUME}</Code>
          </Section>

          <Section id="eng-statistics" hidden={active !== "eng-statistics"} title={fa ? "آمار و احتمال" : "Statistics"}>
            <Code lang="python">{TREX_STATISTICS}</Code>
          </Section>

          <Section id="eng-patterns" hidden={active !== "eng-patterns"} title={fa ? "الگوهای کندل‌استیک (۳۵ الگو)" : "Candlestick patterns (35)"}>
            <p>{fa ? "تمام توابع الگو bool برمی‌گردانند — True یعنی الگو روی همین کندل تشخیص داده شده." : "All pattern functions return bool — True means the pattern was detected on this bar."}</p>
            <Code lang="python">{TREX_PATTERNS}</Code>
          </Section>

          <Section id="eng-output" hidden={active !== "eng-output"} title={fa ? "انواع خروجی اندیکاتورها" : "Indicator output types"}>
            <p>{fa ? "اندیکاتورهایی که چند مقدار دارند، dataclass برمی‌گردانند. می‌توانید مستقیم به فیلدها دسترسی داشته باشید:" : "Indicators with multiple outputs return dataclass instances. Access fields directly:"}</p>
            <Code lang="python">{TREX_OUTPUT_TYPES}</Code>
          </Section>

          <Section id="eng-multisym" hidden={active !== "eng-multisym"} title={fa ? "چند نماد و CTF خودکار" : "Multi-symbol & automatic CTF"}>
            <p>{fa ? "هر ترکیب (نماد × تایم‌فریم) یک context مستقل است. CTF (ConvertTimeFrame) وقتی تایم‌فریم اندیکاتور از source_timeframe بزرگ‌تر است به‌صورت خودکار فعال می‌شود." : "Every (symbol × timeframe) pair is an independent context. CTF activates automatically when the requested timeframe is larger than source_timeframe."}</p>
            <Code lang="python">{TREX_MULTISYM}</Code>
          </Section>

          <Section id="eng-db" hidden={active !== "eng-db"} title={fa ? "PostgreSQL و ماندگاری وضعیت" : "PostgreSQL & state persistence"}>
            <Code lang="python">{TREX_DB}</Code>
          </Section>

          <Section id="eng-plugin" hidden={active !== "eng-plugin"} title={fa ? "اندیکاتور اختصاصی — Plugin" : "Custom indicator — Plugin system"}>
            <p>{fa ? "با سیستم Plugin می‌توانید اندیکاتور اختصاصی بسازید و بدون تغییر سورس کتابخانه آن را به‌صورت citizen درجه اول استفاده کنید:" : "The Plugin system lets you register a custom indicator as a first-class citizen without modifying library source:"}</p>
            <Code lang="python">{TREX_PLUGIN}</Code>
          </Section>

          <Section id="eng-plugin-composite" hidden={active !== "eng-plugin-composite"} title={fa ? "Plugin ترکیبی (با sub-indicator)" : "Composite plugin (with sub-indicators)"}>
            <p>{fa ? "اگر اندیکاتور شما نیاز به اندیکاتورهای دیگر دارد، آن‌ها را داخل init_depends از طریق self._ctx.api رجیستر کنید. هرگز مستقیم add_input_value را به sub-indicator فوروارد نکنید (double-feed bug)." : "If your indicator depends on other indicators, register them inside init_depends via self._ctx.api. Never forward add_input_value directly to sub-indicators (double-feed bug)."}</p>
            <Code lang="python">{TREX_PLUGIN_COMPOSITE}</Code>
          </Section>

          {/* ══ BackTest ══ */}
          <Section id="bt-intro" hidden={active !== "bt-intro"} title={fa ? "BackTest — فریم‌ورک بک‌تست" : "BackTest Framework"}>
            <p>{fa ? "BackTest یک فریم‌ورک بک‌تست حرفه‌ای است که با Trex Engine یکپارچه می‌شود. شما یک کلاس Strategy می‌نویسید، اندیکاتورها را در indicators() رجیستر می‌کنید، و منطق معامله را در on_kline() می‌نویسید." : "BackTest is a professional backtesting framework integrated with Trex Engine. You write a Strategy class, register indicators in indicators(), and implement trading logic in on_kline()."}</p>
            <p className="mt-2">{fa ? "ترتیب اجرا برای هر کندل:" : "Execution order per bar:"}</p>
            <ol className="mt-1 list-decimal space-y-1 ps-5">
              <li><K>trex.push(bar)</K> {fa ? "← اندیکاتورها محاسبه می‌شوند، listenerها اجرا می‌شوند" : "← indicators computed, listeners fired"}</li>
              <li><K>exchange.kline(bar)</K> {fa ? "← سفارشات لیمیت بررسی می‌شوند، موقعیت‌ها به‌روز می‌شوند" : "← limit orders checked, positions updated"}</li>
              <li><K>strategy.on_kline(bar)</K> {fa ? "← منطق کاربر اجرا می‌شود، سفارشات جدید ثبت می‌شوند" : "← user logic runs, new orders placed"}</li>
            </ol>
            <Note>{fa ? "سفارشات مارکت که در on_kline() ثبت می‌شوند با قیمت close همان کندل اجرا می‌شوند. سفارشات لیمیت از کندل بعدی بررسی می‌شوند." : "Market orders placed in on_kline() execute at the current bar's close. Limit orders are evaluated from the next bar onward."}</Note>
          </Section>

          <Section id="bt-install" hidden={active !== "bt-install"} title={fa ? "نصب BackTest" : "Installing BackTest"}>
            <Code lang="bash">{BT_INSTALL}</Code>
          </Section>

          <Section id="bt-quickstart" hidden={active !== "bt-quickstart"} title={fa ? "شروع سریع — BackTest" : "BackTest quick start"}>
            <Code lang="python">{BT_QUICKSTART}</Code>
          </Section>

          <Section id="bt-strategy" hidden={active !== "bt-strategy"} title={fa ? "کلاس Strategy — تنظیمات" : "Strategy class — configuration"}>
            <Code lang="python">{BT_STRATEGY_ATTRS}</Code>
          </Section>

          <Section id="bt-commands" hidden={active !== "bt-commands"} title={fa ? "دستورات معامله" : "Trading commands"}>
            <Code lang="python">{BT_COMMANDS}</Code>
          </Section>

          <Section id="bt-events" hidden={active !== "bt-events"} title={fa ? "رویدادها (Event Hooks)" : "Event hooks"}>
            <p>{fa ? "این متدها را در کلاس Strategy خود override کنید:" : "Override these methods in your Strategy class:"}</p>
            <Code lang="python">{BT_EVENTS}</Code>
          </Section>

          <Section id="bt-position" hidden={active !== "bt-position"} title={fa ? "فیلدهای Position" : "Position fields"}>
            <Code lang="python">{BT_POSITION}</Code>
          </Section>

          <Section id="bt-order" hidden={active !== "bt-order"} title={fa ? "فیلدهای Order" : "Order fields"}>
            <Code lang="python">{BT_ORDER}</Code>
          </Section>

          <Section id="bt-candles" hidden={active !== "bt-candles"} title={fa ? "بارگذاری کندل" : "Loading candles"}>
            <Code lang="python">{BT_CANDLES}</Code>
          </Section>

          <Section id="bt-result" hidden={active !== "bt-result"} title={fa ? "BacktestResult — نتایج" : "BacktestResult"}>
            <Code lang="python">{BT_RESULT}</Code>
          </Section>

          <Section id="bt-broadcast" hidden={active !== "bt-broadcast"} title={fa ? "پخش زنده روی TrexTerminal" : "Live chart replay"}>
            <p>{fa ? "با broadcast=True، هر کندل به‌صورت زنده به TrexTerminal broadcast می‌شود:" : "Set broadcast=True to stream each bar to TrexTerminal in realtime:"}</p>
            <Code lang="python">{BT_BROADCAST}</Code>
          </Section>

          {/* ══ Integration ══ */}
          <Section id="integration" hidden={active !== "integration"} title={fa ? "یکپارچه‌سازی — هر سه پکیج با هم" : "Integration — all 3 packages together"}>
            <p>{fa ? "این مثال نشان می‌دهد چطور هر سه پکیج با هم کار می‌کنند: Trex Engine اندیکاتورها را محاسبه می‌کند، BackTest معاملات را شبیه‌سازی می‌کند، و TrexTerminal نتیجه را به‌صورت زنده نمایش می‌دهد." : "This example shows how all three packages work together: Trex Engine computes indicators, BackTest simulates trades, and TrexTerminal visualizes the replay live."}</p>
            <Code lang="python">{INTEGRATION_EXAMPLE}</Code>
            <Note kind="tip">{fa ? "بعد از اجرا، فایل trex-terminal.html را در مرورگر باز کنید و به ws://localhost:8765 وصل شوید تا بک‌تست را روی چارت واقعی ببینید." : "After running, open trex-terminal.html in your browser and connect to ws://localhost:8765 to watch the backtest replay on a live chart."}</Note>
          </Section>

          <Section id="python" hidden={active !== "python"} title={fa ? "سرور خام — بدون SDK" : "Raw WebSocket server — no SDK"}>
            <p>{fa ? "اگر نمی‌خواهید از هیچ SDK استفاده کنید، این یک سرور خام کمینه اما کامل است:" : "If you prefer not to use any SDK, here's a minimal but complete raw WebSocket server:"}</p>
            <Code lang="python">{PY_RAW}</Code>
          </Section>

          <div style={{ paddingTop: 24, paddingBottom: 40, textAlign: "center", fontSize: 11, color: "#5c6070" }}>
            Trex · {fa ? "ساخته‌شده با React 19، lightweight-charts v5، Trex Engine، و BackTest" : "Built with React 19, lightweight-charts v5, Trex Engine & BackTest"}
          </div>
        </div>
      </main>
    </div>
  );
}
