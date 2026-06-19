"""Indicator series definitions.

A :class:`SeriesDefinition` tells the terminal how to *render* a series.
The data itself arrives separately as :class:`~trex.models.candles.Point`
lists keyed by ``key``. Typed factories (:func:`line`, :func:`histogram`,
…) give ergonomic, IDE-friendly construction.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

SeriesType = Literal["line", "histogram", "area", "baseline", "scatter"]
Pane = Literal["main", "sub"]


@dataclass(slots=True)
class SeriesDefinition:
    """Visual definition of one indicator series.

    Args:
        key: Unique id; point data arrives under this key.
        label: Legend text.
        pane: ``"main"`` overlays price, ``"sub"`` gets its own pane.
        type: Render style.
        color: Primary color (hex).
        pane_id: Sub-series sharing a ``pane_id`` share one sub-pane.
        line_width: Stroke width in px.
        line_style: 0 solid · 1 dotted · 2 dashed.
        color_pos / color_neg: Histogram/baseline colors by sign.
        digits: Price precision in the legend.
        sub_pane_height: Height in px for sub panes.
        price_line_visible / last_value_visible: Display toggles.
        base_value: Baseline type only.
        levels: Optional horizontal guide lines.
    """

    key: str
    label: str
    pane: Pane = "main"
    type: SeriesType = "line"
    color: str = "#2962FF"
    pane_id: str | None = None
    line_width: int = 2
    line_style: int = 0
    color_pos: str | None = None
    color_neg: str | None = None
    digits: int = 2
    sub_pane_height: int = 120
    price_line_visible: bool = False
    last_value_visible: bool = True
    base_value: float | None = None
    levels: list[dict[str, Any]] = field(default_factory=list)
    meta: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "key": self.key,
            "label": self.label,
            "pane": self.pane,
            "paneId": self.pane_id or self.key,
            "type": self.type,
            "color": self.color,
            "lineWidth": self.line_width,
            "lineStyle": self.line_style,
            "digits": self.digits,
            "subPaneHeight": self.sub_pane_height,
            "priceLineVisible": self.price_line_visible,
            "lastValueVisible": self.last_value_visible,
            "visible": True,
            "scaleMargins": {"top": 0.1, "bottom": 0.1},
        }
        if self.color_pos is not None:
            d["colorPos"] = self.color_pos
        if self.color_neg is not None:
            d["colorNeg"] = self.color_neg
        if self.base_value is not None:
            d["baseValue"] = self.base_value
        if self.levels:
            d["levels"] = self.levels
        if self.meta is not None:
            d["meta"] = self.meta
        return d


# ── typed factories ──────────────────────────────────────────────────

def line(key: str, label: str, *, pane: Pane = "main", color: str = "#2962FF", **kw: Any) -> SeriesDefinition:
    """A line series (moving averages, RSI, …)."""
    return SeriesDefinition(key=key, label=label, pane=pane, type="line", color=color, **kw)


def histogram(key: str, label: str, *, pane: Pane = "sub", color: str = "#26A69A", **kw: Any) -> SeriesDefinition:
    """A histogram series (MACD, volume, …)."""
    return SeriesDefinition(key=key, label=label, pane=pane, type="histogram", color=color, **kw)


def area(key: str, label: str, *, pane: Pane = "main", color: str = "#2962FF", **kw: Any) -> SeriesDefinition:
    """A line with a gradient fill."""
    return SeriesDefinition(key=key, label=label, pane=pane, type="area", color=color, **kw)


def baseline(key: str, label: str, *, pane: Pane = "main", base_value: float = 0.0, **kw: Any) -> SeriesDefinition:
    """A series split by color above/below a base value."""
    return SeriesDefinition(key=key, label=label, pane=pane, type="baseline", base_value=base_value, **kw)


def scatter(key: str, label: str, *, pane: Pane = "main", color: str = "#2962FF", **kw: Any) -> SeriesDefinition:
    """Discrete dots (signals, markers)."""
    return SeriesDefinition(key=key, label=label, pane=pane, type="scatter", color=color, **kw)
