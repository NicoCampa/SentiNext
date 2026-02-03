'use client';

import { useState, useRef, useEffect } from 'react';
import type { ReportMonth } from '@/lib/api';

interface MonthSelectorProps {
  months: ReportMonth[];
  selected: ReportMonth | null;
  onChange: (month: ReportMonth) => void;
  loading?: boolean;
}

export function MonthSelector({ months, selected, onChange, loading }: MonthSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (month: ReportMonth) => {
    onChange(month);
    setIsOpen(false);
  };

  const getDisplayText = () => {
    if (loading) return 'Loading...';
    if (!selected) return 'Select a month';
    return `${selected.label} (${selected.review_count} reviews)`;
  };

  if (months.length === 0 && !loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-500">
        No reviews available
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !loading && setIsOpen(!isOpen)}
        disabled={loading}
        className="flex items-center justify-between gap-2 w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 hover:border-white/20 focus:border-sky-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate">{getDisplayText()}</span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && months.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-80 overflow-auto rounded-lg border border-white/10 bg-slate-900 shadow-lg">
          {months.map((month) => {
            const isSelected = selected?.year === month.year && selected?.month === month.month;
            return (
              <button
                key={`${month.year}-${month.month}`}
                type="button"
                onClick={() => handleSelect(month)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-800 ${
                  isSelected ? 'bg-sky-500/10 text-sky-400' : 'text-slate-300'
                }`}
              >
                <span>{month.label}</span>
                <span className="text-xs text-slate-500">{month.review_count} reviews</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
