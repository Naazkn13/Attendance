# Attendance & Payroll System — Production Safeguard Audit

This document identifies critical production safeguards missing from the baseline implementation plan. In real-world biometric deployments (eSSL / ZKTeco), devices behave unreliably (network drops, re-sending old logs, clock drift). Without these safeguards, the system will produce incorrect payroll calculations.

---

## 1. Device Ingestion Safety

### The Problem
eSSL devices frequently resend the same logs if they don't receive the exact expected HTTP response, or if they reboot after being offline. 
**Failure Mode:** If you rely purely on a time-window duplicate check (e.g., `duplicate_threshold_seconds = 120`), a device re-sending a 3-day-old batch of logs will bypass that check and create duplicate `raw_punches`, leading to double-counted sessions and inflated payroll.

### Implementation Rule
**True Idempotency via Device-Provided Counters.**
Do not rely solely on time. The ADMS protocol often provides a uniquely identifying combination for every punch, even if re-sent.
*   **Unique Constraint:** Add a `UNIQUE(device_sn, device_user_id, punch_time)` constraint at the Postgres database level on the `raw_punches` table.
*   **Conflict Handling:** On `INSERT`, use `ON CONFLICT DO NOTHING`. This ensures that even if the device resends a massive batch of historical logs, only genuinely new punches are appended.
*   **MVP Required:** Yes.

---

## 2. Out-of-Order Punches & Rebuild Strategy

### The Problem
Devices go offline, store punches locally, and push them in a batch hours or days later. Meanwhile, the employee might have punched on a *different* device that was online, or admin might have manually corrected a session.
**Failure Mode:** If the Session Builder blindly processes punches as they arrive (by `received_at`), out-of-order punches will be appended to the wrong session, or will create fragmented sessions.

### Implementation Rule
**Time-Ordered Processing & Automatic Re-evaluation.**
*   **Never process by arrival time:** The Session Builder must *always* order unprocessed punches by `punch_time ASC`, not `received_at`.
*   **Rebuild Trigger:** If a "late-arriving old punch" is detected (e.g., received today, but `punch_time` is from yesterday), the system must **delete** all derived `attendance_sessions` for that employee from that `punch_time` onward, and **re-run** the Session Builder for all `raw_punches` from that point forward.
*   **MVP Required:** Yes. Without this, offline devices ruin the data integrity.

---

## 3. Concurrency / Worker Safety

### The Problem
FastAPI async workers or multiple server instances might pick up the same employee's unprocessed punches simultaneously.
**Failure Mode:** Two workers run the Session Pairing Algorithm at the exact same millisecond. Both see "no open session", and both insert a new `OPEN` session. The employee now has duplicate parallel sessions.

### Implementation Rule
**Postgres Advisory Locks per Employee.**
*   The system must never process the same employee concurrently.
*   **Locking Strategy:** Use Postgres Advisory Locks. When the Session Builder starts processing punches for Employee A, it executes `SELECT pg_advisory_xact_lock(employee_id_integer)`.
*   This is extremely lightweight, requires no Redis, and ensures strictly sequential session building for any single employee, preventing race conditions.
*   **MVP Required:** Yes.

---

## 4. Device User ↔ Employee Mapping

### The Problem
The current plan assumes a 1:1 mapping directly on the `employees` table (`device_user_id`). 
**Failure Mode 1 (Re-enrollment):** An employee leaves and their device ID "105" is eventually reassigned to a new hire. The new hire's punches get credited to the old employee.
**Failure Mode 2 (Multiple Devices):** An employee is enrolled as ID "15" on the front door device, but ID "1002" on the warehouse device because the HR admin didn't sync the users properly.

### Implementation Rule
**Dedicated Mapping Table (Many-to-One with Validity Windows).**
Do not put `device_user_id` on the `employees` table.
*   **Data Model Addition:** Create an `employee_device_mappings` table:
    *   `employee_id` (UUID)
    *   `device_sn` (TEXT - optional, for multi-device environments)
    *   `device_user_id` (TEXT)
    *   `valid_from` (DATE)
    *   `valid_to` (DATE, NULL if active)
*   The Session Builder joins against this table using the `punch_time` to find who owned that `device_user_id` on that specific date.
*   **MVP Required:** No. For MVP, the 1:1 `employees.device_user_id` is acceptable, but it is a critical Day 2 architecture requirement.

---

## 5. Employee Lifecycle Safeguards

### The Problem
Employees join and leave, but their fingerprints might remain on the device.
**Failure Mode:** Former employees' stray punches (e.g., they visit the office) create sessions and generate zero-dollar or erroneous payroll records months after they left. Future punches from new hires who get assigned the same device ID cause data corruption.

