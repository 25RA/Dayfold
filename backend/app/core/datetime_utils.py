from __future__ import annotations
from datetime import datetime
from typing import Optional


def validate_timezone_aware(v: Optional[datetime]) -> Optional[datetime]:
    if v is not None and (v.tzinfo is None or v.utcoffset() is None):
        raise ValueError("Timestamp must include an explicit timezone (e.g., 'Z' or '+00:00')")
    return v
