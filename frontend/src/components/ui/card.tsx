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

export function Card({
  children,
  className,
  variant = 'default',
  padding = 'md',
  onClick,
}: CardProps) {
  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const variantClasses = {
    default: `
      bg-[rgb(10,10,25)]/80
      border border-[rgb(0,255,255)]/20
    `,
    glass: `
      bg-[rgb(15,15,35)]/60
      border border-[rgb(0,255,255)]/20
      backdrop-blur-xl
    `,
    gradient: `
      bg-gradient-to-br from-[rgb(15,15,35)] to-[rgb(5,5,15)]
      border border-[rgb(0,255,255)]/15
    `,
  };

  return (
    <div
      className={clsx(
        'relative transition-all duration-300',
        variantClasses[variant],
        paddingClasses[padding],
        'hover:border-[rgb(0,255,255)]/40',
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

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
}: MetricCardProps) {
  const trendColors = {
    up: 'text-[rgb(0,255,136)]',
    down: 'text-[rgb(255,0,128)]',
    neutral: 'text-[rgb(150,150,150)]',
  };

  return (
    <Card
      variant="glass"
      className={clsx(
        'group transition-all duration-300 hover:translate-y-[-2px]',
        'border-l-2 border-l-[rgb(0,255,255)]/50',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {icon && <div className="text-[rgb(0,255,255)]/60">{icon}</div>}
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[rgb(0,255,255)]/60">
              {title}
            </span>
          </div>
          <div className="text-3xl font-bold text-[rgb(0,255,255)]">
            {value}
          </div>
          {subtitle && (
            <p className={clsx('text-xs mt-1', trend ? trendColors[trend] : 'text-[rgb(100,100,120)]')}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
