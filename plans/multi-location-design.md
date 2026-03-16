# Attendance & Payroll System — Multi-Location Design Refinement

> **Scope**: Additive changes to the existing plan for multi-device, multi-location support.
> **Context**: Two clinic locations (Andheri, Yari Road), ~10 employees, day shifts only, employees move dynamically between locations.

---

## Table of Contents

1. [Data Model Additions](#1-data-model-additions)
2. [Device → Location Mapping](#2-device--location-mapping)
3. [Session Pairing Across Devices](#3-session-pairing-across-devices)
4. [Cross-Location Sessions](#4-cross-location-sessions)
5. [Worker Changes](#5-worker-changes)
6. [Reporting Implications](#6-reporting-implications)
7. [Multi-Device Production Safeguards](#7-multi-device-production-safeguards)
8. [Architecture Impact](#8-architecture-impact)
9. [MVP vs Later](#9-mvp-vs-later)

---

## 1. Data Model Additions

Three minimal changes. No existing tables are restructured.

### 1.1 NEW TABLE: `locations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT UNIQUE | e.g. "Andheri", "Yari Road" |
| `address` | TEXT | Optional, for reports |
| `is_active` | BOOLEAN DEFAULT TRUE | Soft disable |
| `created_at` | TIMESTAMPTZ | |

> Only 2 rows today. Table exists for data integrity (FK relationships) and future-proofing.

### 1.2 NEW TABLE: `devices`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `device_sn` | TEXT UNIQUE | Serial number from ADMS handshake |
| `location_id` | UUID FK → locations | Which clinic this device is at |
| `device_name` | TEXT | Human label, e.g. "Andheri Front Desk" |
| `last_seen_at` | TIMESTAMPTZ | Updated on every ADMS heartbeat |
| `is_active` | BOOLEAN DEFAULT TRUE | Decommissioned devices |
| `created_at` | TIMESTAMPTZ | |

> **Why not just store `location_id` on `raw_punches` directly?**
> Because device-to-location is a configuration fact, not a per-punch decision. If a device moves to a new clinic, you update one row in `devices`, not millions in `raw_punches`. The `device_sn` on `raw_punches` already exists — it becomes the join key.

### 1.3 MODIFY: `raw_punches` — No schema change needed

The existing `raw_punches` table already stores `device_sn`. Location is derived at query time via `JOIN devices ON raw_punches.device_sn = devices.device_sn`.

**No column added to `raw_punches`.** This is intentional:
- `raw_punches` is immutable. Denormalizing `location_id` into it means if a device moves locations, historical punches carry the wrong location.
- Deriving location via join is correct: the `devices` table answers "where is this device now?" and a historical `device_location_history` table (§9, later) answers "where was this device on date X?".

### 1.4 MODIFY: `attendance_sessions` — Add location metadata

| New Column | Type | Notes |
|------------|------|-------|
| `punch_in_location_id` | UUID FK → locations, NULLABLE | Derived from punch_in's device at session creation |
| `punch_out_location_id` | UUID FK → locations, NULLABLE | Derived from punch_out's device at session close |
| `is_cross_location` | BOOLEAN DEFAULT FALSE | TRUE if punch_in and punch_out are at different locations |

> These are **metadata only**. They do NOT affect session pairing, auto checkout, or payroll math. They exist purely for reporting and admin visibility.

---

## 2. Device → Location Mapping

### Design Decision: Static mapping with manual update

```
Device "ESSL-A1" (device_sn = "CZK1234567") → Location "Andheri"
Device "ESSL-Y1" (device_sn = "CZK9876543") → Location "Yari Road"
```

#### How it works

1. Device registers via ADMS: `GET /iclock/cdata?SN=CZK1234567`
2. Backend looks up `devices` table for `device_sn = 'CZK1234567'`
3. If found → proceed normally, update `last_seen_at`
4. If NOT found → **auto-register** the device with `location_id = NULL`, log a warning
5. Admin assigns `location_id` via the dashboard

#### Key rules

| Rule | Rationale |
|------|-----------|
| Unknown device SNs are accepted but flagged | Never reject punches. Ingestion must never fail. |
| `location_id = NULL` is valid | Means "device not yet assigned to a location" |
| One device → exactly one location at a time | A device doesn't float between clinics |
| Changing a device's location is a manual admin action | Simple, auditable, no magic |

#### When a device physically moves

Rare scenario: the hospital buys a 3rd device, or swaps devices between clinics.

1. Admin updates `devices.location_id` in dashboard
2. All future punches from that `device_sn` resolve to the new location
3. Historical punches still resolve to the old location (if `device_location_history` is implemented, §9)

> **MVP**: No history tracking. The `devices` table stores current location only. If a device moves, historical reports for that device may show the new location for old punches. Acceptable for 2 devices.

---

## 3. Session Pairing Across Devices

### Core principle: **Session pairing is employee-centric, device-agnostic**

The Session Builder algorithm (plan §4) already works correctly for multi-device because:

1. **Pairing key is `employee_id` + `session_date`**, not device
2. **Punches are resolved to employees via `device_user_id`**, not `device_sn`
3. The algorithm finds "open session for employee E on date D" — it doesn't care which device produced the punch

### Walkthrough: Employee works at Andheri, punches out at Yari Road

```
09:00  Employee punches IN at Andheri device (SN: CZK1234567)
       → raw_punch: device_user_id=105, device_sn=CZK1234567, punch_time=09:00
       → Session Builder: No open session for employee. Create OPEN session.
         punch_in_location_id = Andheri (from devices table)

18:15  Employee punches OUT at Yari Road device (SN: CZK9876543)
       → raw_punch: device_user_id=105, device_sn=CZK9876543, punch_time=18:15
       → Session Builder: Found OPEN session for employee on same date.
         Close session. punch_out_location_id = Yari Road.
         is_cross_location = TRUE (Andheri ≠ Yari Road)
         status = COMPLETE, gross_hours = 9.25
```

### Critical prerequisite: `device_user_id` must be the same across all devices

> [!IMPORTANT]
> The employee's fingerprint enrollment ID (`device_user_id`) **must be identical** on every device they could punch at. If employee "Dr. Khan" is user `105` on the Andheri device but user `23` on the Yari Road device, the system will treat these as two different employees.

#### How to ensure this

- **Option A (recommended for 2 devices)**: Enroll employees with the same user ID on both devices. eSSL devices allow specifying the user ID during enrollment.
- **Option B (future, via audit.md §4)**: Use the `employee_device_mappings` table to map multiple `(device_sn, device_user_id)` pairs to one employee. This handles the case where IDs differ across devices.

**MVP decision**: Use Option A. Enforce same `device_user_id` across all devices. Document this as an operational requirement.

---

## 4. Handling Cross-Location Sessions

### Definition

A **cross-location session** occurs when `punch_in_location_id ≠ punch_out_location_id`.

### Frequency

Rare but real. Example: doctor starts at Andheri in the morning, travels to Yari Road for afternoon OPD, punches out there.

### System behavior

| Aspect | Rule |
|--------|------|
| **Session pairing** | No change. Employee-centric pairing handles this automatically. |
| **Hours calculation** | No change. `gross_hours = punch_out_time - punch_in_time`. Location is irrelevant. |
| **Payroll** | No change. Payroll is employee-level, never location-level. |
| **Reporting** | The session carries both locations. Location reports can attribute: full day to punch-in location, or split (later improvement). |
| **Admin visibility** | Cross-location sessions are flagged with `is_cross_location = TRUE` for easy filtering and dashboard highlighting. |
| **Auto checkout** | No change. Auto checkout doesn't care about location. |

### What cross-location does NOT affect

- Overtime calculation
- Salary deductions
- Grace period rules
- Session status machine
- Recalculation logic

> **Design principle**: Location is metadata, not logic. It never enters any calculation formula.

---

## 5. Worker Changes

### 5.1 Session Builder Worker — Minimal change

**What changes:**
1. After creating a session (punch IN) → derive `punch_in_location_id` from `devices` table using the punch's `device_sn`
2. After closing a session (punch OUT) → derive `punch_out_location_id` from `devices` table
3. Set `is_cross_location = (punch_in_location_id ≠ punch_out_location_id)`

**What does NOT change:**
- Pairing algorithm (unchanged — employee-centric, device-agnostic)
- Duplicate detection (unchanged — `UNIQUE(device_sn, device_user_id, punch_time)`)
- Processing order (unchanged — always by `punch_time ASC`)

> This is ~5 lines of code change. The session builder gains a join against `devices` but the core algorithm is untouched.

### 5.2 Auto Checkout Worker — No change

Auto checkout operates on open sessions by checking `punch_in_time + max_allowed_hours` against current time. It has no concept of device or location. No change needed.

When auto checkout fires, `punch_out_location_id` remains `NULL` (no real punch out occurred). This is correct and expected.

### 5.3 Reopen Session Worker — No change

Reopen logic checks for `AUTO_CHECKOUT` sessions and replaces them with real punches. The real punch brings its own `device_sn`, from which `punch_out_location_id` is derived. No algorithm change.

### 5.4 Payroll Worker — No change

Payroll aggregates `net_hours` from sessions. It never references location. No change required.

### 5.5 Recalculation Worker — Minimal change

When rebuilding sessions from raw punches, the recalculation worker must also derive location IDs (same JOIN logic as Session Builder). This is inherited automatically if Session Builder is the rebuild mechanism.

### Summary

| Worker | Change Required? | Nature of Change |
|--------|-----------------|------------------|
| Session Builder | ✅ Minimal | Add location derivation on session create/close |
| Auto Checkout | ❌ None | |
| Reopen Session | ❌ None | |
| Payroll | ❌ None | |
| Recalculation | ✅ Minimal | Inherited from Session Builder change |

---

## 6. Reporting Implications

### 6.1 Employee-centric reports (unchanged)

All existing reports work as-is:
- Daily attendance per employee
- Monthly attendance summary
- Payroll / payslip
- Overtime summary

These are employee-level aggregations. Location adds a filter option but changes no calculations.

### 6.2 NEW: Location-based reports (additive)

| Report | Logic | MVP? |
|--------|-------|------|
| **Hours per location per day** | Group sessions by `punch_in_location_id`, sum `net_hours` | Later |
| **Headcount per location per day** | Count distinct `employee_id` by `punch_in_location_id` per `session_date` | Later |
| **Cross-location sessions log** | Filter sessions where `is_cross_location = TRUE` | Later |
| **Device health dashboard** | Show `devices.last_seen_at`, flag devices not seen in >1 hour | MVP |

### 6.3 Attribution rule for cross-location sessions

When a session spans two locations (IN at Andheri, OUT at Yari Road):

**MVP rule**: Attribute the full session to the **punch-in location**. This is simple, deterministic, and correct for 95% of use cases (employee spent most of the day at the IN location).

**Later improvement**: Allow time-weighted split attribution if the hospital tracks mid-day transfers. This requires additional punches or manual entry — out of scope for now.

---

## 7. Multi-Device Production Safeguards

These are specific to running 2+ devices and are additions to the existing safeguards in `audit.md`.

### 7.1 Device Registration Validation

| Safeguard | Implementation |
|-----------|----------------|
| **Unknown device auto-register** | If `device_sn` not in `devices` table, auto-insert with `location_id = NULL`, `is_active = TRUE`. Log `WARNING: Unknown device registered: {sn}`. |
| **Admin alert for unassigned device** | Dashboard shows banner if any device has `location_id = NULL`. Punches from unassigned devices are still stored (never reject), but sessions will have `punch_in_location_id = NULL`. |

### 7.2 Device Health Monitoring

| Safeguard | Implementation |
|-----------|----------------|
| **Heartbeat tracking** | Update `devices.last_seen_at` on every ADMS request (handshake or punch push). |
| **Stale device alert** | If `NOW() - last_seen_at > 60 minutes` for any active device, show warning on admin dashboard. Means: device offline, network issue, or power loss. |
| **MVP Required** | Yes. Without this, a dead device goes unnoticed and employees at that location silently have no attendance. |

### 7.3 Cross-Device Duplicate Prevention

The existing `UNIQUE(device_sn, device_user_id, punch_time)` constraint (audit.md §1) already handles intra-device duplicates. For cross-device:

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Employee punches at both devices within 2 minutes (walks between clinics) | Both punches are genuine — different `device_sn` → both pass unique constraint. The `duplicate_threshold_seconds` check (time-based) also doesn't catch this because it only deduplicates within the same `device_user_id`. | **Accepted behavior**: both punches store. Session Builder treats the second punch as a punch-out (closes session after ~2 minutes). This creates a very short session (flagged as anomaly per plan §4.6: `gross_hours < 0.5`). Admin reviews and corrects. |

> **Design decision**: Do NOT try to auto-deduplicate across devices. The risk of silently dropping a legitimate punch from a different location is worse than creating a short session that an admin can easily spot and fix.

### 7.4 Consistent `device_user_id` Enforcement

| Safeguard | Implementation |
|-----------|----------------|
| **Unmapped punch alert** | If a `device_user_id` from a punch cannot be resolved to any employee record, flag it as `UNMAPPED`. Never silently drop it. |
| **Cross-device ID mismatch detection** | Admin setup flow: when registering an employee across 2 devices, system verifies the same `device_user_id` is used. If `employee_device_mappings` table is in use (audit.md §4), it validates no conflicting active mappings exist. |

---

## 8. Architecture Impact

### Verdict: **No architecture changes required**

| Architecture Component | Impact |
|----------------------|--------|
| ADMS endpoint (`/iclock/cdata`) | ❌ No change. Already receives `device_sn` from query param. |
| FastAPI backend | ❌ No structural change. |
| Worker pipeline | ✅ Minimal code change in Session Builder (add location derivation). |
| Database | ✅ Two new tables (`locations`, `devices`), two new columns on `attendance_sessions`. |
| Frontend | ✅ New admin pages for device management and location reports. |
| Deployment | ❌ No change. Same single-process FastAPI + Postgres. |
| Auth model | ❌ No change. |

### Why no architecture change?

The original design made the right decision by keying everything on `employee_id` + `session_date`. Device is just a transport layer — it delivers punches, but the attendance engine is already device-agnostic. Adding locations is purely additive metadata.

The ADMS endpoint already captures `device_sn` in every punch. Adding `locations` and `devices` tables is a data model extension, not a structural change.

---

## 9. MVP vs Later Improvements

### MVP (build now)

| Item | Effort | Rationale |
|------|--------|-----------|
| `locations` table (2 rows) | 10 min | FK target for devices |
| `devices` table | 30 min | Device registration + location mapping |
| `last_seen_at` heartbeat tracking | 15 min | Critical: know if a device is dead |
| `punch_in_location_id` / `punch_out_location_id` on sessions | 15 min | Metadata capture at pairing time |
| `is_cross_location` flag on sessions | 5 min | Simple boolean derivation |
| Session Builder: location derivation | 30 min | Core logic change (~5-10 LOC) |
| Admin UI: device management page | 2-3 hrs | View devices, assign locations, see health |
| Stale device alert on dashboard | 1 hr | Warn when device hasn't checked in |
| Enforce same `device_user_id` across devices | Operational | Document + verify during employee enrollment |

**Total MVP effort**: ~1 day

### Later improvements (post-MVP)

| Item | When | Rationale |
|------|------|-----------|
| `device_location_history` table | When device physically moves | Track historical device-to-location mapping for accurate past reports |
| `employee_device_mappings` table (audit.md §4) | When device IDs differ across devices | Many-to-one device ID mapping with validity windows |
| Location-based reports (hours per clinic, headcount) | After 1 month of data | Need real data to define useful report formats |
| Cross-location session split attribution | If hospital requests | Time-weighted allocation of hours to locations |
| Location-aware anomaly detection | Phase 3+ | Flag impossible travel patterns (e.g., punch at Andheri, then Yari Road 2 min later) |
| Per-location shift configuration | If clinics have different hours | Currently all employees share the same shift; extend if needed |

---

## Summary of Changes to Existing Plan Sections

| Plan Section | Change |
|-------------|--------|
| §1 System Architecture | No change to diagram or flow |
| §2 Data Model | Add `locations` table, `devices` table, 3 columns to `attendance_sessions` |
| §3 Raw Log Ingestion | Add device auto-registration check (non-blocking) |
| §4 Session Pairing | Add location derivation after pairing (post-algorithm) |
| §5 Human Error Handling | No change |
| §6 Auto Checkout | No change |
| §7 Reopen Session | No change |
| §8 Payroll | No change (location never enters payroll) |
| §9 Worker Design | Minimal change to Session Builder worker |
| §13 MVP Scope | Move "Multi-device support" from "NOT in MVP" to MVP |
| §14 Dev Phases | Add device management to Phase 1 |
| §15 Edge Cases | Edge case #3 is now handled by design, not deferred |
| §16 Risks | Add "stale device" and "cross-device ID mismatch" risks |

> [!NOTE]
> The existing plan's edge case #3 states: *"Two devices, same employee: `device_user_id` is the key. If same ID on both devices, punches merge correctly. If different IDs, need mapping table."* This refinement formalizes the "same ID" path as the MVP approach and defers the mapping table to a later phase.
