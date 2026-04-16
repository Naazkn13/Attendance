"""ADMS Push Protocol — ZKTeco/eSSL device push endpoint.

Implements the iClock ADMS protocol so devices configured in "push" mode
can send attendance data directly to the backend over HTTP.

Protocol overview:
  1. Device sends GET /iclock/cdata?SN=xxx  → handshake / registration
  2. Server replies with commands (e.g. GET ATTLOG)
  3. Device sends POST /iclock/cdata?SN=xxx&table=ATTLOG  → attendance data
  4. Server replies OK
  5. Device sends GET /iclock/getrequest?SN=xxx  → poll for pending commands
"""

import logging
from datetime import datetime
from fastapi import APIRouter, Request, Response, Query
from typing import Optional

from app.database import get_supabase
from app.utils.timezone import parse_device_datetime

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ADMS"])


# ─── GET /iclock/cdata — Device Handshake ──────────────────────────
@router.get("/iclock/cdata")
async def adms_handshake(
    request: Request,
    SN: str = Query(..., description="Device serial number"),
    options: Optional[str] = Query(None),
    pushver: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
):
    """Handle the ADMS handshake from a ZKTeco/eSSL device.

    The device periodically sends this GET request to register itself
    and to receive configuration commands from the server.
    """
    logger.info(f"ADMS handshake from SN={SN} pushver={pushver} options={options}")

    db = get_supabase()

    # Auto-register or update last_seen_at
    existing = db.table("devices").select("id, location_id").eq("device_sn", SN).execute()

    if existing.data:
        # Update last_seen_at
        db.table("devices").update({
            "last_seen_at": datetime.utcnow().isoformat(),
            "connection_mode": "push",
            "poll_status": "ok",
        }).eq("device_sn", SN).execute()
    else:
        # Auto-register unknown device
        db.table("devices").insert({
            "device_sn": SN,
            "device_name": f"Auto-registered ({SN})",
            "connection_mode": "push",
            "last_seen_at": datetime.utcnow().isoformat(),
            "is_active": True,
        }).execute()
        logger.warning(f"Auto-registered unknown device: {SN}")

    # Tell the device to push ATTLOG data
    # Stamp=0 forces device to send ALL records regardless of internal tracking
    commands = (
        "GET ATTLOG Stamp=0\r\n"
        "GET OPERLOG Stamp=0\r\n"
        "OK\r\n"
    )

    return Response(
        content=commands,
        media_type="text/plain",
        headers={
            "Content-Type": "text/plain",
        },
    )


# ─── POST /iclock/cdata — Attendance Data Push ────────────────────
@router.post("/iclock/cdata")
async def adms_receive_data(
    request: Request,
    SN: str = Query(..., description="Device serial number"),
    table: Optional[str] = Query(None, description="Data table type"),
    Stamp: Optional[str] = Query(None),
):
    """Receive attendance push data from the device.

    The device POSTs ATTLOG lines in the body, one record per line.
    Each line is tab-separated: user_id, datetime, status, verify, reserved...
    """
    body = await request.body()
    body_text = body.decode("utf-8", errors="replace").strip()

    logger.info(f"ADMS push from SN={SN}, table={table}, body_size={len(body_text)} bytes")

    # Update device last_seen_at
    db = get_supabase()
    db.table("devices").update({
        "last_seen_at": datetime.utcnow().isoformat(),
        "poll_status": "ok",
    }).eq("device_sn", SN).execute()

    if not body_text or table not in ("ATTLOG", "attlog", None):
        # OPERLOG or other data — acknowledge but don't process attendance
        if table and table.upper() == "OPERLOG":
            logger.info(f"Received OPERLOG from {SN}, acknowledged (not processed)")
        return Response(content="OK\r\n", media_type="text/plain")

    # Process ATTLOG lines
    inserted = 0
    errors = 0

    for line in body_text.split("\n"):
        line = line.strip()
        if not line:
            continue

        try:
            parts = line.split("\t")

            if len(parts) < 2:
                # Sometimes space-separated
                parts = line.split()

            if len(parts) < 2:
                logger.warning(f"ADMS: Skipping malformed line: {line}")
                errors += 1
                continue

            device_user_id = parts[0].strip()
            punch_time_str = parts[1].strip()

            # Some devices send date and time in separate fields
            if len(parts) >= 3 and "-" in parts[1] and ":" in parts[2] and ":" not in parts[1]:
                punch_time_str = f"{parts[1].strip()} {parts[2].strip()}"
                status_code = parts[3].strip() if len(parts) > 3 else "0"
                verify_mode = parts[4].strip() if len(parts) > 4 else "0"
            else:
                status_code = parts[2].strip() if len(parts) > 2 else "0"
                verify_mode = parts[3].strip() if len(parts) > 3 else "0"

            # Parse device local time → UTC
            punch_time_utc = parse_device_datetime(punch_time_str)

            raw_payload = {
                "device_user_id": device_user_id,
                "punch_time_local": punch_time_str,
                "status_code": status_code,
                "verify_mode": verify_mode,
                "device_sn": SN,
                "raw_line": line,
                "source": "ADMS_PUSH",
            }

            db.table("raw_punches").upsert(
                {
                    "device_user_id": device_user_id,
                    "punch_time": punch_time_utc.isoformat(),
                    "device_sn": SN,
                    "raw_payload": raw_payload,
                    "is_processed": False,
                },
                on_conflict="device_sn,device_user_id,punch_time",
                ignore_duplicates=True,
            ).execute()

            inserted += 1

        except Exception as e:
            logger.error(f"ADMS: Error processing line '{line}': {e}")
            errors += 1

    logger.info(f"ADMS push from {SN}: {inserted} punches inserted, {errors} errors")
    return Response(content="OK\r\n", media_type="text/plain")


# ─── GET /iclock/getrequest — Device Command Poll ─────────────────
@router.get("/iclock/getrequest")
async def adms_get_request(
    SN: str = Query(..., description="Device serial number"),
):
    """Respond to device polling for pending commands.

    The device periodically asks if there are any commands to execute
    (like syncing time, restarting, etc.). For now, we return empty (no commands).
    """
    # No pending commands — return OK
    return Response(content="OK\r\n", media_type="text/plain")


# ─── POST /iclock/devicecmd — Device Command Acknowledgement ─────
@router.post("/iclock/devicecmd")
async def adms_device_cmd(
    request: Request,
    SN: str = Query(None),
):
    """Acknowledge device command execution results."""
    return Response(content="OK\r\n", media_type="text/plain")