### Implementation Rule
**Strict Temporal Bounding.**
*   **Data Model Addition:** Add `exit_date` to `employees`.
*   **Worker Rule:** The Session Builder must completely ignore (or flag as a specific error state) any `raw_punches` where `punch_time < employees.joining_date` or `punch_time > employees.exit_date`.
*   **MVP Required:** Yes. `joining_date` and `exit_date` bounds must be enforced in the core pairing query.

---

## 6. Holiday / Weekly Off Awareness

### The Problem
Payroll assumes every Monday-Friday is a working day. 
**Failure Mode:** If Thursday is a public holiday, the system sees no punches, calculates `days_absent = 1`, and deducts a day's salary.

### Implementation Rule
**Minimal Calendar Overrides Table.**
*   **Data Model Addition:** Create a `calendar_days` table:
    *   `date` (DATE PK)
    *   `day_type` (ENUM: `WORKING`, `WEEKEND`, `HOLIDAY`)
    *   `description` (TEXT)
*   **Payroll Rule:** During Step 2 of the Payroll Calculation Flow, `total_working_days` is calculated strictly by counting `WORKING` days in the `calendar_days` table for that period. `WEEKEND` and `HOLIDAY` days do not increment `missing_hours` if no punches exist.
*   **Exception:** If an employee *does* punch in on a `HOLIDAY`, that time is calculated as 100% overtime.
*   **MVP Required:** No. Can be managed manually via corrections in MVP, but essential for v1 production.

---

## 7. Grace Rule Separation

### The Problem
Using a single concept of "grace period" confuses lateness with early leaving, which have different payroll and disciplinary implications.
**Failure Mode:** An employee comes 5 minutes late (allowed) but leaves 15 minutes early (not allowed). If standard `shift_hours` math is used, they might just show `net_hours` slightly below expectation, leading to confusing fractional wage deductions rather than clear policy violations.

### Implementation Rule
**Explicit Thresholds in Payroll, Not Sessions.**
Sessions must record exact time. Payroll applies the grace rules.
*   **Late In Grace (`shift.grace_late_minutes`):** If `punch_in_time > shift.start_time + grace_late_minutes`, the employee is marked as "Late".
*   **Early Out Grace (`shift.grace_early_leave_minutes`):** If `punch_out_time < shift.end_time - grace_early_leave_minutes`, they are marked as "Early Leave".
*   **Separation:** These are boolean flags or distinct penalty deductions (e.g., 3 Lates = Half Day Cut), separate from the raw `missing_hours` calculation.
*   **MVP Required:** No. MVP can rely purely on raw total hours math.

---

## 8. Timezone and Time Handling Rules

### The Problem
Timestamps are stored without explicit timezone awareness, or boundary math is done using local server time rather than the configured business location.
**Failure Mode:** A punch at 11:30 PM local time on Feb 5th might be recorded as 05:00 AM Feb 6th UTC in the database. When the midnight auto-checkout runs, it uses the server's UTC time, closing sessions at 5:30 AM local time instead of midnight.

### Implementation Rule
**Absolute UTC Storage, Localized Application Logic.**
*   **Storage:** `raw_punches.punch_time` MUST be `TIMESTAMPTZ` (UTC). When the device sends "2026-02-05 09:00:00", the backend endpoint must parse it, apply the client's specific configured timezone (e.g., `Asia/Kolkata`), and store the resulting UTC timestamp.
*   **Midnight Boundary Logic:** The midnight boundary for auto-checkout MUST be calculated in the configured business timezone. `END_OF_DAY()` means 23:59:59 `Asia/Kolkata`, converted back to UTC for the database query.
*   **MVP Required:** Yes. Timestamp bugs are fatal.

---

## Top 5 Highest-Risk Failure Modes

1.  **Missing `UNIQUE` Constraint on Ingestion:** Devices *will* resend historical logs. Without a database-level constraint `(device_sn, device_user_id, punch_time)`, the database will flood with duplicates, destroying payroll accuracy.
2.  **Lack of Postgres Advisory Locks:** The Session Builder will inevitably process the same employee concurrently during batch syncs, creating fragmented, overlapping shadow sessions that cannot be mathematically resolved.
3.  **Processing by Arrival Time (`received_at`):** Network drops mean Monday's punches might arrive on Wednesday. Processing them as if they happened on Wednesday will ruin both Monday's and Wednesday's attendance.
4.  **No `joining_date` / `exit_date` Bounding:** Former employees who visit the office or inherited ID numbers will generate phantom payroll records that accountants will mistakenly pay out.
5.  **Local Time Database Queries:** Running a query checking for `punch_time > 'midnight'` on a database server configured to UTC while the business is in `Asia/Kolkata` will shift the entire company's attendance boundaries by 5.5 hours, breaking split shifts and auto-checkouts.
