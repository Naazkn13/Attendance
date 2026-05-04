from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import get_supabase
from app.utils.auth_utils import get_current_user, require_role

router = APIRouter(prefix="/api/portal", tags=["employee_portal"])

@router.get("/my-profile")
async def get_my_profile(current_user: dict = Depends(require_role(["EMPLOYEE"]))):
    supabase = get_supabase()
    employee_id = current_user.get("employee_id")
    
    if not employee_id:
        raise HTTPException(status_code=400, detail="User is not linked to an employee record")
        
    response = supabase.table("employees").select("*, shifts(*)").eq("id", employee_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Employee record not found")
        
    return response.data[0]

@router.get("/my-payslips")
async def get_my_payslips(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: dict = Depends(require_role(["EMPLOYEE"]))
):
    supabase = get_supabase()
    employee_id = current_user.get("employee_id")
    
    query = supabase.table("payroll_records").select("*").eq("employee_id", employee_id).eq("status", "FINAL")
    
    # Optional filtering
    if year and month:
        # Construct period_start based on year/month
        start_date = date(year, month, 1).isoformat()
        if month == 12:
            end_date = date(year + 1, 1, 1).isoformat()
        else:
            end_date = date(year, month + 1, 1).isoformat()
        
        query = query.gte("period_start", start_date).lt("period_start", end_date)
        
    query = query.order("period_start", desc=True)
    response = query.execute()
    
    return response.data

@router.get("/my-payslip/{period_start}")
async def get_my_payslip_detail(
    period_start: str,
    current_user: dict = Depends(require_role(["EMPLOYEE"]))
):
    supabase = get_supabase()
    employee_id = current_user.get("employee_id")
    
    response = supabase.table("payroll_records").select("*").eq("employee_id", employee_id).eq("period_start", period_start).eq("status", "FINAL").execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Payslip not found or not yet finalized")
        
    return response.data[0]

@router.get("/my-attendance")
async def get_my_attendance(
    year: int = Query(..., description="Year"),
    month: int = Query(..., description="Month 1-12"),
    current_user: dict = Depends(require_role(["EMPLOYEE"]))
):
    supabase = get_supabase()
    employee_id = current_user.get("employee_id")
    
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)
        
    response = supabase.table("attendance_sessions").select("*").eq("employee_id", employee_id).gte("session_date", start_date.isoformat()).lt("session_date", end_date.isoformat()).order("session_date").execute()
    
    return response.data
