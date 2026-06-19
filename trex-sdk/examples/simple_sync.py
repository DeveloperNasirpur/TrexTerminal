"""Simplest possible Trex feed — synchronous, no async needed.

Run this, then open trex-terminal.html in "server" mode pointed at
ws://localhost:8765.
"""
import time
import random
from trex.sync import SyncServer
from trex import Candle, line, Point

server = SyncServer(port=8765)

# build some seed candles
t0 = int(time.time()) // 60 * 60 - 300 * 60
price = 42000.0
candles = []
for i in range(300):
    o = price
    price *= 1 + random.uniform(-0.003, 0.003)
    candles.append(Candle(time=t0 + i * 60, open=o, high=max(o, price) * 1.001,
                          low=min(o, price) * 0.999, close=price, volume=random.uniform(5, 50)))


@server.on_connect
def on_connect(client):
    print("terminal connected → sending data")
    client.snapshot(symbol="BTCUSDT", timeframe="1m", candles=candles)
    client.define(line("sma20", "SMA 20", color="#26A69A"))


server.start()
print("Trex SDK server running on ws://localhost:8765 — open the terminal in server mode.")

# stream a new candle every second, forever
last_time = candles[-1].time
last_close = candles[-1].close
try:
    while True:
        time.sleep(1.0)
        last_time += 60
        last_close *= 1 + random.uniform(-0.002, 0.002)
        bar = Candle(time=last_time, open=last_close, high=last_close * 1.001,
                     low=last_close * 0.999, close=last_close, volume=random.uniform(5, 50))
        server.broadcast_bar(bar)
except KeyboardInterrupt:
    server.stop()
    print("stopped.")
