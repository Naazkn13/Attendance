'use client';

import { useEffect, useState } from 'react';
import { getMyProfile, getMyLeaveBalance, getMyAttendance } from '@/lib/api';
import Link from 'next/link';

export default function EmployeeDashboard() {
  const [profile, setProfile] = useState(null);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;

        const [profileData, balanceData, attendanceData] = await Promise.all([
          getMyProfile(),
          getMyLeaveBalance(year, month),
          getMyAttendance(year, month)
        ]);

        setProfile(profileData);
        setLeaveBalance(balanceData);
        setAttendance(attendanceData);
      } catch (err) {
        console.error(err);
        setError('Failed to load dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#64748b' }}>
        <div style={{
          width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: '12px'
        }} />
        Loading your dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
        color: '#ef4444', padding: '16px 20px', borderRadius: '12px', fontSize: '14px'
      }}>
        ❌ {error}
      </div>
    );
  }

  const currentDate = new Date();
  const currentMonthName = currentDate.toLocaleString('default', { month: 'long' });
  const totalDays = attendance.length;
  const presentDays = attendance.filter(a => a.net_hours > 0).length;
  const totalHours = attendance.reduce((sum, a) => sum + (parseFloat(a.net_hours) || 0), 0);
  const paidRemaining = (leaveBalance?.paid_leaves_quota || 1) - (leaveBalance?.paid_leaves_used || 0);

  const cardStyle = {
    background: '#ffffff', borderRadius: '16px', padding: '28px',
    border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    transition: 'all 0.2s ease'
  };

  const statRowStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 0', borderBottom: '1px solid #f1f5f9'
  };

  return (
    <div>
      {/* Welcome Header */}
      <div style={{ ...cardStyle, marginBottom: '24px', background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', border: 'none', color: 'white' }}>
        <h2 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '8px' }}>
          Welcome back, {profile?.name || 'Employee'}! 👋
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', fontSize: '14px', opacity: 0.9 }}>
          <div>📌 <strong>ID:</strong> {profile?.device_user_id}</div>
          <div>🕐 <strong>Shift:</strong> {profile?.shifts?.name || 'Standard'} ({profile?.shifts?.shift_hours || 8}h)</div>
          <div>📅 <strong>Joined:</strong> {profile?.joining_date}</div>
        </div>
      </div>

      {/* Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

        {/* Leave Balance Card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <span style={{ fontSize: '22px' }}>📋</span>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Leave Balance ({currentMonthName})</h3>
          </div>
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              fontSize: '52px', fontWeight: 800, color: '#3b82f6',
              lineHeight: 1, marginBottom: '8px'
            }}>
              {paidRemaining}
            </div>
            <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>Paid Leaves Remaining</div>
            <div style={{
              fontSize: '12px', color: '#94a3b8', marginTop: '8px',
              background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', display: 'inline-block'
            }}>
              Used: {leaveBalance?.paid_leaves_used || 0} / Quota: {leaveBalance?.paid_leaves_quota || 1}
            </div>
          </div>
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
            <Link href="/employee/leaves" style={{
              color: '#3b82f6', fontWeight: 600, fontSize: '14px', textDecoration: 'none'
            }}>
              Apply for Leave →
            </Link>
          </div>
        </div>

        {/* Attendance Summary Card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <span style={{ fontSize: '22px' }}>🕐</span>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Attendance ({currentMonthName})</h3>
          </div>
          <div>
            <div style={statRowStyle}>
              <span style={{ color: '#64748b', fontSize: '14px' }}>Days Tracked</span>
              <span style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b' }}>{totalDays}</span>
            </div>
            <div style={statRowStyle}>
              <span style={{ color: '#64748b', fontSize: '14px' }}>Days Present</span>
              <span style={{ fontWeight: 700, fontSize: '16px', color: '#10b981' }}>{presentDays}</span>
            </div>
            <div style={{ ...statRowStyle, borderBottom: 'none' }}>
              <span style={{ color: '#64748b', fontSize: '14px' }}>Total Hours</span>
              <span style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b' }}>{totalHours.toFixed(1)}h</span>
            </div>
          </div>
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
            <Link href="/employee/attendance" style={{
              color: '#3b82f6', fontWeight: 600, fontSize: '14px', textDecoration: 'none'
            }}>
              View Full Attendance →
            </Link>
          </div>
        </div>

        {/* Payslips Card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <span style={{ fontSize: '22px' }}>🧾</span>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Payslips</h3>
          </div>
          <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            View your monthly salary breakdowns, deductions, overtime, and download official payslips.
          </p>
          <div style={{ textAlign: 'center' }}>
            <Link href="/employee/payslips" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '12px 24px', background: '#1e293b', color: 'white',
              borderRadius: '10px', fontWeight: 600, fontSize: '14px', textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(15,23,42,0.15)', transition: 'all 0.2s ease'
            }}>
              📄 Go to My Payslips
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
