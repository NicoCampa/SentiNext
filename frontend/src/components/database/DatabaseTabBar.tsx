'use client';

export type DatabaseTab = 'overview' | 'reviews' | 'actions';

interface DatabaseTabBarProps {
  activeTab: DatabaseTab;
  onTabChange: (tab: DatabaseTab) => void;
}

const TABS: { key: DatabaseTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'actions', label: 'Actions' },
];

export function DatabaseTabBar({ activeTab, onTabChange }: DatabaseTabBarProps) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/10 pb-px">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={`whitespace-nowrap px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${
            activeTab === tab.key
              ? 'border-b-2 border-cyan-400 text-cyan-300'
              : 'border-b-2 border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
