from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.database import get_supabase
from app.utils.auth_utils import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    supabase = get_supabase()
    response = supabase.table("users").select("*").eq("username", req.username).execute()
    
    if not response.data or len(response.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user = response.data[0]
    
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
        
    # Create token
    access_token = create_access_token(
        data={"sub": str(user["id"]), "role": user["role"]}
    )
    
    # Update last login
    supabase.table("users").update({"last_login_at": "now()"}).eq("id", user["id"]).execute()
    
    # Don't return password hash
    user_data = {k: v for k, v in user.items() if k != "password_hash"}
    
    return {"access_token": access_token, "token_type": "bearer", "user": user_data}

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user_data = {k: v for k, v in current_user.items() if k != "password_hash"}
    return user_data

@router.post("/change-password")
async def change_password(req: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    if not verify_password(req.old_password, current_user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect old password"
        )
        
    new_hash = get_password_hash(req.new_password)
    supabase = get_supabase()
    supabase.table("users").update({"password_hash": new_hash}).eq("id", current_user["id"]).execute()
    
    return {"message": "Password updated successfully"}
