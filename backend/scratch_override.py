import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID
from app.database import get_supabase
from app.schemas.attendance import OverrideCreate, OverrideType
from app.routers.overrides import create_override

async def main():
    db = get_supabase()
    emp_id = "290d0f43-dc64-4ad4-84bb-fdaddbe35b4c" # Shamim
    admin_id = "c0c97800-474c-47fc-8f7f-22a281e05dcd" # Just need any valid uuid for created_by, or None. Let's pass None.
    
    # Target OUT times in UTC
    corrections = [
        ("2026-04-01", "2026-04-01T19:30:00+00:00"), # 01:00 AM on 02/4
        ("2026-04-03", "2026-04-03T19:40:00+00:00"), # 01:10 AM on 04/4
        ("2026-04-10", "2026-04-10T19:45:00+00:00"), # 01:15 AM on 11/4
        ("2026-04-14", "2026-04-14T19:15:00+00:00"), # 12:45 AM on 15/4
        ("2026-04-17", "2026-04-17T19:30:00+00:00"), # 01:00 AM on 18/4
        ("2026-04-18", "2026-04-18T19:10:00+00:00"), # 12:40 AM on 19/4
        ("2026-04-21", "2026-04-21T16:15:00+00:00"), # 09:45 PM on 21/4
        ("2026-04-29", "2026-04-29T20:00:00+00:00"), # 01:30 AM on 30/4
    ]
    
    for session_date_str, out_utc in corrections:
        date_obj = datetime.strptime(session_date_str, "%Y-%m-%d").date()
        out_dt = datetime.fromisoformat(out_utc)
        
        req = OverrideCreate(
            employee_id=UUID(emp_id),
            session_date=date_obj,
            override_type=OverrideType.SET_PUNCH_OUT,
            override_punch_out=out_dt,
            override_status="COMPLETE",
            reason="Bulk correction from handwritten log",
            created_by=None
        )
        
        try:
            res = await create_override(req)
            print(f"Success {session_date_str}: -> {out_dt.isoformat()}")
        except Exception as e:
            print(f"Failed {session_date_str}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
