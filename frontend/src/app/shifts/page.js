'use client';

import { useState, useEffect } from 'react';
import { getShifts, createShift, updateShift, deleteShift } from '@/lib/api';

export default function ShiftMasterPage() {
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingShift, setEditingShift] = useState(null);
    const [form, setForm] = useState({ name: '', shift_code: '', shift_hours: '' });

    const loadData = async () => {
        try {
            const data = await getShifts();
            setShifts(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const openCreate = () => {
        setEditingShift(null);
        setForm({ name: '', shift_code: '', shift_hours: '' });
        setShowModal(true);
    };

    const openEdit = (shift) => {
        setEditingShift(shift);
        setForm({
            name: shift.name,
            shift_code: shift.shift_code || '',
            shift_hours: shift.shift_hours || '',
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                name: form.name,
                shift_hours: Number.parseFloat(form.shift_hours) || 0,
            };
            if (form.shift_code) payload.shift_code = form.shift_code;
            if (editingShift) {
                await updateShift(editingShift.id, payload);
            } else {
                await createShift(payload);
            }
            setShowModal(false);
            loadData();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this shift? This will fail if employees are still assigned to it.')) return;
        try {
            await deleteShift(id);
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
                    <h1>Shift Master</h1>
                    <p>Define shifts with hours and codes, then assign them to employees</p>
                </div>
                <button className="btn btn-primary" onClick={openCreate}>+ Add Shift</button>
            </div>

            <div className="alert alert-success" style={{ marginBottom: 24 }}>
                💡 <strong>How it works:</strong> Create a shift (e.g., &quot;8 Hour Shift&quot;). Assign the shift code to employees on the Employees page.
                First punch-in starts the shift. Once shift hours are done, overtime begins. Sessions auto-close at midnight.
            </div>

            <div className="table-container">
                <div className="table-header">
                    <h2>All Shifts ({shifts.length})</h2>
                </div>
                {shifts.length > 0 ? (
                    <table>
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Name</th>
                                <th>Shift Hours</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shifts.map((s) => (
                                <tr key={s.id}>
                                    <td>
                                        <code style={{
                                            background: 'var(--accent)', color: '#fff',
                                            padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                        }}>
                                            {s.shift_code || '—'}
                                        </code>
                                    </td>
                                    <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.name}</td>
                                    <td>
                                        <span className="badge badge-info" style={{ fontSize: 14 }}>{s.shift_hours}h</span>
                                    </td>
                                    <td>
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)} style={{ marginRight: 4 }}>Edit</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon">⏰</div>
                        <h3>No shifts defined yet</h3>
                        <p>Create your first shift to get started.</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
                    <div className="modal">
                        <h2>{editingShift ? 'Edit Shift' : 'Add Shift'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="shift-name">Shift Name *</label>
                                    <input id="shift-name" className="form-input" required value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        placeholder="e.g., 8 Hour Shift" />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="shift-code">Shift Code {editingShift ? '' : '(auto if blank)'}</label>
                                    <input id="shift-code" className="form-input" value={form.shift_code}
                                        onChange={(e) => setForm({ ...form, shift_code: e.target.value })}
                                        placeholder="e.g., S-001" />
                                </div>
                            </div>
                            <div className="form-group">
                                <label htmlFor="shift-hours">Shift Hours * (overtime starts after this)</label>
                                <input id="shift-hours" type="number" step="0.5" className="form-input" required value={form.shift_hours}
                                    onChange={(e) => setForm({ ...form, shift_hours: e.target.value })}
                                    placeholder="e.g., 8" />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingShift ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
