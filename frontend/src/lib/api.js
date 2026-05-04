/**
 * Backend API client for the Attendance & Payroll system.
 */

import { getToken } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const token = getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    // Auto-logout on 401 — stale/expired token
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return;
    }
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API Error: ${res.status}`);
  }

  return res.json();
}

// ── Health ──
export const getHealth = () => request('/api/health');

// ── Employees ──
export const getEmployees = (active) =>
  request(`/api/employees${active !== undefined ? `?is_active=${active}` : ''}`);
export const getEmployee = (id) => request(`/api/employees/${id}`);
export const createEmployee = (data) =>
  request('/api/employees', { method: 'POST', body: JSON.stringify(data) });
export const updateEmployee = (id, data) =>
  request(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteEmployee = (id) =>
  request(`/api/employees/${id}`, { method: 'DELETE' });

// ── Shifts ──
export const getShifts = () => request('/api/shifts');
export const createShift = (data) =>
  request('/api/shifts', { method: 'POST', body: JSON.stringify(data) });
export const updateShift = (id, data) =>
  request(`/api/shifts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteShift = (id) =>
  request(`/api/shifts/${id}`, { method: 'DELETE' });

// ── Locations ──
export const getLocations = () => request('/api/locations');
export const createLocation = (data) =>
  request('/api/locations', { method: 'POST', body: JSON.stringify(data) });

// ── Devices ──
export const getDevices = () => request('/api/devices');
export const getDeviceHealth = () => request('/api/devices/health/check');
export const updateDevice = (id, data) =>
  request(`/api/devices/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// ── Attendance ──
export const getTodayAttendance = () => request('/api/attendance/today');
export const getSessions = (params = {}) => {
  const query = new URLSearchParams();
  if (params.employee_id) query.set('employee_id', params.employee_id);
  if (params.date_from) query.set('date_from', params.date_from);
  if (params.date_to) query.set('date_to', params.date_to);
  if (params.status) query.set('status', params.status);
  return request(`/api/attendance/sessions?${query.toString()}`);
};
export const getMonthlyAttendance = (employeeId, year, month) =>
  request(`/api/attendance/employee/${employeeId}/monthly?year=${year}&month=${month}`);
export const triggerSessionBuilder = () =>
  request('/api/attendance/trigger-session-builder', { method: 'POST' });
export const triggerAutoCheckout = () =>
  request('/api/attendance/trigger-auto-checkout', { method: 'POST' });

// ── Overrides ──
export const getOverrides = (params = {}) => {
  const query = new URLSearchParams();
  if (params.employee_id) query.set('employee_id', params.employee_id);
  if (params.is_active !== undefined) query.set('is_active', params.is_active);
  return request(`/api/overrides?${query.toString()}`);
};
export const createOverride = (data) =>
  request('/api/overrides', { method: 'POST', body: JSON.stringify(data) });
export const deactivateOverride = (id) =>
  request(`/api/overrides/${id}/deactivate`, { method: 'PUT' });
export const getCorrectionLog = () => request('/api/corrections/log');

// ── Payroll ──
export const calculatePayroll = (data) =>
  request('/api/payroll/calculate', { method: 'POST', body: JSON.stringify(data) });
export const calculateAllPayroll = (periodStart, periodEnd) =>
  request(`/api/payroll/calculate-all?period_start=${periodStart}&period_end=${periodEnd}`, { method: 'POST' });
export const getPayrolls = (params = {}) => {
  const query = new URLSearchParams();
  if (params.employee_id) query.set('employee_id', params.employee_id);
  if (params.status) query.set('status', params.status);
  return request(`/api/payroll?${query.toString()}`);
};
export const getPayroll = (id) => request(`/api/payroll/${id}`);
export const finalizePayroll = (payrollId) =>
  request('/api/payroll/finalize', { method: 'POST', body: JSON.stringify({ payroll_id: payrollId }) });
export const unfinalizePayroll = (payrollId) =>
  request(`/api/payroll/${payrollId}/unfinalize`, { method: 'POST' });
export const deletePayroll = (payrollId) =>
  request(`/api/payroll/${payrollId}`, { method: 'DELETE' });

// ── Recalculation ──
export const previewRecalculation = (data) =>
  request('/api/recalculation/preview', { method: 'POST', body: JSON.stringify(data) });
export const confirmRecalculation = (data) =>
  request('/api/recalculation/confirm', { method: 'POST', body: JSON.stringify(data) });

// ── Payslips ──
export const generatePayslips = (periodStart, periodEnd) =>
  request(`/api/payslip/generate?period_start=${periodStart}&period_end=${periodEnd}`, { method: 'POST' });
export const getPayslip = (employeeId, periodStart, periodEnd) =>
  request(`/api/payslip/${employeeId}?period_start=${periodStart}&period_end=${periodEnd}`);

// ── Holidays ──
export const getHolidays = (year) =>
  request(`/api/holidays${year ? `?year=${year}` : ''}`);
export const createHoliday = (data) =>
  request('/api/holidays', { method: 'POST', body: JSON.stringify(data) });
export const updateHoliday = (dateStr, data) =>
  request(`/api/holidays/${dateStr}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteHoliday = (dateStr) =>
  request(`/api/holidays/${dateStr}`, { method: 'DELETE' });
export const bulkCreateHolidays = (data) =>
  request('/api/holidays/bulk', { method: 'POST', body: JSON.stringify(data) });

// ── System Config ──
export const getSystemConfig = () => request('/api/system-config');

// ── Manual Sync ──
export const uploadSyncFile = async (file, deviceSn) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('device_sn', deviceSn || 'MANUAL_USB');

  const token = getToken();
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/sync/upload-dat`, {
    method: 'POST',
    body: formData,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API Error: ${res.status}`);
  }
  return res.json();
};

