"""Push read-only drawing objects from the server.

Server drawings render locked (the user can't move/delete them), exactly
like indicators. Every one of the terminal's 16 tools is available.
"""
import time
import random
from trex.sync import SyncServer
from trex import (Candle, trendline, horizontal, rectangle, ellipse,
                  fib_retracement, long_position, short_position, text_label,
                  parallel_channel, arrow, DrawingStyle)

server = SyncServer(port=8765)

t0 = int(time.time()) // 60 * 60 - 200 * 60
price = 42000.0
candles = []
for i in range(200):
    o = price
    price *= 1 + random.uniform(-0.004, 0.004)
    candles.append(Candle(time=t0 + i * 60, open=o, high=max(o, price) * 1.001,
                          low=min(o, price) * 0.999, close=price, volume=20))

hi = max(c.high for c in candles)
lo = min(c.low for c in candles)
mid = (hi + lo) / 2


@server.on_connect
def on_connect(client):
    client.snapshot(symbol="BTCUSDT", timeframe="1m", candles=candles)
    client.set_drawings([
        # support / resistance
        horizontal(t0, hi, color="#F23645", style=DrawingStyle(color="#F23645", line_style=2)),
        horizontal(t0, lo, color="#089981", style=DrawingStyle(color="#089981", line_style=2)),
        # a trend line + an arrow callout
        trendline((t0 + 20 * 60, lo), (t0 + 150 * 60, hi)),
        arrow((t0 + 80 * 60, mid * 1.02), (t0 + 90 * 60, mid)),
        # a highlighted zone
        rectangle((t0 + 40 * 60, mid * 0.99), (t0 + 120 * 60, mid * 1.01), color="#FF9800"),
        # fibonacci
        fib_retracement((t0 + 30 * 60, lo), (t0 + 160 * 60, hi)),
        # a trade idea with auto R/R
        long_position((t0 + 100 * 60, mid), end_time=t0 + 140 * 60,
                      stop_loss=mid * 0.98, take_profit=mid * 1.04, quantity=1),
        # a label
        text_label(t0 + 10 * 60, hi, "server-pushed objects"),
    ])
    client.toast("Server drawings loaded", "success")


server.start()
print("Open trex-terminal.html in server mode → ws://localhost:8765")
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    server.stop()
