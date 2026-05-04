'use client';

import { useState, useEffect } from 'react';
import { getPendingLeaves, getAllLeaves, approveLeave, rejectLeave, getEmployees } from '@/lib/api';
import { hasRole } from '@/lib/auth';

export default function AdminLeavesPage() {
    const [pendingLeaves, setPendingLeaves] = useState([]);
    const [allLeaves, setAllLeaves] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [canApprove, setCanApprove] = useState(false);

    // Filters
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [employeeFilter, setEmployeeFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Reject Modal state
    const [rejectingLeave, setRejectingLeave] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        // Both ADMIN and SUPERADMIN can approve/reject
        setCanApprove(hasRole(['ADMIN', 'SUPERADMIN']));
        loadData();
    }, [year, month, employeeFilter, statusFilter]);

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const [pendingData, allData, empData] = await Promise.all([
                getPendingLeaves(),
                getAllLeaves({
                    year: year || undefined,
                    month: month || undefined,
                    employee_id: employeeFilter || undefined,
                    status: statusFilter || undefined
                }),
                getEmployees()
            ]);
            setPendingLeaves(pendingData || []);
            setAllLeaves(allData || []);
            setEmployees(empData || []);
        } catch (err) {
            setError(err.message || 'Failed to load leaves');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (leaveId) => {
        setActionLoading(true);
        try {
            await approveLeave(leaveId);
            await loadData();
        } catch (err) {
            alert(err.message || 'Failed to approve leave');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            await rejectLeave(rejectingLeave.id, rejectionReason);
            setRejectingLeave(null);
            setRejectionReason('');
            await loadData();
        } catch (err) {
            alert(err.message || 'Failed to reject leave');
        } finally {
            setActionLoading(false);
        }
    };

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    if (loading) return <div className="loading"><div className="spinner" /> Loading...</div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Leave Management</h1>
                    <p>Review and manage employee leave requests</p>
                </div>
            </div>

            {error && (
                <div className="alert alert-error"><span>❌</span> {error}</div>
            )}

            {/* Pending Approvals */}
            <div className="table-container" style={{ marginBottom: '32px' }}>
                <div className="table-header">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="badge badge-warning">{pendingLeaves.length}</span>
                        Pending Approvals
                    </h2>
                </div>

                {pendingLeaves.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">✅</div>
                        <h3>No pending leave requests</h3>
                        <p>All caught up!</p>
                    </div>
                ) : (
                    <div>
                        {pendingLeaves.map(leave => (
                            <div key={leave.id} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
                                flexWrap: 'wrap', gap: '12px'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{leave.employees?.name}</span>
                                        <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{leave.employees?.device_user_id}</code>
                                        <span className="badge badge-muted">{leave.leave_type}</span>
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                        <strong>Date:</strong> {leave.leave_date}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                        <strong>Reason:</strong> {leave.reason}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => handleApprove(leave.id)}
                                        disabled={actionLoading || !canApprove}
                                        className="btn btn-sm"
                                        style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)' }}
                                    >
                                        ✓ Approve
                                    </button>
                                    <button
                                        onClick={() => setRejectingLeave(leave)}
                                        disabled={actionLoading || !canApprove}
                                        className="btn btn-danger btn-sm"
                                    >
                                        ✗ Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* All Leaves Filterable */}
            <div className="table-container">
                <div className="table-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <h2 style={{ marginBottom: '16px' }}>All Leaves</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        <select className="form-select" value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: 'auto', minWidth: '140px' }}>
                            <option value="">All Months</option>
                            {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                        </select>
                        <input type="number" className="form-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: '100px' }} />
                        <select className="form-select" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} style={{ width: 'auto', minWidth: '160px' }}>
                            <option value="">All Employees</option>
                            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                        </select>
                        <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: '130px' }}>
                            <option value="">All Statuses</option>
                            <option value="PENDING">Pending</option>
                            <option value="APPROVED">Approved</option>
                            <option value="REJECTED">Rejected</option>
                        </select>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Reason</th>
                            <th>Status</th>
                            <th>Paid / Unpaid</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allLeaves.length === 0 ? (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No leaves found matching the filters.</td>
                            </tr>
                        ) : (
                            allLeaves.map((leave) => (
                                <tr key={leave.id}>
                                    <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{leave.employees?.name}</td>
                                    <td>{leave.leave_date}</td>
                                    <td><span className="badge badge-muted">{leave.leave_type}</span></td>
                                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={leave.reason}>
                                        {leave.reason}
                                    </td>
                                    <td>
                                        <span className={`badge ${leave.status === 'APPROVED' ? 'badge-success' : leave.status === 'REJECTED' ? 'badge-error' : 'badge-warning'}`}>
                                            {leave.status}
                                        </span>
                                    </td>
                                    <td>
                                        {leave.status === 'APPROVED' ? (
                                            leave.is_paid ?
                                                <span className="badge badge-success">✓ Paid</span> :
                                                <span className="badge badge-error">LOP (Unpaid)</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Rejection Modal */}
            {rejectingLeave && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setRejectingLeave(null)}>
                    <div className="modal">
                        <h2>Reject Leave Request</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
                            Rejecting leave for <strong style={{ color: 'var(--text-primary)' }}>{rejectingLeave.employees?.name}</strong> on <strong style={{ color: 'var(--text-primary)' }}>{rejectingLeave.leave_date}</strong>.
                        </p>
                        <form onSubmit={handleReject}>
                            <div className="form-group">
                                <label>Reason for Rejection *</label>
                                <textarea
                                    required
                                    rows="3"
                                    className="form-input"
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    placeholder="Please provide a reason for rejecting this leave request..."
                                    style={{ resize: 'vertical' }}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setRejectingLeave(null)}>Cancel</button>
                                <button type="submit" className="btn btn-danger" disabled={actionLoading || !rejectionReason.trim()}>Reject Leave</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
