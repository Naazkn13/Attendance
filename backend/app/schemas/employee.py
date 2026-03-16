"""Pydantic schemas for Employee CRUD operations."""

from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional
from uuid import UUID


class ShiftBase(BaseModel):
    shift_code: Optional[str] = None
    name: str
    shift_hours: float


class ShiftCreate(ShiftBase):
    pass


class ShiftUpdate(BaseModel):
    shift_code: Optional[str] = None
    name: Optional[str] = None
    shift_hours: Optional[float] = None


class ShiftResponse(ShiftBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class EmployeeBase(BaseModel):
    name: str
    device_user_id: str
    basic_salary: float = 0
    shift_id: Optional[UUID] = None
    overtime_rate_per_hour: float = 0
    joining_date: date
    exit_date: Optional[date] = None
    is_active: bool = True


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    device_user_id: Optional[str] = None
    basic_salary: Optional[float] = None
    shift_id: Optional[UUID] = None
    overtime_rate_per_hour: Optional[float] = None
    joining_date: Optional[date] = None
    exit_date: Optional[date] = None
    is_active: Optional[bool] = None


class EmployeeResponse(EmployeeBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    shift: Optional[ShiftResponse] = None


class LocationBase(BaseModel):
    name: str
    address: Optional[str] = None
    is_active: bool = True


class LocationCreate(LocationBase):
    pass


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class LocationResponse(LocationBase):
    id: UUID
    created_at: datetime


class DeviceBase(BaseModel):
    device_sn: str
    location_id: Optional[UUID] = None
    device_name: str = "Unknown Device"
    is_active: bool = True


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    location_id: Optional[UUID] = None
    device_name: Optional[str] = None
    is_active: Optional[bool] = None


class DeviceResponse(DeviceBase):
    id: UUID
    last_seen_at: Optional[datetime] = None
    created_at: datetime
    location: Optional[LocationResponse] = None
