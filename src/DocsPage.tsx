// ═══════════════════════════════════════════════════════════════════
// Trex Terminal — Documentation Page
// ═══════════════════════════════════════════════════════════════════
// A complete, bilingual (فارسی / English) reference for all three
// Trex packages: TrexTerminal (WebSocket protocol), Trex Engine
// (indicator engine), and BackTest (backtesting framework).
//
// Layout: GitBook-style fixed sidebar + fixed right TOC + scrollable
// content area. Persian renders right-to-left while code blocks and
// protocol tables stay LTR for readability.
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, type ReactNode } from "react";
import { IconArrowLeft } from "./icons";

type Lang = "fa" | "en";

/* ════════════════════════════ building blocks ════════════════════ */

function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div
      dir="ltr"
      className="my-4 overflow-hidden"
      style={{ background: "#141720", border: "1px solid #2a2d36", borderRadius: 8 }}
    >
      {lang && (
        <div
          className="flex items-center gap-1.5 px-3.5 py-2"
          style={{ borderBottom: "1px solid #2a2d36", background: "#141720" }}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          <span className="ms-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "#5c6070" }}>
            {lang}
          </span>
        </div>
      )}
      <pre
        className="trex-scroll overflow-x-auto p-4 text-left font-mono text-[11.5px] leading-relaxed"
        style={{ color: "#c8d0dc" }}
      >
        {children}
      </pre>
    </div>
  );
}

function K({ children }: { children: ReactNode }) {
  return (
    <code
      dir="ltr"
      className="rounded-[5px] px-1.5 py-px font-mono text-[11px]"
      style={{ border: "1px solid #2d3139", background: "#1e2128", color: "#f5a623" }}
    >
      {children}
    </code>
  );
}

function Note({ kind = "note", children }: { kind?: "note" | "warn" | "tip"; children: ReactNode }) {
  const tone = {
    note: { bar: "#f5a623", bg: "rgba(245,166,35,0.07)", ring: "rgba(245,166,35,0.2)" },
    warn: { bar: "#F23645", bg: "rgba(242,54,69,0.07)", ring: "rgba(242,54,69,0.2)" },
    tip:  { bar: "#1FBF8F", bg: "rgba(31,191,143,0.07)", ring: "rgba(31,191,143,0.2)" },
  }[kind];
  return (
    <div
      className="my-4 rounded-[8px] px-4 py-3.5 text-[12.5px] leading-relaxed"
      style={{
        borderInlineStartWidth: 3,
        borderInlineStartStyle: "solid",
        borderInlineStartColor: tone.bar,
        background: tone.bg,
        border: `1px solid ${tone.ring}`,
        borderLeftColor: tone.bar,
        color: "#9da3b0",
      }}
    >
      {children}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <>
      <section id={id} className="scroll-mt-[68px]">
        <h2
          className="mb-4 flex items-center gap-3 text-start font-bold leading-tight"
          style={{ fontSize: 22, color: "#e2e4eb", paddingTop: 32, marginBottom: 16 }}
        >
          <span
            className="inline-block shrink-0 rounded-full"
            style={{ width: 3, height: 20, background: "#f5a623" }}
          />
          <span dir="auto">{title}</span>
        </h2>
        <div
          className="space-y-3 text-start leading-[1.8]"
          style={{ fontSize: 13.5, color: "#9da3b0" }}
        >
          {children}
        </div>
      </section>
      <hr style={{ borderColor: "#2d3139", margin: "32px 0 0 0" }} />
    </>
  );
}

interface MsgRow { type: string; payload: string; desc: string }

