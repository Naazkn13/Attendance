-- ============================================================
-- Attendance & Payroll System — Full Database Schema
-- Run this in Supabase SQL Editor to create all tables
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$ BEGIN
    CREATE TYPE session_status AS ENUM (
        'OPEN',
        'COMPLETE',
        'AUTO_CHECKOUT',
        'MISSING_OUT',
        'REOPENED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE override_type AS ENUM (
        'SET_PUNCH_OUT',
        'SET_PUNCH_IN',
        'SET_BOTH',
        'MARK_ABSENT',
        'MARK_PRESENT',
        'OVERRIDE_HOURS'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE correction_action AS ENUM (
        'CREATED',
        'DEACTIVATED',
        'SUPERSEDED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payroll_status AS ENUM (
        'DRAFT',
        'FINAL',
        'RECALCULATED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE day_type AS ENUM (
        'WORKING',
        'WEEKEND',
        'HOLIDAY'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'SUPERADMIN',
        'ADMIN',
        'EMPLOYEE'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE leave_status AS ENUM (
        'PENDING',
        'APPROVED',
        'REJECTED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE leave_type AS ENUM (
        'PAID',
        'UNPAID',
        'SICK',
        'CASUAL'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- TABLE: shifts
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
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

CREATE TABLE IF NOT EXISTS employees (
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
-- TABLE: users (Authentication)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id),  -- NULL for superadmin/admin accounts
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'EMPLOYEE',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: leave_requests
-- ============================================================

CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    leave_date DATE NOT NULL,
    leave_type leave_type NOT NULL DEFAULT 'CASUAL',
    reason TEXT NOT NULL,
    status leave_status NOT NULL DEFAULT 'PENDING',
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id, leave_date)
);

-- ============================================================
-- TABLE: leave_balances
-- ============================================================

CREATE TABLE IF NOT EXISTS leave_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    year INT NOT NULL,
    month INT NOT NULL,
    paid_leaves_quota INT NOT NULL DEFAULT 1,
    paid_leaves_used INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id, year, month)
);

-- ============================================================
-- TABLE: locations
-- ============================================================

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: devices
-- ============================================================

CREATE TABLE IF NOT EXISTS devices (
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

CREATE TABLE IF NOT EXISTS raw_punches (
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

CREATE INDEX IF NOT EXISTS idx_raw_punches_unprocessed ON raw_punches(is_processed) WHERE is_processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_raw_punches_employee_time ON raw_punches(device_user_id, punch_time);

-- ============================================================
-- TABLE: attendance_sessions (DERIVED — REBUILDABLE)
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_sessions (
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

CREATE INDEX IF NOT EXISTS idx_sessions_employee_date ON attendance_sessions(employee_id, session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON attendance_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_open ON attendance_sessions(employee_id, status) WHERE status = 'OPEN';

-- ============================================================
-- TABLE: session_overrides (THE OVERRIDE LAYER — DURABLE)
-- ============================================================

CREATE TABLE IF NOT EXISTS session_overrides (
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

CREATE INDEX IF NOT EXISTS idx_overrides_employee_date ON session_overrides(employee_id, session_date);
CREATE INDEX IF NOT EXISTS idx_overrides_active ON session_overrides(employee_id, session_date, is_active) WHERE is_active = TRUE;

-- ============================================================
-- TABLE: manual_corrections_log (AUDIT TRAIL)
-- ============================================================

CREATE TABLE IF NOT EXISTS manual_corrections_log (
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

CREATE TABLE IF NOT EXISTS payroll_records (
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

CREATE INDEX IF NOT EXISTS idx_payroll_employee_period ON payroll_records(employee_id, period_start, period_end);

-- ============================================================
-- TABLE: calendar_days (Post-MVP)
-- ============================================================

CREATE TABLE IF NOT EXISTS calendar_days (
    date DATE PRIMARY KEY,
    day_type day_type NOT NULL DEFAULT 'WORKING',
    description TEXT
);

-- ============================================================
-- TABLE: system_config
-- ============================================================

CREATE TABLE IF NOT EXISTS system_config (
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
INSERT INTO shifts (shift_code, name, shift_hours) VALUES
    ('FD', 'Full Day 8h', 8.0),
    ('HD', 'Half Day 4h', 4.0),
    ('SD', 'Short 3h', 3.0)
ON CONFLICT (shift_code) DO NOTHING;

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

DROP TRIGGER IF EXISTS trigger_raw_punch_immutability ON raw_punches;
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

DROP TRIGGER IF EXISTS trigger_employees_updated_at ON employees;
CREATE TRIGGER trigger_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_sessions_updated_at ON attendance_sessions;
CREATE TRIGGER trigger_sessions_updated_at
    BEFORE UPDATE ON attendance_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_shifts_updated_at ON shifts;
CREATE TRIGGER trigger_shifts_updated_at
    BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_leave_requests_updated_at ON leave_requests;
CREATE TRIGGER trigger_leave_requests_updated_at
    BEFORE UPDATE ON leave_requests
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
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS. Create permissive policies for authenticated access.
-- For MVP, allow all operations (tighten in production)
DROP POLICY IF EXISTS "Allow all for service role" ON employees;
CREATE POLICY "Allow all for service role" ON employees FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON shifts;
CREATE POLICY "Allow all for service role" ON shifts FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON locations;
CREATE POLICY "Allow all for service role" ON locations FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON devices;
CREATE POLICY "Allow all for service role" ON devices FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON raw_punches;
CREATE POLICY "Allow all for service role" ON raw_punches FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON attendance_sessions;
CREATE POLICY "Allow all for service role" ON attendance_sessions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON session_overrides;
CREATE POLICY "Allow all for service role" ON session_overrides FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON manual_corrections_log;
CREATE POLICY "Allow all for service role" ON manual_corrections_log FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON payroll_records;
CREATE POLICY "Allow all for service role" ON payroll_records FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON system_config;
CREATE POLICY "Allow all for service role" ON system_config FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON calendar_days;
CREATE POLICY "Allow all for service role" ON calendar_days FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON users;
CREATE POLICY "Allow all for service role" ON users FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON leave_requests;
CREATE POLICY "Allow all for service role" ON leave_requests FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for service role" ON leave_balances;
CREATE POLICY "Allow all for service role" ON leave_balances FOR ALL USING (true) WITH CHECK (true);
