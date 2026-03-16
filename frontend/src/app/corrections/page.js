'use client';

import { useState, useEffect } from 'react';
import { getOverrides, createOverride, deactivateOverride, getEmployees, getCorrectionLog } from '@/lib/api';

export default function CorrectionsPage() {
    const [overrides, setOverrides] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [log, setLog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showLog, setShowLog] = useState(false);
    const [form, setForm] = useState({
        employee_id: '', session_date: '', override_type: 'SET_PUNCH_OUT',
        override_punch_in: '', override_punch_out: '', override_net_hours: '', reason: '',
    });

    const loadData = async () => {
        try {
            const [ovr, emp] = await Promise.all([
                getOverrides({ is_active: true }),
                getEmployees(true),
            ]);
            setOverrides(ovr || []);
            setEmployees(emp || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const loadLog = async () => {
        const data = await getCorrectionLog();
        setLog(data || []);
        setShowLog(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                employee_id: form.employee_id,
                session_date: form.session_date,
                override_type: form.override_type,
                reason: form.reason,
            };
            if (form.override_punch_in) payload.override_punch_in = new Date(form.override_punch_in).toISOString();
            if (form.override_punch_out) payload.override_punch_out = new Date(form.override_punch_out).toISOString();
            if (form.override_net_hours) payload.override_net_hours = parseFloat(form.override_net_hours);

            await createOverride(payload);
            setShowModal(false);
            loadData();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleDeactivate = async (id) => {
        if (!confirm('Deactivate this override?')) return;
        try {
            await deactivateOverride(id);
            loadData();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    const typeLabels = {
        SET_PUNCH_OUT: '🕐 Set Punch Out',
        SET_PUNCH_IN: '🕐 Set Punch In',
        SET_BOTH: '🕐 Set Both Times',
        MARK_ABSENT: '❌ Mark Absent',
        MARK_PRESENT: '✅ Mark Present',
        OVERRIDE_HOURS: '⏱ Override Hours',
    };

    if (loading) return <div className="loading"><div className="spinner" /> Loading...</div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Admin Corrections</h1>
                    <p>Override attendance sessions that survive recalculation</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={loadLog}>📋 Audit Log</button>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Correction</button>
                </div>
            </div>

            <div className="alert alert-success" style={{ marginBottom: 24 }}>
                💡 Overrides are keyed on <strong>employee + date</strong>, not session ID. They survive recalculation.
            </div>

            {/* Active Overrides */}
            <div className="table-container">
                <div className="table-header">
                    <h2>Active Overrides ({overrides.length})</h2>
                </div>
                {overrides.length > 0 ? (
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Employee</th>
                                <th>Type</th>
                                <th>Override Values</th>
                                <th>Reason</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {overrides.map((o) => {
                                const emp = employees.find(e => e.id === o.employee_id);
                                return (
                                    <tr key={o.id}>
                                        <td style={{ fontWeight: 600 }}>{o.session_date}</td>
                                        <td style={{ color: 'var(--text-primary)' }}>{emp?.name || o.employee_id?.slice(0, 8)}</td>
                                        <td><span className="badge badge-info">{typeLabels[o.override_type] || o.override_type}</span></td>
                                        <td style={{ fontSize: 12, fontFamily: 'monospace' }}>
                                            {o.override_punch_in && `IN: ${new Date(o.override_punch_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                                            {o.override_punch_in && o.override_punch_out && ' | '}
                                            {o.override_punch_out && `OUT: ${new Date(o.override_punch_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                                            {o.override_net_hours && `Hours: ${o.override_net_hours}h`}
                                        </td>
                                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.reason}</td>
                                        <td>{new Date(o.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                                        <td>
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(o.id)}>Revoke</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon">✏️</div>
                        <h3>No active overrides</h3>
                        <p>Create corrections for attendance sessions that need admin adjustment.</p>
                    </div>
                )}
            </div>

            {/* Create Override Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
                    <div className="modal">
                        <h2>New Correction</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Employee *</label>
                                    <select className="form-select" required value={form.employee_id}
                                        onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                                        <option value="">— Select —</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Session Date *</label>
                                    <input type="date" className="form-input" required value={form.session_date}
                                        onChange={(e) => setForm({ ...form, session_date: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Override Type *</label>
                                <select className="form-select" value={form.override_type}
                                    onChange={(e) => setForm({ ...form, override_type: e.target.value })}>
                                    {Object.entries(typeLabels).map(([val, label]) => (
                                        <option key={val} value={val}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            {['SET_PUNCH_IN', 'SET_BOTH'].includes(form.override_type) && (
                                <div className="form-group">
                                    <label>Override Punch In</label>
                                    <input type="datetime-local" className="form-input" value={form.override_punch_in}
                                        onChange={(e) => setForm({ ...form, override_punch_in: e.target.value })} />
                                </div>
                            )}
                            {['SET_PUNCH_OUT', 'SET_BOTH'].includes(form.override_type) && (
                                <div className="form-group">
                                    <label>Override Punch Out</label>
                                    <input type="datetime-local" className="form-input" value={form.override_punch_out}
                                        onChange={(e) => setForm({ ...form, override_punch_out: e.target.value })} />
                                </div>
                            )}
                            {['MARK_PRESENT', 'OVERRIDE_HOURS'].includes(form.override_type) && (
                                <div className="form-group">
                                    <label>Override Net Hours</label>
                                    <input type="number" step="0.01" className="form-input" value={form.override_net_hours}
                                        onChange={(e) => setForm({ ...form, override_net_hours: e.target.value })} />
                                </div>
                            )}
                            <div className="form-group">
                                <label>Reason *</label>
                                <textarea className="form-input" required rows={3} value={form.reason}
                                    placeholder="Admin must explain every correction"
                                    onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create Override</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Audit Log Modal */}
            {showLog && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowLog(false)}>
                    <div className="modal" style={{ maxWidth: 700 }}>
                        <h2>Correction Audit Log</h2>
                        {log.length > 0 ? (
                            <table style={{ fontSize: 13 }}>
                                <thead>
                                    <tr>
                                        <th>Action</th>
                                        <th>Override ID</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {log.map((entry) => (
                                        <tr key={entry.id}>
                                            <td><span className={`badge ${entry.action === 'CREATED' ? 'badge-success' : entry.action === 'DEACTIVATED' ? 'badge-error' : 'badge-warning'}`}>{entry.action}</span></td>
                                            <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.override_id?.slice(0, 8)}</td>
                                            <td>{new Date(entry.created_at).toLocaleString('en-IN')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <p style={{ color: 'var(--text-muted)' }}>No audit entries yet.</p>}
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowLog(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
