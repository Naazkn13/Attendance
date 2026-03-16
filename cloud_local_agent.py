import time
import requests
import datetime
from zk import ZK

# ======== CONFIGURATION ========
DEVICE_IP = "192.168.1.201"  
DEVICE_PORT = 4370
DEVICE_SN = "4266542501559"
# Change this to your Railway/Vercel API URL once deployed
CLOUD_API_URL = "http://127.0.0.1:8000/api/sync/upload-dat" 
POLL_INTERVAL_SECONDS = 60
# ===============================

print(f"🚀 Starting Local Sync Agent for device {DEVICE_SN} at {DEVICE_IP}")
print(f"☁️ Syncing to Cloud API: {CLOUD_API_URL}")

def sync_data():
    zk = ZK(DEVICE_IP, port=DEVICE_PORT, timeout=10)
    conn = None
    try:
        conn = zk.connect()
        conn.disable_device()
        
        # Get all attendance records from the local device
        attendances = conn.get_attendance()
        
        lines = []
        for att in attendances:
            # Format: user_id \t YYYY-MM-DD HH:MM:SS \t status \t punch
            dt_str = att.timestamp.strftime('%Y-%m-%d %H:%M:%S')
            lines.append(f"{att.user_id}\t{dt_str}\t{att.status}\t{att.punch}")
            
        conn.enable_device()
        
        if lines:
            attlog_data = "\n".join(lines)
            print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] Found {len(lines)} records. Pushing to cloud...")
            
            # Use the /sync/upload-dat endpoint to mimic a USB upload
            files = {'file': ('sync.dat', attlog_data, 'text/plain')}
            data = {'device_sn': DEVICE_SN}
            
            resp = requests.post(CLOUD_API_URL, files=files, data=data)
            
            if resp.status_code == 200:
                result = resp.json()
                print(f"✅ Cloud Sync Success: {result['inserted']} new, {result['errors']} errors.")
                # We do NOT clear attendance from device to keep a backup.
                # The cloud API handles idempotency (ON CONFLICT DO NOTHING).
            else:
                print(f"❌ Cloud API Error: {resp.status_code} - {resp.text}")
        else:
            print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] No records found on device.")
            
    except Exception as e:
        print(f"❌ Connection Error: {e}")
    finally:
        if conn:
            conn.disconnect()

if __name__ == "__main__":
    while True:
        sync_data()
        time.sleep(POLL_INTERVAL_SECONDS)
