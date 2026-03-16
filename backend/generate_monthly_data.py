import asyncio
from datetime import datetime, timedelta, date
import random
import uuid

from app.database import get_supabase
from app.utils.timezone import to_utc

async def main():
    db = get_supabase()
    
    print("⏳ Starting to generate 1 month of dummy punches...")
    
    valid_device_ids = ["1", "2", "6", "7", "10", "12", "13"]
    # Get all employees
    employees_res = db.table("employees").select("*").in_("device_user_id", valid_device_ids).execute()
    employees = employees_res.data
    
    if not employees:
        print("No valid employees found. Exiting.")
        return
        
    start_date = date(2026, 2, 1)
    end_date = date(2026, 2, 28)
    
    punches_to_insert = []
    
    def random_time(hour, minute, variance_mins):
        base = datetime.combine(start_date, datetime.min.time()) + timedelta(hours=hour, minutes=minute)
        # Random offset between -variance and +variance
        offset = timedelta(minutes=random.randint(-variance_mins, variance_mins))
        return (base + offset).time()

    print(f"Generating data for {len(employees)} employees from {start_date} to {end_date}...")
    
    current_date = start_date
    while current_date <= end_date:
        is_sunday = current_date.weekday() == 6
        
        for emp in employees:
            device_id = emp["device_user_id"]
            
            # Skip Sundays entirely (simulating clinic closed / day off)
            if is_sunday:
                continue
                
            # Insert some intentional exceptions:
            # 1. Absences
            if device_id == "2" and current_date == date(2026, 2, 10):
                continue # Absent
                
            # 2. Daily Punches
            in_hour, in_min = 9, 0  # 9:00 AM standard
            out_hour, out_min = 18, 0 # 6:00 PM standard
            
            # 3. Overtime
            if device_id == "6" and current_date == date(2026, 2, 15):
                out_hour = 20 # 2 hours overtime
                
            # Add IN punch
            in_time = random_time(in_hour, in_min, 15)
            dt_in = datetime.combine(current_date, in_time)
            dt_in_utc = to_utc(dt_in)
            
            punches_to_insert.append({
                "device_user_id": device_id,
                "punch_time": dt_in_utc.isoformat(),
                "device_sn": "DUMMY_GEN",
                "is_processed": False,
                "raw_payload": {"source": "fake_data_gen", "type": "IN"}
            })
            
            # 4. Missing OUT punch (Auto Checkout test)
            if device_id == "7" and current_date == date(2026, 2, 20):
                pass # Missing OUT punch
            else:
                # Add OUT punch
                out_time = random_time(out_hour, out_min, 15)
                # Ensure OUT is strictly after IN
                if out_time < in_time:
                    out_time = (datetime.combine(current_date, in_time) + timedelta(hours=8)).time()
                
                dt_out = datetime.combine(current_date, out_time)
                dt_out_utc = to_utc(dt_out)
                
                punches_to_insert.append({
                    "device_user_id": device_id,
                    "punch_time": dt_out_utc.isoformat(),
                    "device_sn": "DUMMY_GEN",
                    "is_processed": False,
                    "raw_payload": {"source": "fake_data_gen", "type": "OUT"}
                })
        
        current_date += timedelta(days=1)
        
    print(f"Generated {len(punches_to_insert)} punches. Inserting into DB...")
    
    # Insert in batches of 100
    batch_size = 100
    for i in range(0, len(punches_to_insert), batch_size):
        batch = punches_to_insert[i:i+batch_size]
        try:
            db.table("raw_punches").insert(batch).execute()
        except Exception as e:
            print(f"Failed to insert batch: {e}")
            
    print("✅ Dummy data successfully inserted!")

if __name__ == "__main__":
    asyncio.run(main())
