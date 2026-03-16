'use client';

import { useState, useEffect } from 'react';
import { getEmployees, previewRecalculation, confirmRecalculation } from '@/lib/api';

export default function RecalculationPage() {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [preview, setPreview] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [form, setForm] = useState({ employee_id: '', period_start: '', period_end: '' });

    useEffect(() => {
        getEmployees(true).then(data => { setEmployees(data || []); setLoading(false); });
    }, []);

    const handlePreview = async (e) => {
        e.preventDefault();
        setProcessing(true);
        try {
            const result = await previewRecalculation(form);
            setPreview(result);
        } catch (err) { alert(`Error: ${err.message}`); }
        finally { setProcessing(false); }
    };

    const handleConfirm = async () => {
        if (!confirm('Are you sure? This will rebuild all sessions and regenerate payroll.')) return;
        setProcessing(true);
        try {
            const result = await confirmRecalculation({
                employee_id: form.employee_id,
                period_start: form.period_start,
                period_end: form.period_end,
            });
            alert(`Recalculation complete! ${result.sessions_rebuilt} sessions rebuilt.`);
            setPreview(null);
        } catch (err) { alert(`Error: ${err.message}`); }
        finally { setProcessing(false); }
    };

    if (loading) return <div className="loading"><div className="spinner" /> Loading...</div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Recalculation</h1>
                    <p>Rebuild sessions from raw punches. Overrides are preserved.</p>
                </div>
            </div>

            <div className="alert alert-success" style={{ marginBottom: 24 }}>
                🔒 Overrides survive recalculation. They are keyed on <strong>employee_id + session_date</strong>, not session row ID.
                Sessions are deleted and rebuilt, then overrides are re-applied automatically.
            </div>

            {/* Form */}
            <div className="table-container" style={{ padding: 24, marginBottom: 24 }}>
                <h3 style={{ marginBottom: 16 }}>Step 1: Select Employee & Period</h3>
                <form onSubmit={handlePreview}>
                    <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                        <div className="form-group">
                            <label>Employee *</label>
                            <select className="form-select" required value={form.employee_id}
                                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                                <option value="">— Select —</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Period Start *</label>
                            <input type="date" className="form-input" required value={form.period_start}
                                onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Period End *</label>
                            <input type="date" className="form-input" required value={form.period_end}
                                onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={processing}>
                        {processing ? '⏳ Loading...' : '🔍 Preview Changes'}
                    </button>
                </form>
            </div>

            {/* Preview Results */}
            {preview && (
                <div className="table-container" style={{ marginBottom: 24 }}>
                    <div className="table-header">
                        <h2>Step 2: Review Changes — {preview.employee_name}</h2>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span className="badge badge-success">
                                ✅ {preview.override_summary?.total_overrides || 0} overrides preserved
                            </span>
                        </div>
                    </div>

                    {preview.changes?.length > 0 ? (
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Punch In</th>
                                    <th>Punch Out</th>
                                    <th>Hours</th>
                                    <th>Status</th>
                                    <th>Override</th>
                                    <th>Changed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.changes.map((ch) => (
                                    <tr key={ch.date} style={ch.changed ? { background: 'rgba(99, 102, 241, 0.05)' } : {}}>
                                        <td style={{ fontWeight: 600 }}>{ch.date}</td>
                                        <td>{ch.old?.in || '—'}</td>
                                        <td>{ch.old?.out || '—'}</td>
                                        <td>{ch.old?.hours || 0}h</td>
                                        <td>
                                            <span className={`badge ${ch.old?.status === 'COMPLETE' ? 'badge-success' : ch.old?.status === 'AUTO_CHECKOUT' ? 'badge-warning' : 'badge-muted'}`}>
                                                {ch.old?.status || 'NO SESSION'}
                                            </span>
                                        </td>
                                        <td>{ch.override_preserved ? <span className="badge badge-info">✅ Preserved</span> : ''}</td>
                                        <td>{ch.changed ? <span className="badge badge-warning">⚠ Changed</span> : <span className="badge badge-muted">No change</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="empty-state">
                            <h3>No session data for this period</h3>
                        </div>
                    )}

                    <div style={{ padding: 20, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <strong>Payroll impact:</strong> Old hours: {preview.payroll_impact?.old_total_hours || 0}h
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-secondary" onClick={() => setPreview(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleConfirm} disabled={processing}>
                                {processing ? '⏳ Processing...' : '✅ Confirm Recalculation'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
