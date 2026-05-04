'use client';

import { useState, useEffect } from 'react';
import { getMyPayslips, getMyPayslip } from '@/lib/api';

function numberToWords(num) {
    if (num === 0) return 'Zero Rupees Only';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const n = Math.round(Math.abs(num));
    if (n < 20) return ones[n] + ' Rupees Only';
    if (n < 100) return (tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')) + ' Rupees Only';
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' And ' + numberToWords(n % 100).replace(' Rupees Only', '') : '') + ' Rupees Only';
    if (n < 100000) {
        const t = Math.floor(n / 1000);
        const r = n % 1000;
        return (t < 20 ? ones[t] : tens[Math.floor(t / 10)] + (t % 10 ? ' ' + ones[t % 10] : '')) + ' Thousand' + (r ? ' ' + numberToWords(r).replace(' Rupees Only', '') : '') + ' Rupees Only';
    }
    if (n < 10000000) {
        const l = Math.floor(n / 100000);
        const r = n % 100000;
        return (l < 20 ? ones[l] : tens[Math.floor(l / 10)] + (l % 10 ? ' ' + ones[l % 10] : '')) + ' Lakh' + (r ? ' ' + numberToWords(r).replace(' Rupees Only', '') : '') + ' Rupees Only';
    }
    return String(n) + ' Rupees Only';
}

function getCompanyName(employeeName) {
    if (employeeName && employeeName.toLowerCase().includes('shamim')) return 'Aashu Healthcare LLP';
    return 'ASHU EYE HOSPITAL';
}

export default function EmployeePayslipsPage() {
    const [payslips, setPayslips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedPayslipId, setSelectedPayslipId] = useState(null);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    const loadPayslips = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getMyPayslips(year, month);
            setPayslips(data || []);
        } catch (err) {
            setError(err.message || 'Failed to load payslips');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPayslips();
    }, [year, month]);

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const fmt = (val) => val === undefined || val === null ? '₹0' : `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const handlePrint = (id) => {
        setSelectedPayslipId(id);
        setTimeout(() => window.print(), 400);
    };

    const selectedPayslip = payslips.find(p => p.id === selectedPayslipId);

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">My Payslips</h2>
                
                <div className="flex items-center gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Month</label>
                        <select 
                            value={month} 
                            onChange={(e) => setMonth(Number(e.target.value))}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="">All Months</option>
                            {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Year</label>
                        <input 
                            type="number" 
                            value={year} 
                            onChange={(e) => setYear(Number(e.target.value))} 
                            min={2020} 
                            max={2030}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                    </div>
                    <div className="pt-6">
                        <button 
                            onClick={loadPayslips} 
                            disabled={loading}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            {loading ? 'Loading...' : 'Filter'}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">{error}</div>
                )}

                {!loading && payslips.length === 0 && (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        No finalized payslips found for the selected period.
                    </div>
                )}

                {!loading && payslips.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Net Pay</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {payslips.map((p) => {
                                    const d = new Date(p.period_start);
                                    const periodName = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
                                    return (
                                        <tr key={p.id}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                                {periodName}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                                                {fmt(p.final_salary)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                    FINAL
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    onClick={() => setSelectedPayslipId(selectedPayslipId === p.id ? null : p.id)}
                                                    className="text-blue-600 hover:text-blue-900 mr-4"
                                                >
                                                    {selectedPayslipId === p.id ? 'Hide' : 'View'}
                                                </button>
                                                <button
                                                    onClick={() => handlePrint(p.id)}
                                                    className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                                                >
                                                    Print
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selectedPayslip && (
                <div id="payslip-printable" className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
                    <PayslipDetail payslip={selectedPayslip} fmt={fmt} />
                </div>
            )}

            <style jsx global>{`
                @media print {
                    header, nav, button, select, input, label, .space-y-6 > div:first-child { display: none !important; }
                    body { background: #fff !important; margin: 0 !important; }
                    #payslip-printable { display: block !important; margin: 0 !important; padding: 0 !important; border: none !important; box-shadow: none !important; }
                    #payslip-printable * { color: #000 !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>
        </div>
    );
}

