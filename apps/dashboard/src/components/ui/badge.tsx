'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'md', className }: BadgeProps) {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  const variantClasses = {
    default: 'bg-slate-700/80 text-slate-200 border-slate-600/50',
    success: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    warning: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    danger: 'bg-red-500/20 text-red-300 border-red-500/30',
    info: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full border backdrop-blur-sm',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}