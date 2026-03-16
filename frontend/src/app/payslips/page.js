'use client';

import { useState } from 'react';
import { generatePayslips } from '@/lib/api';

export default function PayslipsPage() {
    const [payslips, setPayslips] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedPayslip, setSelectedPayslip] = useState(null);

    // Default to current month
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        setSelectedPayslip(null);
        try {
            const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            const result = await generatePayslips(periodStart, periodEnd);
            setPayslips(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const formatCurrency = (val) => {
        if (val === undefined || val === null) return '₹0.00';
        return `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const handlePrint = (payslip) => {
        setSelectedPayslip(payslip);
        setTimeout(() => window.print(), 300);
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Payslips</h1>
                    <p>Generate and view monthly payslips for all employees</p>
                </div>
            </div>

            {/* Period Selector */}
            <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Month:</label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(Number(e.target.value))}
                            style={{
                                padding: '0.5rem 0.75rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                fontSize: '0.875rem',
                            }}
                        >
                            {monthNames.map((name, i) => (
                                <option key={i} value={i + 1}>{name}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Year:</label>
                        <input
                            type="number"
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            min={2020}
                            max={2030}
                            style={{
                                padding: '0.5rem 0.75rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                fontSize: '0.875rem',
                                width: '100px',
                            }}
                        />
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleGenerate}
                        disabled={loading}
                    >
                        {loading ? '⏳ Generating...' : '🧾 Generate Payslips'}
                    </button>
                </div>
            </div>

            {error && <div className="alert alert-error">⚠️ {error}</div>}

            {/* Payslip Summary Table */}
            {payslips && payslips.payslips && (
                <div className="table-container">
                    <div className="table-header">
                        <h2>
                            Payslips — {monthNames[month - 1]} {year}
                            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                                ({payslips.count} employees)
                            </span>
                        </h2>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Basic Salary</th>
                                <th>Days Present</th>
                                <th>OT Hours</th>
                                <th>OT Pay</th>
                                <th>Short Hours</th>
                                <th>PT</th>
                                <th>Net Pay</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payslips.payslips.map((p) => {
                                if (p.status === 'error') {
                                    return (
                                        <tr key={p.employee_id}>
                                            <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.employee_name}</td>
                                            <td colSpan={7}>
                                                <span className="badge badge-error">Error: {p.error}</span>
                                            </td>
                                            <td></td>
                                        </tr>
                                    );
                                }
                                return (
                                    <tr key={p.employee_id}>
                                        <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.employee_name}</td>
                                        <td>{formatCurrency(p.basic_salary)}</td>
                                        <td>
                                            <span className="badge badge-success">{p.days_present}</span>
                                            {p.days_absent > 0 && (
                                                <span className="badge badge-error" style={{ marginLeft: '4px' }}>
                                                    {p.days_absent} absent
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ color: p.overtime_hours > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                                            {p.overtime_hours > 0 ? `${p.overtime_hours.toFixed(2)}h` : '—'}
                                        </td>
                                        <td style={{ color: p.overtime_pay > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                                            {p.overtime_pay > 0 ? formatCurrency(p.overtime_pay) : '—'}
                                        </td>
                                        <td style={{ color: p.missing_hours > 0 ? 'var(--error)' : 'var(--text-muted)' }}>
                                            {p.missing_hours > 0 ? `${p.missing_hours.toFixed(2)}h` : '—'}
                                        </td>
                                        <td>{formatCurrency(p.pt_deduction)}</td>
                                        <td style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
                                            {formatCurrency(p.final_salary)}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                                    onClick={() => setSelectedPayslip(selectedPayslip?.employee_id === p.employee_id ? null : p)}
                                                >
                                                    {selectedPayslip?.employee_id === p.employee_id ? '▲ Hide' : '▼ View'}
                                                </button>
                                                <button
                                                    className="btn btn-primary"
                                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                                    onClick={() => handlePrint(p)}
                                                >
                                                    🖨️ Print
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Detailed Payslip View */}
            {selectedPayslip && selectedPayslip.status === 'success' && (
                <div id="payslip-printable" style={{ marginTop: '1.5rem' }}>
                    <PayslipDetail payslip={selectedPayslip} month={monthNames[month - 1]} year={year} formatCurrency={formatCurrency} />
                </div>
            )}

            {/* Empty State */}
            {!payslips && !loading && (
                <div className="table-container">
                    <div className="empty-state">
                        <div className="empty-state-icon">🧾</div>
                        <h3>No payslips generated</h3>
                        <p>Select a month and year above, then click &quot;Generate Payslips&quot; to calculate.</p>
                    </div>
                </div>
            )}

            {/* Print styles */}
            <style jsx global>{`
        @media print {
          .sidebar, .page-header, .table-container:not(#payslip-printable),
          .btn, .alert, .nav-item, select, input[type="number"],
          label, .badge { display: none !important; }
          #payslip-printable {
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #payslip-printable * {
            color: #000 !important;
            background: #fff !important;
          }
          body { background: #fff !important; }
          .app-layout { display: block !important; }
          .main-content { padding: 0 !important; margin: 0 !important; }
        }
      `}</style>
        </div>
    );
}

function PayslipDetail({ payslip, month, year, formatCurrency }) {
    const p = payslip;
    const breakdown = p.daily_breakdown || [];

    return (
        <div className="table-container" style={{ padding: '2rem' }}>
            {/* Header */}
            <div style={{
                textAlign: 'center',
                borderBottom: '3px solid var(--accent)',
                paddingBottom: '1rem',
                marginBottom: '1.5rem',
            }}>
                <h2 style={{ color: 'var(--accent)', margin: 0 }}>PAYSLIP</h2>
                <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                    {month} {year}
                </p>
            </div>

            {/* Employee Info */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem 2rem',
                marginBottom: '1.5rem',
                fontSize: '0.875rem',
            }}>
                <div><strong>Employee Name:</strong> {p.employee_name}</div>
                <div><strong>Employee ID:</strong> {p.device_user_id}</div>
                <div><strong>Basic Salary:</strong> {formatCurrency(p.basic_salary)}</div>
                <div><strong>Shift Hours:</strong> {p.shift_hours}h / day</div>
                <div><strong>Per Day Salary:</strong> {formatCurrency(p.per_day_salary)}</div>
                <div><strong>Per Hour Rate:</strong> {formatCurrency(p.per_hour_rate)}</div>
            </div>

            {/* Summary */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1rem',
                marginBottom: '1.5rem',
            }}>
                <div className="stat-card" style={{ padding: '1rem' }}>
                    <div className="stat-card-value" style={{ fontSize: '1.25rem' }}>{p.days_present}</div>
                    <div className="stat-card-label">Days Present</div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                    <div className="stat-card-value" style={{ fontSize: '1.25rem', color: p.days_absent > 0 ? 'var(--error)' : '' }}>
                        {p.days_absent}
                    </div>
                    <div className="stat-card-label">Days Absent</div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                    <div className="stat-card-value" style={{ fontSize: '1.25rem', color: 'var(--accent)' }}>
                        {p.overtime_hours?.toFixed(2)}h
                    </div>
                    <div className="stat-card-label">Overtime</div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                    <div className="stat-card-value" style={{ fontSize: '1.25rem' }}>
                        {p.total_worked_hours?.toFixed(2)}h
                    </div>
                    <div className="stat-card-label">Total Hours</div>
                </div>
            </div>

            {/* Earnings & Deductions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {/* Earnings */}
                <div>
                    <h3 style={{ color: 'var(--success)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>💰 EARNINGS</h3>
                    <table style={{ width: '100%' }}>
                        <tbody>
                            <tr>
                                <td style={{ padding: '0.4rem 0' }}>Total Day Salary</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(p.total_day_salary)}</td>
                            </tr>
                            <tr>
                                <td style={{ padding: '0.4rem 0' }}>Overtime Pay ({p.overtime_hours?.toFixed(2)}h × {formatCurrency(p.per_hour_rate)})</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{formatCurrency(p.overtime_pay)}</td>
                            </tr>
                            <tr style={{ borderTop: '2px solid var(--border)' }}>
                                <td style={{ padding: '0.6rem 0', fontWeight: 700 }}>Gross Earnings</td>
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(p.total_before_pt)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Deductions */}
                <div>
                    <h3 style={{ color: 'var(--error)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>📉 DEDUCTIONS</h3>
                    <table style={{ width: '100%' }}>
                        <tbody>
                            <tr>
                                <td style={{ padding: '0.4rem 0' }}>Professional Tax (PT)</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--error)' }}>- {formatCurrency(p.pt_deduction)}</td>
                            </tr>
                            <tr style={{ borderTop: '2px solid var(--border)' }}>
                                <td style={{ padding: '0.6rem 0', fontWeight: 700 }}>Total Deductions</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--error)' }}>- {formatCurrency(p.pt_deduction)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Net Pay */}
            <div style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                borderRadius: '12px',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
            }}>
                <span style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600 }}>NET PAY</span>
                <span style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 800 }}>{formatCurrency(p.final_salary)}</span>
            </div>

            {/* Daily Breakdown */}
            {breakdown.length > 0 && (
                <details style={{ marginTop: '1rem' }}>
                    <summary style={{
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        marginBottom: '0.5rem',
                        fontSize: '0.9rem',
                    }}>
                        📅 Daily Breakdown ({breakdown.length} days)
                    </summary>
                    <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '0.5rem' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Hours</th>
                                    <th>OT</th>
                                    <th>Deficit</th>
                                    <th>Day Pay</th>
                                    <th>OT Pay</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {breakdown.map((d) => (
                                    <tr key={d.date} style={{
                                        opacity: d.is_sunday ? 0.85 : 1,
                                        background: d.is_sunday ? 'rgba(var(--accent-rgb, 99, 102, 241), 0.05)' : 'transparent',
                                    }}>
                                        <td style={{ fontWeight: 500, fontSize: '0.8rem' }}>
                                            {d.date}
                                            {d.is_sunday && <span style={{ color: 'var(--accent)', marginLeft: '4px', fontSize: '0.7rem' }}>SUN</span>}
                                        </td>
                                        <td>
                                            {d.is_sunday ? (
                                                <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Paid Off</span>
                                            ) : d.total_hours > 0 ? (
                                                <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Present</span>
                                            ) : (
                                                <span className="badge badge-error" style={{ fontSize: '0.65rem' }}>Absent</span>
                                            )}
                                        </td>
                                        <td>{d.total_hours > 0 ? `${Number(d.total_hours).toFixed(2)}h` : '—'}</td>
                                        <td style={{ color: d.overtime_hours > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                                            {d.overtime_hours > 0 ? `${Number(d.overtime_hours).toFixed(2)}h` : '—'}
                                        </td>
                                        <td style={{ color: d.deficit_hours > 0 ? 'var(--error)' : 'var(--text-muted)' }}>
                                            {d.deficit_hours > 0 ? `${Number(d.deficit_hours).toFixed(2)}h` : '—'}
                                        </td>
                                        <td>{d.day_salary !== undefined ? formatCurrency(d.day_salary) : '—'}</td>
                                        <td style={{ color: 'var(--success)' }}>
                                            {d.overtime_pay > 0 ? formatCurrency(d.overtime_pay) : '—'}
                                        </td>
                                        <td style={{ fontWeight: 600 }}>
                                            {d.total_day_pay !== undefined ? formatCurrency(d.total_day_pay) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </details>
            )}

            {/* Warnings */}
            {p.warnings && p.warnings.length > 0 && (
                <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
                    <strong>⚠️ Warnings:</strong>
                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.5rem' }}>
                        {p.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}
