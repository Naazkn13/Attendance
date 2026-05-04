'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { employeeLogout, getUser } from '@/lib/auth';
import { useEffect, useState } from 'react';

const navItems = [
  { label: 'Dashboard', href: '/employee/dashboard', icon: '📊' },
  { label: 'My Payslips', href: '/employee/payslips', icon: '🧾' },
  { label: 'My Leaves', href: '/employee/leaves', icon: '📋' },
  { label: 'My Attendance', href: '/employee/attendance', icon: '🕐' },
];

export default function EmployeeLayout({ children }) {
  const pathname = usePathname();
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const user = getUser();
    if (user && user.username) {
      setUserName(user.username);
    }
  }, []);

  // Don't show navbar on login page
  if (pathname === '/employee/login') {
    return <>{children}</>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header style={{
        background: '#ffffff', borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 50
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px' }}>
            {/* Logo + Nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px'
                }}>⏱️</div>
                <span style={{ fontWeight: 800, fontSize: '18px', color: '#1e293b' }}>Employee Portal</span>
              </div>
              <nav style={{ display: 'flex', gap: '4px' }}>
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px', borderRadius: '8px',
                        fontSize: '14px', fontWeight: isActive ? 600 : 500,
                        color: isActive ? '#3b82f6' : '#64748b',
                        background: isActive ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                        textDecoration: 'none', transition: 'all 0.2s ease',
                        border: isActive ? '1px solid rgba(59,130,246,0.15)' : '1px solid transparent'
                      }}
                    >
                      <span>{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* User + Logout */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                fontSize: '13px', color: '#64748b', background: '#f1f5f9',
                padding: '6px 12px', borderRadius: '20px', fontWeight: 500
              }}>
                👤 <strong style={{ color: '#1e293b' }}>{userName}</strong>
              </div>
              <button
                onClick={() => employeeLogout()}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', fontSize: '13px', fontWeight: 600,
                  color: '#ef4444', background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease'
                }}
              >
                🚪 Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        {children}
      </main>
    </div>
  );
}
