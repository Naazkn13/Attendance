'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './globals.css';

const navItems = [
  { label: 'Overview', href: '/', icon: '📊', section: 'Dashboard' },
  { label: 'Attendance', href: '/attendance', icon: '🕐', section: 'Dashboard' },
  { label: 'Employees', href: '/employees', icon: '👥', section: 'Management' },
  { label: 'Shift Master', href: '/shifts', icon: '🕐', section: 'Management' },
  { label: 'Corrections', href: '/corrections', icon: '✏️', section: 'Management' },
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
    </aside>
  );
}

export default function RootLayout({ children }) {
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
