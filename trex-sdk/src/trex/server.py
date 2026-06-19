"""The async WebSocket server.

:class:`TrexServer` accepts terminal connections and dispatches them to your
callbacks. It handles the protocol plumbing — the handshake, ``ping``/``pong``
keepalive, and ``history`` requests — so your code only deals with feeding
data through the :class:`~trex.session.Session`.

Example:
    >>> server = TrexServer(port=8765)
    >>> @server.on_connect
    ... async def feed(session):
    ...     await session.send_snapshot(symbol="BTCUSDT", timeframe="1m", candles=bars)
    >>> import asyncio; asyncio.run(server.serve_forever())
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

import websockets

from trex.session import Session

OnConnect = Callable[[Session], Awaitable[None]]
OnMessage = Callable[[Session, dict[str, Any]], Awaitable[None]]
OnDisconnect = Callable[[Session], Awaitable[None]]


class TrexServer:
    """An async server that feeds connected Trex Terminals.

    Args:
        host: Bind address.
        port: Bind port.
    """

    def __init__(self, host: str = "0.0.0.0", port: int = 8765) -> None:
        self.host = host
        self.port = port
        self._on_connect: OnConnect | None = None
        self._on_message: OnMessage | None = None
        self._on_disconnect: OnDisconnect | None = None
        self._stop_event: Any = None  # asyncio.Event, created in the loop
        self._loop: Any = None  # asyncio loop, set in serve_forever

    # ── decorator registration ──────────────────────────────────────
    def on_connect(self, fn: OnConnect) -> OnConnect:
        """Register the coroutine called when a terminal connects."""
        self._on_connect = fn
        return fn

    def on_message(self, fn: OnMessage) -> OnMessage:
        """Register the coroutine called for each client message.

        The SDK already answers ``ping`` automatically; use this for
        ``symbol`` / ``timeframe`` / ``history`` requests.
        """
        self._on_message = fn
        return fn

    def on_disconnect(self, fn: OnDisconnect) -> OnDisconnect:
        """Register the coroutine called when a terminal disconnects."""
        self._on_disconnect = fn
        return fn

    # ── connection handler ──────────────────────────────────────────
    async def _handler(self, ws: Any) -> None:
        session = Session(ws)
        if self._on_connect is not None:
            await self._on_connect(session)
        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    continue  # drop malformed frames silently
                if not isinstance(msg, dict):
                    continue
                # answer keepalive automatically
                if msg.get("type") == "ping":
                    await session._send({"type": "pong"})
                    continue
                if self._on_message is not None:
                    await self._on_message(session, msg)
        except websockets.ConnectionClosed:
            pass
        finally:
            if self._on_disconnect is not None:
                await self._on_disconnect(session)

    # ── run ─────────────────────────────────────────────────────────
    async def serve_forever(self) -> None:
        """Run the server until :meth:`stop` is called (async entry point)."""
        import asyncio

        loop = asyncio.get_running_loop()
        self._loop = loop
        self._stop_event = asyncio.Event()
        async with websockets.serve(self._handler, self.host, self.port):
            await self._stop_event.wait()  # exits the context cleanly

    def stop(self) -> None:
        """Signal the server to stop (callable from any thread)."""
        ev = self._stop_event
        loop = self._loop
        if ev is not None and loop is not None:
            loop.call_soon_threadsafe(ev.set)
