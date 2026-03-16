import asyncio
from app.database import get_supabase
import uuid
from datetime import date

async def main():
    db = get_supabase()
    
    # Get the default shift (assuming 8h)
    shifts = db.table("shifts").select("*").execute()
    if not shifts.data:
        print("No shifts found! Exiting.")
        return
    shift_8h = next((s for s in shifts.data if "8" in s["name"]), shifts.data[0])
    
    users = [
        {"device_user_id": "1", "name": "YASMIN SHAIKH"},
        {"device_user_id": "2", "name": "SHRUTI KATE"},
        {"device_user_id": "6", "name": "SULTANA SHAIKH"},
        {"device_user_id": "7", "name": "YOGESH MAHADIK"},
        {"device_user_id": "10", "name": "ASIFA SHAIKH"},
        {"device_user_id": "12", "name": "SHAMIM SHIRGAONKAR"},
        {"device_user_id": "13", "name": "SHABNAM SHAIKH"}
    ]
    
    for user in users:
        # Check if exists
        existing = db.table("employees").select("*").eq("device_user_id", user["device_user_id"]).execute()
        if not existing.data:
            print(f"Inserting {user['name']}...")
            db.table("employees").insert({
                "name": user["name"],
                "device_user_id": user["device_user_id"],
                "basic_salary": 15000,  # Default
                "shift_id": shift_8h["id"],
                "joining_date": date(2025, 1, 1).isoformat(),
                "is_active": True
            }).execute()
        else:
            print(f"User {user['name']} already exists.")
            
    print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
