"""Payroll Worker — Payroll Calculation.

Per-employee, per-month calculation using effective session data
(after overrides applied). Uses Python Decimal for exact arithmetic.
Daily overtime granularity.

Business Rules (confirmed by user):
- Month = 30 days (all days including Sundays)
- Per Day Salary = Basic Salary / 30
- Per Hour Rate = Per Day Salary / Shift Hours
- Overtime rate = 1x (same per-hour rate, no multiplier)
- Sundays are PAID OFFS:
    - If employee works on Sunday → all hours = overtime (extra pay)
    - If employee does NOT work on Sunday → they still get per-day salary
- Working days = Mon-Sat (6 days/week)
- Short hours deduction: proportional (worked_hours / shift_hours × per_day_salary)
- Professional Tax (PT) = ₹200 hardcoded deduction
"""

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional

from app.database import get_supabase

logger = logging.getLogger(__name__)

# Hardcoded values per user confirmation
DAYS_IN_MONTH = Decimal("30")
PT_DEDUCTION = Decimal("200")


async def calculate_payroll(employee_id: str, period_start: date, period_end: date) -> dict:
    """Calculate payroll for an employee for a given period. Returns payroll record data."""
    db = get_supabase()

    # Get employee info
    emp_result = db.table("employees").select("*, shifts(*)").eq("id", employee_id).execute()
    if not emp_result.data:
        raise ValueError(f"Employee not found: {employee_id}")

    employee = emp_result.data[0]
    shift = employee.get("shifts", {}) or {}

    basic_salary = Decimal(str(employee.get("basic_salary", 0)))
    shift_hours = Decimal(str(shift.get("shift_hours", 8)))

    # Derived rates (matching Excel logic)
    per_day_salary = (basic_salary / DAYS_IN_MONTH).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    per_hour_rate = (per_day_salary / shift_hours).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # Get all sessions in period (already have overrides applied)
    sessions_result = db.table("attendance_sessions") \
        .select("*") \
        .eq("employee_id", employee_id) \
        .gte("session_date", period_start.isoformat()) \
        .lte("session_date", period_end.isoformat()) \
        .in_("status", ["COMPLETE", "AUTO_CHECKOUT", "REOPENED"]) \
        .order("session_date") \
        .execute()

    sessions = sessions_result.data or []

    # Fetch holidays in the payroll period from calendar_days
    holidays_result = db.table("calendar_days") \
        .select("date, description") \
        .eq("day_type", "HOLIDAY") \
        .gte("date", period_start.isoformat()) \
        .lte("date", period_end.isoformat()) \
        .execute()
    holiday_dates = {h["date"]: h.get("description", "Holiday") for h in (holidays_result.data or [])}

    # Fetch approved leaves
    leaves_result = db.table("leave_requests") \
        .select("*") \
        .eq("employee_id", employee_id) \
        .eq("status", "APPROVED") \
        .gte("leave_date", period_start.isoformat()) \
        .lte("leave_date", period_end.isoformat()) \
        .execute()
    
    approved_leaves = {leave["leave_date"]: leave for leave in (leaves_result.data or [])}

    # Group sessions by date for daily calculation
    daily_data = {}
    for session in sessions:
        sd = session["session_date"]
        if sd not in daily_data:
            daily_data[sd] = []
        daily_data[sd].append(session)

    # Deduplicate: when a date has multiple sessions (from duplicate syncs),
    # apply these rules to keep only one session per date:
    #   1. Prefer overridden sessions over non-overridden ones
    #   2. If multiple overridden sessions exist, keep only the most recently updated
    #   3. If no overridden sessions, keep only the most recently updated
    for sd, day_sessions in daily_data.items():
        if len(day_sessions) > 1:
            overridden = [s for s in day_sessions if s.get("has_override")]
            if overridden:
                candidates = overridden
            else:
                candidates = day_sessions

            # Keep only the most recently updated session
            best = max(candidates, key=lambda s: s.get("updated_at", ""))
            daily_data[sd] = [best]
            logger.info(f"Dedup {sd}: kept session {best['id'][:12]} ({best.get('net_hours', 0)}h), "
                       f"discarded {len(day_sessions) - 1} duplicate(s)")

    # Calculate per-day
    total_worked_hours = Decimal("0")
    total_overtime = Decimal("0")
    total_deficit = Decimal("0")
    total_day_salary = Decimal("0")
    total_overtime_pay = Decimal("0")
    days_present = 0
    days_absent = 0
    working_days_count = 0
    daily_breakdown = []
    holidays_count = 0
    holidays_worked = 0
    paid_leaves_count = 0
    unpaid_leaves_count = 0
    warnings = []

    # Process each day in the period
    current = period_start
    while current <= period_end:
        current_str = current.isoformat()
        day_sessions = daily_data.get(current_str, [])
        is_sunday = current.weekday() == 6  # Sunday = 6
        is_holiday = current_str in holiday_dates  # From calendar_days table
        is_paid_off = is_sunday or is_holiday  # Both are paid days off
        is_working = not is_paid_off  # Working day = not Sunday and not holiday

        if is_working:
            working_days_count += 1
        if is_holiday:
            holidays_count += 1

        day_details = {
            "date": current_str,
            "is_working_day": is_working,
            "is_sunday": is_sunday,
            "is_holiday": is_holiday,
            "holiday_name": holiday_dates.get(current_str),
            "sessions": [],
            "was_overridden": False,
            "auto_checkout_uncorrected": False,
        }

        if is_paid_off:
            # ─── PAID DAY OFF (Sunday or Holiday) ───
            # Employee always gets per_day_salary for Sundays.
            # If they also worked, those hours are OVERTIME (extra).
            day_salary = per_day_salary  # paid off regardless

            if day_sessions:
                # Sunday with attendance → hours = overtime
                day_hours = Decimal("0")
                for s in day_sessions:
                    net = Decimal(str(s.get("net_hours", 0)))
                    day_hours += net
                    session_detail = {
                        "session_id": s["id"],
                        "punch_in": s.get("punch_in_time"),
                        "punch_out": s.get("punch_out_time"),
                        "net_hours": float(net),
                        "status": s["status"],
                        "has_override": s.get("has_override", False),
                    }
                    day_details["sessions"].append(session_detail)
                    if s.get("has_override"):
                        day_details["was_overridden"] = True
                    if s["status"] == "AUTO_CHECKOUT" and not s.get("has_override", False):
                        day_details["auto_checkout_uncorrected"] = True
                        warnings.append(f"Uncorrected AUTO_CHECKOUT on {current_str}")

                # All Sunday hours are overtime (extra pay on top of paid off)
                sunday_ot_pay = (day_hours * per_hour_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                total_overtime += day_hours
                total_overtime_pay += sunday_ot_pay
                total_worked_hours += day_hours

                day_details["total_hours"] = float(day_hours)
                day_details["overtime_hours"] = float(day_hours)
                day_details["sunday_overtime"] = is_sunday
                day_details["holiday_overtime"] = is_holiday
                if is_holiday:
                    holidays_worked += 1
                day_details["day_salary"] = float(day_salary)
                day_details["overtime_pay"] = float(sunday_ot_pay)
                day_details["total_day_pay"] = float(day_salary + sunday_ot_pay)

                days_present += 1
                logger.info(f"Sunday work on {current_str}: {day_hours}h overtime → ₹{sunday_ot_pay}")
            else:
                # No punch on Sunday → just paid off, normal day pay
                day_details["total_hours"] = 0
                day_details["day_salary"] = float(day_salary)
                day_details["total_day_pay"] = float(day_salary)

            total_day_salary += day_salary

        elif is_working:
            # ─── WORKING DAY (Mon-Sat) ───
            if day_sessions:
                day_hours = Decimal("0")
                for s in day_sessions:
                    net = Decimal(str(s.get("net_hours", 0)))
                    day_hours += net
                    session_detail = {
                        "session_id": s["id"],
                        "punch_in": s.get("punch_in_time"),
                        "punch_out": s.get("punch_out_time"),
                        "net_hours": float(net),
                        "status": s["status"],
                        "has_override": s.get("has_override", False),
                    }
                    day_details["sessions"].append(session_detail)
                    if s.get("has_override"):
                        day_details["was_overridden"] = True
                    if s["status"] == "AUTO_CHECKOUT" and not s.get("has_override", False):
                        day_details["auto_checkout_uncorrected"] = True
                        warnings.append(f"Uncorrected AUTO_CHECKOUT on {current_str}")

                total_worked_hours += day_hours
                days_present += 1

                # Day salary = proportional to hours worked (capped at shift_hours)
                effective_hours = min(day_hours, shift_hours)
                day_salary = (per_day_salary * effective_hours / shift_hours).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )

                day_details["total_hours"] = float(day_hours)
                day_details["day_salary"] = float(day_salary)

                # Overtime (hours above shift_hours)
                if day_hours > shift_hours:
                    daily_ot = day_hours - shift_hours
                    ot_pay = (daily_ot * per_hour_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    total_overtime += daily_ot
                    total_overtime_pay += ot_pay
                    day_details["overtime_hours"] = float(daily_ot)
                    day_details["overtime_pay"] = float(ot_pay)
                    day_details["total_day_pay"] = float(day_salary + ot_pay)
                elif day_hours < shift_hours:
                    # Short hours (deficit)
                    daily_deficit = shift_hours - day_hours
                    total_deficit += daily_deficit
                    day_details["deficit_hours"] = float(daily_deficit)
                    day_details["total_day_pay"] = float(day_salary)
                else:
                    day_details["total_day_pay"] = float(day_salary)

                total_day_salary += day_salary
            else:
                # Absent on working day
                leave_info = approved_leaves.get(current_str)
                
                if leave_info:
                    day_details["is_leave"] = True
                    day_details["leave_type"] = leave_info.get("leave_type")
                    if leave_info.get("is_paid"):
                        # Paid leave
                        paid_leaves_count += 1
                        day_details["is_paid_leave"] = True
                        # Credit hours and salary so it's not considered absent/deficit
                        day_details["total_hours"] = float(shift_hours) 
                        day_details["day_salary"] = float(per_day_salary)
                        day_details["deficit_hours"] = 0
                        day_details["total_day_pay"] = float(per_day_salary)
                        total_day_salary += per_day_salary
                        total_worked_hours += shift_hours 
                    else:
                        # Unpaid leave
                        unpaid_leaves_count += 1
                        days_absent += 1
                        day_details["is_unpaid_leave"] = True
                        day_details["total_hours"] = 0
                        day_details["day_salary"] = 0
                        day_details["deficit_hours"] = float(shift_hours)
                        day_details["total_day_pay"] = 0
                        total_deficit += shift_hours
                else:
                    # Normal absence
                    days_absent += 1
                    day_details["total_hours"] = 0
                    day_details["day_salary"] = 0
                    day_details["deficit_hours"] = float(shift_hours)
                    day_details["total_day_pay"] = 0
                    total_deficit += shift_hours

        daily_breakdown.append(day_details)
        current += timedelta(days=1)

    # Final salary computation
    expected_hours = Decimal(str(working_days_count)) * shift_hours
    missing_hours = max(Decimal("0"), expected_hours - total_worked_hours)
    salary_cut = basic_salary - total_day_salary  # implicit from proportional day salary

    # Final = total day salaries + overtime pay - PT
    final_salary = (total_day_salary + total_overtime_pay - PT_DEDUCTION).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    calculation_details = {
        "daily_breakdown": daily_breakdown,
        "warnings": warnings,
        "per_day_salary": float(per_day_salary),
        "per_hour_rate": float(per_hour_rate),
        "shift_hours_per_day": float(shift_hours),
        "days_in_month": int(DAYS_IN_MONTH),
        "pt_deduction": float(PT_DEDUCTION),
        "total_day_salary": float(total_day_salary.quantize(Decimal("0.01"))),
        "total_overtime_pay": float(total_overtime_pay.quantize(Decimal("0.01"))),
        "holidays_in_period": holidays_count,
        "holidays_worked": holidays_worked,
        "paid_leaves_count": paid_leaves_count,
        "unpaid_leaves_count": unpaid_leaves_count,
        "holiday_list": [{
            "date": d,
            "description": desc
        } for d, desc in holiday_dates.items()],
    }

    payroll_data = {
        "employee_id": employee_id,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "total_working_days": working_days_count,
        "days_present": days_present,
        "days_absent": days_absent,
        "total_worked_hours": float(total_worked_hours.quantize(Decimal("0.01"))),
        "expected_hours": float(expected_hours.quantize(Decimal("0.01"))),
        "missing_hours": float(missing_hours.quantize(Decimal("0.01"))),
        "overtime_hours": float(total_overtime.quantize(Decimal("0.01"))),
        "basic_salary": float(basic_salary),
        "salary_cut": float(salary_cut.quantize(Decimal("0.01"))),
        "overtime_pay": float(total_overtime_pay.quantize(Decimal("0.01"))),
        "final_salary": float(final_salary),
        "calculation_details": calculation_details,
        "status": "DRAFT",
    }

    # Upsert payroll record
    existing = db.table("payroll_records") \
        .select("id, version") \
        .eq("employee_id", employee_id) \
        .eq("period_start", period_start.isoformat()) \
        .eq("period_end", period_end.isoformat()) \
        .in_("status", ["DRAFT"]) \
        .execute()

    if existing.data:
        # Update existing DRAFT
        old = existing.data[0]
        payroll_data["version"] = old["version"] + 1
        payroll_data["calculated_at"] = datetime.utcnow().isoformat()
        db.table("payroll_records").update(payroll_data).eq("id", old["id"]).execute()
        payroll_data["id"] = old["id"]
    else:
        payroll_data["calculated_at"] = datetime.utcnow().isoformat()
        result = db.table("payroll_records").insert(payroll_data).execute()
        if result.data:
            payroll_data["id"] = result.data[0]["id"]

    logger.info(f"Payroll calculated: employee={employee_id}, period={period_start}–{period_end}, final=₹{final_salary}")
    return payroll_data


def _count_working_days(start: date, end: date) -> int:
    """Count working days (Mon-Sat). Only Sundays are off."""
    count = 0
    current = start
    while current <= end:
        if current.weekday() < 6:  # Mon=0 ... Sat=5; Sun=6 is off
            count += 1
        current += timedelta(days=1)
    return count


def _is_working_day(d: date) -> bool:
    """Check if a date is a working day (Mon-Sat). Only Sunday is a day-off."""
    return d.weekday() < 6  # Sun=6 is the only non-working day
