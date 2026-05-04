'use client';

import { useState, useEffect } from 'react';
import { getMyAttendance } from '@/lib/api';

export default function EmployeeAttendancePage() {
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getMyAttendance(year, month);
            setAttendance(data || []);
        } catch (err) {
            setError(err.message || 'Failed to load attendance');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [year, month]);

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const formatTime = (isoString) => {
        if (!isoString) return '--:--';
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getStatusStyle = (status) => {
        switch(status) {
            case 'COMPLETE': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
            case 'MISSING_OUT': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
            case 'AUTO_CHECKOUT': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">My Attendance</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">View your daily punch records</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select 
                            value={month} 
                            onChange={(e) => setMonth(Number(e.target.value))}
                            className="text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                        </select>
                        <input 
                            type="number" 
                            value={year} 
                            onChange={(e) => setYear(Number(e.target.value))}
                            className="w-20 text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 text-red-700 border-b border-red-200">{error}</div>
                )}

                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading attendance data...</div>
                ) : attendance.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="text-4xl mb-4">📅</div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">No Records Found</h3>
                        <p className="text-gray-500 dark:text-gray-400">No attendance data exists for {monthNames[month - 1]} {year}.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Punch In</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Punch Out</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {attendance.map((session) => {
                                    const dateObj = new Date(session.session_date);
                                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                                    
                                    return (
                                        <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{session.session_date}</div>
                                                <div className="text-xs text-gray-500">{dayName}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                                    {formatTime(session.punch_in_time)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                <span className={`font-mono px-2 py-1 rounded ${session.punch_out_time ? 'bg-gray-100 dark:bg-gray-700' : 'text-gray-400'}`}>
                                                    {formatTime(session.punch_out_time)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700 dark:text-gray-300">
                                                {session.net_hours}h
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusStyle(session.status)}`}>
                                                    {session.status.replace('_', ' ')}
                                                </span>
                                                {session.has_override && (
                                                    <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-2 rounded-full font-medium">Overridden</span>
                                                )}
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
