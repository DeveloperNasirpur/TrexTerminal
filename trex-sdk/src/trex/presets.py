"""Ready-made indicator *definitions* (appearance presets).

These helpers return fully-styled :class:`~trex.models.series.SeriesDefinition`
objects for every common indicator — correct pane, colors, line styles and
guide levels — so you never hand-configure the look of an RSI or a MACD.

**They do not compute anything.** Trex is display-only: you compute the
indicator values yourself (with pandas-ta, TA-Lib, numpy, …) and push them
as :class:`~trex.models.candles.Point` lists under the matching ``key``.
Each preset's docstring states exactly which key(s) it expects.

Single-series presets return one ``SeriesDefinition``; multi-series presets
(Bollinger, MACD, Stochastic, Ichimoku) return a ``list`` of them — pass the
list straight to ``session.define(*preset)`` and push points per key.

Example:
    >>> from trex.presets import rsi, macd
    >>> await session.define(rsi())                 # one sub-pane series
    >>> await session.push_points("rsi", my_rsi)
    >>>
    >>> await session.define(*macd())               # three series, one pane
    >>> await session.push_points("macd", my_macd_line)
    >>> await session.push_points("macd_signal", my_signal)
    >>> await session.push_points("macd_hist", my_hist)
"""

from __future__ import annotations

from typing import Any

from trex.models.series import SeriesDefinition

# ── shared palette (kept consistent with the terminal's look) ────────
_BLUE = "#2962FF"
_ORANGE = "#FF9800"
_PURPLE = "#AB47BC"
_TEAL = "#26A69A"
_RED = "#F23645"
_GREEN = "#089981"
_YELLOW = "#FCD535"
_GREY = "#787B86"


def _level(value: float, label: str, *, color: str = _GREY, style: int = 2) -> dict[str, Any]:
    """Build one horizontal guide line for a sub-pane indicator."""
    return {"value": value, "color": color, "lineStyle": style, "label": label}


# ═══════════════════════════ overlays (main pane) ═════════════════════

def sma(period: int = 20, *, color: str = _BLUE, key: str = "sma") -> SeriesDefinition:
    """Simple Moving Average overlay. Push points under ``key`` (default ``"sma"``)."""
    return SeriesDefinition(key=key, label=f"SMA {period}", pane="main", type="line",
                            color=color, line_width=2)


def ema(period: int = 50, *, color: str = _ORANGE, key: str = "ema") -> SeriesDefinition:
    """Exponential Moving Average overlay."""
    return SeriesDefinition(key=key, label=f"EMA {period}", pane="main", type="line",
                            color=color, line_width=2)


def wma(period: int = 20, *, color: str = _PURPLE, key: str = "wma") -> SeriesDefinition:
    """Weighted Moving Average overlay."""
    return SeriesDefinition(key=key, label=f"WMA {period}", pane="main", type="line",
                            color=color, line_width=2)


def vwap(*, color: str = _BLUE, key: str = "vwap") -> SeriesDefinition:
    """Volume-Weighted Average Price overlay."""
    return SeriesDefinition(key=key, label="VWAP", pane="main", type="line",
                            color=color, line_width=2)


def bollinger(period: int = 20, *, color: str = _BLUE) -> list[SeriesDefinition]:
    """Bollinger Bands — three overlay series.

    Keys: ``bb_upper``, ``bb_mid``, ``bb_lower``.
    """
    return [
        SeriesDefinition(key="bb_upper", label=f"BB Upper ({period})", pane="main",
                         type="line", color=color, line_width=1, line_style=2),
        SeriesDefinition(key="bb_mid", label="BB Basis", pane="main",
                         type="line", color=color, line_width=1),
        SeriesDefinition(key="bb_lower", label=f"BB Lower ({period})", pane="main",
                         type="line", color=color, line_width=1, line_style=2),
    ]


