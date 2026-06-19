# TrexTerminal — Server API Reference

این سند کامل‌ترین مرجع برای پیاده‌سازی سرور WebSocket است که با TrexTerminal کار می‌کند.

---

## اتصال

پروتکل: **WebSocket** (`ws://` یا `wss://`)  
فرمت پیام: **JSON** (رشته متنی)  
پورت پیش‌فرض: `8765`

---

## ۱. مسیر اتصال (Connection Flow)

```
Client connects
  → Client sends: hello
  → Client sends: get_symbols
  → Client sends: get_indicators
  ← Server sends: symbols_list
  ← Server sends: indicators_list
  ← Server sends: snapshot  (5000 candle)
  ← Server sends: definitions  (indicator shapes)
  ← Server sends: indicators  (indicator values)
  
  [realtime loop]
  ← Server sends: bar  (every candle update)
  ← Server sends: indicators  (tail update, single point per series)
  
  [on scroll left]
  → Client sends: history  {before, count=5000, from, to}
  ← Server sends: history  {data: OHLC[], noMoreHistory?: bool}
  
  [on symbol change]
  → Client sends: symbol  {symbol: "BTCUSDT"}
  ← Server sends: snapshot  (fresh data)
  
  [on timeframe change]
  → Client sends: timeframe  {timeframe: "1h"}
  ← Server sends: snapshot  (fresh data for new timeframe)
  
  [keep-alive]
  → Client sends: ping  {t: timestamp_ms}
  ← Server sends: pong  {t: timestamp_ms}
```

---

## ۲. پیام‌های Client → Server

### `hello` — handshake اولیه
```json
{
  "type": "hello",
  "client": "trex-terminal",
  "version": "2.0.0",
  "protocol": "2.0.0",
  "initialCount": 5000
}
```
- **`initialCount`**: تعداد کندل‌هایی که کلاینت برای اولین بار می‌خواهد (همیشه `5000`)

---

### `get_symbols` — درخواست لیست نمادها
```json
{ "type": "get_symbols" }
```
- فوری بعد از `hello` ارسال می‌شود
- سرور باید با `symbols_list` جواب دهد

---

### `get_indicators` — درخواست لیست اندیکاتورهای موجود
```json
{ "type": "get_indicators" }
```
- فوری بعد از `hello` ارسال می‌شود
- سرور باید با `indicators_list` جواب دهد

---

### `ping` — keep-alive
```json
{ "type": "ping", "t": 1719000000000 }
```
- هر ۱۵ ثانیه ارسال می‌شود
- سرور باید `t` را عینا در `pong` برگرداند

---

### `symbol` — تغییر نماد توسط کاربر
```json
{ "type": "symbol", "symbol": "ETHUSDT" }
```
- سرور باید کندل‌ها و اندیکاتورهای نماد جدید را با `snapshot` بفرستد

---

### `timeframe` — تغییر تایم‌فریم توسط کاربر
```json
{ "type": "timeframe", "timeframe": "1h" }
```
- سرور باید داده‌های تایم‌فریم جدید را با `snapshot` بفرستد
- مقادیر رایج: `"1m"`, `"5m"`, `"15m"`, `"30m"`, `"1h"`, `"4h"`, `"1d"`, `"1w"`

---

### `history` — درخواست کندل‌های قدیمی‌تر (scroll به چپ)
```json
{
  "type": "history",
  "before": 1718000000,
  "count": 5000,
  "from": 1717580000,
  "to": 1718000000
}
```
| فیلد | نوع | توضیح |
|------|-----|-------|
| `before` | `number` | unix-second — کندل‌هایی قدیمی‌تر از این زمان بفرست |
| `count` | `number` | تعداد مورد نیاز (معمولاً `5000`) |
| `from` | `number?` | قدیمی‌ترین کندلی که هم‌اکنون لود شده (برای محاسبه range) |
| `to` | `number?` | همان `before` (جدیدترین مرز درخواست) |
| `chartId` | `string?` | فقط برای چارت‌های ثانویه در حالت multi-chart |

سرور باید با `history` جواب دهد.

---

### `chartType` — تغییر نوع چارت
```json
{ "type": "chartType", "chartType": "candles" }
```
- مقادیر: `"candles"`, `"heikin"`, `"bars"`, `"line"`, `"area"`
- این پیام informational است؛ سرور می‌تواند آن را ذخیره کند

---

