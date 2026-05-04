'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAuthenticated, hasRole, logout } from '@/lib/auth';
import './globals.css';

const navItems = [
  { label: 'Overview', href: '/', icon: '📊', section: 'Dashboard' },
  { label: 'Attendance', href: '/attendance', icon: '🕐', section: 'Dashboard' },
  { label: 'Employees', href: '/employees', icon: '👥', section: 'Management' },
  { label: 'Shift Master', href: '/shifts', icon: '🕐', section: 'Management' },
  { label: 'Holiday Master', href: '/holidays', icon: '🎉', section: 'Management' },
  { label: 'Corrections', href: '/corrections', icon: '✏️', section: 'Management' },
  { label: 'Leave Management', href: '/leaves', icon: '📋', section: 'Management' },
  { label: 'User Management', href: '/users', icon: '🔐', section: 'Management' },
  { label: 'Payroll', href: '/payroll', icon: '💰', section: 'Finance' },
  { label: 'Payslips', href: '/payslips', icon: '🧾', section: 'Finance' },
  { label: 'Recalculation', href: '/recalculation', icon: '🔄', section: 'Finance' },
  { label: 'Devices', href: '/devices', icon: '📡', section: 'System' },
  { label: 'Manual Sync', href: '/sync', icon: '💾', section: 'System' },
];

function Sidebar() {
  const pathname = usePathname();

  const sections = {};
  navItems.forEach(item => {
    if (!sections[item.section]) sections[item.section] = [];
    sections[item.section].push(item);
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">⏱️</div>
          <div>
            <h1>AttendPay</h1>
            <p>Attendance & Payroll</p>
          </div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {Object.entries(sections).map(([section, items]) => (
          <div key={section}>
            <div className="nav-section-label">{section}</div>
            {items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${pathname === item.href ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
        <button
          onClick={() => logout()}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 12px', fontSize: '14px', fontWeight: 500, color: 'var(--error)',
            background: 'var(--error-bg)', border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.2s ease'
          }}
        >
          <span>🚪</span> Logout
        </button>
      </div>
    </aside>
  );
}

export default function RootLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  // IMPORTANT: use strict check — only /employee/ routes (with trailing slash or subpath)
  // are employee portal routes. /employees is an admin route.
  const isEmployeePortalRoute = pathname === '/employee' || pathname?.startsWith('/employee/');
  const isLoginRoute = pathname === '/login' || pathname === '/employee/login';

  useEffect(() => {
    // Allow login pages always
    if (isLoginRoute) {
      setAuthorized(true);
      return;
    }

    // Not authenticated? Redirect to appropriate login
    if (!isAuthenticated()) {
      router.push(isEmployeePortalRoute ? '/employee/login' : '/login');
      return;
    }

    // Employee portal routes: only EMPLOYEE role allowed
    if (isEmployeePortalRoute) {
      if (!hasRole(['EMPLOYEE'])) {
        router.push('/');
        return;
      }
    } else {
      // Admin routes: only ADMIN/SUPERADMIN allowed
      if (!hasRole(['ADMIN', 'SUPERADMIN'])) {
        router.push('/employee/dashboard');
        return;
      }
    }
    setAuthorized(true);
  }, [pathname, isEmployeePortalRoute, isLoginRoute, router]);

  if (!authorized && !isLoginRoute) {
    return (
      <html lang="en">
        <body>
          <div className="loading"><div className="spinner" /> Authenticating...</div>
        </body>
      </html>
    );
  }

  if (isLoginRoute || isEmployeePortalRoute) {
    return (
      <html lang="en">
        <body>
          {children}
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <head>
        <title>AttendPay — Attendance & Payroll System</title>
        <meta name="description" content="Biometric attendance tracking and payroll management system for healthcare" />
      </head>
      <body>
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
