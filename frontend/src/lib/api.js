/**
 * Backend API client for the Attendance & Payroll system.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
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

// ── System Config ──
export const getSystemConfig = () => request('/api/system-config');

// ── Manual Sync ──
export const uploadSyncFile = async (file, deviceSn) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('device_sn', deviceSn || 'MANUAL_USB');

  const res = await fetch(`${API_BASE}/api/sync/upload-dat`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API Error: ${res.status}`);
  }
  return res.json();
};
