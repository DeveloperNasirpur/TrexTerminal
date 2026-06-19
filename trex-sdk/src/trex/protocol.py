"""Protocol constants and the SDK exception hierarchy."""

from __future__ import annotations

# Must match the terminal's PROTOCOL_VERSION. A parity test enforces this.
PROTOCOL_VERSION = "2.0.0"


class TrexError(Exception):
    """Base class for all SDK errors."""


class ProtocolError(TrexError):
    """Raised on a malformed or unexpected protocol frame."""


class ConnectionError(TrexError):
    """Raised on connection lifecycle problems."""
