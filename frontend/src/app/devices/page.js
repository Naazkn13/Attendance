'use client';

import { useState, useEffect } from 'react';
import { getDevices, getDeviceHealth, getLocations, updateDevice, createLocation } from '@/lib/api';

export default function DevicesPage() {
    const [devices, setDevices] = useState([]);
    const [locations, setLocations] = useState([]);
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showLocModal, setShowLocModal] = useState(false);
    const [locForm, setLocForm] = useState({ name: '', address: '' });

    const loadData = async () => {
        try {
            const [dev, loc, h] = await Promise.all([getDevices(), getLocations(), getDeviceHealth()]);
            setDevices(dev || []);
            setLocations(loc || []);
            setHealth(h);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); const i = setInterval(loadData, 60000); return () => clearInterval(i); }, []);

    const assignLocation = async (deviceId, locationId) => {
        try {
            await updateDevice(deviceId, { location_id: locationId || null });
            loadData();
        } catch (err) { alert(`Error: ${err.message}`); }
    };

    const handleCreateLocation = async (e) => {
        e.preventDefault();
        try {
            await createLocation(locForm);
            setShowLocModal(false);
            setLocForm({ name: '', address: '' });
            loadData();
        } catch (err) { alert(`Error: ${err.message}`); }
    };

    const isStale = (lastSeen) => {
        if (!lastSeen) return true;
        const diff = Date.now() - new Date(lastSeen).getTime();
        return diff > 60 * 60 * 1000;
    };

    if (loading) return <div className="loading"><div className="spinner" /> Loading...</div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Devices & Locations</h1>
                    <p>Manage biometric devices and clinic locations</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowLocModal(true)}>+ Add Location</button>
            </div>

            {/* Health Summary */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat-card">
                    <div className="stat-card-icon">📡</div>
                    <div className="stat-card-value">{health?.total_devices || 0}</div>
                    <div className="stat-card-label">Total Devices</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon">✅</div>
                    <div className="stat-card-value" style={{ color: 'var(--success)' }}>{health?.healthy || 0}</div>
                    <div className="stat-card-label">Online</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon">🔴</div>
                    <div className="stat-card-value" style={{ color: 'var(--error)' }}>{health?.stale || 0}</div>
                    <div className="stat-card-label">Offline</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon">🔧</div>
                    <div className="stat-card-value" style={{ color: 'var(--warning)' }}>{health?.unassigned || 0}</div>
                    <div className="stat-card-label">Unassigned</div>
                </div>
            </div>

            {/* Locations */}
            <div className="table-container" style={{ marginBottom: 24 }}>
                <div className="table-header">
                    <h2>Locations ({locations.length})</h2>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Address</th>
                            <th>Devices</th>
                        </tr>
                    </thead>
                    <tbody>
                        {locations.map((loc) => (
                            <tr key={loc.id}>
                                <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{loc.name}</td>
                                <td>{loc.address || '—'}</td>
                                <td>{devices.filter(d => d.location_id === loc.id).length}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Devices */}
            <div className="table-container">
                <div className="table-header">
                    <h2>Devices ({devices.length})</h2>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Device Name</th>
                            <th>Serial Number</th>
                            <th>Location</th>
                            <th>Last Seen</th>
                            <th>Assign Location</th>
                        </tr>
                    </thead>
                    <tbody>
                        {devices.map((dev) => (
                            <tr key={dev.id}>
                                <td>
                                    <span style={{
                                        width: 10, height: 10, borderRadius: '50%',
                                        display: 'inline-block',
                                        background: isStale(dev.last_seen_at) ? 'var(--error)' : 'var(--success)',
                                        boxShadow: `0 0 6px ${isStale(dev.last_seen_at) ? 'var(--error)' : 'var(--success)'}`,
                                    }} />
                                </td>
                                <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{dev.device_name}</td>
                                <td><code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{dev.device_sn}</code></td>
                                <td>{dev.location?.name || <span className="badge badge-warning">Unassigned</span>}</td>
                                <td style={{ color: isStale(dev.last_seen_at) ? 'var(--error)' : 'var(--text-secondary)' }}>
                                    {dev.last_seen_at ? new Date(dev.last_seen_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'Never'}
                                </td>
                                <td>
                                    <select
                                        className="form-select"
                                        style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                                        value={dev.location_id || ''}
                                        onChange={(e) => assignLocation(dev.id, e.target.value)}
                                    >
                                        <option value="">— None —</option>
                                        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Location Modal */}
            {showLocModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowLocModal(false)}>
                    <div className="modal">
                        <h2>Add Location</h2>
                        <form onSubmit={handleCreateLocation}>
                            <div className="form-group">
                                <label>Location Name *</label>
                                <input className="form-input" required value={locForm.name}
                                    onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                                    placeholder="e.g., Andheri, Yari Road" />
                            </div>
                            <div className="form-group">
                                <label>Address</label>
                                <textarea className="form-input" rows={2} value={locForm.address}
                                    onChange={(e) => setLocForm({ ...locForm, address: e.target.value })} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowLocModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create Location</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
