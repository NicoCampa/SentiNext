'use client';

import { useRouter } from 'next/navigation';

interface BackButtonProps {
  fallbackPath?: string;
  label?: string;
  className?: string;
}

export function BackButton({ fallbackPath = '/dashboard', label = 'Back', className = '' }: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    // Try to go back in history, fallback to specified path if no history
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackPath);
    }
  };

  return (
    <button
      onClick={handleBack}
      className={`inline-flex items-center gap-2 text-sm text-slate-400 hover:text-sky-400 transition-colors ${className}`}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 19l-7-7m0 0l7-7m-7 7h18"
        />
      </svg>
      {label}
    </button>
  );
}
