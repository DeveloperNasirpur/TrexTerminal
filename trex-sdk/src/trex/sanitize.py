"""Inbound/outbound data sanitisation.

Guarantees the terminal receives clean data: candles form a
strictly-increasing, unique time domain; points drop non-finite values.
Mirrors the terminal's own ``sanitizeCandles`` / ``sanitizePoints`` so the
two sides agree.
"""

from __future__ import annotations

import math
from collections.abc import Iterable

from trex.models.candles import Candle, Point


def sanitize_candles(candles: Iterable[Candle]) -> list[Candle]:
    """Sort by time, drop non-finite/dupe times, keep the last write per time.

    Returns a list with a strictly-increasing, unique time domain.
    """
    by_time: dict[int, Candle] = {}
    for c in candles:
        if not math.isfinite(c.open) or not math.isfinite(c.close):
            continue
        by_time[int(c.time)] = c  # last write wins for a given time
    return [by_time[t] for t in sorted(by_time)]


def sanitize_points(points: Iterable[Point]) -> list[Point]:
    """Drop points with a non-finite value; preserve order and color."""
    return [p for p in points if math.isfinite(p.value)]
