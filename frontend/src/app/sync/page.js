'use client';

import { useState } from 'react';
import { uploadSyncFile } from '@/lib/api';

export default function ManualSyncPage() {
    const [file, setFile] = useState(null);
    const [deviceSn, setDeviceSn] = useState('MANUAL_USB');
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
            setResult(null);
            setError(null);
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) return;

        setUploading(true);
        setError(null);
        setResult(null);

        try {
            const res = await uploadSyncFile(file, deviceSn);
            setResult(res);
            setFile(null);
            e.target.reset();
        } catch (err) {
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Manual Data Sync (USB Upload)</h1>
                    <p>Upload raw attendance logs (.dat / .txt) directly from your biometric device's USB drive.</p>
                </div>
            </div>

            <div className="table-container" style={{ padding: 24, maxWidth: 600 }}>
                <form onSubmit={handleUpload}>
                    <div className="form-group">
                        <label>Select Log File (.dat or .txt)</label>
                        <input
                            type="file"
                            accept=".dat,.txt,.log"
                            className="form-input"
                            onChange={handleFileChange}
                            required
                        />
                        <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                            Typically named something like <strong>1_attlog.dat</strong> when downloaded via USB.
                        </small>
                    </div>

                    <div className="form-group" style={{ marginTop: 16 }}>
                        <label>Device Name / Serial Number (Optional)</label>
                        <input
                            type="text"
                            className="form-input"
                            value={deviceSn}
                            onChange={(e) => setDeviceSn(e.target.value)}
                            placeholder="e.g. Device 2 (USB)"
                        />
                        <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                            This helps identify which device these punches came from.
                        </small>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ marginTop: 24, width: '100%' }}
                        disabled={!file || uploading}
                    >
                        {uploading ? '⏳ Uploading and Processing...' : '📤 Upload & Sync Punches'}
                    </button>
                </form>

                {error && (
                    <div className="alert alert-error" style={{ marginTop: 24 }}>
                        ❌ <strong>Upload Failed:</strong> {error}
                    </div>
                )}

                {result && (
                    <div className="alert alert-success" style={{ marginTop: 24 }}>
                        ✅ <strong>Sync Complete!</strong>
                        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                            <li>{result.inserted} new punches imported successfully.</li>
                            <li>{result.errors} lines skipped (malformed or empty).</li>
                        </ul>
                        <p style={{ marginTop: 12, fontSize: '0.9em' }}>
                            The Session Builder will process these punches into shifts within the next 30 seconds.
                        </p>
                    </div>
                )}
            </div>

            <div className="table-container" style={{ padding: 24, marginTop: 24 }}>
                <h3 style={{ marginBottom: 16, borderBottom: '1px solid var(--border-color)', paddingBottom: 8 }}>
                    💡 How to Download Data via USB
                </h3>
                <ol style={{ paddingLeft: 20, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                    <li>Insert an empty USB Pen Drive into the biometric device.</li>
                    <li>Press <strong>M/OK</strong> (Menu) on the device.</li>
                    <li>Go to <strong>Data Mgt.</strong> (Data Management).</li>
                    <li>Select <strong>Download Attendance Data</strong>.</li>
                    <li>Wait for it to say "Download Successful".</li>
                    <li>Remove the USB and plug it into your computer.</li>
                    <li>Select the file (usually named <code>1_attlog.dat</code> or similar) and upload it above.</li>
                </ol>
            </div>
        </div>
    );
}
