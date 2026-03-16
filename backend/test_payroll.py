import asyncio
from datetime import date
from decimal import Decimal
import logging

from app.database import get_supabase
from app.workers.payroll_worker import calculate_payroll

logging.basicConfig(level=logging.INFO)

async def test_payslips():
    period_start = date(2026, 2, 1)
    period_end = date(2026, 2, 28)
    
    db = get_supabase()
    # Fetch employees to test
    employees_res = db.table("employees").select("*").eq("is_active", True).execute()
    employees = employees_res.data or []
    
    print(f"Testing payroll for {len(employees)} employees from {period_start} to {period_end}")
    
    for emp in employees:
        try:
            payroll = await calculate_payroll(emp["id"], period_start, period_end)
            print("-" * 60)
            print(f"Employee: {emp['name']} (ID: {emp['device_user_id']}) -> Basic: {payroll['basic_salary']}")
            
            calc = payroll.get("calculation_details", {})
            print(f"  Days Present: {payroll['days_present']} | Absent: {payroll['days_absent']}")
            print(f"  Worked Hours: {payroll['total_worked_hours']} | OT: {payroll['overtime_hours']} | Missing: {payroll['missing_hours']}")
            print(f"  OT Pay: {payroll['overtime_pay']} | PT: {calc.get('pt_deduction')}")
            print(f"  Final Salary: {payroll['final_salary']}")
            print(f"  (Per Day: {calc.get('per_day_salary')} | Per Hour: {calc.get('per_hour_rate')})")
        except Exception as e:
            print(f"Error calculating payroll for {emp['name']}: {e}")

if __name__ == "__main__":
    asyncio.run(test_payslips())
