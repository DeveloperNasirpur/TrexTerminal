# TrexTerminal — WebSocket Server Protocol

TrexTerminal is a **pure client** — it renders charts exactly as the server sends them.  
All candles, indicator values, and drawings come from your server over a single WebSocket connection.

**Protocol version:** `2.0.0`

---

## Table of Contents

1. [Technical Requirements](#1-technical-requirements)
2. [Connection Lifecycle](#2-connection-lifecycle)
3. [Protocol Versioning](#3-protocol-versioning)
4. [Client → Server Messages](#4-client--server-messages)
5. [Server → Client Messages](#5-server--client-messages)
6. [Shared Data Structures](#6-shared-data-structures)
7. [Complete Workflow Examples](#7-complete-workflow-examples)
8. [Multi-Chart Layout](#8-multi-chart-layout)
9. [Indicators](#9-indicators)
10. [Drawing Sync](#10-drawing-sync)
11. [Validation Rules](#11-validation-rules)
12. [Backtest Messages](#12-backtest-messages)
13. [Reference Server (Python)](#13-reference-server-python)

---

## 1. Technical Requirements

| Property | Value |
|----------|-------|
| Protocol | WebSocket (`ws://` or `wss://`) |
| Message format | Plain JSON (text frame) |
| Ping/Pong | Application-level (`type: "ping"` → `type: "pong"`) |
| Protocol version | `"2.0.0"` |

---

## 2. Connection Lifecycle

```
CLIENT                                SERVER
  │                                     │
  ├─ WebSocket Handshake ─────────────▶│
  │◀─ Connection Accepted ──────────────┤
  │                                     │
  ├─ hello ───────────────────────────▶│  ← must be the first message
  ├─ get_symbols ─────────────────────▶│
  ├─ get_indicators ──────────────────▶│
  │                                     │
  │◀─ symbols_list ─────────────────────┤
  │◀─ indicators_list ──────────────────┤
  │◀─ snapshot ─────────────────────────┤  ← initial chart data
  │                                     │
  │  ── normal operation ────────────── │
  │                                     │
  │◀─ bar ──────────────────────────────┤  ← realtime candle updates
  │◀─ indicators ───────────────────────┤  ← indicator values
  │                                     │
  ├─ ping ────────────────────────────▶│  ← every ~15 seconds
  │◀─ pong ─────────────────────────────┤
  │                                     │
  │  ── user actions ──────────────────│
  │                                     │
  ├─ symbol ──────────────────────────▶│  ← switch symbol
  │◀─ snapshot ─────────────────────────┤
  │                                     │
  ├─ timeframe ───────────────────────▶│  ← switch timeframe
  │◀─ snapshot ─────────────────────────┤
  │                                     │
  ├─ history ─────────────────────────▶│  ← scroll left
  │◀─ history ──────────────────────────┤  ← older bars
```

---

## 3. Protocol Versioning

```
MAJOR.MINOR.PATCH
```

- **MAJOR** change: breaking — server should close the connection if MAJOR doesn't match
- **MINOR** change: additive, backward-compatible
- **PATCH** change: bug fix, no protocol change
- Current version: `"2.0.0"`

---

## 4. Client → Server Messages

### 4.1 `hello` — Handshake

**Must be the first message the client sends.**

```json
{
  "type": "hello",
  "client": "trex-terminal",
  "version": "1.0.0",
  "protocol": "2.0.0",
  "initialCount": 5000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"hello"` | ✅ | |
| `client` | string | ✅ | Client identifier |
| `version` | string | ✅ | App version |
| `protocol` | string | ✅ | Protocol version (`"2.0.0"`) |
| `initialCount` | number | ❌ | How many candles to request (default: 5000) |

**Server action:** Validate `protocol` MAJOR version, then send `snapshot` for the default symbol/timeframe.

---

### 4.2 `ping` — Keepalive

```json
{ "type": "ping", "t": 1716800000000 }
```

**Server action:** Immediately reply with `pong` echoing the same `t`.

---

### 4.3 `get_symbols`

```json
{ "type": "get_symbols" }
```

**Server action:** Send `symbols_list`.

---

### 4.4 `get_indicators`

```json
{ "type": "get_indicators" }
```

**Server action:** Send `indicators_list`.

---

### 4.5 `symbol` — Switch symbol (main chart)

```json
{ "type": "symbol", "symbol": "BTCUSDT" }
```

**Server action:** Send `snapshot` for the new symbol.

---

### 4.6 `timeframe` — Switch timeframe (main chart)

```json
{ "type": "timeframe", "timeframe": "1h" }
```

Common timeframe strings: `"1m"` `"3m"` `"5m"` `"15m"` `"30m"` `"1h"` `"4h"` `"1d"` `"1w"` `"1M"`

**Server action:** Send `snapshot` for the new timeframe.

---

### 4.7 `history` — Request older bars

Sent when the user scrolls left and reaches the left edge of the chart.

```json
{
  "type": "history",
  "before": 1716000000,
  "count": 5000,
  "chartId": "chart_0"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `before` | number | ✅ | Unix seconds — return bars where `time < before` |
| `count` | number | ✅ | How many bars (usually 5000) |
| `chartId` | string | ❌ | If present: secondary chart ID (`"chart_0"`, `"chart_1"`, `"chart_2"`) |

**Server action:** Send `history` (or `chart_history` if `chartId` is set). Set `noMoreHistory: true` when no older data exists.

---

### 4.8 `chartType` — Inform server of chart type change

```json
{ "type": "chartType", "chartType": "heikin" }
```

Valid values: `"candles"` `"heikin"` `"line"` `"area"` `"bar"` `"baseline"` `"hlc"`

This is informational — the server may optionally change the OHLCV it sends (e.g. Heikin-Ashi computed OHLC).

---

### 4.9 `layout` — Multi-chart layout change

```json
{
  "type": "layout",
  "layout": "split2",
  "charts": [
    { "chartId": "main",    "symbol": "BTCUSDT", "timeframe": "1h",  "indicators": ["ema_20"] },
    { "chartId": "chart_0", "symbol": "ETHUSDT", "timeframe": "15m", "indicators": [] }
  ]
}
```

| `layout` value | Description |
|----------------|-------------|
| `"single"` | Main chart only |
| `"split2"` | Two charts side by side |
| `"grid4"` | Four charts (2×2) |

**Server action:** For `"main"` → send `snapshot`. For `"chart_0/1/2"` → send `chart_snapshot` with matching `chartId`.

---

### 4.10 `chart_symbol` — Switch symbol/timeframe in a secondary chart

```json
{
  "type": "chart_symbol",
  "chartId": "chart_0",
  "symbol": "SOLUSDT",
  "timeframe": "4h",
  "indicators": ["rsi_14"]
}
```

**Server action:** Send `chart_snapshot` with the matching `chartId`.

---

### 4.11 Drawing messages (client → server)

When the user draws on the chart the client notifies the server so it can persist drawings:

```json
{ "type": "drawing_upsert", "drawing": { "id": "d_abc", "tool": "trendline", "points": [...] } }
{ "type": "drawing_delete",  "drawingId": "d_abc" }
{ "type": "drawings_clear" }
{ "type": "drawings",        "drawings": [] }
```

---

## 5. Server → Client Messages

### 5.1 `pong`

```json
{ "type": "pong", "t": 1716800000000 }
```

Echo the same `t` from `ping`.

---

### 5.2 `symbols_list`

```json
{
  "type": "symbols_list",
  "symbols": [
    { "symbol": "BTCUSDT", "name": "Bitcoin / Tether",  "type": "spot" },
    { "symbol": "ETHUSDT", "name": "Ethereum / Tether", "type": "spot" }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `symbol` | ✅ | Used in all other messages |
| `name` | ❌ | Display name |
| `type` | ❌ | Market type (`"spot"`, `"futures"`, `"forex"`, …) |

---

### 5.3 `indicators_list`

```json
{
  "type": "indicators_list",
  "indicators": [
    { "key": "ema_20", "label": "EMA 20",  "type": "line", "pane": "main", "color": "#2962FF", "lineWidth": 2 },
    { "key": "rsi_14", "label": "RSI 14",  "type": "line", "pane": "sub",  "color": "#9C27B0", "subPaneHeight": 120 },
    { "key": "volume", "label": "Volume",  "type": "histogram", "pane": "sub", "colorPos": "#26a69a", "colorNeg": "#ef5350", "subPaneHeight": 80 }
  ]
}
```

See [SeriesDefinition](#62-seriesdefinition) for the full field list.

---

### 5.4 `snapshot` — Initial chart data

The most important message. Send after `hello`, `symbol`, or `timeframe`.

```json
{
  "type": "snapshot",
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "digits": 2,
  "data": [
    { "time": 1715000000, "open": 62100.5, "high": 62800.0, "low": 61900.0, "close": 62500.0, "volume": 1200.5 }
  ],
  "definitions": [
    { "key": "ema_20", "label": "EMA 20", "type": "line", "pane": "main", "color": "#2962FF" }
  ],
  "points": {
    "ema_20": [
      { "time": 1715000000, "value": 62050.3 }
    ]
  },
  "drawings": []
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `data` | ✅ | OHLCV array — must be in ascending time order |
| `symbol` | ❌ | Updates the symbol label in the UI |
| `timeframe` | ❌ | Updates the timeframe label |
| `digits` | ❌ | Price decimal precision (auto-detected if omitted) |
| `definitions` | ❌ | Active indicator series definitions |
| `points` | ❌ | Historical indicator values keyed by `definition.key` |
| `drawings` | ❌ | Server-persisted drawings to restore |

> `"init"` is an alias for `"snapshot"` — both are accepted.

---

### 5.5 `bar` — Realtime candle update

```json
{
  "type": "bar",
  "bar": { "time": 1716800000, "open": 67450.0, "high": 67600.0, "low": 67380.0, "close": 67520.0, "volume": 320.8 }
}
```

**Client logic:**
- If `bar.time == last candle time` → **update** the last bar in place
- If `bar.time > last candle time` → **append** as a new bar

> `"tick"` and `"update"` are aliases for `"bar"`.

---

### 5.6 `history` — Response to history request

```json
{
  "type": "history",
  "data": [
    { "time": 1714900000, "open": 61000.0, "high": 61500.0, "low": 60800.0, "close": 61200.0 }
  ],
  "noMoreHistory": false
}
```

Set `noMoreHistory: true` (or return an empty `data` array) when no older bars exist — the client stops sending further requests.

---

### 5.7 `definitions` — Update indicator definitions

Send this when new indicators are activated at runtime:

```json
{
  "type": "definitions",
  "definitions": [
    { "key": "rsi_14", "label": "RSI 14", "type": "line", "pane": "sub", "color": "#9C27B0", "subPaneHeight": 120 }
  ]
}
```

---

### 5.8 `indicators` — Indicator values

```json
{
  "type": "indicators",
  "points": {
    "ema_20": [ { "time": 1716800000, "value": 67300.5 } ],
    "rsi_14": [ { "time": 1716800000, "value": 58.3 } ],
    "volume":  [ { "time": 1716800000, "value": 1500.0, "color": "#26a69a" } ]
  }
}
```

**Fast-path rule:**
- Array with **1 element** → update only the last point (O(1) — use this for realtime)
- Array with **more than 1 element** → replace the entire series

---

### 5.9 `chart_snapshot` — Secondary chart data

```json
{
  "type": "chart_snapshot",
  "chartId": "chart_0",
  "symbol": "ETHUSDT",
  "timeframe": "15m",
  "data": [...],
  "definitions": [],
  "points": {}
}
```

Same shape as `snapshot` with the addition of `chartId`.

---

### 5.10 `chart_bar` — Secondary chart realtime update

```json
{
  "type": "chart_bar",
  "chartId": "chart_0",
  "bar": { "time": 1716800000, "open": 3200.0, "high": 3210.0, "low": 3195.0, "close": 3205.0, "volume": 450.2 }
}
```

---

### 5.11 `chart_history` — Secondary chart history

```json
{
  "type": "chart_history",
  "chartId": "chart_0",
  "data": [...],
  "noMoreHistory": false
}
```

---

### 5.12 `toast` — Notification banner

```json
{ "type": "toast", "message": "Data feed connected.", "toastType": "success" }
```

| `toastType` | Color |
|-------------|-------|
| `"info"` | Blue |
| `"success"` | Green |
| `"warning"` | Orange |
| `"error"` | Red |

---

### 5.13 `error`

```json
{ "type": "error", "message": "Symbol not found: XYZUSDT" }
```

---

### 5.14 Remote UI control

The server can control the client's UI state:

```json
{ "type": "symbol",     "symbol":    "BNBUSDT"  }
{ "type": "timeframe",  "timeframe": "4h"        }
{ "type": "chartType",  "chartType": "heikin"    }
{ "type": "magnet",     "magnet":    true         }
{ "type": "fitContent"                            }
{ "type": "scrollToEnd"                           }
{ "type": "zoomRange",  "zoomRange": { "from": 1715000000, "to": 1716000000 } }
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

### 5.15 Server-pushed drawings

```json
{ "type": "drawings",       "drawings":  [ ... ] }
{ "type": "drawing_upsert", "drawing":   { ... } }
{ "type": "drawing_delete", "drawingId":  "d_abc" }
{ "type": "drawing_delete", "drawingIds": ["d_1", "d_2"] }
{ "type": "drawings_clear"               }
```

Server-pushed drawings are rendered **locked** — the user cannot move or delete them. This is the mechanism used by BackTest for trade markers.

---

## 6. Shared Data Structures

### 6.1 OHLCV (candle)

```json
{
  "time":   1716800000,
  "open":   67450.0,
  "high":   67600.0,
  "low":    67380.0,
  "close":  67520.0,
  "volume": 320.8
}
```

| Field | Required | Validation |
|-------|----------|-----------|
| `time` | ✅ | Unix seconds (ms also accepted — auto-detected) |
| `open` | ✅ | Finite number |
| `high` | ✅ | `>= max(open, close)` |
| `low` | ✅ | `<= min(open, close)` |
| `close` | ✅ | Finite number |
| `volume` | ❌ | `>= 0` |

---

### 6.2 SeriesDefinition

```json
{
  "key":           "ema_20",
  "label":         "EMA 20",
  "type":          "line",
  "pane":          "main",
  "paneId":        "ema_20",
  "color":         "#2962FF",
  "lineWidth":     2,
  "lineStyle":     0,
  "digits":        2,
  "visible":       true,
  "subPaneHeight": 120,
  "scaleMargins":  { "top": 0.1, "bottom": 0.1 }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `key` | ✅ | Unique key — used in `points` objects |
| `label` | ✅ | Display name |
| `type` | ✅ | `"line"` / `"histogram"` / `"area"` / `"baseline"` / `"scatter"` |
| `pane` | ✅ | `"main"` (overlaid on price) or `"sub"` (separate pane) |
| `paneId` | ❌ | Pane ID (derived from `key` if omitted) |
| `color` | ❌ | Hex color (default: `"#2962FF"`) |
| `colorPos` | ❌ | Positive color for histogram |
| `colorNeg` | ❌ | Negative color for histogram |
| `lineWidth` | ❌ | Stroke width (default: 2) |
| `lineStyle` | ❌ | `0`=solid `1`=dotted `2`=dashed `3`=large-dashed |
| `subPaneHeight` | ❌ | Sub-pane height in px (default: 120) |
| `scaleMargins` | ❌ | `{ "top": 0.1, "bottom": 0.1 }` |
| `digits` | ❌ | Decimal precision for value labels |
| `visible` | ❌ | Default: `true` |
| `baseValue` | ❌ | For `"baseline"` type |
| `topColor` | ❌ | For `"area"` type |
| `bottomColor` | ❌ | For `"area"` type |

---

### 6.3 PointData

```json
{ "time": 1716800000, "value": 67300.5 }
{ "time": 1716800000, "value": 1500.0,  "color": "#ef5350" }
```

| Field | Required | Description |
|-------|----------|-------------|
| `time` | ✅ | Unix seconds |
| `value` | ✅ | Indicator value |
| `color` | ❌ | Per-point color override (useful for colored histograms) |

---

### 6.4 Drawing

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

**Required points per tool:**

| Tool | Points |
|------|--------|
| `horizontal`, `vertical`, `text` | 1 |
| `trendline`, `ray`, `extended`, `arrow`, `rectangle`, `ellipse`, `fibRetracement`, `measure`, `longPosition`, `shortPosition` | 2 |
| `parallelChannel`, `fibExtension` | 3 |
| `polyline` | 2+ |

---

## 7. Complete Workflow Examples

### Initial connection

```
CLIENT → { "type": "hello",           "client": "trex-terminal", "protocol": "2.0.0", "initialCount": 5000 }
CLIENT → { "type": "get_symbols" }
CLIENT → { "type": "get_indicators" }

SERVER → { "type": "symbols_list",    "symbols": [...] }
SERVER → { "type": "indicators_list", "indicators": [...] }
SERVER → { "type": "snapshot",        "symbol": "BTCUSDT", "timeframe": "1h", "data": [...], "definitions": [...], "points": {...} }

SERVER → { "type": "bar",        "bar": { "time": 1716800060, ... } }
SERVER → { "type": "indicators", "points": { "ema_20": [{ "time": 1716800060, "value": 67400.0 }] } }
```

### Symbol change

```
CLIENT → { "type": "symbol", "symbol": "ETHUSDT" }
SERVER → { "type": "snapshot", "symbol": "ETHUSDT", "data": [...], ... }
```

### History scroll

```
CLIENT → { "type": "history", "before": 1715000000, "count": 5000 }
SERVER → { "type": "history", "data": [...], "noMoreHistory": false }

CLIENT → { "type": "history", "before": 1713000000, "count": 5000 }
SERVER → { "type": "history", "data": [],   "noMoreHistory": true }
```

---

## 8. Multi-Chart Layout

### Activate layout

```
CLIENT → {
  "type": "layout", "layout": "split2",
  "charts": [
    { "chartId": "main",    "symbol": "BTCUSDT", "timeframe": "1h",  "indicators": ["ema_20"] },
    { "chartId": "chart_0", "symbol": "ETHUSDT", "timeframe": "15m", "indicators": [] }
  ]
}

SERVER → { "type": "snapshot",       "symbol": "BTCUSDT", "data": [...] }
SERVER → { "type": "chart_snapshot", "chartId": "chart_0", "symbol": "ETHUSDT", "data": [...] }
```

### Realtime for secondary chart

```
SERVER → { "type": "chart_bar", "chartId": "chart_0", "bar": { "time": 1716800060, ... } }
```

### Chart IDs

| `chartId` | Description |
|-----------|-------------|
| `"main"` | Always present |
| `"chart_0"` | Second chart (split2 / grid4) |
| `"chart_1"` | Third chart (grid4) |
| `"chart_2"` | Fourth chart (grid4) |

---

## 9. Indicators

### Workflow

```
# 1. Client requests indicators for a symbol
CLIENT → { "type": "chart_symbol", "chartId": "main", "symbol": "BTCUSDT",
           "timeframe": "1h", "indicators": ["ema_20", "rsi_14"] }

# 2. Server sends definitions
SERVER → { "type": "definitions", "definitions": [
  { "key": "ema_20", "label": "EMA 20", "type": "line", "pane": "main" },
  { "key": "rsi_14", "label": "RSI 14", "type": "line", "pane": "sub" }
]}

# 3. Server sends historical values
SERVER → { "type": "indicators", "points": {
  "ema_20": [ {"time": 1715000000, "value": 62100.0}, ... ],
  "rsi_14": [ {"time": 1715000000, "value": 55.3},   ... ]
}}

# 4. Realtime — single point per series (fast path)
SERVER → { "type": "indicators", "points": {
  "ema_20": [{"time": 1716800060, "value": 67400.0}],
  "rsi_14": [{"time": 1716800060, "value": 58.7}]
}}
```

### Including indicators in snapshot

The recommended approach — send definitions and historical values together in the initial snapshot so the chart is fully populated immediately:

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

## 10. Drawing Sync

```
# User draws on the chart
CLIENT → { "type": "drawing_upsert", "drawing": { "id": "d_abc", "tool": "trendline", "points": [...] } }
# Server persists it, then broadcasts to other clients (multi-user)
SERVER → { "type": "drawing_upsert", "drawing": { ... } }

# User deletes a drawing
CLIENT → { "type": "drawing_delete", "drawingId": "d_abc" }

# On reconnect — restore saved drawings
SERVER → { "type": "drawings", "drawings": [ ... ] }
```

Server-pushed drawings are **locked** in the client — users can view them but cannot move or delete them. Use this for programmatic drawings (trade markers, support levels, etc.).

---

## 11. Validation Rules

The client validates messages silently — invalid messages are ignored:

### Valid candle
- All OHLC values must be finite numbers
- `high >= max(open, close)`
- `low  <= min(open, close)`
- `volume >= 0` (optional)

### Valid indicator point
- `time`: finite number
- `value`: finite number

### Valid SeriesDefinition
- `key`: non-empty string
- `label`: non-empty string
- `type`: one of `"line"` `"histogram"` `"area"` `"baseline"` `"scatter"`
- `pane`: `"main"` or `"sub"`

### Valid Drawing
- Tool must be a recognized tool name
- Must have the minimum number of `points` for that tool (see table in §6.4)

---

## 12. Backtest Messages

These messages are sent by [BackTest](https://github.com/DeveloperNasirpur/BackTest) when `broadcast=True`. They update the BtPanel at the bottom of the terminal.

### `bt_progress` — Progress update

```json
{ "type": "bt_progress", "current": 5000, "total": 10000, "pct": 50.0 }
```

### `bt_state` — Live account state

```json
{
  "type": "bt_state",
  "balance": 10124.50,
  "margin_used": 200.00,
  "unrealized_pnl": 14.20,
  "equity": 10338.70,
  "positions": [
    {
      "id": 1, "symbol": "BTCUSDT", "side": "long",
      "entry": 67450.0, "mark": 67520.0,
      "margin": 200.0, "leverage": 5,
      "pnl": 0.00104, "pnl_usdt": 14.20, "pnl_pct": 0.52,
      "stop_price": 66500.0, "take_profit": 69000.0,
      "open_time": "2024-05-01 10:00", "bars": 12
    }
  ],
  "orders": [],
  "trade_history": []
}
```

### `bt_result` — Final statistics

```json
{
  "type": "bt_result",
  "initial_balance": 10000.00,
  "final_balance":   11243.60,
  "return_pct":      12.44,
  "total_trades":    87,
  "winning_trades":  51,
  "losing_trades":   36,
  "win_rate":        58.6,
  "profit_factor":   1.82,
  "risk_reward":     1.23,
  "total_pnl_usdt":  1243.60,
  "gross_profit":    2468.30,
  "gross_loss":     -1224.70,
  "largest_win":     312.00,
  "largest_loss":    -89.50,
  "avg_win":          48.40,
  "avg_loss":        -34.02,
  "max_drawdown_usdt": 620.40,
  "max_drawdown_pct":    6.20,
  "equity_curve": [10050.0, 10120.0, ...]
}
```

### `bt_playback` — Playback control (client → server)

```json
{ "type": "bt_playback", "action": "pause"  }
{ "type": "bt_playback", "action": "resume" }
{ "type": "bt_playback", "action": "speed",  "speed": 60.0 }
{ "type": "bt_playback", "action": "stop"   }
```

### `bt_playback_state` — Sync playback state (server → client)

```json
{ "type": "bt_playback_state", "paused": false, "speed": 1.0 }
```

---

## 13. Reference Server (Python)

A minimal server implementing the full protocol — useful as a starting point or for testing:

```python
import asyncio, json, time, random
import websockets


class TrexServer:
    """Minimal Protocol 2.0.0 server compatible with TrexTerminal."""

    SYMBOLS = [
        {"symbol": "BTCUSDT", "name": "Bitcoin / Tether",  "type": "spot"},
        {"symbol": "ETHUSDT", "name": "Ethereum / Tether", "type": "spot"},
    ]

    INDICATORS = [
        {"key": "ema_20", "label": "EMA 20", "type": "line", "pane": "main", "color": "#2962FF", "lineWidth": 2},
        {"key": "rsi_14", "label": "RSI 14", "type": "line", "pane": "sub",  "color": "#9C27B0", "subPaneHeight": 120},
    ]

    TF_SECONDS = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}
    BASE = {"BTCUSDT": 67000.0, "ETHUSDT": 3200.0}

    def __init__(self):
        self.conns = {}

    async def handler(self, ws):
        state = {"symbol": "BTCUSDT", "timeframe": "1h", "indicators": [], "secondary": {}}
        self.conns[ws] = state
        rt = asyncio.create_task(self._realtime(ws, state))
        try:
            async for raw in ws:
                await self._dispatch(ws, state, raw)
        except websockets.ConnectionClosed:
            pass
        finally:
            rt.cancel()
            self.conns.pop(ws, None)

    async def _dispatch(self, ws, state, raw):
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return
        t = msg.get("type", "")

        if t == "hello":
            if not msg.get("protocol", "").startswith("2."):
                await ws.send(json.dumps({"type": "error", "message": "Protocol mismatch — expected 2.x"}))
                return
            await self._snapshot(ws, state["symbol"], state["timeframe"], msg.get("initialCount", 5000))

        elif t == "ping":
            await ws.send(json.dumps({"type": "pong", "t": msg.get("t")}))

        elif t == "get_symbols":
            await ws.send(json.dumps({"type": "symbols_list", "symbols": self.SYMBOLS}))

        elif t == "get_indicators":
            await ws.send(json.dumps({"type": "indicators_list", "indicators": self.INDICATORS}))

        elif t == "symbol":
            state["symbol"] = msg["symbol"]
            await self._snapshot(ws, state["symbol"], state["timeframe"])

        elif t == "timeframe":
            state["timeframe"] = msg["timeframe"]
            await self._snapshot(ws, state["symbol"], state["timeframe"])

        elif t == "history":
            cid    = msg.get("chartId")
            sym    = state["secondary"].get(cid, state)["symbol"] if cid else state["symbol"]
            tf     = state["secondary"].get(cid, state)["timeframe"] if cid else state["timeframe"]
            data   = self._gen_bars(sym, tf, msg["before"], msg.get("count", 5000))
            mtype  = "chart_history" if cid else "history"
            reply  = {"type": mtype, "data": data, "noMoreHistory": len(data) == 0}
            if cid:
                reply["chartId"] = cid
            await ws.send(json.dumps(reply))

        elif t in ("layout", "chart_symbol"):
            charts = msg.get("charts", [{"chartId": msg.get("chartId", "main"),
                                         "symbol": msg.get("symbol", state["symbol"]),
                                         "timeframe": msg.get("timeframe", state["timeframe"])}])
            for c in charts:
                cid, sym, tf = c["chartId"], c["symbol"], c.get("timeframe", "1h")
                if cid == "main":
                    state.update({"symbol": sym, "timeframe": tf})
                    await self._snapshot(ws, sym, tf)
                else:
                    state["secondary"][cid] = {"symbol": sym, "timeframe": tf}
                    bars = self._make_bars(sym, tf, 5000)
                    await ws.send(json.dumps({"type": "chart_snapshot", "chartId": cid,
                                             "symbol": sym, "timeframe": tf, "data": bars,
                                             "definitions": [], "points": {}}))

    async def _snapshot(self, ws, symbol, timeframe, count=5000):
        bars = self._make_bars(symbol, timeframe, count)
        await ws.send(json.dumps({
            "type": "snapshot", "symbol": symbol, "timeframe": timeframe,
            "data": bars, "definitions": [], "points": {}, "drawings": [],
        }))

    async def _realtime(self, ws, state):
        while True:
            await asyncio.sleep(1)
            now = int(time.time())
            try:
                tf_s = self.TF_SECONDS.get(state["timeframe"], 3600)
                bar  = self._bar(state["symbol"], now, tf_s)
                await ws.send(json.dumps({"type": "bar", "bar": bar}))
                for cid, info in state["secondary"].items():
                    b2 = self._bar(info["symbol"], now, self.TF_SECONDS.get(info["timeframe"], 3600))
                    await ws.send(json.dumps({"type": "chart_bar", "chartId": cid, "bar": b2}))
            except websockets.ConnectionClosed:
                break

    def _make_bars(self, symbol, timeframe, count):
        tf_s = self.TF_SECONDS.get(timeframe, 3600)
        now  = (int(time.time()) // tf_s) * tf_s
        p    = self.BASE.get(symbol, 100.0) * 0.85
        out  = []
        for i in range(count):
            ts = now - (count - 1 - i) * tf_s
            c  = round(p * (1 + random.uniform(-0.015, 0.015)), 2)
            out.append({"time": ts, "open": round(p, 2),
                        "high": round(max(p, c) * 1.003, 2), "low": round(min(p, c) * 0.997, 2),
                        "close": c, "volume": round(random.uniform(100, 2000), 2)})
            p = c
        return out

    def _gen_bars(self, symbol, timeframe, before, count):
        tf_s  = self.TF_SECONDS.get(timeframe, 3600)
        start = before - count * tf_s
        if start < 1_000_000_000:
            return []
        p = self.BASE.get(symbol, 100.0) * 0.7
        out = []
        for i in range(count):
            ts = start + i * tf_s
            if ts >= before:
                break
            c = round(p * (1 + random.uniform(-0.012, 0.012)), 2)
            out.append({"time": ts, "open": round(p, 2),
                        "high": round(max(p, c) * 1.003, 2), "low": round(min(p, c) * 0.997, 2),
                        "close": c, "volume": round(random.uniform(50, 1500), 2)})
            p = c
        return out

    def _bar(self, symbol, now, tf_s):
        base = self.BASE.get(symbol, 100.0)
        bt   = (now // tf_s) * tf_s
        c    = round(base * (1 + random.uniform(-0.002, 0.002)), 2)
        return {"time": bt, "open": round(base, 2),
                "high": round(max(base, c) * 1.0005, 2), "low": round(min(base, c) * 0.9995, 2),
                "close": c, "volume": round(random.uniform(100, 600), 2)}


async def main():
    server = TrexServer()
    print("TrexTerminal server → ws://localhost:8765")
    async with websockets.serve(server.handler, "0.0.0.0", 8765):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
```

```bash
pip install websockets
python server.py
```

Open TrexTerminal, select **Server** mode, and connect to `ws://localhost:8765`.

---

## Quick Reference

```
New connection:   hello + get_symbols + get_indicators  →  symbols_list + indicators_list + snapshot
Symbol change:    symbol                                →  snapshot
Timeframe change: timeframe                             →  snapshot
Scroll left:      history { before, count }             →  history { data, noMoreHistory }
Multi-chart:      layout { charts[] }                   →  snapshot + chart_snapshot[]
Secondary chart:  chart_symbol { chartId, symbol, tf }  →  chart_snapshot
Realtime:         (no request)                          →  bar + indicators
Keepalive:        ping                                  →  pong
```
