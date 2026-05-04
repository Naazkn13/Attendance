from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.database import get_supabase
from app.utils.auth_utils import get_current_user, require_role

router = APIRouter(prefix="/api/leaves", tags=["leaves"])

class LeaveApplyRequest(BaseModel):
    leave_date: str
    leave_type: str
    reason: str

class LeaveRejectRequest(BaseModel):
    rejection_reason: str

# --- EMPLOYEE ENDPOINTS ---

@router.post("/apply")
async def apply_leave(
    req: LeaveApplyRequest,
    current_user: dict = Depends(require_role(["EMPLOYEE"]))
):
    supabase = get_supabase()
    employee_id = current_user.get("employee_id")
    
    # Check if a leave request already exists for this date
    response = supabase.table("leave_requests").select("id").eq("employee_id", employee_id).eq("leave_date", req.leave_date).execute()
    if response.data:
        raise HTTPException(status_code=400, detail="A leave request already exists for this date")
        
    new_request = {
        "employee_id": employee_id,
        "leave_date": req.leave_date,
        "leave_type": req.leave_type,
        "reason": req.reason,
        "status": "PENDING"
    }
    
    result = supabase.table("leave_requests").insert(new_request).execute()
    return result.data[0]

@router.get("/my-leaves")
async def get_my_leaves(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: dict = Depends(require_role(["EMPLOYEE"]))
):
    supabase = get_supabase()
    employee_id = current_user.get("employee_id")
    
    query = supabase.table("leave_requests").select("*").eq("employee_id", employee_id)
    
    if year and month:
        start_date = date(year, month, 1).isoformat()
        if month == 12:
            end_date = date(year + 1, 1, 1).isoformat()
        else:
            end_date = date(year, month + 1, 1).isoformat()
        
        query = query.gte("leave_date", start_date).lt("leave_date", end_date)
        
    query = query.order("leave_date", desc=True)
    response = query.execute()
    return response.data

@router.get("/my-balance")
async def get_my_balance(
    year: int = Query(..., description="Year"),
    month: int = Query(..., description="Month"),
    current_user: dict = Depends(require_role(["EMPLOYEE"]))
):
    supabase = get_supabase()
    employee_id = current_user.get("employee_id")
    
    response = supabase.table("leave_balances").select("*").eq("employee_id", employee_id).eq("year", year).eq("month", month).execute()
    
    if not response.data:
        return {
            "employee_id": employee_id,
            "year": year,
            "month": month,
            "paid_leaves_quota": 1,
            "paid_leaves_used": 0
        }
        
    return response.data[0]

# --- ADMIN/SUPERADMIN ENDPOINTS ---

@router.get("/pending")
async def get_pending_leaves(
    current_user: dict = Depends(require_role(["ADMIN", "SUPERADMIN"]))
):
    supabase = get_supabase()
    # Join with employees to get name
    response = supabase.table("leave_requests").select("*, employees(name, device_user_id)").eq("status", "PENDING").order("created_at", desc=False).execute()
    return response.data

@router.get("/all")
async def get_all_leaves(
    employee_id: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(require_role(["ADMIN", "SUPERADMIN"]))
):
    supabase = get_supabase()
    query = supabase.table("leave_requests").select("*, employees(name, device_user_id)")
    
    if employee_id:
        query = query.eq("employee_id", employee_id)
    if status:
        query = query.eq("status", status)
        
    if year and month:
        start_date = date(year, month, 1).isoformat()
        if month == 12:
            end_date = date(year + 1, 1, 1).isoformat()
        else:
            end_date = date(year, month + 1, 1).isoformat()
        
        query = query.gte("leave_date", start_date).lt("leave_date", end_date)
        
    query = query.order("leave_date", desc=True)
    response = query.execute()
    return response.data

# --- ADMIN / SUPERADMIN ENDPOINTS ---

