'use client';

import { ReactNode, ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'neon';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  glow?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  glow = false,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses = `
    inline-flex items-center justify-center font-medium
    transition-all duration-200
    focus:outline-none
    border
    uppercase tracking-wider
    relative overflow-hidden
  `;

  const sizeClasses = {
    sm: 'px-4 py-1.5 text-xs gap-1.5',
    md: 'px-6 py-2.5 text-xs gap-2',
    lg: 'px-8 py-3 text-sm gap-2',
  };

  const variantClasses = {
    primary: `
      bg-[rgb(0,255,255)]/10
      border-[rgb(0,255,255)]/50
      text-[rgb(0,255,255)]
      hover:bg-[rgb(0,255,255)]/20
      hover:border-[rgb(0,255,255)]
      hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]
    `,
    secondary: `
      bg-[rgb(15,15,35)]
      border-[rgb(0,255,255)]/20
      text-[rgb(200,200,200)]
      hover:border-[rgb(0,255,255)]/40
      hover:text-[rgb(0,255,255)]
    `,
    ghost: `
      bg-transparent
      border-transparent
      text-[rgb(0,255,255)]/70
      hover:text-[rgb(0,255,255)]
      hover:bg-[rgb(0,255,255)]/5
    `,
    danger: `
      bg-[rgb(255,0,128)]/10
      border-[rgb(255,0,128)]/50
      text-[rgb(255,0,128)]
      hover:bg-[rgb(255,0,128)]/20
      hover:border-[rgb(255,0,128)]
      hover:shadow-[0_0_20px_rgba(255,0,128,0.3)]
    `,
    neon: `
      bg-transparent
      border-[rgb(0,255,255)]
      text-[rgb(0,255,255)]
      shadow-[0_0_10px_rgba(0,255,255,0.5),inset_0_0_10px_rgba(0,255,255,0.1)]
      hover:shadow-[0_0_20px_rgba(0,255,255,0.8),inset_0_0_20px_rgba(0,255,255,0.2)]
      hover:bg-[rgb(0,255,255)]/10
    `,
  };

  const isDisabled = disabled || loading;

  return (
    <button
      className={clsx(
        baseClasses,
        sizeClasses[size],
        variantClasses[variant],
        glow && 'neon-pulse',
        isDisabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      disabled={isDisabled}
      {...props}
    >
      {/* Animated border effect */}
      <span className="absolute inset-0 overflow-hidden">
        <span className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[rgb(0,255,255)]/50 to-transparent animate-[shimmer_2s_infinite]" />
      </span>

      {loading && (
        <div className="w-4 h-4 border border-current border-t-transparent animate-spin" />
      )}
      {!loading && icon && <div className="text-current">{icon}</div>}
      <span className="relative z-10">{children}</span>
    </button>
  );
}