function MsgTable({ rows, headers, fa }: { rows: MsgRow[]; headers: [string, string, string]; fa: boolean }) {
  return (
    <div
      dir="ltr"
      className="trex-scroll my-4 overflow-x-auto"
      style={{ borderRadius: 10, border: "1px solid #272B35" }}
    >
      <table className="w-full border-collapse text-left text-[12px]">
        <thead>
          <tr
            className="text-[10.5px] uppercase tracking-wider"
            style={{ borderBottom: "2px solid #323743", background: "#191D24", color: "#8A8F9C" }}
          >
            <th className="px-3.5 py-2.5 font-semibold">{headers[0]}</th>
            <th className="px-3.5 py-2.5 font-semibold">{headers[1]}</th>
            <th className="px-3.5 py-2.5 font-semibold">{headers[2]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.type + r.payload}
              className="align-top"
              style={{ borderTop: "1px solid #21252E", background: i % 2 ? "#15181F" : "transparent" }}
            >
              <td className="whitespace-nowrap px-3.5 py-2.5 font-mono font-medium" style={{ color: "#f5a623" }}>{r.type}</td>
              <td className="px-3.5 py-2.5 font-mono text-[11px]" style={{ color: "#9598A1" }}>{r.payload}</td>
              <td className="px-3.5 py-2.5" style={{ color: "#B7BAC4" }} dir={fa ? "rtl" : "ltr"}>{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KVTable({ rows, fa }: { rows: [string, string][]; fa: boolean }) {
  return (
    <div
      dir="ltr"
      className="trex-scroll my-4 overflow-x-auto"
      style={{ borderRadius: 10, border: "1px solid #272B35" }}
    >
      <table className="w-full border-collapse text-left text-[12px]">
        <tbody>
          {rows.map(([k, d], i) => (
            <tr
              key={k}
              style={{ borderTop: i === 0 ? "none" : "1px solid #21252E", background: i % 2 ? "#15181F" : "transparent" }}
            >
              <td className="whitespace-nowrap px-3.5 py-2.5 font-mono font-medium" style={{ color: "#f5a623" }}>{k}</td>
              <td className="px-3.5 py-2.5" style={{ color: "#B7BAC4" }} dir={fa ? "rtl" : "ltr"}>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════════════════════ protocol data ══════════════════════ */

const clientRows = (fa: boolean): MsgRow[] => [
  { type: "hello",     payload: `{ client, version }`,    desc: fa ? "معرفی کلاینت بلافاصله بعد از اتصال (هندشیک)." : "Client handshake sent right after the socket opens." },
  { type: "ping",      payload: `{}`,                     desc: fa ? "هر ۱۵ ثانیه؛ سرور باید pong برگرداند (برای محاسبه‌ی تأخیر RTT)." : "Every 15s; server must reply with pong (used to derive RTT latency)." },
  { type: "history",   payload: `{ before, count }`,      desc: fa ? "درخواست کندل‌های قدیمی‌تر از یک timestamp (لیزی‌لود هنگام اسکرول به چپ)." : "Request candles older than a timestamp (lazy-loaded when panning left)." },
  { type: "symbol",    payload: `{ symbol }`,              desc: fa ? "کاربر نماد را عوض کرد؛ سرور باید snapshot جدید بفرستد." : "User changed the symbol; reply with a fresh snapshot." },
  { type: "timeframe", payload: `{ timeframe }`,           desc: fa ? "کاربر تایم‌فریم را عوض کرد؛ سرور باید snapshot جدید بفرستد." : "User changed the timeframe; reply with a fresh snapshot." },
  { type: "chartType", payload: `{ chartType }`,           desc: fa ? "اطلاع‌رسانی: نوع نمایش عوض شد (candles / heikin / line / area / bars)." : "Informational: display type changed (candles / heikin / line / area / bars)." },
];

const serverRows = (fa: boolean): MsgRow[] => [
  { type: "snapshot | init",       payload: `{ data, definitions?, points?, drawings?, symbol?, timeframe?, digits? }`, desc: fa ? "بار اولیه: آرایه‌ی کندل + تعریف سری‌ها + داده‌ی آن‌ها + اشیای سروری اختیاری." : "Initial load: candle array + series definitions + their data + optional server objects." },
  { type: "candles",               payload: `{ data: OHLC[] }`,                     desc: fa ? "جایگزینی کامل کندل‌ها." : "Full candle replacement." },
  { type: "bar | tick | update",   payload: `{ bar: OHLC }`,                        desc: fa ? "آپدیت زنده: time برابر آخرین کندل آن را به‌جا آپدیت می‌کند؛ time جدیدتر یک کندل تازه اضافه می‌کند." : "Realtime: a matching time updates the last candle in place; a newer time appends a fresh one." },
  { type: "history",               payload: `{ data: OHLC[], noMoreHistory? }`,      desc: fa ? "پاسخ به history؛ آرایه‌ی خالی یا noMoreHistory یعنی دیتای قدیمی‌تری نیست." : "Reply to a history request; an empty array or noMoreHistory means nothing older exists." },
  { type: "definitions",           payload: `{ definitions: SeriesDefinition[] }`,   desc: fa ? "تعریف/به‌روزرسانی سری‌های اندیکاتور (پنل اصلی یا زیرین)." : "Define / update indicator series (main pane or sub-panes)." },
  { type: "indicators",            payload: `{ points: { [key]: PointData[] } }`,    desc: fa ? "داده‌ی سری‌ها؛ آرایه‌ی تک‌عضوی فقط آخرین نقطه را آپدیت می‌کند (مسیر سریع ریل‌تایم)." : "Series data; a single-element array updates only the last point (fast realtime path)." },
  { type: "drawings | drawing_set",payload: `{ drawings: Drawing[] }`,               desc: fa ? "ست‌کردن کامل اشیای سروری روی نمودار — فقط‌خواندنی، دقیقاً مثل اندیکاتور." : "Replace all server objects on the chart — read-only, exactly like indicators." },
  { type: "drawing | drawing_upsert",payload:`{ drawing: Drawing }`,                 desc: fa ? "افزودن/به‌روزرسانی یک شیء سروری." : "Add / update a single server object." },
  { type: "drawing_delete",        payload: `{ drawingIds | drawingId }`,            desc: fa ? "حذف اشیای سروری مشخص." : "Remove specific server objects." },
  { type: "drawings_clear",        payload: `{}`,                                    desc: fa ? "پاک‌کردن همه‌ی اشیای سروری." : "Clear all server objects." },
  { type: "settings",              payload: `{ settings: Partial<ChartSettings> }`,  desc: fa ? "پچ‌کردن ریموت تنظیمات ظاهری نمودار." : "Remotely patch chart appearance settings." },
  { type: "magnet",                payload: `{ magnet: boolean }`,                   desc: fa ? "روشن/خاموش‌کردن مگنت از سمت سرور." : "Toggle magnet mode remotely." },
  { type: "chartType",             payload: `{ chartType }`,                         desc: fa ? "تغییر نوع نمایش از سمت سرور." : "Switch the display type remotely." },
  { type: "symbol | timeframe",    payload: `{ symbol } / { timeframe }`,            desc: fa ? "به‌روزرسانی لیبل نماد/تایم‌فریم در UI." : "Update the symbol / timeframe label in the UI." },
  { type: "fitContent",            payload: `{}`,                                    desc: fa ? "فیت‌کردن کل دیتا در دید." : "Fit all data into view." },
  { type: "scrollToEnd",           payload: `{}`,                                    desc: fa ? "پرش به آخرین کندل." : "Jump to the latest candle." },
  { type: "zoomRange",             payload: `{ zoomRange: { from, to } }`,           desc: fa ? "زوم روی بازه‌ی زمانی مشخص (timestamp ثانیه)." : "Zoom to a time range (unix-second timestamps)." },
  { type: "toast",                 payload: `{ message, toastType? }`,               desc: fa ? "نمایش اعلان (info | success | error | warning)." : "Show a toast (info | success | error | warning)." },
  { type: "pong",                  payload: `{}`,                                    desc: fa ? "پاسخ ping؛ کلاینت با آن تأخیر را می‌سنجد." : "Reply to ping; the client derives latency from it." },
];

const OHLC_SCHEMA = `// A single candle. \`time\` is unix SECONDS (not ms).
{
  "time":   1718100000,   // unix seconds, strictly increasing & unique
  "open":   42010.5,
  "high":   42120.0,
  "low":    41980.2,
  "close":  42095.7,
  "volume": 18.42          // optional
}

// PointData — one value of an indicator series, keyed by definition.key
{
  "time":  1718100000,
  "value": 42050.3,
  "color": "#089981"       // optional per-point color (histogram/scatter)
}`;

const DEF_SCHEMA = `{
  "key": "rsi",                 // unique series id — points arrive under this key
  "label": "RSI (14)",          // legend text
  "pane": "sub",                // "main" overlays price · "sub" gets its own pane
  "paneId": "rsi_pane",         // sub-series sharing a paneId share one pane
  "type": "line",               // line | histogram | area | baseline | scatter
  "color": "#AB47BC",
  "colorPos": "#089981",        // histogram/baseline: value >= 0
  "colorNeg": "#F23645",        // histogram/baseline: value < 0
  "lineWidth": 2,
  "lineStyle": 0,               // 0 solid · 1 dotted · 2 dashed
  "subPaneHeight": 120,         // px, sub panes only
  "scaleMargins": { "top": 0.1, "bottom": 0.1 },
  "digits": 2,                  // price precision in the legend
  "priceLineVisible": false,
  "lastValueVisible": true,
  "visible": true,
  "levels": [                   // optional horizontal guide lines
    { "value": 70, "color": "#787B86", "lineStyle": 2, "label": "70" }
  ],
  "baseValue": 0,               // baseline type only
  "meta": {                     // optional — written by the Indicator Builder
    "calc": { "source": "close", "transform": "rsi", "period": 14 }
  }
}`;

const DRAWING_SCHEMA = `{
  "id": "srv_8f3k2",            // any unique string
  "tool": "fibRetracement",     // see the drawing-tools list below
  "points": [ { "time": 1718100000, "price": 42850.5 }, ... ],
  "style": {
    "color": "#2962FF", "lineWidth": 1, "lineStyle": 0,
    "fillColor": "#2962FF", "fillOpacity": 0.12,
    "fontSize": 13, "showLabels": true,
    "extendLeft": false, "extendRight": false
  },
  "text": "breakout",           // text tool only
  "paneId": "main",
  "locked": true, "visible": true,
  "completed": true, "selected": false,
  "positionData": {             // long/short position tools only
    "entryPrice": 42000, "stopLoss": 41500,
    "takeProfit": 43500, "quantity": 1, "risk": 500, "reward": 1500
  },
  "fibLevels": [                // fib tools only
    { "value": 0.618, "color": "#2196F3", "enabled": true }, ...
  ]
}`;

const TEMPLATE_SCHEMA = `{
  "type": "definitions",
  "protocol": "2.0.0",
  "generator": "trex-indicator-designer@1",
  "definitions": [ /* SeriesDefinition[] — the visual spec */ ],
  "dataRequest": [               // what the SERVER must compute & stream
    {
      "key": "sma20",
      "pane": "main",
      "seriesType": "line",
      "calc": { "source": "close", "transform": "sma", "period": 20 }
    }
  ]
}`;

const PY_EXAMPLE = `# pip install websockets
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
        CANDLES.append({"time": t + i * step, "open": o, "high": h,
                        "low": l, "close": c, "volume": random.uniform(5, 50)})
        price = c
seed()

def sma(period=20):
    out, s = [], 0.0
    for i, c in enumerate(CANDLES):
        s += c["close"]
        if i >= period: s -= CANDLES[i - period]["close"]
        if i >= period - 1:
            out.append({"time": c["time"], "value": s / period})
    return out

async def handler(ws):
    await ws.send(json.dumps({
        "type": "snapshot",
        "symbol": "BTCUSDT", "timeframe": "1m", "digits": 2,
        "data": CANDLES,
        "definitions": [{
            "key": "sma20", "label": "SMA 20", "pane": "main", "paneId": "sma20",
            "type": "line", "color": "#26A69A", "lineWidth": 2, "lineStyle": 0,
            "digits": 2, "visible": True
        }],
        "points": {"sma20": sma(20)},
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
    finally:
        task.cancel()

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        print("Trex demo server on ws://localhost:8765")
        await asyncio.Future()

asyncio.run(main())`;

/* ── Trex Engine data ─────────────────────────────────────────────── */

const TREX_INSTALL = `pip install trex-engine          # from PyPI
# or from source:
git clone https://github.com/your-org/trex_engin
pip install -e trex_engin/`;

const TREX_QUICKSTART = `import trex

# 1. Initialize — starts the WebSocket server + scheduler
trex.init(port=8765, source_timeframe="1m")

# 2. Register listeners for the indicators you need
def on_ema(val):
    print("EMA:", val)

trex.ema("BTCUSDT", "1h", period=14, listener=on_ema)
trex.rsi("BTCUSDT", "1h", period=14, listener=lambda v: print("RSI:", v))
trex.macd("BTCUSDT", "1h", fast=12, slow=26, signal=9, listener=lambda v: print("MACD:", v))

# 3. Feed candles (or seed from DB — see below)
from trex.base.ohlcv import OHLCV
from datetime import datetime

bar = OHLCV(
    time=datetime.utcnow(),
    open=42000, high=42100, low=41950, close=42050, volume=10.5
)
trex.push(bar, symbol="BTCUSDT")

# 4. Shutdown
trex.stop()`;

const TREX_CORE_API = `# trex.init(port, source_timeframe, db_config=None)
#   port             — WebSocket broadcast port (TrexTerminal connects here)
#   source_timeframe — the raw candle timeframe you feed (e.g. "1m")
#   db_config        — optional DbConfig for PostgreSQL persistence

trex.init(port=8765, source_timeframe="1m")

# trex.push(bar, symbol)  — feed one candle; fires all registered listeners
trex.push(bar, symbol="BTCUSDT")

# trex.seed(bars, symbol) — bulk-load historical candles without firing listeners
#   (use this to warm up indicators before going live)
trex.seed(historical_bars, symbol="BTCUSDT")

# trex.stop()  — graceful shutdown
trex.stop()`;

const TREX_INDICATORS_TREND = `# ── Trend (23) ────────────────────────────────────────────────────
trex.sma("BTCUSDT", "1h", period=20, listener=cb)           # Simple MA
trex.ema("BTCUSDT", "1h", period=14, listener=cb)           # Exponential MA
trex.wma("BTCUSDT", "1h", period=14, listener=cb)           # Weighted MA
trex.dema("BTCUSDT", "1h", period=14, listener=cb)          # Double EMA
trex.tema("BTCUSDT", "1h", period=14, listener=cb)          # Triple EMA
trex.hma("BTCUSDT", "1h", period=14, listener=cb)           # Hull MA
trex.zlma("BTCUSDT", "1h", period=14, listener=cb)          # Zero-Lag MA
trex.trima("BTCUSDT", "1h", period=14, listener=cb)         # Triangular MA
trex.linreg("BTCUSDT", "1h", period=14, listener=cb)        # Linear Regression
trex.vwap("BTCUSDT", "1h", listener=cb)                     # VWAP (resets daily)
trex.vwma("BTCUSDT", "1h", period=14, listener=cb)          # Volume-Weighted MA
trex.alma("BTCUSDT", "1h", period=14, listener=cb)          # Arnaud Legoux MA
trex.kama("BTCUSDT", "1h", period=14, listener=cb)          # Kaufman Adaptive MA
trex.vidya("BTCUSDT", "1h", period=14, listener=cb)         # Variable Index Dynamic MA
trex.mcginley("BTCUSDT", "1h", period=14, listener=cb)      # McGinley Dynamic
trex.frama("BTCUSDT", "1h", period=16, listener=cb)         # Fractal Adaptive MA
trex.t3("BTCUSDT", "1h", period=5, vfactor=0.7, listener=cb) # Tillson T3
trex.jma("BTCUSDT", "1h", period=7, phase=0, listener=cb)   # Jurik MA
trex.supertrend("BTCUSDT", "1h", period=10, mult=3.0, listener=cb)
trex.psar("BTCUSDT", "1h", step=0.02, max_step=0.2, listener=cb)
trex.ichimoku("BTCUSDT", "1h", listener=cb)                 # returns dict with 5 lines
trex.donchian("BTCUSDT", "1h", period=20, listener=cb)      # returns {upper, mid, lower}
trex.aroon("BTCUSDT", "1h", period=25, listener=cb)         # returns {up, down, osc}`;

const TREX_INDICATORS_REST = `# ── Volatility (9) ────────────────────────────────────────────────
trex.bb("BTCUSDT", "1h", period=20, std=2.0, listener=cb)   # Bollinger Bands → {upper,mid,lower}
trex.keltner("BTCUSDT", "1h", period=20, mult=1.5, listener=cb) # Keltner → {upper,mid,lower}
trex.atr("BTCUSDT", "1h", period=14, listener=cb)
trex.natr("BTCUSDT", "1h", period=14, listener=cb)          # Normalized ATR
trex.true_range("BTCUSDT", "1h", listener=cb)
trex.historical_volatility("BTCUSDT", "1h", period=20, listener=cb)
trex.chaikin_volatility("BTCUSDT", "1h", period=10, listener=cb)
trex.ulcer("BTCUSDT", "1h", period=14, listener=cb)
trex.rv("BTCUSDT", "1h", period=20, listener=cb)            # Realized Volatility

# ── Momentum (15) ──────────────────────────────────────────────────
trex.rsi("BTCUSDT", "1h", period=14, listener=cb)
trex.stoch_rsi("BTCUSDT", "1h", rsi_period=14, stoch_period=14, listener=cb)
trex.macd("BTCUSDT", "1h", fast=12, slow=26, signal=9, listener=cb) # → {macd,signal,hist}
trex.mom("BTCUSDT", "1h", period=10, listener=cb)           # Momentum
trex.roc("BTCUSDT", "1h", period=12, listener=cb)           # Rate of Change
trex.trix("BTCUSDT", "1h", period=15, listener=cb)          # Triple Smoothed ROC
trex.dpo("BTCUSDT", "1h", period=20, listener=cb)           # Detrended Price Osc.
trex.cmo("BTCUSDT", "1h", period=14, listener=cb)           # Chande Momentum Osc.
trex.ppo("BTCUSDT", "1h", fast=12, slow=26, listener=cb)    # Percentage Price Osc.
trex.apo("BTCUSDT", "1h", fast=12, slow=26, listener=cb)    # Absolute Price Osc.
trex.elder_ray("BTCUSDT", "1h", period=13, listener=cb)     # → {bull,bear}
trex.mass("BTCUSDT", "1h", fast=9, slow=25, listener=cb)    # Mass Index
trex.klinger("BTCUSDT", "1h", listener=cb)                  # Klinger Oscillator
trex.awesome("BTCUSDT", "1h", listener=cb)                  # Awesome Oscillator
trex.squeeze("BTCUSDT", "1h", listener=cb)                  # Squeeze Momentum

# ── Oscillators (14) ───────────────────────────────────────────────
trex.stoch("BTCUSDT", "1h", k=14, d=3, smooth=3, listener=cb)  # → {k,d}
trex.cci("BTCUSDT", "1h", period=20, listener=cb)
trex.williams_r("BTCUSDT", "1h", period=14, listener=cb)
trex.ultimate("BTCUSDT", "1h", listener=cb)                 # Ultimate Oscillator
trex.dmi("BTCUSDT", "1h", period=14, listener=cb)           # → {plus_di,minus_di,adx}
trex.adx("BTCUSDT", "1h", period=14, listener=cb)
trex.rvi("BTCUSDT", "1h", period=10, listener=cb)           # Relative Vigor Index
trex.pfe("BTCUSDT", "1h", period=8, listener=cb)            # Polarized Fractal Eff.
trex.cog("BTCUSDT", "1h", period=10, listener=cb)           # Center of Gravity
trex.chopiness("BTCUSDT", "1h", period=14, listener=cb)     # Choppiness Index
trex.connors_rsi("BTCUSDT", "1h", listener=cb)
trex.uo("BTCUSDT", "1h", listener=cb)                       # alias for ultimate
trex.si("BTCUSDT", "1h", listener=cb)                       # Swing Index
trex.asi("BTCUSDT", "1h", listener=cb)                      # Accumulated Swing Index

# ── Volume (9) ─────────────────────────────────────────────────────
trex.obv("BTCUSDT", "1h", listener=cb)                      # On-Balance Volume
trex.mfi("BTCUSDT", "1h", period=14, listener=cb)           # Money Flow Index
trex.cmf("BTCUSDT", "1h", period=20, listener=cb)           # Chaikin MF
trex.ad("BTCUSDT", "1h", listener=cb)                       # A/D Line
trex.adosc("BTCUSDT", "1h", fast=3, slow=10, listener=cb)   # Chaikin Oscillator
trex.eom("BTCUSDT", "1h", period=14, listener=cb)           # Ease of Movement
trex.vpt("BTCUSDT", "1h", listener=cb)                      # Volume Price Trend
trex.nvi("BTCUSDT", "1h", listener=cb)                      # Negative Volume Index
trex.pvi("BTCUSDT", "1h", listener=cb)                      # Positive Volume Index

# ── Statistics (5) ─────────────────────────────────────────────────
trex.stddev("BTCUSDT", "1h", period=20, listener=cb)
trex.variance("BTCUSDT", "1h", period=20, listener=cb)
trex.zscore("BTCUSDT", "1h", period=20, listener=cb)
trex.percentile("BTCUSDT", "1h", period=20, pct=0.9, listener=cb)
trex.correl("BTCUSDT", "ETH", "1h", period=20, listener=cb) # cross-symbol correlation

# ── Hybrid (4) ─────────────────────────────────────────────────────
trex.pivot("BTCUSDT", "1h", listener=cb)    # Classic Pivot Points → {p,r1,r2,r3,s1,s2,s3}
trex.fib_pivot("BTCUSDT", "1h", listener=cb)
trex.camarilla("BTCUSDT", "1h", listener=cb)
trex.woodie("BTCUSDT", "1h", listener=cb)

# ── Candlestick patterns (35) ──────────────────────────────────────
trex.doji("BTCUSDT", "1h", listener=cb)
trex.hammer("BTCUSDT", "1h", listener=cb)
trex.shooting_star("BTCUSDT", "1h", listener=cb)
trex.engulfing("BTCUSDT", "1h", listener=cb)
trex.harami("BTCUSDT", "1h", listener=cb)
trex.morning_star("BTCUSDT", "1h", listener=cb)
trex.evening_star("BTCUSDT", "1h", listener=cb)
# ... and 28 more pattern detectors`;

const TREX_MULTISYM = `# Multi-symbol, multi-timeframe — each pair is an independent context
trex.ema("BTCUSDT", "1h",  period=14, listener=on_btc_1h)
trex.ema("BTCUSDT", "4h",  period=14, listener=on_btc_4h)
trex.ema("ETHUSDT", "1h",  period=14, listener=on_eth_1h)

# CTF (Convert TimeFrame): if source_timeframe="1m", requesting "1h"
# or "4h" aggregates automatically — no extra feed needed.
trex.init(port=8765, source_timeframe="1m")
trex.rsi("BTCUSDT", "4h", period=14, listener=on_4h_rsi)
# Push 1m bars → engine auto-aggregates to 4h before computing RSI`;

const TREX_DB = `from trex.db.config import DbConfig

cfg = DbConfig(
    host="localhost", port=5432,
    database="trex_db",
    user="postgres", password="secret",
)

trex.init(port=8765, source_timeframe="1m", db_config=cfg)

# Seed warm-up from DB (fast restart — no recalculation needed):
trex.seed_from_db(symbol="BTCUSDT")

# Or async version:
from trex.db.store import AsyncTrexStore
store = AsyncTrexStore(cfg)
await store.load_state("BTCUSDT", "1h")`;

const TREX_STATE = `# State persistence lets indicators resume without replaying history.
# Enabled automatically when db_config is provided to trex.init().

# Manual snapshot:
trex.save_state(symbol="BTCUSDT")        # serializes all indicator states to DB

# On next startup, instead of seed():
trex.restore_state(symbol="BTCUSDT")     # restores all indicator states from DB
# Indicators are immediately ready — no warm-up period needed.`;

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

    def init_depends(self):
        pass   # no sub-indicators

    def _first_calculate(self, ohlcv, prev):
        self._buf.append(ohlcv)
        if len(self._buf) < self.period:
            return None
        prices  = [self._ve(b) for b in self._buf]
        volumes = [b.volume for b in self._buf]
        total_v = sum(volumes) or 1.0
        self._num = sum(p * v for p, v in zip(prices, volumes)) / total_v
        self._den = 1.0
        self._buf = None
        return self._num

    def _calculate_new_value(self, ohlcv, prev):
        price      = self._ve(ohlcv)
        vol        = ohlcv.volume or 0.0
        self._num  = self._k1 * self._num + self._k * price * vol
        self._den  = self._k1 * self._den + self._k * vol
        return self._num / self._den if self._den else price

# After import, the indicator is a first-class citizen:
import trex
trex.vwema("BTCUSDT", "1h", period=14, listener=on_vwema)

# And inside another indicator's init_depends():
#   api = self._ctx.api
#   key = api.vwema(self.context_symbol, self.tf, period=14, listener=cb)`;

const TREX_PLUGIN_COMPOSITE = `# Composite plugin: uses existing engine indicators as sub-indicators

@plugin.register(name="my_macd")
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
        self._sig_buf: list        = []
        self._sig:     float|None  = None
        self._fast_key = self._slow_key = None

    def init_depends(self):
        api = self._ctx.api               # ← correct way to get the context API
        self._fast_key = api.ema(
            self.context_symbol, self.tf, self.fast, self._ve, self._on_fast)
        self._slow_key = api.ema(
            self.context_symbol, self.tf, self.slow, self._ve, self._on_slow)

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
        self.emit({"macd": macd, "signal": self._sig, "histogram": macd - self._sig})

    def add_input_value(self, raw): pass   # sub-EMAs feed themselves
    def _first_calculate(self, value, prev): return True
    def _calculate_new_value(self, value, prev): pass`;

/* ── BackTest data ───────────────────────────────────────────────── */

const BT_INSTALL = `pip install backtest-engine     # from PyPI
# or from source:
pip install -e BackTest/`;

const BT_QUICKSTART = `from backtest.runner import Backtest
from backtest.strategy import Strategy
from backtest.candles import load_csv

class MyStrategy(Strategy):
    symbol    = "BTCUSDT"
    timeframe = "1h"
    deposit   = 10_000       # USDT starting balance
    leverage  = 5
    fee       = 0.0004       # 0.04% taker fee
    slippage  = 0.0002

    def indicators(self):
        import trex
        trex.ema("BTCUSDT", "1h", period=14,   listener=self._on_fast)
        trex.ema("BTCUSDT", "1h", period=50,   listener=self._on_slow)

    def _on_fast(self, v): self._fast = v
    def _on_slow(self, v): self._slow = v

    def on_kline(self, bar):
        if not hasattr(self, "_fast"): return
        if self._fast > self._slow:
            if not self.has_position():
                self.buy(risk_pct=2.0)
        else:
            if self.has_position():
                self.close()

candles = load_csv("BTCUSDT_1h.csv")
result  = Backtest(MyStrategy).run(candles)
print(result)`;

const BT_STRATEGY_ATTRS = `class MyStrategy(Strategy):
    # ── Required ───────────────────────────────────────────────────
    symbol    : str   = "BTCUSDT"
    timeframe : str   = "1h"

    # ── Optional (with defaults) ───────────────────────────────────
    deposit   : float = 10_000     # starting balance in USDT
    leverage  : int   = 1          # position leverage
    fee       : float = 0.0004     # taker fee (0.04 %)
    slippage  : float = 0.0        # simulated slippage fraction
    broadcast : bool  = False      # stream bars to TrexTerminal
    port      : int   = 8765       # WebSocket port when broadcast=True`;

const BT_COMMANDS = `# ── Inside on_kline(bar) ──────────────────────────────────────────

# Market order — executes at current bar's close
self.buy(risk_pct=2.0)              # LONG, risk 2% of balance
self.sell(risk_pct=2.0)             # SHORT, risk 2% of balance

# Limit order — evaluated from the NEXT bar onward
self.buy(entry=41000, stop=40500, target=42500)
self.sell(entry=43000, stop=43500, target=41000)

# With explicit margin instead of risk %
self.buy(usdt=500)                  # open LONG with $500 margin
self.sell(usdt=500)

# Close the current open position at market
self.close()

# Modify SL / TP of the open position
self.set_sl_tp(stop=41000, target=43500)

# Cancel a pending limit order
ok, msg = self.cancel_order(order_id)

# Query state
self.has_position()                 # True if a position is open
self.position                       # Position object (or None)
self.balance                        # current free balance (USDT)`;

const BT_EVENTS = `class MyStrategy(Strategy):
    def on_kline(self, bar: OHLCV):
        """Called every bar AFTER indicators fire and limit orders execute."""

    def on_position_open(self, pos):
        """Called when a position is opened (market or limit trigger)."""
        print(f"Opened {pos.side} @ {pos.entry}  margin={pos.margin}")

    def on_position_close(self, pos):
        """Called when a position is closed."""
        print(f"Closed  pnl={pos.pnl_usdt:.2f} USDT")

    def on_position_liquidated(self, pos):
        """Called when a position is liquidated (price hit liquidation level)."""

    def on_order_placed(self, order):
        """Called when a limit order is accepted."""

    def on_order_triggered(self, order):
        """Called when a limit order fills."""

    def on_order_cancelled(self, order):
        """Called when a limit order is cancelled."""`;

const BT_POSITION_FIELDS = `# Position fields available inside on_position_close / on_kline
pos.id            # unique position ID
pos.side          # "long" | "short"
pos.entry         # fill price
pos.close_price   # close price (set when closed)
pos.margin        # margin in USDT
pos.leverage      # leverage multiplier
pos.pnl           # fractional PnL (e.g. 0.05 = 5%)
pos.pnl_usdt      # PnL in USDT (after fees)
pos.open_time     # datetime of entry
pos.close_time    # datetime of close
pos.stop          # stop-loss price (or None)
pos.target        # take-profit price (or None)`;

const BT_CANDLES = `from backtest.candles import load_csv, load_dicts, demo_candles

# From CSV (columns: time, open, high, low, close, volume)
candles = load_csv("BTCUSDT_1h.csv")

# From a list of dicts (e.g. from an exchange API response)
candles = load_dicts([
    {"time": 1718100000, "open": 42000, "high": 42100,
     "low": 41950, "close": 42050, "volume": 10.5},
    ...
])

# Built-in random demo candles (for quick testing)
candles = demo_candles(n=1000, symbol="BTCUSDT", timeframe="1h")

# From pandas DataFrame
import pandas as pd
df = pd.read_csv("data.csv", parse_dates=["time"])
candles = load_dicts(df.to_dict("records"))`;

const BT_RESULT = `result = Backtest(MyStrategy).run(candles)

print(result)
# BacktestResult(
#   total_trades    = 47
#   win_rate        = 0.574       # 57.4%
#   profit_factor   = 1.83
#   net_pnl_usdt    = 3_241.50
#   net_pnl_pct     = 32.4        # % of starting deposit
#   max_drawdown    = 0.124       # 12.4% peak-to-trough
#   sharpe          = 1.21
#   sortino         = 1.87
#   avg_win_usdt    = 189.3
#   avg_loss_usdt   = -93.7
#   largest_win     = 821.0
#   largest_loss    = -412.3
# )

# Access individual fields:
print(result.win_rate, result.profit_factor)
print(result.trade_log)    # list of all closed positions`;

const BT_BROADCAST = `class MyStrategy(Strategy):
    symbol    = "BTCUSDT"
    timeframe = "1h"
    broadcast = True        # ← enable live chart streaming
    port      = 8765

    def indicators(self):
        import trex
        # Indicator definitions are automatically broadcast to TrexTerminal
        trex.ema("BTCUSDT", "1h", period=14, listener=self._on_ema)

    def on_kline(self, bar):
        ...

# Run with broadcast=True — then open TrexTerminal and connect to ws://localhost:8765
# You'll see the backtest replay in real-time on the chart.
result = Backtest(MyStrategy).run(candles, progress=True)`;

/* ─────────────────────────────────────────────────────────────────── */

const drawingTools = (fa: boolean): [string, string][] => [
  ["trendline",        fa ? "خط روند بین دو نقطه." : "A line between two points."],
  ["ray",              fa ? "نیم‌خط؛ از نقطه‌ی دوم ادامه می‌یابد." : "A ray; extends past the second point."],
  ["extended",         fa ? "خط که در هر دو جهت بی‌نهایت ادامه دارد." : "A line extended infinitely both ways."],
  ["horizontal",       fa ? "خط افقی روی یک قیمت (۱ نقطه)." : "A horizontal line at a price (1 point)."],
  ["vertical",         fa ? "خط عمودی روی یک زمان (۱ نقطه)." : "A vertical line at a time (1 point)."],
  ["polyline",         fa ? "چندخطی؛ با دابل‌کلیک یا Enter تمام می‌شود." : "A multi-segment line; finish with double-click or Enter."],
  ["arrow",            fa ? "پیکان جهت‌دار بین دو نقطه." : "A directional arrow between two points."],
  ["rectangle",        fa ? "مستطیل (۲ نقطه‌ی قطری)." : "A rectangle (2 diagonal points)."],
  ["ellipse",          fa ? "بیضی محاط در کادر دو نقطه." : "An ellipse inscribed in the 2-point box."],
  ["parallelChannel",  fa ? "کانال موازی (۳ نقطه: خط + عرض)." : "A parallel channel (3 points: line + width)."],
  ["fibRetracement",   fa ? "فیبوناچی بازگشتی با سطوح قابل‌ویرایش (۲ نقطه)." : "Fibonacci retracement with editable levels (2 points)."],
  ["fibExtension",     fa ? "فیبوناچی گسترشی (۳ نقطه)." : "Fibonacci extension (3 points)."],
  ["text",             fa ? "برچسب متنی (۱ نقطه)." : "A text label (1 point)."],
  ["measure",          fa ? "ابزار اندازه‌گیری موقت — هیچ‌وقت ذخیره نمی‌شود." : "An ephemeral measuring tool — never persisted."],
  ["longPosition",     fa ? "ابزار موقعیت خرید (entry/SL/TP، نسبت R/R)." : "Long-position tool (entry/SL/TP, R/R ratio)."],
  ["shortPosition",    fa ? "ابزار موقعیت فروش (entry/SL/TP، نسبت R/R)." : "Short-position tool (entry/SL/TP, R/R ratio)."],
];

const shortcuts = (fa: boolean): [string, string][] => [
  ["Delete / Backspace",          fa ? "حذف ترسیم انتخاب‌شده" : "Delete the selected drawing"],
  ["Ctrl + Z",                    fa ? "واگرد (Undo)" : "Undo"],
  ["Ctrl + Y / Ctrl + Shift + Z", fa ? "ازنو (Redo)" : "Redo"],
  ["Escape",                      fa ? "لغو ترسیم → لغو انتخاب → نشانگر" : "Cancel placement -> deselect -> cursor"],
  ["Enter",                       fa ? "پایان‌دادن به Polyline" : "Finish a polyline"],
  ["M",                           fa ? "مگنت (چسبیدن به OHLC کندل‌ها)" : "Magnet mode (snap to candle OHLC)"],
  ["Alt + T / H / V / F / R",     fa ? "خط روند / افقی / عمودی / فیبوناچی / مستطیل" : "Trend line / Horizontal / Vertical / Fib / Rectangle"],
  ["Shift + Drag",                fa ? "زوم مستطیلی روی ناحیه" : "Rectangle zoom on a region"],
  [fa ? "دابل‌کلیک نمودار" : "Double-click chart", fa ? "تمام‌صفحه" : "Toggle fullscreen"],
  [fa ? "اسکرول / درگ" : "Scroll / Drag", fa ? "زوم / جابه‌جایی (لیزی‌لود تاریخچه در لبه‌ی چپ)" : "Zoom / pan (history lazy-loads at the left edge)"],
];

interface TocGroup { group: string; items: { id: string; label: string }[] }

const TOC_GROUPS = (fa: boolean): TocGroup[] => [
  {
    group: fa ? "شروع" : "Getting started",
    items: [
      { id: "intro",        label: fa ? "معرفی" : "Introduction" },
      { id: "architecture", label: fa ? "معماری" : "Architecture" },
      { id: "quickstart",   label: fa ? "شروع سریع" : "Quick start" },
      { id: "connection",   label: fa ? "اتصال و پایداری" : "Connection & resilience" },
    ],
  },
  {
    group: fa ? "پروتکل" : "Protocol",
    items: [
      { id: "c2s",       label: fa ? "کلاینت ← سرور" : "Client → server" },
      { id: "s2c",       label: fa ? "سرور ← کلاینت" : "Server → client" },
      { id: "ohlc",      label: fa ? "OHLC و PointData" : "OHLC & PointData" },
      { id: "defschema", label: "SeriesDefinition" },
      { id: "drawschema",label: fa ? "اشیای ترسیمی" : "Drawing objects" },
      { id: "tools",     label: fa ? "ابزارهای ترسیم" : "Drawing tools" },
    ],
  },
  {
    group: fa ? "قابلیت‌ها" : "Features",
    items: [
      { id: "builder",   label: fa ? "طراح اندیکاتور" : "Indicator Builder" },
      { id: "workspace", label: fa ? "میزکار و ماندگاری" : "Workspace & persistence" },
      { id: "keys",      label: fa ? "میان‌برها" : "Shortcuts" },
    ],
  },
  {
    group: fa ? "موتور اندیکاتور (Trex Engine)" : "Trex Engine",
    items: [
      { id: "eng-intro",      label: fa ? "معرفی موتور" : "Overview" },
      { id: "eng-install",    label: fa ? "نصب" : "Installation" },
      { id: "eng-quickstart", label: fa ? "شروع سریع" : "Quick start" },
      { id: "eng-api",        label: fa ? "API اصلی" : "Core API" },
      { id: "eng-trend",      label: fa ? "اندیکاتورهای روند" : "Trend indicators" },
      { id: "eng-rest",       label: fa ? "سایر اندیکاتورها" : "Other indicators" },
      { id: "eng-multisym",   label: fa ? "چند نماد / تایم‌فریم" : "Multi-symbol & CTF" },
      { id: "eng-db",         label: fa ? "PostgreSQL / DbConfig" : "PostgreSQL / DbConfig" },
      { id: "eng-state",      label: fa ? "ماندگاری وضعیت" : "State persistence" },
      { id: "eng-plugin",     label: fa ? "اندیکاتور اختصاصی (Plugin)" : "Custom indicators (Plugin)" },
      { id: "eng-plugin-composite", label: fa ? "Plugin ترکیبی" : "Composite plugin" },
    ],
  },
  {
    group: fa ? "بک‌تست (BackTest)" : "BackTest",
    items: [
      { id: "bt-intro",      label: fa ? "معرفی BackTest" : "Overview" },
      { id: "bt-install",    label: fa ? "نصب" : "Installation" },
      { id: "bt-quickstart", label: fa ? "شروع سریع" : "Quick start" },
      { id: "bt-strategy",   label: fa ? "کلاس Strategy" : "Strategy class" },
      { id: "bt-commands",   label: fa ? "دستورات معامله" : "Trading commands" },
      { id: "bt-events",     label: fa ? "رویدادها (Hooks)" : "Event hooks" },
      { id: "bt-position",   label: fa ? "فیلدهای Position" : "Position fields" },
      { id: "bt-candles",    label: fa ? "بارگذاری کندل" : "Loading candles" },
      { id: "bt-result",     label: fa ? "نتایج BacktestResult" : "BacktestResult" },
      { id: "bt-broadcast",  label: fa ? "پخش زنده روی چارت" : "Live chart replay" },
    ],
  },
  {
    group: fa ? "سرور خام (Raw WebSocket)" : "Raw WebSocket server",
    items: [
      { id: "python", label: fa ? "بدون SDK (خام)" : "Without SDK (raw)" },
    ],
  },
];

const ALL_IDS = (fa: boolean): string[] => TOC_GROUPS(fa).flatMap((g) => g.items.map((i) => i.id));

/* ═══════════════════════════ component ════════════════════════════ */

const NAVBAR_H = 52;
const SIDEBAR_W = 260;
const RIGHT_TOC_W = 200;

export default function DocsPage({ lang = "fa", onBack }: { lang?: Lang; onBack: () => void }) {
  const [l, setL] = useState<Lang>(lang);
  const fa = l === "fa";
  const [active, setActive] = useState<string>("intro");
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Scroll-spy: watch the main content scroller
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const ids = ALL_IDS(fa);
    const onScroll = () => {
      const offset = NAVBAR_H + 16;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) {
          // el.offsetTop is relative to its offsetParent inside the scroller
          const elTop = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
          if (elTop <= offset) current = id;
        }
      }
      setActive(current);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [fa]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el || !scrollerRef.current) return;
    const scroller = scrollerRef.current;
    const elTop = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: elTop - NAVBAR_H - 8, behavior: "smooth" });
  };

  // Sidebar nav item style
  const navItemStyle = (id: string) =>
    active === id
      ? {
          borderInlineStartWidth: 3,
          borderInlineStartStyle: "solid" as const,
          borderInlineStartColor: "#f5a623",
          background: "rgba(245,166,35,0.08)",
          color: "#ffffff",
          paddingInlineStart: 13,
        }
      : {
          borderInlineStartWidth: 3,
          borderInlineStartStyle: "solid" as const,
          borderInlineStartColor: "transparent",
          color: "#8a8f9c",
          paddingInlineStart: 13,
        };

  return (
    <div
      style={{ background: "#0f1117", color: "#e2e4eb", fontFamily: "inherit", height: "100vh", overflow: "hidden" }}
      dir={fa ? "rtl" : "ltr"}
    >
      {/* ════ Fixed top navbar ════ */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: NAVBAR_H,
          background: "#1a1d23",
          borderBottom: "1px solid #2d3139",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px",
          zIndex: 50,
        }}
      >
        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#9da3b0",
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 6,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#e2e4eb"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#9da3b0"; (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
        >
          <IconArrowLeft />
          {fa ? "بازگشت" : "Back"}
        </button>

        <div style={{ width: 1, height: 20, background: "#2d3139", flexShrink: 0 }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "linear-gradient(135deg, #FFB733, #FF7847)",
              fontWeight: 900,
              fontSize: 14,
              color: "#1a1206",
            }}
          >
            T
          </span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#ffffff" }}>Trex</span>
          <span
            style={{
              background: "rgba(245,166,35,0.15)",
              color: "#f5a623",
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 20,
              border: "1px solid rgba(245,166,35,0.3)",
            }}
          >
            Docs
          </span>
        </div>

        {/* Center search */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#0f1117",
              border: "1px solid #2d3139",
              borderRadius: 8,
              padding: "0 12px",
              height: 34,
              width: "min(320px, 40vw)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5c6070" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span style={{ fontSize: 12.5, color: "#5c6070" }}>
              {fa ? "جستجو…" : "Search..."}
            </span>
            <div style={{ flex: 1 }} />
            <kbd
              style={{
                fontSize: 10,
                color: "#5c6070",
                background: "#1a1d23",
                border: "1px solid #2d3139",
                borderRadius: 4,
                padding: "1px 5px",
              }}
            >
              /
            </kbd>
          </div>
        </div>

        {/* Language toggle */}
        <div
          style={{
            display: "flex",
            border: "1px solid #2d3139",
            borderRadius: 8,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {(["fa", "en"] as Lang[]).map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setL(x)}
              style={{
                padding: "5px 14px",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
                background: l === x ? "linear-gradient(135deg, #FFB733, #FF7847)" : "transparent",
                color: l === x ? "#1a1206" : "#9da3b0",
              }}
            >
              {x === "fa" ? "فارسی" : "English"}
            </button>
          ))}
        </div>
      </header>

      {/* ════ Fixed left sidebar ════ */}
      <aside
        className="trex-scroll"
        style={{
          position: "fixed",
          top: NAVBAR_H,
          [fa ? "right" : "left"]: 0,
          width: SIDEBAR_W,
          height: `calc(100vh - ${NAVBAR_H}px)`,
          background: "#1a1d23",
          borderInlineEnd: "1px solid #2d3139",
          overflowY: "auto",
          zIndex: 40,
          paddingBottom: 32,
        }}
      >
        <nav style={{ paddingTop: 16 }}>
          {TOC_GROUPS(fa).map((grp) => (
            <div key={grp.group} style={{ marginBottom: 20 }}>
              {/* Group label */}
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#5c6070",
                  padding: "0 16px",
                  marginBottom: 4,
                }}
              >
                {grp.group}
              </div>
              {/* Items */}
              {grp.items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => go(t.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: fa ? "right" : "left",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    height: 32,
                    lineHeight: "32px",
                    paddingInlineEnd: 16,
                    transition: "color 0.12s, background 0.12s",
                    ...navItemStyle(t.id),
                  }}
                  onMouseEnter={(e) => {
                    if (active !== t.id) {
                      (e.currentTarget as HTMLButtonElement).style.color = "#e2e4eb";
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (active !== t.id) {
                      (e.currentTarget as HTMLButtonElement).style.color = "#8a8f9c";
                      (e.currentTarget as HTMLButtonElement).style.background = "none";
                    }
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* ════ Main content area ════ */}
      <main
        ref={scrollerRef}
        className="trex-scroll"
        style={{
          position: "fixed",
          top: NAVBAR_H,
          [fa ? "right" : "left"]: SIDEBAR_W,
          [fa ? "left" : "right"]: 0,
          height: `calc(100vh - ${NAVBAR_H}px)`,
          overflowY: "auto",
          background: "#0f1117",
        }}
      >
        {/* Inner content — max width centered */}
        <div
          style={{
            maxWidth: 860,
            margin: "0 auto",
            padding: "48px 40px",
          }}
        >
          {/* Page title / hero (compact, GitBook-style) */}
          <div style={{ marginBottom: 40 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(245,166,35,0.1)",
                border: "1px solid rgba(245,166,35,0.25)",
                borderRadius: 20,
                padding: "3px 12px",
                fontSize: 11,
                fontWeight: 600,
                color: "#f5a623",
                marginBottom: 16,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f5a623", display: "inline-block" }} />
              {fa ? "نسخه ۲.۰ · سه پکیج یکپارچه" : "v2.0 · Three integrated packages"}
            </div>
            <h1
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: "#ffffff",
                lineHeight: 1.1,
                marginBottom: 12,
                letterSpacing: "-0.02em",
              }}
              dir="auto"
            >
              {fa ? "مستندات Trex" : "Trex Docs"}
            </h1>
            <p style={{ fontSize: 14.5, color: "#9da3b0", lineHeight: 1.7, maxWidth: 560 }}>
              {fa
                ? "مستندات کامل سه پکیج Trex: ترمینال نموداری ریل‌تایم، موتور اندیکاتور با ۱۱۰+ اندیکاتور، و فریم‌ورک بک‌تست حرفه‌ای."
                : "Complete reference for all three Trex packages: the realtime charting terminal, a 110+ indicator engine, and a professional backtesting framework."}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
              <button
                type="button"
                onClick={() => go("quickstart")}
                style={{
                  borderRadius: 8,
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  background: "linear-gradient(135deg, #FFB733, #FF7847)",
                  color: "#1a1206",
                }}
              >
                {fa ? "شروع سریع ترمینال" : "Terminal quick start"}
              </button>
              <button
                type="button"
                onClick={() => go("eng-quickstart")}
                style={{
                  borderRadius: 8,
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  border: "1px solid #2d3139",
                  cursor: "pointer",
                  background: "#1a1d23",
                  color: "#e2e4eb",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#f5a623"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2d3139"; }}
              >
                {fa ? "موتور اندیکاتور" : "Indicator Engine"}
              </button>
              <button
                type="button"
                onClick={() => go("bt-quickstart")}
                style={{
                  borderRadius: 8,
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  border: "1px solid #2d3139",
                  cursor: "pointer",
                  background: "#1a1d23",
                  color: "#e2e4eb",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#f5a623"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2d3139"; }}
              >
                {fa ? "بک‌تست" : "BackTest"}
              </button>
            </div>
          </div>

          <hr style={{ borderColor: "#2d3139", margin: "0 0 0 0" }} />

          {/* ══════════ TrexTerminal sections ══════════ */}

          <Section id="intro" title={fa ? "معرفی" : "Introduction"}>
            <p>
              {fa
                ? "Trex Terminal یک ترمینال نموداری ریل‌تایم در سبک TradingView است که در یک فایل HTML مستقل بسته‌بندی می‌شود. دیتا یا از شبیه‌ساز داخلی (حالت Demo) می‌آید یا از سرور WebSocket شما — هر دو دقیقاً از یک پروتکل استفاده می‌کنند."
                : "Trex Terminal is a realtime, TradingView-style charting terminal packaged as a single self-contained HTML file. Data comes either from the built-in simulator (Demo mode) or from your own WebSocket server — both speak exactly the same protocol."}
            </p>
            <p className="mt-2">
              {fa ? "هر پیام یک JSON با فیلد " : "Every message is JSON carrying a "}
              <K>type</K>
              {fa ? " است؛ بقیه‌ی فیلدها به نوع پیام بستگی دارند." : " field; the remaining fields depend on the message type."}
            </p>
          </Section>

          <Section id="architecture" title={fa ? "معماری (مهم)" : "Architecture (important)"}>
            <p>
              {fa
                ? "Trex یک کلاینت «فقط‌نمایشی» است. هیچ محاسبه‌ای انجام نمی‌دهد و جز درخواست داده هیچ‌چیز به سرور نمی‌فرستد."
                : "Trex is a display-only client. It performs no computation and sends nothing to the server except data requests."}
            </p>
            <Note kind="warn">
              {fa
                ? "کلاینت هیچ‌وقت ترسیم‌های کاربر را به سرور نمی‌فرستد. دو مسیر مجزا: (۱) ترسیم‌های دستی کاربر (محلی و قابل‌ویرایش) و (۲) اشیای سروری که از طریق پیام‌های drawing می‌آیند و فقط‌خواندنی رندر می‌شوند."
                : "The client never sends user drawings to the server. Two separate paths: (1) user's manual drawings — local-only, editable, and (2) server objects — arrive via drawing messages, render read-only exactly like indicators."}
            </Note>
          </Section>

          <Section id="quickstart" title={fa ? "شروع سریع" : "Quick start"}>
            <p>
              {fa
                ? "فایل trex-terminal.html را در مرورگر باز کنید. در صفحه‌ی لودر، «Demo» شبیه‌ساز داخلی را اجرا می‌کند و «Connect» به آدرس WebSocket واردشده وصل می‌شود (پیش‌فرض: "
                : 'Open trex-terminal.html in a browser. On the loader screen, "Demo" runs the built-in simulator while "Connect" attaches to the WebSocket URL you enter (default: '}
              <K>ws://localhost:8765</K>
              {fa ? ")." : ")."}
            </p>
            <p className="mt-2">
              {fa
                ? "ترتیب معمول یک سشن: کلاینت hello می‌فرستد → سرور snapshot می‌دهد → سرور با bar استریم می‌کند → کلاینت هنگام اسکرول به چپ history می‌خواهد."
                : "A typical session: client sends hello → server replies with snapshot → server streams bar updates → client requests history when panning left."}
            </p>
          </Section>

          <Section id="connection" title={fa ? "اتصال و پایداری" : "Connection & resilience"}>
            <ul className="list-disc space-y-1 ps-5">
              <li>{fa ? "اتصال مجدد خودکار با backoff نمایی." : "Automatic reconnect with exponential backoff."}</li>
              <li>{fa ? "keepalive با ping/pong هر ۱۵ ثانیه؛ تأخیر RTT در نوار وضعیت." : "ping/pong keepalive every 15s; RTT shown in status bar."}</li>
              <li>{fa ? "پیام‌ها هنگام قطعی در صف می‌مانند." : "Messages queued while disconnected, flushed on reconnect."}</li>
              <li>{fa ? "فریم‌های نامعتبر/ناشناخته بی‌صدا دور انداخته می‌شوند." : "Malformed / unknown frames dropped silently."}</li>
            </ul>
            <Note kind="tip">
              {fa
                ? "همه‌ی دیتای ورودی پاک‌سازی می‌شود: کندل‌ها مرتب و یکتاسازی می‌شوند؛ اشیای ترسیمی با ابزار ناشناخته دور انداخته می‌شوند."
                : "All inbound data is sanitized: candles are sorted and de-duped; drawing objects with an unknown tool are dropped."}
            </Note>
          </Section>

          <Section id="c2s" title={fa ? "پیام‌ها: کلاینت ← سرور" : "Messages: client → server"}>
            <p>{fa ? "کلاینت فقط «درخواست» می‌فرستد — هیچ‌وقت داده‌ی کاربر را push نمی‌کند." : "The client only sends requests — it never pushes user data."}</p>
            <MsgTable fa={fa} headers={["type", "payload", fa ? "توضیح" : "Description"]} rows={clientRows(fa)} />
          </Section>

          <Section id="s2c" title={fa ? "پیام‌ها: سرور ← کلاینت" : "Messages: server → client"}>
            <MsgTable fa={fa} headers={["type", "payload", fa ? "توضیح" : "Description"]} rows={serverRows(fa)} />
            <Note kind="tip">
              {fa
                ? "برای آپدیت ریل‌تایم اندیکاتور، در indicators برای هر کلید فقط یک نقطه بفرستید تا مسیر سریع O(1) فعال شود."
                : "For realtime indicator updates, send a single point per key in indicators to hit the O(1) fast path; longer arrays replace the whole series."}
            </Note>
          </Section>

          <Section id="ohlc" title={fa ? "OHLC و PointData" : "OHLC & PointData"}>
            <p>
              {fa
                ? "واحد زمان همه‌جا «ثانیه‌ی یونیکس» است (نه میلی‌ثانیه). کندل‌ها باید دامنه‌ی زمانی اکیداً صعودی و یکتا داشته باشند."
                : "Time is unix SECONDS everywhere (not milliseconds). Candles must form a strictly-increasing, unique time domain."}
            </p>
            <Code lang="json">{OHLC_SCHEMA}</Code>
          </Section>

          <Section id="defschema" title={fa ? "اسکیمای SeriesDefinition" : "SeriesDefinition schema"}>
            <p>
              {fa
                ? "هر سری اندیکاتور با این آبجکت تعریف می‌شود. سری‌های pane: \"sub\" به‌صورت خودکار پنل جداگانه با اسکیل مستقل می‌گیرند."
                : "Every indicator series is described by this object. Series with pane: \"sub\" automatically get their own pane with an independent scale."}
            </p>
            <Code lang="json">{DEF_SCHEMA}</Code>
          </Section>

          <Section id="drawschema" title={fa ? "اشیای ترسیمی (سروری)" : "Drawing objects (server-side)"}>
            <p>
              {fa
                ? "اشیا با مختصات داده (time, price) ذخیره می‌شوند، پس با زوم/پن لنگر می‌مانند. اشیایی که از سرور می‌آیند با locked: true و فقط‌خواندنی رندر می‌شوند."
                : "Objects are stored in data coordinates (time, price), anchored through zoom/pan. Objects pushed from the server render read-only with locked: true."}
            </p>
            <Code lang="json">{DRAWING_SCHEMA}</Code>
          </Section>

          <Section id="tools" title={fa ? "ابزارهای ترسیم" : "Drawing tools"}>
            <p>{fa ? "۱۶ ابزار ترسیم پشتیبانی می‌شود:" : "Sixteen drawing tools are supported:"}</p>
            <KVTable rows={drawingTools(fa)} fa={fa} />
          </Section>

          <Section id="builder" title={fa ? "طراح اندیکاتور (Indicator Builder)" : "Indicator Builder"}>
            <p>
              {fa
                ? "طراح اندیکاتور یک محیط drag & drop است که ظاهر اندیکاتور را طراحی می‌کنید (نه محاسبه‌اش). خروجی یک قالب JSON است که به سرور می‌گوید چه داده‌ای بفرستد:"
                : "A drag-and-drop environment where you design an indicator's appearance (not its math). It exports a JSON template that tells the server what data to send:"}
            </p>
            <Code lang="json">{TEMPLATE_SCHEMA}</Code>
            <Note>
              {fa
                ? "بخش definitions ظاهر را تعریف می‌کند و dataRequest به سرور می‌گوید برای هر کلید چه چیزی محاسبه و بفرستد. کلاینت هیچ محاسبه‌ای نمی‌کند."
                : "definitions defines appearance; dataRequest tells the server what to compute and stream per key. The client computes nothing."}
            </Note>
          </Section>

          <Section id="workspace" title={fa ? "میزکار و ماندگاری" : "Workspace & persistence"}>
            <ul className="list-disc space-y-1 ps-5">
              <li>{fa ? "چیدمان چند-نموداری: تک، دوتایی کنار هم، یا شبکه‌ی ۲×۲." : "Multi-chart layouts: single, side-by-side, or a 2×2 grid."}</li>
              <li>{fa ? "نوار شناور علاقه‌مندی‌ها: ابزارهای ستاره‌دار." : "Floating favorites bar: starred tools appear in a draggable bar."}</li>
              <li>{fa ? "ماندگاری در localStorage: نماد، تایم‌فریم، نوع نمایش، تنظیمات ظاهری، چیدمان." : "localStorage persistence: symbol, timeframe, display type, appearance settings, layout."}</li>
            </ul>
            <Note kind="warn">
              {fa
                ? "فقط ترجیحات UI ذخیره می‌شوند — هیچ داده‌ی بازاری کش نمی‌شود."
                : "Only UI preferences are stored — no market data is cached."}
            </Note>
          </Section>

          <Section id="keys" title={fa ? "میان‌برهای صفحه‌کلید" : "Keyboard shortcuts"}>
            <KVTable rows={shortcuts(fa)} fa={fa} />
          </Section>

          {/* ══════════ Trex Engine sections ══════════ */}

          <Section id="eng-intro" title={fa ? "موتور اندیکاتور Trex Engine" : "Trex Engine — Indicator Engine"}>
            <p>
              {fa
                ? "Trex Engine یک موتور اندیکاتور ریل‌تایم برای پایتون است با بیش از ۱۱۰ اندیکاتور آماده. هر اندیکاتور در یک context (نماد × تایم‌فریم) زندگی می‌کند. موتور بارگذاری تدریجی تاریخچه، CTF (تبدیل تایم‌فریم) خودکار، ذخیره/بازیابی وضعیت، و پخش زنده به TrexTerminal را پشتیبانی می‌کند."
                : "Trex Engine is a realtime Python indicator engine with 110+ ready-made indicators. Each indicator lives in a context (symbol × timeframe). The engine supports lazy history loading, automatic CTF (ConvertTimeFrame) aggregation, state save/restore, and live broadcast to TrexTerminal."}
            </p>
            <ul className="mt-2 list-disc space-y-1 ps-5">
              <li>{fa ? "Trend: ۲۳ اندیکاتور (SMA, EMA, HMA, VWAP, Ichimoku, SuperTrend, …)" : "Trend: 23 indicators (SMA, EMA, HMA, VWAP, Ichimoku, SuperTrend, …)"}</li>
              <li>{fa ? "Volatility: ۹ (BB, Keltner, ATR, HV, Ulcer, …)" : "Volatility: 9 (BB, Keltner, ATR, HV, Ulcer, …)"}</li>
              <li>{fa ? "Momentum: ۱۵ (RSI, MACD, Stoch RSI, Squeeze, …)" : "Momentum: 15 (RSI, MACD, Stoch RSI, Squeeze, …)"}</li>
              <li>{fa ? "Oscillators: ۱۴ (Stoch, CCI, Williams %R, ADX, DMI, …)" : "Oscillators: 14 (Stoch, CCI, Williams %R, ADX, DMI, …)"}</li>
              <li>{fa ? "Volume: ۹ (OBV, MFI, CMF, A/D, …)" : "Volume: 9 (OBV, MFI, CMF, A/D, …)"}</li>
              <li>{fa ? "Statistics: ۵ (StdDev, Z-Score, Percentile, Correlation, …)" : "Statistics: 5 (StdDev, Z-Score, Percentile, Correlation, …)"}</li>
              <li>{fa ? "Hybrid: ۴ (Pivot, Fib Pivot, Camarilla, Woodie)" : "Hybrid: 4 (Pivot, Fib Pivot, Camarilla, Woodie)"}</li>
              <li>{fa ? "Candlestick Patterns: ۳۵ الگو" : "Candlestick Patterns: 35 patterns"}</li>
            </ul>
          </Section>

          <Section id="eng-install" title={fa ? "نصب Trex Engine" : "Installing Trex Engine"}>
            <Code lang="bash">{TREX_INSTALL}</Code>
          </Section>

          <Section id="eng-quickstart" title={fa ? "شروع سریع — Trex Engine" : "Trex Engine quick start"}>
            <Code lang="python">{TREX_QUICKSTART}</Code>
            <Note kind="tip">
              {fa
                ? "اگر source_timeframe=\"1m\" باشد و شما rsi برای \"4h\" رجیستر کنید، موتور به‌صورت خودکار کندل‌های ۱ دقیقه را به ۴ ساعته تبدیل می‌کند — بدون کد اضافه."
                : "If source_timeframe=\"1m\" and you register rsi for \"4h\", the engine auto-aggregates 1m candles to 4h — no extra code needed."}
            </Note>
          </Section>

          <Section id="eng-api" title={fa ? "API اصلی" : "Core API"}>
            <Code lang="python">{TREX_CORE_API}</Code>
            <p className="mt-2">
              {fa
                ? "هر فراخوانی اندیکاتور یک " : "Each indicator call returns a "}
              <K>ListenerKey</K>
              {fa ? " برمی‌گرداند که می‌توانید با آن listener را بعداً حذف کنید." : " you can use later to de-register the listener."}
            </p>
          </Section>

          <Section id="eng-trend" title={fa ? "اندیکاتورهای روند (۲۳ اندیکاتور)" : "Trend indicators (23)"}>
            <Code lang="python">{TREX_INDICATORS_TREND}</Code>
          </Section>

          <Section id="eng-rest" title={fa ? "سایر اندیکاتورها (Volatility / Momentum / Oscillators / Volume / Statistics / Hybrid / Candlestick)" : "Other indicators (Volatility / Momentum / Oscillators / Volume / Statistics / Hybrid / Candlestick)"}>
            <Code lang="python">{TREX_INDICATORS_REST}</Code>
          </Section>

          <Section id="eng-multisym" title={fa ? "چند نماد و CTF خودکار" : "Multi-symbol & automatic CTF"}>
            <p>
              {fa
                ? "هر ترکیب (نماد × تایم‌فریم) یک context مستقل است. CTF (ConvertTimeFrame) وقتی تایم‌فریم اندیکاتور از source_timeframe بزرگ‌تر است به‌صورت خودکار فعال می‌شود."
                : "Every (symbol × timeframe) pair is an independent context. CTF (ConvertTimeFrame) activates automatically when the requested timeframe is larger than source_timeframe."}
            </p>
            <Code lang="python">{TREX_MULTISYM}</Code>
          </Section>

          <Section id="eng-db" title={fa ? "PostgreSQL و DbConfig" : "PostgreSQL & DbConfig"}>
            <p>
              {fa
                ? "برای ذخیره‌ی وضعیت اندیکاتورها در پایگاه داده و شروع سریع بدون نیاز به بازسازی تاریخچه، از DbConfig استفاده کنید:"
                : "Use DbConfig to persist indicator states to PostgreSQL for fast restarts without replaying history:"}
            </p>
            <Code lang="python">{TREX_DB}</Code>
          </Section>

          <Section id="eng-state" title={fa ? "ماندگاری وضعیت" : "State persistence"}>
            <p>
              {fa
                ? "با فعال‌بودن db_config، ماندگاری وضعیت به‌صورت خودکار فعال می‌شود. همچنین می‌توانید دستی snapshot بگیرید:"
                : "With db_config active, state persistence is enabled automatically. You can also snapshot manually:"}
            </p>
            <Code lang="python">{TREX_STATE}</Code>
          </Section>

          <Section id="eng-plugin" title={fa ? "اندیکاتور اختصاصی — سیستم Plugin" : "Custom indicators — Plugin system"}>
            <p>
              {fa
                ? "با سیستم plugin می‌توانید اندیکاتور اختصاصی بسازید و بدون تغییر در سورس کتابخانه آن را به‌صورت یک citizen درجه‌ی اول در اختیار بگیرید — در هر دو namespace سطح بالا ("
                : "The plugin system lets you register a custom indicator as a first-class citizen without touching the library source — available in both the top-level "}
              <K>trex</K>
              {fa ? ") و ContextApi (" : " namespace and "}
              <K>api</K>
              {fa ? ")." : " inside init_depends)."}
            </p>
            <Code lang="python">{TREX_PLUGIN}</Code>
            <Note kind="tip">
              {fa
                ? "کلید context ساخته‌شده به‌صورت trex.plugin.{IndName}|sym=...|tf=...|params خواهد بود — مستقل از مسیر ماژول کاربر و کاملاً سازگار با کلیدهای اندیکاتورهای داخلی."
                : "The context key is trex.plugin.{IndName}|sym=...|tf=...|params — stable regardless of the user's module path and fully compatible with built-in indicator keys."}
            </Note>
          </Section>

          <Section id="eng-plugin-composite" title={fa ? "Plugin ترکیبی (با sub-indicator)" : "Composite plugin (with sub-indicators)"}>
            <p>
              {fa
                ? "اگر اندیکاتور شما نیاز به اندیکاتورهای دیگر دارد، آن‌ها را داخل init_depends از طریق "
                : "If your indicator depends on other indicators, register them inside init_depends via "}
              <K>self._ctx.api</K>
              {fa ? " رجیستر کنید. هرگز مستقیم add_input_value را به sub-indicator فوروارد نکنید (double-feed bug)." : ". Never forward add_input_value directly to sub-indicators (double-feed bug)."}
            </p>
            <Code lang="python">{TREX_PLUGIN_COMPOSITE}</Code>
          </Section>

          {/* ══════════ BackTest sections ══════════ */}

          <Section id="bt-intro" title={fa ? "فریم‌ورک بک‌تست (BackTest)" : "BackTest Framework"}>
            <p>
              {fa
                ? "BackTest یک فریم‌ورک بک‌تست حرفه‌ای است که با Trex Engine یکپارچه می‌شود. شما یک کلاس Strategy می‌نویسید، اندیکاتورها را در indicators() رجیستر می‌کنید، و منطق معامله را در on_kline() می‌نویسید. موتور به‌صورت خودکار Exchange (صرافی شبیه‌سازی‌شده) را مدیریت می‌کند."
                : "BackTest is a professional backtesting framework integrated with Trex Engine. You write a Strategy class, register indicators in indicators(), and implement trading logic in on_kline(). The engine automatically manages a simulated Exchange."}
            </p>
            <p className="mt-2">
              {fa ? "ترتیب اجرا برای هر کندل:" : "Execution order per bar:"}
            </p>
            <ol className="mt-1 list-decimal space-y-1 ps-5">
              <li><K>trex.push(bar)</K> {fa ? "← اندیکاتورها محاسبه می‌شوند، listenerها اجرا می‌شوند" : "← indicators recomputed, listeners fired"}</li>
              <li><K>exchange.kline(bar)</K> {fa ? "← سفارشات لیمیت بررسی می‌شوند، موقعیت‌ها به‌روز می‌شوند" : "← limit orders checked, positions updated"}</li>
              <li><K>strategy.on_kline(bar)</K> {fa ? "← منطق کاربر اجرا می‌شود، سفارشات جدید ثبت می‌شوند" : "← user logic runs, new orders placed"}</li>
            </ol>
            <Note>
              {fa
                ? "سفارشات مارکت که در on_kline() ثبت می‌شوند با قیمت close همان کندل اجرا می‌شوند. سفارشات لیمیت از کندل بعدی بررسی می‌شوند."
                : "Market orders placed in on_kline() execute at the current bar's close. Limit orders are evaluated from the next bar."}
            </Note>
          </Section>

          <Section id="bt-install" title={fa ? "نصب BackTest" : "Installing BackTest"}>
            <Code lang="bash">{BT_INSTALL}</Code>
          </Section>

          <Section id="bt-quickstart" title={fa ? "شروع سریع — BackTest" : "BackTest quick start"}>
            <Code lang="python">{BT_QUICKSTART}</Code>
          </Section>

          <Section id="bt-strategy" title={fa ? "کلاس Strategy — تنظیمات" : "Strategy class — configuration"}>
            <p>
              {fa
                ? "تمام تنظیمات به‌صورت class attribute تعریف می‌شوند و می‌توانند در Backtest() در زمان اجرا override شوند:"
                : "All settings are defined as class attributes and can be overridden at runtime in Backtest():"}
            </p>
            <Code lang="python">{BT_STRATEGY_ATTRS}</Code>
            <Code lang="python">{`# Runtime override example:
result = Backtest(MyStrategy, deposit=50_000, leverage=10, fee=0.0002).run(candles)`}</Code>
          </Section>

          <Section id="bt-commands" title={fa ? "دستورات معامله" : "Trading commands"}>
            <Code lang="python">{BT_COMMANDS}</Code>
          </Section>

          <Section id="bt-events" title={fa ? "رویدادها (Event Hooks)" : "Event hooks"}>
            <p>
              {fa
                ? "این متدها را در کلاس Strategy خود override کنید تا رویدادهای Exchange را دریافت کنید:"
                : "Override these methods in your Strategy to receive Exchange events:"}
            </p>
            <Code lang="python">{BT_EVENTS}</Code>
          </Section>

          <Section id="bt-position" title={fa ? "فیلدهای Position" : "Position fields"}>
            <Code lang="python">{BT_POSITION_FIELDS}</Code>
          </Section>

          <Section id="bt-candles" title={fa ? "بارگذاری کندل" : "Loading candles"}>
            <Code lang="python">{BT_CANDLES}</Code>
          </Section>

          <Section id="bt-result" title={fa ? "نتایج — BacktestResult" : "BacktestResult"}>
            <Code lang="python">{BT_RESULT}</Code>
          </Section>

          <Section id="bt-broadcast" title={fa ? "پخش زنده روی TrexTerminal" : "Live chart replay on TrexTerminal"}>
            <p>
              {fa
                ? "با فعال‌کردن broadcast=True در Strategy، هر کندل به‌صورت زنده به TrexTerminal broadcast می‌شود و می‌توانید بک‌تست را روی چارت واقعی تماشا کنید:"
                : "Set broadcast=True in your Strategy to stream each bar to TrexTerminal in realtime — watch the backtest replay on a live chart:"}
            </p>
            <Code lang="python">{BT_BROADCAST}</Code>
            <Note kind="tip">
              {fa
                ? "هنگام پخش زنده، اندیکاتورهایی که در indicators() رجیستر شده‌اند به‌صورت خودکار با definitions و points به ترمینال ارسال می‌شوند."
                : "During broadcast, indicators registered in indicators() are automatically pushed to the terminal as definitions and points."}
            </Note>
          </Section>

          {/* ══════════ Raw WebSocket section ══════════ */}

          <Section id="python" title={fa ? "بدون SDK — سرور خام" : "Without the SDK — raw server"}>
            <p>
              {fa
                ? "اگر نمی‌خواهید از هیچ SDK استفاده کنید، این یک سرور خام کمینه اما کامل است که snapshot می‌فرستد، تیک زنده استریم می‌کند و به ping/history پاسخ می‌دهد:"
                : "If you'd rather not use any SDK, here's a minimal but complete raw WebSocket server that sends a snapshot, streams live ticks, and answers ping/history:"}
            </p>
            <Code lang="python">{PY_EXAMPLE}</Code>
          </Section>

          {/* Footer */}
          <div
            style={{
              paddingTop: 24,
              paddingBottom: 40,
              textAlign: "center",
              fontSize: 11,
              color: "#5c6070",
            }}
          >
            Trex · {fa ? "ساخته‌شده با React 19، lightweight-charts v5، Trex Engine، و BackTest" : "Built with React 19, lightweight-charts v5, Trex Engine & BackTest"}
          </div>
        </div>
      </main>
    </div>
  );
}
