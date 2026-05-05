'use client';

import { useState, useEffect } from 'react';
import { generatePayslips } from '@/lib/api';

// Number to words converter for Indian currency
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

export default function PayslipsPage() {
    const [payslips, setPayslips] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedPayslip, setSelectedPayslip] = useState(null);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    const handleGenerate = async () => {
        setLoading(true); setError(null); setSelectedPayslip(null);
        try {
            const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            const result = await generatePayslips(periodStart, periodEnd);
            setPayslips(result);
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    useEffect(() => { handleGenerate(); }, [month, year]);

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const fmt = (val) => val === undefined || val === null ? '₹0' : `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const handlePrint = (payslip) => { setSelectedPayslip(payslip); setTimeout(() => window.print(), 400); };

    const handleExportExcel = () => {
        if (!payslips || !payslips.payslips || payslips.payslips.length === 0) return;
        
        // Prepare CSV data
        const headers = ['Employee Code', 'Employee Name', 'Basic Salary', 'Days Present', 'Days Absent', 'Overtime Hours', 'Overtime Pay', 'PL Adjusted', 'Deductions', 'Net Pay'];
        
        const rows = payslips.payslips.filter(p => p.status !== 'error').map(p => {
            const basic = p.basic_salary || 0;
            const otPay = p.overtime_pay || 0;
            const pt = p.pt_deduction || 200;
            const salaryCut = p.salary_cut || 0;
            const plAdj = p.pl_adjustment || 0;
            const deductions = pt + salaryCut;
            
            return [
                p.device_user_id || '',
                `"${p.employee_name || ''}"`,
                basic,
                p.days_present || 0,
                p.days_absent || 0,
                p.overtime_hours || 0,
                otPay,
                plAdj,
                deductions,
                p.final_salary || 0
            ].join(',');
        });
        
        const csvContent = [headers.join(','), ...rows].join('\n');
        
        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `payroll_${monthNames[month-1]}_${year}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div>
            <div className="page-header">
                <div><h1>Payslips</h1><p>Generate and print monthly payslips for finalized employees</p></div>
            </div>

            {/* Period Selector */}
            <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Month:</label>
                        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
                            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                            {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Year:</label>
                        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} min={2020} max={2030}
                            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.875rem', width: '100px' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                        <button className="btn btn-secondary" onClick={handleExportExcel} disabled={loading || !payslips?.payslips?.length}>
                            📥 Download Excel
                        </button>
                        <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
                            {loading ? '⏳ Generating...' : '🧾 Generate Payslips'}
                        </button>
                    </div>
                </div>
            </div>

            {error && <div className="alert alert-error">⚠️ {error}</div>}

            {/* Payslip Summary Table */}
            {payslips && payslips.payslips && payslips.payslips.length > 0 && (
                <div className="table-container">
                    <div className="table-header">
                        <h2>Payslips — {monthNames[month - 1]} {year} <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({payslips.count} employees)</span></h2>
                    </div>
                    <table>
                        <thead><tr><th>Employee</th><th>Basic</th><th>Present</th><th>OT Pay</th><th>Deductions</th><th>Net Pay</th><th>Actions</th></tr></thead>
                        <tbody>
                            {payslips.payslips.map((p, idx) => p.status === 'error' ? (
                                <tr key={`${p.employee_id}-err-${idx}`}><td style={{ fontWeight: 600 }}>{p.employee_name}</td><td colSpan={5}><span className="badge badge-error">Error: {p.error}</span></td><td></td></tr>
                            ) : (
                                <tr key={`${p.employee_id}-${idx}`}>
                                    <td style={{ fontWeight: 600 }}>{p.employee_name}</td>
                                    <td>{fmt(p.basic_salary)}</td>
                                    <td><span className="badge badge-success">{p.days_present}</span>{p.days_absent > 0 && <span className="badge badge-error" style={{ marginLeft: 4 }}>{p.days_absent} absent</span>}</td>
                                    <td style={{ color: p.overtime_pay > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{p.overtime_pay > 0 ? fmt(p.overtime_pay) : '—'}</td>
                                    <td style={{ color: 'var(--error)' }}>{fmt((p.pt_deduction || 0) + (p.salary_cut || 0))}</td>
                                    <td style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(p.final_salary)}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                                onClick={() => setSelectedPayslip(selectedPayslip?.employee_id === p.employee_id ? null : p)}>
                                                {selectedPayslip?.employee_id === p.employee_id ? '▲ Hide' : '▼ View'}
                                            </button>
                                            <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                                onClick={() => handlePrint(p)}>🖨️ Print / PDF</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {payslips && payslips.payslips && payslips.payslips.length === 0 && (
                <div className="table-container"><div className="empty-state"><div className="empty-state-icon">🧾</div><h3>No finalized payslips</h3><p>Finalize payroll records first, then come back here.</p></div></div>
            )}

            {/* Detailed Payslip View */}
            {selectedPayslip && selectedPayslip.status === 'success' && (
                <div id="payslip-printable" style={{ marginTop: '1.5rem' }}>
                    <PayslipDetail payslip={selectedPayslip} month={monthNames[month - 1]} year={year} fmt={fmt} />
                </div>
            )}

            {!payslips && !loading && (
                <div className="table-container"><div className="empty-state"><div className="empty-state-icon">🧾</div><h3>No payslips generated</h3><p>Select a month and year above to load finalized payslips.</p></div></div>
            )}

            {/* Print styles */}
            <style jsx global>{`
                @media print {
                    .sidebar, .page-header, .table-container, .btn, .alert, .nav-item,
                    select, input[type="number"], label, .badge, .empty-state { display: none !important; }
                    #payslip-printable { display: block !important; margin: 0 !important; padding: 0 !important; }
                    #payslip-printable * { color: #000 !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    #payslip-printable .accent-bar { background: #0d7377 !important; color: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    body { background: #fff !important; margin: 0 !important; }
                    .app-layout { display: block !important; }
                    .main-content { padding: 0 !important; margin: 0 !important; }
                    @page { margin: 10mm 10mm 10mm 10mm; size: A4; }
                }
            `}</style>
        </div>
    );
}

function PayslipDetail({ payslip, month, year, fmt }) {
    const p = payslip;
    const companyName = getCompanyName(p.employee_name);
    const isShruti = p.employee_name && p.employee_name.toLowerCase().includes('shruti');
    const conveyance = p.calculation_details?.conveyance || 0;

    // Transparent breakdown: show full basic, deduct LOP + short hours separately
    const basicSalary = p.basic_salary || 0;
    const otPay = p.overtime_pay || 0;
    const pt = p.calculation_details?.pt_deduction || p.pt_deduction || 0;
    
    // PL Adjustment
    const plAdjustment = p.calculation_details?.pl_adjustment || p.pl_adjustment || 0;
    const unusedPlDays = p.calculation_details?.unused_pl_days || p.unused_pl_days || 0;
    
    // Use the stored calculation details if available
    const perDaySalary = p.calculation_details?.per_day_salary || p.per_day_salary || 0;
    const perHourRate = p.calculation_details?.per_hour_rate || p.per_hour_rate || 0;
    const totalDaySalary = p.calculation_details?.total_day_salary || p.total_day_salary || 0;

    const lopDeduction = (p.days_absent || 0) * perDaySalary;
    const totalGap = basicSalary - totalDaySalary;
    const shortHoursDeduction = Math.max(0, Math.round((totalGap - lopDeduction) * 100) / 100);

    const totalEarnings = basicSalary + otPay + conveyance + plAdjustment;
    const totalDeductions = lopDeduction + shortHoursDeduction + pt;
    const netPay = p.final_salary || Math.round((totalEarnings - totalDeductions) * 100) / 100;

    const paidLeavesCount = p.calculation_details?.paid_leaves_count || 0;
    const unpaidLeavesCount = p.calculation_details?.unpaid_leaves_count || 0;

    const cellStyle = { padding: '6px 12px', borderBottom: '1px solid #ddd', fontSize: '13px', verticalAlign: 'top' };
    const labelStyle = { ...cellStyle, color: '#555', fontWeight: 500, width: '40%' };
    const valueStyle = { ...cellStyle, fontWeight: 600, color: '#111' };
    const headerBg = { background: '#f0f4f4', fontWeight: 700, padding: '8px 12px', fontSize: '13px', borderBottom: '2px solid #999', color: '#333' };

    return (
        <div style={{ maxWidth: '780px', margin: '0 auto', fontFamily: "'Segoe UI', Arial, sans-serif", color: '#000', background: '#fff', paddingTop: '80px' }}>
            {/* Outer border — pushed down for letterhead */}
            <div style={{ border: '2px solid #333', padding: '0' }}>

                {/* Header with Logo */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '28px 24px', borderBottom: '2px solid #333' }}>
                    <div style={{ width: '120px', height: '90px', marginRight: '24px', flexShrink: 0 }}>
                        <img src="/logo.png" alt="Logo" style={{ width: '120px', height: '90px', objectFit: 'contain' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, letterSpacing: '1px', color: '#111' }}>{companyName}</h1>
                        <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 600, color: '#444', borderTop: '1px solid #999', paddingTop: '6px' }}>
                            Payslip for the Month of {month} {year}
                        </div>
                    </div>
                </div>

                {/* Employee Details Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '2px solid #333' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', borderRight: '1px solid #999' }}>
                        <tbody>
                            <tr><td style={labelStyle}>Employee Code</td><td style={valueStyle}>{p.device_user_id}</td></tr>
                            <tr><td style={labelStyle}>Employee Name</td><td style={valueStyle}>{p.employee_name}</td></tr>
                            <tr><td style={labelStyle}>Employment Type</td><td style={valueStyle}>Permanent</td></tr>
                            <tr><td style={labelStyle}>Shift Hours</td><td style={valueStyle}>{p.shift_hours || 8}h / day</td></tr>
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
                                    <span style={{ color: p.days_absent > 0 ? '#c00' : '#111' }}>{p.days_absent || 0} LOP</span>
                                    {paidLeavesCount > 0 && <span style={{ marginLeft: '8px', background: '#e0f2f1', color: '#00695c', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>{paidLeavesCount} Paid Leave</span>}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Earnings & Deductions - single table for perfect alignment */}
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
                            <td style={cellStyle}>Conveyance{conveyance > 0 ? ` (₹30 × ${p.days_present || 0} days)` : ''}</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, borderRight: '1px solid #999' }}>{fmt(conveyance)}</td>
                            <td style={cellStyle}>Professional Tax (PT)</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>{fmt(pt)}</td>
                        </tr>
                        <tr>
                            <td style={cellStyle}>PL Adjusted ({unusedPlDays} day)</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, borderRight: '1px solid #999' }}>{plAdjustment > 0 ? fmt(plAdjustment) : ''}</td>
                            <td style={{ ...cellStyle, height: '24px' }}></td>
                            <td style={cellStyle}></td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #333' }}>
                            <td style={{ ...cellStyle, fontWeight: 700, fontSize: '13px' }}>Total Earnings (in Rs.)</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 800, fontSize: '14px', borderRight: '1px solid #999' }}>{fmt(totalEarnings)}</td>
                            <td style={{ ...cellStyle, fontWeight: 700, fontSize: '13px' }}>Total Deductions (in Rs.)</td>
                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 800, fontSize: '14px', color: '#c00' }}>{fmt(totalDeductions)}</td>
                        </tr>
                    </tfoot>
                </table>

                {/* Net Pay Row */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', fontSize: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>Net Pay for the Month (Total Earnings - Total Deductions):</span>
                        <span style={{ fontWeight: 800, fontSize: '18px', color: '#0d7377' }}>{fmt(netPay)}</span>
                    </div>
                </div>

                {/* Amount in Words */}
                <div style={{ padding: '10px 16px', borderBottom: '2px solid #333', fontSize: '12px', fontStyle: 'italic', color: '#444' }}>
                    {numberToWords(netPay)}
                </div>

                {/* Signatures */}
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
