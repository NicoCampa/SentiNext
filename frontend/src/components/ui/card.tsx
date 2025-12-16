'use client';

import { ReactNode, MouseEventHandler } from 'react';
import clsx from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'glass' | 'gradient';
  padding?: 'sm' | 'md' | 'lg';
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function Card({ children, className, variant = 'default', padding = 'md', onClick }: CardProps) {
  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const variantClasses = {
    default: 'bg-slate-900/60 border-slate-700/50',
    glass: 'bg-white/5 border-white/10 backdrop-blur-xl',
    gradient: 'bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-600/30',
  };

  return (
    <div
      className={clsx(
        'rounded-2xl border shadow-xl transition-all duration-300 hover:shadow-2xl',
        variantClasses[variant],
        paddingClasses[padding],
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function MetricCard({ title, value, subtitle, icon, trend, className }: MetricCardProps) {
  const trendColors = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    neutral: 'text-slate-400',
  };

  return (
    <Card variant="glass" className={clsx('group hover:scale-105', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {icon && <div className="text-slate-400">{icon}</div>}
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
              {title}
            </h3>
          </div>
          <div className="mt-2">
            <div className="text-3xl font-bold text-white">{value}</div>
            {subtitle && (
              <p className={clsx('text-sm mt-1', trend ? trendColors[trend] : 'text-slate-400')}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
