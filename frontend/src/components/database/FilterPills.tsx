'use client';

import { formatTaxonomyLabel } from '@/lib/taxonomyLabels';

interface FilterPill {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
}

interface FilterPillsProps {
  pills: FilterPill[];
}

export function FilterPills({ pills }: FilterPillsProps) {
  if (pills.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/30 p-3">
      <span className="text-xs text-slate-400">Active filters:</span>
      {pills.map((pill) => (
        <button
          key={pill.key}
          type="button"
          onClick={pill.onRemove}
          className="group flex items-center gap-2 rounded-full border border-sky-400/60 bg-sky-500/10 px-3 py-1 text-xs text-sky-200 transition hover:bg-sky-500/20"
        >
          <span className="text-[10px] uppercase tracking-wider text-sky-400/70">{pill.label}</span>
          <span>{pill.value}</span>
          <svg
            className="h-3 w-3 text-sky-400/70 transition group-hover:text-sky-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ))}
    </div>
  );
}