@router.post("/{leave_id}/approve")
async def approve_leave(
    leave_id: str,
    current_user: dict = Depends(require_role(["ADMIN", "SUPERADMIN"]))
):
    supabase = get_supabase()
    
    # Get leave request
    leave_req_resp = supabase.table("leave_requests").select("*").eq("id", leave_id).execute()
    if not leave_req_resp.data:
        raise HTTPException(status_code=404, detail="Leave request not found")
        
    leave_req = leave_req_resp.data[0]
    if leave_req["status"] != "PENDING":
        raise HTTPException(status_code=400, detail=f"Leave request is already {leave_req['status']}")
        
    employee_id = leave_req["employee_id"]
    leave_date = date.fromisoformat(leave_req["leave_date"])
    year = leave_date.year
    month = leave_date.month
    
    # Check leave balance
    balance_resp = supabase.table("leave_balances").select("*").eq("employee_id", employee_id).eq("year", year).eq("month", month).execute()
    
    if not balance_resp.data:
        # Create balance record
        balance = {
            "employee_id": employee_id,
            "year": year,
            "month": month,
            "paid_leaves_quota": 1,
            "paid_leaves_used": 0
        }
        supabase.table("leave_balances").insert(balance).execute()
        paid_leaves_used = 0
        paid_leaves_quota = 1
    else:
        balance = balance_resp.data[0]
        paid_leaves_used = balance["paid_leaves_used"]
        paid_leaves_quota = balance["paid_leaves_quota"]
        
    is_paid = False
    if paid_leaves_used < paid_leaves_quota:
        is_paid = True
        # Increment used quota
        supabase.table("leave_balances").update({"paid_leaves_used": paid_leaves_used + 1}).eq("employee_id", employee_id).eq("year", year).eq("month", month).execute()
        
    # Update leave request
    updated_req = {
        "status": "APPROVED",
        "is_paid": is_paid,
        "reviewed_by": current_user["id"],
        "reviewed_at": "now()"
    }
    
    result = supabase.table("leave_requests").update(updated_req).eq("id", leave_id).execute()
    return result.data[0]

@router.post("/{leave_id}/reject")
async def reject_leave(
    leave_id: str,
    req: LeaveRejectRequest,
    current_user: dict = Depends(require_role(["ADMIN", "SUPERADMIN"]))
):
    supabase = get_supabase()
    
    # Get leave request
    leave_req_resp = supabase.table("leave_requests").select("*").eq("id", leave_id).execute()
    if not leave_req_resp.data:
        raise HTTPException(status_code=404, detail="Leave request not found")
        
    leave_req = leave_req_resp.data[0]
    if leave_req["status"] != "PENDING":
        raise HTTPException(status_code=400, detail=f"Leave request is already {leave_req['status']}")
        
    updated_req = {
        "status": "REJECTED",
        "rejection_reason": req.rejection_reason,
        "reviewed_by": current_user["id"],
        "reviewed_at": "now()"
    }
    
    result = supabase.table("leave_requests").update(updated_req).eq("id", leave_id).execute()
    return result.data[0]

# --- REPORTS ---
@router.get("/summary/{employee_id}")
async def get_leave_summary(
    employee_id: str,
    year: int = Query(..., description="Year"),
    current_user: dict = Depends(require_role(["ADMIN", "SUPERADMIN"]))
):
    supabase = get_supabase()
    
    start_date = date(year, 1, 1).isoformat()
    end_date = date(year + 1, 1, 1).isoformat()
    
    response = supabase.table("leave_requests").select("*").eq("employee_id", employee_id).gte("leave_date", start_date).lt("leave_date", end_date).execute()
    
    summary = {
        "total_taken": 0,
        "paid": 0,
        "unpaid": 0,
        "pending": 0,
        "rejected": 0,
        "monthly": {}
    }
    
    for i in range(1, 13):
        summary["monthly"][i] = {"paid": 0, "unpaid": 0}
        
    for leave in response.data:
        leave_date = date.fromisoformat(leave["leave_date"])
        month = leave_date.month
        if leave["status"] == "APPROVED":
            summary["total_taken"] += 1
            if leave["is_paid"]:
                summary["paid"] += 1
                summary["monthly"][month]["paid"] += 1
            else:
                summary["unpaid"] += 1
                summary["monthly"][month]["unpaid"] += 1
        elif leave["status"] == "PENDING":
            summary["pending"] += 1
        elif leave["status"] == "REJECTED":
            summary["rejected"] += 1
            
    return summary
