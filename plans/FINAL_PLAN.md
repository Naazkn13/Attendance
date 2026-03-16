# Attendance & Payroll System — Final Implementation Plan

> **Scope**: Single-company client software for a small eye hospital (~10 employees, 2 locations).
> **Replaces**: eSSL Track / Pay. Correctness & simplicity over enterprise complexity.
> **Device**: eSSL / ZKTeco iClock series via ADMS push protocol.
> **Locations**: Andheri, Yari Road — same employees, dynamic movement.
> **Shifts**: Day only (3h / 4h / 8h). No night shifts. Hard midnight boundary.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Data Model](#2-data-model)
3. [Raw Log Ingestion](#3-raw-log-ingestion)
4. [Session Pairing Algorithm](#4-session-pairing-algorithm)
5. [Human Error Handling](#5-human-error-handling)
6. [Auto Checkout Algorithm](#6-auto-checkout-algorithm)
7. [Reopen Session Logic](#7-reopen-session-logic)
8. [Override System (Corrections That Survive Recalculation)](#8-override-system)
9. [Recalculation Engine](#9-recalculation-engine)
10. [Payroll Calculation](#10-payroll-calculation)
11. [Multi-Location & Multi-Device](#11-multi-location--multi-device)
12. [Worker Design](#12-worker-design)
13. [Production Safeguards](#13-production-safeguards)
14. [Tech Stack](#14-tech-stack)
15. [MVP Scope & Phases](#15-mvp-scope--phases)
16. [Edge Cases](#16-edge-cases)
17. [Risks & Failure Modes](#17-risks--failure-modes)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│              BIOMETRIC DEVICES (eSSL / ZKTeco iClock)                   │
│         Andheri device ─────────┐                                       │
│         Yari Road device ───────┤  ADMS push over HTTP                  │
└─────────────────────────────────┤───────────────────────────────────────┘
                                  │ HTTP POST /iclock/cdata
                                  │ (punch_time, device_user_id, device_sn)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FastAPI BACKEND                                  │
│                                                                          │
│  ┌──────────────────┐   ┌─────────────────────────────────────────────┐ │
│  │ ADMS Endpoint     │──▶│ raw_punches table (APPEND-ONLY, IMMUTABLE)  │ │
│  │ /iclock/cdata     │   │ Source of truth. Never edited.              │ │
│  └──────────────────┘   └──────────────┬──────────────────────────────┘ │
│                                        │                                 │
│  ┌─────────────────────────────────────▼──────────────────────────────┐ │
│  │                    WORKER PIPELINE                                  │ │
│  │                                                                     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │ Session      │  │ Auto         │  │ Reopen Session           │ │ │
│  │  │ Builder      │─▶│ Checkout     │─▶│ Worker                   │ │ │
│  │  │ Worker       │  │ Worker       │  │                          │ │ │
│  │  └──────┬───────┘  └──────────────┘  └──────────────────────────┘ │ │
│  │         │                                                          │ │
│  │         ▼                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────┐  │ │
│  │  │ attendance_sessions (derived, rebuildable)                   │  │ │
│  │  └──────────────┬───────────────────────────────────────────────┘  │ │
│  │                 │                                                  │ │
│  │                 ▼  OVERRIDE LAYER                                  │ │
│  │  ┌──────────────────────────────────────────────────────────────┐  │ │
│  │  │ session_overrides (admin corrections, survive recalc)       │  │ │
│  │  └──────────────┬───────────────────────────────────────────────┘  │ │
│  │                 │                                                  │ │
│  │                 ▼                                                  │ │
│  │  ┌──────────────────────────────────────────────────────────────┐  │ │
│  │  │ Payroll Worker → payroll_records                             │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                    │ │
│  │  ┌──────────────────────────────────────────────────────────────┐  │ │
│  │  │ Recalculation Worker (rebuild from raw_punches + overrides)  │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ REST API (employees, shifts, corrections, devices, locations)      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                              │ REST / JSON
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Next.js FRONTEND                                 │
│                                                                          │
│  • Attendance dashboard         • Payroll reports & payslips             │
│  • Admin corrections panel      • Shift configuration                    │
│  • Recalculation (preview/confirm) • Device & location management       │
│  • Anomaly alerts               • Location-based reports                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Principles

| Principle | Meaning |
|-----------|---------|
| **Raw logs = truth** | `raw_punches` is append-only, never edited |
| **Sessions = derived** | Can be deleted and rebuilt from raw punches at any time |
| **Overrides = durable corrections** | Admin corrections survive recalculation |
| **Payroll = derived from sessions + overrides** | No payroll without attendance session backing |
| **Workers = async pipeline** | Processing is decoupled from ingestion |
| **Recalculable** | Any month/employee can be recalculated from scratch |
| **Location = metadata only** | Location never enters payroll or attendance calculations |
| **No hallucinated decisions** | System flags problems, humans decide |

---

## 2. Data Model

### 2.1 `employees`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT | |
| `device_user_id` | TEXT UNIQUE | Maps to biometric device user ID (must match across all devices) |
| `basic_salary` | DECIMAL(10,2) | Monthly basic salary |
| `shift_id` | UUID FK → shifts | Current assigned shift |
| `overtime_rate_per_hour` | DECIMAL(8,2) | ₹ per OT hour |
| `joining_date` | DATE | **Enforced**: punches before this date are ignored |
| `exit_date` | DATE, NULLABLE | **Enforced**: punches after this date are ignored |
| `is_active` | BOOLEAN | Soft delete |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### 2.2 `shifts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT | e.g. "Full Day 8h", "Half Day 4h", "Short 3h" |
| `start_time` | TIME | e.g. `09:00` |
| `end_time` | TIME | e.g. `18:00` |
| `shift_hours` | DECIMAL(4,2) | Expected hours (8.0, 4.0, 3.0) |
| `grace_late_minutes` | INT | e.g. 15 min grace for late arrival |
| `grace_early_leave_minutes` | INT | e.g. 10 min grace for early leave |
| `max_allowed_hours` | DECIMAL(4,2) | Ceiling for auto checkout (e.g. 14.0) |
| `break_minutes` | INT | Unpaid break to deduct (e.g. 60 min lunch) |

### 2.3 `locations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT UNIQUE | e.g. "Andheri", "Yari Road" |
| `address` | TEXT | Optional |
| `is_active` | BOOLEAN DEFAULT TRUE | |
| `created_at` | TIMESTAMPTZ | |

### 2.4 `devices`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `device_sn` | TEXT UNIQUE | Serial number from ADMS handshake |
| `location_id` | UUID FK → locations, NULLABLE | Which clinic this device is at |
| `device_name` | TEXT | Human label, e.g. "Andheri Front Desk" |
| `last_seen_at` | TIMESTAMPTZ | Updated on every ADMS heartbeat |
| `is_active` | BOOLEAN DEFAULT TRUE | |
| `created_at` | TIMESTAMPTZ | |

### 2.5 `raw_punches` (IMMUTABLE — SOURCE OF TRUTH)

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `device_user_id` | TEXT | From device ADMS push |
| `punch_time` | TIMESTAMPTZ | Exact timestamp from device (stored as UTC) |
| `device_sn` | TEXT | Device serial number |
| `raw_payload` | JSONB | Full raw ADMS payload |
| `received_at` | TIMESTAMPTZ DEFAULT NOW() | Server receipt time |
| `is_processed` | BOOLEAN DEFAULT FALSE | Has session builder consumed this? |
| `duplicate_of` | BIGINT FK → raw_punches | NULL if original |

**Constraints:**
- `UNIQUE(device_sn, device_user_id, punch_time)` — true idempotency
- Insert uses `ON CONFLICT DO NOTHING` — device resends are harmless
- No UPDATE or DELETE — enforced via Postgres trigger

### 2.6 `attendance_sessions` (DERIVED — REBUILDABLE)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `employee_id` | UUID FK → employees | |
| `session_date` | DATE | The "work day" this session belongs to |
| `punch_in_id` | BIGINT FK → raw_punches | |
| `punch_out_id` | BIGINT FK → raw_punches, NULLABLE | NULL if open |
| `punch_in_time` | TIMESTAMPTZ | Denormalized for fast query |
| `punch_out_time` | TIMESTAMPTZ, NULLABLE | NULL if open |
| `gross_hours` | DECIMAL(5,2) | Total punched hours |
| `net_hours` | DECIMAL(5,2) | After break deduction |
| `status` | ENUM | See state machine below |
| `shift_id` | UUID FK → shifts | Shift active on this date |
| `auto_checkout_at` | TIMESTAMPTZ | When auto checkout was applied |
| `punch_in_location_id` | UUID FK → locations, NULLABLE | Derived from device |
| `punch_out_location_id` | UUID FK → locations, NULLABLE | Derived from device |
| `is_cross_location` | BOOLEAN DEFAULT FALSE | punch_in ≠ punch_out location |
| `has_override` | BOOLEAN DEFAULT FALSE | TRUE if session_overrides exist |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |
| `version` | INT DEFAULT 1 | Incremented on recalculation |

**Session State Machine:**

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
       └──────────┘ └─────┬─────┘ └───────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │ REOPENED →  │
                   │ COMPLETE    │
                   └─────────────┘
```

| State | Meaning |
|-------|---------|
| `OPEN` | Punch in received, awaiting punch out |
| `COMPLETE` | Normal IN + OUT pair |
| `AUTO_CHECKOUT` | System closed at midnight or shift_start + max_hours |
| `MISSING_OUT` | No punch out, not yet auto-closed — flagged for admin |
| `REOPENED` | Was auto-checkout, then real punch arrived |

> **Note**: `CORRECTED` is no longer a session status. Corrections are stored in the override layer (§8), not as session state changes. This is the key design change that makes corrections survive recalculation.

### 2.7 `session_overrides` (THE OVERRIDE LAYER — DURABLE)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `employee_id` | UUID FK → employees | **Match key** — not session_id |
| `session_date` | DATE | **Match key** — which day this correction applies to |
| `override_type` | ENUM | See types below |
| `override_punch_in` | TIMESTAMPTZ, NULLABLE | Admin-set punch in time |
| `override_punch_out` | TIMESTAMPTZ, NULLABLE | Admin-set punch out time |
| `override_status` | TEXT, NULLABLE | Force status (e.g. `MARK_ABSENT`, `MARK_PRESENT`) |
| `override_net_hours` | DECIMAL(5,2), NULLABLE | Direct hour override (rare) |
| `reason` | TEXT NOT NULL | Admin must explain every correction |
| `created_by` | UUID FK → employees | Which admin made the correction |
| `is_active` | BOOLEAN DEFAULT TRUE | Soft-revoke without deleting |
| `superseded_by` | UUID FK → session_overrides, NULLABLE | Points to newer override |
| `created_at` | TIMESTAMPTZ | |

**Override Types:**

| Type | When Used | Effect |
|------|-----------|--------|
| `SET_PUNCH_OUT` | Forgot to punch out, admin sets real leave time | Replaces `punch_out_time` after session rebuild |
| `SET_PUNCH_IN` | Wrong punch-in (rare) | Replaces `punch_in_time` |
| `SET_BOTH` | Admin sets both times | Replaces both |
| `MARK_ABSENT` | Employee has sessions but was actually not working | Override `net_hours = 0`, marks as absent |
| `MARK_PRESENT` | No punches exist but employee was present | Creates a synthetic session with admin-defined hours |
| `OVERRIDE_HOURS` | Special case (e.g. training day, half-day approved) | Directly set `net_hours` |

**Why `employee_id + session_date` instead of `session_id`?**

This is the critical design decision:

- Sessions are deleted and rebuilt during recalculation → old `session_id` UUIDs are destroyed
- Overrides keyed to `session_id` would become orphaned and lost
- Overrides keyed to `employee_id + session_date` survive any rebuild because they match on logical identity, not physical row identity
- After recalculation rebuilds sessions from punches, the override layer is re-applied using `employee_id + session_date` as the join key

### 2.8 `manual_corrections_log` (AUDIT TRAIL)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `override_id` | UUID FK → session_overrides | Which override was created/modified |
| `action` | ENUM | `CREATED`, `DEACTIVATED`, `SUPERSEDED` |
| `session_snapshot_before` | JSONB | Session state before override applied |
| `session_snapshot_after` | JSONB | Session state after override applied |
| `performed_by` | UUID FK → employees | |
| `created_at` | TIMESTAMPTZ | |

> Immutable audit log. Every override action is logged with before/after snapshots.

### 2.9 `payroll_records`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `employee_id` | UUID FK → employees | |
| `period_start` | DATE | e.g. 2026-02-01 |
| `period_end` | DATE | e.g. 2026-02-28 |
| `total_working_days` | INT | Days employee was expected to work |
| `days_present` | INT | Days with sessions |
| `days_absent` | INT | |
| `total_worked_hours` | DECIMAL(6,2) | Sum of effective net_hours (after overrides) |
| `expected_hours` | DECIMAL(6,2) | working_days × shift_hours |
| `missing_hours` | DECIMAL(6,2) | expected − worked (if positive) |
| `overtime_hours` | DECIMAL(6,2) | worked − expected (if positive, per-day) |
| `basic_salary` | DECIMAL(10,2) | Snapshotted at calculation time |
| `salary_cut` | DECIMAL(10,2) | missing_hours × per_hour_rate |
| `overtime_pay` | DECIMAL(10,2) | overtime_hours × overtime_rate |
| `final_salary` | DECIMAL(10,2) | basic − cut + OT pay |
| `calculation_details` | JSONB | Day-by-day breakdown with override annotations |
| `status` | ENUM | `DRAFT`, `FINAL`, `RECALCULATED` |
| `calculated_at` | TIMESTAMPTZ | |
| `version` | INT DEFAULT 1 | |

### 2.10 `calendar_days` (Post-MVP)

| Column | Type | Notes |
|--------|------|-------|
| `date` | DATE PK | |
| `day_type` | ENUM | `WORKING`, `WEEKEND`, `HOLIDAY` |
| `description` | TEXT | e.g. "Republic Day" |

### 2.11 `system_config`

| Column | Type | Notes |
|--------|------|-------|
| `key` | TEXT PK | e.g. `duplicate_threshold_seconds`, `auto_checkout_buffer_minutes`, `business_timezone` |
| `value` | JSONB | |
| `updated_at` | TIMESTAMPTZ | |

---

## 3. Raw Log Ingestion

### ADMS Push Protocol

1. Device boots → `GET /iclock/cdata?SN=<serial>&options=all` (registration handshake)
2. Backend: look up `devices` table, auto-register if unknown (§11), update `last_seen_at`, respond with time sync
3. Device pushes punches: `POST /iclock/cdata?SN=<serial>&table=ATTLOG&Stamp=<stamp>`
4. Body: tab-separated lines: `device_user_id \t punch_time \t status \t verify_mode`

### Ingestion Steps

```
FOR each punch line in POST body:

  1. Parse: device_user_id, punch_time, device_sn (from query param SN)
  
  2. Convert punch_time from device-local to UTC:
     - Device sends "2026-02-05 09:00:00" (local time)
     - Backend applies configured business_timezone (Asia/Kolkata)
     - Stores as TIMESTAMPTZ in UTC
  
  3. INSERT into raw_punches with full raw_payload
     → ON CONFLICT (device_sn, device_user_id, punch_time) DO NOTHING
     → If conflict: duplicate safely ignored at DB level
     
  4. If inserted (not duplicate): is_processed = FALSE → picked up by Session Builder

  5. Return "OK" to device (exact format per ADMS spec)
```

### Key Rules

- **Never reject a punch** — always attempt insert, even if device is unknown
- **True idempotency** via `UNIQUE(device_sn, device_user_id, punch_time)` constraint
- **Timestamps stored as UTC** — converted using `system_config.business_timezone`
- **Unknown devices auto-registered** with `location_id = NULL`, warning logged
- **Parsing is fault-tolerant** — bad lines logged, good lines processed
- **No attendance logic here** — just storage + device heartbeat

---

## 4. Session Pairing Algorithm

### Philosophy: Time-Ordered Greedy Pairing (Device-Agnostic)

> We **ignore** device IN/OUT status flags. eSSL devices frequently get this wrong. Instead, we pair by time order: first punch = IN, next punch = OUT. Session pairing is keyed on `employee_id + session_date`, not device.

### Algorithm

```
INPUT: Unprocessed raw_punches ordered by punch_time ASC
       (across ALL devices — device-agnostic)
CONTEXT: Employee's shift S (start_time, end_time, shift_hours, max_allowed_hours)

FOR each unprocessed punch P (in punch_time order):

  1. RESOLVE employee from device_user_id
     - Check: punch_time >= joining_date AND (exit_date IS NULL OR punch_time <= exit_date)
     - If employee not found or out of bounds → flag as UNMAPPED, skip pairing

  2. DETERMINE session_date = DATE(P.punch_time in business_timezone)

  3. FIND open session:
     SELECT * FROM attendance_sessions
     WHERE employee_id = E.id AND session_date = D AND status = 'OPEN'
     ORDER BY punch_in_time DESC LIMIT 1

  4. IF open session exists → P is PUNCH OUT:
     a. gross_hours = P.punch_time - session.punch_in_time
     b. net_hours = gross_hours - (shift.break_minutes / 60)
     c. Derive punch_out_location_id from devices table
     d. is_cross_location = (punch_in_location_id ≠ punch_out_location_id)
     e. UPDATE session: status = 'COMPLETE'
     f. Mark P as is_processed = TRUE

  5. IF no open session → P is PUNCH IN:
     a. Derive punch_in_location_id from devices table
     b. INSERT new session: status = 'OPEN', shift_id = current shift
     c. Mark P as is_processed = TRUE

  6. VALIDATE:
     - gross_hours > max_allowed_hours → FLAG anomaly
     - gross_hours < 0.5 → FLAG as possible error
```

### No Night Shifts Rule

All shifts complete on the same calendar day. Hard boundary at midnight. Any session open at midnight is auto-closed by the Auto Checkout Worker (§6).

### Multi-Session Days

The algorithm naturally supports multiple sessions per day (e.g. split shifts). If a COMPLETE session exists and a new IN punch arrives for the same date, a new session is created.

### Out-of-Order Punch Handling

If a "late-arriving old punch" is detected (received today but `punch_time` is from a past date):
1. Delete all `attendance_sessions` for that employee from that `punch_time` onward
2. Reset `is_processed = FALSE` for all `raw_punches` from that point forward
3. Re-run the Session Builder → sessions rebuild in correct time order
4. **Re-apply overrides** from `session_overrides` table (§8.3)

---

## 5. Human Error Handling

| # | Scenario | Detection | System Action |
|---|----------|-----------|---------------|
| 1 | **Duplicate punch** (within 2 min) | `UNIQUE` constraint on raw_punches | DB-level `ON CONFLICT DO NOTHING`. Harmless. |
| 2 | **Double IN** (forgot punch out, punches in again hours later) | Open session too old (gap > max_allowed_hours) | Close stale session as `MISSING_OUT` (flag admin). New punch opens new session. |
| 3 | **Forgot punch out** | Session remains OPEN beyond deadline | Auto Checkout Worker closes at midnight (§6). Admin corrects via override (§8). |
| 4 | **Punch out next day** | Punch after midnight can't close yesterday | Yesterday's session auto-closed at midnight. Today's punch starts new session. |
| 5 | **Late leaving / overtime** | Punch out after shift end | Normal COMPLETE. Overtime calculated in payroll. |
| 6 | **Late punch replaces auto checkout** | Real punch after auto-checkout | Reopen Session Worker handles (§7). |
| 7 | **Admin correction** | Admin uses override panel | Override created in `session_overrides`. Survives recalculation. |
| 8 | **Rapid fire punches** (5 punches in 10 seconds) | First is used, rest hit UNIQUE or duplicate_threshold | Only first creates a session. |
| 9 | **Cross-device punch within 2 minutes** | Different device_sn, same employee | Both stored. Creates very short session. Flagged as anomaly (< 0.5h). Admin reviews. |

### Anti-Hallucination Rule

> The system **NEVER invents data**. Auto checkout is clearly marked (never disguised as real punch). Anomalies are surfaced, not silently resolved. If uncertain → flag and wait for admin.

---

## 6. Auto Checkout Algorithm

### Why Not Close at Shift End?

Closing at shift end destroys overtime data. Employee working 09:00–20:00 on a 09:00–18:00 shift should show 11h, not 9h.

### Algorithm

```
Auto Checkout Worker runs every 15 minutes

FOR each session WHERE status = 'OPEN':

  1. standard_deadline = session.punch_in_time + shift.max_allowed_hours
  2. midnight_deadline = END_OF_DAY(session.session_date) in business_timezone
  
  3. ACTUAL_DEADLINE = EARLIER_OF(standard_deadline, midnight_deadline)

  4. IF NOW() > ACTUAL_DEADLINE + buffer_minutes:
     a. punch_out_time = ACTUAL_DEADLINE
     b. auto_checkout_at = NOW()
     c. gross_hours = ACTUAL_DEADLINE - punch_in_time
     d. net_hours = gross_hours - break_minutes/60
     e. status = 'AUTO_CHECKOUT'
     f. punch_out_location_id remains NULL (no real punch)
     g. LOG event

  5. IF NOW() ≤ ACTUAL_DEADLINE + buffer_minutes:
     SKIP — still within allowed window

PARAMETERS:
  - max_allowed_hours: per shift (e.g. 14h)
  - buffer_minutes: system_config, default 30 min
  - midnight boundary: 23:59:59 in business_timezone
```

### Example

```
Shift: 09:00–18:00, max_allowed_hours=14, buffer=30min

09:05  Employee punches in. Session OPEN.
18:00  Shift ends. Session still OPEN (possible OT).
23:05  standard_deadline (09:05 + 14h). But midnight_deadline = 23:59.
23:59  midnight_deadline hit. ACTUAL_DEADLINE = 23:05 (earlier of the two).
00:29  Deadline + buffer. Auto Checkout fires.
       → punch_out_time = 23:05, status = AUTO_CHECKOUT
```

---

## 7. Reopen Session Logic

When a real punch arrives **after** auto checkout was applied on the same day:

```
WHEN Session Builder processes punch P for employee E:

  1. CHECK: Does E have a session with status = 'AUTO_CHECKOUT'
     WHERE session.session_date = DATE(P.punch_time)
     AND P.punch_time > session.punch_in_time

  2. IF found:
     a. Reopen: punch_out = P, status = 'REOPENED' → (treated as COMPLETE)
     b. Recalculate hours
     c. Derive punch_out_location_id from device
     d. LOG: "Session reopened — real punch replaced auto checkout"

  3. IF not found: Normal pairing (§4)
```

**Safety**: Reopen only works for same-day, only for `AUTO_CHECKOUT` sessions, never `COMPLETE`.

---

## 8. Override System (Corrections That Survive Recalculation)

This is the core answer to "what happens to admin corrections when recalculation runs?"

### 8.1 Design Philosophy

```
┌──────────────────────────────────────────────────────┐
│                   DATA LAYERS                         │
│                                                       │
│  Layer 1: raw_punches     (immutable, from devices)   │
│       ▼                                               │
│  Layer 2: attendance_sessions (derived, rebuildable)  │
│       ▼                                               │
│  Layer 3: session_overrides   (admin, durable)        │
│       ▼                                               │
│  Layer 4: EFFECTIVE SESSION   (session + override)    │
│       ▼                                               │
│  Layer 5: payroll_records     (from effective data)   │
└──────────────────────────────────────────────────────┘
```

**Key insight**: Sessions and overrides are **separate tables**. Sessions can be destroyed and rebuilt freely. Overrides survive because they're keyed on `employee_id + session_date`, not on any session row ID.

### 8.2 How Overrides Are Applied

After the Session Builder creates/rebuilds sessions from raw punches, the **Override Applicator** runs:

```
FOR each attendance_session S:
  1. FIND active override WHERE employee_id = S.employee_id
     AND session_date = S.session_date AND is_active = TRUE
     ORDER BY created_at DESC LIMIT 1
  
  2. IF override exists:
     a. IF override_type = 'SET_PUNCH_OUT':
        S.punch_out_time = override.override_punch_out
        S.gross_hours = override_punch_out - S.punch_in_time
        S.net_hours = gross_hours - break_minutes/60
     
     b. IF override_type = 'SET_PUNCH_IN':
        S.punch_in_time = override.override_punch_in
        (recalculate hours)
     
     c. IF override_type = 'SET_BOTH':
        Apply both overrides
     
     d. IF override_type = 'MARK_ABSENT':
        S.net_hours = 0, S.status = kept as-is but payroll treats as absent
     
     e. IF override_type = 'MARK_PRESENT':
        Create synthetic session if none exists
        S.net_hours = override.override_net_hours
     
     f. IF override_type = 'OVERRIDE_HOURS':
        S.net_hours = override.override_net_hours
     
     g. SET S.has_override = TRUE
     h. UPDATE session with overridden values

  3. IF no override: session unchanged
```

### 8.3 Pipeline Position

```
raw_punches → Session Builder → attendance_sessions (raw rebuild)
                                        ↓
                               Override Applicator ← session_overrides
                                        ↓
                               attendance_sessions (final, with overrides applied)
                                        ↓
                               Payroll Worker → payroll_records
```

Overrides are applied **after** session pairing, **before** payroll calculation. This is true for:
- Normal daily processing
- Full recalculation
- Out-of-order punch rebuilds

### 8.4 Admin Correction Flow

When admin corrects a session:

```
1. Admin opens session (e.g. "Feb 5, Dr. Khan, AUTO_CHECKOUT at 23:59")
2. Admin enters correction: "Actual leave time was 18:05"
3. System:
   a. Creates session_override:
      employee_id = Dr. Khan, session_date = Feb 5,
      override_type = SET_PUNCH_OUT, override_punch_out = 18:05,
      reason = "Employee confirmed leaving at 18:05"
   b. Logs in manual_corrections_log (before/after snapshot)
   c. Runs Override Applicator on that session immediately
   d. Session now shows: punch_out = 18:05, has_override = TRUE
```

### 8.5 Multiple Corrections on Same Day

If admin corrects the same day multiple times:
1. New override is created
2. Previous override gets `is_active = FALSE` and `superseded_by = new_override.id`
3. Only the latest active override applies
4. Full history preserved in both `session_overrides` chain and `manual_corrections_log`

### 8.6 Scenario Walkthrough: Forgot Punch-Out

```
Day 1:
  09:58  Employee punches IN
  23:59  No OUT → Auto Checkout fires → session: 09:58–23:59 (14.0h)
         Status: AUTO_CHECKOUT
         Payroll impact: 14h counted (likely incorrect)

Day 2:
  Admin sees AUTO_CHECKOUT flag on dashboard
  Admin creates override: SET_PUNCH_OUT = 18:05
  Session updates: 09:58–18:05 (8.12h), has_override = TRUE

Day 15:
  Admin triggers "Recalculate February" for this employee
  Recalculation worker:
    1. Deletes all attendance_sessions for employee in Feb
    2. Rebuilds from raw_punches → session: 09:58–23:59 (AUTO_CHECKOUT again)
    3. Override Applicator runs → finds override (employee + Feb 5)
    4. Applies: punch_out = 18:05 → session: 09:58–18:05 (8.12h)
  ✅ Correction survived recalculation
```

### 8.7 Scenario Walkthrough: Normal Day (No Override)

```
Day 1:
  10:02  Employee punches IN
  14:01  Employee punches OUT → session: 10:02–14:01 (3.98h)
         Status: COMPLETE

Day 15:
  Recalculation runs:
    1. Deletes session
    2. Rebuilds from raw_punches → session: 10:02–14:01 (3.98h)
    3. Override Applicator: no override for this employee+date
    4. Session unchanged
  ✅ Normal rebuild, no override interference
```

---

## 9. Recalculation Engine

### Two-Step Admin Action: Preview → Confirm

Recalculation is **never automatic**. It's an admin-triggered two-step process.

### Step 1: Preview Diff

```
Admin clicks "Recalculate February" for Employee X

System does (in-memory, NOT committed to DB):
  1. Fetch all current attendance_sessions for employee + period → "OLD sessions"
  2. Simulate rebuild from raw_punches → "NEW sessions" (in-memory)
  3. Apply overrides from session_overrides → "NEW sessions with overrides"
  4. Generate DIFF: OLD vs NEW

Return to admin:
  {
    "employee": "Dr. Khan",
    "period": "2026-02-01 to 2026-02-28",
    "changes": [
      {
        "date": "2026-02-05",
        "old": {"in": "09:58", "out": "18:05", "hours": 8.12, "status": "AUTO_CHECKOUT", "has_override": true},
        "new": {"in": "09:58", "out": "18:05", "hours": 8.12, "status": "AUTO_CHECKOUT", "has_override": true},
        "changed": false,
        "override_preserved": true   ← admin sees this explicitly
      },
      {
        "date": "2026-02-10",
        "old": {"in": "10:00", "out": "14:00", "hours": 4.0, "status": "COMPLETE"},
        "new": {"in": "09:55", "out": "14:00", "hours": 4.08, "status": "COMPLETE"},
        "changed": true,
        "reason": "Late-arriving punch at 09:55 was found"
      }
    ],
    "override_summary": {
      "total_overrides": 3,
      "all_preserved": true
    },
    "payroll_impact": {
      "old_total_hours": 168.5,
      "new_total_hours": 168.58,
      "salary_difference": "+₹12"
    }
  }
```

### Preview Diff: What Shows for AUTO_CHECKOUT vs Corrected

| Scenario | Diff Display |
|----------|------|
| AUTO_CHECKOUT with no override | Shows raw rebuilt session (still AUTO_CHECKOUT). Note: "⚠ No admin correction exists" |
| AUTO_CHECKOUT with override | Shows rebuilt + override applied. Note: "✅ Admin override preserved: OUT = 18:05" |
| COMPLETE session, no override | Shows rebuilt session. Highlight if hours changed. |
| COMPLETE session with override | Shows override applied. Note: "✅ Override preserved" |
| New session appears (from late punch) | Flagged as **NEW**. "📌 New session from late-arriving punch" |
| Session disappears | Flagged as **REMOVED**. Rare — would mean punches were somehow invalidated. |

### Step 2: Admin Confirms

```
Admin reviews diff → clicks "Confirm Recalculation"

System:
  1. BEGIN TRANSACTION
  2. Delete all attendance_sessions for employee + period
  3. Reset is_processed = FALSE for all raw_punches in range
  4. Re-run Session Builder → rebuild sessions
  5. Run Override Applicator → apply all active overrides
  6. Increment version on all rebuilt sessions
  7. If payroll existed: create new payroll_records with status DRAFT, old payroll → RECALCULATED
  8. COMMIT TRANSACTION
  9. LOG recalculation event
```

### Safety Rules

- Recalculation uses Postgres advisory lock per employee (no concurrent recalc)
- Old payroll records are preserved (status = `RECALCULATED`), never deleted
- Overrides are **never touched** by recalculation — they exist in a separate table
- If override references a date with no session (e.g., `MARK_PRESENT`), override creates a synthetic session

---

## 10. Payroll Calculation

### Reading Effective Session Data

Payroll **always** reads the final state of sessions (after overrides applied):

```
PER EMPLOYEE, PER MONTH:

  1. GATHER attendance_sessions WHERE status IN ('COMPLETE', 'AUTO_CHECKOUT', 'REOPENED')
     → These already have overrides applied (§8.3)
  
  2. FOR AUTO_CHECKOUT sessions:
     - IF has_override = TRUE → use overridden hours (admin corrected)
     - IF has_override = FALSE → use auto-checkout hours as-is
       ⚠ Flag in calculation_details: "AUTO_CHECKOUT without correction"
       (This draws admin attention to potentially incorrect hours)

  3. CALCULATE totals:
     total_worked_hours = SUM(session.net_hours)
     days_present = COUNT(DISTINCT session_date)
     total_working_days = business days in period (weekdays, minus holidays if calendar_days exists)
     days_absent = total_working_days - days_present

  4. DAILY OVERTIME (per-day granularity):
     FOR each day in period:
       day_hours = SUM(net_hours for sessions on this date)
       daily_expected = shift.shift_hours
       IF day_hours > daily_expected:
         daily_overtime += day_hours - daily_expected
       ELSE:
         daily_deficit += daily_expected - day_hours

  5. SALARY CALCULATION:
     per_hour_rate = basic_salary / expected_hours
     salary_cut   = missing_hours × per_hour_rate
     overtime_pay  = overtime_hours × overtime_rate_per_hour
     final_salary  = basic_salary - salary_cut + overtime_pay

  6. STORE calculation_details JSONB with:
     - Day-by-day breakdown
     - Override annotations per day (was_overridden, override_reason)
     - AUTO_CHECKOUT flags
     - Overtime / deficit per day
```

### AUTO_CHECKOUT in Payroll: Differentiated Treatment

| Session State | has_override | Payroll Treatment |
|--------------|-------------|-------------------|
| `COMPLETE` | false | Normal: use net_hours |
| `COMPLETE` | true | Use overridden hours, annotate in details |
| `AUTO_CHECKOUT` | false | ⚠ Use auto-checkout hours but **flag** in payroll details |
| `AUTO_CHECKOUT` | true | ✅ Use overridden hours (admin corrected the midnight close) |
| `REOPENED` | false | Normal: use reopened hours |

> **Payroll never silently uses AUTO_CHECKOUT hours without flagging it.** The `calculation_details` JSONB includes a `warnings` array listing any days with uncorrected auto-checkouts. This allows the admin to review before marking payroll as `FINAL`.

### Why Per-Day Overtime?

6h on Monday + 10h on Tuesday ≠ "exactly expected." Correct payroll: 2h deficit AND 2h overtime at different rates. Daily granularity preserves this.

---

## 11. Multi-Location & Multi-Device

### Design Principle: Location Is Metadata, Not Logic

Location never enters any calculation formula. It is purely for reporting and admin visibility.

### Device → Location Mapping

```
Device "ESSL-A1" (CZK1234567) → Location "Andheri"
Device "ESSL-Y1" (CZK9876543) → Location "Yari Road"
```

1. Device registers via ADMS handshake
2. Backend looks up `devices` table, updates `last_seen_at`
3. Unknown devices auto-registered with `location_id = NULL`, warning logged
4. Admin assigns location via dashboard

**Rules:**
- Unknown devices accepted (never reject punches), flagged for admin
- One device → one location at a time
- Changing location is a manual admin action

### Session Pairing Across Devices

Session pairing is **employee-centric, device-agnostic**:
- Pairing key: `employee_id + session_date` (not device)
- Employee punches IN at Andheri, OUT at Yari Road → one COMPLETE session
- `punch_in_location_id = Andheri`, `punch_out_location_id = Yari Road`, `is_cross_location = TRUE`

### Critical Requirement: Same `device_user_id` Across Devices

> Employee must be enrolled with the **same user ID** on every device. If IDs differ, system treats them as different employees.

**MVP**: Enforce same ID operationally. **Post-MVP**: Use `employee_device_mappings` table for many-to-one mapping with validity windows.

### Device Health Monitoring

| Check | Threshold | Action |
|-------|-----------|--------|
| `last_seen_at` stale | > 60 minutes | ⚠ Dashboard warning: "Andheri device offline" |
| Device not in `devices` table | On first contact | Auto-register, flag for admin |
| `location_id = NULL` | Persistent | Dashboard banner: "Unassigned device" |

### Location Reports (Post-MVP)

| Report | Logic |
|--------|-------|
| Hours per location per day | Group by `punch_in_location_id` |
| Headcount per location | COUNT DISTINCT employees by location per day |
| Cross-location log | Filter `is_cross_location = TRUE` |

Attribution rule for cross-location: full session attributed to punch-in location.

---

## 12. Worker Design

All workers are async background tasks inside the FastAPI process using APScheduler or asyncio. No external queue needed at this scale.

### 12.1 Session Builder Worker

| Property | Value |
|----------|-------|
| **Trigger** | Every 30 seconds OR on new punch ingestion |
| **Input** | `raw_punches WHERE is_processed = FALSE AND duplicate_of IS NULL` |
| **Logic** | Session Pairing (§4) + location derivation from `devices` table |
| **Output** | Creates/updates `attendance_sessions` |
| **Post-step** | Runs Override Applicator for affected sessions |
| **Concurrency** | Postgres advisory lock per employee |
| **Idempotent** | Yes |

### 12.2 Auto Checkout Worker

| Property | Value |
|----------|-------|
| **Trigger** | Every 15 minutes |
| **Input** | `attendance_sessions WHERE status = 'OPEN'` |
| **Logic** | Auto Checkout Algorithm (§6) |
| **Output** | Updates status to `AUTO_CHECKOUT` |
| **Idempotent** | Yes |

### 12.3 Reopen Session Worker

| Property | Value |
|----------|-------|
| **Trigger** | Called by Session Builder when punch could reopen |
| **Input** | New punch + `AUTO_CHECKOUT` session on same day |
| **Logic** | Reopen Session (§7) |
| **Idempotent** | Yes |

### 12.4 Override Applicator (NEW)

| Property | Value |
|----------|-------|
| **Trigger** | Called after Session Builder OR after admin creates override OR during recalculation |
| **Input** | `session_overrides WHERE is_active = TRUE` matched to sessions by `employee_id + session_date` |
| **Logic** | Apply override values to session fields (§8.2) |
| **Output** | Updates session with overridden values, sets `has_override = TRUE` |
| **Idempotent** | Yes |

### 12.5 Payroll Worker

| Property | Value |
|----------|-------|
| **Trigger** | Manual (admin) or scheduled (1st of month) |
| **Input** | Employee + period |
| **Logic** | Payroll Calculation (§10) |
| **Output** | `payroll_records` with status DRAFT |
| **Reads** | Final session state (after overrides) |

### 12.6 Recalculation Worker

| Property | Value |
|----------|-------|
| **Trigger** | Manual (admin confirms after preview) |
| **Logic** | 1. Delete sessions in range, 2. Reset is_processed, 3. Re-run Session Builder, 4. Run Override Applicator, 5. Re-run Payroll if needed |
| **Safety** | Advisory lock. Old payroll preserved. Overrides untouched. |

### Worker Pattern (No External Queue)

```
Why no Redis/RabbitMQ?
- ~10 employees, ~20-40 punches/day
- DB polling at 30s is adequate
- Single-process deployment, simple ops
- Scale trigger: add Redis if > 200 employees
```

---

## 13. Production Safeguards

### 13.1 Device Ingestion Safety

| Safeguard | Implementation | MVP? |
|-----------|----------------|------|
| **UNIQUE constraint** | `UNIQUE(device_sn, device_user_id, punch_time)` on `raw_punches` | ✅ Yes |
| **ON CONFLICT DO NOTHING** | Device resends are harmless | ✅ Yes |
| **Unknown device auto-register** | Insert into `devices` with `location_id = NULL`, warn admin | ✅ Yes |
| **Device heartbeat** | Update `last_seen_at` on every request | ✅ Yes |
| **Stale device alert** | Dashboard warning if not seen in 60 min | ✅ Yes |

### 13.2 Processing Safety

| Safeguard | Implementation | MVP? |
|-----------|----------------|------|
| **Advisory locks** | `pg_advisory_xact_lock(employee_id)` during session building | ✅ Yes |
| **Time-ordered processing** | Always `ORDER BY punch_time ASC`, never `received_at` | ✅ Yes |
| **Out-of-order rebuild** | Late-arriving old punches trigger partial rebuild + override re-apply | ✅ Yes |
| **Employee bounds** | Ignore punches outside `joining_date` / `exit_date` | ✅ Yes |

### 13.3 Timezone Safety

| Safeguard | Implementation | MVP? |
|-----------|----------------|------|
| **UTC storage** | All `TIMESTAMPTZ` columns store UTC | ✅ Yes |
| **Business timezone config** | `system_config.business_timezone = 'Asia/Kolkata'` | ✅ Yes |
| **Midnight boundary in local time** | Auto checkout uses local midnight, converted to UTC for queries | ✅ Yes |

### 13.4 Correction Safety

| Safeguard | Implementation | MVP? |
|-----------|----------------|------|
| **Overrides survive recalc** | Keyed on `employee_id + session_date`, separate from sessions | ✅ Yes |
| **Recalc preview** | Diff shown before commit | ✅ Yes |
| **Immutable audit log** | `manual_corrections_log` with before/after snapshots | ✅ Yes |
| **Override chain** | Old overrides deactivated, linked via `superseded_by` | ✅ Yes |

### 13.5 Employee Lifecycle (Post-MVP)

| Safeguard | Implementation | MVP? |
|-----------|----------------|------|
| **Calendar days** | `WORKING`, `WEEKEND`, `HOLIDAY` types | ❌ Post-MVP |
| **Device mappings** | Many-to-one with validity windows | ❌ Post-MVP |
| **Grace rules** | Late/early flags separate from hours | ❌ Post-MVP |

---

## 14. Tech Stack

| Layer | Choice | Reasoning |
|-------|--------|-----------|
| **Database** | Supabase (Postgres) | Relational, DECIMAL precision, ACID transactions, complex queries |
| **Backend** | FastAPI (Python) | ADMS endpoint + REST API + workers in one process |
| **Frontend** | Next.js (Vercel) | SSR for reports, rich dashboard |
| **Workers** | APScheduler in FastAPI | No external queue at this scale |
| **Payslip PDF** | WeasyPrint or ReportLab | Server-side generation |
| **ADMS Protocol** | Custom FastAPI endpoint | `/iclock/cdata` |
| **Math** | Python `Decimal` + Postgres `DECIMAL(10,2)` | Exact payroll arithmetic |
| **Auth** | Simple JWT | Single-company client software |
| **Timezone** | `pytz` / `zoneinfo` | Business timezone conversion |
| **Deployment** | FastAPI on PaaS + Supabase | Persistent backend, managed Postgres |

### Why This Stack?
- Postgres is non-negotiable for payroll (ACID, DECIMAL, window functions)
- FastAPI: single process handles API + workers + ADMS endpoint
- Python `Decimal`: no floating point errors on salary math
- No serverless: biometric devices need persistent, fast-responding endpoints

---

## 15. MVP Scope & Phases

### Phase 1: Foundation (Week 1-2)

```
- [ ] Postgres schema (all tables from §2)
- [ ] ADMS endpoint /iclock/cdata with device auto-registration
- [ ] Test with real eSSL device — punches stored
- [ ] Employee + Shift + Location + Device CRUD APIs
- [ ] Session Builder Worker (with location derivation)
- [ ] Auto Checkout Worker (midnight + max_hours)
- [ ] Device health monitoring (last_seen_at + stale alert)
- [ ] Basic Next.js: employee list, today's attendance, device status
```

**Milestone**: Punch → raw_punches → session → dashboard. Multi-device working.

### Phase 2: Corrections + Payroll (Week 3-4)

```
- [ ] Override system (session_overrides table + Override Applicator)
- [ ] Admin corrections panel (create/view overrides)
- [ ] manual_corrections_log (audit trail)
- [ ] Payroll calculation (reads sessions after overrides)
- [ ] Payroll dashboard (monthly view, auto-checkout flags)
- [ ] Recalculation preview diff
- [ ] Recalculation confirm + execute
```

**Milestone**: Admin can correct AUTO_CHECKOUT sessions. Corrections survive recalculation. Payroll is correct.

### Phase 3: Robustness (Week 5-6)

```
- [ ] Reopen Session Worker
- [ ] Out-of-order punch rebuild + override re-apply
- [ ] Payslip PDF generation
- [ ] Holiday/weekend calendar (calendar_days)
- [ ] Anomaly alerts dashboard
- [ ] Location-based reports
- [ ] Reports export (CSV/Excel)
```

**Milestone**: Production-ready. Handles offline device sync, late punches, holidays.

### Phase 4: Polish (Week 7-8)

```
- [ ] Attendance calendar view (monthly grid)
- [ ] Bulk operations (recalc all, generate all payslips)
- [ ] System config panel
- [ ] Grace rule separation (Late/Early flags)
- [ ] employee_device_mappings table (if needed)
- [ ] User auth (admin vs viewer)
- [ ] Backup strategy
- [ ] Deployment + training docs
```

### NOT in MVP

- Device location history tracking
- Cross-location split attribution
- Location-aware anomaly detection
- Per-location shift configuration
- SaaS multi-tenancy

---

## 16. Edge Cases

| # | Edge Case | How Handled |
|---|-----------|-------------|
| 1 | **Out-of-order punches** (batch upload) | Process by `punch_time ASC`. Late-arriving old punches trigger partial rebuild + override re-apply. |
| 2 | **Wrong shift assigned** | Admin changes shift. Recalculation rebuilds. Overrides on affected days preserved. |
| 3 | **Two devices, same employee** | Same `device_user_id` across devices → punches merge. Different IDs → need `employee_device_mappings` (post-MVP). |
| 4 | **Device clock drift** | ADMS time sync on registration. Backend logs drift > 5 min as warning. |
| 5 | **Power outage → offline device** | Device stores locally, batch-pushes on reconnect. UNIQUE constraint prevents duplicates. Stale device alert warns admin. |
| 6 | **Employee works > max_allowed_hours** | Auto-closed at max_hours or midnight (whichever is earlier). Admin corrects if genuine. |
| 7 | **Midnight punch** | Session auto-closed at midnight. Post-midnight punch starts new session. |
| 8 | **Month boundary session** | `session_date` determines month. Payroll uses `session_date`. |
| 9 | **Salary change mid-month** | New payroll version uses new salary. Old version preserved. |
| 10 | **Override then recalculation** | Override survives. Keyed on `employee_id + session_date`, not session row. |
| 11 | **Multiple overrides same day** | Latest active override applies. Previous deactivated with `superseded_by` chain. Full history preserved. |
| 12 | **Override for a day with no punches** (`MARK_PRESENT`) | Override creates synthetic session during Override Applicator step. |
| 13 | **Recalculation after shift change** | Sessions rebuild with new shift. Overrides still apply on top. Admin reviews diff before confirming. |
| 14 | **Cross-device punch < 2 min** | Both stored (different `device_sn`). Short session flagged as anomaly. Admin reviews. |
| 15 | **Device replaced (new SN)** | Update `devices` table. `device_user_id` mapping unchanged. |
| 16 | **Former employee punches** | `exit_date` bound: punch ignored by Session Builder. |
| 17 | **Employee resigns mid-month** | Payroll for partial month (working days before `exit_date`). |
| 18 | **Malformed ADMS data** | Bad lines logged, good lines processed. Never crash on bad input. |
| 19 | **No punches on working day** | Absent day. No session created. Payroll counts as `days_absent`. |
| 20 | **Auto-checkout → real punch arrives same day** | Reopen Session Worker replaces auto-checkout with real data. |

---

## 17. Risks & Failure Modes

### High Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | **ADMS protocol misinterpretation** | Lost punches | Test with real device Day 1. Document exact request/response. |
| 2 | **Session pairing errors** | Wrong salary | Unit tests for every edge case. 1-month parallel run with eSSL Track. |
| 3 | **Floating point in payroll** | ₹1-10 off | Python `Decimal` + Postgres `DECIMAL(10,2)`. Never `float`. |
| 4 | **Override lost during recalc** | Admin work destroyed | Overrides in separate table, keyed on `employee_id + session_date`. Tested explicitly. |
| 5 | **Auto-checkout miscounted in payroll** | Salary too high | Payroll flags uncorrected AUTO_CHECKOUT. Admin reviews before FINAL. |
| 6 | **Device connectivity loss** | Punches delayed | Idempotent ingestion + time-ordered processing. Stale device alert. |
| 7 | **Timezone bug** | All boundaries shifted 5.5h | UTC storage, business timezone in config, test midnight boundary explicitly. |

### Medium Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 8 | **Worker crashes mid-batch** | Partial data | Idempotent workers + DB transactions. Restart processes remaining. |
| 9 | **Concurrent recalculation** | Data corruption | Advisory lock per employee. Only one recalc at a time. |
| 10 | **Retroactive shift change** | Past payroll wrong | Recalculation engine + override preservation. Preview diff before commit. |
| 11 | **Stale device unnoticed** | Missing attendance | Dashboard alert. Health check on every ADMS heartbeat. |
| 12 | **`device_user_id` mismatch across devices** | Split identity | MVP: operational enforcement. Post-MVP: `employee_device_mappings`. |

### Recovery Scenarios

| Scenario | Recovery |
|----------|----------|
| **Backend down** | Device retries (eSSL: every 30s). On restart, device re-pushes. UNIQUE constraint prevents duplicates. |
| **Database corruption** | Restore backup. Rebuild sessions from `raw_punches` + re-apply `session_overrides`. |
| **Wrong payroll** | Recalculate. Old payroll → `RECALCULATED`. New payroll = `DRAFT`. Preview before commit. |
| **Device replaced** | Update `devices` table. Employee mapping via `device_user_id` is unchanged. |
| **Wrong override** | Deactivate override (`is_active = FALSE`). Create new one or let raw session stand. Full audit trail preserved. |

---

## Pre-Development Checklist

- [ ] Access to real eSSL/ZKTeco iClock device(s) for testing
- [ ] Device ADMS push URL configurable
- [ ] Both devices enrolled with same `device_user_id` per employee
- [ ] Shift schedules documented (3h / 4h / 8h, times)
- [ ] Per-employee salary documented
- [ ] Overtime rules documented (rate per hour)
- [ ] Grace period rules documented
- [ ] Business timezone confirmed (`Asia/Kolkata`)
- [ ] Parallel run period agreed (1 month alongside eSSL Track)
