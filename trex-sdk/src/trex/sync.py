"""Synchronous facade — run the whole server on a background thread.

This is the **easy path**. You never touch ``async``/``await`` or an event
loop. Call :meth:`SyncServer.start` and the server runs on its own thread;
then push data with plain blocking method calls from your normal code.

Example:
    >>> from trex.sync import SyncServer
    >>> from trex import Candle, line
    >>>
    >>> server = SyncServer(port=8765)
    >>> server.start()                       # non-blocking: runs in a thread
    >>>
    >>> # whenever a terminal connects, send it the initial data:
    >>> @server.on_connect
    ... def on_connect(client):
    ...     client.snapshot(symbol="BTCUSDT", timeframe="1m", candles=bars)
    ...     client.define(line("sma20", "SMA 20"))
    >>>
    >>> # from anywhere in your (blocking) code, stream updates:
    >>> server.broadcast_bar(Candle(time=..., open=1, high=2, low=0, close=1.5))
    >>> server.broadcast_point("sma20", time=..., value=1.4)

Everything is thread-safe: calls are marshalled onto the server's event
loop with ``run_coroutine_threadsafe``.
"""

from __future__ import annotations

import asyncio
import threading
from collections.abc import Callable, Iterable
from typing import Any

from trex.models.candles import Candle, Point
from trex.models.drawings import Drawing
from trex.models.series import SeriesDefinition
from trex.server import TrexServer
from trex.session import Session


class SyncClient:
    """A blocking handle to one connected terminal.

    Passed to your ``on_connect`` callback. Mirrors :class:`~trex.session.Session`
    but every call is a normal blocking method (it waits for the send to
    complete on the server's loop).
    """

    def __init__(self, session: Session, loop: asyncio.AbstractEventLoop) -> None:
        self._session = session
        self._loop = loop

    def _run(self, coro: Any) -> None:
        # marshal the coroutine onto the server loop and wait for it
        fut = asyncio.run_coroutine_threadsafe(coro, self._loop)
        fut.result()

    def snapshot(
        self,
        *,
        symbol: str,
        timeframe: str,
        candles: Iterable[Candle],
        definitions: Iterable[SeriesDefinition] | None = None,
        points: dict[str, Iterable[Point]] | None = None,
        drawings: Iterable[Drawing] | None = None,
        digits: int = 2,
    ) -> None:
        self._run(self._session.send_snapshot(
            symbol=symbol, timeframe=timeframe, candles=candles,
            definitions=definitions, points=points, drawings=drawings, digits=digits,
        ))

    def update_bar(self, bar: Candle) -> None:
        self._run(self._session.update_bar(bar))

    def define(self, *series: SeriesDefinition) -> None:
        self._run(self._session.define(*series))

    def push_points(self, key: str, points: Iterable[Point]) -> None:
        self._run(self._session.push_points(key, points))

    def update_point(self, key: str, point: Point) -> None:
        self._run(self._session.update_point(key, point))

    def set_drawings(self, drawings: Iterable[Drawing]) -> None:
        self._run(self._session.set_drawings(drawings))

    def upsert_drawing(self, drawing: Drawing) -> None:
        self._run(self._session.upsert_drawing(drawing))

    def delete_drawings(self, *ids: str) -> None:
        self._run(self._session.delete_drawings(*ids))

    def clear_drawings(self) -> None:
        self._run(self._session.clear_drawings())

    def toast(self, message: str, kind: str = "info") -> None:
        self._run(self._session.toast(message, kind))

    # view commands
    def fit_content(self) -> None:
        self._run(self._session.fit_content())

    def scroll_to_end(self) -> None:
        self._run(self._session.scroll_to_end())

    def zoom_range(self, from_ts: int, to_ts: int) -> None:
        self._run(self._session.zoom_range(from_ts, to_ts))

    # chart control
    def set_settings(self, **settings: Any) -> None:
        self._run(self._session.set_settings(**settings))

    def set_magnet(self, on: bool) -> None:
        self._run(self._session.set_magnet(on))

    def set_chart_type(self, chart_type: str) -> None:
        self._run(self._session.set_chart_type(chart_type))

    def set_symbol(self, symbol: str) -> None:
        self._run(self._session.set_symbol(symbol))

    def set_timeframe(self, timeframe: str) -> None:
        self._run(self._session.set_timeframe(timeframe))


