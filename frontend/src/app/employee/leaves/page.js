'use client';

import { useState, useEffect } from 'react';
import { getMyLeaves, getMyLeaveBalance, applyLeave } from '@/lib/api';

export default function EmployeeLeavesPage() {
    const [leaves, setLeaves] = useState([]);
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ leave_date: '', leave_type: 'CASUAL', reason: '' });
    const [submitting, setSubmitting] = useState(false);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const [leavesData, balanceData] = await Promise.all([
                getMyLeaves(year, month),
                getMyLeaveBalance(year, month)
            ]);
            setLeaves(leavesData || []);
            setBalance(balanceData);
        } catch (err) {
            setError(err.message || 'Failed to load leaves');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [year, month]);

    const handleApply = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setSuccessMsg('');
        try {
            await applyLeave(formData);
            setSuccessMsg('Leave application submitted successfully!');
            setShowForm(false);
            setFormData({ leave_date: '', leave_type: 'CASUAL', reason: '' });
            loadData();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            setError(err.message || 'Failed to submit leave application');
        } finally {
            setSubmitting(false);
        }
    };

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const cardStyle = {
        background: '#ffffff', borderRadius: '16px', padding: '24px',
        border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    };

    const inputStyle = {
        width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1',
        borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit',
        color: '#0f172a', background: '#fff'
    };

    const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b' }}>Leave Management</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>View your leave history and apply for new leaves</p>
                </div>
                <button onClick={() => setShowForm(!showForm)} style={{
                    padding: '10px 20px', background: showForm ? '#ef4444' : '#3b82f6', color: 'white',
                    borderRadius: '10px', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(59,130,246,0.2)'
                }}>
                    {showForm ? '✕ Cancel' : '+ Apply for Leave'}
                </button>
            </div>

            {error && <div style={{
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#ef4444', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', marginBottom: '16px'
            }}>❌ {error}</div>}

            {successMsg && <div style={{
                background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
                color: '#10b981', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', marginBottom: '16px'
            }}>✅ {successMsg}</div>}

            {/* Application Form */}
            {showForm && (
                <div style={{ ...cardStyle, marginBottom: '24px', borderColor: '#bfdbfe' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '20px' }}>Leave Application</h3>
                    <form onSubmit={handleApply}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label style={labelStyle}>Date *</label>
                                <input type="date" required value={formData.leave_date} style={inputStyle}
                                    onChange={(e) => setFormData({...formData, leave_date: e.target.value})} />
                            </div>
                            <div>
                                <label style={labelStyle}>Leave Type</label>
                                <select value={formData.leave_type} style={inputStyle}
                                    onChange={(e) => setFormData({...formData, leave_type: e.target.value})}>
                                    <option value="CASUAL">Casual Leave</option>
                                    <option value="SICK">Sick Leave</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Reason *</label>
                            <textarea required rows="3" value={formData.reason} style={{ ...inputStyle, resize: 'vertical' }}
                                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                                placeholder="Please describe your reason for leave..." />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" disabled={submitting} style={{
                                padding: '10px 24px', background: '#3b82f6', color: 'white', borderRadius: '8px',
                                fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                opacity: submitting ? 0.7 : 1
                            }}>
                                {submitting ? 'Submitting...' : 'Submit Application'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '20px' }}>
                {/* Balance Card */}
                <div style={{ ...cardStyle, textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', marginBottom: '12px' }}>
                        Paid Leaves ({monthNames[month - 1]})
                    </div>
                    <div style={{ fontSize: '48px', fontWeight: 800, color: '#3b82f6', lineHeight: 1, margin: '16px 0' }}>
                        {balance ? (balance.paid_leaves_quota - balance.paid_leaves_used) : 1}
                    </div>
                    <p style={{ fontSize: '13px', color: '#94a3b8' }}>Available this month</p>
                </div>

                {/* Leave History */}
                <div style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                        <h3 style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b' }}>Leave History</h3>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ ...inputStyle, width: 'auto' }}>
                                {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                            </select>
                            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...inputStyle, width: '90px' }} />
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
                    ) : leaves.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No leave requests found for this month.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                    {['Date', 'Type', 'Reason', 'Status', 'Paid/Unpaid'].map(h => (
                                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {leaves.map((leave) => (
                                    <tr key={leave.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                        <td style={{ padding: '12px', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{leave.leave_date}</td>
                                        <td style={{ padding: '12px', fontSize: '13px' }}>
                                            <span style={{ background: '#f1f5f9', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, color: '#475569' }}>{leave.leave_type}</span>
                                        </td>
                                        <td style={{ padding: '12px', fontSize: '13px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={leave.reason}>
                                            {leave.reason}
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{
                                                padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                                                background: leave.status === 'APPROVED' ? 'rgba(16,185,129,0.1)' : leave.status === 'REJECTED' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                                color: leave.status === 'APPROVED' ? '#10b981' : leave.status === 'REJECTED' ? '#ef4444' : '#f59e0b'
                                            }}>{leave.status}</span>
                                        </td>
                                        <td style={{ padding: '12px', fontSize: '13px' }}>
                                            {leave.status === 'APPROVED' ? (
                                                leave.is_paid ?
                                                    <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Paid</span> :
                                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>LOP (Unpaid)</span>
                                            ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
