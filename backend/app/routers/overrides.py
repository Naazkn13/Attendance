"""Override API — create, view, deactivate admin corrections."""

from fastapi import APIRouter, HTTPException
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from app.database import get_supabase
from app.schemas.attendance import OverrideCreate, OverrideResponse, CorrectionLogResponse

router = APIRouter(tags=["Overrides"])


@router.post("/overrides", response_model=OverrideResponse, status_code=201)
async def create_override(data: OverrideCreate):
    """Create a new session override (admin correction).

    - Deactivates any previous active override for the same employee+date
    - Creates audit log entry
    - Immediately applies the override to the session
    """
    db = get_supabase()

    # 1. Snapshot current session state (before)
    session_before = db.table("attendance_sessions") \
        .select("*") \
        .eq("employee_id", str(data.employee_id)) \
        .eq("session_date", data.session_date.isoformat()) \
        .order("punch_in_time", desc=True) \
        .limit(1) \
        .execute()

    snapshot_before = session_before.data[0] if session_before.data else None

    # 2. Deactivate any existing active override for this employee+date
    existing = db.table("session_overrides") \
        .select("id") \
        .eq("employee_id", str(data.employee_id)) \
        .eq("session_date", data.session_date.isoformat()) \
        .eq("is_active", True) \
        .execute()

    new_override_id = None

    # 3. Create the new override
    payload = {
        "employee_id": str(data.employee_id),
        "session_date": data.session_date.isoformat(),
        "override_type": data.override_type.value,
        "override_punch_in": data.override_punch_in.isoformat() if data.override_punch_in else None,
        "override_punch_out": data.override_punch_out.isoformat() if data.override_punch_out else None,
        "override_status": data.override_status,
        "override_net_hours": float(data.override_net_hours) if data.override_net_hours else None,
        "reason": data.reason,
        "created_by": str(data.created_by) if data.created_by else None,
    }

    result = db.table("session_overrides").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create override")

    new_override = result.data[0]
    new_override_id = new_override["id"]

    # 4. Deactivate old overrides and point to new one
    for old in (existing.data or []):
        db.table("session_overrides").update({
            "is_active": False,
            "superseded_by": new_override_id,
        }).eq("id", old["id"]).execute()

        # Log deactivation
        db.table("manual_corrections_log").insert({
            "override_id": old["id"],
            "action": "SUPERSEDED",
            "performed_by": str(data.created_by) if data.created_by else None,
        }).execute()

    # 5. Apply the override immediately
    from app.workers.override_applicator import apply_overrides_for_sessions
    await apply_overrides_for_sessions([(str(data.employee_id), data.session_date.isoformat())])

    # 6. Snapshot session after override
    session_after = db.table("attendance_sessions") \
        .select("*") \
        .eq("employee_id", str(data.employee_id)) \
        .eq("session_date", data.session_date.isoformat()) \
        .order("punch_in_time", desc=True) \
        .limit(1) \
        .execute()

    snapshot_after = session_after.data[0] if session_after.data else None

    # 7. Create audit log for the new override
    db.table("manual_corrections_log").insert({
        "override_id": new_override_id,
        "action": "CREATED",
        "session_snapshot_before": snapshot_before,
        "session_snapshot_after": snapshot_after,
        "performed_by": str(data.created_by) if data.created_by else None,
    }).execute()

    return new_override


@router.get("/overrides")
async def list_overrides(
    employee_id: Optional[UUID] = None,
    is_active: Optional[bool] = None,
):
    """List overrides with optional filters."""
    db = get_supabase()
    query = db.table("session_overrides").select("*")

    if employee_id:
        query = query.eq("employee_id", str(employee_id))
    if is_active is not None:
        query = query.eq("is_active", is_active)

    result = query.order("created_at", desc=True).execute()
    return result.data


@router.get("/overrides/{override_id}", response_model=OverrideResponse)
async def get_override(override_id: UUID):
    db = get_supabase()
    result = db.table("session_overrides").select("*").eq("id", str(override_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Override not found")
    return result.data[0]


@router.put("/overrides/{override_id}/deactivate")
async def deactivate_override(override_id: UUID, performed_by: Optional[UUID] = None):
    """Soft-revoke an override without deleting."""
    db = get_supabase()

    result = db.table("session_overrides").select("*").eq("id", str(override_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Override not found")

    override = result.data[0]

    db.table("session_overrides").update({"is_active": False}).eq("id", str(override_id)).execute()

    # Log deactivation
    db.table("manual_corrections_log").insert({
        "override_id": str(override_id),
        "action": "DEACTIVATED",
        "performed_by": str(performed_by) if performed_by else None,
    }).execute()

    # Re-run override applicator to remove the override effect
    # This will result in session going back to raw data
    from app.workers.override_applicator import apply_overrides_for_sessions
    await apply_overrides_for_sessions([(override["employee_id"], override["session_date"])])

    return {"message": "Override deactivated"}


@router.get("/corrections/log")
async def corrections_log(
    employee_id: Optional[UUID] = None,
    limit: int = 50,
):
    """View correction audit trail."""
    db = get_supabase()
    query = db.table("manual_corrections_log").select("*, session_overrides(employee_id, session_date, override_type)")

    if employee_id:
        query = query.eq("session_overrides.employee_id", str(employee_id))

    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data
