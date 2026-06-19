# Trex Terminal — Python SDK

Feed a [Trex Terminal](https://github.com/trex-terminal) chart from any Python backend over WebSocket. Clean typed API, full protocol coverage, reconnection and validation handled for you.

Two ways to use it: a **simple synchronous** API that runs the server on a background thread (no `async` needed), and a **full async** API for advanced use.

---

## Install

```bash
pip install trex-terminal
```

Requires Python 3.10+. The only runtime dependency is `websockets`.

---

## Easy: synchronous (runs on a background thread)

No `async`/`await`, no event loop. Start the server and push data with plain blocking calls from your normal code.

```python
import time
from trex.sync import SyncServer
from trex import Candle, line

server = SyncServer(port=8765)

# When a terminal connects, send it the initial data.
@server.on_connect
def on_connect(client):
    client.snapshot(symbol="BTCUSDT", timeframe="1m", candles=my_candles)
    client.define(line("sma20", "SMA 20"))

server.start()  # non-blocking — the server now runs in the background

# Stream realtime updates from anywhere in your (blocking) code:
while True:
    bar = get_next_bar()
    server.broadcast_bar(bar)
    server.broadcast_point("sma20", time=bar.time, value=compute_sma())
    time.sleep(0.25)
```

---

## Advanced: async

```python
import asyncio
from trex import TrexServer, Candle, line

server = TrexServer(port=8765)

@server.on_connect
async def feed(session):
    await session.send_snapshot(symbol="BTCUSDT", timeframe="1m", candles=my_candles)
    await session.define(line("sma20", "SMA 20"))
    await session.push_points("sma20", my_sma_points)
    async for bar in my_live_feed():
        await session.update_bar(bar)

asyncio.run(server.serve_forever())
```

---

## Server-pushed drawings (read-only objects)

Push any of the terminal's **16 drawing tools** from the server. They render locked — the user can't move or delete them, exactly like indicators.

```python
from trex import (trendline, horizontal, rectangle, ellipse, fib_retracement,
                  long_position, short_position, text_label, parallel_channel,
                  arrow, ray, extended, vertical, polyline, fib_extension, DrawingStyle)

client.set_drawings([
    horizontal(t0, 42000, color="#F23645"),
    trendline((t1, 41000), (t2, 43000)),
    rectangle((t1, 41500), (t2, 42500), color="#FF9800"),
    fib_retracement((t1, 41000), (t2, 43000)),       # full default fib levels
    long_position((t1, 42000), end_time=t2,          # auto risk/reward
                  stop_loss=41000, take_profit=44000, quantity=2),
    text_label(t1, 43000, "breakout"),
])

# add/update or remove individual objects later:
client.upsert_drawing(trendline((t3, 42000), (t4, 42500)))
client.delete_drawings("srv_1", "srv_2")
client.clear_drawings()
```

Pass a `DrawingStyle(...)` for full control over color, fill, line style, font and line extension.

## Chart control

```python
client.set_chart_type("heikin")        # candles | heikin | line | area | bars
client.set_magnet(True)                # snap-to-OHLC
client.set_settings(show_grid=False, candle_up_color="#00FF00")
client.fit_content()                   # fit all data
client.scroll_to_end()                 # jump to latest
client.zoom_range(t_from, t_to)        # zoom a time range
client.toast("hello", "success")       # info | success | error | warning
```

---

## Ready-made indicator presets

The SDK ships fully-styled definitions for every common indicator — correct pane, colors, line styles and guide levels. **It does not compute anything** (Trex is display-only): you compute the values yourself and push them under the documented keys.

```python
from trex import presets

# styling is done for you — RSI lands in a sub-pane with 30/70 guide levels:
client.define(presets.rsi(14))
client.push_points("rsi", my_rsi_values)

# multi-series indicators return a list — splat into define():
client.define(*presets.macd())          # keys: macd, macd_signal, macd_hist
client.define(*presets.bollinger(20))   # keys: bb_upper, bb_mid, bb_lower
```

Available presets (22): `sma`, `ema`, `wma`, `vwap`, `bollinger`, `keltner`, `donchian`, `supertrend`, `psar`, `ichimoku`, `rsi`, `macd`, `stochastic`, `stoch_rsi`, `atr`, `adx`, `cci`, `williams_r`, `momentum`, `mfi`, `obv`, `volume`. Each preset's docstring lists the exact key(s) it expects.

---

## What you get

- **Typed models** — `Candle`, `Point`, `SeriesDefinition`, `Drawing` with validation.
- **Series factories** — `line`, `histogram`, `area`, `baseline`, `scatter`.
- **Server objects** — push read-only drawings (`trendline`, `rectangle`, `ellipse`, …) the same way you push indicators.
- **Automatic plumbing** — handshake, `ping`/`pong` keepalive, data sanitisation.
- **Fast realtime path** — `update_point()` updates only the last point of a series.

---

## License

MIT