class SyncServer:
    """A Trex server that runs on a background thread — no async required.

    Args:
        host: Bind address.
        port: Bind port.
    """

    def __init__(self, host: str = "0.0.0.0", port: int = 8765) -> None:
        self._server = TrexServer(host, port)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._ready = threading.Event()
        self._clients: list[SyncClient] = []
        self._lock = threading.Lock()
        self._user_on_connect: Callable[[SyncClient], None] | None = None
        self._user_on_disconnect: Callable[[SyncClient], None] | None = None

        # bridge async server events into the sync world
        @self._server.on_connect
        async def _connect(session: Session) -> None:
            assert self._loop is not None
            client = SyncClient(session, self._loop)
            with self._lock:
                self._clients.append(client)
            if self._user_on_connect is not None:
                # run the (blocking) user callback off the event loop
                await asyncio.to_thread(self._user_on_connect, client)

        @self._server.on_disconnect
        async def _disconnect(session: Session) -> None:
            with self._lock:
                client = next((c for c in self._clients if c._session is session), None)
                if client is not None:
                    self._clients.remove(client)
            if client is not None and self._user_on_disconnect is not None:
                await asyncio.to_thread(self._user_on_disconnect, client)

    # ── callbacks (plain sync functions) ────────────────────────────
    def on_connect(self, fn: Callable[[SyncClient], None]) -> Callable[[SyncClient], None]:
        """Register a blocking callback run when a terminal connects."""
        self._user_on_connect = fn
        return fn

    def on_disconnect(self, fn: Callable[[SyncClient], None]) -> Callable[[SyncClient], None]:
        """Register a blocking callback run when a terminal disconnects."""
        self._user_on_disconnect = fn
        return fn

    # ── lifecycle ───────────────────────────────────────────────────
    def start(self) -> None:
        """Start the server on a background thread (non-blocking)."""
        if self._thread is not None:
            raise RuntimeError("server already started")

        def _run() -> None:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            self._loop = loop
            self._ready.set()
            try:
                loop.run_until_complete(self._server.serve_forever())
            finally:
                loop.close()

        self._thread = threading.Thread(target=_run, name="trex-server", daemon=True)
        self._thread.start()
        self._ready.wait(timeout=5)  # block until the loop exists

    def stop(self) -> None:
        """Stop the background server loop cleanly."""
        if self._loop is None:
            return
        self._server.stop()  # signals the stop event on the loop
        if self._thread is not None:
            self._thread.join(timeout=3)

    # ── broadcast helpers (to every connected terminal) ─────────────
    def broadcast_bar(self, bar: Candle) -> None:
        """Stream a realtime bar update to all connected terminals."""
        with self._lock:
            clients = list(self._clients)
        for c in clients:
            c.update_bar(bar)

    def broadcast_point(self, key: str, *, time: int, value: float, color: str | None = None) -> None:
        """Stream a single realtime indicator point to all terminals (fast path)."""
        pt = Point(time=time, value=value, color=color)
        with self._lock:
            clients = list(self._clients)
        for c in clients:
            c.update_point(key, pt)

    def broadcast_toast(self, message: str, kind: str = "info") -> None:
        """Show a toast on all connected terminals."""
        with self._lock:
            clients = list(self._clients)
        for c in clients:
            c.toast(message, kind)

    def broadcast_drawings(self, drawings: Iterable[Drawing]) -> None:
        """Replace server objects on all connected terminals."""
        drawings = list(drawings)
        with self._lock:
            clients = list(self._clients)
        for c in clients:
            c.set_drawings(drawings)

    def broadcast_drawing(self, drawing: Drawing) -> None:
        """Add/update one server object on all connected terminals."""
        with self._lock:
            clients = list(self._clients)
        for c in clients:
            c.upsert_drawing(drawing)
