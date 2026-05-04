'use client';

import { useState, useEffect } from 'react';
import { getMyPayslips } from '@/lib/api';

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

    useEffect(() => { loadPayslips(); }, [year, month]);

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const fmt = (val) => val === undefined || val === null ? '₹0' : `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const handlePrint = (id) => {
        setSelectedPayslipId(id);
        setTimeout(() => window.print(), 400);
    };

    const selectedPayslip = payslips.find(p => p.id === selectedPayslipId);

    const cardStyle = {
        background: '#ffffff', borderRadius: '16px', padding: '24px',
        border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    };

    const inputStyle = {
        padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px',
        fontSize: '14px', fontFamily: 'inherit', color: '#0f172a', background: '#fff',
        width: '100%'
    };

    return (
        <div>
            <div style={{ ...cardStyle, marginBottom: '24px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b', marginBottom: '24px' }}>My Payslips</h2>
                
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Month</label>
                        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={inputStyle}>
                            <option value="">All Months</option>
                            {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Year</label>
                        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} min={2020} max={2030} style={inputStyle} />
                    </div>
                    <div>
                        <button onClick={loadPayslips} disabled={loading} style={{
                            padding: '10px 24px', background: '#3b82f6', color: 'white', borderRadius: '8px',
                            fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            opacity: loading ? 0.7 : 1, height: '42px'
                        }}>
                            {loading ? 'Loading...' : 'Filter'}
                        </button>
                    </div>
                </div>

                {error && <div style={{
                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                    color: '#ef4444', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', marginBottom: '16px'
                }}>❌ {error}</div>}

                {!loading && payslips.length === 0 && (
                    <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748b' }}>
                        No finalized payslips found for the selected period.
                    </div>
                )}

                {!loading && payslips.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8' }}>Period</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8' }}>Net Pay</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8' }}>Status</th>
                                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payslips.map((p) => {
                                    const d = new Date(p.period_start);
                                    const periodName = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
                                    return (
                                        <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                            <td style={{ padding: '16px 12px', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                                                {periodName}
                                            </td>
                                            <td style={{ padding: '16px 12px', fontSize: '15px', fontWeight: 700, color: '#334155' }}>
                                                {fmt(p.final_salary)}
                                            </td>
                                            <td style={{ padding: '16px 12px' }}>
                                                <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                                                    FINAL
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                                                <button onClick={() => setSelectedPayslipId(selectedPayslipId === p.id ? null : p.id)} style={{
                                                    background: 'none', border: 'none', color: '#3b82f6', fontWeight: 600, fontSize: '13px', cursor: 'pointer', marginRight: '16px'
                                                }}>
                                                    {selectedPayslipId === p.id ? 'Hide' : 'View'}
                                                </button>
                                                <button onClick={() => handlePrint(p.id)} style={{
                                                    background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer', padding: '6px 12px', borderRadius: '6px'
                                                }}>
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
                <div id="payslip-printable" style={{ ...cardStyle, padding: '32px' }}>
                    <PayslipDetail payslip={selectedPayslip} fmt={fmt} />
                </div>
            )}

            <style jsx global>{`
                @media print {
                    header, nav, button, select, input, label, div[style*="margin-bottom: 24px"] { display: none !important; }
                    body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
                    #payslip-printable { display: block !important; margin: 0 !important; padding: 0 !important; border: none !important; box-shadow: none !important; }
                    #payslip-printable * { color: #000 !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>
        </div>
    );
}

function PayslipDetail({ payslip, fmt }) {
    const p = payslip;
    const employeeName = 'Employee'; 
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

    const paidLeavesCount = p.calculation_details?.paid_leaves_count || 0;

    const cellStyle = { padding: '8px 14px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', verticalAlign: 'top' };
    const labelStyle = { ...cellStyle, color: '#475569', fontWeight: 500, width: '40%' };
    const valueStyle = { ...cellStyle, fontWeight: 600, color: '#0f172a' };
    const headerBg = { background: '#f8fafc', fontWeight: 700, padding: '10px 14px', fontSize: '13px', borderBottom: '2px solid #cbd5e1', color: '#1e293b' };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', fontFamily: "'Inter', sans-serif", color: '#0f172a' }}>
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '32px', borderBottom: '2px solid #cbd5e1', background: '#f8fafc' }}>
                    <div style={{ width: '100px', height: '100px', marginRight: '24px', flexShrink: 0, background: '#e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>
                        🏥
                    </div>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>{companyName}</h1>
                        <div style={{ marginTop: '8px', fontSize: '15px', fontWeight: 600, color: '#475569' }}>
                            Payslip for the Month of {monthStr}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '2px solid #cbd5e1' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', borderRight: '1px solid #cbd5e1' }}>
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
                                    <span style={{ color: p.days_absent > 0 ? '#ef4444' : '#0f172a' }}>{p.days_absent} LOP</span>
                                    {paidLeavesCount > 0 && <span style={{ marginLeft: '8px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{paidLeavesCount} Paid Leave</span>}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '2px solid #cbd5e1' }}>
                    <thead>
                        <tr>
                            <td style={headerBg}>Earnings</td>
                            <td style={{ ...headerBg, textAlign: 'right', borderRight: '1px solid #cbd5e1' }}>Amount</td>
                            <td style={headerBg}>Deductions</td>
                            <td style={{ ...headerBg, textAlign: 'right' }}>Amount</td>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={cellStyle}>Basic Salary</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>{fmt(basicSalary)}</td>
                            <td style={cellStyle}>LOP / Absent ({p.days_absent || 0} days × {fmt(perDaySalary)})</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: lopDeduction > 0 ? '#ef4444' : '#0f172a' }}>{fmt(lopDeduction)}</td>
                        </tr>
                        <tr>
                            <td style={cellStyle}>Overtime ({(p.overtime_hours || 0).toFixed(1)}h × {fmt(perHourRate)})</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>{fmt(otPay)}</td>
                            <td style={cellStyle}>Short Hours Deduction</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: shortHoursDeduction > 0 ? '#ef4444' : '#0f172a' }}>{fmt(shortHoursDeduction)}</td>
                        </tr>
                        <tr>
                            <td style={cellStyle}>Conveyance{isShruti ? ` (₹30 × ${p.days_present || 0} days)` : ''}</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>{fmt(conveyance)}</td>
                            <td style={cellStyle}>Professional Tax (PT)</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>{fmt(pt)}</td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                            <td style={{ ...cellStyle, fontWeight: 700 }}>Total Earnings</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 800, fontSize: '14px', borderRight: '1px solid #cbd5e1' }}>{fmt(totalEarnings)}</td>
                            <td style={{ ...cellStyle, fontWeight: 700 }}>Total Deductions</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 800, fontSize: '14px', color: '#ef4444' }}>{fmt(totalDeductions)}</td>
                        </tr>
                    </tfoot>
                </table>

                <div style={{ padding: '24px 32px', borderBottom: '1px solid #cbd5e1', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: '16px' }}>Net Pay for the Month:</span>
                        <span style={{ fontWeight: 800, fontSize: '24px', color: '#3b82f6' }}>{fmt(netPay)}</span>
                    </div>
                </div>

                <div style={{ padding: '16px 32px', borderBottom: '2px solid #cbd5e1', fontSize: '13px', fontStyle: 'italic', color: '#64748b', background: '#f8fafc' }}>
                    {numberToWords(netPay)}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '60px 48px 32px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #cbd5e1', width: '200px', marginBottom: '8px' }}></div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Employer Signature</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #cbd5e1', width: '200px', marginBottom: '8px' }}></div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Employee Signature</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
