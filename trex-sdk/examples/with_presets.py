"""Using ready-made indicator presets.

The SDK styles the indicators for you (correct pane, colors, guide levels);
YOU compute the values and push them under the documented keys.
"""
import time
import random
from trex.sync import SyncServer
from trex import Candle, Point, presets

server = SyncServer(port=8765)

# seed candles
t0 = int(time.time()) // 60 * 60 - 250 * 60
price = 42000.0
candles = []
for i in range(250):
    o = price
    price *= 1 + random.uniform(-0.004, 0.004)
    candles.append(Candle(time=t0 + i * 60, open=o, high=max(o, price) * 1.001,
                          low=min(o, price) * 0.999, close=price, volume=random.uniform(5, 50)))


# ── you compute the math (here: a simple SMA + a simple RSI) ──
def sma(data, period):
    out, s = [], 0.0
    for i, c in enumerate(data):
        s += c.close
        if i >= period:
            s -= data[i - period].close
        if i >= period - 1:
            out.append(Point(time=c.time, value=s / period))
    return out


def rsi(data, period=14):
    out, gain, loss = [], 0.0, 0.0
    for i in range(1, len(data)):
        ch = data[i].close - data[i - 1].close
        gain = (gain * (period - 1) + max(ch, 0)) / period
        loss = (loss * (period - 1) + max(-ch, 0)) / period
        rs = gain / loss if loss else 100
        out.append(Point(time=data[i].time, value=100 - 100 / (1 + rs)))
    return out


@server.on_connect
def on_connect(client):
    client.snapshot(symbol="BTCUSDT", timeframe="1m", candles=candles)

    # ready-made STYLING from presets — no need to set colors/panes/levels:
    client.define(presets.sma(20), presets.ema(50))   # main-pane overlays
    client.define(presets.rsi(14))                    # sub-pane + 30/70 levels
    client.define(*presets.macd())                    # 3 series in one pane

    # push YOUR computed values under the documented keys:
    client.push_points("sma", sma(candles, 20))
    client.push_points("ema", sma(candles, 50))
    client.push_points("rsi", rsi(candles, 14))
    # (compute & push "macd", "macd_signal", "macd_hist" the same way)


server.start()
print("Open trex-terminal.html in server mode → ws://localhost:8765")
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    server.stop()
