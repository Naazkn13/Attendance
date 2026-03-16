'use client';

import { useState, useEffect } from 'react';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, getShifts } from '@/lib/api';

export default function EmployeesPage() {
    const [employees, setEmployees] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [form, setForm] = useState({
        name: '', device_user_id: '', basic_salary: '', shift_id: '',
        overtime_rate_per_hour: '', joining_date: '', exit_date: '', is_active: true,
    });

    const loadData = async () => {
        try {
            const [empData, shiftData] = await Promise.all([getEmployees(), getShifts()]);
            setEmployees(empData || []);
            setShifts(shiftData || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const openCreate = () => {
        setEditingEmployee(null);
        setForm({
            name: '', device_user_id: '', basic_salary: '', shift_id: '',
            overtime_rate_per_hour: '', joining_date: '', exit_date: '', is_active: true
        });
        setShowModal(true);
    };

    const openEdit = (emp) => {
        setEditingEmployee(emp);
        setForm({
            name: emp.name, device_user_id: emp.device_user_id,
            basic_salary: emp.basic_salary, shift_id: emp.shift_id || '',
            overtime_rate_per_hour: emp.overtime_rate_per_hour,
            joining_date: emp.joining_date, exit_date: emp.exit_date || '',
            is_active: emp.is_active,
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...form,
                basic_salary: parseFloat(form.basic_salary) || 0,
                overtime_rate_per_hour: parseFloat(form.overtime_rate_per_hour) || 0,
                shift_id: form.shift_id || null,
                exit_date: form.exit_date || null,
            };
            if (editingEmployee) {
                await updateEmployee(editingEmployee.id, payload);
            } else {
                await createEmployee(payload);
            }
            setShowModal(false);
            loadData();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Deactivate this employee?')) return;
        try {
            await deleteEmployee(id);
            loadData();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    if (loading) return <div className="loading"><div className="spinner" /> Loading...</div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Employees</h1>
                    <p>Manage employee profiles, shifts, and salary configuration</p>
                </div>
                <button className="btn btn-primary" onClick={openCreate}>+ Add Employee</button>
            </div>

            <div className="table-container">
                <div className="table-header">
                    <h2>All Employees ({employees.length})</h2>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Device User ID</th>
                            <th>Shift</th>
                            <th>Basic Salary</th>
                            <th>OT Rate</th>
                            <th>Joining</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map((emp) => (
                            <tr key={emp.id}>
                                <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{emp.name}</td>
                                <td><code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{emp.device_user_id}</code></td>
                                <td>{emp.shift?.name || '—'}</td>
                                <td>₹{Number(emp.basic_salary).toLocaleString('en-IN')}</td>
                                <td>₹{emp.overtime_rate_per_hour}/hr</td>
                                <td>{emp.joining_date}</td>
                                <td><span className={`badge ${emp.is_active ? 'badge-success' : 'badge-error'}`}>{emp.is_active ? 'Active' : 'Inactive'}</span></td>
                                <td>
                                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(emp)} style={{ marginRight: 4 }}>Edit</button>
                                    {emp.is_active && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(emp.id)}>Deactivate</button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
                    <div className="modal">
                        <h2>{editingEmployee ? 'Edit Employee' : 'Add Employee'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Full Name *</label>
                                    <input className="form-input" required value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Device User ID *</label>
                                    <input className="form-input" required value={form.device_user_id}
                                        onChange={(e) => setForm({ ...form, device_user_id: e.target.value })}
                                        placeholder="Must match biometric device" />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Basic Salary (₹)</label>
                                    <input type="number" className="form-input" value={form.basic_salary}
                                        onChange={(e) => setForm({ ...form, basic_salary: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>OT Rate (₹/hr)</label>
                                    <input type="number" className="form-input" value={form.overtime_rate_per_hour}
                                        onChange={(e) => setForm({ ...form, overtime_rate_per_hour: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Shift</label>
                                    <select className="form-select" value={form.shift_id}
                                        onChange={(e) => setForm({ ...form, shift_id: e.target.value })}>
                                        <option value="">— Select Shift —</option>
                                        {shifts.map(s => <option key={s.id} value={s.id}>{s.shift_code ? `[${s.shift_code}] ` : ''}{s.name} ({s.shift_hours}h)</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Joining Date *</label>
                                    <input type="date" className="form-input" required value={form.joining_date}
                                        onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Exit Date (if applicable)</label>
                                <input type="date" className="form-input" value={form.exit_date}
                                    onChange={(e) => setForm({ ...form, exit_date: e.target.value })} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingEmployee ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
