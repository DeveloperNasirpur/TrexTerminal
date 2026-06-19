# TrexTerminal — راهنمای ساخت سرور WebSocket

این مستند راهنمای کامل پیاده‌سازی سرور برای TrexTerminal است.  
TrexTerminal یک **کلاینت خالص** است — هیچ داده‌ای را محاسبه نمی‌کند. تمام کندل‌ها، مقادیر اندیکاتور، و داده‌های رسم از سرور دریافت می‌شود.

---

## فهرست مطالب

1. [الزامات فنی](#۱-الزامات-فنی)
2. [چرخه اتصال](#۲-چرخه-اتصال)
3. [نسخه‌بندی پروتکل](#۳-نسخه‌بندی-پروتکل)
4. [پیام‌های کلاینت به سرور](#۴-پیام‌های-کلاینت-به-سرور)
5. [پیام‌های سرور به کلاینت](#۵-پیام‌های-سرور-به-کلاینت)
6. [ساختار داده‌های مشترک](#۶-ساختار-داده‌های-مشترک)
7. [جریان کاری کامل](#۷-جریان-کاری-کامل)
8. [چارت‌های چندگانه](#۸-چارت‌های-چندگانه)
9. [اندیکاتورها](#۹-اندیکاتورها)
10. [سینک رسم (Drawings Sync)](#۱۰-سینک-رسم-drawings-sync)
11. [قوانین اعتبارسنجی](#۱۱-قوانین-اعتبارسنجی)
12. [مثال عملی پایتون](#۱۲-مثال-عملی-پایتون)

---

## ۱. الزامات فنی

| مورد | مقدار |
|------|-------|
| پروتکل | WebSocket (`ws://` یا `wss://`) |
| فرمت پیام | JSON خالص (text frame) |
| Ping/Pong | پشتیبانی از پروتکل داخلی (`type: "ping"` → `type: "pong"`) |
| نسخه پروتکل | `2.0.0` |

---

## ۲. چرخه اتصال

```
CLIENT                                SERVER
  |                                     |
  |──── WebSocket Handshake ──────────▶|
  |◀─── Connection Accepted ───────────|
  |                                     |
  |──── hello ──────────────────────▶  |  ← اولین پیام حتماً hello باشد
  |──── get_symbols ────────────────▶  |  ← درخواست لیست سمبل‌ها
  |──── get_indicators ─────────────▶  |  ← درخواست لیست اندیکاتورها
  |                                     |
  |◀─── symbols_list ───────────────   |  ← جواب get_symbols
  |◀─── indicators_list ────────────   |  ← جواب get_indicators
  |◀─── snapshot ───────────────────   |  ← داده اولیه چارت اصلی
  |                                     |
  |  [حالت عادی]                        |
  |◀─── bar / tick / update ────────   |  ← به‌روزرسانی لحظه‌ای
  |◀─── indicators ─────────────────   |  ← مقادیر اندیکاتور
  |                                     |
  |──── ping ───────────────────────▶  |  ← هر ۱۵ ثانیه
  |◀─── pong ───────────────────────   |  ← جواب فوری
  |                                     |
  |  [کاربر عمل می‌کند]                  |
  |──── symbol ─────────────────────▶  |  ← تغییر سمبل
  |◀─── snapshot ───────────────────   |  ← داده جدید
  |                                     |
  |──── timeframe ──────────────────▶  |  ← تغییر تایم‌فریم
  |◀─── snapshot ───────────────────   |  ← داده جدید
  |                                     |
  |──── history ────────────────────▶  |  ← اسکرول به چپ (صفحه قبلی)
  |◀─── history ────────────────────   |  ← کندل‌های قدیمی‌تر
```

---

## ۳. نسخه‌بندی پروتکل

```
MAJOR.MINOR.PATCH
```

- **MAJOR** تغییر: ناسازگار با نسخه قبل — سرور می‌تواند اتصال را ببندد
- **MINOR** تغییر: افزودنی، سازگار با نسخه قبل
- نسخه جاری: `"2.0.0"`

---

## ۴. پیام‌های کلاینت به سرور

### 4.1 `hello` — دست‌دهی اولیه

**اولین پیامی که کلاینت ارسال می‌کند.**

```json
{
  "type": "hello",
  "client": "trex-terminal",
  "version": "1.0.0",
  "protocol": "2.0.0",
  "initialCount": 5000
}
```

| فیلد | نوع | اجباری | توضیح |
|------|-----|--------|-------|
| `type` | `"hello"` | ✅ | |
| `client` | string | ✅ | نام کلاینت |
| `version` | string | ✅ | نسخه اپلیکیشن |
| `protocol` | string | ✅ | نسخه پروتکل (`"2.0.0"`) |
| `initialCount` | number | ❌ | تعداد کندل خواسته‌شده (پیش‌فرض: ۵۰۰۰) |

**عملکرد سرور:**
- اعتبارسنجی `protocol` — اگر MAJOR متفاوت است، اتصال را ببندید
- ارسال `snapshot` برای سمبل/تایم‌فریم پیش‌فرض

---

### 4.2 `ping` — زنده‌نگه‌داری

```json
{
  "type": "ping",
  "t": 1716800000000
}
```

| فیلد | نوع | اجباری | توضیح |
|------|-----|--------|-------|
| `type` | `"ping"` | ✅ | |
| `t` | number | ❌ | زمان ارسال (ms) — برای محاسبه تأخیر |

**عملکرد سرور:** بلافاصله `pong` را با همان `t` برگردانید.

---

### 4.3 `get_symbols` — درخواست لیست سمبل‌ها

```json
{ "type": "get_symbols" }
```

**عملکرد سرور:** ارسال `symbols_list`

---

### 4.4 `get_indicators` — درخواست لیست اندیکاتورها

```json
{ "type": "get_indicators" }
```

**عملکرد سرور:** ارسال `indicators_list`

---

### 4.5 `symbol` — تغییر سمبل (چارت اصلی)

```json
{
  "type": "symbol",
  "symbol": "BTCUSDT"
}
```

**عملکرد سرور:**
1. اشتراک feed سمبل جدید را شروع کنید
2. ارسال `snapshot` با کندل‌های جدید
3. ارسال `definitions` اگر اندیکاتورها تغییر کرده‌اند

---

### 4.6 `timeframe` — تغییر تایم‌فریم (چارت اصلی)

```json
{
  "type": "timeframe",
  "timeframe": "1h"
}
```

**مقادیر رایج تایم‌فریم:**

| مقدار | توضیح |
|-------|-------|
| `"1m"` | ۱ دقیقه |
| `"3m"` | ۳ دقیقه |
| `"5m"` | ۵ دقیقه |
| `"15m"` | ۱۵ دقیقه |
| `"30m"` | ۳۰ دقیقه |
| `"1h"` | ۱ ساعت |
| `"4h"` | ۴ ساعت |
| `"1d"` | ۱ روز |
| `"1w"` | ۱ هفته |
| `"1M"` | ۱ ماه |

**عملکرد سرور:** ارسال `snapshot` با کندل‌های تایم‌فریم جدید

---

### 4.7 `history` — درخواست تاریخچه بیشتر

وقتی کاربر به چپ اسکرول می‌کند و به لبه می‌رسد، کلاینت این پیام را ارسال می‌کند.

```json
{
  "type": "history",
  "before": 1716000000,
  "count": 5000,
  "from": 1715000000,
  "to": 1716000000,
  "chartId": "chart_0"
}
```

| فیلد | نوع | اجباری | توضیح |
|------|-----|--------|-------|
| `type` | `"history"` | ✅ | |
| `before` | number | ✅ | unix-second — برگردانید کندل‌هایی که `time < before` |
| `count` | number | ✅ | تعداد درخواستی (معمولاً ۵۰۰۰) |
| `from` | number | ❌ | کران پایین بازه زمانی |
| `to` | number | ❌ | کران بالای بازه زمانی |
| `chartId` | string | ❌ | اگر موجود است: برای چارت ثانوی (`"chart_0"`, `"chart_1"`, `"chart_2"`) |

**عملکرد سرور:**
- اگر `chartId` دارد: ارسال `chart_history`
- در غیر این صورت: ارسال `history`
- اگر داده قدیمی‌تری وجود ندارد: ارسال با `"noMoreHistory": true`

---

### 4.8 `chartType` — تغییر نوع چارت (اطلاعاتی)

```json
{
  "type": "chartType",
  "chartType": "heikin"
}
```

| مقدار | توضیح |
|-------|-------|
| `"candles"` | کندل استیک معمولی |
| `"heikin"` | هیکن آشی |
| `"line"` | خط |
| `"area"` | ناحیه |
| `"bar"` | بار |
| `"baseline"` | خط پایه |
| `"hlc"` | HLC |

> این پیام اطلاعاتی است. سرور می‌تواند نوع کندل را در پاسخ تغییر دهد (مثلاً برای هیکن آشی OHLC متفاوت ارسال کند).

---

### 4.9 `layout` — تغییر چیدمان چند چارتی

```json
{
  "type": "layout",
  "layout": "split2",
  "charts": [
    {
      "chartId": "main",
      "symbol": "BTCUSDT",
      "timeframe": "1h",
      "indicators": ["ema_20", "volume"]
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

| فیلد layout | مقدار |
|------------|-------|
| `"single"` | فقط چارت اصلی |
| `"split2"` | دو چارت کنار هم |
| `"grid4"` | چهار چارت (۲×۲) |

**عملکرد سرور:**
- برای `chartId === "main"`: ارسال `snapshot`
- برای `chartId === "chart_0/1/2"`: ارسال `chart_snapshot` با همان `chartId`

---

### 4.10 `chart_symbol` — تغییر سمبل/تایم‌فریم در چارت ثانوی

```json
{
  "type": "chart_symbol",
  "chartId": "chart_0",
  "symbol": "SOLUSDT",
  "timeframe": "4h",
  "indicators": ["rsi_14"]
}
```

| فیلد | نوع | اجباری | توضیح |
|------|-----|--------|-------|
| `chartId` | string | ✅ | `"chart_0"`, `"chart_1"`, یا `"chart_2"` |
| `symbol` | string | ✅ | سمبل جدید |
| `timeframe` | string | ❌ | تایم‌فریم جدید |
| `indicators` | string[] | ✅ | لیست key اندیکاتورهای فعال |

**عملکرد سرور:** ارسال `chart_snapshot` با `chartId` مطابق

---

### 4.11 پیام‌های رسم (Drawings)

#### `drawing_upsert` — ایجاد یا ویرایش رسم

```json
{
  "type": "drawing_upsert",
  "drawing": { "id": "d_abc123", "tool": "trendline", "points": [...] }
}
```

#### `drawing_delete` — حذف رسم

```json
{
  "type": "drawing_delete",
  "drawingId": "d_abc123"
}
```

#### `drawings_clear` — حذف همه رسم‌ها

```json
{ "type": "drawings_clear" }
```

#### `drawings` — همگام‌سازی کامل (بعد از undo/redo)

```json
{
  "type": "drawings",
  "drawings": [ ]
}
```

---

## ۵. پیام‌های سرور به کلاینت

### 5.1 `pong` — پاسخ ping

```json
{
  "type": "pong",
  "t": 1716800000000
}
```

> همان مقدار `t` که در `ping` آمده را برگردانید.

---

### 5.2 `symbols_list` — لیست سمبل‌ها

پاسخ `get_symbols`:

```json
{
  "type": "symbols_list",
  "symbols": [
    { "symbol": "BTCUSDT", "name": "Bitcoin / Tether", "type": "spot" },
    { "symbol": "ETHUSDT", "name": "Ethereum / Tether", "type": "spot" },
    { "symbol": "SOLUSDT", "name": "Solana / Tether",   "type": "spot" }
  ]
}
```

| فیلد | نوع | اجباری | توضیح |
|------|-----|--------|-------|
| `symbol` | string | ✅ | نماد — همین مقدار در تمام پیام‌های دیگر استفاده می‌شود |
| `name` | string | ❌ | نام کامل |
| `type` | string | ❌ | نوع بازار (`"spot"`, `"futures"`, `"forex"`, ...) |

---

### 5.3 `indicators_list` — لیست اندیکاتورهای موجود

پاسخ `get_indicators`:

```json
{
  "type": "indicators_list",
  "indicators": [
    {
      "key": "ema_20",
      "label": "EMA 20",
      "type": "line",
      "pane": "main",
      "paneId": "ema_20",
      "color": "#2962FF",
      "lineWidth": 2,
      "lineStyle": 0,
      "digits": 2,
      "visible": true
    },
    {
      "key": "rsi_14",
      "label": "RSI 14",
      "type": "line",
      "pane": "sub",
      "paneId": "pane_rsi_14",
      "color": "#9C27B0",
      "lineWidth": 2,
      "subPaneHeight": 120,
      "scaleMargins": { "top": 0.1, "bottom": 0.1 }
    },
    {
      "key": "volume",
      "label": "Volume",
      "type": "histogram",
      "pane": "sub",
      "paneId": "pane_volume",
      "color": "#26a69a",
      "colorPos": "#26a69a",
      "colorNeg": "#ef5350",
      "subPaneHeight": 80
    }
  ]
}
```

---

### 5.4 `snapshot` / `init` — داده اولیه چارت اصلی

**مهم‌ترین پیام.** بعد از `hello`، `symbol`، یا `timeframe` ارسال کنید.

```json
{
  "type": "snapshot",
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "digits": 2,
  "data": [
    { "time": 1715000000, "open": 62100.5, "high": 62800.0, "low": 61900.0, "close": 62500.0, "volume": 1200.5 },
    { "time": 1715003600, "open": 62500.0, "high": 63100.0, "low": 62300.0, "close": 62950.0, "volume": 980.3 }
  ],
  "definitions": [
    {
      "key": "ema_20",
      "label": "EMA 20",
      "type": "line",
      "pane": "main",
      "paneId": "ema_20",
      "color": "#2962FF",
      "lineWidth": 2
    }
  ],
  "points": {
    "ema_20": [
      { "time": 1715000000, "value": 62050.3 },
      { "time": 1715003600, "value": 62180.7 }
    ]
  },
  "drawings": []
}
```

| فیلد | نوع | اجباری | توضیح |
|------|-----|--------|-------|
| `type` | `"snapshot"` یا `"init"` | ✅ | هر دو یکسان هستند |
| `data` | OHLC[] | ✅ | آرایه کندل‌ها — حتماً به ترتیب صعودی زمانی |
| `symbol` | string | ❌ | برچسب سمبل در UI را به‌روز می‌کند |
| `timeframe` | string | ❌ | برچسب تایم‌فریم در UI را به‌روز می‌کند |
| `digits` | number | ❌ | دقت اعشار قیمت (پیش‌فرض: خودکار) |
| `definitions` | SeriesDefinition[] | ❌ | تعریف اندیکاتورهای فعال |
| `points` | Record\<string, PointData[]\> | ❌ | مقادیر اندیکاتورها (key = `definition.key`) |
| `drawings` | Drawing[] | ❌ | رسم‌های ذخیره‌شده در سرور |

---

### 5.5 `bar` / `tick` / `update` — به‌روزرسانی لحظه‌ای

هر سه نام یکسان هستند:

```json
{
  "type": "bar",
  "bar": {
    "time": 1716800000,
    "open": 67450.0,
    "high": 67600.0,
    "low": 67380.0,
    "close": 67520.0,
    "volume": 320.8
  }
}
```

**منطق کلاینت:**
- اگر `bar.time` == آخرین کندل: **آپدیت** (در جای خود)
- اگر `bar.time` > آخرین کندل: **کندل جدید** (به انتها اضافه)

---

### 5.6 `history` — پاسخ درخواست تاریخچه (چارت اصلی)

```json
{
  "type": "history",
  "data": [
    { "time": 1714900000, "open": 61000.0, "high": 61500.0, "low": 60800.0, "close": 61200.0 }
  ],
  "noMoreHistory": false
}
```

| فیلد | نوع | اجباری | توضیح |
|------|-----|--------|-------|
| `data` | OHLC[] | ✅ | کندل‌های قدیمی‌تر (`time < before`) |
| `noMoreHistory` | boolean | ❌ | اگر `true`: دیگر درخواست ارسال نمی‌شود |

> اگر `data` خالی باشد، کلاینت آن را معادل `noMoreHistory: true` می‌داند.

---

### 5.7 `definitions` — به‌روزرسانی تعریف اندیکاتورها

```json
{
  "type": "definitions",
  "definitions": [
    {
      "key": "rsi_14",
      "label": "RSI 14",
      "type": "line",
      "pane": "sub",
      "paneId": "pane_rsi_14",
      "color": "#9C27B0",
      "lineWidth": 2,
      "subPaneHeight": 120,
      "scaleMargins": { "top": 0.1, "bottom": 0.1 }
    }
  ]
}
```

---

### 5.8 `indicators` — مقادیر اندیکاتورها

```json
{
  "type": "indicators",
  "points": {
    "ema_20": [
      { "time": 1716800000, "value": 67300.5 }
    ],
    "rsi_14": [
      { "time": 1716800000, "value": 58.3 }
    ],
    "volume": [
      { "time": 1716800000, "value": 1500.0, "color": "#26a69a" }
    ]
  }
}
```

**قانون سرعت:**
- اگر آرایه **۱ عنصر** دارد: فقط آخرین نقطه را آپدیت می‌کند (O(1) — برای real-time استفاده کنید)
- اگر آرایه **بیشتر از ۱ عنصر** دارد: کل سری را جایگزین می‌کند

---

### 5.9 `chart_snapshot` — داده اولیه چارت ثانوی

```json
{
  "type": "chart_snapshot",
  "chartId": "chart_0",
  "symbol": "ETHUSDT",
  "timeframe": "15m",
  "digits": 2,
  "data": [
    { "time": 1715000000, "open": 3100.5, "high": 3150.0, "low": 3080.0, "close": 3130.0 }
  ],
  "definitions": [],
  "points": {}
}
```

> شکل یکسان `snapshot` است اما با فیلد `chartId` اضافه.

---

### 5.10 `chart_bar` — آپدیت لحظه‌ای چارت ثانوی

```json
{
  "type": "chart_bar",
  "chartId": "chart_0",
  "bar": {
    "time": 1716800000,
    "open": 3200.0,
    "high": 3210.0,
    "low": 3195.0,
    "close": 3205.0,
    "volume": 450.2
  }
}
```

---

### 5.11 `chart_history` — تاریخچه چارت ثانوی

```json
{
  "type": "chart_history",
  "chartId": "chart_0",
  "data": [
    { "time": 1714900000, "open": 3000.0, "high": 3050.0, "low": 2980.0, "close": 3020.0 }
  ],
  "noMoreHistory": false
}
```

---

### 5.12 `toast` — نوتیفیکیشن

```json
{
  "type": "toast",
  "message": "Data feed connected successfully.",
  "toastType": "success"
}
```

| `toastType` | رنگ |
|-------------|-----|
| `"info"` | آبی |
| `"success"` | سبز |
| `"warning"` | نارنجی |
| `"error"` | قرمز |

---

### 5.13 `error` — خطا

```json
{
  "type": "error",
  "message": "Symbol not found: XYZUSDT"
}
```

---

### 5.14 پیام‌های کنترل UI

سرور می‌تواند UI کلاینت را از راه دور کنترل کند:

```json
{ "type": "symbol",     "symbol": "BNBUSDT"   }
{ "type": "timeframe",  "timeframe": "4h"      }
{ "type": "chartType",  "chartType": "heikin"  }
{ "type": "magnet",     "magnet": true         }
{ "type": "fitContent"                         }
{ "type": "scrollToEnd"                        }
{
  "type": "zoomRange",
  "zoomRange": { "from": 1715000000, "to": 1716000000 }
}
{
  "type": "settings",
  "settings": {
    "backgroundColor": "#0b0e11",
    "showGrid": true,
    "showVolume": true,
    "showCrosshair": true
  }
}
```

---

### 5.15 پیام‌های رسم از سرور

```json
{ "type": "drawings",       "drawings": [ ] }
{ "type": "drawing_set",    "drawings": [ ] }
{ "type": "drawing_upsert", "drawing":  { } }
{ "type": "drawing",        "drawing":  { } }
{ "type": "drawing_delete", "drawingId": "d_abc123"       }
{ "type": "drawing_delete", "drawingIds": ["d_1", "d_2"]  }
{ "type": "drawings_clear"                                 }
```

> رسم‌های ارسال‌شده از سرور در کلاینت **قفل** هستند (کاربر نمی‌تواند آن‌ها را ویرایش کند).

---

## ۶. ساختار داده‌های مشترک

### 6.1 OHLC (کندل)

```json
{
  "time": 1716800000,
  "open": 67450.0,
  "high": 67600.0,
  "low": 67380.0,
  "close": 67520.0,
  "volume": 320.8
}
```

| فیلد | نوع | اجباری | شرط اعتبار |
|------|-----|--------|------------|
| `time` | number | ✅ | unix-second (یا میلی‌ثانیه — کلاینت هر دو را می‌پذیرد) |
| `open` | number | ✅ | عدد محدود (finite) |
| `high` | number | ✅ | `>= max(open, close)` |
| `low` | number | ✅ | `<= min(open, close)` |
| `close` | number | ✅ | عدد محدود |
| `volume` | number | ❌ | `>= 0` |

---

### 6.2 SeriesDefinition (تعریف اندیکاتور)

```json
{
  "key": "ema_20",
  "label": "EMA 20",
  "type": "line",
  "pane": "main",
  "paneId": "ema_20",
  "color": "#2962FF",
  "lineWidth": 2,
  "lineStyle": 0,
  "digits": 2,
  "visible": true,
  "subPaneHeight": 120,
  "scaleMargins": { "top": 0.1, "bottom": 0.1 }
}
```

| فیلد | نوع | اجباری | توضیح |
|------|-----|--------|-------|
| `key` | string | ✅ | کلید یکتا — در `points` استفاده می‌شود |
| `label` | string | ✅ | نام نمایشی در UI |
| `type` | string | ✅ | `"line"` / `"histogram"` / `"area"` / `"baseline"` / `"scatter"` |
| `pane` | string | ✅ | `"main"` (روی قیمت) یا `"sub"` (پنجره جداگانه) |
| `paneId` | string | ❌ | ID پنجره (اگر خالی: از `key` ساخته می‌شود) |
| `color` | string | ❌ | رنگ hex (پیش‌فرض: `"#2962FF"`) |
| `colorPos` | string | ❌ | رنگ مثبت برای histogram |
| `colorNeg` | string | ❌ | رنگ منفی برای histogram |
| `lineWidth` | number | ❌ | پهنای خط (پیش‌فرض: ۲) |
| `lineStyle` | number | ❌ | `0`=solid, `1`=dotted, `2`=dashed, `3`=large-dashed |
| `subPaneHeight` | number | ❌ | ارتفاع پنجره پایین (px، پیش‌فرض: ۱۲۰) |
| `scaleMargins` | object | ❌ | `{ "top": 0.1, "bottom": 0.1 }` — فاصله از لبه |
| `digits` | number | ❌ | دقت اعشار |
| `visible` | boolean | ❌ | پیش‌فرض: `true` |
| `baseValue` | number | ❌ | برای نوع `"baseline"` |
| `topColor` | string | ❌ | رنگ بالا برای `"area"` |
| `bottomColor` | string | ❌ | رنگ پایین برای `"area"` |

---

### 6.3 PointData (نقطه اندیکاتور)

```json
{ "time": 1716800000, "value": 67300.5 }
```

```json
{ "time": 1716800000, "value": 1500.0, "color": "#ef5350" }
```

| فیلد | نوع | اجباری | توضیح |
|------|-----|--------|-------|
| `time` | number | ✅ | unix-second |
| `value` | number | ✅ | مقدار اندیکاتور |
| `color` | string | ❌ | رنگ اختصاصی این نقطه (برای histogram رنگی) |

---

### 6.4 Drawing (شیء رسم)

```json
{
  "id": "d_1716800000_abc",
  "tool": "trendline",
  "points": [
    { "time": 1715000000, "price": 62000.0 },
    { "time": 1716000000, "price": 65000.0 }
  ],
  "paneId": "main",
  "locked": false,
  "visible": true,
  "style": {
    "color": "#F23645",
    "lineWidth": 2,
    "lineStyle": 0,
    "fillOpacity": 0.1
  }
}
```

**تعداد نقاط مورد نیاز هر ابزار:**

| ابزار | نقاط |
|-------|------|
| `horizontal`, `vertical`, `text` | ۱ |
| `trendline`, `ray`, `extended`, `arrow`, `rectangle`, `ellipse`, `fibRetracement`, `measure`, `longPosition`, `shortPosition` | ۲ |
| `parallelChannel`, `fibExtension` | ۳ |
| `polyline` | ۲+ |

---

## ۷. جریان کاری کامل

### سناریو: اتصال اولیه

```
# 1. کلاینت متصل می‌شود
CLIENT → { "type": "hello", "client": "trex-terminal", "version": "1.0.0", "protocol": "2.0.0", "initialCount": 5000 }
CLIENT → { "type": "get_symbols" }
CLIENT → { "type": "get_indicators" }

# 2. سرور اطلاعات اولیه را ارسال می‌کند
SERVER → { "type": "symbols_list",    "symbols": [...] }
SERVER → { "type": "indicators_list", "indicators": [...] }
SERVER → { "type": "snapshot",        "symbol": "BTCUSDT", "timeframe": "1h", "data": [...], "definitions": [...], "points": {...} }

# 3. به‌روزرسانی real-time
SERVER → { "type": "bar",        "bar": { "time": 1716800060, ... } }
SERVER → { "type": "indicators", "points": { "ema_20": [{ "time": 1716800060, "value": 67400.0 }] } }
```

### سناریو: تغییر سمبل

```
CLIENT → { "type": "symbol", "symbol": "ETHUSDT" }
SERVER → { "type": "snapshot", "symbol": "ETHUSDT", "data": [...], "definitions": [...], "points": {...} }
```

### سناریو: اسکرول به چپ (تاریخچه)

```
CLIENT → { "type": "history", "before": 1715000000, "count": 5000 }
SERVER → { "type": "history", "data": [...], "noMoreHistory": false }
# یا وقتی دیگر تاریخچه‌ای ندارید:
SERVER → { "type": "history", "data": [], "noMoreHistory": true }
```

---

## ۸. چارت‌های چندگانه

### 8.1 فعال شدن چیدمان چندگانه

```
CLIENT → {
  "type": "layout",
  "layout": "split2",
  "charts": [
    { "chartId": "main",    "symbol": "BTCUSDT", "timeframe": "1h",  "indicators": ["ema_20"] },
    { "chartId": "chart_0", "symbol": "ETHUSDT", "timeframe": "15m", "indicators": [] }
  ]
}

SERVER → { "type": "snapshot",       "symbol": "BTCUSDT", "data": [...] }
SERVER → { "type": "chart_snapshot", "chartId": "chart_0", "symbol": "ETHUSDT", "data": [...] }
```

### 8.2 Real-time برای چارت ثانوی

```
SERVER → { "type": "chart_bar", "chartId": "chart_0", "bar": { "time": 1716800060, ... } }
```

### 8.3 تغییر سمبل در چارت ثانوی

```
CLIENT → { "type": "chart_symbol", "chartId": "chart_0", "symbol": "SOLUSDT", "timeframe": "5m", "indicators": [] }
SERVER → { "type": "chart_snapshot", "chartId": "chart_0", "symbol": "SOLUSDT", "data": [...] }
```

### 8.4 شناسه‌های چارت

| `chartId` | توضیح |
|-----------|-------|
| `"main"` | چارت اصلی (همیشه موجود) |
| `"chart_0"` | چارت دوم (در `split2` و `grid4`) |
| `"chart_1"` | چارت سوم (در `grid4`) |
| `"chart_2"` | چارت چهارم (در `grid4`) |

---

## ۹. اندیکاتورها

### 9.1 جریان کاری اندیکاتور

```
# 1. کاربر اندیکاتور را فعال می‌کند
CLIENT → { "type": "chart_symbol", "chartId": "main", "symbol": "BTCUSDT", "timeframe": "1h", "indicators": ["ema_20", "rsi_14"] }

# 2. سرور definitions را می‌فرستد
SERVER → {
  "type": "definitions",
  "definitions": [
    { "key": "ema_20", "label": "EMA 20", "type": "line", "pane": "main", ... },
    { "key": "rsi_14", "label": "RSI 14", "type": "line", "pane": "sub",  ... }
  ]
}

# 3. سرور مقادیر را می‌فرستد
SERVER → {
  "type": "indicators",
  "points": {
    "ema_20": [ {"time": 1715000000, "value": 62100.0}, ... ],
    "rsi_14": [ {"time": 1715000000, "value": 55.3},   ... ]
  }
}

# 4. real-time — فقط یک نقطه (سریع)
SERVER → {
  "type": "indicators",
  "points": {
    "ema_20": [{"time": 1716800060, "value": 67400.0}],
    "rsi_14": [{"time": 1716800060, "value": 58.7}]
  }
}
```

### 9.2 بهترین روش ارسال اندیکاتور در snapshot

```json
{
  "type": "snapshot",
  "data": [...],
  "definitions": [
    { "key": "ema_20", "label": "EMA 20", "type": "line", "pane": "main", "color": "#2962FF" }
  ],
  "points": {
    "ema_20": [
      {"time": 1715000000, "value": 62050.0},
      {"time": 1715003600, "value": 62180.0}
    ]
  }
}
```

---

## ۱۰. سینک رسم (Drawings Sync)

```
# کاربر خط رسم می‌کند
CLIENT → { "type": "drawing_upsert", "drawing": { "id": "d_abc", "tool": "trendline", "points": [...] } }

# سرور برای کاربران دیگر (multi-user) می‌فرستد
SERVER → { "type": "drawing_upsert", "drawing": { ... } }

# کاربر رسم را حذف می‌کند
CLIENT → { "type": "drawing_delete", "drawingId": "d_abc" }

# بازگردانی رسم‌های ذخیره‌شده (هنگام اتصال)
SERVER → { "type": "drawings", "drawings": [ ... ] }
```

---

## ۱۱. قوانین اعتبارسنجی

کلاینت پیام‌ها را قبل از پردازش اعتبارسنجی می‌کند. پیام‌های ناقص به سکوت رد می‌شوند:

### کندل معتبر
- تمام OHLC باید عدد محدود (finite) باشند
- `high >= max(open, close)`
- `low <= min(open, close)`
- `volume >= 0` (اختیاری)

### نقطه اندیکاتور معتبر
- `time`: عدد محدود
- `value`: عدد محدود

### SeriesDefinition معتبر
- `key`: رشته غیرخالی
- `label`: رشته غیرخالی
- `type`: یکی از `line`, `histogram`, `area`, `baseline`, `scatter`
- `pane`: `"main"` یا `"sub"`

---

## ۱۲. مثال عملی پایتون

```python
import asyncio
import json
import time
import random
import websockets


class TrexServer:
    """سرور نمونه برای TrexTerminal — شامل تمام جریان‌های کاری پروتکل."""

    SYMBOLS = [
        {"symbol": "BTCUSDT", "name": "Bitcoin / Tether",   "type": "spot"},
        {"symbol": "ETHUSDT", "name": "Ethereum / Tether",  "type": "spot"},
        {"symbol": "SOLUSDT", "name": "Solana / Tether",    "type": "spot"},
        {"symbol": "BNBUSDT", "name": "BNB / Tether",       "type": "spot"},
    ]

    INDICATORS = [
        {
            "key": "ema_20", "label": "EMA 20",
            "type": "line",  "pane": "main", "paneId": "ema_20",
            "color": "#2962FF", "lineWidth": 2,
        },
        {
            "key": "rsi_14", "label": "RSI 14",
            "type": "line",  "pane": "sub",  "paneId": "pane_rsi_14",
            "color": "#9C27B0", "lineWidth": 2,
            "subPaneHeight": 120,
            "scaleMargins": {"top": 0.1, "bottom": 0.1},
        },
        {
            "key": "volume", "label": "Volume",
            "type": "histogram", "pane": "sub", "paneId": "pane_volume",
            "color": "#26a69a", "colorPos": "#26a69a", "colorNeg": "#ef5350",
            "subPaneHeight": 80,
        },
    ]

    BASE_PRICES = {
        "BTCUSDT": 67000.0, "ETHUSDT": 3200.0,
        "SOLUSDT": 165.0,   "BNBUSDT": 580.0,
    }

    TF_SECONDS = {
        "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
        "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800,
    }

    def __init__(self):
        self.connections: dict = {}

    # ───── entry point ─────────────────────────────────────────────────

    async def handler(self, websocket):
        print(f"[+] {websocket.remote_address} connected")
        state = {
            "symbol": "BTCUSDT", "timeframe": "1h",
            "indicators": [],
            "secondary": {},        # chartId → {symbol, timeframe, indicators}
        }
        self.connections[websocket] = state
        rt = asyncio.create_task(self.realtime_loop(websocket, state))
        try:
            async for raw in websocket:
                await self._dispatch(websocket, state, raw)
        except websockets.ConnectionClosed:
            print(f"[-] {websocket.remote_address} disconnected")
        finally:
            rt.cancel()
            self.connections.pop(websocket, None)

    # ───── dispatcher ──────────────────────────────────────────────────

    async def _dispatch(self, ws, state, raw: str):
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return
        t = msg.get("type", "")

        if t == "hello":
            proto = msg.get("protocol", "")
            if not proto.startswith("2."):
                await ws.send(json.dumps({
                    "type": "error",
                    "message": f"Protocol mismatch. Server expects 2.x, client sent {proto}",
                }))
                return
            await self.send_snapshot(ws, state["symbol"], state["timeframe"],
                                     state["indicators"],
                                     count=msg.get("initialCount", 5000))

        elif t == "ping":
            await ws.send(json.dumps({"type": "pong", "t": msg.get("t")}))

        elif t == "get_symbols":
            await ws.send(json.dumps({"type": "symbols_list", "symbols": self.SYMBOLS}))

        elif t == "get_indicators":
            await ws.send(json.dumps({"type": "indicators_list", "indicators": self.INDICATORS}))

        elif t == "symbol":
            state["symbol"] = msg["symbol"]
            await self.send_snapshot(ws, state["symbol"], state["timeframe"], state["indicators"])

        elif t == "timeframe":
            state["timeframe"] = msg["timeframe"]
            await self.send_snapshot(ws, state["symbol"], state["timeframe"], state["indicators"])

        elif t == "history":
            chart_id = msg.get("chartId")
            sym = state["secondary"].get(chart_id, {}).get("symbol", state["symbol"]) if chart_id else state["symbol"]
            tf  = state["secondary"].get(chart_id, {}).get("timeframe", state["timeframe"]) if chart_id else state["timeframe"]
            candles = self._history_page(sym, tf, msg["before"], msg.get("count", 5000))
            if chart_id:
                await ws.send(json.dumps({
                    "type": "chart_history", "chartId": chart_id,
                    "data": candles, "noMoreHistory": len(candles) == 0,
                }))
            else:
                await ws.send(json.dumps({
                    "type": "history",
                    "data": candles, "noMoreHistory": len(candles) == 0,
                }))

        elif t == "layout":
            for chart in msg.get("charts", []):
                cid  = chart["chartId"]
                sym  = chart["symbol"]
                tf   = chart["timeframe"]
                inds = chart.get("indicators", [])
                if cid == "main":
                    state.update({"symbol": sym, "timeframe": tf, "indicators": inds})
                    await self.send_snapshot(ws, sym, tf, inds)
                else:
                    state["secondary"][cid] = {"symbol": sym, "timeframe": tf, "indicators": inds}
                    await self.send_chart_snapshot(ws, cid, sym, tf, inds)

        elif t == "chart_symbol":
            cid  = msg["chartId"]
            sym  = msg["symbol"]
            tf   = msg.get("timeframe", "1h")
            inds = msg.get("indicators", [])
            if cid == "main":
                state.update({"symbol": sym, "timeframe": tf, "indicators": inds})
                await self.send_snapshot(ws, sym, tf, inds)
            else:
                state["secondary"][cid] = {"symbol": sym, "timeframe": tf, "indicators": inds}
                await self.send_chart_snapshot(ws, cid, sym, tf, inds)

        elif t == "drawing_upsert":
            pass   # ← ذخیره در دیتابیس

        elif t == "drawing_delete":
            pass   # ← حذف از دیتابیس

        elif t == "drawings_clear":
            pass   # ← پاک کردن همه

        elif t == "drawings":
            pass   # ← همگام‌سازی کامل

    # ───── snapshot helpers ────────────────────────────────────────────

    async def send_snapshot(self, ws, symbol, timeframe, indicators, count=5000):
        candles = self._gen_candles(symbol, timeframe, count)
        defs, pts = self._build_indicators(symbol, indicators, candles)
        await ws.send(json.dumps({
            "type": "snapshot",
            "symbol": symbol, "timeframe": timeframe,
            "digits": self._digits(symbol),
            "data": candles,
            "definitions": defs, "points": pts,
            "drawings": [],
        }))

    async def send_chart_snapshot(self, ws, chart_id, symbol, timeframe, indicators):
        candles = self._gen_candles(symbol, timeframe, 5000)
        defs, pts = self._build_indicators(symbol, indicators, candles)
        await ws.send(json.dumps({
            "type": "chart_snapshot",
            "chartId": chart_id,
            "symbol": symbol, "timeframe": timeframe,
            "digits": self._digits(symbol),
            "data": candles,
            "definitions": defs, "points": pts,
        }))

    # ───── realtime loop ───────────────────────────────────────────────

    async def realtime_loop(self, ws, state):
        while True:
            await asyncio.sleep(1)
            now = int(time.time())
            try:
                # چارت اصلی
                tf_sec = self.TF_SECONDS.get(state["timeframe"], 3600)
                bar    = self._make_bar(state["symbol"], now, tf_sec)
                await ws.send(json.dumps({"type": "bar", "bar": bar}))

                # اندیکاتورهای فعال چارت اصلی
                if state["indicators"]:
                    pts = self._realtime_pts(state["indicators"], bar["time"], bar["close"])
                    if pts:
                        await ws.send(json.dumps({"type": "indicators", "points": pts}))

                # چارت‌های ثانوی
                for cid, info in state["secondary"].items():
                    tf2    = self.TF_SECONDS.get(info["timeframe"], 3600)
                    bar2   = self._make_bar(info["symbol"], now, tf2)
                    await ws.send(json.dumps({"type": "chart_bar", "chartId": cid, "bar": bar2}))

            except websockets.ConnectionClosed:
                break

    # ───── data generators ─────────────────────────────────────────────

    def _gen_candles(self, symbol, timeframe, count=500):
        tf_sec = self.TF_SECONDS.get(timeframe, 3600)
        now_ts = (int(time.time()) // tf_sec) * tf_sec
        price  = self.BASE_PRICES.get(symbol, 100.0) * 0.85
        out    = []
        for i in range(count):
            ts     = now_ts - (count - 1 - i) * tf_sec
            ch     = price * random.uniform(-0.015, 0.015)
            o, c   = price, round(price + ch, self._digits(symbol))
            h      = round(max(o, c) * random.uniform(1.001, 1.008), self._digits(symbol))
            l      = round(min(o, c) * random.uniform(0.992, 0.999), self._digits(symbol))
            out.append({"time": ts, "open": round(o, self._digits(symbol)),
                        "high": h, "low": l, "close": c,
                        "volume": round(random.uniform(100, 2000), 2)})
            price = c
        return out

    def _history_page(self, symbol, timeframe, before, count):
        tf_sec  = self.TF_SECONDS.get(timeframe, 3600)
        end_ts  = before - tf_sec
        start   = end_ts - count * tf_sec
        if start < 1_000_000_000:
            return []           # قبل از سال ۲۰۰۱ — تاریخچه‌ای وجود ندارد
        price   = self.BASE_PRICES.get(symbol, 100.0) * 0.70
        out     = []
        for i in range(count):
            ts  = start + i * tf_sec
            if ts >= before:
                break
            ch  = price * random.uniform(-0.012, 0.012)
            o   = price
            c   = round(price + ch, self._digits(symbol))
            h   = round(max(o, c) * 1.004, self._digits(symbol))
            l   = round(min(o, c) * 0.996, self._digits(symbol))
            out.append({"time": ts, "open": round(o, self._digits(symbol)),
                        "high": h, "low": l, "close": c,
                        "volume": round(random.uniform(50, 1500), 2)})
            price = c
        return out

    def _make_bar(self, symbol, now, tf_sec):
        base   = self.BASE_PRICES.get(symbol, 100.0)
        bt     = (now // tf_sec) * tf_sec
        ch     = base * random.uniform(-0.002, 0.002)
        c      = round(base + ch, self._digits(symbol))
        return {
            "time": bt,
            "open": round(base, self._digits(symbol)),
            "high": round(max(base, c) * 1.0005, self._digits(symbol)),
            "low":  round(min(base, c) * 0.9995, self._digits(symbol)),
            "close": c,
            "volume": round(random.uniform(100, 600), 2),
        }

    def _build_indicators(self, symbol, indicator_keys, candles):
        closes = [c["close"] for c in candles]
        times  = [c["time"]  for c in candles]
        defs, pts = [], {}
        for key in indicator_keys:
            defn = next((i for i in self.INDICATORS if i["key"] == key), None)
            if not defn:
                continue
            defs.append(defn)
            if key == "ema_20":
                vals = self._ema(closes, 20)
                pts[key] = [{"time": times[i], "value": round(vals[i], 2)}
                            for i in range(len(times)) if vals[i] is not None]
            elif key == "rsi_14":
                vals = self._rsi(closes, 14)
                pts[key] = [{"time": times[i], "value": round(vals[i], 2)}
                            for i in range(len(times)) if vals[i] is not None]
            elif key == "volume":
                pts[key] = [{
                    "time": candles[i]["time"],
                    "value": candles[i].get("volume", 0),
                    "color": "#26a69a" if candles[i]["close"] >= candles[i]["open"] else "#ef5350",
                } for i in range(len(candles))]
        return defs, pts

    def _realtime_pts(self, indicator_keys, bar_time, close):
        pts = {}
        for key in indicator_keys:
            if key == "ema_20":
                pts[key] = [{"time": bar_time, "value": round(close * 0.999, 2)}]
            elif key == "rsi_14":
                pts[key] = [{"time": bar_time, "value": round(50 + random.uniform(-15, 15), 2)}]
        return pts

    # ───── utils ───────────────────────────────────────────────────────

    def _digits(self, symbol):
        p = self.BASE_PRICES.get(symbol, 100.0)
        return 2 if p >= 1000 else (3 if p >= 10 else 5)

    @staticmethod
    def _ema(closes, period):
        result, k = [None] * len(closes), 2 / (period + 1)
        ema = None
        for i, c in enumerate(closes):
            if ema is None:
                if i >= period - 1:
                    ema = sum(closes[i - period + 1: i + 1]) / period
                    result[i] = ema
            else:
                ema = c * k + ema * (1 - k)
                result[i] = ema
        return result

    @staticmethod
    def _rsi(closes, period=14):
        result = [None] * len(closes)
        if len(closes) < period + 1:
            return result
        gains  = [max(closes[i] - closes[i-1], 0) for i in range(1, len(closes))]
        losses = [max(closes[i-1] - closes[i], 0) for i in range(1, len(closes))]
        ag = sum(gains[:period])  / period
        al = sum(losses[:period]) / period
        for i in range(period, len(closes)):
            result[i] = 100.0 if al == 0 else round(100 - 100 / (1 + ag / al), 2)
            if i < len(gains):
                ag = (ag * (period - 1) + gains[i])  / period
                al = (al * (period - 1) + losses[i]) / period
        return result


async def main():
    server = TrexServer()
    host, port = "0.0.0.0", 8765
    print(f"TrexTerminal WebSocket Server → ws://localhost:{port}")
    async with websockets.serve(server.handler, host, port):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
```

### نصب و راه‌اندازی

```bash
pip install websockets
python server.py
```

سپس TrexTerminal را باز کنید، حالت **Server** را انتخاب کنید و آدرس `ws://localhost:8765` را وارد کنید.

---

## خلاصه مرجع سریع

```
اتصال جدید:      hello + get_symbols + get_indicators  →  symbols_list + indicators_list + snapshot
تغییر سمبل:      symbol                                →  snapshot
تغییر تایم‌فریم:  timeframe                             →  snapshot
اسکرول چپ:       history (before, count)               →  history (data, noMoreHistory)
چیدمان چندگانه:  layout (charts[])                     →  snapshot + chart_snapshot[]
چارت ثانوی:      chart_symbol (chartId, symbol, tf)    →  chart_snapshot
Real-time:        (بدون درخواست)                       →  bar + indicators
Ping/Pong:        ping                                  →  pong
```
