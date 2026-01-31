'use client';

import { ReactNode, ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
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
  };

  const isDisabled = disabled || loading;

  return (
    <button
      className={clsx(
        baseClasses,
        sizeClasses[size],
        variantClasses[variant],
        isDisabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      disabled={isDisabled}
      {...props}
    >
      {loading && (
        <div className="w-4 h-4 border border-current border-t-transparent animate-spin" />
      )}
      {!loading && icon && <div className="text-current">{icon}</div>}
      {children}
    </button>
  );
}