### `layout` — تغییر چیدمان چارت (multi-chart)
```json
{
  "type": "layout",
  "layout": "split2",
  "charts": [
    {
      "chartId": "main",
      "symbol": "BTCUSDT",
      "timeframe": "1h",
      "indicators": ["rsi_key", "macd_key"]
    },
    {
      "chartId": "chart_0",
      "symbol": "ETHUSDT",
      "timeframe": "1m",
      "indicators": []
    }
  ]
}
```
- `layout`: `"single"` | `"split2"` (۲ چارت) | `"grid4"` (۴ چارت)
- سرور باید برای هر `chartId` در `charts` یک `chart_snapshot` ارسال کند
- چارت‌های ثانویه ابتدا فقط کندل دارند (بدون اندیکاتور)

---

### `chart_symbol` — تغییر نماد در یک چارت ثانویه
```json
{
  "type": "chart_symbol",
  "chartId": "chart_0",
  "symbol": "SOLUSDT",
  "timeframe": "1m",
  "indicators": []
}
```
- سرور باید `chart_snapshot` با همان `chartId` بفرستد

---

### پیام‌های Drawing sync (اختیاری)
اگر سرور ذخیره drawing می‌کند:

```json
// upsert (ایجاد یا ویرایش)
{ "type": "drawing_upsert", "drawing": { ...DrawingObject } }

// حذف
{ "type": "drawing_delete", "drawingId": "uuid-xxx" }

// پاک کردن همه
{ "type": "drawings_clear" }

// جایگزینی کامل (بعد از undo/redo)
{ "type": "drawings", "drawings": [...] }
```

---

## ۳. پیام‌های Server → Client

### `symbols_list` — لیست نمادهای موجود
```json
{
  "type": "symbols_list",
  "symbols": [
    { "symbol": "BTCUSDT", "name": "Bitcoin / USDT", "type": "spot" },
    { "symbol": "ETHUSDT", "name": "Ethereum / USDT", "type": "spot" },
    { "symbol": "SOLUSDT", "name": "Solana / USDT", "type": "futures" }
  ]
}
```
- در جواب `get_symbols` ارسال می‌شود
- `name` و `type` اختیاری هستند

---

### `indicators_list` — لیست اندیکاتورهای قابل استفاده
```json
{
  "type": "indicators_list",
  "indicators": [
    {
      "key": "rsi_14",
      "label": "RSI (14)",
      "pane": "sub",
      "paneId": "pane_rsi_14",
      "type": "line",
      "color": "#7B1FA2",
      "lineWidth": 2,
      "lineStyle": 0,
      "subPaneHeight": 120,
      "scaleMargins": { "top": 0.1, "bottom": 0.1 },
      "digits": 2,
      "visible": true,
      "levels": [
        { "value": 30, "color": "#089981", "label": "30" },
        { "value": 70, "color": "#F23645", "label": "70" }
      ]
    },
    {
      "key": "sma_20",
      "label": "SMA (20)",
      "pane": "main",
      "paneId": "sma_20",
      "type": "line",
      "color": "#2962FF",
      "lineWidth": 2,
      "lineStyle": 0,
      "subPaneHeight": 120,
      "scaleMargins": { "top": 0.05, "bottom": 0.05 },
      "digits": 2,
      "visible": true
    }
  ]
}
```
- در جواب `get_indicators` ارسال می‌شود
- این لیست نمایش می‌دهد چه اندیکاتورهایی سرور می‌تواند محاسبه کند
- کاربر از این لیست انتخاب می‌کند؛ سرور بعد از انتخاب باید values را بفرستد

**فیلدهای SeriesDefinition:**

| فیلد | نوع | اجباری | توضیح |
|------|-----|---------|-------|
| `key` | `string` | ✅ | شناسه یکتا |
| `label` | `string` | ✅ | نام نمایشی |
| `pane` | `"main"\|"sub"` | ✅ | روی چارت اصلی یا پنجره جداگانه |
| `paneId` | `string` | ✅ | شناسه پنجره (چند سری می‌توانند یک پنجره داشته باشند) |
| `type` | `"line"\|"histogram"\|"area"\|"baseline"\|"scatter"` | ✅ | نوع رسم |
| `color` | `string` | - | رنگ اصلی (hex) |
| `colorPos` | `string` | - | رنگ مثبت (histogram/baseline) |
| `colorNeg` | `string` | - | رنگ منفی (histogram/baseline) |
| `lineWidth` | `number` | - | ضخامت خط: 1-4 |
| `lineStyle` | `number` | - | 0=solid, 1=dotted, 2=dashed |
| `subPaneHeight` | `number` | - | ارتفاع پیش‌فرض پنجره فرعی (px) |
| `scaleMargins` | `{top,bottom}` | - | فاصله از لبه‌های scale |
| `digits` | `number` | - | دقت اعشار |
| `visible` | `boolean` | - | نمایش اولیه |
| `levels` | `LevelDef[]` | - | خطوط راهنما (مثل 30/70 برای RSI) |
| `baseValue` | `number` | - | فقط برای type=baseline |