def keltner(*, color: str = _TEAL) -> list[SeriesDefinition]:
    """Keltner Channel — keys ``kc_upper``, ``kc_mid``, ``kc_lower``."""
    return [
        SeriesDefinition(key="kc_upper", label="KC Upper", pane="main", type="line",
                         color=color, line_width=1, line_style=2),
        SeriesDefinition(key="kc_mid", label="KC Basis", pane="main", type="line",
                         color=color, line_width=1),
        SeriesDefinition(key="kc_lower", label="KC Lower", pane="main", type="line",
                         color=color, line_width=1, line_style=2),
    ]


def donchian(*, color: str = _BLUE) -> list[SeriesDefinition]:
    """Donchian Channel — keys ``dc_upper``, ``dc_mid``, ``dc_lower``."""
    return [
        SeriesDefinition(key="dc_upper", label="Donchian Upper", pane="main", type="line",
                         color=color, line_width=1),
        SeriesDefinition(key="dc_mid", label="Donchian Mid", pane="main", type="line",
                         color=color, line_width=1, line_style=2),
        SeriesDefinition(key="dc_lower", label="Donchian Lower", pane="main", type="line",
                         color=color, line_width=1),
    ]


def supertrend(*, color: str = _GREEN, key: str = "supertrend") -> SeriesDefinition:
    """SuperTrend overlay. Use per-point colors to flip green/red on trend change."""
    return SeriesDefinition(key=key, label="SuperTrend", pane="main", type="line",
                            color=color, line_width=2)


def psar(*, color: str = _YELLOW, key: str = "psar") -> SeriesDefinition:
    """Parabolic SAR — dots overlaid on price."""
    return SeriesDefinition(key=key, label="Parabolic SAR", pane="main", type="scatter",
                            color=color)


def ichimoku() -> list[SeriesDefinition]:
    """Ichimoku Cloud — keys ``tenkan``, ``kijun``, ``senkou_a``, ``senkou_b``, ``chikou``."""
    return [
        SeriesDefinition(key="tenkan", label="Tenkan-sen", pane="main", type="line", color=_BLUE, line_width=1),
        SeriesDefinition(key="kijun", label="Kijun-sen", pane="main", type="line", color=_RED, line_width=1),
        SeriesDefinition(key="senkou_a", label="Senkou A", pane="main", type="line", color=_GREEN, line_width=1),
        SeriesDefinition(key="senkou_b", label="Senkou B", pane="main", type="line", color=_ORANGE, line_width=1),
        SeriesDefinition(key="chikou", label="Chikou", pane="main", type="line", color=_PURPLE, line_width=1),
    ]


# ═══════════════════════════ oscillators (sub pane) ══════════════════

def rsi(period: int = 14, *, color: str = _PURPLE, key: str = "rsi") -> SeriesDefinition:
    """Relative Strength Index with 30/70 guide levels (sub-pane)."""
    return SeriesDefinition(
        key=key, label=f"RSI ({period})", pane="sub", type="line", color=color,
        line_width=2, digits=2,
        levels=[_level(70, "70", color=_RED), _level(50, "50"), _level(30, "30", color=_GREEN)],
    )


def macd(*, fast: int = 12, slow: int = 26, signal: int = 9) -> list[SeriesDefinition]:
    """MACD — three series in one sub-pane.

    Keys: ``macd`` (line), ``macd_signal`` (line), ``macd_hist`` (histogram).
    """
    return [
        SeriesDefinition(key="macd", label=f"MACD ({fast},{slow})", pane="sub", pane_id="macd",
                         type="line", color=_BLUE, line_width=2),
        SeriesDefinition(key="macd_signal", label=f"Signal ({signal})", pane="sub", pane_id="macd",
                         type="line", color=_ORANGE, line_width=2),
        SeriesDefinition(key="macd_hist", label="Histogram", pane="sub", pane_id="macd",
                         type="histogram", color=_TEAL, color_pos=_GREEN, color_neg=_RED),
    ]


def stochastic(*, k: int = 14, d: int = 3) -> list[SeriesDefinition]:
    """Stochastic %K / %D with 20/80 levels — keys ``stoch_k``, ``stoch_d``."""
    return [
        SeriesDefinition(key="stoch_k", label=f"%K ({k})", pane="sub", pane_id="stoch",
                         type="line", color=_BLUE, line_width=2,
                         levels=[_level(80, "80", color=_RED), _level(20, "20", color=_GREEN)]),
        SeriesDefinition(key="stoch_d", label=f"%D ({d})", pane="sub", pane_id="stoch",
                         type="line", color=_ORANGE, line_width=2),
    ]


