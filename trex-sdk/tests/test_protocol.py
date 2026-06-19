"""Protocol constant tests."""
from trex import PROTOCOL_VERSION, __version__


def test_protocol_version():
    assert PROTOCOL_VERSION == "2.0.0"


def test_sdk_version():
    assert __version__ == "1.0.0"
