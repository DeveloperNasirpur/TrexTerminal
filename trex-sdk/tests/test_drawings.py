"""Drawing helper tests — full tool coverage."""
import pytest

from trex import (
    Drawing,
    DrawingStyle,
    arrow,
    ellipse,
    extended,
    fib_extension,
    fib_retracement,
    horizontal,
    long_position,
    parallel_channel,
    polyline,
    ray,
    rectangle,
    short_position,
    text_label,
    trendline,
    vertical,
)

A = (1718100000, 100.0)
B = (1718100600, 110.0)
C = (1718101200, 105.0)


def test_all_line_tools():
    assert trendline(A, B).to_dict()["tool"] == "trendline"
    assert ray(A, B).to_dict()["tool"] == "ray"
    assert extended(A, B).to_dict()["tool"] == "extended"
    assert horizontal(1718100000, 100).to_dict()["tool"] == "horizontal"
    assert vertical(1718100000).to_dict()["tool"] == "vertical"
    assert arrow(A, B).to_dict()["tool"] == "arrow"
    assert polyline([A, B, C]).to_dict()["tool"] == "polyline"


def test_shapes():
    assert rectangle(A, B).to_dict()["tool"] == "rectangle"
    assert ellipse(A, B).to_dict()["tool"] == "ellipse"
    pc = parallel_channel(A, B, C).to_dict()
    assert pc["tool"] == "parallelChannel" and len(pc["points"]) == 3


def test_all_drawings_are_server_locked():
    for d in (trendline(A, B), rectangle(A, B), fib_retracement(A, B)):
        dd = d.to_dict()
        assert dd["locked"] is True and dd["origin"] == "server"


def test_fib_has_default_levels():
    d = fib_retracement(A, B).to_dict()
    assert "fibLevels" in d
    assert any(lvl["value"] == 0.618 for lvl in d["fibLevels"])


def test_fib_extension_three_points():
    d = fib_extension(A, B, C).to_dict()
    assert len(d["points"]) == 3 and "fibLevels" in d


def test_text_label():
    d = text_label(1718100000, 100, "breakout").to_dict()
    assert d["tool"] == "text" and d["text"] == "breakout"


def test_long_position_computes_rr():
    d = long_position(A, end_time=1718100600, stop_loss=95, take_profit=120, quantity=2)
    pd = d.to_dict()["positionData"]
    assert pd["risk"] == pytest.approx((100 - 95) * 2)
    assert pd["reward"] == pytest.approx((120 - 100) * 2)


def test_short_position_computes_rr():
    d = short_position(A, end_time=1718100600, stop_loss=105, take_profit=90)
    pd = d.to_dict()["positionData"]
    assert pd["risk"] == pytest.approx(5)
    assert pd["reward"] == pytest.approx(10)


def test_custom_style():
    d = Drawing(tool="rectangle", points=[A, B],
                style=DrawingStyle(color="#FF0000", fill_opacity=0.3, line_style=2))
    s = d.to_dict()["style"]
    assert s["color"] == "#FF0000" and s["fillOpacity"] == 0.3 and s["lineStyle"] == 2


def test_min_points_enforced():
    parallel_channel(A, B, C)  # 3 points → ok, no raise
    with pytest.raises(ValueError):
        Drawing(tool="parallelChannel", points=[A, B])  # needs 3
