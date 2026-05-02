"""Override Applicator — §8 Override System.

Applies active session_overrides to attendance_sessions after
session building or recalculation. Keyed on employee_id + session_date.
"""

import logging
import asyncio
from datetime import datetime
from typing import List, Tuple, Optional

from app.database import get_supabase

logger = logging.getLogger(__name__)


async def apply_overrides_for_sessions(affected_sessions: List[Tuple[str, str]]):
    """Apply overrides for affected (employee_id, session_date) pairs.

    Called after Session Builder processes punches, or during recalculation.
    """
    db = get_supabase()

    for employee_id, session_date in affected_sessions:
        await asyncio.sleep(0.01)
        try:
            await _apply_override(db, employee_id, session_date)
        except Exception as e:
            logger.error(f"Override apply error for {employee_id}/{session_date}: {e}")


async def apply_all_overrides_for_employee(employee_id: str, period_start: str, period_end: str):
    """Apply all overrides for an employee within a date range. Used during recalculation."""
    db = get_supabase()

    overrides = db.table("session_overrides") \
        .select("session_date") \
        .eq("employee_id", employee_id) \
        .eq("is_active", True) \
        .gte("session_date", period_start) \
        .lte("session_date", period_end) \
        .execute()

    if not overrides.data:
        return

    for override in overrides.data:
        await asyncio.sleep(0.01)
        try:
            await _apply_override(db, employee_id, override["session_date"])
        except Exception as e:
            logger.error(f"Override apply error: {e}")


async def _apply_override(db, employee_id: str, session_date: str):
    """Apply the latest active override for a specific employee+date to its session."""

    # Find latest active override for this employee+date
    override_result = db.table("session_overrides") \
        .select("*") \
        .eq("employee_id", employee_id) \
        .eq("session_date", session_date) \
        .eq("is_active", True) \
        .order("created_at", desc=True) \
        .limit(1) \
        .execute()

    if not override_result.data:
        return  # No active override

    override = override_result.data[0]
    override_type = override["override_type"]

    # Find the session to apply to
    session_result = db.table("attendance_sessions") \
        .select("*") \
        .eq("employee_id", employee_id) \
        .eq("session_date", session_date) \
        .order("punch_in_time", desc=True) \
        .limit(1) \
        .execute()

    if override_type in ["MARK_PRESENT", "SET_BOTH"] and not session_result.data:
        # Create synthetic session
        await _create_synthetic_session(db, employee_id, session_date, override)
        return

    if not session_result.data:
        logger.warning(f"No session found for override {override['id']} (employee={employee_id}, date={session_date})")
        return

    session = session_result.data[0]

    # Apply override based on type
    update_data = {"has_override": True}

    if override_type == "SET_PUNCH_OUT":
        if override.get("override_punch_out"):
            punch_in = datetime.fromisoformat(session["punch_in_time"].replace("Z", "+00:00"))
            punch_out = datetime.fromisoformat(override["override_punch_out"].replace("Z", "+00:00"))
            gross_hours = round((punch_out - punch_in).total_seconds() / 3600, 2)

            break_min = 0
            net_hours = max(0, round(gross_hours, 2))

            update_data.update({
                "punch_out_time": override["override_punch_out"],
                "gross_hours": gross_hours,
                "net_hours": net_hours,
            })

    elif override_type == "SET_PUNCH_IN":
        if override.get("override_punch_in"):
            punch_in = datetime.fromisoformat(override["override_punch_in"].replace("Z", "+00:00"))
            update_data["punch_in_time"] = override["override_punch_in"]

            if session.get("punch_out_time"):
                punch_out = datetime.fromisoformat(session["punch_out_time"].replace("Z", "+00:00"))
                gross_hours = round((punch_out - punch_in).total_seconds() / 3600, 2)

                break_min = 0
                net_hours = max(0, round(gross_hours, 2))

                update_data.update({"gross_hours": gross_hours, "net_hours": net_hours})

    elif override_type == "SET_BOTH":
        if override.get("override_punch_in") and override.get("override_punch_out"):
            punch_in = datetime.fromisoformat(override["override_punch_in"].replace("Z", "+00:00"))
            punch_out = datetime.fromisoformat(override["override_punch_out"].replace("Z", "+00:00"))
            gross_hours = round((punch_out - punch_in).total_seconds() / 3600, 2)

            break_min = 0
            net_hours = max(0, round(gross_hours, 2))

            update_data.update({
                "punch_in_time": override["override_punch_in"],
                "punch_out_time": override["override_punch_out"],
                "gross_hours": gross_hours,
                "net_hours": net_hours,
            })

    elif override_type == "MARK_ABSENT":
        update_data["net_hours"] = 0
        update_data["gross_hours"] = 0

    elif override_type == "MARK_PRESENT":
        if override.get("override_net_hours"):
            update_data["net_hours"] = float(override["override_net_hours"])
            update_data["gross_hours"] = float(override["override_net_hours"])

    elif override_type == "OVERRIDE_HOURS":
        if override.get("override_net_hours"):
            update_data["net_hours"] = float(override["override_net_hours"])

    db.table("attendance_sessions").update(update_data).eq("id", session["id"]).execute()
    logger.info(f"Override applied: session={session['id']}, type={override_type}")


async def _create_synthetic_session(db, employee_id: str, session_date: str, override: dict):
    """Create a synthetic session for MARK_PRESENT override when no punches exist."""
    from app.utils.timezone import get_start_of_day_utc
    from datetime import date as date_type

    session_d = date_type.fromisoformat(session_date) if isinstance(session_date, str) else session_date

    # Get employee shift
    emp_result = db.table("employees").select("shift_id").eq("id", employee_id).execute()
    shift_id = emp_result.data[0]["shift_id"] if emp_result.data else None

    punch_in_time = override.get("override_punch_in")
    punch_out_time = override.get("override_punch_out")

    net_hours = 0
    if override.get("override_type") == "SET_BOTH":
        if override.get("override_punch_in") and override.get("override_punch_out"):
            pin = datetime.fromisoformat(override["override_punch_in"].replace("Z", "+00:00"))
            pout = datetime.fromisoformat(override["override_punch_out"].replace("Z", "+00:00"))
            net_hours = round((pout - pin).total_seconds() / 3600, 2)
    elif override.get("override_net_hours") is not None:
        net_hours = float(override["override_net_hours"])

    if not punch_in_time:
        punch_in_time = get_start_of_day_utc(session_d).isoformat()

    session_data = {
        "employee_id": employee_id,
        "session_date": session_date,
        "punch_in_time": punch_in_time,
        "punch_out_time": punch_out_time,
        "gross_hours": net_hours,
        "net_hours": net_hours,
        "status": "COMPLETE",
        "shift_id": shift_id,
        "has_override": True,
    }

    db.table("attendance_sessions").insert(session_data).execute()
    logger.info(f"Synthetic session created: employee={employee_id}, date={session_date}, hours={net_hours}")
