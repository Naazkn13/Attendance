'use client';

import { useState, useEffect } from 'react';
import { getMyAttendance, getMyProfile } from '@/lib/api';

export default function EmployeeAttendancePage() {
    const [attendance, setAttendance] = useState([]);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [attendanceData, profileData] = await Promise.all([
                getMyAttendance(year, month),
                getMyProfile()
            ]);
            setAttendance(attendanceData || []);
            setProfile(profileData || null);
        } catch (err) {
            setError(err.message || 'Failed to load attendance');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [year, month]);

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const formatTime = (isoString) => {
        if (!isoString) return '--:--';
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getStatusStyle = (status) => {
        switch(status) {
            case 'COMPLETE': return { background: 'rgba(16,185,129,0.1)', color: '#10b981' };
            case 'MISSING_OUT': return { background: 'rgba(239,68,68,0.1)', color: '#ef4444' };
            case 'AUTO_CHECKOUT': return { background: 'rgba(245,158,11,0.1)', color: '#f59e0b' };
            default: return { background: '#f1f5f9', color: '#64748b' };
        }
    };

    const cardStyle = {
        background: '#ffffff', borderRadius: '16px', padding: '24px',
        border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    };

    const inputStyle = {
        padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px',
        fontSize: '14px', fontFamily: 'inherit', color: '#0f172a', background: '#fff'
    };

    const daysInMonth = new Date(year, month, 0).getDate();
    const perDaySalary = profile?.basic_salary ? (profile.basic_salary / daysInMonth).toFixed(2) : '0.00';

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b' }}>My Attendance</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
                        View your daily punch records
                        {profile?.basic_salary && (
                            <span style={{ marginLeft: '12px', padding: '4px 8px', background: '#e0f2fe', color: '#0369a1', borderRadius: '6px', fontWeight: 600 }}>
                                Per Day Rate: ₹{perDaySalary}
                            </span>
                        )}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={inputStyle}>
                        {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                    </select>
                    <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...inputStyle, width: '90px' }} />
                </div>
            </div>

            {error && <div style={{
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#ef4444', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', marginBottom: '16px'
            }}>❌ {error}</div>}

            <div style={cardStyle}>
                {loading ? (
                    <div style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8' }}>
                        Loading attendance data...
                    </div>
                ) : attendance.length === 0 ? (
                    <div style={{ padding: '60px 0', textAlign: 'center' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>No Records Found</h3>
                        <p style={{ color: '#64748b', fontSize: '14px' }}>No attendance data exists for {monthNames[month - 1]} {year}.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                    {['Date', 'Punch In', 'Punch Out', 'Hours', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {attendance.map((session) => {
                                    const dateObj = new Date(session.session_date);
                                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                                    
                                    return (
                                        <tr key={session.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                            <td style={{ padding: '16px 12px' }}>
                                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{session.session_date}</div>
                                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{dayName}</div>
                                            </td>
                                            <td style={{ padding: '16px 12px' }}>
                                                <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', fontSize: '13px', color: '#475569', fontWeight: 500 }}>
                                                    {formatTime(session.punch_in_time)}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px 12px' }}>
                                                <span style={{ fontFamily: 'monospace', background: session.punch_out_time ? '#f1f5f9' : 'transparent', padding: '4px 8px', borderRadius: '6px', fontSize: '13px', color: session.punch_out_time ? '#475569' : '#cbd5e1', fontWeight: 500 }}>
                                                    {formatTime(session.punch_out_time)}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px 12px', fontSize: '15px', fontWeight: 700, color: '#334155' }}>
                                                {session.net_hours}h
                                            </td>
                                            <td style={{ padding: '16px 12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{
                                                        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                                                        ...getStatusStyle(session.status)
                                                    }}>
                                                        {session.status.replace('_', ' ')}
                                                    </span>
                                                    {session.has_override && (
                                                        <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: '#e0e7ff', color: '#4f46e5' }}>
                                                            Overridden
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
