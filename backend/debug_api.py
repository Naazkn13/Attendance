"""Check for punches received in the last 30 minutes."""
import urllib.request
import json
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

def api_get(path):
    req = urllib.request.Request(f"http://127.0.0.1:8000{path}")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def to_ist(ts_str):
    if not ts_str: return "—"
    dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    return dt.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S IST")

now_utc = datetime.now(timezone.utc)
now_ist = now_utc.astimezone(IST)
cutoff = now_utc - timedelta(minutes=30)

print(f"Current time: {now_ist.strftime('%H:%M:%S IST')} ({now_utc.strftime('%H:%M:%S UTC')})")
print(f"Checking punches since: {cutoff.astimezone(IST).strftime('%H:%M:%S IST')}")
print()

# Get all sessions for today
sessions = api_get("/api/attendance/sessions?date_from=2026-03-14&date_to=2026-03-14&limit=500")

recent_count = 0
for s in sessions:
    for field in ["punch_in_time", "punch_out_time"]:
        ts = s.get(field)
        if ts:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if dt >= cutoff:
                recent_count += 1
                emp_name = s.get("employee_name", "Unknown")
                direction = "IN" if field == "punch_in_time" else "OUT"
                age_min = (now_utc - dt).total_seconds() / 60
                print(f"  {direction}: {emp_name} at {to_ist(ts)} ({age_min:.0f} min ago)")

print(f"\nTotal recent punches in last 30 min: {recent_count}")
print(f"Total sessions today: {len(sessions)}")
