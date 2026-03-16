"""Debug script: Check Shruti Kate's raw punches and sessions."""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from app.database import get_supabase
from datetime import datetime
import pytz

IST = pytz.timezone("Asia/Kolkata")

db = get_supabase()

# 1. Find Shruti Kate's employee record
emp = db.table("employees").select("id, name, device_user_id, shift_id").ilike("name", "%shruti%").execute()
print("=== EMPLOYEE ===")
for e in emp.data:
    print(f"  ID: {e['id']}")
    print(f"  Name: {e['name']}")
    print(f"  Device User ID: {e['device_user_id']}")
    print(f"  Shift ID: {e['shift_id']}")
    employee_id = e['id']
    device_user_id = e['device_user_id']

# 2. Check raw punches for today & yesterday
print("\n=== RAW PUNCHES (last 2 days) ===")
punches = db.table("raw_punches") \
    .select("*") \
    .eq("device_user_id", device_user_id) \
    .gte("punch_time", "2026-03-13T00:00:00") \
    .order("punch_time", desc=False) \
    .execute()

for p in punches.data:
    punch_utc = p['punch_time']
    # Convert to IST
    if isinstance(punch_utc, str):
        dt_utc = datetime.fromisoformat(punch_utc.replace("Z", "+00:00"))
    else:
        dt_utc = punch_utc
    dt_ist = dt_utc.astimezone(IST)
    print(f"  ID={p['id']}, UTC={punch_utc}, IST={dt_ist.strftime('%Y-%m-%d %H:%M:%S')}, "
          f"device={p['device_sn']}, processed={p['is_processed']}")
    if p.get('raw_payload'):
        print(f"    raw_payload: {p['raw_payload']}")

# 3. Check attendance sessions for today & yesterday
print("\n=== ATTENDANCE SESSIONS (last 2 days) ===")
sessions = db.table("attendance_sessions") \
    .select("*") \
    .eq("employee_id", employee_id) \
    .gte("session_date", "2026-03-13") \
    .order("session_date", desc=False) \
    .execute()

for s in sessions.data:
    pin = s.get('punch_in_time', '')
    pout = s.get('punch_out_time', '')
    # Convert to IST
    pin_ist = ''
    pout_ist = ''
    if pin:
        dt = datetime.fromisoformat(str(pin).replace("Z", "+00:00"))
        pin_ist = dt.astimezone(IST).strftime('%Y-%m-%d %H:%M:%S')
    if pout:
        dt = datetime.fromisoformat(str(pout).replace("Z", "+00:00"))
        pout_ist = dt.astimezone(IST).strftime('%Y-%m-%d %H:%M:%S')
    
    print(f"  Session Date: {s['session_date']}")
    print(f"    Status: {s['status']}")
    print(f"    Punch In  (UTC): {pin}")
    print(f"    Punch In  (IST): {pin_ist}")
    print(f"    Punch Out (UTC): {pout}")
    print(f"    Punch Out (IST): {pout_ist}")
    print(f"    Gross Hours: {s.get('gross_hours')}, Net Hours: {s.get('net_hours')}")
    print(f"    Has Override: {s.get('has_override')}")
    print(f"    punch_in_id: {s.get('punch_in_id')}, punch_out_id: {s.get('punch_out_id')}")
    print()

# 4. Current time info
now_utc = datetime.utcnow()
now_ist = pytz.utc.localize(now_utc).astimezone(IST)
print(f"\n=== CURRENT TIME ===")
print(f"  UTC: {now_utc.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"  IST: {now_ist.strftime('%Y-%m-%d %H:%M:%S')}")

# 5. Check what 11 AM IST today would be in UTC
eleven_am_ist = IST.localize(datetime(2026, 3, 14, 11, 0, 0))
eleven_am_utc = eleven_am_ist.astimezone(pytz.utc)
print(f"\n=== 11 AM IST TODAY ===")
print(f"  IST: {eleven_am_ist.strftime('%Y-%m-%d %H:%M:%S %Z')}")
print(f"  UTC: {eleven_am_utc.strftime('%Y-%m-%d %H:%M:%S %Z')}")
