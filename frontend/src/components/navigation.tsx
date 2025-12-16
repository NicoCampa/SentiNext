'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Badge } from './ui/badge';

interface NavigationProps {
  comparisonCount?: number;
}

export function Navigation({ comparisonCount = 0 }: NavigationProps) {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/home',
      label: 'Home',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      href: '/',
      label: 'Dashboard',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      active: pathname === '/',
    },
    {
      href: '/reviews',
      label: 'Review Explorer',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      href: '/compare',
      label: 'Compare',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      badge: comparisonCount > 0 ? comparisonCount : undefined,
    },
  ];

  return (
    <nav className="space-y-2">
      {navItems.map((item) => {
        const isActive = item.active ?? (pathname === item.href || pathname.startsWith(item.href));
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-lg shadow-blue-900/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent hover:border-slate-700/50'
            )}
          >
            <div className={clsx('transition-colors', isActive ? 'text-blue-400' : 'text-slate-400')}>
              {item.icon}
            </div>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <Badge variant="warning" size="sm">
                {item.badge}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}