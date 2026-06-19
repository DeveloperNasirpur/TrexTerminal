"""Per-connection session — the high-level async send API.

A :class:`Session` wraps one connected terminal. It exposes ergonomic
coroutines (``send_snapshot``, ``update_bar``, ``define``, ``push_points``,
…) that build and send the correct protocol frames. You never hand-write
JSON.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from trex.models.candles import Candle, Point
from trex.models.drawings import Drawing
from trex.models.series import SeriesDefinition
from trex.sanitize import sanitize_candles, sanitize_points


class Session:
    """A single connected Trex Terminal.

    Instances are created by the server and handed to your ``on_connect``
    callback. All methods are coroutines that send one protocol frame.
    """

    def __init__(self, ws: Any) -> None:
        self._ws = ws

    async def _send(self, msg: dict[str, Any]) -> None:
        await self._ws.send(json.dumps(msg))

    # ── initial load ────────────────────────────────────────────────
    async def send_snapshot(
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
        """Send the initial snapshot: candles + optional series + objects."""
        msg: dict[str, Any] = {
            "type": "snapshot",
            "symbol": symbol,
            "timeframe": timeframe,
            "digits": digits,
            "data": [c.to_dict() for c in sanitize_candles(candles)],
        }
        if definitions is not None:
            msg["definitions"] = [d.to_dict() for d in definitions]
        if points is not None:
            msg["points"] = {k: [p.to_dict() for p in sanitize_points(v)] for k, v in points.items()}
        if drawings is not None:
            msg["drawings"] = [d.to_dict() for d in drawings]
        await self._send(msg)

    # ── realtime candles ────────────────────────────────────────────
    async def update_bar(self, bar: Candle) -> None:
        """Update the last candle in place, or append if it's newer."""
        await self._send({"type": "bar", "bar": bar.to_dict()})

    async def replace_candles(self, candles: Iterable[Candle]) -> None:
        """Replace the entire candle set."""
        await self._send({"type": "candles", "data": [c.to_dict() for c in sanitize_candles(candles)]})

    # ── indicator series ────────────────────────────────────────────
    async def define(self, *series: SeriesDefinition) -> None:
        """Define or update one or more indicator series."""
        await self._send({"type": "definitions", "definitions": [s.to_dict() for s in series]})

    async def push_points(self, key: str, points: Iterable[Point]) -> None:
        """Send full data for a series key."""
        await self._send({"type": "indicators", "points": {key: [p.to_dict() for p in sanitize_points(points)]}})

    async def update_point(self, key: str, point: Point) -> None:
        """Fast O(1) realtime path: update only the last point of a series."""
        await self._send({"type": "indicators", "points": {key: [point.to_dict()]}})

    # ── server objects (read-only drawings) ─────────────────────────
    async def set_drawings(self, drawings: Iterable[Drawing]) -> None:
        """Replace all server objects on the chart."""
        await self._send({"type": "drawings", "drawings": [d.to_dict() for d in drawings]})

    async def upsert_drawing(self, drawing: Drawing) -> None:
        """Add or update a single server object."""
        await self._send({"type": "drawing_upsert", "drawing": drawing.to_dict()})

    async def delete_drawings(self, *ids: str) -> None:
        """Remove server objects by id."""
        await self._send({"type": "drawing_delete", "drawingIds": list(ids)})

    async def clear_drawings(self) -> None:
        """Remove all server objects."""
        await self._send({"type": "drawings_clear"})

    # ── UI commands ─────────────────────────────────────────────────
    async def toast(self, message: str, kind: str = "info") -> None:
        """Show a toast notification (info | success | error | warning)."""
        await self._send({"type": "toast", "message": message, "toastType": kind})

    async def fit_content(self) -> None:
        await self._send({"type": "fitContent"})

    async def scroll_to_end(self) -> None:
        await self._send({"type": "scrollToEnd"})

    async def zoom_range(self, from_ts: int, to_ts: int) -> None:
        await self._send({"type": "zoomRange", "zoomRange": {"from": from_ts, "to": to_ts}})

    # ── chart control ───────────────────────────────────────────────
    async def set_settings(self, **settings: Any) -> None:
        """Patch chart appearance remotely.

        Accepts any of: ``show_grid``, ``show_volume``, ``show_crosshair``,
        ``candle_up_color``, ``candle_down_color``, ``background_color``,
        ``grid_color``. Keys are converted to the wire's camelCase.
        """
        camel = {
            "show_grid": "showGrid", "show_volume": "showVolume",
            "show_crosshair": "showCrosshair", "candle_up_color": "candleUpColor",
            "candle_down_color": "candleDownColor", "background_color": "backgroundColor",
            "grid_color": "gridColor",
        }
        payload = {camel.get(k, k): v for k, v in settings.items()}
        await self._send({"type": "settings", "settings": payload})

    async def set_magnet(self, on: bool) -> None:
        """Turn magnet (snap-to-OHLC) mode on or off."""
        await self._send({"type": "magnet", "magnet": on})

    async def set_chart_type(self, chart_type: str) -> None:
        """Switch the display type: candles | heikin | line | area | bars."""
        await self._send({"type": "chartType", "chartType": chart_type})

    async def set_symbol(self, symbol: str) -> None:
        """Update the symbol label shown in the UI."""
        await self._send({"type": "symbol", "symbol": symbol})

    async def set_timeframe(self, timeframe: str) -> None:
        """Update the timeframe label shown in the UI."""
        await self._send({"type": "timeframe", "timeframe": timeframe})

    async def error(self, message: str) -> None:
        """Surface a server-side error in the terminal."""
        await self._send({"type": "error", "message": message})
