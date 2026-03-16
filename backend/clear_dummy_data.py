import asyncio
from app.database import get_supabase

async def main():
    db = get_supabase()
    
    print("🗑️ Clearing dummy data...")
    
    # Must delete in correct order due to foreign keys
    tables_in_order = [
         "manual_corrections_log",
         "session_overrides",
         "payroll_records",
         "attendance_sessions",
         "raw_punches"
    ]
    
    for table in tables_in_order:
        print(f"Fetching IDs for {table}...")
        res = db.table(table).select("id").execute()
        if res.data:
            print(f"Deleting {len(res.data)} records from {table}...")
            # Supabase doesn't support bulk delete without filters well from the autogen SDK. 
            # We delete one by one or in batches.
            for row in res.data:
                try:
                    db.table(table).delete().eq("id", row["id"]).execute()
                except Exception as e:
                    print(f"Error deleting row {row['id']} from {table}: {e}")
                    
    # Clean up dummy employees
    print("Cleaning up dummy employees...")
    valid_device_ids = ["1", "2", "6", "7", "10", "12", "13"]
    # get all employees
    employees = db.table("employees").select("*").execute()
    for emp in employees.data:
        if emp["device_user_id"] not in valid_device_ids:
            try:
                db.table("employees").delete().eq("id", emp["id"]).execute()
                print(f"Deleted dummy employee: {emp['name']}")
            except Exception as e:
                print(f"Could not delete {emp['name']}, skipping.")
                
    print("✅ Dummy data cleared successfully!")

if __name__ == "__main__":
    asyncio.run(main())
