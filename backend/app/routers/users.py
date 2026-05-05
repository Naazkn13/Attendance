from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.database import get_supabase
from app.utils.auth_utils import get_current_user, require_role, get_password_hash

router = APIRouter(prefix="/api/users", tags=["users"])

class CreateAdminRequest(BaseModel):
    username: str
    password: str

class SetEmployeePasswordRequest(BaseModel):
    password: str

@router.post("/admins")
async def create_admin(
    req: CreateAdminRequest,
    current_user: dict = Depends(require_role(["SUPERADMIN"]))
):
    supabase = get_supabase()
    
    # Check if username exists
    response = supabase.table("users").select("id").eq("username", req.username).execute()
    if response.data:
        raise HTTPException(status_code=400, detail="Username already exists")
        
    hashed_password = get_password_hash(req.password)
    
    new_admin = {
        "username": req.username,
        "password_hash": hashed_password,
        "role": "ADMIN",
        "employee_id": None
    }
    
    result = supabase.table("users").insert(new_admin).execute()
    
    admin_data = {k: v for k, v in result.data[0].items() if k != "password_hash"}
    return admin_data

@router.get("/admins")
async def list_admins(
    current_user: dict = Depends(require_role(["SUPERADMIN", "ADMIN"]))
):
    supabase = get_supabase()
    response = supabase.table("users").select("id, username, role, is_active, created_at, last_login_at").eq("role", "ADMIN").execute()
    return response.data

@router.post("/employees/{employee_id}/set-password")
async def set_employee_password(
    employee_id: str,
    req: SetEmployeePasswordRequest,
    current_user: dict = Depends(require_role(["SUPERADMIN", "ADMIN"]))
):
    supabase = get_supabase()
    
    # Check if employee exists
    emp_resp = supabase.table("employees").select("*").eq("id", employee_id).execute()
    if not emp_resp.data:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    device_user_id = emp_resp.data[0]["device_user_id"]
    hashed_password = get_password_hash(req.password)
    
    # Check if user account already exists for this employee
    user_resp = supabase.table("users").select("id").eq("employee_id", employee_id).execute()
    
    if user_resp.data:
        # Update existing
        result = supabase.table("users").update({"password_hash": hashed_password}).eq("employee_id", employee_id).execute()
    else:
        # Create new
        # Ensure username (device_user_id) is not taken by another account
        check_uname = supabase.table("users").select("id").eq("username", device_user_id).execute()
        if check_uname.data:
            # edge case, just append employee id suffix
            username = f"{device_user_id}_{str(employee_id)[:4]}"
        else:
            username = device_user_id
            
        new_user = {
            "employee_id": employee_id,
            "username": username,
            "password_hash": hashed_password,
            "role": "EMPLOYEE"
        }
        result = supabase.table("users").insert(new_user).execute()
        
    return {"message": "Password set successfully"}
