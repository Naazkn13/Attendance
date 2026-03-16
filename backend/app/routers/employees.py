"""CRUD endpoints for Employees, Shifts, Locations, Devices."""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from uuid import UUID

from app.database import get_supabase
from app.schemas.employee import (
    EmployeeCreate, EmployeeUpdate, EmployeeResponse,
    ShiftCreate, ShiftUpdate, ShiftResponse,
    LocationCreate, LocationUpdate, LocationResponse,
    DeviceCreate, DeviceUpdate, DeviceResponse,
)

router = APIRouter(tags=["Management"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# EMPLOYEES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/employees", response_model=List[EmployeeResponse])
async def list_employees(is_active: Optional[bool] = None):
    db = get_supabase()
    query = db.table("employees").select("*, shifts(*)")
    if is_active is not None:
        query = query.eq("is_active", is_active)
    result = query.order("name").execute()
    # Map shift relation
    employees = []
    for emp in result.data:
        shift_data = emp.pop("shifts", None)
        emp["shift"] = shift_data
        employees.append(emp)
    return employees


@router.get("/employees/{employee_id}", response_model=EmployeeResponse)
async def get_employee(employee_id: UUID):
    db = get_supabase()
    result = db.table("employees").select("*, shifts(*)").eq("id", str(employee_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp = result.data[0]
    emp["shift"] = emp.pop("shifts", None)
    return emp


@router.post("/employees", response_model=EmployeeResponse, status_code=201)
async def create_employee(data: EmployeeCreate):
    db = get_supabase()
    payload = data.model_dump(mode="json")
    if payload.get("shift_id"):
        payload["shift_id"] = str(payload["shift_id"])
    result = db.table("employees").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create employee")
    return result.data[0]


@router.put("/employees/{employee_id}", response_model=EmployeeResponse)
async def update_employee(employee_id: UUID, data: EmployeeUpdate):
    db = get_supabase()
    payload = data.model_dump(exclude_none=True, mode="json")
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    if payload.get("shift_id"):
        payload["shift_id"] = str(payload["shift_id"])
    result = db.table("employees").update(payload).eq("id", str(employee_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return result.data[0]


@router.delete("/employees/{employee_id}")
async def delete_employee(employee_id: UUID):
    """Soft delete — sets is_active = FALSE."""
    db = get_supabase()
    result = db.table("employees").update({"is_active": False}).eq("id", str(employee_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"message": "Employee deactivated"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SHIFTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/shifts", response_model=List[ShiftResponse])
async def list_shifts():
    db = get_supabase()
    result = db.table("shifts").select("*").order("name").execute()
    return result.data


@router.get("/shifts/{shift_id}", response_model=ShiftResponse)
async def get_shift(shift_id: UUID):
    db = get_supabase()
    result = db.table("shifts").select("*").eq("id", str(shift_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Shift not found")
    return result.data[0]


@router.post("/shifts", response_model=ShiftResponse, status_code=201)
async def create_shift(data: ShiftCreate):
    db = get_supabase()
    payload = data.model_dump(mode="json")
    # Auto-generate shift_code if not provided
    if not payload.get("shift_code"):
        existing = db.table("shifts").select("shift_code").order("shift_code", desc=True).execute()
        max_num = 0
        for s in (existing.data or []):
            code = s.get("shift_code") or ""
            if code.startswith("S-") and code[2:].isdigit():
                max_num = max(max_num, int(code[2:]))
        payload["shift_code"] = f"S-{max_num + 1:03d}"
    result = db.table("shifts").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create shift")
    return result.data[0]


@router.put("/shifts/{shift_id}", response_model=ShiftResponse)
async def update_shift(shift_id: UUID, data: ShiftUpdate):
    db = get_supabase()
    payload = data.model_dump(exclude_none=True, mode="json")
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = db.table("shifts").update(payload).eq("id", str(shift_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Shift not found")
    return result.data[0]


@router.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: UUID):
    """Delete a shift. Fails if employees are still assigned to it."""
    db = get_supabase()
    # Check if any employee uses this shift
    emp_check = db.table("employees").select("id").eq("shift_id", str(shift_id)).limit(1).execute()
    if emp_check.data:
        raise HTTPException(status_code=400, detail="Cannot delete: employees are assigned to this shift. Reassign them first.")
    result = db.table("shifts").delete().eq("id", str(shift_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Shift not found")
    return {"message": "Shift deleted"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LOCATIONS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/locations", response_model=List[LocationResponse])
async def list_locations():
    db = get_supabase()
    result = db.table("locations").select("*").order("name").execute()
    return result.data


@router.get("/locations/{location_id}", response_model=LocationResponse)
async def get_location(location_id: UUID):
    db = get_supabase()
    result = db.table("locations").select("*").eq("id", str(location_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Location not found")
    return result.data[0]


@router.post("/locations", response_model=LocationResponse, status_code=201)
async def create_location(data: LocationCreate):
    db = get_supabase()
    result = db.table("locations").insert(data.model_dump(mode="json")).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create location")
    return result.data[0]


@router.put("/locations/{location_id}", response_model=LocationResponse)
async def update_location(location_id: UUID, data: LocationUpdate):
    db = get_supabase()
    payload = data.model_dump(exclude_none=True, mode="json")
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = db.table("locations").update(payload).eq("id", str(location_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Location not found")
    return result.data[0]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DEVICES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/devices", response_model=List[DeviceResponse])
async def list_devices():
    db = get_supabase()
    result = db.table("devices").select("*, locations(*)").order("device_name").execute()
    devices = []
    for dev in result.data:
        loc = dev.pop("locations", None)
        dev["location"] = loc
        devices.append(dev)
    return devices


@router.get("/devices/{device_id}", response_model=DeviceResponse)
async def get_device(device_id: UUID):
    db = get_supabase()
    result = db.table("devices").select("*, locations(*)").eq("id", str(device_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Device not found")
    dev = result.data[0]
    dev["location"] = dev.pop("locations", None)
    return dev


@router.post("/devices", response_model=DeviceResponse, status_code=201)
async def create_device(data: DeviceCreate):
    db = get_supabase()
    payload = data.model_dump(mode="json")
    if payload.get("location_id"):
        payload["location_id"] = str(payload["location_id"])
    result = db.table("devices").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create device")
    return result.data[0]


@router.put("/devices/{device_id}", response_model=DeviceResponse)
async def update_device(device_id: UUID, data: DeviceUpdate):
    db = get_supabase()
    payload = data.model_dump(exclude_none=True, mode="json")
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    if payload.get("location_id"):
        payload["location_id"] = str(payload["location_id"])
    result = db.table("devices").update(payload).eq("id", str(device_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Device not found")
    return result.data[0]


@router.get("/devices/health/check")
async def device_health_check():
    """Check for stale devices (not seen in > 60 minutes)."""
    db = get_supabase()
    from datetime import datetime, timedelta
    threshold = (datetime.utcnow() - timedelta(minutes=60)).isoformat()

    all_devices = db.table("devices").select("*").eq("is_active", True).execute()

    stale = []
    healthy = []
    unassigned = []

    for dev in all_devices.data:
        if dev.get("location_id") is None:
            unassigned.append(dev)
        if dev.get("last_seen_at") and dev["last_seen_at"] < threshold:
            stale.append(dev)
        elif dev.get("last_seen_at"):
            healthy.append(dev)
        else:
            stale.append(dev)  # Never seen

    return {
        "total_devices": len(all_devices.data),
        "healthy": len(healthy),
        "stale": len(stale),
        "unassigned": len(unassigned),
        "stale_devices": [
            {"device_sn": d["device_sn"], "device_name": d["device_name"], "last_seen_at": d.get("last_seen_at")}
            for d in stale
        ],
        "unassigned_devices": [
            {"device_sn": d["device_sn"], "device_name": d["device_name"]}
            for d in unassigned
        ],
    }
