# TrexTerminal

**Professional trading terminal that runs in your browser — powered by your own Python data server.**

TrexTerminal is a pure client: it renders charts, indicators, drawings, and backtest results exactly as your server sends them. No data is computed in the browser. You control everything from Python.

---

## What it looks like

```
┌──────────────────────────────────────────────────────────────────────┐
│  Symbol  Timeframe  ChartType  Indicators                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ▲  BTCUSDT · 1h  ·  EMA 20  ·  RSI                               │
│   │                                                                  │
│   │        /\    /\                                                  │
│   │   /\  /  \  /  \     ← candlestick chart                        │
│   │  /  \/    \/    \                                                │
│   │                   \                                              │
│   └──────────────────────────────────────────────────────── time    │
│                                                                      │
│  [RSI sub-pane]  ─────────── 70 ──────────────────────────────      │
│                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~               │
│  ─────────────── 30 ──────────────────────────────────────          │
├──────────────────────────────────────────────────────────────────────┤
│  Positions │ Orders │ Trade History │ Assets │ Results               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  BTCUSDT LONG  entry 67,450  mark 67,520  PnL +$14.20       │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Features

| Category | What you get |
|----------|-------------|
| **Chart** | Candlestick, Heikin-Ashi, Line, Area, Bar — switchable at runtime |
| **Indicators** | Overlay and sub-pane series, multi-timeframe, defined by the server |
| **Drawings** | 16 tools (trendlines, fib, positions, rectangles …) — draw locally or push from server |
| **Multi-chart** | Up to 4 charts in the same layout, each with its own symbol and timeframe |
| **History** | Infinite scroll — requests older bars from the server as you scroll left |
| **Backtest panel** | Live-updating positions/orders table, equity curve, P&L stats, trade markers on chart |
| **Playback control** | Pause · Resume · Speed slider for backtest replay |
| **Toast notifications** | Server-triggered banners (`success`, `error`, `warning`, `info`) |

---

## Quick Start

### 1 — Install and run

```bash
git clone https://github.com/DeveloperNasirpur/TrexTerminal
cd TrexTerminal
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### 2 — Connect a data server

The terminal connects to `ws://localhost:8765` by default. Any WebSocket server that speaks Protocol 2.0.0 works.

The easiest way to build one is [Trex Engine](https://github.com/DeveloperNasirpur/Trex_engin):

```python
import trex

trex.init(source_timeframe="1m", port=8765)

trex.ema("BTCUSDT", "1m", period=20, visible=True)
trex.rsi("BTCUSDT", "1h", period=14, visible=True)

while True:
    bar = your_exchange_feed.next_bar()
    trex.push(bar, symbol="BTCUSDT")
```

### 3 — Run a backtest with live chart

```python
import trex
from backtest import Backtest, Strategy, load_csv

class MyStrategy(Strategy):
    symbol    = "BTCUSDT"
    timeframe = "1m"
    deposit   = 10_000
    broadcast = True     # ← stream everything to TrexTerminal

    def indicators(self):
        trex.ema(self.symbol, self.timeframe, period=20, visible=True)

    def on_kline(self, ohlcv):
        ...

candles = load_csv("data/BTCUSDT_1m.csv", symbol="BTCUSDT")
Backtest(MyStrategy).run(candles)
```

The terminal shows live trade markers, the BtPanel updates in real time, and the Results tab fills in when the run is complete.

---

## Backtest Panel (BtPanel)

A resizable panel attached to the bottom of the chart with five tabs:

| Tab | Contents |
|-----|---------|
| **Positions** | Open positions — entry, mark price, margin, leverage, unrealized PnL |
| **Orders** | Pending limit orders — type, entry price, size |
| **Trade History** | All closed positions — entry, exit, PnL, duration |
| **Assets** | Account balance, margin used, unrealized PnL, equity |
| **Results** | Full P&L stats + equity curve chart |

The panel appears automatically when a backtest starts and switches to the Results tab when the run completes.

### Playback controls

| Control | Shortcut | Effect |
|---------|----------|--------|
| Pause / Resume | Space | Freeze / continue replay |
| Speed | Slider | 0 = max speed, 1 = 1 bar/s, 60 = 1 bar per tf-second |
| Stop | × | Abort the running backtest |

---

## WebSocket Protocol

The terminal speaks **Protocol 2.0.0**. The full specification is in [`SERVER_API.md`](SERVER_API.md).

Quick summary of the server's responsibilities:

| Message (server → client) | When |
|---------------------------|------|
| `snapshot` | On connect and on symbol/timeframe change |
| `bar` | Every new candle |
| `indicators` | After each bar close (one point per series) |
| `history` | Reply to scroll-back requests |
| `drawing_upsert` | Add or update a drawing |
| `drawing_delete` | Remove a drawing by ID |
| `drawings_clear` | Remove all server drawings |
| `bt_progress` | Backtest progress `{ current, total, pct }` |
| `bt_state` | Live positions/orders/balance during backtest |
| `bt_result` | Final statistics after backtest completes |
| `bt_playback` / `bt_playback_state` | Playback control sync |
| `toast` | Notification banners |

---

## Server Implementations

| Package | Language | Purpose |
|---------|----------|---------|
| [Trex Engine](https://github.com/DeveloperNasirpur/Trex_engin) | Python | Production live data server — indicators, PostgreSQL, multi-symbol |
| [BackTest](https://github.com/DeveloperNasirpur/BackTest) | Python | Strategy backtesting with live chart streaming |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Build | Vite |
| Language | TypeScript |
| Chart engine | Lightweight Charts v5 |
| State | React hooks + WebSocket |
| Styling | Tailwind CSS |

---

## Development

```bash
npm run dev       # dev server with HMR
npm run build     # production build → dist/
npm run test      # Vitest unit tests
npm run preview   # preview production build
```

---

## License

MIT
