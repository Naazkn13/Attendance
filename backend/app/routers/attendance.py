"""Attendance API — view sessions, daily attendance, dashboard."""

from fastapi import APIRouter, Query
from datetime import date, datetime
from typing import Optional, List
from uuid import UUID

from app.database import get_supabase
from app.schemas.attendance import AttendanceSessionResponse, AttendanceDashboard

router = APIRouter(tags=["Attendance"])


@router.get("/attendance/today")
async def today_attendance():
    """Get today's attendance dashboard."""
    db = get_supabase()
    today = date.today().isoformat()

    # Get all active employees
    employees = db.table("employees") \
        .select("id, name, shift_id") \
        .eq("is_active", True) \
        .order("name") \
        .execute()

    # Get today's sessions
    sessions = db.table("attendance_sessions") \
        .select("*") \
        .eq("session_date", today) \
        .execute()

    # Build per-employee summaries
    session_by_emp = {}
    for s in (sessions.data or []):
        eid = s["employee_id"]
        if eid not in session_by_emp:
            session_by_emp[eid] = []
        session_by_emp[eid].append(s)

    present = 0
    absent = 0
    auto_checkout = 0
    open_sessions = 0
    employee_views = []

    for emp in (employees.data or []):
        emp_sessions = session_by_emp.get(emp["id"], [])
        total_hours = sum(float(s.get("net_hours", 0)) for s in emp_sessions)

        if emp_sessions:
            present += 1
            statuses = [s["status"] for s in emp_sessions]
            if "AUTO_CHECKOUT" in statuses:
                auto_checkout += 1
                status_summary = "AUTO_CHECKOUT"
            elif "OPEN" in statuses:
                open_sessions += 1
                status_summary = "OPEN"
            else:
                status_summary = "PRESENT"
        else:
            absent += 1
            status_summary = "ABSENT"

        employee_views.append({
            "employee_id": emp["id"],
            "employee_name": emp["name"],
            "session_date": today,
            "sessions": emp_sessions,
            "total_hours": round(total_hours, 2),
            "status_summary": status_summary,
        })

    return {
        "date": today,
        "total_employees": len(employees.data or []),
        "present": present,
        "absent": absent,
        "auto_checkout": auto_checkout,
        "open_sessions": open_sessions,
        "employees": employee_views,
    }


@router.get("/attendance/sessions")
async def list_sessions(
    employee_id: Optional[UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    limit: int = Query(100, le=500),
):
    """List attendance sessions with filters."""
    db = get_supabase()
    query = db.table("attendance_sessions").select("*, employees(name)")

    if employee_id:
        query = query.eq("employee_id", str(employee_id))
    if date_from:
        query = query.gte("session_date", date_from.isoformat())
    if date_to:
        query = query.lte("session_date", date_to.isoformat())
    if status:
        query = query.eq("status", status)

    result = query.order("session_date", desc=True).order("punch_in_time", desc=True).limit(limit).execute()

    sessions = []
    for s in (result.data or []):
        emp = s.pop("employees", None)
        s["employee_name"] = emp.get("name") if emp else None
        sessions.append(s)

    return sessions


@router.get("/attendance/employee/{employee_id}/monthly")
async def employee_monthly_attendance(employee_id: UUID, year: int, month: int):
    """Get monthly attendance view for an employee."""
    db = get_supabase()

    from calendar import monthrange
    _, last_day = monthrange(year, month)
    period_start = date(year, month, 1).isoformat()
    period_end = date(year, month, last_day).isoformat()

    sessions = db.table("attendance_sessions") \
        .select("*") \
        .eq("employee_id", str(employee_id)) \
        .gte("session_date", period_start) \
        .lte("session_date", period_end) \
        .order("session_date") \
        .execute()

    # Get overrides for the period
    overrides = db.table("session_overrides") \
        .select("*") \
        .eq("employee_id", str(employee_id)) \
        .eq("is_active", True) \
        .gte("session_date", period_start) \
        .lte("session_date", period_end) \
        .execute()

    # Group by date
    from datetime import timedelta
    daily = {}
    current = date(year, month, 1)
    end = date(year, month, last_day)

    while current <= end:
        d = current.isoformat()
        day_sessions = [s for s in (sessions.data or []) if s["session_date"] == d]
        day_override = [o for o in (overrides.data or []) if o["session_date"] == d]

        daily[d] = {
            "date": d,
            "day_of_week": current.strftime("%A"),
            "is_weekend": current.weekday() >= 5,
            "sessions": day_sessions,
            "total_hours": round(sum(float(s.get("net_hours", 0)) for s in day_sessions), 2),
            "has_override": len(day_override) > 0,
            "status": day_sessions[0]["status"] if day_sessions else ("WEEKEND" if current.weekday() >= 5 else "ABSENT"),
        }
        current += timedelta(days=1)

    return {
        "employee_id": str(employee_id),
        "year": year,
        "month": month,
        "days": daily,
        "summary": {
            "total_sessions": len(sessions.data or []),
            "total_hours": round(sum(float(s.get("net_hours", 0)) for s in (sessions.data or [])), 2),
            "days_present": len(set(s["session_date"] for s in (sessions.data or []))),
        },
    }


@router.post("/attendance/trigger-session-builder")
async def trigger_session_builder():
    """Manually trigger the session builder worker."""
    from app.workers.session_builder import run_session_builder
    result = await run_session_builder()
    return {"message": "Session builder ran", "result": result}


@router.post("/attendance/trigger-auto-checkout")
async def trigger_auto_checkout():
    """Manually trigger the auto checkout worker."""
    from app.workers.auto_checkout import run_auto_checkout
    result = await run_auto_checkout()
    return {"message": "Auto checkout ran", "result": result}