// ── Employee Portal ──
export const getMyProfile = () => request('/api/portal/my-profile');
export const getMyPayslips = (year, month) => {
  const query = new URLSearchParams();
  if (year) query.set('year', year);
  if (month) query.set('month', month);
  return request(`/api/portal/my-payslips?${query.toString()}`);
};
export const getMyPayslip = (periodStart) => request(`/api/portal/my-payslip/${periodStart}`);
export const getMyAttendance = (year, month) => request(`/api/portal/my-attendance?year=${year}&month=${month}`);

// ── Leaves (Employee) ──
export const applyLeave = (data) => request('/api/leaves/apply', { method: 'POST', body: JSON.stringify(data) });
export const getMyLeaves = (year, month) => {
  const query = new URLSearchParams();
  if (year) query.set('year', year);
  if (month) query.set('month', month);
  return request(`/api/leaves/my-leaves?${query.toString()}`);
};
export const getMyLeaveBalance = (year, month) => request(`/api/leaves/my-balance?year=${year}&month=${month}`);

// ── Leaves (Admin) ──
export const getPendingLeaves = () => request('/api/leaves/pending');
export const getAllLeaves = (params = {}) => {
  const query = new URLSearchParams();
  if (params.employee_id) query.set('employee_id', params.employee_id);
  if (params.year) query.set('year', params.year);
  if (params.month) query.set('month', params.month);
  if (params.status) query.set('status', params.status);
  return request(`/api/leaves/all?${query.toString()}`);
};
export const approveLeave = (id) => request(`/api/leaves/${id}/approve`, { method: 'POST' });
export const rejectLeave = (id, reason) => request(`/api/leaves/${id}/reject`, { method: 'POST', body: JSON.stringify({ rejection_reason: reason }) });
export const getLeaveSummary = (employeeId, year) => request(`/api/leaves/summary/${employeeId}?year=${year}`);

// ── User Management (Admin) ──
export const createAdmin = (data) => request('/api/users/admins', { method: 'POST', body: JSON.stringify(data) });
export const getAdmins = () => request('/api/users/admins');
export const setEmployeePassword = (employeeId, password) => request(`/api/users/employees/${employeeId}/set-password`, { method: 'POST', body: JSON.stringify({ password }) });