def stoch_rsi(*, key: str = "stoch_rsi") -> SeriesDefinition:
    """Stochastic RSI with 20/80 levels (sub-pane)."""
    return SeriesDefinition(key=key, label="Stoch RSI", pane="sub", type="line", color=_PURPLE,
                            line_width=2, levels=[_level(80, "80", color=_RED), _level(20, "20", color=_GREEN)])


def atr(period: int = 14, *, color: str = _ORANGE, key: str = "atr") -> SeriesDefinition:
    """Average True Range (sub-pane)."""
    return SeriesDefinition(key=key, label=f"ATR ({period})", pane="sub", type="line",
                            color=color, line_width=2)


def adx(period: int = 14, *, color: str = _BLUE, key: str = "adx") -> SeriesDefinition:
    """Average Directional Index with a 25 trend-strength level (sub-pane)."""
    return SeriesDefinition(key=key, label=f"ADX ({period})", pane="sub", type="line",
                            color=color, line_width=2, levels=[_level(25, "25")])


def cci(period: int = 20, *, color: str = _PURPLE, key: str = "cci") -> SeriesDefinition:
    """Commodity Channel Index with +100/-100 levels (sub-pane)."""
    return SeriesDefinition(key=key, label=f"CCI ({period})", pane="sub", type="line",
                            color=color, line_width=2,
                            levels=[_level(100, "100", color=_RED), _level(-100, "-100", color=_GREEN)])


def williams_r(period: int = 14, *, color: str = _TEAL, key: str = "williams_r") -> SeriesDefinition:
    """Williams %R with -20/-80 levels (sub-pane)."""
    return SeriesDefinition(key=key, label=f"Williams %R ({period})", pane="sub", type="line",
                            color=color, line_width=2,
                            levels=[_level(-20, "-20", color=_RED), _level(-80, "-80", color=_GREEN)])


def momentum(period: int = 10, *, color: str = _BLUE, key: str = "momentum") -> SeriesDefinition:
    """Momentum histogram around zero (sub-pane)."""
    return SeriesDefinition(key=key, label=f"Momentum ({period})", pane="sub", type="histogram",
                            color=color, color_pos=_GREEN, color_neg=_RED, levels=[_level(0, "0")])


def mfi(period: int = 14, *, color: str = _PURPLE, key: str = "mfi") -> SeriesDefinition:
    """Money Flow Index with 20/80 levels (sub-pane)."""
    return SeriesDefinition(key=key, label=f"MFI ({period})", pane="sub", type="line",
                            color=color, line_width=2,
                            levels=[_level(80, "80", color=_RED), _level(20, "20", color=_GREEN)])


def obv(*, color: str = _BLUE, key: str = "obv") -> SeriesDefinition:
    """On-Balance Volume (sub-pane)."""
    return SeriesDefinition(key=key, label="OBV", pane="sub", type="line", color=color, line_width=2)


def volume(*, key: str = "volume") -> SeriesDefinition:
    """Volume histogram (sub-pane). Use per-point colors for up/down bars."""
    return SeriesDefinition(key=key, label="Volume", pane="sub", type="histogram",
                            color=_TEAL, color_pos=_GREEN, color_neg=_RED)


# A name->factory registry, handy for building menus or iterating presets.
ALL_PRESETS = {
    "sma": sma, "ema": ema, "wma": wma, "vwap": vwap, "bollinger": bollinger,
    "keltner": keltner, "donchian": donchian, "supertrend": supertrend, "psar": psar,
    "ichimoku": ichimoku, "rsi": rsi, "macd": macd, "stochastic": stochastic,
    "stoch_rsi": stoch_rsi, "atr": atr, "adx": adx, "cci": cci, "williams_r": williams_r,
    "momentum": momentum, "mfi": mfi, "obv": obv, "volume": volume,
}
