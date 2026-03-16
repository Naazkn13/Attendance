import logging
from datetime import datetime
import asyncio
from zk import ZK

from app.database import get_supabase
from app.utils.timezone import parse_device_datetime

logger = logging.getLogger(__name__)

async def run_device_poller():
    """
    Background worker to poll devices for attendance data.
    Runs periodically (e.g., every 60 seconds).
    Finds devices configured for 'pull' mode and pulls data via pyzk.
    """
    logger.info("📡 Running Device Poller...")

    db = get_supabase()

    try:
        # Fetch active devices in pull mode
        result = db.table("devices").select("*").eq("is_active", True).eq("connection_mode", "pull").execute()
        devices = result.data or []
        print(f"DEBUG: Found devices from DB: {devices}")

        if not devices:
            logger.info("No active devices in pull mode found.")
            return

        logger.info(f"Found {len(devices)} device(s) to poll.")

        for device in devices:
            device_ip = device.get("device_ip")
            device_port = device.get("device_port", 4370)
            device_sn = device.get("device_sn")
            device_id = device.get("id")

            if not device_ip:
                logger.warning(f"Device {device_sn} is in pull mode but has no IP configured. Skipping.")
                continue
            
            logger.info(f"Connecting to device {device_sn} at {device_ip}:{device_port}")
            
            # Run connection and pulling logic asynchronously to avoid blocking
            # pyzk uses blocking sockets, so run it in a thread executor
            loop = asyncio.get_event_loop()
            punches, error = await loop.run_in_executor(None, _pull_from_device, device_ip, device_port)

            print(f"DEBUG: Error from pyzk: {error}")
            print(f"DEBUG: Punches fetched from pyzk: {len(punches) if punches else 0}")
            
            status = 'ok'
            if error:
                logger.error(f"Failed to poll device {device_sn}: {error}")
                status = 'error'
            else:
                logger.info(f"Successfully pulled {len(punches)} punches from {device_sn}")
                
                # Insert punches into the database
                num_inserted = _insert_punches(db, punches, device_sn)
                logger.info(f"Inserted {num_inserted} new punches into raw_punches for {device_sn}")

            # Update device status
            db.table("devices").update({
                "last_polled_at": "now()",
                "poll_status": status,
                "last_seen_at": "now()" if status == 'ok' else device.get("last_seen_at")
            }).eq("id", device_id).execute()

    except Exception as e:
        logger.error(f"🚨 Error in Device Poller: {e}")

def _pull_from_device(ip: str, port: int):
    """
    Synchronous function to connect and retrieve attendance records using pyzk.
    """
    zk_client = ZK(ip, port=port, timeout=10, password=0, force_udp=False, ommit_ping=False)
    conn = None
    try:
        conn = zk_client.connect()
        # conn.disable_device() # Disable device during fetch to avoid race condition (optional)
        
        # Get attendance records
        attendance = conn.get_attendance()
        
        # Optional: enable device again
        # conn.enable_device()
        
        return attendance, None
    except Exception as e:
        return [], str(e)
    finally:
        if conn:
            conn.disconnect()

def _insert_punches(db, punches_from_device, device_sn):
    """
    Inserts a list of raw punches into the database using UPSERT.
    """
    if not punches_from_device:
        return 0

    payloads = []
    
    # We iterate backwards to insert older first if desired or just push all
    for punch in punches_from_device:
        # User ID is sometimes returned as string or int depending on pyzk version
        user_id = str(punch.user_id) 
        # pyzk returns naive local time from device clock (IST); convert to UTC
        punch_time = parse_device_datetime(
            punch.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        ).isoformat()
        
        # We need an idempotency approach. ON CONFLICT DO NOTHING
        # using the composite unique key constraint
        payloads.append({
            "device_user_id": user_id,
            "punch_time": punch_time,
            "device_sn": device_sn,
            "raw_payload": {
                "source": "pyzk_pull",
                "status": punch.status,
                "punch": punch.punch
            }
        })
    
    if not payloads:
        return 0

    inserted_count = 0
    # Process in batches to prevent API limits if many thousands of punches
    batch_size = 500
    for i in range(0, len(payloads), batch_size):
        batch = payloads[i:i + batch_size]
        try:
            # Upsert relying on unique constraint
            # Supabase postgrest requires explicitly defining the conflict target for ignore_duplicates
            db.table("raw_punches").upsert(batch, ignore_duplicates=True, on_conflict="device_sn,device_user_id,punch_time").execute()
            inserted_count += len(batch)
        except Exception as e:
            logger.error(f"Failed to insert punch batch: {e}")

    return inserted_count
