'use client';

import { useState, useEffect } from 'react';
import { getEmployees } from '@/lib/api';
import { getToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

async function apiRequest(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json();
}

export default function UserManagementPage() {
  const [admins, setAdmins] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showEmpPwdModal, setShowEmpPwdModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [adminForm, setAdminForm] = useState({ username: '', password: '' });
  const [empPwdForm, setEmpPwdForm] = useState({ password: '' });
  const [alert, setAlert] = useState(null);

  const loadData = async () => {
    setLoading(true);
    let adminData = [];
    let empData = [];
    
    try {
      adminData = await apiRequest('/api/users/admins');
    } catch (err) {
      console.error('Failed to load admins:', err);
    }
    
    try {
      empData = await getEmployees(true);
    } catch (err) {
      console.error('Failed to load employees:', err);
    }
    
    setAdmins(adminData || []);
    setEmployees(empData || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const showAlert = (msg, type = 'success') => {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 4000);
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/users/admins', {
        method: 'POST',
        body: JSON.stringify(adminForm)
      });
      showAlert(`Admin "${adminForm.username}" created successfully!`);
      setAdminForm({ username: '', password: '' });
      setShowAdminModal(false);
      loadData();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    try {
      await apiRequest(`/api/users/employees/${selectedEmployee.id}/set-password`, {
        method: 'POST',
        body: JSON.stringify({ password: empPwdForm.password })
      });
      showAlert(`Login created for ${selectedEmployee.name} successfully!`);
      setEmpPwdForm({ password: '' });
      setShowEmpPwdModal(false);
      setSelectedEmployee(null);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /> Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p>Create admin accounts and set employee portal credentials</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdminModal(true)}>+ Create Admin</button>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type}`}>
          <span>{alert.type === 'success' ? '✅' : '❌'}</span>
          {alert.msg}
        </div>
      )}

      {/* Admin Users Table */}
      <div className="table-container" style={{ marginBottom: '32px' }}>
        <div className="table-header">
          <h2>Admin Users ({admins.length})</h2>
        </div>
        {admins.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔐</div>
            <h3>No admin users yet</h3>
            <p>Create an admin account (e.g., for the Doctor) to manage leave approvals.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Login</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(admin => (
                <tr key={admin.id}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{admin.username}</td>
                  <td><span className="badge badge-info">ADMIN</span></td>
                  <td><span className={`badge ${admin.is_active ? 'badge-success' : 'badge-error'}`}>{admin.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>{new Date(admin.created_at).toLocaleDateString('en-IN')}</td>
                  <td>{admin.last_login_at ? new Date(admin.last_login_at).toLocaleString('en-IN') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Employee Portal Credentials */}
      <div className="table-container">
        <div className="table-header">
          <h2>Employee Portal Credentials</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Employee Name</th>
              <th>Device ID</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id}>
                <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{emp.name}</td>
                <td>
                  <code style={{ background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                    {emp.device_user_id}
                  </code>
                </td>
                <td><span className={`badge ${emp.is_active ? 'badge-success' : 'badge-error'}`}>{emp.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setSelectedEmployee(emp); setEmpPwdForm({ password: '' }); setShowEmpPwdModal(true); }}
                  >
                    🔑 Set / Reset Password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Admin Modal */}
      {showAdminModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAdminModal(false)}>
          <div className="modal">
            <h2>Create Admin Account</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
              Admin users (e.g., the Doctor) can log in to the dashboard and approve/reject leave requests.
            </p>
            <form onSubmit={handleCreateAdmin}>
              <div className="form-group">
                <label>Username *</label>
                <input
                  className="form-input"
                  required
                  placeholder="e.g. dr_smith"
                  value={adminForm.username}
                  onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Password *</label>
                <input
                  className="form-input"
                  type="password"
                  required
                  placeholder="Choose a strong password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdminModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Admin</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set Employee Password Modal */}
      {showEmpPwdModal && selectedEmployee && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowEmpPwdModal(false)}>
          <div className="modal">
            <h2>Set Employee Password</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
              Setting a password for <strong style={{ color: 'var(--text-primary)' }}>{selectedEmployee.name}</strong> (Device ID: <code>{selectedEmployee.device_user_id}</code>).
              They will use their Device ID as the username to login at the Employee Portal.
            </p>
            <form onSubmit={handleSetPassword}>
              <div className="form-group">
                <label>New Password *</label>
                <input
                  className="form-input"
                  type="password"
                  required
                  placeholder="Enter a new password"
                  value={empPwdForm.password}
                  onChange={(e) => setEmpPwdForm({ password: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEmpPwdModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Set Password</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
