'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, hasRole } from '@/lib/auth';

export default function EmployeeLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(username, password);
      if (hasRole(['EMPLOYEE'])) {
        router.push('/employee/dashboard');
      } else {
        setError('Admins must use the main login page.');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container employee">
      <div className="login-bg-decor">
        <div className="circle1" />
        <div className="circle2" />
      </div>

      <div className="login-card">
        <div className="login-header">
          <div className="icon">👨‍⚕️</div>
          <h2>Employee Portal</h2>
          <p>Sign in securely to view your attendance and payslips</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="login-error">
              <span>⚠️</span>
              {error}
            </div>
          )}

          <div className="login-input-group">
            <label htmlFor="username">Employee ID</label>
            <input
              id="username"
              name="username"
              type="text"
              required
              className="login-input"
              placeholder="e.g. 101"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="login-input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="login-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="login-btn"
          >
            {isLoading ? 'Signing In...' : 'Access My Portal'}
          </button>
        </form>

        <div className="login-footer">
          For password resets, contact your system administrator.
        </div>
      </div>
    </div>
  );
}
