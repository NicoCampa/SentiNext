'use client';

import clsx from 'clsx';

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  label?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export function Progress({ 
  value, 
  max = 100, 
  className, 
  showLabel = false, 
  label,
  variant = 'default' 
}: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const variantClasses = {
    default: 'from-blue-500 to-indigo-500',
    success: 'from-emerald-500 to-green-500',
    warning: 'from-amber-500 to-orange-500',
    danger: 'from-red-500 to-rose-500',
  };

  return (
    <div className={clsx('w-full', className)}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-slate-300">
            {label || 'Progress'}
          </span>
          <span className="text-sm text-slate-400">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
      <div className="w-full bg-slate-800/60 rounded-full h-2.5 overflow-hidden">
        <div
          className={clsx(
            'h-full bg-gradient-to-r transition-all duration-500 ease-out',
            variantClasses[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}