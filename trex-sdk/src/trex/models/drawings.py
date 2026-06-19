"""Server-side drawing objects — full coverage of every chart tool.

The terminal renders these **read-only** (``locked=True``, ``origin="server"``),
exactly like an indicator series — the user cannot move or delete them. User-
drawn objects are a separate, local-only concern and never travel the wire.

This module mirrors the terminal's ``Drawing`` schema completely:
* every one of the 16 drawing tools,
* the full :class:`DrawingStyle` (colors, fill, font, line extension, labels),
* :class:`PositionData` for long/short position tools,
* Fibonacci levels for fib tools.

Use the typed factories (:func:`trendline`, :func:`fib_retracement`,
:func:`long_position`, …) for ergonomic construction, or build a
:class:`Drawing` directly for full control.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Any

# tool name -> minimum points (mirrors the terminal's protocol.ts)
DRAWING_MIN_POINTS: dict[str, int] = {
    "trendline": 2, "ray": 2, "extended": 2, "horizontal": 1, "vertical": 1,
    "fibRetracement": 2, "fibExtension": 3, "rectangle": 2, "ellipse": 2,
    "parallelChannel": 3, "text": 1, "arrow": 2, "measure": 2,
    "longPosition": 2, "shortPosition": 2, "polyline": 2,
}

# The terminal's default Fibonacci levels (value, color, enabled).
DEFAULT_FIB_LEVELS: list[dict[str, Any]] = [
    {"value": 0, "color": "#787B86", "enabled": True},
    {"value": 0.236, "color": "#F44336", "enabled": True},
    {"value": 0.382, "color": "#E91E63", "enabled": True},
    {"value": 0.5, "color": "#9C27B0", "enabled": True},
    {"value": 0.618, "color": "#2196F3", "enabled": True},
    {"value": 0.786, "color": "#00BCD4", "enabled": True},
    {"value": 1, "color": "#4CAF50", "enabled": True},
    {"value": 1.272, "color": "#FF9800", "enabled": False},
    {"value": 1.618, "color": "#FF5722", "enabled": False},
    {"value": 2.618, "color": "#795548", "enabled": False},
    {"value": 3.618, "color": "#607D8B", "enabled": False},
]

_id_counter = itertools.count(1)


@dataclass(slots=True)
class DrawingStyle:
    """Full visual styling for a drawing object (mirrors the terminal)."""

    color: str = "#2962FF"
    line_width: int = 1
    line_style: int = 0  # 0 solid · 1 dotted · 2 dashed
    fill_color: str | None = None
    fill_opacity: float = 0.12
    font_size: int = 13
    show_labels: bool = True
    extend_left: bool = False
    extend_right: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "color": self.color,
            "lineWidth": self.line_width,
            "lineStyle": self.line_style,
            "fillColor": self.fill_color or self.color,
            "fillOpacity": self.fill_opacity,
            "fontSize": self.font_size,
            "showLabels": self.show_labels,
            "extendLeft": self.extend_left,
            "extendRight": self.extend_right,
        }


@dataclass(slots=True)
class PositionData:
    """Long/short position parameters (entry, stop, target, sizing)."""

    entry_price: float
    stop_loss: float
    take_profit: float
    quantity: float = 1.0
    risk: float = 0.0
    reward: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "entryPrice": self.entry_price,
            "stopLoss": self.stop_loss,
            "takeProfit": self.take_profit,
            "quantity": self.quantity,
            "risk": self.risk,
            "reward": self.reward,
        }


@dataclass(slots=True)
class Drawing:
    """A server object rendered read-only on the chart.

    Args:
        tool: One of the keys in :data:`DRAWING_MIN_POINTS`.
        points: ``[(time, price), ...]`` — at least ``DRAWING_MIN_POINTS[tool]``.
        style: Full :class:`DrawingStyle` (or pass ``color`` for a quick one).
        color: Convenience — sets the style color if ``style`` is omitted.
        id: Unique id (auto-generated if omitted).
        text: Label text (``text`` tool only).
        pane_id: Which pane to draw in.
        position_data: For ``longPosition`` / ``shortPosition``.
        fib_levels: For ``fibRetracement`` / ``fibExtension``.
    """

    tool: str
    points: list[tuple[int, float]]
    style: DrawingStyle | None = None
    color: str | None = None
    id: str | None = None
    text: str | None = None
    pane_id: str = "main"
    position_data: PositionData | None = None
    fib_levels: list[dict[str, Any]] | None = None

    def __post_init__(self) -> None:
        if self.tool not in DRAWING_MIN_POINTS:
            raise ValueError(f"unknown drawing tool {self.tool!r}")
        need = DRAWING_MIN_POINTS[self.tool]
        if len(self.points) < need:
            raise ValueError(f"{self.tool} needs >= {need} points, got {len(self.points)}")
        if self.id is None:
            self.id = f"srv_{next(_id_counter)}"
        if self.style is None:
            self.style = DrawingStyle(color=self.color or "#2962FF")
        elif self.color is not None:
            self.style.color = self.color

    def to_dict(self) -> dict[str, Any]:
        assert self.style is not None
        d: dict[str, Any] = {
            "id": self.id,
            "tool": self.tool,
            "points": [{"time": int(t), "price": float(p)} for t, p in self.points],
            "style": self.style.to_dict(),
            "paneId": self.pane_id,
            # server objects are always read-only on the client
            "locked": True,
            "visible": True,
            "completed": True,
            "selected": False,
            "origin": "server",
        }
        if self.text is not None:
            d["text"] = self.text
        if self.position_data is not None:
            d["positionData"] = self.position_data.to_dict()
        if self.fib_levels is not None:
            d["fibLevels"] = self.fib_levels
        return d


# ═══════════════════════════ line tools ═════════════════════════════

def trendline(a: tuple[int, float], b: tuple[int, float], **kw: Any) -> Drawing:
    """A straight line between two points."""
    return Drawing(tool="trendline", points=[a, b], **kw)


def ray(a: tuple[int, float], b: tuple[int, float], **kw: Any) -> Drawing:
    """A ray that extends past the second point."""
    return Drawing(tool="ray", points=[a, b], **kw)


def extended(a: tuple[int, float], b: tuple[int, float], **kw: Any) -> Drawing:
    """A line extended infinitely in both directions."""
    return Drawing(tool="extended", points=[a, b], **kw)


def horizontal(time: int, price: float, **kw: Any) -> Drawing:
    """A horizontal line at a price."""
    return Drawing(tool="horizontal", points=[(time, price)], **kw)


def vertical(time: int, price: float = 0.0, **kw: Any) -> Drawing:
    """A vertical line at a time."""
    return Drawing(tool="vertical", points=[(time, price)], **kw)


def arrow(a: tuple[int, float], b: tuple[int, float], **kw: Any) -> Drawing:
    """A directional arrow from a to b."""
    return Drawing(tool="arrow", points=[a, b], **kw)


def polyline(points: list[tuple[int, float]], **kw: Any) -> Drawing:
    """A multi-segment line through all given points."""
    return Drawing(tool="polyline", points=points, **kw)


# ═══════════════════════════ shape tools ════════════════════════════

def rectangle(a: tuple[int, float], b: tuple[int, float], **kw: Any) -> Drawing:
    """A rectangle defined by two diagonal corners."""
    return Drawing(tool="rectangle", points=[a, b], **kw)


def ellipse(a: tuple[int, float], b: tuple[int, float], **kw: Any) -> Drawing:
    """An ellipse inscribed in the two-point bounding box."""
    return Drawing(tool="ellipse", points=[a, b], **kw)


def parallel_channel(a: tuple[int, float], b: tuple[int, float], c: tuple[int, float], **kw: Any) -> Drawing:
    """A parallel channel: a base line (a, b) plus a width point (c)."""
    return Drawing(tool="parallelChannel", points=[a, b, c], **kw)


# ═══════════════════════════ fibonacci tools ════════════════════════

def fib_retracement(
    a: tuple[int, float], b: tuple[int, float], *, levels: list[dict[str, Any]] | None = None, **kw: Any
) -> Drawing:
    """Fibonacci retracement between two points.

    Pass ``levels`` to customise; defaults to :data:`DEFAULT_FIB_LEVELS`.
    """
    return Drawing(tool="fibRetracement", points=[a, b],
                   fib_levels=levels or [dict(x) for x in DEFAULT_FIB_LEVELS], **kw)


def fib_extension(
    a: tuple[int, float], b: tuple[int, float], c: tuple[int, float],
    *, levels: list[dict[str, Any]] | None = None, **kw: Any
) -> Drawing:
    """Fibonacci extension (three points)."""
    return Drawing(tool="fibExtension", points=[a, b, c],
                   fib_levels=levels or [dict(x) for x in DEFAULT_FIB_LEVELS], **kw)


# ═══════════════════════════ text & position tools ══════════════════

def text_label(time: int, price: float, text: str, **kw: Any) -> Drawing:
    """A text label anchored at a point."""
    return Drawing(tool="text", points=[(time, price)], text=text, **kw)


def long_position(
    entry: tuple[int, float], end_time: int, *,
    stop_loss: float, take_profit: float, quantity: float = 1.0, **kw: Any
) -> Drawing:
    """A long-position tool with entry/SL/TP and an auto R/R computation."""
    entry_price = entry[1]
    risk = abs(entry_price - stop_loss) * quantity
    reward = abs(take_profit - entry_price) * quantity
    return Drawing(
        tool="longPosition", points=[entry, (end_time, entry_price)],
        position_data=PositionData(entry_price, stop_loss, take_profit, quantity, risk, reward), **kw,
    )


def short_position(
    entry: tuple[int, float], end_time: int, *,
    stop_loss: float, take_profit: float, quantity: float = 1.0, **kw: Any
) -> Drawing:
    """A short-position tool with entry/SL/TP and an auto R/R computation."""
    entry_price = entry[1]
    risk = abs(stop_loss - entry_price) * quantity
    reward = abs(entry_price - take_profit) * quantity
    return Drawing(
        tool="shortPosition", points=[entry, (end_time, entry_price)],
        position_data=PositionData(entry_price, stop_loss, take_profit, quantity, risk, reward), **kw,
    )
