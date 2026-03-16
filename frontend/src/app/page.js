'use client';

import { useState, useEffect } from 'react';
import { getTodayAttendance, getDeviceHealth, getHealth } from '@/lib/api';

export default function DashboardPage() {
  const [attendance, setAttendance] = useState(null);
  const [deviceHealth, setDeviceHealth] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [att, dev, sys] = await Promise.all([
          getTodayAttendance().catch(() => null),
          getDeviceHealth().catch(() => null),
          getHealth().catch(() => null),
        ]);
        setAttendance(att);
        setDeviceHealth(dev);
        setSystemHealth(sys);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading dashboard...
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Real-time overview · {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className={`badge ${systemHealth?.status === 'healthy' ? 'badge-success' : 'badge-warning'}`}>
          ● {systemHealth?.status || 'Checking...'}
        </div>
      </div>

      {error && <div className="alert alert-error">⚠️ {error}</div>}

      {/* Alert banners */}
      {deviceHealth?.stale > 0 && (
        <div className="alert alert-warning">
          📡 {deviceHealth.stale} device(s) offline for &gt; 60 minutes: {deviceHealth.stale_devices?.map(d => d.device_name).join(', ')}
        </div>
      )}
      {deviceHealth?.unassigned > 0 && (
        <div className="alert alert-warning">
          🔧 {deviceHealth.unassigned} device(s) have no assigned location
        </div>
      )}

      {/* Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon">👥</div>
          <div className="stat-card-value">{attendance?.total_employees || 0}</div>
          <div className="stat-card-label">Total Employees</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">✅</div>
          <div className="stat-card-value">{attendance?.present || 0}</div>
          <div className="stat-card-label">Present Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">❌</div>
          <div className="stat-card-value">{attendance?.absent || 0}</div>
          <div className="stat-card-label">Absent</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">⚠️</div>
          <div className="stat-card-value">{attendance?.auto_checkout || 0}</div>
          <div className="stat-card-label">Auto Checkout</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">🔵</div>
          <div className="stat-card-value">{attendance?.open_sessions || 0}</div>
          <div className="stat-card-label">Open Sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">📡</div>
          <div className="stat-card-value">{deviceHealth?.healthy || 0}/{deviceHealth?.total_devices || 0}</div>
          <div className="stat-card-label">Devices Online</div>
        </div>
      </div>

      {/* Today's Attendance Table */}
      <div className="table-container">
        <div className="table-header">
          <h2>Today&apos;s Attendance</h2>
        </div>
        {attendance?.employees?.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Status</th>
                <th>Punch In</th>
                <th>Punch Out</th>
                <th>Hours</th>
                <th>Override</th>
              </tr>
            </thead>
            <tbody>
              {attendance.employees.map((emp) => (
                <tr key={emp.employee_id}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{emp.employee_name}</td>
                  <td>
                    <span className={`badge ${emp.status_summary === 'PRESENT' ? 'badge-success' :
                        emp.status_summary === 'OPEN' ? 'badge-info' :
                          emp.status_summary === 'AUTO_CHECKOUT' ? 'badge-warning' :
                            'badge-error'
                      }`}>
                      {emp.status_summary}
                    </span>
                  </td>
                  <td>{emp.sessions?.[0]?.punch_in_time ? new Date(emp.sessions[0].punch_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{emp.sessions?.[0]?.punch_out_time ? new Date(emp.sessions[0].punch_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td style={{ fontWeight: 600, color: emp.total_hours > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    {emp.total_hours > 0 ? `${emp.total_hours}h` : '—'}
                  </td>
                  <td>{emp.sessions?.some(s => s.has_override) ? <span className="badge badge-info">✏️ Corrected</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3>No attendance data</h3>
            <p>No punch data received today. Ensure devices are connected.</p>
          </div>
        )}
      </div>
    </div>
  );
}
