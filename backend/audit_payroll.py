from app.database import get_supabase
db = get_supabase()
emps = db.table("employees").select("id").ilike("name", "%Sultana%").execute()
emp_id = emps.data[0]["id"]
pr = db.table("payroll_records").select("*").eq("employee_id", emp_id).eq("status", "FINAL").limit(1).execute()
p = pr.data[0]
cd = p.get("calculation_details", {})
breakdown = cd.get("daily_breakdown", [])

print("=== STORED PAYROLL VALUES ===")
print(f"basic_salary:      {p['basic_salary']}")
print(f"total_day_salary:  {cd.get('total_day_salary')}")
print(f"overtime_pay:      {p['overtime_pay']}")
print(f"salary_cut:        {p['salary_cut']}")
print(f"final_salary:      {p['final_salary']}")
print(f"days_present:      {p['days_present']}")
print(f"days_absent:       {p['days_absent']}")
print(f"working_days:      {p['total_working_days']}")
print(f"overtime_hours:    {p['overtime_hours']}")
print(f"missing_hours:     {p['missing_hours']}")

print("\n=== DAILY BREAKDOWN ===")
sum_day_salary = 0
sum_ot_pay = 0
sum_hours = 0
for d in breakdown:
    ds = d.get("day_salary", 0)
    op = d.get("overtime_pay", 0)
    oh = d.get("overtime_hours", 0)
    dh = d.get("deficit_hours", 0)
    th = d.get("total_hours", 0)
    sun = "SUN" if d.get("is_sunday") else "   "
    hol = "HOL" if d.get("is_holiday") else "   "
    status = "PRESENT" if th > 0 else ("PAIDOFF" if d.get("is_sunday") or d.get("is_holiday") else "ABSENT")
    sum_day_salary += ds
    sum_ot_pay += op
    sum_hours += th
    extra = ""
    if oh > 0:
        extra = f" OT:{oh:.2f}h (+Rs.{op:.2f})"
    if dh > 0:
        extra = f" DEFICIT:{dh:.2f}h"
    dt = d["date"]
    print(f"  {dt} {sun} {hol} {status:8s} hrs={th:5.2f}  daySal=Rs.{ds:8.2f}{extra}")

print(f"\n=== SUMS FROM BREAKDOWN ===")
print(f"sum_day_salary:  Rs.{sum_day_salary:.2f}")
print(f"sum_ot_pay:      Rs.{sum_ot_pay:.2f}")
print(f"sum_hours:       {sum_hours:.2f}h")
print(f"\n=== VERIFY FINAL ===")
final_check = sum_day_salary + sum_ot_pay - 200
print(f"total_day_salary + OT - PT = {sum_day_salary:.2f} + {sum_ot_pay:.2f} - 200 = Rs.{final_check:.2f}")
print(f"Backend final_salary = Rs.{p['final_salary']}")
match = "MATCH" if abs(final_check - p['final_salary']) < 0.02 else "MISMATCH!"
print(f"Result: {match}")
