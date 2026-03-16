from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import asyncio
from zk import ZK

from app.database import get_supabase

router = APIRouter(tags=["devices"])

class DeviceStatusResponse(BaseModel):
    id: str
    device_sn: str
    device_name: str
    device_ip: Optional[str] = None
    device_port: int
    connection_mode: str
    is_active: bool
    poll_status: Optional[str] = None
    last_polled_at: Optional[str] = None
    last_seen_at: Optional[str] = None

class TestConnectionRequest(BaseModel):
    ip: str
    port: int = 4370

class TestConnectionResponse(BaseModel):
    success: bool
    message: str
    firmware_version: Optional[str] = None
    serial_number: Optional[str] = None
    mac_address: Optional[str] = None

@router.get("/devices", response_model=List[DeviceStatusResponse])
async def list_devices():
    """List all configured devices and their sync status."""
    db = get_supabase()
    result = db.table("devices").select("*").order("created_at").execute()
    return result.data or []

@router.post("/devices/test-connection", response_model=TestConnectionResponse)
async def test_device_connection(req: TestConnectionRequest):
    """Test TCP connection to a ZKTeco device."""
    loop = asyncio.get_event_loop()
    
    # Run blocking zklib in thread pool
    def _test():
        zk = ZK(req.ip, port=req.port, timeout=5, password=0, force_udp=False, ommit_ping=False)
        conn = None
        try:
            conn = zk.connect()
            return {
                "success": True,
                "message": "Connection successful",
                "firmware_version": conn.get_firmware_version(),
                "serial_number": conn.get_serialnumber(),
                "mac_address": conn.get_mac()
            }
        except Exception as e:
            return {
                "success": False,
                "message": str(e)
            }
        finally:
            if conn:
                conn.disconnect()

    return await loop.run_in_executor(None, _test)

class DeviceUpdateRequest(BaseModel):
    device_name: Optional[str] = None
    device_ip: Optional[str] = None
    device_port: Optional[int] = None
    connection_mode: Optional[str] = None
    is_active: Optional[bool] = None

@router.put("/devices/{device_id}", responses={400: {"description": "No fields provided to update"}, 404: {"description": "Device not found"}})
async def update_device(device_id: str, req: DeviceUpdateRequest):
    """Update device configuration."""
    db = get_supabase()
    
    update_data = {k: v for k, v in req.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    result = db.table("devices").update(update_data).eq("id", device_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Device not found")
        
    return result.data[0]
