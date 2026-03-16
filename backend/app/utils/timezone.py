"""Timezone conversion utilities."""

from datetime import datetime, date, time, timedelta
import pytz
from app.config import get_settings


def get_business_tz():
    """Get the configured business timezone."""
    return pytz.timezone(get_settings().business_timezone)


def to_utc(local_dt: datetime) -> datetime:
    """Convert a naive local datetime to UTC."""
    tz = get_business_tz()
    if local_dt.tzinfo is None:
        local_dt = tz.localize(local_dt)
    return local_dt.astimezone(pytz.utc)


def to_local(utc_dt: datetime) -> datetime:
    """Convert a UTC datetime to local business timezone."""
    tz = get_business_tz()
    if utc_dt.tzinfo is None:
        utc_dt = pytz.utc.localize(utc_dt)
    return utc_dt.astimezone(tz)


def get_session_date(punch_time_utc: datetime) -> date:
    """Determine the session date from a UTC punch time (in local time)."""
    local_time = to_local(punch_time_utc)
    return local_time.date()


def get_midnight_utc(session_date: date) -> datetime:
    """Get midnight (end-of-day 23:59:59) for a session_date in UTC."""
    tz = get_business_tz()
    local_midnight = tz.localize(
        datetime.combine(session_date, time(23, 59, 59))
    )
    return local_midnight.astimezone(pytz.utc)


def get_start_of_day_utc(session_date: date) -> datetime:
    """Get start of day (00:00:00) for a session_date in UTC."""
    tz = get_business_tz()
    local_start = tz.localize(
        datetime.combine(session_date, time(0, 0, 0))
    )
    return local_start.astimezone(pytz.utc)


def parse_device_datetime(dt_str: str) -> datetime:
    """Parse a datetime string from the biometric device (local time) into UTC."""
    # Device sends format: "2026-02-05 09:00:00"
    naive = datetime.strptime(dt_str.strip(), "%Y-%m-%d %H:%M:%S")
    return to_utc(naive)
