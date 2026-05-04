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
        const month = today.getMonth() + 1; // 1-12

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
    return <div className="text-center py-12">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="text-red-500 p-4 bg-red-50 rounded-md">{error}</div>;
  }

  const currentDate = new Date();
  const currentMonthName = currentDate.toLocaleString('default', { month: 'long' });

  // Quick stats calculations
  const totalDays = attendance.length;
  const presentDays = attendance.filter(a => a.net_hours > 0).length;
  const totalHours = attendance.reduce((sum, a) => sum + (parseFloat(a.net_hours) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Welcome back, {profile?.name || 'Employee'}!
        </h2>
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
          <div><span className="font-medium">Employee ID:</span> {profile?.device_user_id}</div>
          <div><span className="font-medium">Shift:</span> {profile?.shifts?.name || 'Standard'}</div>
          <div><span className="font-medium">Joining Date:</span> {profile?.joining_date}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Leave Balance Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span>📋</span> Leave Balance ({currentMonthName})
          </h3>
          <div className="flex flex-col items-center justify-center p-4">
            <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">
              {leaveBalance?.paid_leaves_quota - leaveBalance?.paid_leaves_used || 0}
            </div>
            <div className="text-sm text-gray-500 mt-1">Paid Leaves Remaining</div>
            <div className="text-xs text-gray-400 mt-2">
              Used: {leaveBalance?.paid_leaves_used || 0} / Quota: {leaveBalance?.paid_leaves_quota || 1}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-center">
            <Link href="/employee/leaves" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm">
              Apply for Leave &rarr;
            </Link>
          </div>
        </div>

        {/* Attendance Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span>🕐</span> Current Month Attendance
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2">
              <span className="text-gray-600 dark:text-gray-400">Days Tracked</span>
              <span className="font-semibold">{totalDays}</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2">
              <span className="text-gray-600 dark:text-gray-400">Days Present</span>
              <span className="font-semibold text-green-600 dark:text-green-400">{presentDays}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Total Hours</span>
              <span className="font-semibold">{totalHours.toFixed(1)}h</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-center">
            <Link href="/employee/attendance" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm">
              View Detailed Attendance &rarr;
            </Link>
          </div>
        </div>

        {/* Payslips Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span>🧾</span> Payslips
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            View your monthly salary breakdowns, deductions, and download official payslips.
          </p>
          <div className="text-center">
            <Link href="/employee/payslips" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Go to My Payslips
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
