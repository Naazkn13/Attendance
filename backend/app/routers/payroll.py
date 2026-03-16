"""Payroll & Recalculation API endpoints."""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from uuid import UUID
from datetime import date

from app.database import get_supabase
from app.schemas.attendance import (
    PayrollCalculateRequest, PayrollResponse, PayrollFinalizeRequest,
    RecalculationRequest, RecalculationPreview, RecalculationConfirm,
)

router = APIRouter(tags=["Payroll"])


@router.post("/payroll/calculate")
async def calculate_payroll_endpoint(data: PayrollCalculateRequest):
    """Calculate payroll for an employee and period. Returns DRAFT payroll."""
    from app.workers.payroll_worker import calculate_payroll
    result = await calculate_payroll(
        str(data.employee_id),
        data.period_start,
        data.period_end,
    )
    return result


@router.post("/payroll/calculate-all")
async def calculate_all_payroll(period_start: date, period_end: date):
    """Calculate payroll for all active employees."""
    db = get_supabase()
    from app.workers.payroll_worker import calculate_payroll

    employees = db.table("employees").select("id, name").eq("is_active", True).execute()
    results = []

    for emp in (employees.data or []):
        try:
            result = await calculate_payroll(emp["id"], period_start, period_end)
            results.append({"employee_id": emp["id"], "name": emp["name"], "status": "success", "final_salary": result.get("final_salary")})
        except Exception as e:
            results.append({"employee_id": emp["id"], "name": emp["name"], "status": "error", "error": str(e)})

    return {"count": len(results), "results": results}


@router.get("/payroll")
async def list_payroll(
    employee_id: Optional[UUID] = None,
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
    status: Optional[str] = None,
):
    """List payroll records with filters."""
    db = get_supabase()
    query = db.table("payroll_records").select("*, employees(name)")

    if employee_id:
        query = query.eq("employee_id", str(employee_id))
    if period_start:
        query = query.eq("period_start", period_start.isoformat())
    if period_end:
        query = query.eq("period_end", period_end.isoformat())
    if status:
        query = query.eq("status", status)

    result = query.order("calculated_at", desc=True).execute()

    payrolls = []
    for p in (result.data or []):
        emp = p.pop("employees", None)
        p["employee_name"] = emp.get("name") if emp else None
        payrolls.append(p)
    return payrolls


@router.get("/payroll/{payroll_id}")
async def get_payroll(payroll_id: UUID):
    """Get a single payroll record with full calculation details."""
    db = get_supabase()
    result = db.table("payroll_records").select("*, employees(name)").eq("id", str(payroll_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Payroll record not found")
    p = result.data[0]
    p["employee_name"] = p.pop("employees", {}).get("name")
    return p


@router.post("/payroll/finalize")
async def finalize_payroll(data: PayrollFinalizeRequest):
    """Mark a DRAFT payroll as FINAL."""
    db = get_supabase()
    result = db.table("payroll_records").select("*").eq("id", str(data.payroll_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Payroll not found")

    payroll = result.data[0]
    if payroll["status"] != "DRAFT":
        raise HTTPException(status_code=400, detail=f"Can only finalize DRAFT payroll (current: {payroll['status']})")

    db.table("payroll_records").update({"status": "FINAL"}).eq("id", str(data.payroll_id)).execute()
    return {"message": "Payroll finalized", "payroll_id": str(data.payroll_id)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# RECALCULATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/recalculation/preview")
async def recalculation_preview(data: RecalculationRequest):
    """Preview recalculation diff without committing."""
    from app.workers.recalculation import preview_recalculation
    result = await preview_recalculation(
        str(data.employee_id),
        data.period_start,
        data.period_end,
    )
    return result


@router.post("/recalculation/confirm")
async def recalculation_confirm(data: RecalculationConfirm):
    """Execute recalculation: rebuild sessions + apply overrides + regenerate payroll."""
    from app.workers.recalculation import confirm_recalculation
    result = await confirm_recalculation(
        str(data.employee_id),
        data.period_start,
        data.period_end,
    )
    return result
