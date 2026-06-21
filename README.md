# TrexTerminal

**Professional trading terminal that runs in your browser — powered by your own Python data server.**

TrexTerminal is a pure client: it renders charts exactly as the server sends them. All candles, indicator values, and drawings come from your server over WebSocket. No data is computed in the browser.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Connecting a Data Server](#connecting-a-data-server)
- [Backtest Panel (BtPanel)](#backtest-panel-btpanel)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Configuration](#configuration)
- [Multi-Chart Layout](#multi-chart-layout)
- [Drawing Tools](#drawing-tools)
- [WebSocket Protocol](#websocket-protocol)
- [Server Implementations](#server-implementations)
- [Tech Stack](#tech-stack)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

---

## Features

| Category | Details |
|----------|---------|
| **Chart types** | Candlestick, Heikin-Ashi, Line, Area, Bar — switchable at runtime |
| **Indicators** | Unlimited overlay and sub-pane series, defined by the server |
| **Multi-timeframe** | Switch timeframe; server auto-aggregates |
| **Drawings** | 16 tools — trendlines, fibonacci, position boxes, rectangles, text, and more |
| **Server drawings** | Server pushes locked drawings (trade markers, signal levels) |
| **Multi-chart** | Up to 4 independent charts in one layout |
| **Infinite history** | Scroll left — older bars fetched on demand from the server |
| **Backtest panel** | Live positions/orders table, equity curve, P&L report |
| **Playback control** | Pause · Resume · Speed slider for backtest replay |
| **Toast notifications** | Server-triggered banners (`success`, `error`, `warning`, `info`) |
| **Remote UI control** | Server can switch symbol, zoom, fit content, change chart type |

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

TrexTerminal connects to `ws://localhost:8765` by default.  
The fastest way to build a compatible server is [Trex Engine](https://github.com/DeveloperNasirpur/Trex_engin):

```bash
pip install -e ../Trex_engin
```

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
    broadcast = True        # ← stream everything to TrexTerminal
    replay_speed = 1.0      # 1 bar per second

    def indicators(self):
        trex.ema(self.symbol, self.timeframe, period=20, visible=True)

    def on_kline(self, ohlcv):
        ...

candles = load_csv("data/BTCUSDT_1m.csv", symbol="BTCUSDT")
Backtest(MyStrategy).run(candles)
```

The terminal shows live candles, trade markers, and switches to the Results tab when complete.

---

## Connecting a Data Server

TrexTerminal connects to the WebSocket URL configured in the connection bar at the top.

### Default connection

`ws://localhost:8765` — works out of the box with Trex Engine.

### Custom server URL

Type any `ws://` or `wss://` address in the connection bar and press Enter.

### Connection states

| State | Icon | Meaning |
|-------|------|---------|
| Connecting | ⟳ | WebSocket handshake in progress |
| Connected | ● green | Receiving data |
| Disconnected | ● red | Server not reachable — auto-retry every 3 s |

The terminal reconnects automatically on disconnect. The snapshot is re-requested on reconnect — the chart restores to the latest state.

---

## Backtest Panel (BtPanel)

A resizable panel attached to the bottom of the chart. It appears automatically when a backtest starts (`broadcast=True` in your strategy).

### Tabs

| Tab | Contents |
|-----|---------|
| **Positions** | Open positions: symbol, side, entry, mark price, margin, leverage, unrealized PnL |
| **Orders** | Pending limit orders: side, type, entry price, size |
| **Trade History** | All closed positions: entry, PnL, open/close time |
| **Assets** | Available balance, margin used, unrealized PnL, total equity |
| **Results** | Full P&L statistics + equity curve chart |

The panel auto-switches to the **Results** tab when the backtest finishes.

### Playback controls

| Control | Action |
|---------|--------|
| ⏸ / ▶ button | Pause / Resume the replay |
| Speed slider | Drag left = slower, right = faster |
| `0` (far left) | Maximum speed — no delay |
| `1` | 1 bar per second |
| `60` | 60 bars per second |
| ✕ button | Stop the running backtest |

### Equity curve

The Results tab shows an SVG equity curve built from all closed trades. The baseline is the initial balance. Profit zones are green, drawdown zones are red.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Pause / Resume backtest playback |
| `Escape` | Cancel active drawing tool |
| `Delete` / `Backspace` | Delete selected drawing |
| `Ctrl+Z` | Undo last drawing action |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+A` | Select all drawings |
| `F` | Fit all data to screen |
| `End` | Scroll to latest bar |
| `←` / `→` | Scroll chart left / right |
| `+` / `-` | Zoom in / out |
| `Ctrl+scroll` | Zoom time axis |

---

## Configuration

### Environment variables

Create a `.env` file in the TrexTerminal root:

```env
VITE_WS_URL=ws://localhost:8765        # default WebSocket server URL
VITE_APP_TITLE=TrexTerminal            # browser tab title
```

### `vite.config.ts`

```ts
export default defineConfig({
  server: {
    port: 5173,          // dev server port
    host: "0.0.0.0",     // set to "0.0.0.0" to expose on LAN
  },
})
```

### Production build

```bash
npm run build           # outputs to dist/
```

Serve the `dist/` folder with any static file server:

```bash
npx serve dist          # quick local preview
# or
nginx -c /path/to/nginx.conf   # production
```

Nginx config example:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/TrexTerminal/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
```

---

## Multi-Chart Layout

Switch the layout from the toolbar:

| Layout | Charts |
|--------|--------|
| Single | 1 chart (full width) |
| Split 2 | 2 charts side by side |
| Grid 4 | 4 charts (2×2) |

Each chart has its own independent symbol, timeframe, and indicator set. The server receives a separate `chart_symbol` request per chart and responds with a `chart_snapshot`.

---

## Drawing Tools

16 tools available from the left toolbar:

| Tool | Points | Description |
|------|--------|-------------|
| Trendline | 2 | Line between two price-time points |
| Ray | 2 | Trendline extended to infinity |
| Extended | 2 | Trendline extended both directions |
| Horizontal | 1 | Flat price level across full chart |
| Vertical | 1 | Vertical time marker |
| Arrow | 2 | Directional arrow |
| Rectangle | 2 | Price/time rectangle |
| Ellipse | 2 | Oval highlight |
| Parallel Channel | 3 | Two parallel trendlines |
| Fibonacci Retracement | 2 | Standard fib levels (23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%) |
| Fibonacci Extension | 3 | Extension levels |
| Long Position | 2 | Risk/reward box — green entry, red SL, green TP |
| Short Position | 2 | Risk/reward box — red entry, green SL, red TP |
| Text Label | 1 | Free-text annotation |
| Polyline | 2+ | Multi-point connected lines |
| Measure | 2 | Price and time distance tool |

**Server-pushed drawings** (from BackTest trade markers or Trex Engine signals) appear identically but are **locked** — users can view them but not move or delete them.

---

## WebSocket Protocol

The full protocol specification is in [`SERVER_API.md`](SERVER_API.md).

### Message overview

| Direction | Message type | When |
|-----------|-------------|------|
| Client → Server | `hello` | First message after connect |
| Client → Server | `get_symbols` | Request symbol list |
| Client → Server | `get_indicators` | Request indicator list |
| Client → Server | `symbol` | Switch symbol |
| Client → Server | `timeframe` | Switch timeframe |
| Client → Server | `history` | Scroll left request |
| Client → Server | `ping` | Keepalive every ~15 s |
| Client → Server | `drawing_upsert` | User draws something |
| Client → Server | `drawing_delete` | User deletes a drawing |
| Server → Client | `snapshot` | Initial chart data |
| Server → Client | `bar` | Realtime candle update |
| Server → Client | `indicators` | Indicator values |
| Server → Client | `history` | Older bars response |
| Server → Client | `drawing_upsert` | Server-pushed drawing |
| Server → Client | `drawings_clear` | Remove all server drawings |
| Server → Client | `bt_progress` | Backtest progress `{current, total, pct}` |
| Server → Client | `bt_state` | Live positions/balance during backtest |
| Server → Client | `bt_result` | Final backtest statistics |
| Server → Client | `toast` | Notification banner |

---

## Server Implementations

| Package | Language | Purpose |
|---------|----------|---------|
| [Trex Engine](https://github.com/DeveloperNasirpur/Trex_engin) | Python | Production live data — 110+ indicators, PostgreSQL, multi-symbol |
| [BackTest](https://github.com/DeveloperNasirpur/BackTest) | Python | Strategy backtesting with live chart streaming |

To build your own server in any language, follow the protocol spec in `SERVER_API.md`. The reference Python server in that file covers all message types in ~150 lines.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Build tool | Vite |
| Language | TypeScript |
| Chart engine | Lightweight Charts v5 |
| State | React hooks + context |
| Styling | Tailwind CSS |
| Tests | Vitest + Playwright |

---

## Development

```bash
npm run dev         # start dev server with HMR at http://localhost:5173
npm run build       # production build → dist/
npm run preview     # preview the production build locally
npm run test        # run Vitest unit tests
npm run test:e2e    # run Playwright end-to-end tests
```

### Project structure

```
TrexTerminal/
├── src/
│   ├── App.tsx                # root component, WebSocket lifecycle
│   ├── BtPanel.tsx            # backtest panel (positions, results, equity curve)
│   ├── Chart.tsx              # main chart wrapper (Lightweight Charts)
│   ├── DrawingTools.tsx       # drawing toolbar and management
│   ├── TopBar.tsx             # symbol/timeframe/layout controls
│   └── types.ts               # shared TypeScript types
├── trex-sdk/                  # Python SDK shipped alongside the terminal
│   └── README.md
├── SERVER_API.md              # full WebSocket protocol specification
├── vite.config.ts
└── package.json
```

---

## Troubleshooting

### Chart shows "Connecting…" and never loads

- Make sure your data server is running and listening on the correct port
- Check the connection URL in the toolbar — default is `ws://localhost:8765`
- Open browser DevTools → Network → WS to see the raw WebSocket traffic
- Verify your server sends `{"type": "hello"}` responses correctly

### No candles appear after connecting

Your server's `snapshot` message may be malformed. Common issues:
- `data` array is empty
- `time` field is in milliseconds (should be Unix **seconds**)
- `high < open` or `low > close` — invalid bars are silently rejected

Verify with: `console.log` in the server or check the browser DevTools WS frame viewer.

### Indicators don't appear

- Confirm your `snapshot` includes a `definitions` array with valid `SeriesDefinition` entries
- The `type` field must be one of: `"line"` `"histogram"` `"area"` `"baseline"` `"scatter"`
- The `pane` field must be `"main"` or `"sub"`
- Indicator `key` in `definitions` must match the key in `points`

### BtPanel doesn't appear

`broadcast=True` must be set in your Strategy and the WebSocket port must match. The panel only appears after the first `bt_progress` or `bt_state` message arrives.

### Drawings from server don't appear

Server drawings must include:
- A unique `id` string
- A valid `tool` name (see tool list in [Drawing Tools](#drawing-tools))
- The minimum number of `points` for that tool
- Each point must have `time` (Unix seconds) and `price`

### Port already in use

```bash
# Find what's using port 5173
lsof -i :5173

# Change Vite port in vite.config.ts or pass --port flag
npm run dev -- --port 5174
```

### Changes not reflected after `npm run build`

Clear your browser cache or use an incognito window. Vite generates content-hashed filenames so stale caches should be rare, but a hard refresh (`Ctrl+Shift+R`) always clears it.

---

## License

MIT
