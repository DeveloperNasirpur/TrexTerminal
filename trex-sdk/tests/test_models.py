"""Model validation and serialisation tests."""
import math

import pytest

from trex import Candle, Drawing, Point, histogram, line, trendline
from trex.sanitize import sanitize_candles, sanitize_points


def test_candle_to_dict():
    c = Candle(time=1718100000, open=1, high=2, low=0.5, close=1.5, volume=10)
    d = c.to_dict()
    assert d == {"time": 1718100000, "open": 1, "high": 2, "low": 0.5, "close": 1.5, "volume": 10}


def test_candle_rejects_non_finite():
    with pytest.raises(ValueError):
        Candle(time=1, open=math.nan, high=2, low=0, close=1)


def test_candle_volume_optional():
    assert "volume" not in Candle(time=1, open=1, high=2, low=0, close=1).to_dict()


def test_point_rejects_non_finite():
    with pytest.raises(ValueError):
        Point(time=1, value=math.inf)


def test_series_factory_defaults():
    s = line("k", "Label").to_dict()
    assert s["key"] == "k" and s["type"] == "line" and s["pane"] == "main"
    assert s["paneId"] == "k"  # defaults to key


def test_histogram_in_sub_pane():
    assert histogram("v", "Vol").to_dict()["pane"] == "sub"


def test_sanitize_candles_sorts_and_dedupes():
    cs = [Candle(time=3, open=1, high=1, low=1, close=1),
          Candle(time=1, open=1, high=1, low=1, close=1),
          Candle(time=3, open=2, high=2, low=2, close=2)]  # dupe time=3
    out = sanitize_candles(cs)
    assert [c.time for c in out] == [1, 3]
    assert out[1].close == 2  # last write wins


def test_sanitize_points_drops_non_finite():
    pts = [Point(time=1, value=1.0), Point(time=2, value=2.0)]
    assert len(sanitize_points(pts)) == 2


def test_drawing_min_points_enforced():
    with pytest.raises(ValueError):
        Drawing(tool="trendline", points=[(1, 1.0)])  # needs 2


def test_drawing_is_server_locked():
    d = trendline((1, 1.0), (2, 2.0)).to_dict()
    assert d["locked"] is True and d["origin"] == "server"


def test_unknown_tool_rejected():
    with pytest.raises(ValueError):
        Drawing(tool="bogus", points=[(1, 1.0), (2, 2.0)])
