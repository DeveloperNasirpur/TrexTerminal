"""Candle (OHLC) and indicator point models.

Time is **unix seconds** everywhere (never milliseconds), matching the
Trex Terminal wire protocol. Models are plain dataclasses so the SDK has
no heavy runtime dependency; ``to_dict`` produces the exact JSON shape the
terminal expects.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class Candle:
    """A single OHLC bar.

    Args:
        time: Unix timestamp in **seconds** (strictly increasing & unique
            across a series).
        open: Opening price.
        high: Highest price.
        low: Lowest price.
        close: Closing price.
        volume: Optional traded volume.
    """

    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None

    def __post_init__(self) -> None:
        for name in ("open", "high", "low", "close"):
            v = getattr(self, name)
            if not isinstance(v, (int, float)) or not math.isfinite(float(v)):
                raise ValueError(f"Candle.{name} must be a finite number, got {v!r}")
        if not isinstance(self.time, (int, float)) or not math.isfinite(float(self.time)):
            raise ValueError(f"Candle.time must be a finite number, got {self.time!r}")
        self.time = int(self.time)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "time": self.time,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
        }
        if self.volume is not None:
            d["volume"] = self.volume
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Candle:
        return cls(
            time=int(d["time"]),
            open=float(d["open"]),
            high=float(d["high"]),
            low=float(d["low"]),
            close=float(d["close"]),
            volume=float(d["volume"]) if d.get("volume") is not None else None,
        )


@dataclass(slots=True)
class Point:
    """One value of an indicator series, keyed by its definition ``key``.

    Args:
        time: Unix seconds.
        value: The series value at this time.
        color: Optional per-point color (e.g. red/green histogram bars).
    """

    time: int
    value: float
    color: str | None = None

    def __post_init__(self) -> None:
        if not math.isfinite(float(self.value)):
            raise ValueError(f"Point.value must be finite, got {self.value!r}")
        self.time = int(self.time)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"time": self.time, "value": self.value}
        if self.color is not None:
            d["color"] = self.color
        return d
