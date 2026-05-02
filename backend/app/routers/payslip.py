"""Payslip Generation API endpoints.

Generates payslip data for employees based on payroll calculations.
Reuses the payroll worker for actual computation.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from uuid import UUID
from datetime import date

from app.database import get_supabase

router = APIRouter(tags=["Payslip"])


@router.post("/payslip/generate")
async def generate_payslips(period_start: date, period_end: date):
    """Get all FINAL payslips for the given period.
    
    This retrieves payrolls that have been finalized by the administrator
    and returns structured payslip data for each.
    """
    db = get_supabase()

    payroll_results = db.table("payroll_records") \
        .select("*, employees(id, name, device_user_id, shift_id, shifts(shift_hours))") \
        .eq("period_start", period_start.isoformat()) \
        .eq("period_end", period_end.isoformat()) \
        .eq("status", "FINAL") \
        .execute()

    payslips = []
    for payroll in (payroll_results.data or []):
        try:
            emp = payroll.get("employees", {})
            shift = emp.get("shifts", {}) or {}
            calc = payroll.get("calculation_details", {})
            
            payslip = {
                "employee_id": payroll["employee_id"],
                "employee_name": emp.get("name", "Unknown"),
                "device_user_id": emp.get("device_user_id"),
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "basic_salary": payroll.get("basic_salary", 0),
                "per_day_salary": calc.get("per_day_salary", 0),
                "per_hour_rate": calc.get("per_hour_rate", 0),
                "shift_hours": shift.get("shift_hours", 8),
                "days_in_month": calc.get("days_in_month", 30),
                "total_working_days": payroll.get("total_working_days", 0),
                "days_present": payroll.get("days_present", 0),
                "days_absent": payroll.get("days_absent", 0),
                "total_worked_hours": payroll.get("total_worked_hours", 0),
                "expected_hours": payroll.get("expected_hours", 0),
                "overtime_hours": payroll.get("overtime_hours", 0),
                "missing_hours": payroll.get("missing_hours", 0),
                "total_day_salary": calc.get("total_day_salary", 0),
                "overtime_pay": payroll.get("overtime_pay", 0),
                "pt_deduction": calc.get("pt_deduction", 200),
                "salary_cut": payroll.get("salary_cut", 0),
                "final_salary": payroll.get("final_salary", 0),
                "total_before_pt": calc.get("total_day_salary", 0) + payroll.get("overtime_pay", 0),
                "daily_breakdown": calc.get("daily_breakdown", []),
                "warnings": calc.get("warnings", []),
                "payroll_id": payroll.get("id"),
                "status": "success",
            }
            payslips.append(payslip)
        except Exception as e:
            payslips.append({
                "employee_id": payroll.get("employee_id"),
                "employee_name": payroll.get("employees", {}).get("name", "Unknown"),
                "status": "error",
                "error": str(e),
            })

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "count": len(payslips),
        "payslips": payslips,
    }


@router.get("/payslip/{employee_id}")
async def get_payslip(
    employee_id: UUID,
    period_start: date = Query(...),
    period_end: date = Query(...),
):
    """Get payslip data for a specific employee and period."""
    db = get_supabase()
    
    # Check if payroll exists
    payroll_result = db.table("payroll_records") \
        .select("*") \
        .eq("employee_id", str(employee_id)) \
        .eq("period_start", period_start.isoformat()) \
        .eq("period_end", period_end.isoformat()) \
        .order("calculated_at", desc=True) \
        .limit(1) \
        .execute()

    if not payroll_result.data:
        # Calculate on demand
        from app.workers.payroll_worker import calculate_payroll
        payroll = await calculate_payroll(str(employee_id), period_start, period_end)
    else:
        payroll = payroll_result.data[0]

    # Get employee details
    emp_result = db.table("employees") \
        .select("*, shifts(*)") \
        .eq("id", str(employee_id)) \
        .execute()

    if not emp_result.data:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee = emp_result.data[0]
    shift = employee.get("shifts", {}) or {}
    calc = payroll.get("calculation_details", {})

    return {
        "employee": {
            "id": employee["id"],
            "name": employee["name"],
            "device_user_id": employee["device_user_id"],
            "basic_salary": employee["basic_salary"],
            "shift_name": shift.get("name", "N/A"),
            "shift_hours": shift.get("shift_hours", 8),
            "joining_date": employee.get("joining_date"),
        },
        "payroll": {
            "period_start": payroll.get("period_start"),
            "period_end": payroll.get("period_end"),
            "basic_salary": payroll.get("basic_salary"),
            "per_day_salary": calc.get("per_day_salary", 0),
            "per_hour_rate": calc.get("per_hour_rate", 0),
            "total_working_days": payroll.get("total_working_days"),
            "days_present": payroll.get("days_present"),
            "days_absent": payroll.get("days_absent"),
            "total_worked_hours": payroll.get("total_worked_hours"),
            "expected_hours": payroll.get("expected_hours"),
            "overtime_hours": payroll.get("overtime_hours"),
            "missing_hours": payroll.get("missing_hours"),
            "total_day_salary": calc.get("total_day_salary", 0),
            "overtime_pay": payroll.get("overtime_pay"),
            "pt_deduction": calc.get("pt_deduction", 200),
            "salary_cut": payroll.get("salary_cut"),
            "final_salary": payroll.get("final_salary"),
            "total_before_pt": calc.get("total_day_salary", 0) + payroll.get("overtime_pay", 0),
        },
        "daily_breakdown": calc.get("daily_breakdown", []),
        "warnings": calc.get("warnings", []),
    }
