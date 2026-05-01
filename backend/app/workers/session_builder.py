"""Session Builder Worker — §4 Session Pairing Algorithm.

Implements time-ordered greedy pairing (device-agnostic).
First punch = IN, next punch = OUT. Session pairing is keyed
on employee_id + session_date, not device.
"""

import logging
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from app.database import get_supabase
from app.utils.timezone import get_session_date, to_local, to_utc, get_business_tz

logger = logging.getLogger(__name__)

_builder_lock = asyncio.Lock()

async def run_session_builder():
    """Main entry point: process all unprocessed punches."""
    if _builder_lock.locked():
        logger.info("Session Builder already running. Skipping concurrent trigger.")
        return {"processed": 0, "errors": 0, "message": "Already running"}

    async with _builder_lock:
        db = get_supabase()

        # Fetch unprocessed punches, ordered by punch_time ASC (time-ordered pairing)
        result = db.table("raw_punches") \
            .select("*") \
            .eq("is_processed", False) \
            .is_("duplicate_of", "null") \
            .order("punch_time", desc=False) \
            .execute()

        if not result.data:
            return {"processed": 0, "errors": 0}

        logger.info(f"Session Builder: {len(result.data)} unprocessed punches found")

        processed = 0
        errors = 0
        affected_sessions = set()  # (employee_id, session_date) pairs

        for punch in result.data:
            # Yield control to the event loop to prevent freezing the server
            await asyncio.sleep(0.01)
            
            try:
                session_info = await _process_punch(db, punch)
                if session_info:
                    affected_sessions.add(session_info)
                processed += 1
            except Exception as e:
                logger.error(f"Error processing punch {punch['id']}: {e}")
                errors += 1

        # After all punches processed, run Override Applicator for affected sessions
        if affected_sessions:
            from app.workers.override_applicator import apply_overrides_for_sessions
            await apply_overrides_for_sessions(list(affected_sessions))

        logger.info(f"Session Builder complete: {processed} processed, {errors} errors")
        return {"processed": processed, "errors": errors}


async def _process_punch(db, punch: dict) -> Optional[tuple]:
    """Process a single raw punch. Returns (employee_id, session_date) if session was affected."""

    device_user_id = punch["device_user_id"]
    punch_time_str = punch["punch_time"]
    device_sn = punch["device_sn"]

    # Parse punch_time (stored as UTC ISO string)
    if isinstance(punch_time_str, str):
        punch_time = datetime.fromisoformat(punch_time_str.replace("Z", "+00:00"))
    else:
        punch_time = punch_time_str

    # 1. RESOLVE employee from device_user_id
    emp_result = db.table("employees") \
        .select("id, shift_id, joining_date, exit_date, is_active") \
        .eq("device_user_id", device_user_id) \
        .eq("is_active", True) \
        .execute()

    if not emp_result.data:
        logger.warning(f"Unmapped device_user_id: {device_user_id} (punch {punch['id']})")
        # Mark as processed but unmapped
        db.table("raw_punches").update({"is_processed": True}).eq("id", punch["id"]).execute()
        return None

    employee = emp_result.data[0]
    employee_id = employee["id"]

    # Check joining_date / exit_date bounds
    session_date = get_session_date(punch_time)

    if employee.get("joining_date"):
        joining = datetime.strptime(employee["joining_date"], "%Y-%m-%d").date() if isinstance(employee["joining_date"], str) else employee["joining_date"]
        if session_date < joining:
            logger.info(f"Punch {punch['id']} before joining date for employee {employee_id}")
            db.table("raw_punches").update({"is_processed": True}).eq("id", punch["id"]).execute()
            return None

    if employee.get("exit_date"):
        exit_d = datetime.strptime(employee["exit_date"], "%Y-%m-%d").date() if isinstance(employee["exit_date"], str) else employee["exit_date"]
        if session_date > exit_d:
            logger.info(f"Punch {punch['id']} after exit date for employee {employee_id}")
            db.table("raw_punches").update({"is_processed": True}).eq("id", punch["id"]).execute()
            return None

    # 2. DETERMINE session_date
    session_date_str = session_date.isoformat()

    # 3. Get shift info
    shift = None
    if employee.get("shift_id"):
        shift_result = db.table("shifts").select("*").eq("id", employee["shift_id"]).execute()
        if shift_result.data:
            shift = shift_result.data[0]

    # 4. FIND open session for this employee + date
    open_result = db.table("attendance_sessions") \
        .select("*") \
        .eq("employee_id", employee_id) \
        .eq("session_date", session_date_str) \
        .eq("status", "OPEN") \
        .order("punch_in_time", desc=True) \
        .limit(1) \
        .execute()

    # 5. Derive location from device
    location_id = _get_device_location(db, device_sn)

    if open_result.data:
        # This punch could be PUNCH OUT → check minimum gap first
        session = open_result.data[0]
        punch_in_time = datetime.fromisoformat(session["punch_in_time"].replace("Z", "+00:00"))
        gap_minutes = (punch_time - punch_in_time).total_seconds() / 60

        if gap_minutes < 2:
            # Too close to punch-in → duplicate tap, ignore this punch
            logger.info(
                f"Duplicate punch ignored: employee {employee_id}, "
                f"gap={gap_minutes:.1f}min (< 2min minimum). Punch {punch['id']}"
            )
            # Mark as processed so it doesn't get picked up again
            db.table("raw_punches").update({"is_processed": True}).eq("id", punch["id"]).execute()
            return (employee_id, session_date_str)

        # Gap is valid → close the session
        await _close_session(db, session, punch, punch_time, location_id, shift)
    else:
        # Check for AUTO_CHECKOUT session (reopen logic §7)
        auto_result = db.table("attendance_sessions") \
            .select("*") \
            .eq("employee_id", employee_id) \
            .eq("session_date", session_date_str) \
            .eq("status", "AUTO_CHECKOUT") \
            .order("punch_in_time", desc=True) \
            .limit(1) \
            .execute()

        if auto_result.data:
            # Reopen the auto-checkout session
            session = auto_result.data[0]
            await _reopen_session(db, session, punch, punch_time, location_id, shift)
        else:
            # Check for COMPLETE session to avoid creating duplicate sessions
            # when someone punches multiple times
            complete_result = db.table("attendance_sessions") \
                .select("*") \
                .eq("employee_id", employee_id) \
                .eq("session_date", session_date_str) \
                .eq("status", "COMPLETE") \
                .order("punch_out_time", desc=True) \
                .limit(1) \
                .execute()

            if complete_result.data:
                last_complete = complete_result.data[0]
                last_out_str = last_complete.get("punch_out_time", "")
                if last_out_str:
                    last_out_time = datetime.fromisoformat(last_out_str.replace("Z", "+00:00"))
                    gap_since_last_out = (punch_time - last_out_time).total_seconds() / 60
                    if gap_since_last_out < 2:
                        # Too close to last punch-out → duplicate tap
                        logger.info(
                            f"Duplicate punch ignored (post-checkout): employee {employee_id}, "
                            f"gap={gap_since_last_out:.1f}min since last punch-out. Punch {punch['id']}"
                        )
                        db.table("raw_punches").update({"is_processed": True}).eq("id", punch["id"]).execute()
                        return (employee_id, session_date_str)

            # This punch is PUNCH IN → create new session
            await _create_session(db, employee_id, punch, punch_time, session_date_str, location_id, shift)

    # Mark punch as processed
    db.table("raw_punches").update({"is_processed": True}).eq("id", punch["id"]).execute()

    return (employee_id, session_date_str)


