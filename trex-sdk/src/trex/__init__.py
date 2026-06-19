"""Trex Terminal — Python SDK.

Feed a Trex Terminal chart from any Python backend over WebSocket.

Two ways to use it:

**Easy (synchronous, runs on a background thread):**

    >>> from trex.sync import SyncServer
    >>> from trex import Candle, line
    >>> server = SyncServer(port=8765)
    >>> @server.on_connect
    ... def on_connect(client):
    ...     client.snapshot(symbol="BTCUSDT", timeframe="1m", candles=bars)
    ...     client.define(line("sma20", "SMA 20"))
    >>> server.start()                # non-blocking
    >>> server.broadcast_bar(my_bar)  # stream from your normal code

**Advanced (async):**

    >>> import asyncio
    >>> from trex import TrexServer
    >>> server = TrexServer(port=8765)
    >>> @server.on_connect
    ... async def feed(session):
    ...     await session.send_snapshot(symbol="BTCUSDT", timeframe="1m", candles=bars)
    >>> asyncio.run(server.serve_forever())
"""

from __future__ import annotations

from trex import presets
from trex.models import (
    DEFAULT_FIB_LEVELS,
    DRAWING_MIN_POINTS,
    Candle,
    Drawing,
    DrawingStyle,
    Point,
    PositionData,
    SeriesDefinition,
    area,
    arrow,
    baseline,
    ellipse,
    extended,
    fib_extension,
    fib_retracement,
    histogram,
    horizontal,
    line,
    long_position,
    parallel_channel,
    polyline,
    ray,
    rectangle,
    scatter,
    short_position,
    text_label,
    trendline,
    vertical,
)
from trex.protocol import PROTOCOL_VERSION, ProtocolError, TrexError
from trex.server import TrexServer
from trex.session import Session

__version__ = "1.0.0"

__all__ = [
    # version / protocol
    "__version__", "PROTOCOL_VERSION",
    # async server
    "TrexServer", "Session",
    # ready-made indicator presets (appearance only)
    "presets",
    # core models
    "Candle", "Point", "SeriesDefinition",
    "Drawing", "DrawingStyle", "PositionData",
    "DRAWING_MIN_POINTS", "DEFAULT_FIB_LEVELS",
    # series factories
    "line", "histogram", "area", "baseline", "scatter",
    # drawing factories — line tools
    "trendline", "ray", "extended", "horizontal", "vertical", "arrow", "polyline",
    # drawing factories — shapes
    "rectangle", "ellipse", "parallel_channel",
    # drawing factories — fibonacci
    "fib_retracement", "fib_extension",
    # drawing factories — text & positions
    "text_label", "long_position", "short_position",
    # errors
    "TrexError", "ProtocolError",
]
