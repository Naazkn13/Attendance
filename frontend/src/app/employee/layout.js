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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center gap-2">
                <span className="text-2xl">⏱️</span>
                <span className="font-bold text-xl text-blue-600 dark:text-blue-400">Employee Portal</span>
              </div>
              <nav className="hidden sm:ml-8 sm:flex sm:space-x-8">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                      pathname === item.href
                        ? 'border-blue-500 text-gray-900 dark:text-white'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Hello, <strong>{userName}</strong>
              </div>
              <button
                onClick={() => employeeLogout()}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
        
        {/* Mobile menu */}
        <div className="sm:hidden border-t border-gray-200 dark:border-gray-700">
          <div className="pt-2 pb-3 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${
                  pathname === item.href
                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
