'use client';

import { useState, useEffect } from 'react';
import { getMyLeaves, getMyLeaveBalance, applyLeave } from '@/lib/api';

export default function EmployeeLeavesPage() {
    const [leaves, setLeaves] = useState([]);
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    
    // Form state
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        leave_date: '',
        leave_type: 'CASUAL',
        reason: ''
    });
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

    useEffect(() => {
        loadData();
    }, [year, month]);

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
        } catch (err) {
            setError(err.message || 'Failed to submit leave application');
        } finally {
            setSubmitting(false);
        }
    };

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const getStatusBadge = (status) => {
        switch(status) {
            case 'APPROVED': return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Approved</span>;
            case 'REJECTED': return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Rejected</span>;
            default: return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Pending</span>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Leave Management</h2>
                <button 
                    onClick={() => setShowForm(!showForm)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                >
                    {showForm ? 'Cancel' : 'Apply for Leave'}
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-md">{error}</div>
            )}
            
            {successMsg && (
                <div className="bg-green-50 text-green-700 p-4 rounded-md">{successMsg}</div>
            )}

            {showForm && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Leave Application</h3>
                    <form onSubmit={handleApply} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                                <input 
                                    type="date" 
                                    required
                                    value={formData.leave_date}
                                    onChange={(e) => setFormData({...formData, leave_date: e.target.value})}
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Leave Type</label>
                                <select 
                                    value={formData.leave_type}
                                    onChange={(e) => setFormData({...formData, leave_type: e.target.value})}
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                >
                                    <option value="CASUAL">Casual Leave</option>
                                    <option value="SICK">Sick Leave</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
                            <textarea 
                                required
                                rows="3"
                                value={formData.reason}
                                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            ></textarea>
                        </div>
                        <div className="flex justify-end">
                            <button 
                                type="submit" 
                                disabled={submitting}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                {submitting ? 'Submitting...' : 'Submit Application'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-1">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 text-center">
                        <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide mb-2">
                            Paid Leaves ({monthNames[month - 1]})
                        </h3>
                        <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 my-4">
                            {balance ? (balance.paid_leaves_quota - balance.paid_leaves_used) : 1}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Available this month
                        </p>
                    </div>
                </div>

                <div className="md:col-span-3">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h3 className="font-medium text-gray-900 dark:text-white">Leave History</h3>
                            <div className="flex items-center gap-2">
                                <select 
                                    value={month} 
                                    onChange={(e) => setMonth(Number(e.target.value))}
                                    className="text-sm rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600"
                                >
                                    {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                                </select>
                                <input 
                                    type="number" 
                                    value={year} 
                                    onChange={(e) => setYear(Number(e.target.value))}
                                    className="w-20 text-sm rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600"
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-8 text-center text-gray-500">Loading...</div>
                        ) : leaves.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">No leave requests found for this month.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-900">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid/Unpaid</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {leaves.map((leave) => (
                                            <tr key={leave.id}>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                                    {leave.leave_date}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                    {leave.leave_type}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={leave.reason}>
                                                    {leave.reason}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {getStatusBadge(leave.status)}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                    {leave.status === 'APPROVED' ? (
                                                        leave.is_paid ? 
                                                            <span className="text-green-600 font-medium">Paid</span> : 
                                                            <span className="text-red-600 font-medium">Unpaid (LOP)</span>
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
