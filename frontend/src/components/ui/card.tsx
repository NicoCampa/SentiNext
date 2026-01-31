'use client';

import { ReactNode, MouseEventHandler } from 'react';
import clsx from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'glass' | 'gradient' | 'cyber' | 'neon';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: MouseEventHandler<HTMLDivElement>;
  hover?: boolean;
  corners?: boolean;
}

export function Card({
  children,
  className,
  variant = 'default',
  padding = 'md',
  onClick,
  hover = false,
  corners = false,
}: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const variantClasses = {
    default: `
      bg-[rgb(10,10,25)]/80
      border border-[rgb(0,255,255)]/10
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
    cyber: `
      cyber-card
    `,
    neon: `
      bg-[rgb(5,5,15)]/90
      border border-[rgb(0,255,255)]/40
      shadow-[0_0_15px_rgba(0,255,255,0.15),inset_0_0_15px_rgba(0,255,255,0.05)]
    `,
  };

  const hoverClasses = hover
    ? `
        cursor-pointer
        transition-all duration-300
        hover:border-[rgb(0,255,255)]/50
        hover:shadow-[0_0_30px_rgba(0,255,255,0.15)]
        hover:translate-y-[-2px]
      `
    : '';

  return (
    <div
      className={clsx(
        'relative',
        variantClasses[variant],
        paddingClasses[padding],
        hoverClasses,
        corners && 'corner-accents',
        className
      )}
      onClick={onClick}
    >
      {/* Top glow line */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[rgb(0,255,255)]/30 to-transparent" />

      {/* Bottom glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[rgb(255,0,128)]/20 to-transparent" />

      {/* Content */}
      <div className="relative z-10">{children}</div>
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
  accentColor?: 'cyan' | 'magenta' | 'green' | 'yellow';
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
  accentColor = 'cyan',
}: MetricCardProps) {
  const trendColors = {
    up: 'text-[rgb(0,255,136)] [text-shadow:0_0_10px_rgba(0,255,136,0.5)]',
    down: 'text-[rgb(255,0,128)] [text-shadow:0_0_10px_rgba(255,0,128,0.5)]',
    neutral: 'text-[rgb(150,150,150)]',
  };

  const accentColors = {
    cyan: 'text-[rgb(0,255,255)] [text-shadow:0_0_20px_rgba(0,255,255,0.5)]',
    magenta: 'text-[rgb(255,0,128)] [text-shadow:0_0_20px_rgba(255,0,128,0.5)]',
    green: 'text-[rgb(0,255,136)] [text-shadow:0_0_20px_rgba(0,255,136,0.5)]',
    yellow: 'text-[rgb(255,255,0)] [text-shadow:0_0_20px_rgba(255,255,0,0.5)]',
  };

  const borderAccent = {
    cyan: 'border-l-[rgb(0,255,255)]/50',
    magenta: 'border-l-[rgb(255,0,128)]/50',
    green: 'border-l-[rgb(0,255,136)]/50',
    yellow: 'border-l-[rgb(255,255,0)]/50',
  };

  return (
    <Card
      variant="glass"
      className={clsx(
        'group transition-all duration-300 hover:translate-y-[-4px]',
        'border-l-2',
        borderAccent[accentColor],
        className
      )}
      hover
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Label */}
          <div className="flex items-center gap-2 mb-3">
            {icon && <div className="text-[rgb(0,255,255)]/60">{icon}</div>}
            <span className="hud-label">{title}</span>
          </div>

          {/* Value */}
          <div className={clsx('text-4xl font-bold data-value', accentColors[accentColor])}>
            {value}
          </div>

          {/* Subtitle */}
          {subtitle && (
            <p className={clsx('text-xs mt-2 uppercase tracking-wider', trend ? trendColors[trend] : 'text-[rgb(100,100,120)]')}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Decorative corner */}
      <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-[rgb(0,255,255)]/30" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-[rgb(255,0,128)]/30" />
    </Card>
  );
}

interface StatBlockProps {
  label: string;
  value: string | number;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function StatBlock({ label, value, unit, size = 'md' }: StatBlockProps) {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-5xl',
  };

  return (
    <div className="text-center">
      <div className="hud-label mb-1">{label}</div>
      <div className={clsx('font-bold data-value neon-text', sizeClasses[size])}>
        {value}
        {unit && <span className="text-sm ml-1 opacity-60">{unit}</span>}
      </div>
    </div>
  );
}
