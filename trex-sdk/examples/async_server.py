"""Async Trex feed — for advanced users who want full control."""
import asyncio
import random
import time
from trex import TrexServer, Candle, line, Point

server = TrexServer(port=8765)
t0 = int(time.time()) // 60 * 60 - 200 * 60
candles = [Candle(time=t0 + i * 60, open=42000, high=42100, low=41900,
                  close=42000 + random.uniform(-50, 50), volume=10) for i in range(200)]


@server.on_connect
async def feed(session):
    await session.send_snapshot(symbol="ETHUSDT", timeframe="1m", candles=candles,
                                definitions=[line("ema", "EMA 12")])
    # stream live updates
    last = candles[-1].time
    close = candles[-1].close
    while True:
        await asyncio.sleep(0.5)
        last += 60
        close *= 1 + random.uniform(-0.002, 0.002)
        await session.update_bar(Candle(time=last, open=close, high=close * 1.001,
                                        low=close * 0.999, close=close, volume=8))


asyncio.run(server.serve_forever())
