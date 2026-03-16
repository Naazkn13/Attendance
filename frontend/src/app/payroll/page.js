'use client';

import { useState, useEffect } from 'react';
import { getPayrolls, calculatePayroll, calculateAllPayroll, finalizePayroll, getPayroll, getEmployees } from '@/lib/api';

export default function PayrollPage() {
    const [payrolls, setPayrolls] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPayroll, setSelectedPayroll] = useState(null);
    const [showCalcModal, setShowCalcModal] = useState(false);
    const [calcForm, setCalcForm] = useState({ employee_id: '', period_start: '', period_end: '' });

    const loadData = async () => {
        try {
            const [pr, emp] = await Promise.all([getPayrolls(), getEmployees(true)]);
            setPayrolls(pr || []);
            setEmployees(emp || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    const handleCalculate = async (e) => {
        e.preventDefault();
        try {
            await calculatePayroll(calcForm);
            setShowCalcModal(false);
            loadData();
        } catch (err) { alert(`Error: ${err.message}`); }
    };

    const handleCalculateAll = async () => {
        if (!calcForm.period_start || !calcForm.period_end) {
            alert('Set period dates first');
            return;
        }
        try {
            const result = await calculateAllPayroll(calcForm.period_start, calcForm.period_end);
            alert(`Calculated for ${result.count} employees`);
            loadData();
        } catch (err) { alert(`Error: ${err.message}`); }
    };

    const handleFinalize = async (id) => {
        if (!confirm('Finalize this payroll? This marks it as FINAL.')) return;
        try {
            await finalizePayroll(id);
            loadData();
        } catch (err) { alert(`Error: ${err.message}`); }
    };

    const viewDetails = async (id) => {
        try {
            const data = await getPayroll(id);
            setSelectedPayroll(data);
        } catch (err) { alert(`Error: ${err.message}`); }
    };

    if (loading) return <div className="loading"><div className="spinner" /> Loading...</div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Payroll</h1>
                    <p>Calculate, review, and finalize monthly payroll</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCalcModal(true)}>💰 Calculate Payroll</button>
            </div>

            {/* Payroll Records */}
            <div className="table-container">
                <div className="table-header">
                    <h2>Payroll Records ({payrolls.length})</h2>
                </div>
                {payrolls.length > 0 ? (
                    <table>
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Period</th>
                                <th>Present</th>
                                <th>Absent</th>
                                <th>Hours</th>
                                <th>OT Hours</th>
                                <th>Basic</th>
                                <th>Cut</th>
                                <th>OT Pay</th>
                                <th>Final</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payrolls.map((p) => (
                                <tr key={p.id}>
                                    <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.employee_name || p.employee_id?.slice(0, 8)}</td>
                                    <td>{p.period_start} — {p.period_end}</td>
                                    <td style={{ color: 'var(--success)' }}>{p.days_present}</td>
                                    <td style={{ color: p.days_absent > 0 ? 'var(--error)' : 'var(--text-muted)' }}>{p.days_absent}</td>
                                    <td>{p.total_worked_hours}h</td>
                                    <td style={{ color: 'var(--info)' }}>{p.overtime_hours}h</td>
                                    <td>₹{Number(p.basic_salary).toLocaleString('en-IN')}</td>
                                    <td style={{ color: p.salary_cut > 0 ? 'var(--error)' : 'var(--text-muted)' }}>
                                        {p.salary_cut > 0 ? `-₹${Number(p.salary_cut).toLocaleString('en-IN')}` : '—'}
                                    </td>
                                    <td style={{ color: p.overtime_pay > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                                        {p.overtime_pay > 0 ? `+₹${Number(p.overtime_pay).toLocaleString('en-IN')}` : '—'}
                                    </td>
                                    <td style={{ color: 'var(--accent-primary-hover)', fontWeight: 700, fontSize: 15 }}>
                                        ₹{Number(p.final_salary).toLocaleString('en-IN')}
                                    </td>
                                    <td>
                                        <span className={`badge ${p.status === 'FINAL' ? 'badge-success' : p.status === 'DRAFT' ? 'badge-warning' : 'badge-muted'}`}>
                                            {p.status}
                                        </span>
                                    </td>
                                    <td>
                                        <button className="btn btn-secondary btn-sm" onClick={() => viewDetails(p.id)} style={{ marginRight: 4 }}>View</button>
                                        {p.status === 'DRAFT' && (
                                            <button className="btn btn-primary btn-sm" onClick={() => handleFinalize(p.id)}>Finalize</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon">💰</div>
                        <h3>No payroll records</h3>
                        <p>Calculate payroll for a period to get started.</p>
                    </div>
                )}
            </div>

            {/* Calculate Modal */}
            {showCalcModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCalcModal(false)}>
                    <div className="modal">
                        <h2>Calculate Payroll</h2>
                        <form onSubmit={handleCalculate}>
                            <div className="form-group">
                                <label>Employee</label>
                                <select className="form-select" value={calcForm.employee_id}
                                    onChange={(e) => setCalcForm({ ...calcForm, employee_id: e.target.value })}>
                                    <option value="">— Select for individual —</option>
                                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Period Start *</label>
                                    <input type="date" className="form-input" required value={calcForm.period_start}
                                        onChange={(e) => setCalcForm({ ...calcForm, period_start: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Period End *</label>
                                    <input type="date" className="form-input" required value={calcForm.period_end}
                                        onChange={(e) => setCalcForm({ ...calcForm, period_end: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={handleCalculateAll}>
                                    Calculate All Employees
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowCalcModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={!calcForm.employee_id}>
                                    Calculate Selected
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {selectedPayroll && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedPayroll(null)}>
                    <div className="modal" style={{ maxWidth: 700 }}>
                        <h2>Payroll Details — {selectedPayroll.employee_name}</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                            Period: {selectedPayroll.period_start} → {selectedPayroll.period_end}
                        </p>

                        <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 20 }}>
                            <div className="stat-card" style={{ padding: 16 }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>
                                    ₹{Number(selectedPayroll.final_salary).toLocaleString('en-IN')}
                                </div>
                                <div className="stat-card-label">Final Salary</div>
                            </div>
                            <div className="stat-card" style={{ padding: 16 }}>
                                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedPayroll.days_present}/{selectedPayroll.total_working_days}</div>
                                <div className="stat-card-label">Days Present</div>
                            </div>
                            <div className="stat-card" style={{ padding: 16 }}>
                                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedPayroll.total_worked_hours}h</div>
                                <div className="stat-card-label">Total Hours</div>
                            </div>
                        </div>

                        {/* Warnings */}
                        {selectedPayroll.calculation_details?.warnings?.length > 0 && (
                            <div className="alert alert-warning" style={{ marginBottom: 20 }}>
                                ⚠️ {selectedPayroll.calculation_details.warnings.length} warning(s):
                                <ul style={{ margin: '8px 0 0 16px', fontSize: 13 }}>
                                    {selectedPayroll.calculation_details.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                </ul>
                            </div>
                        )}

                        {/* Daily Breakdown Table */}
                        {selectedPayroll.calculation_details?.daily_breakdown && (
                            <div style={{ maxHeight: 350, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, marginBottom: 20 }}>
                                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                                        <tr>
                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>Date</th>
                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>In</th>
                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>Out</th>
                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>Hours</th>
                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>OT/Deficit</th>
                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>Day Pay</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedPayroll.calculation_details.daily_breakdown.map((day, idx) => {
                                            const isSunday = day.is_sunday;
                                            const sessions = day.sessions || [];
                                            const firstSession = sessions[0] || {};
                                            const lastSession = sessions[sessions.length - 1] || {};

                                            const inTime = firstSession.punch_in ? new Date(firstSession.punch_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
                                            const outTime = lastSession.punch_out ? new Date(lastSession.punch_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

                                            return (
                                                <tr key={idx} style={{ backgroundColor: isSunday ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                                                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: 500, color: isSunday ? 'var(--info)' : 'inherit' }}>
                                                        {day.date} {isSunday ? '(Sun)' : ''}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>{isSunday ? '—' : inTime}</td>
                                                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>{isSunday ? '—' : outTime}</td>
                                                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', fontWeight: 600, color: day.total_hours > 0 ? 'var(--success)' : 'inherit' }}>
                                                        {isSunday ? '—' : `${day.total_hours || 0}h`}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', fontSize: 12 }}>
                                                        {day.overtime_hours > 0 ? (
                                                            <span style={{ color: 'var(--info)' }}>+{day.overtime_hours}h OT</span>
                                                        ) : day.deficit_hours > 0 && !isSunday ? (
                                                            <span style={{ color: 'var(--error)' }}>-{day.deficit_hours}h</span>
                                                        ) : '—'}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', fontWeight: 600 }}>
                                                        ₹{Number(day.total_day_pay || 0).toLocaleString('en-IN')}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setSelectedPayroll(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
