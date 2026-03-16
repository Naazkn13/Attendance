-- ============================================================
-- Attendance & Payroll System — Full Database Schema
-- Run this in Supabase SQL Editor to create all tables
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE session_status AS ENUM (
    'OPEN',
    'COMPLETE',
    'AUTO_CHECKOUT',
    'MISSING_OUT',
    'REOPENED'
);

CREATE TYPE override_type AS ENUM (
    'SET_PUNCH_OUT',
    'SET_PUNCH_IN',
    'SET_BOTH',
    'MARK_ABSENT',
    'MARK_PRESENT',
    'OVERRIDE_HOURS'
);

CREATE TYPE correction_action AS ENUM (
    'CREATED',
    'DEACTIVATED',
    'SUPERSEDED'
);

CREATE TYPE payroll_status AS ENUM (
    'DRAFT',
    'FINAL',
    'RECALCULATED'
);

CREATE TYPE day_type AS ENUM (
    'WORKING',
    'WEEKEND',
    'HOLIDAY'
);

-- ============================================================
-- TABLE: shifts
-- ============================================================

CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_code TEXT UNIQUE,
    name TEXT NOT NULL,
    shift_hours DECIMAL(4,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: employees
-- ============================================================

CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    device_user_id TEXT UNIQUE NOT NULL,
    basic_salary DECIMAL(10,2) NOT NULL DEFAULT 0,
    shift_id UUID REFERENCES shifts(id),
    overtime_rate_per_hour DECIMAL(8,2) NOT NULL DEFAULT 0,
    joining_date DATE NOT NULL,
    exit_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: locations
-- ============================================================

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: devices
-- ============================================================

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_sn TEXT UNIQUE NOT NULL,
    location_id UUID REFERENCES locations(id),
    device_name TEXT NOT NULL DEFAULT 'Unknown Device',
    device_ip TEXT,
    device_port INT DEFAULT 4370,
    connection_mode TEXT DEFAULT 'push',
    last_polled_at TIMESTAMPTZ,
    poll_status TEXT,
    last_seen_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: raw_punches (IMMUTABLE — SOURCE OF TRUTH)
-- ============================================================

CREATE TABLE raw_punches (
    id BIGSERIAL PRIMARY KEY,
    device_user_id TEXT NOT NULL,
    punch_time TIMESTAMPTZ NOT NULL,
    device_sn TEXT NOT NULL,
    raw_payload JSONB,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_processed BOOLEAN NOT NULL DEFAULT FALSE,
    duplicate_of BIGINT REFERENCES raw_punches(id),
    UNIQUE(device_sn, device_user_id, punch_time)
);

CREATE INDEX idx_raw_punches_unprocessed ON raw_punches(is_processed) WHERE is_processed = FALSE;
CREATE INDEX idx_raw_punches_employee_time ON raw_punches(device_user_id, punch_time);

-- ============================================================
-- TABLE: attendance_sessions (DERIVED — REBUILDABLE)
-- ============================================================

CREATE TABLE attendance_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    session_date DATE NOT NULL,
    punch_in_id BIGINT REFERENCES raw_punches(id),
    punch_out_id BIGINT REFERENCES raw_punches(id),
    punch_in_time TIMESTAMPTZ NOT NULL,
    punch_out_time TIMESTAMPTZ,
    gross_hours DECIMAL(5,2) DEFAULT 0,
    net_hours DECIMAL(5,2) DEFAULT 0,
    status session_status NOT NULL DEFAULT 'OPEN',
    shift_id UUID REFERENCES shifts(id),
    auto_checkout_at TIMESTAMPTZ,
    punch_in_location_id UUID REFERENCES locations(id),
    punch_out_location_id UUID REFERENCES locations(id),
    is_cross_location BOOLEAN NOT NULL DEFAULT FALSE,
    has_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INT NOT NULL DEFAULT 1
);

CREATE INDEX idx_sessions_employee_date ON attendance_sessions(employee_id, session_date);
CREATE INDEX idx_sessions_status ON attendance_sessions(status);
CREATE INDEX idx_sessions_open ON attendance_sessions(employee_id, status) WHERE status = 'OPEN';

-- ============================================================
-- TABLE: session_overrides (THE OVERRIDE LAYER — DURABLE)
-- ============================================================

