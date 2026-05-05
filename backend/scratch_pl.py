import asyncio
from datetime import date
from app.database import get_supabase
from app.workers.payroll_worker import calculate_payroll

async def main():
    db = get_supabase()
    eligible_names = ["shabnam", "shruti", "yogesh", "shamim"]
    
    # Get all employees matching the names
    employees = db.table("employees").select("id, name").execute()
    
    targets = []
    for emp in employees.data:
        emp_name = emp.get("name", "").lower()
        if any(n in emp_name for n in eligible_names):
            targets.append(emp)
            
    period_start = date(2026, 4, 1)
    period_end = date(2026, 4, 30)
    
    print(f"Recalculating for {len(targets)} eligible employees...")
    for emp in targets:
        print(f"Calculating for: {emp['name']}")
        try:
            res = await calculate_payroll(emp['id'], period_start, period_end)
            pl = res.get('calculation_details', {}).get('pl_adjustment', 0)
            print(f"  -> PL Adjustment added: ₹{pl}")
            print(f"  -> Final Salary: ₹{res.get('final_salary')}")
        except Exception as e:
            print(f"  -> Failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
