// ═══════════════════════════════════════════════════════════════════
// Trex Terminal — Documentation Page
// ═══════════════════════════════════════════════════════════════════
// A complete, bilingual (فارسی / English) reference for integrating a
// backend with Trex Terminal: the architecture model, the full WebSocket
// protocol, data schemas, the Indicator Builder contract, drawing tools,
// keyboard shortcuts and a runnable Python server.
//
// Layout: a sticky left table-of-contents (scroll-spy highlighted) beside
// a scrollable article column. Persian renders right-to-left while code
// blocks and protocol tables stay LTR for readability.
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, type ReactNode } from "react";
import { IconArrowLeft } from "./icons";

type Lang = "fa" | "en";

/* ════════════════════════════ building blocks ════════════════════ */

/** Monospace code block (always LTR, horizontally scrollable). */
function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div dir="ltr" className="docs-code-window my-4 overflow-hidden">
      {lang && (
        <div className="flex items-center gap-1.5 border-b border-[var(--d-border)] bg-[var(--d-surface)] px-3.5 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          <span className="ms-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--d-text-3)]">{lang}</span>
        </div>
      )}
      <pre className="trex-scroll overflow-x-auto p-4 text-left font-mono text-[11.5px] leading-relaxed text-[#C8D0DC]">
        {children}
      </pre>
    </div>
  );
}

/** Inline keyword / code token. */
function K({ children }: { children: ReactNode }) {
  return (
    <code dir="ltr" className="rounded-[5px] border border-[var(--d-border)] bg-[var(--d-surface-2)] px-1.5 py-px font-mono text-[11px] text-[var(--d-accent)]">
      {children}
    </code>
  );
}

/** A highlighted callout (note / warning / tip). */
function Note({ kind = "note", children }: { kind?: "note" | "warn" | "tip"; children: ReactNode }) {
  const tone = {
    note: { bar: "var(--d-accent)", bg: "rgba(245,166,35,0.07)", ring: "rgba(245,166,35,0.2)" },
    warn: { bar: "#F23645", bg: "rgba(242,54,69,0.07)", ring: "rgba(242,54,69,0.2)" },
    tip: { bar: "#1FBF8F", bg: "rgba(31,191,143,0.07)", ring: "rgba(31,191,143,0.2)" },
  }[kind];
  return (
    <div
      className="my-4 rounded-[12px] px-4 py-3.5 text-[12.5px] leading-relaxed text-[#C2C5CE]"
      style={{ borderInlineStartWidth: 3, borderInlineStartColor: tone.bar, background: tone.bg, border: `1px solid ${tone.ring}` }}
    >
      {children}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-6 scroll-mt-6 rounded-[16px] border border-[var(--d-border)] bg-[var(--d-surface)] p-6 lg:p-7">
      <h2 className="mb-4 flex items-center gap-2.5 text-start text-[21px] font-bold leading-tight text-[var(--d-text)]">
        <span className="inline-block h-[18px] w-[3px] shrink-0 rounded-full bg-[var(--d-accent)]" />
        <span dir="auto">{title}</span>
      </h2>
      <div className="space-y-3 text-start text-[13.5px] leading-[1.75] text-[var(--d-text-2)]">{children}</div>
    </section>
  );
}

interface MsgRow { type: string; payload: string; desc: string }