def _get_device_location(db, device_sn: str) -> Optional[str]:
    """Get location_id for a device serial number."""
    result = db.table("devices").select("location_id").eq("device_sn", device_sn).execute()
    if result.data and result.data[0].get("location_id"):
        return result.data[0]["location_id"]
    return None


async def _create_session(db, employee_id: str, punch: dict, punch_time: datetime,
                           session_date_str: str, location_id: Optional[str], shift: Optional[dict]):
    """Create a new OPEN session from a punch-in."""
    session_data = {
        "employee_id": employee_id,
        "session_date": session_date_str,
        "punch_in_id": punch["id"],
        "punch_in_time": punch_time.isoformat(),
        "status": "OPEN",
        "shift_id": shift["id"] if shift else None,
        "punch_in_location_id": location_id,
        "gross_hours": 0,
        "net_hours": 0,
    }

    db.table("attendance_sessions").insert(session_data).execute()
    logger.info(f"Session OPEN: employee={employee_id}, date={session_date_str}, punch_in={punch_time}")


async def _close_session(db, session: dict, punch: dict, punch_time: datetime,
                          location_id: Optional[str], shift: Optional[dict]):
    """Close an open session with a punch-out."""
    punch_in_time = datetime.fromisoformat(session["punch_in_time"].replace("Z", "+00:00"))

    # Calculate hours
    delta = punch_time - punch_in_time
    gross_hours = round(delta.total_seconds() / 3600, 2)

    break_minutes = 0  # No break deduction — pay full shift
    net_hours = max(0, round(gross_hours - (break_minutes / 60), 2))

    # Cross-location check
    is_cross = (
        location_id is not None
        and session.get("punch_in_location_id") is not None
        and location_id != session["punch_in_location_id"]
    )

    # Anomaly flags
    max_hours = float(shift.get("max_allowed_hours", 14)) if shift else 14.0
    if gross_hours > max_hours:
        logger.warning(f"Anomaly: Session {session['id']} gross_hours {gross_hours} > max {max_hours}")
    if gross_hours < 0.5:
        logger.warning(f"Anomaly: Session {session['id']} very short ({gross_hours}h)")

    update_data = {
        "punch_out_id": punch["id"],
        "punch_out_time": punch_time.isoformat(),
        "gross_hours": gross_hours,
        "net_hours": net_hours,
        "status": "COMPLETE",
        "punch_out_location_id": location_id,
        "is_cross_location": is_cross,
    }

    db.table("attendance_sessions").update(update_data).eq("id", session["id"]).execute()
    logger.info(f"Session COMPLETE: {session['id']}, hours={net_hours}")


async def _reopen_session(db, session: dict, punch: dict, punch_time: datetime,
                           location_id: Optional[str], shift: Optional[dict]):
    """Reopen an AUTO_CHECKOUT session with a real punch. §7."""
    punch_in_time = datetime.fromisoformat(session["punch_in_time"].replace("Z", "+00:00"))

    delta = punch_time - punch_in_time
    gross_hours = round(delta.total_seconds() / 3600, 2)

    break_minutes = shift.get("break_minutes", 0) if shift else 0
    net_hours = max(0, round(gross_hours - (break_minutes / 60), 2))

    is_cross = (
        location_id is not None
        and session.get("punch_in_location_id") is not None
        and location_id != session["punch_in_location_id"]
    )

    update_data = {
        "punch_out_id": punch["id"],
        "punch_out_time": punch_time.isoformat(),
        "gross_hours": gross_hours,
        "net_hours": net_hours,
        "status": "REOPENED",
        "auto_checkout_at": session.get("auto_checkout_at"),  # preserve original auto checkout time
        "punch_out_location_id": location_id,
        "is_cross_location": is_cross,
    }

    db.table("attendance_sessions").update(update_data).eq("id", session["id"]).execute()
    logger.info(f"Session REOPENED: {session['id']}, real punch replaced auto-checkout, hours={net_hours}")
