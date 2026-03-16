import asyncio
from datetime import date
from decimal import Decimal
from app.database import get_supabase
from app.workers.session_builder import run_session_builder
from app.workers.payroll_worker import calculate_payroll

async def setup_and_test():
    db = get_supabase()
    
    # 1. Create a dummy shift if none exists
    shift_res = db.table('shifts').select('*').limit(1).execute()
    shift_id = None
    if not shift_res.data:
        shift_data = {
            'name': 'Full Day 8h', 'start_time': '09:00', 'end_time': '17:00',
            'shift_hours': 8.0, 'grace_late_minutes': 15, 'grace_early_leave_minutes': 10,
            'max_allowed_hours': 14.0, 'break_minutes': 0
        }
        res = db.table('shifts').insert(shift_data).execute()
        shift_id = res.data[0]['id']
    else:
        shift_id = shift_res.data[0]['id']
        
    db.table('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
    test_emps = [
        {'name': 'Yasmeen shaikh', 'device_user_id': '1', 'basic_salary': 19250, 'shift_id': shift_id, 'joining_date': '2025-01-01', 'is_active': True},
        {'name': 'Shruti Kate', 'device_user_id': '2', 'basic_salary': 15400, 'shift_id': shift_id, 'joining_date': '2025-01-01', 'is_active': True},
        {'name': 'Mariyam Shaikh', 'device_user_id': '4', 'basic_salary': 13200, 'shift_id': shift_id, 'joining_date': '2025-01-01', 'is_active': True}
    ]
    db.table('employees').insert(test_emps).execute()
    
    # 3. Mark existing punches as unprocessed so session builder picks them up
    db.table('raw_punches').update({'is_processed': False}).neq('id', 0).execute()
    
    # 4. Run session builder to pair punches into sessions
    await run_session_builder()
    
    # 5. Run payroll test
    period_start = date(2026, 2, 1)
    period_end = date(2026, 2, 28)
    emps = db.table('employees').select('*').execute().data
    print(f'\n--- PAYROLL TEST FOR {len(emps)} EMPLOYEES ---')
    for emp in emps:
        payroll = await calculate_payroll(emp['id'], period_start, period_end)
        calc = payroll.get('calculation_details', {})
        print(f"\nEmployee: {emp['name']}")
        print(f"  Final Salary: ₹{payroll['final_salary']} (Basic: ₹{payroll['basic_salary']})")
        print(f"  Worked: {payroll['total_worked_hours']}h | OT: {payroll['overtime_hours']}h | Missing: {payroll['missing_hours']}h")
        print(f"  OT Pay: ₹{payroll['overtime_pay']} | PT: ₹{calc.get('pt_deduction')}")

asyncio.run(setup_and_test())
