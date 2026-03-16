# Attendance & Payroll System — Implementation Plan

> **Scope**: Client-installed software (not SaaS). Simplicity and correctness over enterprise complexity.
> Device: eSSL / ZKTeco iClock series via ADMS push protocol.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Data Model](#2-data-model)
3. [Raw Log Ingestion Flow](#3-raw-log-ingestion-flow)
4. [Session Pairing Algorithm](#4-session-pairing-algorithm)
5. [Human Error Handling Rules](#5-human-error-handling-rules)
6. [Auto Checkout Algorithm](#6-auto-checkout-algorithm)
7. [Reopen Session Logic](#7-reopen-session-logic)
8. [Payroll Calculation Flow](#8-payroll-calculation-flow)
9. [Worker Design](#9-worker-design)
10. [Tech Stack Recommendation](#10-tech-stack-recommendation)
11. [Supabase vs Firebase Decision](#11-supabase-vs-firebase-decision)
12. [Is FastAPI Suitable?](#12-is-fastapi-suitable)
13. [MVP Scope](#13-mvp-scope)
14. [Development Phases](#14-development-phases)
15. [Edge Cases](#15-edge-cases)
16. [Risks & Failure Modes](#16-risks--failure-modes)

---

## 1. System Architecture

### Text Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        BIOMETRIC DEVICE (eSSL/ZKTeco)                │
│                    iClock sends ADMS push over HTTP                   │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ HTTP POST /iclock/cdata
                             │ (punch_time, device_user_id, device_sn)
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        FastAPI BACKEND                                │
│                                                                      │
│  ┌─────────────────┐    ┌──────────────────────────────────────────┐ │
│  │ ADMS Endpoint    │───▶│ raw_punches table (APPEND-ONLY)          │ │
│  │ /iclock/cdata    │    │ Never edited. Source of truth.           │ │
│  └─────────────────┘    └──────────────┬───────────────────────────┘ │
│                                        │ triggers                    │
│  ┌─────────────────────────────────────▼───────────────────────────┐ │
│  │                    WORKER PIPELINE                               │ │
│  │                                                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │ │
│  │  │ Session      │  │ Auto         │  │ Reopen Session         │ │ │
│  │  │ Builder      │─▶│ Checkout     │─▶│ Worker                 │ │ │
│  │  │ Worker       │  │ Worker       │  │                        │ │ │
│  │  └──────────────┘  └──────────────┘  └────────────────────────┘ │ │
│  │         │                                       │                │ │
│  │         ▼                                       ▼                │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │ attendance_sessions table (derived, rebuildable)             │ │ │
│  │  └──────────────────────────┬───────────────────────────────────┘ │ │
│  │                             │                                    │ │
│  │  ┌──────────────────────────▼───────────────────────────────────┐ │ │
│  │  │ Payroll Worker → payroll_records table                       │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │                                                                  │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │ Recalculation Worker (full rebuild from raw_punches)         │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ REST API for Admin + Dashboard (employees, shifts, corrections)  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                             │ REST / JSON
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Next.js FRONTEND                              │
│                                                                      │
│  • Employee dashboard          • Payroll reports                     │
│  • Attendance calendar         • Payslip generation                  │
│  • Admin corrections panel     • Shift configuration                 │
│  • Anomaly alerts              • Recalculation trigger               │
└──────────────────────────────────────────────────────────────────────┘
```

### Core Principles

| Principle | Meaning |
|-----------|---------|
| **Raw logs = truth** | `raw_punches` is append-only, never edited |
| **Sessions = derived** | Can be deleted and rebuilt from raw punches at any time |
| **Payroll = derived from sessions** | No payroll without attendance session backing |
| **Workers = async pipeline** | Processing is decoupled from ingestion |
| **Recalculable** | Any month/employee can be recalculated from scratch |
| **No hallucinated decisions** | System flags problems, humans decide |

---

## 2. Data Model

### 2.1 `employees`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT | |
| `device_user_id` | TEXT UNIQUE | Maps to biometric device user ID |
| `basic_salary` | DECIMAL(10,2) | Monthly basic salary |
| `shift_id` | UUID FK → shifts | Current assigned shift |
| `overtime_rate_per_hour` | DECIMAL(8,2) | ₹ per OT hour |
| `joining_date` | DATE | |
| `is_active` | BOOLEAN | Soft delete |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### 2.2 `shifts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT | e.g. "Morning 8h", "Night 8h", "Half Day 4h" |
| `start_time` | TIME | e.g. `09:00` |
| `end_time` | TIME | e.g. `18:00` |
| `shift_hours` | DECIMAL(4,2) | Expected hours (8.0, 4.0, 3.0) |
| `grace_late_minutes` | INT | e.g. 15 min grace for late arrival |
| `grace_early_leave_minutes` | INT | e.g. 10 min grace for early leave |
| `max_allowed_hours` | DECIMAL(4,2) | Ceiling for auto checkout (e.g. 14.0) |
| `break_minutes` | INT | Unpaid break to deduct (e.g. 60 min lunch) |

### 2.3 `raw_punches` (SOURCE OF TRUTH — IMMUTABLE)

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `device_user_id` | TEXT | From device ADMS push |
| `punch_time` | TIMESTAMPTZ | Exact timestamp from device |
| `device_sn` | TEXT | Device serial number |
| `raw_payload` | JSONB | Full raw ADMS payload (preservation) |
| `received_at` | TIMESTAMPTZ | Server receipt time |
| `is_processed` | BOOLEAN DEFAULT FALSE | Has session builder consumed this? |
| `duplicate_of` | BIGINT FK → raw_punches | NULL if original, points to first punch if dup |

> **Database rule**: No UPDATE or DELETE on this table. INSERT only. Enforced via Postgres trigger or RLS.

### 2.4 `attendance_sessions` (DERIVED — REBUILDABLE)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `employee_id` | UUID FK → employees | |
| `session_date` | DATE | The "work day" this session belongs to |
| `punch_in_id` | BIGINT FK → raw_punches | |
| `punch_out_id` | BIGINT FK → raw_punches | NULL if open |
| `punch_in_time` | TIMESTAMPTZ | Denormalized for fast query |
| `punch_out_time` | TIMESTAMPTZ | NULL if open |
| `gross_hours` | DECIMAL(5,2) | Total punched hours |
| `net_hours` | DECIMAL(5,2) | After break deduction |
| `status` | ENUM | See states below |
| `shift_id` | UUID FK → shifts | Shift active on this session_date |
| `auto_checkout_at` | TIMESTAMPTZ | When auto checkout was applied |
| `correction_note` | TEXT | Admin reason for manual correction |
| `corrected_by` | UUID FK → employees | Admin who corrected |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |
| `version` | INT DEFAULT 1 | Incremented on recalculation |

**Session States (state machine):**

```
                      ┌──────────┐
     punch in ───────▶│   OPEN   │
                      └────┬─────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐ ┌───────────┐ ┌───────────────┐
       │ COMPLETE │ │ AUTO_     │ │ MISSING_OUT   │
       │          │ │ CHECKOUT  │ │ (flagged)     │
       └──────────┘ └─────┬─────┘ └───────┬───────┘
                          │               │
                          ▼               ▼
                   ┌─────────────┐ ┌─────────────┐
                   │ REOPENED →  │ │ CORRECTED   │
                   │ COMPLETE    │ │ (by admin)  │
                   └─────────────┘ └─────────────┘
```

| State | Meaning |
|-------|---------|
| `OPEN` | Punch in received, awaiting punch out |
| `COMPLETE` | Normal IN + OUT pair |
| `AUTO_CHECKOUT` | System closed at shift_start + max_allowed_hours |
| `MISSING_OUT` | No punch out, no auto checkout yet — flagged for admin |
| `CORRECTED` | Admin manually set punch out or edited |
| `REOPENED` | Was auto-checkout, then real punch arrived → recalculated |

### 2.5 `manual_corrections`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `session_id` | UUID FK → attendance_sessions | |
| `corrected_by` | UUID FK → employees | Admin |
| `correction_type` | ENUM | `SET_PUNCH_OUT`, `SET_PUNCH_IN`, `MARK_ABSENT`, `MARK_PRESENT`, `OVERRIDE_HOURS` |
| `old_value` | JSONB | Snapshot before correction |
| `new_value` | JSONB | Snapshot after correction |
| `reason` | TEXT | Required |
| `created_at` | TIMESTAMPTZ | |

> Manual corrections never modify `raw_punches`. They only modify `attendance_sessions` and are audited here.

### 2.6 `payroll_records`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `employee_id` | UUID FK → employees | |
| `period_start` | DATE | e.g. 2026-02-01 |
| `period_end` | DATE | e.g. 2026-02-28 |
| `total_working_days` | INT | Days employee was expected to work |
| `days_present` | INT | Days with complete sessions |
| `days_absent` | INT | |
| `total_worked_hours` | DECIMAL(6,2) | Sum of session net_hours |
| `expected_hours` | DECIMAL(6,2) | working_days × shift_hours |
| `missing_hours` | DECIMAL(6,2) | expected − worked (if positive) |
| `overtime_hours` | DECIMAL(6,2) | worked − expected (if positive, day-level) |
| `basic_salary` | DECIMAL(10,2) | Snapshotted at calculation time |
| `salary_cut` | DECIMAL(10,2) | (missing_hours / expected_hours) × basic_salary |
| `overtime_pay` | DECIMAL(10,2) | overtime_hours × overtime_rate |
| `final_salary` | DECIMAL(10,2) | basic_salary − salary_cut + overtime_pay |
| `calculation_details` | JSONB | Day-by-day breakdown (audit trail) |
| `status` | ENUM | `DRAFT`, `FINAL`, `RECALCULATED` |
| `calculated_at` | TIMESTAMPTZ | |
| `version` | INT DEFAULT 1 | |

### 2.7 `system_config`

| Column | Type | Notes |
|--------|------|-------|
| `key` | TEXT PK | e.g. `duplicate_threshold_seconds`, `auto_checkout_buffer_minutes` |
| `value` | JSONB | |
| `updated_at` | TIMESTAMPTZ | |

---

## 3. Raw Log Ingestion Flow

### ADMS Push Protocol

eSSL/ZKTeco devices use the ADMS (Automatic Data Master Server) push protocol:

1. Device boots → sends `GET /iclock/cdata?SN=<serial>&options=all` to register
2. Backend responds with device commands (time sync, config)
3. Device periodically pushes punch logs: `POST /iclock/cdata?SN=<serial>&table=ATTLOG&Stamp=<stamp>`
4. Body contains tab-separated lines: `device_user_id \t punch_time \t status \t verify_mode`

### Ingestion Steps

```
1. Device sends POST /iclock/cdata with ATTLOG data
2. Backend parses each line from body
3. For each punch:
   a. Extract: device_user_id, punch_time, device_sn (from query param)
   b. Check for duplicate:
      - Query: SELECT id FROM raw_punches
        WHERE device_user_id = X
        AND ABS(EXTRACT(EPOCH FROM (punch_time - X))) < duplicate_threshold_seconds
      - If duplicate found: INSERT with duplicate_of = existing.id, is_processed = TRUE
      - If not duplicate: INSERT with is_processed = FALSE
   c. INSERT into raw_punches with full raw_payload
4. Return "OK" to device (device expects specific response format)
5. Unprocessed punches are picked up by Session Builder Worker
```

### Key Rules

- **Never reject a punch** — always store it, even if duplicate
- **Duplicate threshold**: configurable, default 120 seconds (2 minutes)
- **Device time sync**: Backend responds with server time on registration to prevent clock drift
- **Parsing is fault-tolerant**: Bad lines logged, good lines processed normally
- **No attendance logic runs here** — just storage

---

## 4. Session Pairing Algorithm

### Philosophy: Time-Ordered Greedy Pairing

> We **ignore** device IN/OUT status flags. eSSL devices frequently get this wrong (the #1 cause of calculation errors in eSSL Track). Instead, we use time-ordered greedy pairing based on shift windows.

### Step-by-Step Algorithm

```
INPUT: All unprocessed raw_punches for employee E, ordered by punch_time ASC
CONTEXT: Employee's shift S (start_time, end_time, shift_hours, max_allowed_hours)

FOR each unprocessed punch P (in time order):

  1. LOOK UP employee from device_user_id → employee E, shift S

  2. DETERMINE the "work day" (session_date):
     - session_date = DATE(P.punch_time)

  3. FIND open session for this employee on this session_date:
     - Query: SELECT * FROM attendance_sessions
       WHERE employee_id = E.id
       AND session_date = calculated_date
       AND status = 'OPEN'
       ORDER BY punch_in_time DESC
       LIMIT 1

  4. IF open session exists:
     a. P is treated as PUNCH OUT
     b. Calculate gross_hours = P.punch_time - session.punch_in_time
     c. Calculate net_hours = gross_hours - (shift.break_minutes / 60)
     d. UPDATE session: punch_out_id = P.id, punch_out_time = P.punch_time,
        gross_hours, net_hours, status = 'COMPLETE'
     e. Mark P as is_processed = TRUE

  5. IF no open session:
     a. P is treated as PUNCH IN
     b. INSERT new attendance_session:
        employee_id = E.id, session_date, punch_in_id = P.id,
        punch_in_time = P.punch_time, status = 'OPEN', shift_id = S.id
     c. Mark P as is_processed = TRUE

  6. VALIDATE reasonableness:
     - If gross_hours > max_allowed_hours: FLAG as anomaly (don't auto-fix)
     - If gross_hours < 0.5 hours: FLAG as possible error (still save)
```

### No Night Shifts Rule

The system explicitly does not support night shifts. All shifts are assumed to complete on the same calendar day they start. A hard boundary exists at midnight (12:00 AM). Any session remaining open at midnight is automatically closed by the Auto Checkout Worker.

### Multi-Session Days

The algorithm naturally supports multiple sessions per day (e.g., split shifts):
- If a COMPLETE session already exists and a new IN punch arrives for the same session_date, a second session is created.
- This is correct for scenarios like: morning 09:00–13:00, afternoon 14:00–18:00.

---

## 5. Human Error Handling Rules

| # | Scenario | Detection | System Action |
|---|----------|-----------|---------------|
| 1 | **Duplicate punch** (quick re-punch within 2 min) | Two punches within `duplicate_threshold_seconds` | Second punch stored with `duplicate_of` pointing to first. Marked as processed. Not paired. |
| 2 | **Double IN** (forgot to punch out, punches in again hours later) | New punch with no open session but last session is OPEN and old | Session is too old: auto-close the stale OPEN session as `MISSING_OUT` (flag for admin). New punch opens fresh session. Threshold: if gap > `max_allowed_hours` from the OPEN session's punch_in. |
| 3 | **Forgot punch out** (never punched out) | Session remains OPEN beyond max_allowed_hours or hits midnight | Auto Checkout Worker closes it (see §6). Status = `AUTO_CHECKOUT`. |
| 4 | **Punch out next day** (punched after midnight) | Next-day punch cannot close yesterday's session | Midnight auto-checkout closes yesterday's session. The new punch starts a new session for the current day. |
| 5 | **Late leaving / overtime** | Punch out after shift end_time | Normal COMPLETE. Overtime calculated in payroll. No special handling needed at session level. |
| 6 | **Late punch replacing auto checkout** | Real punch arrives after auto checkout was applied | Reopen Session Worker handles (see §7). Status = `REOPENED` → `COMPLETE`. |
| 7 | **Manual correction by admin** | Admin uses correction panel | Correction applied to session. Old values logged in `manual_corrections`. Status = `CORRECTED`. Raw punches never modified. |
| 8 | **Recalculation after edits** | Admin triggers recalc for employee+month | Recalculation Worker wipes sessions for that range and rebuilds from raw_punches. All corrections preserved in audit log. |

### Anti-Hallucination Rule

> **The system NEVER invents data.** If it can't determine the correct action, it flags the session and waits for admin. Specifically:
> - Never assume a punch out time that wasn't punched
> - Auto checkout is clearly marked, never disguised as a real punch
> - Anomaly flags are surfaced, not silently resolved

---

## 6. Auto Checkout Algorithm

### Why Not Close at Shift End?

Closing at shift end would destroy overtime data. An employee working 09:00–20:00 on an 09:00–18:00 shift should show 11h worked, not 9h.

### Algorithm

```
Auto Checkout Worker runs every 15 minutes (configurable cron)

FOR each session WHERE status = 'OPEN':

  1. GET shift = session.shift
  2. CALCULATE standard_deadline = session.punch_in_time + shift.max_allowed_hours
  3. CALCULATE midnight_deadline = END_OF_DAY(session.session_date) (i.e. 23:59:59)
  
  4. ACTUAL DEADLINE = EARLIER_OF(standard_deadline, midnight_deadline)

  5. IF NOW() > ACTUAL DEADLINE + buffer_minutes:
     a. SET session.punch_out_time = ACTUAL DEADLINE
     b. SET session.auto_checkout_at = NOW()
     c. CALCULATE gross_hours = ACTUAL DEADLINE - punch_in_time
     d. CALCULATE net_hours  = gross_hours - break_minutes/60
     e. SET session.status = 'AUTO_CHECKOUT'
     f. LOG: "Auto checkout applied for employee X, session_date Y"

  6. IF NOW() ≤ ACTUAL DEADLINE + buffer_minutes:
     SKIP — still within allowed window

KEY PARAMETERS:
  - max_allowed_hours: per shift (e.g. 14h for day shift)
  - buffer_minutes: system_config, default 30 min (wait 30 min past deadline before auto-closing)
```

### Example Timeline

```
Shift: 09:00 – 18:00, max_allowed_hours = 14, buffer = 30 min

09:05  → Employee punches in. Session OPEN.
18:00  → Shift ends. Session still OPEN (employee might be doing OT).
23:05  → Deadline (09:05 + 14h). Session still OPEN.
23:35  → Deadline + buffer. Auto Checkout Worker runs.
         → Closes session. punch_out_time = 23:05, status = AUTO_CHECKOUT
```

---

## 7. Reopen Session Logic

### When It Triggers

A real punch arrives AFTER the system applied auto checkout. The real punch should replace the synthetic checkout.

### Algorithm

```
Reopen Session Worker runs each time a new punch is processed by Session Builder

WHEN Session Builder encounters a punch P for employee E:

  1. CHECK: Does employee E have a session with status = 'AUTO_CHECKOUT'
     WHERE session.auto_checkout_at IS NOT NULL
     AND P.punch_time > session.punch_in_time
     AND DATE(P.punch_time) = session.session_date  (must be same day)

  2. IF such session exists:
     a. REOPEN the session:
        - session.punch_out_id = P.id
        - session.punch_out_time = P.punch_time
        - session.status = 'REOPENED'  (then → 'COMPLETE' after recalc)
        - session.auto_checkout_at stays (for audit)
     b. RECALCULATE hours:
        - gross_hours = P.punch_time - session.punch_in_time
        - net_hours = gross_hours - break_minutes/60
     c. Clear the auto checkout: effectively replaced by real data
     d. LOG: "Session reopened for employee X — real punch replaced auto checkout"

  3. IF no such session:
     - Normal pairing algorithm applies (§4)
```

### Safety Bounds

- Reopen only works for punches on the same calendar day (`session_date`)
- Reopen only applies to `AUTO_CHECKOUT` sessions, never to `COMPLETE` or `CORRECTED`
- If the real punch comes on the next day, it starts a new session instead

---

## 8. Payroll Calculation Flow

### Formula

```
PER EMPLOYEE, PER MONTH:

1. GATHER all attendance_sessions for employee in [period_start, period_end]
   WHERE status IN ('COMPLETE', 'AUTO_CHECKOUT', 'CORRECTED', 'REOPENED')

2. CALCULATE totals:
   total_worked_hours = SUM(session.net_hours)  — all sessions
   days_present = COUNT(DISTINCT session.session_date)
   total_working_days = business days in period (exclude weekends/holidays)
   days_absent = total_working_days - days_present

3. CALCULATE expected_hours:
   expected_hours = total_working_days × shift.shift_hours

4. DAILY OVERTIME CALCULATION (precise method):
   FOR each day in period:
     day_hours = SUM(net_hours) for sessions on this date
     daily_expected = shift.shift_hours
     IF day_hours > daily_expected:
       daily_overtime += day_hours - daily_expected
     ELSE:
       daily_deficit += daily_expected - day_hours
   
   overtime_hours = SUM(daily_overtime)  — only days where worked > expected
   missing_hours  = SUM(daily_deficit)   — only days where worked < expected

5. SALARY CALCULATION:
   per_hour_rate = basic_salary / expected_hours
   salary_cut    = missing_hours × per_hour_rate
   overtime_pay  = overtime_hours × overtime_rate_per_hour
   final_salary  = basic_salary - salary_cut + overtime_pay

6. STORE calculation_details as JSONB:
   {
     "days": [
       {
         "date": "2026-02-01",
         "sessions": [{"in": "09:05", "out": "18:20", "net_hours": 8.25}],
         "expected_hours": 8.0,
         "overtime": 0.25,
         "deficit": 0.0
       },
       ...
     ],
     "totals": { ... }
   }
```

### Why Per-Day Overtime (Not Monthly Aggregate)?

If you aggregate monthly: employee works 6h on Monday (2h short) and 10h on Tuesday (2h extra). Monthly aggregate says they worked exactly expected. But the **correct** payroll is: 2h deficit **and** 2h overtime, because these have different rates. Daily granularity preserves this.

### Payslip Generation

From `payroll_records`, generate a printable payslip containing:
- Employee name, employee ID, period
- Day-by-day attendance summary
- Total worked / expected / overtime / missing hours
- Salary breakdown: basic − deductions + OT pay = final
- Generated timestamp, version number

Output format: PDF (generated server-side via a templating library).

---

## 9. Worker Design

### Overview

All workers are **async background tasks** running inside the FastAPI process. For client-scale (1-50 employees), a full message queue is overkill — use `asyncio` tasks with a simple DB-polling pattern.

### 9.1 Session Builder Worker

| Property | Value |
|----------|-------|
| **Trigger** | Runs every 30 seconds OR triggered by new punch ingestion |
| **Input** | `raw_punches WHERE is_processed = FALSE AND duplicate_of IS NULL` |
| **Logic** | Session Pairing Algorithm (§4) |
| **Output** | Creates/updates `attendance_sessions` |
| **Idempotent?** | Yes — checks `is_processed` flag |

### 9.2 Auto Checkout Worker

| Property | Value |
|----------|-------|
| **Trigger** | Runs every 15 minutes (cron-style) |
| **Input** | `attendance_sessions WHERE status = 'OPEN'` |
| **Logic** | Auto Checkout Algorithm (§6) |
| **Output** | Updates session status to `AUTO_CHECKOUT` |
| **Idempotent?** | Yes — only processes OPEN sessions past deadline |

### 9.3 Reopen Session Worker

| Property | Value |
|----------|-------|
| **Trigger** | Called by Session Builder when processing a punch that could reopen |
| **Input** | New punch + existing AUTO_CHECKOUT session |
| **Logic** | Reopen Session Logic (§7) |
| **Output** | Updates session from AUTO_CHECKOUT → COMPLETE |
| **Idempotent?** | Yes — only reopens AUTO_CHECKOUT, bounded by time |

### 9.4 Payroll Worker

| Property | Value |
|----------|-------|
| **Trigger** | Manual (admin clicks "Calculate Payroll") or scheduled (1st of month) |
| **Input** | Employee ID or "all", period start/end |
| **Logic** | Payroll Calculation Flow (§8) |
| **Output** | Creates `payroll_records` with status DRAFT |
| **Idempotent?** | Yes — recalculating same period creates new version |

### 9.5 Recalculation Worker

| Property | Value |
|----------|-------|
| **Trigger** | Manual (admin clicks "Recalculate") |
| **Input** | Employee ID (or all), date range |
| **Logic** | 1. Delete all attendance_sessions in range for employee. 2. Reset is_processed = FALSE for all raw_punches in range. 3. Re-run Session Builder for those punches. 4. Re-run Payroll if payroll was previously calculated. |
| **Output** | Rebuilt sessions + updated payroll (new version) |
| **Safety** | Old payroll kept with status RECALCULATED. New payroll is DRAFT. |

### Worker Implementation Pattern (No External Queue)

```
Why no Redis/RabbitMQ?
- Client scale: 1-50 employees, ~100-500 punches/day
- DB polling at 30s intervals is perfectly adequate
- Adding a message broker adds deployment complexity
- If scale grows beyond 200 employees → add Redis later

Pattern:
- Use APScheduler (or simple asyncio loop) inside FastAPI
- Workers query DB for work items (unprocessed punches, open sessions)
- Workers are idempotent (safe to restart/re-run)
- Workers log every action for debugging
```

---

## 10. Tech Stack Recommendation

| Layer | Choice | Reasoning |
|-------|--------|-----------|
| **Database** | **Supabase (Postgres)** | See §11 for justification |
| **Backend** | **FastAPI (Python)** | See §12 for justification |
| **Frontend** | **Next.js** | Rich dashboard, SSR for reports, Vercel deploy |
| **Background Workers** | **APScheduler in FastAPI** | No external queue needed at client scale |
| **PDF Generation** | **WeasyPrint or ReportLab** | Server-side payslip PDF generation |
| **ADMS Protocol** | **Custom FastAPI endpoint** | `/iclock/cdata` — simple HTTP parsing |
| **Deployment** | **Single VPS or local machine** | Docker Compose: FastAPI + Postgres + Next.js |
| **Auth** | **Simple JWT / session-based** | Client software, basic security sufficient |

### Why This Stack?

1. **Postgres is non-negotiable** for payroll — you need ACID transactions, decimal precision, and complex queries (window functions, aggregates). NoSQL is wrong for this domain.
2. **FastAPI** is the sweet spot: fast enough, simple enough, great for HTTP endpoint (ADMS) + background workers in one process.
3. **Next.js** gives server-side rendering for reports and a smooth admin dashboard experience.
4. **Single-process backend** (FastAPI + workers) keeps deployment trivial for client install.

---

## 11. Supabase vs Firebase Decision

### Verdict: **Supabase (Postgres)** — strongly recommended

| Criteria | Supabase (Postgres) | Firebase (Firestore) |
|----------|---------------------|---------------------|
| **Data model** | Relational — perfect for payroll, shifts, employees, sessions with FK relationships | Document-based — forces denormalization, risky for payroll |
| **Payroll queries** | `SUM()`, `GROUP BY`, window functions, `JOIN` across tables — trivial | Requires reading all documents client-side or Cloud Functions — fragile |
| **Decimal precision** | `DECIMAL(10,2)` — guaranteed accuracy | JavaScript floating point — salary errors waiting to happen |
| **Immutability enforcement** | Postgres triggers or RLS to block UPDATE/DELETE on raw_punches | Firestore security rules can do this but are harder to test |
| **Recalculation** | `DELETE FROM sessions WHERE ...` + re-run — one transaction | Batch deletes in Firestore are limited (500/batch) and eventually consistent |
| **Complex reports** | SQL views, CTEs, aggregations — native | Must build in application layer — significant code |
| **Self-hosted option** | Yes (Postgres anywhere) | No (Google-only) |
| **Cost at client scale** | Supabase free tier sufficient OR self-host Postgres for zero cost | Firebase free tier works but lock-in risk |
| **Offline/local deploy** | Just use Postgres directly (skip Supabase hosted) | Cannot self-host Firebase |

### Why NOT Firebase?

1. **Payroll math with JavaScript floats is dangerous.** `0.1 + 0.2 !== 0.3`. Postgres `DECIMAL` is exact.
2. **No JOINs** means your payroll query becomes: fetch all sessions, fetch employee, fetch shift, compute in code. One bug = wrong salary.
3. **Recalculation** requires batch-deleting Firestore documents (slow, rate-limited) instead of a single `DELETE FROM ... WHERE`.
4. **Client deployment**: Firebase requires internet. If the client's office has spotty internet, the biometric device pushes to a local backend that can't reach Firestore.

### Practical Recommendation

- **If deploying on client's local machine**: Use raw Postgres (no Supabase cloud needed)
- **If deploying on a VPS**: Use Supabase hosted free tier, or self-host Supabase
- **Either way**: The data model is Postgres. Supabase is just the hosting wrapper.

---

## 12. Is FastAPI Suitable?

### Verdict: **Yes — ideal for this use case**

| Requirement | FastAPI Fit |
|-------------|-------------|
| **ADMS endpoint** (`/iclock/cdata`) | ✅ FastAPI handles HTTP perfectly. The ADMS protocol is simple HTTP GET/POST. |
| **Background workers** | ✅ APScheduler or `asyncio` tasks run inside the same process. No need for Celery. |
| **REST API for frontend** | ✅ FastAPI's primary purpose. Auto-generated OpenAPI docs. |
| **Postgres integration** | ✅ SQLAlchemy or asyncpg. Mature ecosystem. |
| **Payroll math** | ✅ Python's `Decimal` type for exact arithmetic. |
| **Single process deployment** | ✅ One `uvicorn` process handles API + workers. Simple. |
| **Performance at client scale** | ✅ 50 employees × 2 punches/day = 100 req/day. FastAPI handles millions. This is trivial. |

### Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| **Node.js (Express)** | JavaScript floating point makes payroll dangerous. TypeScript helps but doesn't fix `0.1 + 0.2`. |
| **Django** | Heavier than needed. Django ORM is fine but FastAPI is leaner for this scope. |
| **Go / Rust** | Overkill complexity for client-scale. Python is easier to maintain for a small team. |
| **Serverless (Lambda/Cloud Functions)** | ADMS push needs a persistent endpoint. Biometric devices don't retry on cold starts. Workers need scheduling. Serverless is wrong here. |

### Key Point: Why Not Serverless?

The biometric device pushes to a fixed URL. It expects:
1. Immediate HTTP response (within seconds)
2. Specific response format for registration handshake
3. Persistent endpoint (not cold-starting)

Serverless cold starts would cause lost punches. A persistent FastAPI process on a VPS or local machine is correct.

---

## 13. MVP Scope

### What to Build First (Week 1-3)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 1 | **ADMS endpoint** | P0 | `/iclock/cdata` — receive and store raw punches. Without this, nothing works. |
| 2 | **Employee + Shift CRUD** | P0 | Admin creates employees, maps device_user_id, assigns shifts |
| 3 | **Session Builder Worker** | P0 | Pairs punches into sessions. Core logic. |
| 4 | **Auto Checkout Worker** | P0 | Closes stale sessions. |
| 5 | **Attendance Dashboard** | P0 | View today's attendance, session status per employee |
| 6 | **Basic Payroll Calculation** | P1 | Calculate monthly salary for one employee |
| 7 | **Admin Corrections Panel** | P1 | Manually set punch out for missing sessions |

### What is NOT in MVP

- Payslip PDF generation (use dashboard view first)
- Reopen session worker (handle manually in v1)
- Recalculation worker (rebuild manually via DB)
- Holiday/weekend calendar
- Multi-device support (start with 1 device)
- Reports export

### MVP "Done" Criteria

1. ✅ Biometric device punch appears in `raw_punches` within 5 seconds
2. ✅ Punch is paired into a session within 30 seconds
3. ✅ Dashboard shows today's attendance with correct IN/OUT/status
4. ✅ Auto checkout closes sessions after max_allowed_hours
5. ✅ Can calculate monthly payroll for one employee with correct math
6. ✅ Admin can manually correct a missing punch-out

---

## 14. Development Phases

### Phase 1: Foundation (Week 1-2)

```
- [ ] Set up Postgres database with all tables (§2)
- [ ] Implement ADMS endpoint /iclock/cdata (§3)
- [ ] Test with real eSSL device — confirm punches are stored
- [ ] Build Employee CRUD API
- [ ] Build Shift CRUD API
- [ ] Implement Session Builder Worker (§4)
- [ ] Implement Auto Checkout Worker (§6)
- [ ] Basic Next.js frontend: employee list, today's attendance
```

**Milestone**: Device punch → raw_punches → attendance_session → dashboard. End-to-end flow working.

### Phase 2: Payroll + Corrections (Week 3-4)

```
- [ ] Admin Corrections panel (set punch out, mark absent/present)
- [ ] Manual corrections audit log
- [ ] Payroll calculation API (§8)
- [ ] Payroll dashboard (monthly view per employee)
- [ ] Duplicate punch detection tuning
- [ ] Grace period logic in payroll calculation
```

**Milestone**: Can calculate and display monthly payroll for all employees. Admin can correct errors.

### Phase 3: Robustness (Week 5-6)

```
- [ ] Reopen Session Worker (§7)
- [ ] Recalculation Worker (§9.5)
- [ ] Payslip PDF generation
- [ ] Holiday/weekend calendar
- [ ] Anomaly alerts (flagged sessions notification)
- [ ] Multi-device support
- [ ] Reports export (CSV/Excel)
```

**Milestone**: Production-ready for daily use. Recalculation works. Payslips generated.

### Phase 4: Polish (Week 7-8)

```
- [ ] Attendance calendar view (monthly grid)
- [ ] Bulk operations (recalc all, generate all payslips)
- [ ] System config panel (thresholds, buffer times)
- [ ] User authentication (admin vs viewer)
- [ ] Data backup strategy
- [ ] Deployment documentation
- [ ] Client training documentation
```

**Milestone**: Fully deployable client software. Documented and trained.

---

## 15. Edge Cases

| # | Edge Case | How Handled |
|---|-----------|-------------|
| 1 | **Device sends punches out of order** (batch upload of old logs) | Session Builder processes by `punch_time` order, not `received_at`. Always sort by punch_time. |
| 2 | **Employee assigned to wrong shift** | Admin changes shift. Recalculation Worker rebuilds affected sessions. Old payroll versioned. |
| 3 | **Two devices, same employee** | `device_user_id` is the key. If same ID on both devices, punches merge correctly. If different IDs, need mapping table. |
| 4 | **Device clock is wrong** | ADMS protocol syncs device time on registration. Backend compares `punch_time` vs `received_at` and logs drift > 5 min. |
| 5 | **Power outage — device stores punches offline** | eSSL devices have local storage. On reconnection, they batch-push stored logs. Backend handles this naturally (idempotent duplicate check). |
| 6 | **Employee works > 24 hours** (extreme case) | `max_allowed_hours` caps this. Beyond cap, session auto-closed. Admin can correct if genuinely long. |
| 7 | **Employee punches at exactly shift start** | Grace period applies to lateness calculation only. On-time punch is always valid. |
| 8 | **Midnight punch** | Session is strictly auto-closed at midnight. Any punch after midnight starts a new session for the new calendar day. |
| 9 | **Month boundary** (punch at 23:58, session crosses to next month) | `session_date` determines which month the session belongs to. Payroll uses `session_date`, not `punch_out_time`. |
| 10 | **Payroll recalculated after salary change** | New payroll version uses new salary. Old version preserved. Both visible in history. |
| 11 | **Admin corrects a session, then recalculation runs** | Recalculation rebuilds from raw_punches (ignoring corrections). Admin must re-apply corrections or the correction must be stored as override. **Decision**: Corrections survive recalculation — stored as overrides, not session edits. |
| 12 | **Employee resigns mid-month** | Payroll calculated for partial month (only working days before last day). |
| 13 | **Rapid fire punches** (employee punches 5 times in 10 seconds) | First punch used, rest are duplicates (`duplicate_of` set). |
| 14 | **Device sends malformed data** | Parser logs error, skips bad line, continues processing good lines. Never crash on bad input. |
| 15 | **No punches for an employee on a working day** | That's an absent day. Payroll counts it as `days_absent`. Session Builder doesn't create a session (no data to pair). |

---

## 16. Risks & Failure Modes

### High Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | **ADMS protocol misinterpretation** | Punches lost or garbled | Test with actual eSSL device early (Phase 1, Day 1). Document exact request/response format. |
| 2 | **Session pairing errors** | Wrong attendance → wrong salary | Comprehensive unit tests with every edge case from §15. Manual verification against eSSL Track for 1 month parallel run. |
| 3 | **Floating point errors in payroll** | Salary off by ₹1-10 | Use Python `Decimal` and Postgres `DECIMAL(10,2)`. Never use `float` for money. |
| 4 | **Auto checkout runs but real punch comes later** | Employee hours undercounted | Reopen Session Worker (§7) handles this. Test thoroughly. |
| 5 | **Recalculation destroys manual corrections** | Admin's work lost | Corrections stored as overrides that survive recalculation. Test this scenario explicitly. |
| 6 | **Device connectivity loss** | Punches queued on device, arrive late in batch | Idempotent processing + sort by punch_time (not arrival time). Test with 1000-punch batch. |

### Medium Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 7 | **Worker crashes mid-processing** | Partially processed batch | Workers are idempotent — restart processes remaining items. Use DB transactions. |
| 9 | **Client changes shift rules retroactively** | Past payroll invalidated | Recalculation worker exists for exactly this. Keep old payroll versions. |
| 10 | **Multiple sessions per day confuse payroll** | Double-counted or missed hours | Payroll sums ALL sessions for a date. Verify with split-shift test case. |

### Failure Scenarios & Recovery

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| **Backend goes down** | Device gets no HTTP response, retries (eSSL retries every 30s by default) | Restart backend. Device re-pushes stored logs. Duplicate check prevents double-entry. |
| **Database corruption** | Application errors on queries | Restore from backup. Rebuild sessions from raw_punches (they're the source of truth). |
| **Wrong payroll paid out** | Employee complaint or admin review | Recalculate from sessions. Track as new payroll version. Issue adjustment. |
| **Device replaced** | New serial number | Update device_sn config. Employee-device mapping unchanged (uses device_user_id, not device_sn). |
| **Admin makes wrong correction** | Audit trail in `manual_corrections` | Reverse the correction (restore `old_value` from log). Or recalculate from raw_punches. |

---

## Summary Checklist

Before starting development, confirm:

- [ ] Access to a real eSSL/ZKTeco iClock device for testing
- [ ] Device ADMS push URL configurable (point to your backend IP)
- [ ] Client's shift schedules documented (how many shifts, times, hours)
- [ ] Client's salary structure documented (per employee)
- [ ] Client's overtime rules documented (rate, daily vs monthly, cap)
- [ ] Client's grace period rules documented
- [ ] Client's holiday/weekend policy documented
- [ ] Parallel run period agreed (run new system alongside eSSL Track for 1 month)