/** A three-column protocol table (type · payload · description). */
function MsgTable({ rows, headers, fa }: { rows: MsgRow[]; headers: [string, string, string]; fa: boolean }) {
  return (
    <div dir="ltr" className="trex-scroll my-4 overflow-x-auto rounded-[10px] border border-[#272B35]">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b-2 border-[#323743] bg-[#191D24] text-[10.5px] uppercase tracking-wider text-[#8A8F9C]">
            <th className="px-3.5 py-2.5 font-semibold">{headers[0]}</th>
            <th className="px-3.5 py-2.5 font-semibold">{headers[1]}</th>
            <th className="px-3.5 py-2.5 font-semibold">{headers[2]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.type + r.payload}
              className={"border-t border-[#21252E] align-top " + (i % 2 ? "bg-[#15181F]" : "bg-transparent")}
            >
              <td className="whitespace-nowrap px-3.5 py-2.5 font-mono font-medium text-[var(--nb-accent)]">{r.type}</td>
              <td className="px-3.5 py-2.5 font-mono text-[11px] text-[#9598A1]">{r.payload}</td>
              <td className="px-3.5 py-2.5 text-[#B7BAC4]" dir={fa ? "rtl" : "ltr"}>{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A two-column reference table (key · description). */
function KVTable({ rows, fa }: { rows: [string, string][]; fa: boolean }) {
  return (
    <div dir="ltr" className="trex-scroll my-4 overflow-x-auto rounded-[10px] border border-[#272B35]">
      <table className="w-full border-collapse text-left text-[12px]">
        <tbody>
          {rows.map(([k, d], i) => (
            <tr
              key={k}
              className={"border-t border-[#21252E] first:border-t-0 " + (i % 2 ? "bg-[#15181F]" : "bg-transparent")}
            >
              <td className="whitespace-nowrap px-3.5 py-2.5 font-mono font-medium text-[var(--nb-accent)]">{k}</td>
              <td className="px-3.5 py-2.5 text-[#B7BAC4]" dir={fa ? "rtl" : "ltr"}>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════════════════════ protocol data ══════════════════════ */

const clientRows = (fa: boolean): MsgRow[] => [
  { type: "hello", payload: `{ client, version }`, desc: fa ? "معرفی کلاینت بلافاصله بعد از اتصال (هندشیک)." : "Client handshake sent right after the socket opens." },
  { type: "ping", payload: `{}`, desc: fa ? "هر ۱۵ ثانیه؛ سرور باید pong برگرداند (برای محاسبه‌ی تأخیر RTT)." : "Every 15s; server must reply with pong (used to derive RTT latency)." },
  { type: "history", payload: `{ before, count }`, desc: fa ? "درخواست کندل‌های قدیمی‌تر از یک timestamp (لیزی‌لود هنگام اسکرول به چپ)." : "Request candles older than a timestamp (lazy-loaded when panning left)." },
  { type: "symbol", payload: `{ symbol }`, desc: fa ? "کاربر نماد را عوض کرد؛ سرور باید snapshot جدید بفرستد." : "User changed the symbol; reply with a fresh snapshot." },
  { type: "timeframe", payload: `{ timeframe }`, desc: fa ? "کاربر تایم‌فریم را عوض کرد؛ سرور باید snapshot جدید بفرستد." : "User changed the timeframe; reply with a fresh snapshot." },
  { type: "chartType", payload: `{ chartType }`, desc: fa ? "اطلاع‌رسانی: نوع نمایش عوض شد (candles / heikin / line / area / bars)." : "Informational: display type changed (candles / heikin / line / area / bars)." },
];

const serverRows = (fa: boolean): MsgRow[] => [
  { type: "snapshot | init", payload: `{ data, definitions?, points?, drawings?, symbol?, timeframe?, digits? }`, desc: fa ? "بار اولیه: آرایه‌ی کندل + تعریف سری‌ها + داده‌ی آن‌ها + اشیای سروری اختیاری." : "Initial load: candle array + series definitions + their data + optional server objects." },
  { type: "candles", payload: `{ data: OHLC[] }`, desc: fa ? "جایگزینی کامل کندل‌ها." : "Full candle replacement." },
  { type: "bar | tick | update", payload: `{ bar: OHLC }`, desc: fa ? "آپدیت زنده: time برابر آخرین کندل آن را به‌جا آپدیت می‌کند؛ time جدیدتر یک کندل تازه اضافه می‌کند." : "Realtime: a matching time updates the last candle in place; a newer time appends a fresh one." },
  { type: "history", payload: `{ data: OHLC[], noMoreHistory? }`, desc: fa ? "پاسخ به history؛ آرایه‌ی خالی یا noMoreHistory یعنی دیتای قدیمی‌تری نیست." : "Reply to a history request; an empty array or noMoreHistory means nothing older exists." },
  { type: "definitions", payload: `{ definitions: SeriesDefinition[] }`, desc: fa ? "تعریف/به‌روزرسانی سری‌های اندیکاتور (پنل اصلی یا زیرین)." : "Define / update indicator series (main pane or sub-panes)." },
  { type: "indicators", payload: `{ points: { [key]: PointData[] } }`, desc: fa ? "داده‌ی سری‌ها؛ آرایه‌ی تک‌عضوی فقط آخرین نقطه را آپدیت می‌کند (مسیر سریع ریل‌تایم)." : "Series data; a single-element array updates only the last point (fast realtime path)." },
  { type: "drawings | drawing_set", payload: `{ drawings: Drawing[] }`, desc: fa ? "ست‌کردن کامل اشیای سروری روی نمودار — فقط‌خواندنی، دقیقاً مثل اندیکاتور." : "Replace all server objects on the chart — read-only, exactly like indicators." },
  { type: "drawing | drawing_upsert", payload: `{ drawing: Drawing }`, desc: fa ? "افزودن/به‌روزرسانی یک شیء سروری." : "Add / update a single server object." },
  { type: "drawing_delete", payload: `{ drawingIds | drawingId }`, desc: fa ? "حذف اشیای سروری مشخص." : "Remove specific server objects." },
  { type: "drawings_clear", payload: `{}`, desc: fa ? "پاک‌کردن همه‌ی اشیای سروری." : "Clear all server objects." },
  { type: "settings", payload: `{ settings: Partial<ChartSettings> }`, desc: fa ? "پچ‌کردن ریموت تنظیمات ظاهری نمودار." : "Remotely patch chart appearance settings." },
  { type: "magnet", payload: `{ magnet: boolean }`, desc: fa ? "روشن/خاموش‌کردن مگنت از سمت سرور." : "Toggle magnet mode remotely." },
  { type: "chartType", payload: `{ chartType }`, desc: fa ? "تغییر نوع نمایش از سمت سرور." : "Switch the display type remotely." },
  { type: "symbol | timeframe", payload: `{ symbol } / { timeframe }`, desc: fa ? "به‌روزرسانی لیبل نماد/تایم‌فریم در UI." : "Update the symbol / timeframe label in the UI." },
  { type: "fitContent", payload: `{}`, desc: fa ? "فیت‌کردن کل دیتا در دید." : "Fit all data into view." },
  { type: "scrollToEnd", payload: `{}`, desc: fa ? "پرش به آخرین کندل." : "Jump to the latest candle." },
  { type: "zoomRange", payload: `{ zoomRange: { from, to } }`, desc: fa ? "زوم روی بازه‌ی زمانی مشخص (timestamp ثانیه)." : "Zoom to a time range (unix-second timestamps)." },
  { type: "toast", payload: `{ message, toastType? }`, desc: fa ? "نمایش اعلان (info | success | error | warning)." : "Show a toast (info | success | error | warning)." },
  { type: "pong", payload: `{}`, desc: fa ? "پاسخ ping؛ کلاینت با آن تأخیر را می‌سنجد." : "Reply to ping; the client derives latency from it." },
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
    # 1) initial snapshot: candles + one SMA overlay + its data
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

    # 2) stream realtime updates to the last candle
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
        # 3) answer client requests
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

/* ── Python SDK examples ─────────────────────────────────────────── */

const SDK_INSTALL = `pip install trex-terminal`;

const SDK_SYNC = `from trex.sync import SyncServer
from trex import Candle, line

server = SyncServer(port=8765)

# When a terminal connects, send it the initial data.
@server.on_connect
def on_connect(client):
    client.snapshot(symbol="BTCUSDT", timeframe="1m", candles=my_candles)
    client.define(line("sma20", "SMA 20"))

server.start()                 # non-blocking — runs on a background thread

# Stream realtime updates from anywhere in your (blocking) code:
while True:
    bar = get_next_bar()
    server.broadcast_bar(bar)`;

const SDK_ASYNC = `import asyncio
from trex import TrexServer, Candle, line

server = TrexServer(port=8765)

@server.on_connect
async def feed(session):
    await session.send_snapshot(symbol="BTCUSDT", timeframe="1m", candles=bars)
    await session.define(line("sma20", "SMA 20"))
    await session.push_points("sma20", sma_points)
    async for bar in my_live_feed():
        await session.update_bar(bar)

asyncio.run(server.serve_forever())`;

const SDK_PRESETS = `from trex import presets

# Styling is done for you — RSI lands in a sub-pane with 30/70 levels.
# YOU compute the values; the SDK never does any math.
client.define(presets.rsi(14))
client.push_points("rsi", my_rsi_values)

# Multi-series indicators return a list — splat into define():
client.define(*presets.macd())          # macd, macd_signal, macd_hist
client.define(*presets.bollinger(20))   # bb_upper, bb_mid, bb_lower`;

const SDK_DRAWINGS = `from trex import (trendline, horizontal, rectangle, fib_retracement,
                  long_position, text_label, DrawingStyle)

# Server objects render read-only (locked), exactly like indicators.
client.set_drawings([
    horizontal(t0, 42000, color="#F23645"),
    trendline((t1, 41000), (t2, 43000)),
    rectangle((t1, 41500), (t2, 42500), color="#FF9800"),
    fib_retracement((t1, 41000), (t2, 43000)),     # full fib levels
    long_position((t1, 42000), end_time=t2,         # auto risk/reward
                  stop_loss=41000, take_profit=44000, quantity=2),
    text_label(t1, 43000, "breakout"),
])`;

const SDK_CONTROL = `client.set_chart_type("heikin")   # candles | heikin | line | area | bars
client.set_magnet(True)           # snap-to-OHLC
client.set_settings(show_grid=False, candle_up_color="#00FF00")
client.fit_content()              # fit all data into view
client.scroll_to_end()            # jump to the latest candle
client.zoom_range(t_from, t_to)   # zoom a time range
client.toast("hello", "success")  # info | success | error | warning`;


const drawingTools = (fa: boolean): [string, string][] => [
  ["trendline", fa ? "خط روند بین دو نقطه." : "A line between two points."],
  ["ray", fa ? "نیم‌خط؛ از نقطه‌ی دوم ادامه می‌یابد." : "A ray; extends past the second point."],
  ["extended", fa ? "خط که در هر دو جهت بی‌نهایت ادامه دارد." : "A line extended infinitely both ways."],
  ["horizontal", fa ? "خط افقی روی یک قیمت (۱ نقطه)." : "A horizontal line at a price (1 point)."],
  ["vertical", fa ? "خط عمودی روی یک زمان (۱ نقطه)." : "A vertical line at a time (1 point)."],
  ["polyline", fa ? "چندخطی؛ با دابل‌کلیک یا Enter تمام می‌شود." : "A multi-segment line; finish with double-click or Enter."],
  ["arrow", fa ? "پیکان جهت‌دار بین دو نقطه." : "A directional arrow between two points."],
  ["rectangle", fa ? "مستطیل (۲ نقطه‌ی قطری)." : "A rectangle (2 diagonal points)."],
  ["ellipse", fa ? "بیضی محاط در کادر دو نقطه." : "An ellipse inscribed in the 2-point box."],
  ["parallelChannel", fa ? "کانال موازی (۳ نقطه: خط + عرض)." : "A parallel channel (3 points: line + width)."],
  ["fibRetracement", fa ? "فیبوناچی بازگشتی با سطوح قابل‌ویرایش (۲ نقطه)." : "Fibonacci retracement with editable levels (2 points)."],
  ["fibExtension", fa ? "فیبوناچی گسترشی (۳ نقطه)." : "Fibonacci extension (3 points)."],
  ["text", fa ? "برچسب متنی (۱ نقطه)." : "A text label (1 point)."],
  ["measure", fa ? "ابزار اندازه‌گیری موقت — هیچ‌وقت ذخیره نمی‌شود." : "An ephemeral measuring tool — never persisted."],
  ["longPosition", fa ? "ابزار موقعیت خرید (entry/SL/TP، نسبت R/R)." : "Long-position tool (entry/SL/TP, R/R ratio)."],
  ["shortPosition", fa ? "ابزار موقعیت فروش (entry/SL/TP، نسبت R/R)." : "Short-position tool (entry/SL/TP, R/R ratio)."],
];

const shortcuts = (fa: boolean): [string, string][] => [
  ["Delete / Backspace", fa ? "حذف ترسیم انتخاب‌شده" : "Delete the selected drawing"],
  ["Ctrl + Z", fa ? "واگرد (Undo)" : "Undo"],
  ["Ctrl + Y / Ctrl + Shift + Z", fa ? "ازنو (Redo)" : "Redo"],
  ["Escape", fa ? "لغو ترسیم → لغو انتخاب → نشانگر" : "Cancel placement -> deselect -> cursor"],
  ["Enter", fa ? "پایان‌دادن به Polyline" : "Finish a polyline"],
  ["M", fa ? "مگنت (چسبیدن به OHLC کندل‌ها)" : "Magnet mode (snap to candle OHLC)"],
  ["Alt + T / H / V / F / R", fa ? "خط روند / افقی / عمودی / فیبوناچی / مستطیل" : "Trend line / Horizontal / Vertical / Fib / Rectangle"],
  ["Shift + Drag", fa ? "زوم مستطیلی روی ناحیه" : "Rectangle zoom on a region"],
  [fa ? "دابل‌کلیک نمودار" : "Double-click chart", fa ? "تمام‌صفحه" : "Toggle fullscreen"],
  [fa ? "اسکرول / درگ" : "Scroll / Drag", fa ? "زوم / جابه‌جایی (لیزی‌لود تاریخچه در لبه‌ی چپ)" : "Zoom / pan (history lazy-loads at the left edge)"],
];

interface TocGroup { group: string; items: { id: string; label: string }[] }

const TOC_GROUPS = (fa: boolean): TocGroup[] => [
  {
    group: fa ? "شروع" : "Getting started",
    items: [
      { id: "intro", label: fa ? "معرفی" : "Introduction" },
      { id: "architecture", label: fa ? "معماری" : "Architecture" },
      { id: "quickstart", label: fa ? "شروع سریع" : "Quick start" },
      { id: "connection", label: fa ? "اتصال و پایداری" : "Connection & resilience" },
    ],
  },
  {
    group: fa ? "پروتکل" : "Protocol",
    items: [
      { id: "c2s", label: fa ? "کلاینت ← سرور" : "Client → server" },
      { id: "s2c", label: fa ? "سرور ← کلاینت" : "Server → client" },
      { id: "ohlc", label: fa ? "OHLC و PointData" : "OHLC & PointData" },
      { id: "defschema", label: "SeriesDefinition" },
      { id: "drawschema", label: fa ? "اشیای ترسیمی" : "Drawing objects" },
      { id: "tools", label: fa ? "ابزارهای ترسیم" : "Drawing tools" },
    ],
  },
  {
    group: fa ? "قابلیت‌ها" : "Features",
    items: [
      { id: "builder", label: fa ? "طراح اندیکاتور" : "Indicator Builder" },
      { id: "workspace", label: fa ? "میزکار و ماندگاری" : "Workspace & persistence" },
      { id: "keys", label: fa ? "میان‌برها" : "Shortcuts" },
    ],
  },
  {
    group: fa ? "SDK پایتون" : "Python SDK",
    items: [
      { id: "sdk", label: fa ? "معرفی SDK" : "SDK overview" },
      { id: "sdk-sync", label: fa ? "حالت ساده (sync)" : "Simple (sync)" },
      { id: "sdk-async", label: fa ? "حالت async" : "Async" },
      { id: "sdk-presets", label: fa ? "اندیکاتورهای آماده" : "Indicator presets" },
      { id: "sdk-drawings", label: fa ? "رسم از سرور" : "Server drawings" },
      { id: "sdk-control", label: fa ? "کنترل چارت" : "Chart control" },
      { id: "python", label: fa ? "بدون SDK (خام)" : "Without the SDK (raw)" },
    ],
  },
];

/** Flat list of all ids in order, for the scroll-spy. */
const ALL_IDS = (fa: boolean): string[] => TOC_GROUPS(fa).flatMap((g) => g.items.map((i) => i.id));

/* ═══════════════════════════ component ════════════════════════════ */

export default function DocsPage({ lang = "fa", onBack }: { lang?: Lang; onBack: () => void }) {
  const [l, setL] = useState<Lang>(lang);
  const fa = l === "fa";
  const [active, setActive] = useState<string>("intro");
  const [query, setQuery] = useState("");
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Scroll-spy: highlight the TOC entry whose section is nearest the top.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const ids = ALL_IDS(fa);
    const onScroll = () => {
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) current = id;
      }
      setActive(current);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [fa]);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="docs-root flex h-screen flex-col text-[var(--d-text)]">
      {/* ── top bar ── */}
      <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--d-border)] bg-[rgba(10,12,16,0.8)] px-4 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium text-[var(--d-text-2)] transition-colors hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]"
        >
          <IconArrowLeft />
          {fa ? "بازگشت به نمودار" : "Back to chart"}
        </button>
        <div className="mx-1 h-5 w-px bg-[var(--d-border)]" />
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[14px] font-black text-[#1a1206]"
            style={{ background: "linear-gradient(135deg, #FFB733, #FF7847)" }}
          >
            T
          </span>
          <span className="text-[15px] font-bold text-[var(--d-text)]">{fa ? "مستندات Trex" : "Trex Docs"}</span>
          <span className="docs-chip rounded-full px-2 py-0.5 text-[10px] font-semibold">v2.0</span>
        </div>
        <div className="flex-1" />
        <div className="flex overflow-hidden rounded-[8px] border border-[var(--d-border-hi)]">
          {(["fa", "en"] as Lang[]).map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setL(x)}
              className={
                "px-3 py-1.5 text-[12px] font-semibold transition-colors " +
                (l === x ? "text-[#1a1206]" : "bg-transparent text-[var(--d-text-2)] hover:bg-[var(--d-surface-2)]")
              }
              style={l === x ? { background: "linear-gradient(135deg, #FFB733, #FF7847)" } : undefined}
            >
              {x === "fa" ? "فارسی" : "English"}
            </button>
          ))}
        </div>
      </header>

      {/* ── body: fixed sidebar + scrollable content ── */}
      <div dir={fa ? "rtl" : "ltr"} className="flex min-h-0 flex-1">

        {/* ── left sidebar (fixed, searchable) ── */}
        <aside className="hidden w-[260px] shrink-0 flex-col border-e border-[var(--d-border)] bg-[rgba(13,16,22,0.6)] md:flex">
          {/* search */}
          <div className="shrink-0 p-3">
            <div className="flex items-center gap-2 rounded-[8px] border border-[var(--d-border)] bg-[var(--d-bg)] px-3 py-2 transition-colors focus-within:border-[var(--d-accent)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#787B86" strokeWidth="2">
                <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={fa ? "جستجو در مستندات…" : "Search docs…"}
                className="w-full bg-transparent text-[12.5px] text-[var(--d-text)] placeholder:text-[var(--d-text-3)] focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="text-[var(--d-text-2)] hover:text-[var(--d-text)]">×</button>
              )}
            </div>
          </div>

          {/* grouped, filterable nav */}
          <nav className="trex-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-6">
            {TOC_GROUPS(fa).map((grp) => {
              const items = grp.items.filter((t) => t.label.toLowerCase().includes(query.toLowerCase()));
              if (items.length === 0) return null;
              return (
                <div key={grp.group} className="mb-4">
                  <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--d-text-3)]">
                    {grp.group}
                  </div>
                  {items.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => go(t.id)}
                      className={
                        "block w-full rounded-[8px] px-3 py-1.5 text-start text-[12.5px] transition-colors " +
                        (active === t.id
                          ? "docs-nav-active"
                          : "text-[var(--d-text-2)] hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]")
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* ── content column ── */}
        <div ref={scrollerRef} className="trex-scroll min-h-0 flex-1 overflow-y-auto">
          {/* hero */}
          <div className="relative overflow-hidden border-b border-[var(--d-border)]">
            <div className="docs-hero-glow" />
            <div className="docs-hero-grid" />
            <div className="relative mx-auto max-w-[820px] px-6 py-16 text-start lg:px-12">
              <div className="docs-chip mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--d-accent)]" />
                {fa ? "نسخه ۲.۰ · پروتکل WebSocket" : "v2.0 · WebSocket protocol"}
              </div>
              <h1 className="mb-4 text-[44px] font-extrabold leading-[1.08] tracking-tight">
                <span className="docs-gradient-text" dir="auto">
                  {fa ? "مستندات Trex Terminal" : "Trex Terminal Docs"}
                </span>
              </h1>
              <p className="max-w-[560px] text-[15px] leading-relaxed text-[var(--d-text-2)]">
                {fa
                  ? "هرچه برای اتصال بک‌اند خود به یک ترمینال نموداری در سطح TradingView لازم دارید — پروتکل کامل، اسکیماهای داده، و یک SDK پایتون با حالت ساده و async."
                  : "Everything you need to connect your backend to a TradingView-grade charting terminal — the full protocol, data schemas, and a Python SDK with simple and async modes."}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => go("quickstart")}
                  className="rounded-[10px] px-5 py-2.5 text-[13px] font-bold text-[#1a1206] transition-transform hover:scale-[1.03]"
                  style={{ background: "linear-gradient(135deg, #FFB733, #FF7847)" }}
                >
                  {fa ? "شروع سریع" : "Quick start"}
                </button>
                <button
                  type="button"
                  onClick={() => go("sdk")}
                  className="rounded-[10px] border border-[var(--d-border-hi)] bg-[var(--d-surface)] px-5 py-2.5 text-[13px] font-bold text-[var(--d-text)] transition-colors hover:border-[var(--d-accent)]"
                >
                  {fa ? "SDK پایتون" : "Python SDK"}
                </button>
              </div>
            </div>
          </div>

          <article className="mx-auto max-w-[820px] px-6 py-12 lg:px-12">
            <Section id="intro" title={fa ? "معرفی" : "Introduction"}>
              <p>
                {fa
                  ? "Trex Terminal یک ترمینال نموداری ریل‌تایم در سبک TradingView است که در یک فایل HTML مستقل بسته‌بندی می‌شود. دیتا یا از شبیه‌ساز داخلی (حالت Demo) می‌آید یا از سرور WebSocket شما — هر دو دقیقاً از یک پروتکل استفاده می‌کنند، پس بک‌اندی که برای حالت سرور می‌نویسید بدون هیچ تغییری با همه‌ی قابلیت‌های UI کار می‌کند."
                  : "Trex Terminal is a realtime, TradingView-style charting terminal packaged as a single self-contained HTML file. Data comes either from the built-in simulator (Demo mode) or from your own WebSocket server — both speak exactly the same protocol, so a backend written for server mode works with every UI feature unchanged."}
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
                  ? "Trex یک کلاینت «فقط‌نمایشی» است. هیچ محاسبه‌ای انجام نمی‌دهد و جز درخواست داده هیچ‌چیز به سرور نمی‌فرستد. همه‌چیزِ روی نمودار از سرور می‌آید و کلاینت فقط آن را زیبا رندر می‌کند."
                  : "Trex is a “display-only” client. It performs no computation and sends nothing to the server except data requests. Everything on the chart arrives from the server, and the client simply renders it beautifully."}
              </p>
              <Note kind="warn">
                {fa
                  ? "کلاینت هیچ‌وقت ترسیم‌های کاربر را به سرور نمی‌فرستد. دو مسیر مجزا وجود دارد: (۱) ترسیم‌های دستی کاربر که فقط محلی و قابل‌ویرایش‌اند، و (۲) اشیای سروری که از طریق پیام‌های drawing می‌آیند و فقط‌خواندنی رندر می‌شوند — دقیقاً مثل اندیکاتورها."
                  : "The client never sends user drawings to the server. There are two separate paths: (1) the user's manual drawings, which are local-only and editable, and (2) server objects, which arrive via drawing messages and render read-only — exactly like indicators."}
              </Note>
              <p className="mt-2">
                {fa
                  ? "یعنی سرور می‌تواند هر شیئی (خط، مستطیل، بیضی، کانال، فیبوناچی و...) را دقیقاً مثل یک سری اندیکاتور بفرستد و کلاینت آن را رسم می‌کند، بدون اینکه کاربر بتواند تغییرش دهد."
                  : "This means the server can push any object (line, rectangle, ellipse, channel, fib, …) the same way it pushes an indicator series, and the client draws it without letting the user modify it."}
              </p>
            </Section>

            <Section id="quickstart" title={fa ? "شروع سریع" : "Quick start"}>
              <p>
                {fa
                  ? "فایل trex-terminal.html را در مرورگر باز کنید. در صفحه‌ی لودر، «Demo» شبیه‌ساز داخلی را اجرا می‌کند و «Connect» به آدرس WebSocket واردشده وصل می‌شود (پیش‌فرض: "
                  : "Open trex-terminal.html in a browser. On the loader screen, “Demo” runs the built-in simulator while “Connect” attaches to the WebSocket URL you enter (default: "}
                <K>ws://localhost:8765</K>
                {fa ? ")." : ")."}
              </p>
              <p className="mt-2">
                {fa
                  ? "ترتیب معمول یک سشن سرور: کلاینت hello می‌فرستد → سرور snapshot می‌دهد → سرور با bar استریم می‌کند → کلاینت هنگام اسکرول به چپ history می‌خواهد."
                  : "A typical server session: client sends hello -> server replies with a snapshot -> server streams bar updates -> client requests history when panning left."}
              </p>
            </Section>

            <Section id="connection" title={fa ? "اتصال و پایداری" : "Connection & resilience"}>
              <p>{fa ? "کلاینت اتصال WebSocket را به‌صورت خودکار مدیریت می‌کند:" : "The client manages the WebSocket connection automatically:"}</p>
              <ul className="mt-2 list-disc space-y-1 ps-5">
                <li>{fa ? "اتصال مجدد خودکار با backoff نمایی (شروع ~۱ثانیه، تا سقف چند ثانیه)." : "Automatic reconnect with exponential backoff (starts ~1s, capped at a few seconds)."}</li>
                <li>{fa ? "keepalive با ping/pong هر ۱۵ ثانیه؛ تأخیر RTT در نوار وضعیت دیده می‌شود." : "ping/pong keepalive every 15s; RTT latency is shown in the status bar."}</li>
                <li>{fa ? "پیام‌های فرستاده‌شده هنگام قطعی در صف می‌مانند و بعد از وصل‌شدن مجدد ارسال می‌شوند." : "Messages sent while disconnected are queued and flushed on reconnect."}</li>
                <li>{fa ? "فریم‌های نامعتبر/ناشناخته بی‌صدا دور انداخته می‌شوند (بدون کرش)." : "Malformed / unknown frames are dropped silently (no crash)."}</li>
              </ul>
              <Note kind="tip">
                {fa
                  ? "همه‌ی دیتای ورودی پاک‌سازی (sanitize) می‌شود: کندل‌ها به دامنه‌ی زمانی اکیداً صعودی و یکتا مرتب می‌شوند؛ اشیای ترسیمی با ابزار ناشناخته یا نقاط ناکافی دور انداخته می‌شوند."
                  : "All inbound data is sanitized: candles are sorted to a strictly-increasing unique time domain; drawing objects with an unknown tool or too few points are dropped."}
              </Note>
            </Section>

            <Section id="c2s" title={fa ? "پیام‌ها: کلاینت ← سرور" : "Messages: client -> server"}>
              <p>{fa ? "کلاینت فقط «درخواست» می‌فرستد — هیچ‌وقت داده‌ی کاربر را push نمی‌کند." : "The client only sends requests — it never pushes user data."}</p>
              <MsgTable fa={fa} headers={["type", "payload", fa ? "توضیح" : "Description"]} rows={clientRows(fa)} />
            </Section>

            <Section id="s2c" title={fa ? "پیام‌ها: سرور ← کلاینت" : "Messages: server -> client"}>
              <MsgTable fa={fa} headers={["type", "payload", fa ? "توضیح" : "Description"]} rows={serverRows(fa)} />
              <Note kind="tip">
                {fa
                  ? "نکته‌ی پرفورمنس: برای آپدیت ریل‌تایم اندیکاتور، در indicators برای هر کلید فقط یک نقطه بفرستید تا مسیر سریع O(1) فعال شود؛ آرایه‌های بلندتر کل سری را جایگزین می‌کنند."
                  : "Performance note: for realtime indicator updates send a single point per key in indicators to hit the O(1) fast path; longer arrays replace the whole series."}
              </Note>
            </Section>

            <Section id="ohlc" title={fa ? "OHLC و PointData" : "OHLC & PointData"}>
              <p>
                {fa
                  ? "واحد زمان همه‌جا «ثانیه‌ی یونیکس» است (نه میلی‌ثانیه). کندل‌ها باید دامنه‌ی زمانی اکیداً صعودی و یکتا داشته باشند — کلاینت خودش مرتب و یکتاسازی می‌کند ولی فرستادن دیتای تمیز بهتر است."
                  : "Time is unix SECONDS everywhere (not milliseconds). Candles must form a strictly-increasing, unique time domain — the client sorts and de-dupes anyway, but sending clean data is best."}
              </p>
              <Code lang="json">{OHLC_SCHEMA}</Code>
            </Section>

            <Section id="defschema" title={fa ? "اسکیمای SeriesDefinition" : "SeriesDefinition schema"}>
              <p>
                {fa
                  ? "هر سری اندیکاتور با این آبجکت تعریف می‌شود. سری‌های pane: \"sub\" به‌صورت خودکار پنل جداگانه با اسکیل مستقل می‌گیرند؛ سری‌هایی با paneId یکسان در یک پنل قرار می‌گیرند (مثل سه سری MACD)."
                  : "Every indicator series is described by this object. Series with pane: \"sub\" automatically get their own pane with an independent scale; series sharing a paneId live in one pane (e.g. MACD's three series)."}
              </p>
              <Code lang="json">{DEF_SCHEMA}</Code>
            </Section>

            <Section id="drawschema" title={fa ? "اشیای ترسیمی (سروری)" : "Drawing objects (server-side)"}>
              <p>
                {fa
                  ? "اشیا با مختصات داده (time, price) ذخیره می‌شوند، پس با زوم/پن لنگر می‌مانند. اشیایی که از سرور می‌آیند با locked: true و فقط‌خواندنی رندر می‌شوند."
                  : "Objects are stored in data coordinates (time, price), so they stay anchored through zoom/pan. Objects pushed from the server render read-only with locked: true."}
              </p>
              <Code lang="json">{DRAWING_SCHEMA}</Code>
            </Section>

            <Section id="tools" title={fa ? "ابزارهای ترسیم" : "Drawing tools"}>
              <p>{fa ? "۱۶ ابزار ترسیم پشتیبانی می‌شود (هم برای کاربر، هم برای اشیای سروری):" : "Sixteen drawing tools are supported (for both user drawings and server objects):"}</p>
              <KVTable rows={drawingTools(fa)} fa={fa} />
            </Section>

            <Section id="builder" title={fa ? "طراح اندیکاتور (Indicator Builder)" : "Indicator Builder"}>
              <p>
                {fa
                  ? "طراح اندیکاتور یک محیط drag & drop است که در آن «ظاهر» یک اندیکاتور را طراحی می‌کنید (نه محاسبه‌اش). خروجی یک قالب JSON است که به سرور می‌گوید چه داده‌ای بفرستد:"
                  : "The Indicator Builder is a drag-and-drop environment where you design an indicator's appearance (not its math). It exports a JSON template that tells the server what data to send:"}
              </p>
              <ul className="mt-2 list-disc space-y-1 ps-5">
                <li>{fa ? "از پالت، «Presets» (مثل SMA/EMA/RSI) یا «Components» خام را روی پنل بکشید." : "From the palette, drag “Presets” (SMA/EMA/RSI…) or raw “Components” onto a pane."}</li>
                <li>{fa ? "در پنل ویژگی‌ها رنگ، ضخامت، دقت اعشار و منبع/تبدیل/دوره را تنظیم کنید." : "In the properties panel set color, width, decimals and source/transform/period."}</li>
                <li>{fa ? "پیش‌نمایش زنده روی کندل‌های واقعی نمایش داده می‌شود." : "A live preview renders on real candles."}</li>
                <li>{fa ? "«Copy JSON» یا «Download» یک قالب کامل قرارداد سرور می‌دهد:" : "“Copy JSON” / “Download” gives a complete server-contract template:"}</li>
              </ul>
              <Code lang="json">{TEMPLATE_SCHEMA}</Code>
              <Note>
                {fa
                  ? "بخش definitions ظاهر را تعریف می‌کند و dataRequest به سرور می‌گوید برای هر کلید چه چیزی محاسبه و بفرستد. کلاینت هیچ محاسبه‌ای نمی‌کند."
                  : "The definitions section defines the appearance and dataRequest tells the server what to compute and stream for each key. The client computes nothing."}
              </Note>
            </Section>

            <Section id="workspace" title={fa ? "میزکار و ماندگاری" : "Workspace & persistence"}>
              <ul className="list-disc space-y-1 ps-5">
                <li>{fa ? "چیدمان چند-نموداری: تک، دوتایی کنار هم، یا شبکه‌ی ۲×۲ — هر پنل ثانویه نماد مستقل خود را دارد." : "Multi-chart layouts: single, side-by-side, or a 2×2 grid — each secondary panel has its own symbol."}</li>
                <li>{fa ? "نوار شناور علاقه‌مندی‌ها: ابزارهای ستاره‌دار در یک نوار قابل‌جابه‌جایی روی نمودار ظاهر می‌شوند." : "Floating favorites bar: starred tools appear in a draggable bar over the chart."}</li>
                <li>{fa ? "ماندگاری: نماد، تایم‌فریم، نوع نمایش، تنظیمات ظاهری، علاقه‌مندی‌ها و چیدمان در localStorage ذخیره و بین جلسات بازیابی می‌شوند." : "Persistence: symbol, timeframe, display type, appearance settings, favorites and layout are saved to localStorage and restored across sessions."}</li>
              </ul>
              <Note kind="warn">
                {fa
                  ? "فقط ترجیحات UI ذخیره می‌شوند — هیچ داده‌ی بازاری کش نمی‌شود. کندل‌ها و اندیکاتورها همیشه تازه از منبع داده می‌آیند."
                  : "Only UI preferences are stored — no market data is cached. Candles and indicators always come fresh from the data source."}
              </Note>
            </Section>

            <Section id="sdk" title={fa ? "SDK پایتون" : "Python SDK"}>
              <p>
                {fa
                  ? "به‌جای نوشتن دستی فریم‌های JSON و حلقه‌ی WebSocket، می‌توانید از SDK رسمی پایتون استفاده کنید. این کتابخانه هندشیک، ping/pong، اعتبارسنجی و شکل دقیق هر پیام را برایتان مدیریت می‌کند — با یک API تایپ‌شده‌ی تمیز."
                  : "Instead of hand-writing JSON frames and a WebSocket loop, use the official Python SDK. It handles the handshake, ping/pong, validation, and the exact shape of every message for you — with a clean, typed API."}
              </p>
              <Code lang="bash">{SDK_INSTALL}</Code>
              <Note kind="tip">
                {fa
                  ? "دو راه استفاده دارد: حالت «ساده‌ی همگام» که سرور را روی یک thread پس‌زمینه اجرا می‌کند (بدون نیاز به async)، و حالت «async» برای کاربران پیشرفته. هر دو از یک پروتکل استفاده می‌کنند."
                  : "Two ways to use it: a simple synchronous mode that runs the server on a background thread (no async needed), and an async mode for advanced users. Both speak the same protocol."}
              </Note>
            </Section>

            <Section id="sdk-sync" title={fa ? "حالت ساده — همگام (sync)" : "Simple mode — synchronous"}>
              <p>
                {fa
                  ? "ساده‌ترین راه. هیچ async/await نمی‌نویسید — سرور را start می‌کنید (روی thread پس‌زمینه اجرا می‌شود) و از هر جای کد عادی‌تان داده می‌فرستید."
                  : "The easiest path. You write no async/await — start the server (it runs on a background thread) and push data with plain blocking calls from anywhere in your normal code."}
              </p>
              <Code lang="python">{SDK_SYNC}</Code>
            </Section>

            <Section id="sdk-async" title={fa ? "حالت async" : "Async mode"}>
              <p>
                {fa
                  ? "برای کاربران پیشرفته که کنترل کامل روی event loop می‌خواهند:"
                  : "For advanced users who want full control over the event loop:"}
              </p>
              <Code lang="python">{SDK_ASYNC}</Code>
            </Section>

            <Section id="sdk-presets" title={fa ? "اندیکاتورهای آماده" : "Ready-made indicator presets"}>
              <p>
                {fa
                  ? "SDK برای ۲۲ اندیکاتور معروف، تعریف کاملاً آماده (رنگ، pane، سطوح راهنما، استایل) دارد. خودِ SDK هیچ محاسبه‌ای نمی‌کند — شما مقادیر را محاسبه و push می‌کنید، ولی نیازی به تنظیم دستی ظاهر نیست."
                  : "The SDK ships fully-styled definitions for 22 common indicators (color, pane, guide levels, style). It computes nothing — you compute the values and push them — but you never hand-configure the look."}
              </p>
              <Code lang="python">{SDK_PRESETS}</Code>
              <p className="mt-1 text-[12px] text-[#787B86]">
                {fa
                  ? "موجود: SMA, EMA, WMA, VWAP, Bollinger, Keltner, Donchian, SuperTrend, PSAR, Ichimoku, RSI, MACD, Stochastic, Stoch RSI, ATR, ADX, CCI, Williams %R, Momentum, MFI, OBV, Volume."
                  : "Available: SMA, EMA, WMA, VWAP, Bollinger, Keltner, Donchian, SuperTrend, PSAR, Ichimoku, RSI, MACD, Stochastic, Stoch RSI, ATR, ADX, CCI, Williams %R, Momentum, MFI, OBV, Volume."}
              </p>
            </Section>

            <Section id="sdk-drawings" title={fa ? "رسم اشیا از سرور" : "Server-pushed drawings"}>
              <p>
                {fa
                  ? "هر یک از ۱۶ ابزار ترسیم را از سرور بفرستید. این‌ها فقط‌خواندنی رندر می‌شوند (کاربر نمی‌تواند جابه‌جا یا حذف کند) — دقیقاً مثل اندیکاتورها. ابزار موقعیت، نسبت ریسک/ریوارد را خودکار حساب می‌کند."
                  : "Push any of the 16 drawing tools from the server. They render read-only (the user can't move or delete them) — exactly like indicators. The position tools compute risk/reward automatically."}
              </p>
              <Code lang="python">{SDK_DRAWINGS}</Code>
            </Section>

            <Section id="sdk-control" title={fa ? "کنترل چارت" : "Chart control"}>
              <p>
                {fa
                  ? "از سرور می‌توانید نوع نمایش، مگنت، تنظیمات ظاهری و فرمان‌های دید را کنترل کنید:"
                  : "From the server you can control the display type, magnet, appearance settings, and view commands:"}
              </p>
              <Code lang="python">{SDK_CONTROL}</Code>
            </Section>

            <Section id="python" title={fa ? "بدون SDK — سرور خام" : "Without the SDK — raw server"}>
              <p>
                {fa
                  ? "اگر نمی‌خواهید از SDK استفاده کنید، این یک سرور خام کمینه اما کامل است که snapshot می‌فرستد، تیک زنده استریم می‌کند و به ping/history پاسخ می‌دهد:"
                  : "If you'd rather not use the SDK, here's a minimal but complete raw server that sends a snapshot, streams live ticks, and answers ping/history:"}
              </p>
              <Code lang="python">{PY_EXAMPLE}</Code>
            </Section>

            <Section id="keys" title={fa ? "میان‌برهای صفحه‌کلید" : "Keyboard shortcuts"}>
              <KVTable rows={shortcuts(fa)} fa={fa} />
            </Section>

            <div className="pb-10 pt-2 text-center text-[11px] text-[var(--d-text-3)]">
              Trex Terminal · {fa ? "ساخته‌شده با React 19 و lightweight-charts v5" : "Built with React 19 & lightweight-charts v5"}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