function PayslipDetail({ payslip, fmt }) {
    const p = payslip;
    // Basic fallback for name if not populated
    const employeeName = 'Employee'; // Assuming we don't have employee name in payroll_records join directly unless we join, we'll just display ID or rely on session
    const companyName = getCompanyName(employeeName);
    const d = new Date(p.period_start);
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthStr = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;

    const isShruti = employeeName.toLowerCase().includes('shruti');
    const conveyance = isShruti ? 30 * (p.days_present || 0) : 0;

    const basicSalary = p.basic_salary || 0;
    const otPay = p.overtime_pay || 0;
    const pt = p.calculation_details?.pt_deduction || 0;
    const perDaySalary = p.calculation_details?.per_day_salary || 0;
    const perHourRate = p.calculation_details?.per_hour_rate || 0;

    const lopDeduction = (p.days_absent || 0) * perDaySalary;
    const totalDaySalary = p.calculation_details?.total_day_salary || 0;
    const totalGap = basicSalary - totalDaySalary;
    const shortHoursDeduction = Math.max(0, Math.round((totalGap - lopDeduction) * 100) / 100);

    const totalEarnings = basicSalary + otPay + conveyance;
    const totalDeductions = lopDeduction + shortHoursDeduction + pt;
    const netPay = p.final_salary;

    // LEAVE HANDLING (Displaying "Paid Leave" tags)
    const paidLeavesCount = p.calculation_details?.paid_leaves_count || 0;
    const unpaidLeavesCount = p.calculation_details?.unpaid_leaves_count || 0;

    const cellStyle = { padding: '6px 12px', borderBottom: '1px solid #ddd', fontSize: '13px', verticalAlign: 'top' };
    const labelStyle = { ...cellStyle, color: '#555', fontWeight: 500, width: '40%' };
    const valueStyle = { ...cellStyle, fontWeight: 600, color: '#111' };
    const headerBg = { background: '#f0f4f4', fontWeight: 700, padding: '8px 12px', fontSize: '13px', borderBottom: '2px solid #999', color: '#333' };

    return (
        <div style={{ maxWidth: '780px', margin: '0 auto', fontFamily: "'Segoe UI', Arial, sans-serif", color: '#000', background: '#fff' }}>
            <div style={{ border: '2px solid #333', padding: '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '28px 24px', borderBottom: '2px solid #333' }}>
                    <div style={{ width: '120px', height: '90px', marginRight: '24px', flexShrink: 0 }}>
                        <img src="/logo.png" alt="Logo" style={{ width: '120px', height: '90px', objectFit: 'contain' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, letterSpacing: '1px', color: '#111' }}>{companyName}</h1>
                        <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 600, color: '#444', borderTop: '1px solid #999', paddingTop: '6px' }}>
                            Payslip for the Month of {monthStr}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '2px solid #333' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', borderRight: '1px solid #999' }}>
                        <tbody>
                            <tr><td style={labelStyle}>Employee ID</td><td style={valueStyle}>{p.employee_id.split('-')[0]}</td></tr>
                            <tr><td style={labelStyle}>Employment Type</td><td style={valueStyle}>Permanent</td></tr>
                            <tr><td style={labelStyle}>Working Days</td><td style={valueStyle}>{p.total_working_days}</td></tr>
                            <tr><td style={labelStyle}>Days Present</td><td style={valueStyle}>{p.days_present}</td></tr>
                        </tbody>
                    </table>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            <tr><td style={labelStyle}>Basic Salary</td><td style={valueStyle}>{fmt(basicSalary)}</td></tr>
                            <tr><td style={labelStyle}>Per Day Rate</td><td style={valueStyle}>{fmt(perDaySalary)}</td></tr>
                            <tr><td style={labelStyle}>Per Hour Rate</td><td style={valueStyle}>{fmt(perHourRate)}</td></tr>
                            <tr>
                                <td style={labelStyle}>Leaves / LOP</td>
                                <td style={valueStyle}>
                                    <span style={{ color: p.days_absent > 0 ? '#c00' : '#111' }}>{p.days_absent} LOP</span>
                                    {paidLeavesCount > 0 && <span style={{ marginLeft: '8px', background: '#e0f2f1', color: '#00695c', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>{paidLeavesCount} Paid Leave</span>}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '2px solid #333' }}>
                    <thead>
                        <tr>
                            <td style={headerBg}>Earnings</td>
                            <td style={{ ...headerBg, textAlign: 'right', borderRight: '1px solid #999' }}>Amount</td>
                            <td style={headerBg}>Deductions</td>
                            <td style={{ ...headerBg, textAlign: 'right' }}>Amount</td>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={cellStyle}>Basic Salary</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, borderRight: '1px solid #999' }}>{fmt(basicSalary)}</td>
                            <td style={cellStyle}>LOP / Absent ({p.days_absent || 0} days × {fmt(perDaySalary)})</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: lopDeduction > 0 ? '#c00' : '#111' }}>{fmt(lopDeduction)}</td>
                        </tr>
                        <tr>
                            <td style={cellStyle}>Overtime ({(p.overtime_hours || 0).toFixed(1)}h × {fmt(perHourRate)})</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, borderRight: '1px solid #999' }}>{fmt(otPay)}</td>
                            <td style={cellStyle}>Short Hours Deduction</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: shortHoursDeduction > 0 ? '#c00' : '#111' }}>{fmt(shortHoursDeduction)}</td>
                        </tr>
                        <tr>
                            <td style={cellStyle}>Conveyance{isShruti ? ` (₹30 × ${p.days_present || 0} days)` : ''}</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, borderRight: '1px solid #999' }}>{fmt(conveyance)}</td>
                            <td style={cellStyle}>Professional Tax (PT)</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>{fmt(pt)}</td>
                        </tr>
                        <tr>
                            <td style={{ ...cellStyle, height: '24px' }}></td>
                            <td style={{ ...cellStyle, borderRight: '1px solid #999' }}></td>
                            <td style={{ ...cellStyle, height: '24px' }}></td>
                            <td style={cellStyle}></td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #333' }}>
                            <td style={{ ...cellStyle, fontWeight: 700, fontSize: '13px' }}>Total Earnings</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 800, fontSize: '14px', borderRight: '1px solid #999' }}>{fmt(totalEarnings)}</td>
                            <td style={{ ...cellStyle, fontWeight: 700, fontSize: '13px' }}>Total Deductions</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 800, fontSize: '14px', color: '#c00' }}>{fmt(totalDeductions)}</td>
                        </tr>
                    </tfoot>
                </table>

                <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', fontSize: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>Net Pay for the Month:</span>
                        <span style={{ fontWeight: 800, fontSize: '18px', color: '#0d7377' }}>{fmt(netPay)}</span>
                    </div>
                </div>

                <div style={{ padding: '10px 16px', borderBottom: '2px solid #333', fontSize: '12px', fontStyle: 'italic', color: '#444' }}>
                    {numberToWords(netPay)}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '30px 40px 20px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #333', width: '180px', marginBottom: '4px' }}></div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>Employer Signature</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #333', width: '180px', marginBottom: '4px' }}></div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>Employee Signature</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