---

### `snapshot` — داده اولیه برای نماد/تایم‌فریم
```json
{
  "type": "snapshot",
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "digits": 2,
  "data": [
    { "time": 1718000000, "open": 68000, "high": 68500, "low": 67800, "close": 68200, "volume": 1234.5 },
    ...
  ],
  "definitions": [ ...SeriesDefinition[] ],
  "points": {
    "sma_20": [
      { "time": 1718000000, "value": 67900 },
      ...
    ],
    "rsi_14": [
      { "time": 1718000000, "value": 58.3 },
      ...
    ]
  },
  "drawings": [ ...Drawing[] ]
}
```
| فیلد | نوع | توضیح |
|------|-----|-------|
| `type` | `"snapshot"\|"init"` | هر دو یکسان هستند |
| `symbol` | `string` | نام نماد |
| `timeframe` | `string` | تایم‌فریم |
| `digits` | `number` | دقت اعشار قیمت |
| `data` | `OHLC[]` | آرایه کندل‌ها، مرتب‌شده از قدیم به جدید |
| `definitions` | `SeriesDefinition[]` | تعریف سری‌های اندیکاتور |
| `points` | `Record<key, PointData[]>` | مقادیر اندیکاتور |
| `drawings` | `Drawing[]` | ترسیمات ذخیره‌شده (اختیاری) |

**ساختار OHLC:**
```json
{
  "time": 1718000000,
  "open": 68000.0,
  "high": 68500.0,
  "low": 67800.0,
  "close": 68200.0,
  "volume": 1234.56
}
```
- `time`: unix-second (UTC)
- `high >= max(open, close)` و `low <= min(open, close)` الزامی است
- `volume` اختیاری است

---

### `bar` — به‌روزرسانی realtime
```json
{
  "type": "bar",
  "bar": { "time": 1718003600, "open": 68200, "high": 68700, "low": 68100, "close": 68500, "volume": 523.1 }
}
```
- alias های قابل قبول: `"tick"`, `"update"`
- اگر `time` با آخرین کندل یکسان باشد → آن کندل آپدیت می‌شود
- اگر `time` جدیدتر باشد → کندل جدید اضافه می‌شود

---

### `indicators` — مقادیر realtime اندیکاتور
```json
{
  "type": "indicators",
  "points": {
    "sma_20": [{ "time": 1718003600, "value": 68100 }],
    "rsi_14": [{ "time": 1718003600, "value": 62.4 }]
  }
}
```
- **یک عنصر در آرایه** = آپدیت سریع (O(1)) فقط آخرین نقطه
- **چند عنصر** = جایگزینی کامل سری (بعد از تغییر symbol/timeframe)
- `color` اختیاری روی هر point است (برای رنگ‌بندی شرطی)

---

### `definitions` — تعریف یا تغییر تعریف سری‌ها
```json
{
  "type": "definitions",
  "definitions": [ ...SeriesDefinition[] ]
}
```
- برای اضافه/حذف/تغییر سری‌های اندیکاتور در زمان اجرا

---

### `history` — جواب درخواست کندل‌های قدیمی‌تر
```json
{
  "type": "history",
  "data": [ ...OHLC[] ],
  "noMoreHistory": false
}
```
- `data` باید از قدیم به جدید مرتب باشد
- `noMoreHistory: true` یا `data: []` → کلاینت دیگر درخواست نمی‌کند

---

### `chart_snapshot` — snapshot برای چارت ثانویه (multi-chart)
```json
{
  "type": "chart_snapshot",
  "chartId": "chart_0",
  "symbol": "ETHUSDT",
  "timeframe": "1m",
  "digits": 2,
  "data": [ ...OHLC[] ],
  "definitions": [],
  "points": {}
}
```
- در جواب `layout` یا `chart_symbol` ارسال می‌شود
- `chartId` باید دقیقاً همان مقداری باشد که کلاینت فرستاده

---

### `chart_bar` — realtime bar برای چارت ثانویه
```json
{
  "type": "chart_bar",
  "chartId": "chart_0",
  "bar": { "time": 1718003600, "open": 3200, "high": 3250, "low": 3190, "close": 3220, "volume": 876.2 }
}
```

---

### `chart_history` — history برای چارت ثانویه
```json
{
  "type": "chart_history",
  "chartId": "chart_0",
  "data": [ ...OHLC[] ],
  "noMoreHistory": false
}
```

