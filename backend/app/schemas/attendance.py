"""Pydantic schemas for Attendance, Override, and Payroll."""

from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional, List, Any
from uuid import UUID
from enum import Enum


# ── Enums ──

class SessionStatus(str, Enum):
    OPEN = "OPEN"
    COMPLETE = "COMPLETE"
    AUTO_CHECKOUT = "AUTO_CHECKOUT"
    MISSING_OUT = "MISSING_OUT"
    REOPENED = "REOPENED"


class OverrideType(str, Enum):
    SET_PUNCH_OUT = "SET_PUNCH_OUT"
    SET_PUNCH_IN = "SET_PUNCH_IN"
    SET_BOTH = "SET_BOTH"
    MARK_ABSENT = "MARK_ABSENT"
    MARK_PRESENT = "MARK_PRESENT"
    OVERRIDE_HOURS = "OVERRIDE_HOURS"


class PayrollStatus(str, Enum):
    DRAFT = "DRAFT"
    FINAL = "FINAL"
    RECALCULATED = "RECALCULATED"


# ── Attendance Sessions ──

class AttendanceSessionResponse(BaseModel):
    id: UUID
    employee_id: UUID
    session_date: date
    punch_in_time: datetime
    punch_out_time: Optional[datetime] = None
    gross_hours: float = 0
    net_hours: float = 0
    status: str
    shift_id: Optional[UUID] = None
    auto_checkout_at: Optional[datetime] = None
    punch_in_location_id: Optional[UUID] = None
    punch_out_location_id: Optional[UUID] = None
    is_cross_location: bool = False
    has_override: bool = False
    version: int = 1
    created_at: datetime
    updated_at: datetime
    # Joined fields
    employee_name: Optional[str] = None
    punch_in_location_name: Optional[str] = None
    punch_out_location_name: Optional[str] = None


class AttendanceDailyView(BaseModel):
    """Daily summary for one employee."""
    employee_id: UUID
    employee_name: str
    session_date: date
    sessions: List[AttendanceSessionResponse]
    total_hours: float
    status_summary: str  # e.g., "COMPLETE", "AUTO_CHECKOUT (uncorrected)"


class AttendanceDashboard(BaseModel):
    """Today's overview for all employees."""
    date: date
    total_employees: int
    present: int
    absent: int
    auto_checkout: int
    open_sessions: int
    employees: List[AttendanceDailyView]


# ── Session Overrides ──

class OverrideCreate(BaseModel):
    employee_id: UUID
    session_date: date
    override_type: OverrideType
    override_punch_in: Optional[datetime] = None
    override_punch_out: Optional[datetime] = None
    override_status: Optional[str] = None
    override_net_hours: Optional[float] = None
    reason: str
    created_by: Optional[UUID] = None


class OverrideResponse(BaseModel):
    id: UUID
    employee_id: UUID
    session_date: date
    override_type: str
    override_punch_in: Optional[datetime] = None
    override_punch_out: Optional[datetime] = None
    override_status: Optional[str] = None
    override_net_hours: Optional[float] = None
    reason: str
    created_by: Optional[UUID] = None
    is_active: bool
    superseded_by: Optional[UUID] = None
    created_at: datetime


class CorrectionLogResponse(BaseModel):
    id: UUID
    override_id: UUID
    action: str
    session_snapshot_before: Optional[dict] = None
    session_snapshot_after: Optional[dict] = None
    performed_by: Optional[UUID] = None
    created_at: datetime


# ── Payroll ──

class PayrollCalculateRequest(BaseModel):
    employee_id: UUID
    period_start: date
    period_end: date


class PayrollResponse(BaseModel):
    id: UUID
    employee_id: UUID
    period_start: date
    period_end: date
    total_working_days: int
    days_present: int
    days_absent: int
    total_worked_hours: float
    expected_hours: float
    missing_hours: float
    overtime_hours: float
    basic_salary: float
    salary_cut: float
    overtime_pay: float
    final_salary: float
    calculation_details: Optional[dict] = None
    status: str
    calculated_at: datetime
    version: int
    employee_name: Optional[str] = None


class PayrollFinalizeRequest(BaseModel):
    payroll_id: UUID


# ── Recalculation ──

class RecalculationRequest(BaseModel):
    employee_id: UUID
    period_start: date
    period_end: date


class SessionDiff(BaseModel):
    date: date
    old: Optional[dict] = None
    new: Optional[dict] = None
    changed: bool
    override_preserved: bool = False
    reason: Optional[str] = None


class RecalculationPreview(BaseModel):
    employee_id: UUID
    employee_name: str
    period_start: date
    period_end: date
    changes: List[SessionDiff]
    override_summary: dict
    payroll_impact: Optional[dict] = None


class RecalculationConfirm(BaseModel):
    employee_id: UUID
    period_start: date
    period_end: date
