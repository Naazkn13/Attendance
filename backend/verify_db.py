from app.database import get_supabase
import time

db = get_supabase()

print("--- Checking Devices ---")
devices = db.table("devices").select("*").execute()

if len(devices.data) == 0:
    print("Devices table is empty! Inserting device 4266542501559...")
    db.table("devices").insert({
        "device_sn": "4266542501559",
        "device_name": "ZKTeco X2008",
        "device_ip": "192.168.1.201",
        "device_port": 4370,
        "connection_mode": "pull",
        "is_active": True
    }).execute()
    print("Device inserted. Sleeping for 70 seconds to allow the background worker to poll (runs every 60s)...")
    time.sleep(70)
else:
    for d in devices.data:
        print(f"[{d['device_sn']}] IP: {d['device_ip']}, Mode: {d['connection_mode']}, Last Polled: {d['last_polled_at']}, Status: {d['poll_status']}")
        if not d.get('device_ip') or d.get('connection_mode') != 'pull':
            print(f"Updating device {d['device_sn']} to pull mode with IP 192.168.1.201")
            db.table("devices").update({
                "device_ip": "192.168.1.201",
                "device_port": 4370,
                "connection_mode": "pull"
            }).eq("device_sn", d['device_sn']).execute()

print("\n--- Checking Raw Punches ---")
punches = db.table("raw_punches").select("*").order("punch_time", desc=True).limit(5).execute()
print(f"Found {len(punches.data)} recent punches:")
for p in punches.data:
    print(f"Time: {p['punch_time']}, User: {p['device_user_id']}, Device: {p['device_sn']}")
