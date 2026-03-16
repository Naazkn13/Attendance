import asyncio
from zk import ZK

def test_connection(ip, port=4370):
    print(f"Testing connection to {ip}:{port}...")
    zk = ZK(ip, port=port, timeout=5, password=0, force_udp=False, ommit_ping=False)
    conn = None
    try:
        conn = zk.connect()
        print("✅ Connection successful!")
        print(f"Firmware Version: {conn.get_firmware_version()}")
        print(f"Serial Number: {conn.get_serialnumber()}")
        print(f"Device Name: {conn.get_device_name()}")
        print(f"MAC Address: {conn.get_mac()}")
        print(f"Users: {len(conn.get_users())}")
        print(f"Attendance Records: {len(conn.get_attendance())}")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
    finally:
        if conn:
            conn.disconnect()

if __name__ == "__main__":
    test_connection('192.168.1.201', 4370)
