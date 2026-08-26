"""Identifier and timestamp helpers shared by the repository modules."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime


def new_id() -> str:
    """A fresh UUID4 string."""
    return str(uuid.uuid4())


def now_iso() -> str:
    """Current UTC time as an ISO-8601 string."""
    return datetime.now(UTC).isoformat()
