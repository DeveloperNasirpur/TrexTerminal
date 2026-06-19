"""Preset indicator-definition tests."""
import pytest

from trex import presets
from trex.models.series import SeriesDefinition
from trex.presets import ALL_PRESETS

MULTI = {"bollinger", "keltner", "donchian", "ichimoku", "macd", "stochastic"}


def test_rsi_has_guide_levels():
    d = presets.rsi().to_dict()
    assert [lvl["value"] for lvl in d["levels"]] == [70, 50, 30]
    assert d["pane"] == "sub"


def test_macd_is_three_series_one_pane():
    m = presets.macd()
    assert [s.key for s in m] == ["macd", "macd_signal", "macd_hist"]
    assert all(s.to_dict()["paneId"] == "macd" for s in m)
    assert m[2].type == "histogram"


def test_bollinger_three_overlays():
    bb = presets.bollinger()
    assert [s.key for s in bb] == ["bb_upper", "bb_mid", "bb_lower"]
    assert all(s.pane == "main" for s in bb)


def test_overlays_are_main_pane():
    for fn in (presets.sma, presets.ema, presets.wma, presets.vwap):
        assert fn().pane == "main"


def test_oscillators_are_sub_pane():
    for fn in (presets.rsi, presets.atr, presets.adx, presets.cci, presets.mfi):
        assert fn().pane == "sub"


@pytest.mark.parametrize("name", list(ALL_PRESETS))
def test_every_preset_serialises(name):
    out = ALL_PRESETS[name]()
    defs = out if isinstance(out, list) else [out]
    assert all(isinstance(d, SeriesDefinition) for d in defs)
    for d in defs:
        dd = d.to_dict()
        assert dd["key"] and dd["type"] in {"line", "histogram", "area", "baseline", "scatter"}


def test_registry_count():
    assert len(ALL_PRESETS) == 22
