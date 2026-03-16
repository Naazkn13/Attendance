'use client';

import { useState, useEffect } from 'react';
import { getSessions, triggerSessionBuilder, triggerAutoCheckout } from '@/lib/api';

export default function AttendancePage() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        date_from: new Date().toISOString().split('T')[0],
        date_to: new Date().toISOString().split('T')[0],
        status: '',
    });

    const loadSessions = async () => {
        setLoading(true);
        try {
            const data = await getSessions(filters);
            setSessions(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadSessions(); }, []);

    const handleFilter = (e) => {
        e.preventDefault();
        loadSessions();
    };

    const handleTriggerBuilder = async () => {
        try {
            await triggerSessionBuilder();
            alert('Session Builder triggered successfully!');
            loadSessions();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleTriggerCheckout = async () => {
        try {
            await triggerAutoCheckout();
            alert('Auto Checkout triggered successfully!');
            loadSessions();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    const statusBadge = (status) => {
        const map = {
            'COMPLETE': 'badge-success',
            'OPEN': 'badge-info',
            'AUTO_CHECKOUT': 'badge-warning',
            'MISSING_OUT': 'badge-error',
            'REOPENED': 'badge-success',
        };
        return <span className={`badge ${map[status] || 'badge-muted'}`}>{status}</span>;
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Attendance Sessions</h1>
                    <p>View and filter attendance sessions across all employees</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={handleTriggerBuilder}>▶ Run Session Builder</button>
                    <button className="btn btn-secondary btn-sm" onClick={handleTriggerCheckout}>⏰ Run Auto Checkout</button>
                </div>
            </div>

            {/* Filters */}
            <div className="table-container" style={{ marginBottom: 24, padding: 20 }}>
                <form onSubmit={handleFilter} style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ marginBottom: 0, flex: '1 1 150px' }}>
                        <label>From Date</label>
                        <input type="date" className="form-input" value={filters.date_from}
                            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: '1 1 150px' }}>
                        <label>To Date</label>
                        <input type="date" className="form-input" value={filters.date_to}
                            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: '1 1 150px' }}>
                        <label>Status</label>
                        <select className="form-select" value={filters.status}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                            <option value="">All</option>
                            <option value="OPEN">Open</option>
                            <option value="COMPLETE">Complete</option>
                            <option value="AUTO_CHECKOUT">Auto Checkout</option>
                            <option value="MISSING_OUT">Missing Out</option>
                            <option value="REOPENED">Reopened</option>
                        </select>
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm">🔍 Filter</button>
                </form>
            </div>

            {/* Sessions Table */}
            <div className="table-container">
                <div className="table-header">
                    <h2>Sessions ({sessions.length})</h2>
                </div>
                {loading ? (
                    <div className="loading"><div className="spinner" /> Loading...</div>
                ) : sessions.length > 0 ? (
                    <table>
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Date</th>
                                <th>Punch In</th>
                                <th>Punch Out</th>
                                <th>Gross Hours</th>
                                <th>Net Hours</th>
                                <th>Status</th>
                                <th>Override</th>
                                <th>Cross-Loc</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.map((s) => (
                                <tr key={s.id}>
                                    <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.employee_name || s.employee_id?.slice(0, 8)}</td>
                                    <td>{s.session_date}</td>
                                    <td>{s.punch_in_time ? new Date(s.punch_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                    <td>{s.punch_out_time ? new Date(s.punch_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                    <td>{s.gross_hours || '—'}</td>
                                    <td style={{ fontWeight: 600, color: 'var(--success)' }}>{s.net_hours || '—'}</td>
                                    <td>{statusBadge(s.status)}</td>
                                    <td>{s.has_override ? <span className="badge badge-info">✏️</span> : ''}</td>
                                    <td>{s.is_cross_location ? <span className="badge badge-warning">🔀</span> : ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon">📋</div>
                        <h3>No sessions found</h3>
                        <p>Try adjusting your filters.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
