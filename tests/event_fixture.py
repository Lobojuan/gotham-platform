"""Shared dates for API event fixtures.

The production seed event is intentionally allowed to expire and be archived.
Tests that need an open event must create their own one instead of depending on
that historical seed row.
"""

from datetime import datetime, timedelta, timezone


def upcoming_event_dates(days: int = 30) -> tuple[str, str, str]:
    """Return an open UTC event window and the next-day follow-up date."""

    start = (datetime.now(timezone.utc) + timedelta(days=days)).replace(
        hour=14, minute=0, second=0, microsecond=0
    )
    end = start + timedelta(hours=2)
    return (
        start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        (start.date() + timedelta(days=1)).isoformat(),
    )
