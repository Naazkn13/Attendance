"""Auto Checkout Worker — closes OPEN sessions at midnight.

All sessions auto-close at end of the calendar day (23:59:59 IST).
Runs every 15 minutes.
"""

import logging
from datetime import datetime, timedelta

from app.database import get_supabase
from app.utils.timezone import get_midnight_utc
from app.config import get_settings

logger = logging.getLogger(__name__)


async def run_auto_checkout():
    """Main entry point: check all OPEN sessions and auto-close as needed."""
    db = get_supabase()
    settings = get_settings()
    buffer_minutes = settings.auto_checkout_buffer_minutes

    # Get all OPEN sessions (no need for shift join anymore)
    result = db.table("attendance_sessions") \
        .select("*") \
        .eq("status", "OPEN") \
        .execute()

    if not result.data:
        return {"auto_closed": 0}

    now_utc = datetime.utcnow()
    auto_closed = 0

    for session in result.data:
        try:
            closed = await _check_and_close(db, session, now_utc, buffer_minutes)
            if closed:
                auto_closed += 1
        except Exception as e:
            logger.error(f"Error auto-checking session {session['id']}: {e}")

    if auto_closed > 0:
        logger.info(f"Auto Checkout: closed {auto_closed} sessions")

    return {"auto_closed": auto_closed}


async def _check_and_close(db, session: dict, now_utc: datetime, buffer_minutes: int) -> bool:
    """Check if a session should be auto-closed at midnight. Returns True if closed."""

    punch_in_str = session["punch_in_time"]
    if isinstance(punch_in_str, str):
        punch_in_time = datetime.fromisoformat(punch_in_str.replace("Z", "+00:00"))
    else:
        punch_in_time = punch_in_str

    # Deadline = midnight (23:59:59) of the session date
    session_date_str = session["session_date"]
    if isinstance(session_date_str, str):
        from datetime import date as date_type
        session_date = date_type.fromisoformat(session_date_str)
    else:
        session_date = session_date_str

    midnight_deadline = get_midnight_utc(session_date)

    # Make now_utc timezone-aware for comparison
    import pytz
    if now_utc.tzinfo is None:
        now_utc = pytz.utc.localize(now_utc)
    if midnight_deadline.tzinfo is None:
        midnight_deadline = pytz.utc.localize(midnight_deadline)

    # Check if past midnight + buffer
    deadline_with_buffer = midnight_deadline + timedelta(minutes=buffer_minutes)

    if now_utc <= deadline_with_buffer:
        return False  # Still within allowed window

    # Auto close the session at midnight
    delta = midnight_deadline - punch_in_time
    gross_hours = round(delta.total_seconds() / 3600, 2)
    net_hours = gross_hours  # No break deduction — pay full shift

    update_data = {
        "punch_out_time": midnight_deadline.isoformat(),
        "auto_checkout_at": now_utc.isoformat(),
        "gross_hours": gross_hours,
        "net_hours": net_hours,
        "status": "AUTO_CHECKOUT",
    }

    db.table("attendance_sessions").update(update_data).eq("id", session["id"]).execute()

    logger.info(
        f"Auto Checkout: session {session['id']} closed at midnight, hours={net_hours}"
    )
    return True