---

### `pong` — جواب ping
```json
{ "type": "pong", "t": 1719000000000 }
```

---

### `toast` — نمایش پیام به کاربر
```json
{ "type": "toast", "message": "Data updated", "toastType": "success" }
```
- `toastType`: `"info"` | `"success"` | `"warning"` | `"error"`

---

### `error` — پیام خطا
```json
{ "type": "error", "message": "Symbol not found" }
```

---

### پیام‌های کنترل نمایش (اختیاری)

```json
// تغییر نماد از سرور
{ "type": "symbol", "symbol": "BTCUSDT" }

// تغییر تایم‌فریم از سرور
{ "type": "timeframe", "timeframe": "4h" }

// تغییر نوع چارت از سرور
{ "type": "chartType", "chartType": "candles" }

// fit content
{ "type": "fitContent" }

// scroll به آخرین کندل
{ "type": "scrollToEnd" }

// zoom به بازه زمانی خاص
{ "type": "zoomRange", "zoomRange": { "from": 1718000000, "to": 1719000000 } }

// تغییر تنظیمات ظاهری
{ "type": "settings", "settings": { "showVolume": false } }

// روشن/خاموش کردن magnet
{ "type": "magnet", "magnet": true }
```

---

## ۴. Drawing sync از سرور (اختیاری)

اگر سرور ترسیمات ذخیره می‌کند:

```json
// جایگزینی کامل
{ "type": "drawings", "drawings": [...Drawing[]] }
{ "type": "drawing_set", "drawings": [...Drawing[]] }

// یک drawing جدید
{ "type": "drawing", "drawing": {...DrawingObject} }
{ "type": "drawing_upsert", "drawing": {...DrawingObject} }

// حذف
{ "type": "drawing_delete", "drawingId": "uuid-xxx" }
{ "type": "drawing_delete", "drawingIds": ["uuid-xxx", "uuid-yyy"] }

// پاک کردن همه
{ "type": "drawings_clear" }
```

> **نکته:** ترسیماتی که از سرور می‌آیند **read-only** هستند — کاربر نمی‌تواند آن‌ها را ویرایش یا حذف کند.

---

## ۵. ساختار کامل Drawing

```json
{
  "id": "uuid-string",
  "tool": "trendline",
  "points": [
    { "time": 1718000000, "price": 68000 },
    { "time": 1718003600, "price": 68500 }
  ],
  "style": {
    "color": "#2962FF",
    "lineWidth": 2,
    "lineStyle": 0,
    "fillColor": "#2962FF",
    "fillOpacity": 0.1,
    "extendLeft": false,
    "extendRight": false,
    "showLabels": true,
    "fontSize": 12
  },
  "text": "",
  "paneId": "main",
  "locked": false,
  "visible": true,
  "completed": true,
  "selected": false
}
```

**ابزارهای Drawing موجود:**

| tool | نقاط مورد نیاز | توضیح |
|------|----------------|-------|
| `trendline` | 2 | خط روند |
| `ray` | 2 | نیم‌خط |
| `extended` | 2 | خط کشیده |
| `horizontal` | 1 | خط افقی |
| `vertical` | 1 | خط عمودی |
| `fibRetracement` | 2 | فیبوناچی retracement |
| `fibExtension` | 3 | فیبوناچی extension |
| `rectangle` | 2 | مستطیل |
| `ellipse` | 2 | بیضی |
| `parallelChannel` | 3 | کانال موازی |
| `text` | 1 | متن |
| `arrow` | 2 | پیکان |
| `measure` | 2 | اندازه‌گیری |
| `longPosition` | 2 | موقعیت Long |
| `shortPosition` | 2 | موقعیت Short |
| `polyline` | 2+ | چند خطی |

---

## ۶. اولویت‌بندی پیاده‌سازی سرور

### مرحله ۱ — حداقل کار کردن:
1. `ping` → `pong`
2. `hello` ← دریافت (نیازی به جواب ندارد)
3. ارسال `snapshot` با `5000` کندل بعد از اتصال
4. ارسال `bar` برای realtime

### مرحله ۲ — تعامل کامل:
5. `get_symbols` → `symbols_list`
6. `get_indicators` → `indicators_list`
7. `symbol` → ارسال `snapshot` جدید
8. `timeframe` → ارسال `snapshot` جدید
9. `history` → ارسال `history`

### مرحله ۳ — multi-chart:
10. `layout` → ارسال `chart_snapshot` برای هر chartId
11. `chart_symbol` → ارسال `chart_snapshot`
12. ارسال `chart_bar` برای realtime چارت‌های ثانویه

