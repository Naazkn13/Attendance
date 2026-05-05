import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID
from app.database import get_supabase
from app.schemas.attendance import OverrideCreate, OverrideType
from app.routers.overrides import create_override

async def main():
    emp_id = "290d0f43-dc64-4ad4-84bb-fdaddbe35b4c" # Shamim
    
    # Target IN and OUT times in UTC
    corrections = [
        ("2026-04-01", "2026-04-01T07:30:00+00:00", "2026-04-01T16:03:11+00:00"), # 1:00 PM to 9:33 PM
        ("2026-04-03", "2026-04-03T07:40:00+00:00", "2026-04-03T16:10:33+00:00"), # 1:10 PM to 9:40 PM
        ("2026-04-10", "2026-04-10T07:45:00+00:00", "2026-04-10T16:47:56+00:00"), # 1:15 PM to 10:17 PM
        ("2026-04-14", "2026-04-14T07:15:00+00:00", "2026-04-14T16:10:28+00:00"), # 12:45 PM to 9:40 PM
        ("2026-04-17", "2026-04-17T07:30:00+00:00", "2026-04-17T16:12:08+00:00"), # 1:00 PM to 9:42 PM
        ("2026-04-18", "2026-04-18T07:10:00+00:00", "2026-04-18T16:45:26+00:00"), # 12:40 PM to 10:15 PM
        ("2026-04-21", "2026-04-21T08:45:47+00:00", "2026-04-21T16:15:00+00:00"), # 2:15 PM to 9:45 PM
        ("2026-04-29", "2026-04-29T08:00:00+00:00", "2026-04-29T16:18:00+00:00"), # 1:30 PM to 9:48 PM
    ]
    
    for session_date_str, in_utc, out_utc in corrections:
        date_obj = datetime.strptime(session_date_str, "%Y-%m-%d").date()
        in_dt = datetime.fromisoformat(in_utc)
        out_dt = datetime.fromisoformat(out_utc)
        
        req = OverrideCreate(
            employee_id=UUID(emp_id),
            session_date=date_obj,
            override_type=OverrideType.SET_BOTH,
            override_punch_in=in_dt,
            override_punch_out=out_dt,
            override_status="COMPLETE",
            reason="Bulk correction from handwritten log (AM/PM Fixed)",
            created_by=None
        )
        
        try:
            res = await create_override(req)
            print(f"Success {session_date_str}: IN {in_dt.isoformat()} OUT {out_dt.isoformat()}")
        except Exception as e:
            print(f"Failed {session_date_str}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
