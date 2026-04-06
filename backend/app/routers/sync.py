"""Endpoint for manual sync from USB or Local Agent.

Handles file uploads (like 1_attlog.dat) from the Next.js frontend,
parsing them using the same logic as the ADMS push endpoint.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from datetime import datetime
import logging

from app.database import get_supabase
from app.utils.timezone import parse_device_datetime

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sync", tags=["Sync"])

@router.post("/upload-dat")
async def upload_dat_file(
    file: UploadFile = File(...),
    device_sn: str = Form("MANUAL_USB")
):
    """Process a .dat or .txt file containing ZKTeco ATTLOG data."""
    if not file.filename.endswith(('.dat', '.txt', '.log')):
        raise HTTPException(status_code=400, detail="Must be a .dat or .txt file")

    contents = await file.read()
    body_text = contents.decode("utf-8", errors="replace").strip()

    if not body_text:
        return {"inserted": 0, "errors": 0, "message": "Empty file"}

    db = get_supabase()

    inserted_count = 0
    error_count = 0

    for line in body_text.split("\n"):
        line = line.strip()
        if not line:
            continue

        try:
            parts = line.split("\t")
            if len(parts) < 2:
                # Sometimes comma separated or space separated depending on export
                parts = line.split()
                if len(parts) < 2:
                    error_count += 1
                    continue
                # If space separated, part[0] is user, part[1] is date, part[2] is time
                if len(parts) >= 3 and "-" in parts[1] and ":" in parts[2]:
                    device_user_id = parts[0].strip()
                    punch_time_str = f"{parts[1].strip()} {parts[2].strip()}"
                    status_code = parts[3].strip() if len(parts) > 3 else "0"
                    verify_mode = parts[4].strip() if len(parts) > 4 else "0"
                else:
                    device_user_id = parts[0].strip()
                    punch_time_str = parts[1].strip()
                    status_code = parts[2].strip() if len(parts) > 2 else "0"
                    verify_mode = parts[3].strip() if len(parts) > 3 else "0"
            else:
                device_user_id = parts[0].strip()
                punch_time_str = parts[1].strip()
                status_code = parts[2].strip() if len(parts) > 2 else "0"
                verify_mode = parts[3].strip() if len(parts) > 3 else "0"

            punch_time_utc = parse_device_datetime(punch_time_str)

            raw_payload = {
                "device_user_id": device_user_id,
                "punch_time_local": punch_time_str,
                "status_code": status_code,
                "verify_mode": verify_mode,
                "device_sn": device_sn,
                "raw_line": line,
                "source": "USB_UPLOAD"
            }

            db.table("raw_punches").upsert(
                {
                    "device_user_id": device_user_id,
                    "punch_time": punch_time_utc.isoformat(),
                    "device_sn": device_sn,
                    "raw_payload": raw_payload,
                    "is_processed": False,
                },
                on_conflict="device_sn,device_user_id,punch_time",
                ignore_duplicates=True,
            ).execute()

            inserted_count += 1

        except Exception as e:
            logger.error(f"Error processing line {line}: {e}")
            error_count += 1
            continue

    # Update device last_seen_at if syncing from cloud agent
    if device_sn and device_sn != "MANUAL_USB":
        try:
            db.table("devices").update({
                "last_seen_at": datetime.utcnow().isoformat(),
                "poll_status": "ok"
            }).eq("device_sn", device_sn).execute()
        except Exception as e:
            logger.error(f"Failed to update device status for {device_sn}: {e}")

    logger.info(f"USB Sync for {device_sn}: {inserted_count} inserted, {error_count} errors")
    return {
        "inserted": inserted_count,
        "errors": error_count,
        "message": f"Successfully processed {inserted_count} punches."
    }