CREATE TABLE session_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    session_date DATE NOT NULL,
    override_type override_type NOT NULL,
    override_punch_in TIMESTAMPTZ,
    override_punch_out TIMESTAMPTZ,
    override_status TEXT,
    override_net_hours DECIMAL(5,2),
    reason TEXT NOT NULL,
    created_by UUID REFERENCES employees(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    superseded_by UUID REFERENCES session_overrides(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_overrides_employee_date ON session_overrides(employee_id, session_date);
CREATE INDEX idx_overrides_active ON session_overrides(employee_id, session_date, is_active) WHERE is_active = TRUE;

-- ============================================================
-- TABLE: manual_corrections_log (AUDIT TRAIL)
-- ============================================================

CREATE TABLE manual_corrections_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    override_id UUID NOT NULL REFERENCES session_overrides(id),
    action correction_action NOT NULL,
    session_snapshot_before JSONB,
    session_snapshot_after JSONB,
    performed_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: payroll_records
-- ============================================================

CREATE TABLE payroll_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_working_days INT NOT NULL DEFAULT 0,
    days_present INT NOT NULL DEFAULT 0,
    days_absent INT NOT NULL DEFAULT 0,
    total_worked_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
    expected_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
    missing_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
    overtime_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
    basic_salary DECIMAL(10,2) NOT NULL DEFAULT 0,
    salary_cut DECIMAL(10,2) NOT NULL DEFAULT 0,
    overtime_pay DECIMAL(10,2) NOT NULL DEFAULT 0,
    final_salary DECIMAL(10,2) NOT NULL DEFAULT 0,
    calculation_details JSONB,
    status payroll_status NOT NULL DEFAULT 'DRAFT',
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INT NOT NULL DEFAULT 1
);

CREATE INDEX idx_payroll_employee_period ON payroll_records(employee_id, period_start, period_end);

-- ============================================================
-- TABLE: calendar_days (Post-MVP)
-- ============================================================

CREATE TABLE calendar_days (
    date DATE PRIMARY KEY,
    day_type day_type NOT NULL DEFAULT 'WORKING',
    description TEXT
);

-- ============================================================
-- TABLE: system_config
-- ============================================================

CREATE TABLE system_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INITIAL DATA
-- ============================================================

-- Default system config
INSERT INTO system_config (key, value) VALUES
    ('duplicate_threshold_seconds', '120'),
    ('auto_checkout_buffer_minutes', '30'),
    ('business_timezone', '"Asia/Kolkata"')
ON CONFLICT (key) DO NOTHING;

-- Default shifts
INSERT INTO shifts (name, start_time, end_time, shift_hours, grace_late_minutes, grace_early_leave_minutes, max_allowed_hours, break_minutes) VALUES
    ('Full Day 8h', '09:00', '18:00', 8.0, 15, 10, 14.0, 60),
    ('Half Day 4h', '09:00', '13:00', 4.0, 15, 10, 8.0, 0),
    ('Short 3h', '09:00', '12:00', 3.0, 15, 10, 6.0, 0)
ON CONFLICT DO NOTHING;

-- ============================================================
-- TRIGGER: Prevent UPDATE/DELETE on raw_punches (immutability)
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_raw_punch_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow updating is_processed and duplicate_of only
    IF TG_OP = 'UPDATE' THEN
        IF NEW.device_user_id != OLD.device_user_id
           OR NEW.punch_time != OLD.punch_time
           OR NEW.device_sn != OLD.device_sn
           OR NEW.raw_payload IS DISTINCT FROM OLD.raw_payload THEN
            RAISE EXCEPTION 'raw_punches core fields are immutable';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'raw_punches rows cannot be deleted';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_raw_punch_immutability
    BEFORE UPDATE OR DELETE ON raw_punches
    FOR EACH ROW
    EXECUTE FUNCTION prevent_raw_punch_modification();

-- ============================================================
-- TRIGGER: Auto-update updated_at on employees and sessions
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_sessions_updated_at
    BEFORE UPDATE ON attendance_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_shifts_updated_at
    BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS POLICIES (disabled for service_role, enabled for anon)
-- ============================================================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_corrections_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_days ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS. Create permissive policies for authenticated access.
-- For MVP, allow all operations (tighten in production)
CREATE POLICY "Allow all for service role" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON shifts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON devices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON raw_punches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON attendance_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON session_overrides FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON manual_corrections_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON payroll_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON system_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON calendar_days FOR ALL USING (true) WITH CHECK (true);