### مرحله ۴ — اندیکاتور کامل:
13. ارسال `definitions` + `indicators` در snapshot
14. ارسال `indicators` (یک نقطه) همراه هر `bar`

---

## ۷. نکات مهم پیاده‌سازی

1. **ترتیب کندل‌ها**: همیشه از قدیم به جدید (`ascending by time`)
2. **زمان**: Unix-second (UTC) — نه millisecond
3. **تکرار timestamp**: مجاز نیست — اگر دو کندل با زمان یکسان بیاید، آخری برنده است
4. **OHLC validation**: `high >= max(open,close)` و `low <= min(open,close)` — در غیر این صورت کلاینت آن کندل را drop می‌کند
5. **IndicatorPoints**: `time` باید با زمان کندل متناظر دقیقاً یکسان باشد
6. **noMoreHistory**: اگر دیگر داده قدیمی‌تری ندارید حتماً `true` بفرستید تا کلاینت درخواست تکراری نکند
7. **chartId برای multi-chart**: دقیقاً همان مقداری که کلاینت فرستاده (`"main"`, `"chart_0"`, `"chart_1"`, `"chart_2"`)

---

## ۸. مثال پیاده‌سازی Python (حداقل)

```python
import asyncio
import json
import websockets
from datetime import datetime, timezone

async def handler(ws):
    async for raw in ws:
        msg = json.loads(raw)
        t = msg.get("type")

        if t == "hello":
            pass  # می‌توانید version را بررسی کنید

        elif t == "ping":
            await ws.send(json.dumps({"type": "pong", "t": msg.get("t")}))

        elif t == "get_symbols":
            await ws.send(json.dumps({
                "type": "symbols_list",
                "symbols": [
                    {"symbol": "BTCUSDT", "name": "Bitcoin / USDT"},
                    {"symbol": "ETHUSDT", "name": "Ethereum / USDT"},
                ]
            }))

        elif t == "get_indicators":
            await ws.send(json.dumps({
                "type": "indicators_list",
                "indicators": [
                    {
                        "key": "rsi_14", "label": "RSI (14)",
                        "pane": "sub", "paneId": "pane_rsi",
                        "type": "line", "color": "#7B1FA2",
                        "lineWidth": 2, "lineStyle": 0,
                        "subPaneHeight": 120,
                        "scaleMargins": {"top": 0.1, "bottom": 0.1},
                        "digits": 2, "visible": True,
                        "levels": [
                            {"value": 30, "color": "#089981"},
                            {"value": 70, "color": "#F23645"}
                        ]
                    },
                ]
            }))

        elif t in ("snapshot", None) or t == "symbol" or t == "timeframe":
            symbol = msg.get("symbol", "BTCUSDT")
            timeframe = msg.get("timeframe", "1h")
            candles = get_candles(symbol, timeframe, count=5000)  # تابع شما
            await ws.send(json.dumps({
                "type": "snapshot",
                "symbol": symbol,
                "timeframe": timeframe,
                "digits": 2,
                "data": candles,
                "definitions": [],
                "points": {}
            }))

        elif t == "history":
            before = msg["before"]
            count = msg.get("count", 5000)
            chart_id = msg.get("chartId")
            older = get_candles_before(symbol, timeframe, before, count)
            resp = {
                "type": "chart_history" if chart_id else "history",
                "data": older,
                "noMoreHistory": len(older) == 0
            }
            if chart_id:
                resp["chartId"] = chart_id
            await ws.send(json.dumps(resp))

        elif t == "layout":
            for chart in msg.get("charts", []):
                if chart["chartId"] == "main":
                    continue
                candles = get_candles(chart["symbol"], chart["timeframe"], count=5000)
                await ws.send(json.dumps({
                    "type": "chart_snapshot",
                    "chartId": chart["chartId"],
                    "symbol": chart["symbol"],
                    "timeframe": chart["timeframe"],
                    "digits": 2,
                    "data": candles,
                    "definitions": [],
                    "points": {}
                }))

        elif t == "chart_symbol":
            candles = get_candles(msg["symbol"], msg.get("timeframe", "1m"), count=5000)
            await ws.send(json.dumps({
                "type": "chart_snapshot",
                "chartId": msg["chartId"],
                "symbol": msg["symbol"],
                "timeframe": msg.get("timeframe", "1m"),
                "digits": 2,
                "data": candles,
                "definitions": [],
                "points": {}
            }))

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        await asyncio.Future()

asyncio.run(main())
```

---

*نسخه پروتکل: 2.0.0 — TrexTerminal*
